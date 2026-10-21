import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { deflateSync } from "node:zlib";
import type { Project } from "../../src/core";

const savedProject = (page: Page): Promise<Project> =>
  page.evaluate(() =>
    JSON.parse(localStorage.getItem("cadencegraph.project.v1")!),
  );
const sceneRail = (page: Page) =>
  page.getByRole("complementary", { name: "Project scenes and layers" });
async function startBlank(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "New project", exact: true }).click();
  await expect(
    page.getByText("A blank canvas. Add a layer to start your scene.", {
      exact: true,
    }),
  ).toBeVisible();
}
async function openSettings(page: Page) {
  const settings = page.locator(".scene-settings");
  if (!(await settings.getAttribute("open"))) {
    // An open details element has the empty-string attribute, so check its property.
    if (
      !(await settings.evaluate((element: HTMLDetailsElement) => element.open))
    )
      await settings.locator("summary").click();
  }
}
async function renameScene(page: Page, name: string) {
  await openSettings(page);
  const field = page.getByRole("textbox", { name: "Scene name", exact: true });
  await field.fill(name);
  await field.press("Tab");
}
async function addScene(page: Page, template: string) {
  await page
    .getByRole("combobox", { name: "Scene template", exact: true })
    .selectOption(template);
  await page.getByRole("button", { name: "Add scene", exact: true }).click();
}
async function editCopy(page: Page, text: string) {
  const field = page.getByLabel("Layer text", { exact: true });
  await field.fill(text);
  await field.press("Tab");
}

test("an empty project becomes an original bilingual scene sequence and survives JSON export and reload", async ({
  page,
}, testInfo) => {
  await startBlank(page);
  expect((await savedProject(page)).scenes[0].nodes).toEqual([]);
  const name = page.getByRole("textbox", { name: "Project name", exact: true });
  await name.fill("An evening at the observatory");
  await name.press("Tab");
  await renameScene(page, "Doors open at dusk");
  await page
    .getByRole("button", { name: "Insert text layer", exact: true })
    .click();
  await editCopy(page, "Meet the night sky.");
  await page
    .getByRole("combobox", { name: "Preview language" })
    .selectOption("tr");
  await editCopy(page, "Gece göğüyle tanış.");
  await addScene(page, "quote");
  await renameScene(page, "A scientist's invitation");
  await editCopy(page, "Merak ettiğimiz her şey bir soruyla başlar.");
  await page
    .getByRole("combobox", { name: "Preview language" })
    .selectOption("en");
  await editCopy(page, "Every discovery starts with a question.");
  await addScene(page, "closing");
  await renameScene(page, "Reserve a seat");
  await editCopy(page, "Your place among the stars.");
  await page
    .getByRole("combobox", { name: "Project design" })
    .selectOption("cobalt");
  const project = await savedProject(page);
  expect(project.name).toBe("An evening at the observatory");
  expect(project.scenes.map((scene) => scene.kind)).toEqual([
    "blank",
    "quote",
    "closing",
  ]);
  expect(project.scenes.map((scene) => scene.name)).toEqual([
    "Doors open at dusk",
    "A scientist's invitation",
    "Reserve a seat",
  ]);
  expect(project.scenes[0].nodes[0].content).toEqual({
    en: "Meet the night sky.",
    tr: "Gece göğüyle tanış.",
  });
  expect(project.scenes[1].nodes[0].content).toEqual({
    en: "Every discovery starts with a question.",
    tr: "Merak ettiğimiz her şey bir soruyla başlar.",
  });
  expect(project.brand.name).toBe("Cobalt");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save project JSON" }).click();
  const exported = JSON.parse(
    await readFile((await (await download).path())!, "utf8"),
  );
  expect(exported).toEqual(project);
  await page.reload();
  expect(await savedProject(page)).toEqual(project);
  await expect(page.getByLabel("Layer text", { exact: true })).toHaveValue(
    "Meet the night sky.",
  );
  await page.getByRole("button", { name: "9:16", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Preview language" })
    .selectOption("tr");
  await expect(page.getByLabel("Layer text", { exact: true })).toHaveValue(
    "Gece göğüyle tanış.",
  );
  await page.screenshot({
    path: testInfo.outputPath("original-story-portrait.png"),
    fullPage: true,
  });
});

test("scene and layer creation, duplication, ordering and deletion remain reversible", async ({
  page,
}) => {
  await startBlank(page);
  const firstId = (await savedProject(page)).scenes[0].id;
  await addScene(page, "title");
  await addScene(page, "cards");
  await openSettings(page);
  const beforeMove = await savedProject(page);
  const movedId = beforeMove.scenes[2].id;
  await page
    .getByRole("button", { name: "Move scene earlier", exact: true })
    .click();
  expect((await savedProject(page)).scenes.map((scene) => scene.id)).toEqual([
    firstId,
    movedId,
    beforeMove.scenes[1].id,
  ]);
  await expect(page.locator(".canvas-heading")).toContainText("Three points");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  expect((await savedProject(page)).scenes.map((scene) => scene.id)).toEqual(
    beforeMove.scenes.map((scene) => scene.id),
  );
  await expect(page.locator(".canvas-heading")).toContainText("Three points");
  await page
    .getByRole("button", { name: "Duplicate scene", exact: true })
    .click();
  const duplicated = await savedProject(page);
  expect(duplicated.scenes).toHaveLength(4);
  const copy = duplicated.scenes[3];
  expect(copy.id).not.toBe(movedId);
  const ids = duplicated.scenes.flatMap((scene) => [
    scene.id,
    ...scene.sentences.map((sentence) => sentence.id),
    ...scene.nodes.map((node) => node.id),
  ]);
  expect(new Set(ids).size).toBe(ids.length);
  expect(
    copy.nodes.every((node) =>
      copy.sentences.some((sentence) => sentence.id === node.timing.sentenceId),
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Delete scene", exact: true }).click();
  expect((await savedProject(page)).scenes).toHaveLength(3);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  expect((await savedProject(page)).scenes).toHaveLength(4);
  await page
    .getByRole("button", { name: "Duplicate layer", exact: true })
    .click();
  const withLayer = await savedProject(page);
  const editedScene = withLayer.scenes.find((scene) => scene.id === movedId)!;
  expect(editedScene.nodes).toHaveLength(5);
  const newLayerId = editedScene.nodes[1].id;
  await page
    .getByRole("button", { name: "Move layer backward", exact: true })
    .click();
  expect(
    (await savedProject(page)).scenes.find((scene) => scene.id === movedId)!
      .nodes[0].id,
  ).toBe(newLayerId);
  await page.getByRole("button", { name: "Delete layer", exact: true }).click();
  expect(
    (await savedProject(page)).scenes.find((scene) => scene.id === movedId)!
      .nodes,
  ).toHaveLength(4);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  expect(
    (await savedProject(page)).scenes.find((scene) => scene.id === movedId)!
      .nodes,
  ).toHaveLength(5);
  const complete = await savedProject(page);
  await page.getByRole("button", { name: "New project", exact: true }).click();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  expect((await savedProject(page)).scenes).toEqual(complete.scenes);
  await sceneRail(page).locator(".scene-row").first().click();
  await expect(
    page.getByText("A blank canvas. Add a layer to start your scene.", {
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Insert CTA layer", exact: true })
    .click();
  expect((await savedProject(page)).scenes[0].nodes[0].type).toBe("cta");
});

function originalPng() {
  const chunk = (name: string, bytes: Buffer) => {
    const content = Buffer.concat([Buffer.from(name), bytes]);
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
  header.writeUInt32BE(8, 0);
  header.writeUInt32BE(8, 4);
  header[8] = 8;
  header[9] = 6;
  const pixels = Buffer.alloc(8 * 33);
  for (let y = 0; y < 8; y++)
    for (let x = 0; x < 8; x++)
      pixels.set([255, 196, 82, 255], y * 33 + 1 + x * 4);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(pixels)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

test("visual media uploads create a real new layer and can be reused across empty scenes", async ({
  page,
  request,
}) => {
  await startBlank(page);
  const bytes = originalPng();
  await page
    .getByLabel("Add image or video file", { exact: true })
    .setInputFiles({
      name: "original-sunrise.png",
      mimeType: "image/png",
      buffer: bytes,
    });
  await expect(page.locator(".media-source-preview img")).toBeVisible();
  const project = await savedProject(page);
  expect(project.assets).toHaveLength(1);
  expect(project.scenes[0].nodes).toHaveLength(1);
  expect(project.scenes[0].nodes[0].assetId).toBe(project.assets[0].id);
  const response = await request.get(`/${project.assets[0].src}`);
  expect(response.ok()).toBe(true);
  expect(await response.body()).toEqual(bytes);
  await addScene(page, "blank");
  await page
    .getByRole("combobox", { name: "Insert existing media", exact: true })
    .selectOption(project.assets[0].id);
  const reused = await savedProject(page);
  expect(reused.assets).toHaveLength(1);
  expect(reused.scenes[1].nodes[0].assetId).toBe(project.assets[0].id);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  expect((await savedProject(page)).scenes[1].nodes).toEqual([]);
  await page
    .getByLabel("Add image or video file", { exact: true })
    .setInputFiles({
      name: "invalid.png",
      mimeType: "image/png",
      buffer: Buffer.from("not an image"),
    });
  await expect(page.getByRole("alert")).toBeVisible();
  expect((await savedProject(page)).scenes[1].nodes).toEqual([]);
});

test("mobile authoring keeps project, empty scene and undo controls usable without page overflow", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await startBlank(page);
  const name = page.getByRole("textbox", { name: "Project name", exact: true });
  await name.fill("A mobile story");
  await name.press("Tab");
  await addScene(page, "title");
  await renameScene(page, "An original mobile title");
  await page
    .getByRole("button", { name: "Insert card layer", exact: true })
    .click();
  await editCopy(page, "Made from a blank project.");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByLabel("Layer text", { exact: true })).toHaveValue(
    "A useful detail",
  );
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  expect(errors).toEqual([]);
  await page.screenshot({
    path: testInfo.outputPath("mobile-authoring.png"),
    fullPage: true,
  });
});
