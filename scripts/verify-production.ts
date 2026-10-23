import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { createServer } from "node:net";
import { mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import { chromium } from "playwright";
import { createBlankProject, createNode } from "../src/core";

await rm("outputs/production/production-verification.json", { force: true });
await readFile("dist/index.html");
const listener = createServer();
await new Promise<void>((r) => listener.listen(0, "127.0.0.1", r));
const address = listener.address();
assert(address && typeof address !== "string");
const port = address.port;
await new Promise<void>((r) => listener.close(() => r()));
const base = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, ["--import", "tsx", "server/index.ts"], {
  env: { ...process.env, NODE_ENV: "production", PORT: String(port) },
  stdio: ["ignore", "pipe", "pipe"],
});
let log = "";
child.stdout.on("data", (b) => {
  log += b.toString();
});
child.stderr.on("data", (b) => {
  log += b.toString();
});
const closed = new Promise<void>((r) => child.once("exit", () => r()));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors: string[] = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
await mkdir("outputs/production", { recursive: true });
try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null)
      throw new Error(`Production server exited: ${log}`);
    try {
      ready = (await fetch(base)).ok;
    } catch {
      /* Server starting. */
    }
    if (ready) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  assert(ready, `Production server failed to start: ${log}`);
  const status = await (await fetch(`${base}/api/status`)).json();
  assert.equal(status.renderer.available, true);
  // This upload happens AFTER the production build: it must be served from public/uploads.
  const media = await fetch(`${base}/api/media`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "garden.png",
      mime: "image/png",
      data: (await readFile("public/assets/demo/garden-original.png")).toString(
        "base64",
      ),
    }),
  });
  assert.equal(media.status, 201);
  const { asset } = await media.json();
  assert.equal((await fetch(`${base}/${asset.src}`)).status, 200);
  const project = createBlankProject("release-check", "Release check");
  project.scenes[0].sentences[0].duration = { en: 1.25, tr: 1.25 };
  project.assets.push(asset);
  const title = createNode(
    "text",
    "release-title",
    project.scenes[0].sentences[0].id,
    project.locales,
  );
  title.content = { en: "Ready to create.", tr: "Üretmeye hazır." };
  title.layout = { x: 10, y: 12, width: 80, height: 25 };
  const image = createNode(
    "media",
    "release-image",
    project.scenes[0].sentences[0].id,
    project.locales,
    asset.id,
  );
  image.layout = { x: 25, y: 45, width: 50, height: 48 };
  project.scenes[0].nodes.push(title, image);
  await page.goto(base);
  assert.equal(await page.title(), "CadenceGraph — Motion, with meaning.");
  await page.locator('input[type="file"][accept*=".json"]').setInputFiles({
    name: "release.cadence.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(project)),
  });
  await page.getByLabel("Layer text").waitFor();
  assert.equal(
    await page.getByLabel("Layer text").inputValue(),
    "Ready to create.",
  );
  await page.reload();
  assert.equal(
    await page.getByLabel("Layer text").inputValue(),
    "Ready to create.",
  );
  assert.equal(await page.locator("vite-error-overlay").count(), 0);
  await page.getByLabel("Preview position").fill("0.75");
  await page.screenshot({ path: "outputs/production/studio-desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.screenshot({ path: "outputs/production/studio-mobile.png" });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: "Export film", exact: true }).click();
  const link = page.getByRole("link", {
    name: "Download EN 16:9 MP4",
    exact: true,
  });
  await link.waitFor({ timeout: 120000 });
  const download = page.waitForEvent("download");
  await link.click();
  const path = "outputs/production/production-export.mp4";
  await (await download).saveAs(path);
  const href = await link.getAttribute("href");
  assert(href);
  const reportResponse = await fetch(
    `${base}${href.replace(/\.mp4$/, ".report.json")}`,
  );
  assert(reportResponse.ok);
  const report = await reportResponse.json();
  assert.equal(
    report.inspections.flatMap((i: { issues: unknown[] }) => i.issues).length,
    0,
  );
  assert.equal(report.frames, 38);
  assert.equal(report.width, 1280);
  assert.equal(report.height, 720);
  const poster = await fetch(`${base}${href.replace(/\.mp4$/, ".poster.png")}`);
  assert.equal(poster.status, 200);
  await writeFile(
    "outputs/production/production-export.poster.png",
    Buffer.from(await poster.arrayBuffer()),
  );
  await writeFile(
    "outputs/production/production-export.report.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  execFileSync(
    "ffmpeg",
    ["-v", "error", "-xerror", "-i", path, "-f", "null", "-"],
    { stdio: "pipe" },
  );
  assert.deepEqual(errors, []);
  const bytes = await readFile(path);
  await writeFile(
    "outputs/production/production-verification.json",
    JSON.stringify(
      {
        version: JSON.parse(await readFile("package.json", "utf8")).version,
        verifiedAt: new Date().toISOString(),
        sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], {
          encoding: "utf8",
        }).trim(),
        sourceClean:
          execFileSync(
            "git",
            ["status", "--porcelain", "--untracked-files=normal"],
            { encoding: "utf8" },
          ).trim() === "",
        node: process.versions.node,
        platform: process.platform,
        mode: "production",
        renderer: status.renderer,
        viewports: [
          { width: 1440, height: 1000 },
          { width: 390, height: 844 },
        ],
        checks: {
          pageIdentity: true,
          projectImportedAndReloaded: true,
          postBuildUploadServed: true,
          noFrameworkOverlay: true,
          noRuntimeErrors: true,
          mobileNoOverflow: true,
          realUiApiDownload: true,
          shortFilmPoster: true,
          fullDecode: true,
        },
        output: {
          file: "production-export.mp4",
          bytes: bytes.length,
          sha256: createHash("sha256").update(bytes).digest("hex"),
          width: report.width,
          height: report.height,
          duration: report.duration,
          frames: report.frames,
        },
        provider: "Not invoked; historical live-provider evidence is separate.",
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    "Production passed: fresh upload, project import/reload, desktop/mobile, real UI → API → MP4 download, short poster, full decode.",
  );
} finally {
  await browser.close();
  child.kill("SIGTERM");
  await closed;
}
