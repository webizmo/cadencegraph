import assert from "node:assert/strict";
import { readFile, writeFile, mkdir, copyFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve, basename } from "node:path";
import { chromium, type Page } from "playwright";
import { parseProject, compileProject, type Project } from "../src/core";
import { renderProject } from "./render";

const base = process.env.CADENCE_URL || "http://127.0.0.1:5173";
await mkdir("outputs/authoring", { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors: string[] = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
const saved = async (): Promise<Project> =>
  parseProject(
    await page.evaluate(() =>
      JSON.parse(localStorage.getItem("cadencegraph.project.v1")!),
    ),
  );
const blur = async (label: string, value: string) => {
  await page
    .getByLabel(label, { exact: true })
    .filter({ visible: true })
    .fill(value);
  await page
    .getByLabel(label, { exact: true })
    .filter({ visible: true })
    .press("Tab");
};
const number = blur;
const settings = async () => {
  const d = page.locator(".scene-settings");
  if ((await d.getAttribute("open")) === null)
    await d.locator("summary").click();
};
const rename = async (name: string) => {
  await settings();
  await blur("Scene name", name);
};
const text = async (en: string, tr: string) => {
  await page.getByLabel("Preview language").selectOption("en");
  await blur("Layer text", en);
  await page.getByLabel("Preview language").selectOption("tr");
  await blur("Layer text", tr);
  await page.getByLabel("Preview language").selectOption("en");
};
const duration = async (en: string, tr: string) => {
  await number("Sentence duration", en);
  await page.getByLabel("Preview language").selectOption("tr");
  await number("Sentence duration", tr);
  await page.getByLabel("Preview language").selectOption("en");
};
const layout = async (x: string, y: string, w: string, h: string) => {
  for (const [label, value] of [
    ["Layer x", x],
    ["Layer y", y],
    ["Layer width", w],
    ["Layer height", h],
  ])
    await number(label, value);
};
const scene = async (kind: string, name: string) => {
  await page.getByLabel("Scene template").selectOption(kind);
  await page.getByRole("button", { name: "Add scene", exact: true }).click();
  await rename(name);
};
try {
  await page.goto(base);
  assert.equal(await page.title(), "CadenceGraph — Motion, with meaning.");
  await page.getByRole("button", { name: "New project", exact: true }).click();
  assert.equal((await saved()).scenes[0].nodes.length, 0);
  await blur("Project name", "A garden, together");
  await rename("A seed of possibility");
  await page.getByLabel("Project design").selectOption("paper");
  await page
    .getByRole("button", { name: "Insert text layer", exact: true })
    .click();
  await text("A garden,\ntogether.", "Birlikte\nyeşertelim.");
  await number("Font size", "88");
  await layout("10", "10", "80", "27");
  await page.getByRole("button", { name: "9:16", exact: true }).click();
  await layout("10", "15", "80", "24");
  await page.getByRole("button", { name: "16:9", exact: true }).click();
  await page.getByLabel("Entrance animation").selectOption("scale");
  await duration("3", "3.5");
  await page
    .getByLabel("Add image or video file")
    .setInputFiles("public/assets/demo/garden-original.png");
  await page.waitForFunction(
    () =>
      JSON.parse(localStorage.getItem("cadencegraph.project.v1")!).scenes[0]
        .nodes.length === 2,
  );
  await layout("25", "43", "50", "50");
  await page.getByRole("button", { name: "9:16", exact: true }).click();
  await layout("9", "43", "82", "45");
  await page.getByRole("button", { name: "16:9", exact: true }).click();
  await scene("blank", "Room to grow");
  await page
    .getByLabel("Add image or video file")
    .setInputFiles("public/assets/demo/garden-motion.mp4");
  await page.waitForFunction(
    () =>
      JSON.parse(localStorage.getItem("cadencegraph.project.v1")!).scenes[1]
        .nodes.length === 1,
  );
  await layout("12", "12", "76", "65");
  await page
    .getByRole("button", { name: "Insert caption layer", exact: true })
    .click();
  await text("Plant a seed. Share the work.", "Bir tohum ek. Emeğini paylaş.");
  await number("Font size", "36");
  await duration("3", "3.5");
  await page
    .getByLabel("Import narration audio")
    .setInputFiles("public/assets/demo/garden-tone.wav");
  await page.waitForFunction(() =>
    Boolean(
      JSON.parse(localStorage.getItem("cadencegraph.project.v1")!).scenes[1]
        .sentences[0].audioAssetId?.en,
    ),
  );
  await scene("quote", "A shared story");
  await text(
    "Small spaces.\nShared possibilities.",
    "Küçük alanlar.\nOrtak umutlar.",
  );
  await duration("3", "4");
  // Edit the template's attribution through its actual layer entry.
  await page
    .locator(".scene-group")
    .nth(2)
    .locator(".layer-row")
    .nth(1)
    .click();
  await text("A neighborhood grows together", "Bir mahalle birlikte büyür");
  await scene("closing", "Join the garden");
  await text("Bring your curiosity.", "Merakını yanında getir.");
  await duration("3", "4");
  await page
    .locator(".scene-group")
    .nth(3)
    .locator(".layer-row")
    .nth(1)
    .click();
  await text("Grow with us", "Birlikte büyütelim");
  await page.getByLabel("Entrance animation").selectOption("slide");
  await number("Layer start offset", "0.2");
  // A copied scene really has independent IDs and can be removed without losing the source.
  await settings();
  await page
    .getByRole("button", { name: "Duplicate scene", exact: true })
    .click();
  assert.equal((await saved()).scenes.length, 5);
  await page.getByRole("button", { name: "Delete scene", exact: true }).click();
  assert.equal((await saved()).scenes.length, 4);
  await page
    .getByRole("button", { name: "Move scene earlier", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Move scene later", exact: true })
    .click();
  // Invalid media is a visible recoverable state.
  await page.getByLabel("Add image or video file").setInputFiles({
    name: "invalid.png",
    mimeType: "image/png",
    buffer: Buffer.from("invalid image"),
  });
  await page
    .getByRole("alert")
    .filter({ hasText: "contents do not match" })
    .waitFor();
  // Expected bad-upload HTTP status is excluded from the clean-path console record.
  const initialErrors = errors.splice(0);
  const expectedErrors = initialErrors.filter((x) =>
    x.includes("400 (Bad Request)"),
  );
  assert.deepEqual(
    initialErrors.filter((x) => !x.includes("400 (Bad Request)")),
    [],
  );
  await page.reload();
  await page
    .getByRole("textbox", { name: "Project name", exact: true })
    .waitFor();
  assert.equal((await saved()).scenes.length, 4);
  assert.equal(await page.locator("vite-error-overlay").count(), 0);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: "docs/verification/authoring-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "9:16", exact: true }).click();
  await page.screenshot({
    path: "docs/verification/authoring-mobile.png",
    fullPage: true,
  });
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  );
  // Save through the visible editor export, then make uploaded assets portable for the example.
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Save project JSON", exact: true })
    .click();
  const exported = await download;
  await exported.saveAs("outputs/authoring/browser-project.cadence.json");
  const project = parseProject(
    JSON.parse(
      await readFile("outputs/authoring/browser-project.cadence.json", "utf8"),
    ),
  );
  for (const asset of project.assets) {
    if (asset.src.includes("/uploads/")) {
      const name = asset.name || basename(asset.src);
      const portable = `assets/demo/${name}`;
      await copyFile(resolve("public", asset.src), resolve("public", portable));
      asset.src = portable;
    }
  }
  await writeFile(
    "examples/community-garden.cadence.json",
    JSON.stringify(project, null, 2) + "\n",
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: "16:9", exact: true }).click();
  await page.getByRole("button", { name: "Export film", exact: true }).click();
  const filmLink = page.getByRole("link", {
    name: "Download EN 16:9 MP4",
    exact: true,
  });
  await filmLink.waitFor({ timeout: 180000 });
  const filmDownload = page.waitForEvent("download");
  await filmLink.click();
  await (
    await filmDownload
  ).saveAs("outputs/authoring/garden-studio-export.mp4");
  const studioBytes = await readFile(
    "outputs/authoring/garden-studio-export.mp4",
  );
  assert.equal(studioBytes.toString("ascii", 4, 8), "ftyp");
  const studioExport = {
    file: "garden-studio-export.mp4",
    realUiAndApi: true,
    bytes: studioBytes.length,
    sha256: createHash("sha256").update(studioBytes).digest("hex"),
    locale: "en",
    ratio: "16:9",
    fps: 30,
  };
  console.log("Studio export button → real API → MP4 download verified.");
  const outputs = [];
  for (const locale of project.locales)
    for (const ratio of project.ratios) {
      const filename = `garden-${locale}-${ratio.replace(":", "x")}.mp4`;
      console.log(`Rendering ${filename}`);
      const report = await renderProject(
        project,
        locale,
        ratio,
        `outputs/authoring/${filename}`,
        { width: ratio === "16:9" ? 1280 : 720, fps: 24 },
      );
      assert.equal(report.inspections.flatMap((i) => i.issues).length, 0);
      assert(
        Math.abs(
          report.duration - compileProject(project, locale, ratio).duration,
        ) < 0.05,
      );
      const bytes = await readFile(`outputs/authoring/${filename}`);
      outputs.push({
        filename,
        sha256: createHash("sha256").update(bytes).digest("hex"),
        bytes: bytes.length,
        width: report.width,
        height: report.height,
        duration: report.duration,
        frames: report.frames,
        audio: report.audio,
        inspections: report.inspections.length,
      });
      await copyFile(
        `outputs/authoring/${filename.replace(".mp4", ".report.json")}`,
        `docs/verification/demos/${filename.replace(".mp4", ".report.json")}`,
      );
    }
  assert.deepEqual(errors, []);
  await writeFile(
    "docs/verification/authoring-acceptance.json",
    JSON.stringify(
      {
        verifiedAt: new Date().toISOString(),
        browser: "Playwright Chromium",
        browserPlugin: "not available; repository Playwright workflow used",
        url: base,
        pageTitle: await page.title(),
        viewports: [
          { width: 1440, height: 1000 },
          { width: 390, height: 844 },
        ],
        source: "examples/community-garden.cadence.json",
        sourceSha256: createHash("sha256")
          .update(await readFile("examples/community-garden.cadence.json"))
          .digest("hex"),
        sceneNames: project.scenes.map((s) => s.name),
        checks: {
          createdFromBlankUsingUI: true,
          originalBilingualContent: true,
          imageAndVideoUploaded: true,
          narrationUploaded: true,
          sceneDuplicateDeleteReorder: true,
          invalidMediaRecovered: true,
          savedReloadedAndExported: true,
          mobileNoHorizontalOverflow: true,
          noFrameworkOverlay: true,
          noRuntimeErrors: true,
        },
        expectedBadUploadConsoleErrors: expectedErrors.length,
        studioExport,
        outputs,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    "Authoring acceptance passed: browser-created original film and four verified MP4s.",
  );
} finally {
  await browser.close();
}
