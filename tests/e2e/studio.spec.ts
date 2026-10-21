import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { deflateSync } from "node:zlib";
import { demoProject } from "../../examples/demo";
import type { Project, Operation } from "../../src/core";

const savedProject = (page: Page): Promise<Project> =>
  page.evaluate(() =>
    JSON.parse(localStorage.getItem("cadencegraph.project.v1")!),
  );
const findNode = (project: Project, id: string) =>
  project.scenes.flatMap((s) => s.nodes).find((n) => n.id === id)!;
const inspector = (page: Page) =>
  page.getByRole("complementary", { name: "Layer inspector" });
const sceneRail = (page: Page) =>
  page.getByRole("complementary", { name: "Project scenes and layers" });
async function load(page: Page) {
  await page.goto("/");
  await expect(page.getByLabel("Layer text")).toHaveValue(
    "A little more\npossible.",
  );
  await page.evaluate(() => document.fonts.ready);
}
async function editNumber(page: Page, name: string, value: string) {
  const field = page.getByRole("spinbutton", { name, exact: true });
  await field.fill(value);
  await field.press("Tab");
}
async function fixtureProposal(page: Page, operations: Operation[]) {
  // UI regression fixture only. This does not claim real model/provider acceptance.
  await page.route("**/api/ai", async (route) => {
    const request = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        provider: "fixture-ui-test",
        proposal: {
          id: "fixture-review",
          baseRevision: request.project.revision,
          summary: "Deterministic UI regression proposal.",
          operations,
        },
      }),
    });
  });
  await inspector(page)
    .getByRole("button", { name: "Claude", exact: true })
    .click();
  await page.getByRole("button", { name: "Propose changes" }).click();
  await expect(
    page.getByText("fixture-ui-test", { exact: true }),
  ).toBeVisible();
}

test("manual canvas drag survives a reviewed AI text edit, locale/ratio changes and reload", async ({
  page,
}) => {
  await load(page);
  await page.getByRole("button", { name: "9:16", exact: true }).click();
  const before = await savedProject(page);
  const node = page.locator('.canvas-frame [data-node-id="intro-headline"]');
  const bounds = (await node.boundingBox())!;
  await page.mouse.move(
    bounds.x + bounds.width * 0.5,
    bounds.y + bounds.height * 0.5,
  );
  await page.mouse.down();
  await page.mouse.move(
    bounds.x + bounds.width * 0.5 + 10,
    bounds.y + bounds.height * 0.5 + 18,
    { steps: 5 },
  );
  await page.mouse.up();
  await expect(
    page.getByRole("button", { name: "Manual layout protected" }),
  ).toBeVisible();
  const moved = await savedProject(page);
  const manual = findNode(moved, "intro-headline").overrides!["9:16"]!;
  expect(manual.protected).toBe(true);
  expect(manual.layout).not.toEqual(
    findNode(before, "intro-headline").overrides!["9:16"]!.layout,
  );
  await fixtureProposal(page, [
    {
      type: "set-text",
      nodeId: "intro-headline",
      locale: "en",
      text: "Make room\nfor more.",
    },
  ]);
  await page.getByRole("button", { name: "Apply 1 changes" }).click();
  const revised = await savedProject(page);
  expect(findNode(revised, "intro-headline").overrides!["9:16"]).toEqual(
    manual,
  );
  expect(findNode(revised, "intro-headline").content.en).toBe(
    "Make room\nfor more.",
  );
  expect(findNode(revised, "intro-headline").content.tr).toBe(
    findNode(before, "intro-headline").content.tr,
  );
  await page.getByRole("button", { name: "16:9", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Preview language" })
    .selectOption("tr");
  await page.getByRole("button", { name: "Properties", exact: true }).click();
  await expect(
    page.getByRole("spinbutton", { name: "Layer y", exact: true }),
  ).toHaveValue("26");
  await expect(page.getByLabel("Layer text")).toHaveValue(
    "Her revizyonla\ndaha mümkün.",
  );
  await page.reload();
  await expect(page.getByLabel("Layer text")).toHaveValue(
    "Make room\nfor more.",
  );
  expect(
    findNode(await savedProject(page), "intro-headline").overrides!["9:16"],
  ).toEqual(manual);
});

test("protected AI layout proposal is visible and cannot partially apply", async ({
  page,
}) => {
  await load(page);
  await page.getByRole("button", { name: "9:16", exact: true }).click();
  await editNumber(page, "Layer y", "20");
  const original = await savedProject(page);
  await fixtureProposal(page, [
    {
      type: "set-text",
      nodeId: "intro-headline",
      locale: "en",
      text: "Must never apply",
    },
    {
      type: "set-layout",
      nodeId: "intro-headline",
      ratio: "9:16",
      layout: { y: 30 },
    },
  ]);
  await expect(
    page.getByText("Changes blocked", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("intro-headline has a protected 9:16 layout.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Apply 2 changes" }),
  ).toBeDisabled();
  expect(await savedProject(page)).toEqual(original);
});

test("a proposal becomes stale when undo changes the current revision", async ({
  page,
}) => {
  await load(page);
  const text = page.getByLabel("Layer text");
  await text.fill("A human revision");
  await text.press("Tab");
  await fixtureProposal(page, [
    {
      type: "set-text",
      nodeId: "intro-headline",
      locale: "en",
      text: "Stale suggestion",
    },
  ]);
  await expect(
    page.getByRole("button", { name: "Apply 1 changes" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(
    page.getByText(/Proposal targets revision 1; current revision is 2/),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Apply 1 changes" }),
  ).toBeDisabled();
  expect(findNode(await savedProject(page), "intro-headline").content.en).toBe(
    "A little more\npossible.",
  );
});

test("undo, redo, export, import and local reload preserve editable JSON", async ({
  page,
}) => {
  await load(page);
  await editNumber(page, "Layer x", "10");
  await expect(
    page.getByRole("spinbutton", { name: "Layer x", exact: true }),
  ).toHaveValue("10");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(
    page.getByRole("spinbutton", { name: "Layer x", exact: true }),
  ).toHaveValue("7");
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(
    page.getByRole("spinbutton", { name: "Layer x", exact: true }),
  ).toHaveValue("10");
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save project JSON" }).click();
  const download = await downloadEvent;
  const exported = JSON.parse(await readFile((await download.path())!, "utf8"));
  expect(
    findNode(exported, "intro-headline").overrides?.["16:9"]?.protected,
  ).toBe(true);
  expect(exported.revision).toBe(3);
  await page.getByLabel("Import project", { exact: true }).setInputFiles({
    name: "editable.cadence.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(exported)),
  });
  await expect(page.getByRole("status")).toContainText(
    "Imported A little more possible",
  );
  expect(await savedProject(page)).toEqual({ ...exported, revision: 4 });
  await page.reload();
  await sceneRail(page)
    .getByRole("button", { name: "headline", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("spinbutton", { name: "Layer x", exact: true }),
  ).toHaveValue("10");
});

test("localized duration retimes dependent scenes and four variant previews together", async ({
  page,
}) => {
  await load(page);
  await page
    .getByRole("combobox", { name: "Preview language" })
    .selectOption("tr");
  await editNumber(page, "Sentence duration", "10.5");
  const saved = await savedProject(page);
  expect(saved.scenes[0].sentences[0].duration).toEqual({ en: 6.5, tr: 10.5 });
  await page.getByRole("button", { name: "4 variants", exact: true }).click();
  const tiles = page.locator(".variant-tile");
  await expect(tiles).toHaveCount(4);
  await expect(tiles.nth(0)).toContainText("16:9 · 19.5s");
  await expect(tiles.nth(1)).toContainText("9:16 · 19.5s");
  await expect(tiles.nth(2)).toContainText("16:9 · 25.0s");
  await expect(tiles.nth(3)).toContainText("9:16 · 25.0s");
  await tiles.nth(3).click();
  await expect(
    page.getByRole("combobox", { name: "Preview language" }),
  ).toHaveValue("tr");
  await expect(page.locator(".ratio-toggle button.selected")).toHaveText(
    "9:16",
  );
});

function silentWav(seconds: number) {
  const rate = 16000;
  const samples = Math.floor(rate * seconds);
  const buffer = Buffer.alloc(44 + samples * 2);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(buffer.length - 8, 4);
  buffer.write("WAVEfmt ", 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(rate, 24);
  buffer.writeUInt32LE(rate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(samples * 2, 40);
  return buffer;
}
test("real WAV upload is inspected by ffprobe and updates only the selected narration", async ({
  page,
  request,
}) => {
  await load(page);
  await page
    .getByRole("combobox", { name: "Preview language" })
    .selectOption("tr");
  await page
    .getByLabel("Import narration audio", { exact: true })
    .setInputFiles({
      name: "e2e-turkish-duration.wav",
      mimeType: "audio/wav",
      buffer: silentWav(9.25),
    });
  await expect(
    page.getByRole("button", { name: "Replace narration" }),
  ).toBeVisible();
  await expect(
    page.getByRole("spinbutton", { name: "Sentence duration", exact: true }),
  ).toHaveValue("9.25");
  const project = await savedProject(page);
  const sentence = project.scenes[0].sentences[0];
  expect(sentence.duration.en).toBe(6.5);
  expect(sentence.audioAssetId?.tr).toBeTruthy();
  expect(sentence.audioAssetId?.en).toBeUndefined();
  const asset = project.assets.find((a) => a.id === sentence.audioAssetId?.tr)!;
  const response = await request.get(`/${asset.src}`);
  expect(response.ok()).toBe(true);
  expect((await response.body()).subarray(0, 4).toString()).toBe("RIFF");
  await expect(
    page.locator('audio[aria-label="Narration audio preview"]'),
  ).toHaveAttribute("src", asset.src);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(
    page.getByRole("spinbutton", { name: "Sentence duration", exact: true }),
  ).toHaveValue("7.5");
  expect((await savedProject(page)).assets).toEqual(demoProject.assets);
});

function generatedPng() {
  // Original 4x4 solid mint RGBA fixture, encoded locally without an image dependency.
  const chunk = (name: string, bytes: Buffer) => {
    const type = Buffer.from(name);
    const content = Buffer.concat([type, bytes]);
    let crc = 0xffffffff;
    for (const byte of content) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit++)
        crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    const size = Buffer.alloc(4);
    size.writeUInt32BE(bytes.length);
    const checksum = Buffer.alloc(4);
    checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
    return Buffer.concat([size, content, checksum]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(4, 0);
  header.writeUInt32BE(4, 4);
  header[8] = 8;
  header[9] = 6;
  const pixels = Buffer.alloc(4 * (1 + 4 * 4));
  for (let y = 0; y < 4; y++)
    for (let x = 0; x < 4; x++) {
      const i = y * 17 + 1 + x * 4;
      pixels.set([160, 245, 207, 255], i);
    }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(pixels)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
test("real image replacement preserves protected media identity and undo restores its original reference", async ({
  page,
  request,
}) => {
  await load(page);
  await sceneRail(page)
    .getByRole("button", { name: "brand-mark", exact: true })
    .click();
  await page.getByRole("button", { name: "9:16", exact: true }).click();
  await editNumber(page, "Layer y", "8");
  let releaseUpload = () => {};
  let markReceived = () => {};
  const responseGate = new Promise<void>((resolve) => {
    releaseUpload = resolve;
  });
  const responseReceived = new Promise<void>((resolve) => {
    markReceived = resolve;
  });
  await page.route("**/api/media", async (route) => {
    const response = await route.fetch(); // Still uses the real API, file write and ffprobe validation.
    markReceived();
    await responseGate;
    await route.fulfill({ response });
  });
  const png = generatedPng();
  await page.getByLabel("Replace layer media", { exact: true }).setInputFiles({
    name: "e2e-generated-mint.png",
    mimeType: "image/png",
    buffer: png,
  });
  await responseReceived;
  // A user can keep editing while an upload finishes. Its callback must use the latest graph.
  await editNumber(page, "Layer x", "11");
  const before = await savedProject(page);
  const originalNode = findNode(before, "intro-logo");
  expect(originalNode.overrides?.["9:16"]?.protected).toBe(true);
  expect(originalNode.overrides?.["9:16"]?.layout.x).toBe(11);
  releaseUpload();
  await expect(
    inspector(page).getByText("e2e-generated-mint.png", { exact: true }),
  ).toBeVisible();
  const after = await savedProject(page);
  const changed = findNode(after, "intro-logo");
  expect(changed.assetId).not.toBe(originalNode.assetId);
  expect(changed).toEqual({ ...originalNode, assetId: changed.assetId });
  expect(after.scenes.flatMap((s) => s.nodes).map((n) => n.id)).toEqual(
    before.scenes.flatMap((s) => s.nodes).map((n) => n.id),
  );
  const asset = after.assets.find((a) => a.id === changed.assetId)!;
  const response = await request.get(`/${asset.src}`);
  expect(response.ok()).toBe(true);
  expect(await response.body()).toEqual(png);
  const preview = inspector(page).locator(".media-source-preview img");
  await expect(preview).toHaveAttribute("src", asset.src);
  await expect
    .poll(() =>
      preview.evaluate(
        (image: HTMLImageElement) => image.complete && image.naturalWidth,
      ),
    )
    .toBe(4);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  const undone = await savedProject(page);
  expect(findNode(undone, "intro-logo")).toEqual(originalNode);
  expect(undone.assets).toEqual(before.assets);
  await expect(preview).toHaveAttribute(
    "src",
    before.assets.find((a) => a.id === originalNode.assetId)!.src,
  );
});

test("malformed import is rejected and adding a layer is a reversible edit", async ({
  page,
}) => {
  await load(page);
  const before = await savedProject(page);
  await page.getByLabel("Import project", { exact: true }).setInputFiles({
    name: "invalid.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"schemaVersion":99}'),
  });
  await expect(page.getByRole("status")).toContainText("Import failed");
  expect(await savedProject(page)).toEqual(before);
  await sceneRail(page)
    .getByRole("button", { name: "Add text layer", exact: true })
    .first()
    .click();
  await expect(page.getByLabel("Layer text")).toHaveValue("Your next idea.");
  expect((await savedProject(page)).scenes[0].nodes).toHaveLength(
    before.scenes[0].nodes.length + 1,
  );
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  expect((await savedProject(page)).scenes[0].nodes).toHaveLength(
    before.scenes[0].nodes.length,
  );
});

test("download stays labeled with the exported variant after selection changes", async ({
  page,
}) => {
  await load(page);
  const requests: Array<{ locale: string; ratio: string }> = [];
  await page.route(/\/api\/render(?:\/qa-\d+)?$/, async (route) => {
    if (route.request().method() === "POST") {
      const { locale, ratio } = route.request().postDataJSON();
      requests.push({ locale, ratio });
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          id: `qa-${requests.length}`,
          status: "queued",
          progress: 0,
        }),
      });
      return;
    }
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        id: `qa-${requests.length}`,
        status: "complete",
        progress: 100,
        url: `/outputs/qa-${requests.length}.mp4`,
      }),
    });
  });
  await page.getByRole("button", { name: "Export film" }).click();
  await expect(
    page.getByRole("link", { name: "Download EN 16:9 MP4" }),
  ).toBeVisible();
  await page
    .getByRole("combobox", { name: "Preview language" })
    .selectOption("tr");
  await page.getByRole("button", { name: "9:16", exact: true }).click();
  await expect(page.getByText("TR · 9:16 · Revision 0")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Download EN 16:9 MP4" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Render this variant" }).click();
  await expect(
    page.getByRole("link", { name: "Download TR 9:16 MP4" }),
  ).toBeVisible();
  expect(requests).toEqual([
    { locale: "en", ratio: "16:9" },
    { locale: "tr", ratio: "9:16" },
  ]);
});

for (const viewport of [
  { width: 1440, height: 1000, name: "studio-desktop" },
  { width: 1588, height: 992, name: "studio-wide" },
  { width: 600, height: 900, name: "studio-tablet" },
  { width: 390, height: 844, name: "studio-mobile" },
]) {
  test(`responsive studio at ${viewport.width}px has no page overflow or runtime errors`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(viewport);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await load(page);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(viewport.width);
    await expect(
      page.getByRole("button", { name: "Play preview" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Play preview" }).click();
    await expect(
      page.getByRole("button", { name: "Pause preview" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Pause preview" }).click();
    // Capture the exact same deterministic project timestamp at every viewport.
    await page.getByRole("slider", { name: "Preview position" }).fill("1.5");
    await page
      .getByRole("slider", { name: "Preview position" })
      .dispatchEvent("input");
    await page
      .getByRole("slider", { name: "Preview position" })
      .dispatchEvent("change");
    await page.screenshot({
      path: testInfo.outputPath(`${viewport.name}.png`),
      fullPage: true,
    });
    expect(errors).toEqual([]);
    const stage = await page.locator(".canvas-frame").boundingBox();
    expect(stage).not.toBeNull();
    expect(stage!.width / stage!.height).toBeCloseTo(16 / 9, 1);
  });
}
