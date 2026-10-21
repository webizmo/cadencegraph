import { test, expect, type Page } from "@playwright/test";
import { compileProject, type Project } from "../../src/core";

const savedProject = (page: Page): Promise<Project> =>
  page.evaluate(() =>
    JSON.parse(localStorage.getItem("cadencegraph.project.v1")!),
  );
const firstNode = (project: Project) => project.scenes[0].nodes[0];

async function editNumber(page: Page, name: string, value: string) {
  const field = page.getByRole("spinbutton", { name, exact: true });
  await field.fill(value);
  await field.press("Tab");
}

async function startTimedLayer(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "New project", exact: true }).click();
  await page
    .getByRole("button", { name: "Insert text layer", exact: true })
    .click();
  await expect(page.getByLabel("Layer text", { exact: true })).toHaveValue(
    "Your next idea.",
  );
  await page
    .getByRole("combobox", { name: "Preview language" })
    .selectOption("tr");
  await editNumber(page, "Sentence duration", "6");
  await page
    .getByRole("combobox", { name: "Preview language" })
    .selectOption("en");
  const project = await savedProject(page);
  expect(project.scenes[0].sentences[0].duration).toEqual({ en: 4, tr: 6 });
  return firstNode(project).id;
}

async function dragTiming(
  page: Page,
  label: string,
  seconds: number,
  duration: number,
) {
  const control = page.getByRole("button", { name: label, exact: true });
  await control.scrollIntoViewIfNeeded();
  const bounds = (await control.boundingBox())!;
  const lane = (await page.locator(".track-lane").boundingBox())!;
  const x = bounds.x + bounds.width / 2;
  const y = bounds.y + bounds.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + (lane.width * seconds) / duration, y, {
    steps: 6,
  });
  await page.mouse.up();
}

test("pointer start trim and clip movement keep the end linked to each language; end trimming makes it fixed", async ({
  page,
}) => {
  const id = await startTimedLayer(page);
  await dragTiming(page, `Trim start ${id}`, 1, 4);
  let project = await savedProject(page);
  expect(firstNode(project).timing.start).toBe(1);
  expect(firstNode(project).timing.end).toBeUndefined();
  expect(compileProject(project, "en", "16:9").scenes[0].nodes[0].end).toBe(4);
  expect(compileProject(project, "tr", "16:9").scenes[0].nodes[0].end).toBe(6);
  await page
    .getByRole("combobox", { name: "Preview language" })
    .selectOption("tr");
  await expect(
    page.getByRole("button", { name: `Move timing ${id}`, exact: true }),
  ).toHaveAttribute("title", `${id}: 00:01.0–00:06.0`);

  // Drag the body while previewing the longer language. It must not write a
  // four-second fixed end merely because the shorter language constrains starts.
  await dragTiming(page, `Move timing ${id}`, 0.5, 6);
  project = await savedProject(page);
  expect(firstNode(project).timing.start).toBe(1.5);
  expect(firstNode(project).timing.end).toBeUndefined();
  expect(compileProject(project, "tr", "9:16").scenes[0].nodes[0].end).toBe(6);
  await expect(
    page.getByLabel("Layer end offset", { exact: true }),
  ).toHaveValue("");

  await page
    .getByRole("combobox", { name: "Preview language" })
    .selectOption("en");
  await dragTiming(page, `Trim end ${id}`, -0.5, 4);
  project = await savedProject(page);
  expect(firstNode(project).timing).toMatchObject({ start: 1.5, end: 3.5 });
  for (const locale of ["en", "tr"])
    expect(compileProject(project, locale, "16:9").scenes[0].nodes[0].end).toBe(
      3.5,
    );
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  project = await savedProject(page);
  expect(firstNode(project).timing.end).toBeUndefined();
  expect(compileProject(project, "tr", "16:9").scenes[0].nodes[0].end).toBe(6);
});

test("keyboard trim handles adjust timing and reject a fixed end beyond the shortest language", async ({
  page,
}) => {
  const id = await startTimedLayer(page);
  const start = page.getByRole("button", {
    name: `Trim start ${id}`,
    exact: true,
  });
  await start.focus();
  await start.press("ArrowRight");
  await start.press("ArrowRight");
  let project = await savedProject(page);
  expect(firstNode(project).timing.start).toBeCloseTo(0.2);
  expect(firstNode(project).timing.end).toBeUndefined();
  await page
    .getByRole("combobox", { name: "Preview language" })
    .selectOption("tr");
  const end = page.getByRole("button", {
    name: `Trim end ${id}`,
    exact: true,
  });
  await end.focus();
  await end.press("ArrowLeft");
  project = await savedProject(page);
  expect(firstNode(project).timing.end).toBeCloseTo(3.9);
  await end.press("ArrowRight");
  const atBoundary = await savedProject(page);
  expect(firstNode(atBoundary).timing.end).toBe(4);
  await end.press("ArrowRight");
  await expect(page.getByRole("status")).toContainText(
    "Node timing lies outside sentence in en.",
  );
  expect(await savedProject(page)).toEqual(atBoundary);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  expect(firstNode(await savedProject(page)).timing.end).toBeCloseTo(3.9);
});

test("motion and text style edits persist while an invalid offset leaves the project unchanged", async ({
  page,
}) => {
  await startTimedLayer(page);
  const before = await savedProject(page);
  await page
    .getByRole("combobox", { name: "Entrance animation", exact: true })
    .selectOption("slide");
  await editNumber(page, "Entrance delay", "0.5");
  await editNumber(page, "Font size", "54");
  await page
    .getByRole("combobox", { name: "Font weight", exact: true })
    .selectOption("600");
  await page
    .getByRole("combobox", { name: "Text alignment", exact: true })
    .selectOption("center");
  const color = page.getByRole("textbox", { name: "Text color", exact: true });
  await color.fill("#ffcc88");
  await color.press("Tab");
  const styled = await savedProject(page);
  expect(firstNode(styled).animation).toEqual({ enter: "slide", delay: 0.5 });
  expect(firstNode(styled).style).toEqual({
    fontSize: 54,
    fontWeight: 600,
    align: "center",
    color: "#ffcc88",
  });
  expect(firstNode(styled).layout).toEqual(firstNode(before).layout);
  expect(firstNode(styled).content).toEqual(firstNode(before).content);

  await page
    .getByRole("combobox", { name: "Preview language" })
    .selectOption("tr");
  await editNumber(page, "Layer start offset", "5");
  await expect(page.getByRole("status")).toContainText(
    "Node timing lies outside sentence in en.",
  );
  expect(await savedProject(page)).toEqual(styled);
  await page.reload();
  expect(await savedProject(page)).toEqual(styled);
  await expect(
    page.getByRole("combobox", { name: "Entrance animation", exact: true }),
  ).toHaveValue("slide");
  await expect(
    page.getByRole("spinbutton", { name: "Layer start offset", exact: true }),
  ).toHaveValue("0");
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

test("removing real uploaded narration preserves duration and reusable media, and undo restores its reference", async ({
  page,
}) => {
  await startTimedLayer(page);
  await page
    .getByRole("combobox", { name: "Preview language" })
    .selectOption("tr");
  await page
    .getByLabel("Import narration audio", { exact: true })
    .setInputFiles({
      name: "timing-removal-original.wav",
      mimeType: "audio/wav",
      buffer: silentWav(5.25),
    });
  await expect(
    page.getByRole("button", { name: "Remove narration", exact: true }),
  ).toBeVisible();
  const withAudio = await savedProject(page);
  expect(withAudio.scenes[0].sentences[0].duration).toEqual({
    en: 4,
    tr: 5.25,
  });
  expect(withAudio.scenes[0].sentences[0].audioAssetId?.tr).toBeTruthy();
  await page
    .getByRole("button", { name: "Remove narration", exact: true })
    .click();
  const removed = await savedProject(page);
  expect(removed.scenes[0].sentences[0].audioAssetId?.tr).toBeUndefined();
  expect(removed.scenes[0].sentences[0].duration).toEqual(
    withAudio.scenes[0].sentences[0].duration,
  );
  expect(removed.assets).toEqual(withAudio.assets);
  await expect(
    page.getByLabel("Narration audio preview", { exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  expect((await savedProject(page)).scenes).toEqual(withAudio.scenes);
  await expect(
    page.getByLabel("Narration audio preview", { exact: true }),
  ).toHaveAttribute("src", withAudio.assets[0].src);
});
