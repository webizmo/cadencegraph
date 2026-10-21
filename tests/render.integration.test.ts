import { afterAll, describe, expect, test } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { chromium } from "playwright";
import { createServer } from "vite";
import { renderProject } from "../scripts/render";
import { synthesizeScore } from "../scripts/generate-audio";
import { demoProject } from "../examples/demo.ts";

const work = await mkdtemp(join(tmpdir(), "cadencegraph-render-test-"));
const name = `test-audio-${randomUUID()}.wav`,
  assetPath = join("public", "assets", name);
afterAll(async () => {
  await rm(work, { recursive: true, force: true });
  await rm(assetPath, { force: true });
});
describe("real export contract", () => {
  test("encodes exact dimensions and duration and mixes a sentence-linked local recording", async () => {
    await writeFile(assetPath, synthesizeScore(1.8));
    const project = structuredClone(demoProject);
    project.scenes = project.scenes.slice(0, 1);
    const scene = project.scenes[0];
    scene.nodes = scene.nodes.filter((n) => n.id === "intro-headline");
    scene.sentences[0].duration = { en: 1.25, tr: 1.25 };
    scene.sentences[0].audioAssetId = {
      en: "test-recording",
      tr: "test-recording",
    };
    project.assets = [
      { id: "test-recording", type: "audio", src: `assets/${name}` },
    ];
    const report = await renderProject(
      project,
      "en",
      "16:9",
      join(work, "audio-check.mp4"),
      { width: 320, score: false },
    );
    expect(report).toMatchObject({
      width: 320,
      height: 180,
      fps: 24,
      frames: 30,
      duration: 1.25,
      audio: { score: false, sentenceTracks: 1 },
    });
    expect(report.inspections.flatMap((i) => i.issues)).toEqual([]);
    expect(
      (report.ffprobe as { streams: { codec_type: string }[] }).streams.some(
        (s) => s.codec_type === "audio",
      ),
    ).toBe(true);
    expect(
      (report.ffprobe as { format: { filename: string } }).format.filename,
    ).toBe("audio-check.mp4");
  }, 30000);
  test("rejects remote media before any browser request", async () => {
    const project = structuredClone(demoProject);
    project.assets[0].src = "http://127.0.0.1:1/private-media.svg";
    await expect(
      renderProject(project, "en", "16:9", join(work, "remote.mp4")),
    ).rejects.toThrow("local project assets only");
  });
  test("rejects an unknown requested font instead of accepting browser fallback", async () => {
    const project = structuredClone(demoProject);
    project.brand.fontFamily = "Unregistered CadenceGraph Font";
    await expect(
      renderProject(project, "en", "16:9", join(work, "font.mp4"), {
        width: 320,
      }),
    ).rejects.toThrow("not registered and loaded");
  });

  test("a backwards seek reproduces the exact browser pixels", async () => {
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
      await page.goto(`http://127.0.0.1:${address.port}/?render=1`, {
        waitUntil: "networkidle",
      });
      await page.waitForFunction(() => !!window.__CADENCE_RENDER__);
      await page.evaluate(
        async (project) =>
          window.__CADENCE_RENDER__!.setProject(project, "en", "16:9"),
        demoProject,
      );
      await page.evaluate(async () => window.__CADENCE_RENDER__!.seek(2));
      const first = await page.screenshot();
      await page.evaluate(async () => window.__CADENCE_RENDER__!.seek(10));
      await page.evaluate(async () => window.__CADENCE_RENDER__!.seek(2));
      expect((await page.screenshot()).equals(first)).toBe(true);
    } finally {
      await browser.close();
      await server.close();
    }
  });
});
