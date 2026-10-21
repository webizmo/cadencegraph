import { describe, expect, test } from "vitest";
import { chromium } from "playwright";
import { createServer } from "vite";
import { createBlankProject, createNode, createScene } from "../src/core";

describe("late-mounted video seeking", () => {
  test("first seek past a short source waits for metadata and holds the correct frame through reverse seeks", async () => {
    const project = createBlankProject("late-video-project");
    const scene = createScene(
      "blank",
      "later-video-scene",
      project.locales,
      project.ratios,
    );
    scene.sentences[0].duration = { en: 5, tr: 5 };
    project.assets = [
      {
        id: "garden-clip",
        type: "video",
        src: "assets/demo/garden-motion.mp4",
      },
    ];
    scene.nodes = [
      createNode(
        "media",
        "late-video-layer",
        scene.sentences[0].id,
        project.locales,
        "garden-clip",
      ),
    ];
    project.scenes.push(scene);
    const sceneStart = project.scenes[0].sentences[0].duration.en;
    const server = await createServer({
      server: { host: "127.0.0.1", port: 0 },
      logLevel: "error",
    });
    await server.listen();
    const address = server.httpServer!.address();
    if (!address || typeof address === "string")
      throw new Error("Missing test server address.");
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage({
        viewport: { width: 640, height: 360 },
      });
      const pageErrors: string[] = [];
      page.on("pageerror", (error) => pageErrors.push(error.message));
      // Keep metadata unavailable when the seek begins, even on a fast local machine.
      await page.route("**/assets/demo/garden-motion.mp4", async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 100));
        await route.continue();
      });
      await page.goto(`http://127.0.0.1:${address.port}/?render=1`, {
        waitUntil: "networkidle",
      });
      await page.waitForFunction(() => !!window.__CADENCE_RENDER__);
      await page.evaluate(
        async (next) =>
          window.__CADENCE_RENDER__!.setProject(next, "en", "16:9"),
        project,
      );
      expect(await page.locator("video").count()).toBe(0);

      // The three-second source is first mounted four seconds into its five-second slot.
      await page.evaluate(
        async (time) => window.__CADENCE_RENDER__!.seek(time),
        sceneStart + 4,
      );
      const heldFrame = await page.screenshot();
      const firstState = await page.locator("video").evaluate((element) => {
        const video = element as HTMLVideoElement;
        return {
          time: video.currentTime,
          duration: video.duration,
          seeking: video.seeking,
          ready: video.readyState,
        };
      });
      expect(firstState.duration).toBeCloseTo(3, 1);
      expect(firstState.time).toBeCloseTo(firstState.duration - 0.01, 2);
      expect(firstState.seeking).toBe(false);
      expect(firstState.ready).toBeGreaterThanOrEqual(2);
      expect(
        await page.evaluate(() => window.__CADENCE_RENDER__!.inspect()),
      ).toMatchObject({ sceneId: scene.id, issues: [] });

      await page.evaluate(
        async (time) => window.__CADENCE_RENDER__!.seek(time),
        sceneStart + 1,
      );
      expect((await page.screenshot()).equals(heldFrame)).toBe(false);
      await page.evaluate(
        async (time) => window.__CADENCE_RENDER__!.seek(time),
        sceneStart + 4,
      );
      expect((await page.screenshot()).equals(heldFrame)).toBe(true);

      // Returning from another scene creates a new media element and must settle again.
      await page.evaluate(async () => window.__CADENCE_RENDER__!.seek(1));
      expect(await page.locator("video").count()).toBe(0);
      await page.evaluate(
        async (time) => window.__CADENCE_RENDER__!.seek(time),
        sceneStart + 4,
      );
      expect((await page.screenshot()).equals(heldFrame)).toBe(true);
      expect(
        await page.evaluate(() => window.__CADENCE_RENDER__!.inspect().issues),
      ).toEqual([]);
      expect(pageErrors).toEqual([]);
    } finally {
      await browser.close();
      await server.close();
    }
  }, 30000);
});
