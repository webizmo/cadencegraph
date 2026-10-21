import { describe, expect, it } from "vitest";
import {
  applyTransaction,
  BRAND_PRESETS,
  compileProject,
  createBlankProject,
  createNode,
  createScene,
  findNode,
  parseOperations,
  parseProject,
  projectVariants,
  SCENE_TEMPLATES,
  undoTransaction,
  validateVariant,
  type Operation,
  type Project,
} from "../src/core";

const apply = (
  project: Project,
  operations: Operation[],
  actor: "human" | "ai" = "human",
) =>
  applyTransaction(project, {
    id: "authoring-test",
    baseRevision: project.revision,
    actor,
    operations,
  });
const fresh = () => {
  const project = createBlankProject("new-project");
  project.scenes = [
    createScene("title", "first-scene", project.locales, project.ratios),
  ];
  return project;
};

describe("blank projects and reusable starting points", () => {
  it("creates an asset-free, empty, four-second canvas for every supported output", () => {
    const project = createBlankProject("my-project", "My own story");
    expect(project.schemaVersion).toBe(1);
    expect(project.name).toBe("My own story");
    expect(project.revision).toBe(0);
    expect(project.assets).toEqual([]);
    expect(project.scenes).toHaveLength(1);
    expect(project.scenes[0].nodes).toEqual([]);
    expect(project.scenes[0].sentences).toHaveLength(1);
    expect(projectVariants(project)).toHaveLength(4);
    for (const { locale, ratio } of projectVariants(project)) {
      expect(compileProject(project, locale, ratio).duration).toBe(4);
      expect(validateVariant(project, locale, ratio)).toEqual([]);
    }
    expect(parseProject(JSON.parse(JSON.stringify(project)))).toEqual(project);
  });

  it.each(SCENE_TEMPLATES)(
    "creates valid, independent $id scenes with unlocked layouts",
    ({ id }) => {
      const project = createBlankProject("template-project");
      project.scenes = [
        createScene(id, "template-scene", project.locales, project.ratios),
      ];
      expect(parseProject(project)).toEqual(project);
      for (const { locale, ratio } of projectVariants(project)) {
        expect(validateVariant(project, locale, ratio)).toEqual([]);
        for (const node of project.scenes[0].nodes)
          expect(node.overrides?.[ratio]?.protected).toBe(false);
      }
      const other = createScene(
        id,
        "template-scene",
        project.locales,
        project.ratios,
      );
      project.scenes[0].sentences[0].duration.en = 10;
      expect(other.sentences[0].duration.en).toBe(4);
    },
  );

  it("supports a selected ratio and valid additional locales without fake media", () => {
    const scene = createScene(
      "title",
      "french-story",
      ["fr", "en-US"],
      ["9:16"],
    );
    expect(Object.keys(scene.nodes[0].content)).toEqual(["fr", "en-US"]);
    expect(Object.keys(scene.nodes[0].overrides!)).toEqual(["9:16"]);
    expect(() =>
      createNode("media", "picture", scene.sentences[0].id, ["fr"]),
    ).toThrow("Choose an image");
    const node = createNode(
      "media",
      "picture",
      scene.sentences[0].id,
      ["fr"],
      "uploaded-photo",
    );
    expect(node.assetId).toBe("uploaded-photo");
    expect(
      createNode("text", "text", scene.sentences[0].id, ["en"]).content.en,
    ).toBe("Your next idea.");
  });

  it("validates helper inputs and returns independent preset brands", () => {
    expect(() => createBlankProject("123-invalid")).toThrow();
    expect(() => createBlankProject("valid", " ")).toThrow();
    expect(() =>
      createScene("title", "valid", ["en", "en"], ["16:9"]),
    ).toThrow();
    expect(() => createScene("title", "valid", ["en"], [])).toThrow();
    expect(BRAND_PRESETS).toHaveLength(3);
    for (const preset of BRAND_PRESETS)
      expect(
        apply(fresh(), [{ type: "set-brand", brand: preset.brand }]).applied,
      ).toBe(true);
    const project = createBlankProject("independent");
    project.brand.name = "Changed";
    expect(createBlankProject("another").brand.name).toBe(
      BRAND_PRESETS[0].brand.name,
    );
  });

  it("derives deterministic valid nested IDs even from maximum-length parent IDs", () => {
    const id = "a".repeat(96);
    const first = createBlankProject(id);
    expect(createBlankProject(id)).toEqual(first);
    const scene = createScene("cards", id, ["en"], ["16:9"]);
    const all = [
      scene.id,
      ...scene.sentences.map((item) => item.id),
      ...scene.nodes.map((item) => item.id),
    ];
    expect(new Set(all).size).toBe(all.length);
    expect(all.every((value) => value.length <= 96)).toBe(true);
  });
});

describe("scene and layer structure transactions", () => {
  it("builds and reorders an original scene sequence with final-position indices", () => {
    const original = fresh();
    const result = apply(original, [
      {
        type: "add-scene",
        scene: createScene(
          "quote",
          "quote-scene",
          original.locales,
          original.ratios,
        ),
      },
      {
        type: "add-scene",
        scene: createScene(
          "closing",
          "closing-scene",
          original.locales,
          original.ratios,
        ),
        index: 1,
      },
      { type: "move-scene", sceneId: "quote-scene", index: 0 },
      {
        type: "set-scene",
        sceneId: "quote-scene",
        name: "A fresh opening",
        theme: "inverted",
      },
      { type: "set-project-name", name: "An original sequence" },
    ]);
    expect(result.applied).toBe(true);
    expect(result.project.scenes.map((scene) => scene.id)).toEqual([
      "quote-scene",
      "first-scene",
      "closing-scene",
    ]);
    expect(result.project.scenes[0]).toMatchObject({
      name: "A fresh opening",
      theme: "inverted",
    });
    expect(result.project.name).toBe("An original sequence");
    expect(result.project.revision).toBe(1);
    expect(result.changes).toHaveLength(5);
    expect(compileProject(result.project, "en", "16:9").duration).toBe(12);
    expect(original.scenes).toHaveLength(1);
    expect(undoTransaction(result.project, result.undo!)).toEqual({
      ...original,
      revision: 2,
    });
  });

  it("duplicates all sentence and node IDs and remaps each sentence anchor", () => {
    const project = fresh();
    const source = project.scenes[0];
    source.sentences.push({
      id: "second-sentence",
      text: { en: "Continue", tr: "Devam" },
      duration: { en: 3, tr: 3.5 },
    });
    source.nodes.push(
      createNode(
        "caption",
        "second-caption",
        "second-sentence",
        project.locales,
      ),
    );
    const original = structuredClone(source);
    const result = apply(project, [
      { type: "duplicate-scene", sceneId: source.id, newId: "scene-copy" },
    ]);
    expect(result.applied).toBe(true);
    const copy = result.project.scenes[1];
    expect(copy.id).toBe("scene-copy");
    expect(copy.sentences.map((sentence) => sentence.id)).toEqual([
      "scene-copy-sentence-1",
      "scene-copy-sentence-2",
    ]);
    expect(copy.nodes.map((node) => node.id)).toEqual([
      "scene-copy-node-1",
      "scene-copy-node-2",
      "scene-copy-node-3",
    ]);
    expect(copy.nodes.map((node) => node.timing.sentenceId)).toEqual([
      "scene-copy-sentence-1",
      "scene-copy-sentence-1",
      "scene-copy-sentence-2",
    ]);
    expect(result.project.scenes[0]).toEqual(original);
    expect(copy.nodes[0].overrides).toEqual(original.nodes[0].overrides);
    copy.nodes[0].content.en = "Independent";
    expect(result.project.scenes[0].nodes[0].content.en).toBe(
      original.nodes[0].content.en,
    );
  });

  it("duplicates and reorders layers while preserving timing and manual layout", () => {
    const project = fresh();
    project.scenes[0].nodes[0].overrides!["9:16"]!.protected = true;
    const source = structuredClone(project.scenes[0].nodes[0]);
    const result = apply(project, [
      { type: "duplicate-node", nodeId: source.id, newId: "headline-copy" },
      { type: "move-node", nodeId: "headline-copy", index: 2 },
    ]);
    expect(result.applied).toBe(true);
    expect(result.project.scenes[0].nodes.map((node) => node.id)).toEqual([
      source.id,
      "first-scene-body",
      "headline-copy",
    ]);
    expect(findNode(result.project, "headline-copy")).toEqual({
      ...source,
      id: "headline-copy",
    });
  });

  it("allows an empty scene but prevents deleting the final scene", () => {
    const project = createBlankProject("blank-project");
    expect(parseProject(project)).toEqual(project);
    const removed = apply(project, [
      { type: "remove-scene", sceneId: project.scenes[0].id },
    ]);
    expect(removed.applied).toBe(false);
    expect(removed.project).toBe(project);
    const replacement = createScene(
      "blank",
      "replacement",
      project.locales,
      project.ratios,
    );
    const result = apply(project, [
      { type: "add-scene", scene: replacement },
      { type: "remove-scene", sceneId: project.scenes[0].id },
    ]);
    expect(result.applied).toBe(true);
    expect(result.project.scenes).toEqual([replacement]);
    const noSentences = structuredClone(replacement);
    noSentences.sentences = [];
    expect(() =>
      parseOperations([{ type: "add-scene", scene: noSentences }]),
    ).toThrow("sentences");
  });

  it("rejects out-of-range order, duplicate identities and unknown targets atomically", () => {
    const project = fresh();
    const invalid: Operation[] = [
      { type: "move-scene", sceneId: "first-scene", index: 1 },
      { type: "move-node", nodeId: "first-scene-headline", index: 2 },
      { type: "duplicate-scene", sceneId: "first-scene", newId: "first-scene" },
      {
        type: "duplicate-node",
        nodeId: "first-scene-headline",
        newId: project.id,
      },
      { type: "remove-scene", sceneId: "missing" },
      {
        type: "add-scene",
        scene: createScene("blank", "other", project.locales, project.ratios),
        index: 2,
      },
    ];
    for (const operation of invalid) {
      const result = apply(project, [
        { type: "set-project-name", name: "Must roll back" },
        operation,
      ]);
      expect(result.applied).toBe(false);
      expect(result.project).toBe(project);
      expect(result.changes).toEqual([]);
    }
  });

  it("rejects scenes with undeclared locales or ratios at the transaction boundary", () => {
    const project = fresh();
    const otherLocale = createScene(
      "blank",
      "other",
      ["en", "fr"],
      project.ratios,
    );
    expect(
      apply(project, [{ type: "add-scene", scene: otherLocale }]).applied,
    ).toBe(false);
    project.ratios = ["16:9"];
    for (const node of project.scenes[0].nodes) delete node.overrides!["9:16"];
    const otherRatio = createScene("title", "other", project.locales, ["9:16"]);
    expect(
      apply(project, [{ type: "add-scene", scene: otherRatio }]).applied,
    ).toBe(false);
  });
});

describe("style, motion and semantic timing edits", () => {
  it("replaces style, animation and timing without altering geometry or other locales", () => {
    const project = fresh();
    const source = project.scenes[0].nodes[0];
    const result = apply(project, [
      {
        type: "set-node-style",
        nodeId: source.id,
        style: {
          fontSize: 58,
          fontWeight: 600,
          color: "#123456",
          align: "center",
        },
      },
      {
        type: "set-node-animation",
        nodeId: source.id,
        animation: { enter: "slide", delay: 0.2 },
      },
      {
        type: "set-node-timing",
        nodeId: source.id,
        timing: { sentenceId: source.timing.sentenceId, start: 0.5, end: 3.5 },
      },
    ]);
    expect(result.applied).toBe(true);
    const edited = findNode(result.project, source.id)!;
    expect(edited.style).toEqual({
      fontSize: 58,
      fontWeight: 600,
      color: "#123456",
      align: "center",
    });
    expect(edited.animation).toEqual({ enter: "slide", delay: 0.2 });
    expect(edited.layout).toEqual(source.layout);
    expect(edited.overrides).toEqual(source.overrides);
    expect(edited.content).toEqual(source.content);
    const output = compileProject(result.project, "tr", "9:16").scenes[0]
      .nodes[0];
    expect(output.start).toBe(0.5);
    expect(output.end).toBe(3.5);
    const cleared = apply(result.project, [
      { type: "set-node-style", nodeId: source.id, style: {} },
      { type: "set-node-animation", nodeId: source.id },
    ]);
    expect(cleared.applied).toBe(true);
    expect(findNode(cleared.project, source.id)!.style).toEqual({});
    expect(findNode(cleared.project, source.id)!.animation).toBeUndefined();
  });

  it("keeps cues relative to their sentence after scene reordering and locale retiming", () => {
    const project = fresh();
    const second = createScene(
      "title",
      "second",
      project.locales,
      project.ratios,
    );
    const result = apply(project, [
      { type: "add-scene", scene: second },
      {
        type: "set-node-timing",
        nodeId: second.nodes[0].id,
        timing: { sentenceId: second.sentences[0].id, start: 0.5, end: 3 },
      },
      {
        type: "set-sentence-duration",
        sentenceId: project.scenes[0].sentences[0].id,
        locale: "tr",
        duration: 7,
      },
    ]);
    expect(result.applied).toBe(true);
    expect(
      compileProject(result.project, "en", "16:9").scenes[1].nodes[0].start,
    ).toBe(4.5);
    expect(
      compileProject(result.project, "tr", "16:9").scenes[1].nodes[0].start,
    ).toBe(7.5);
    const reordered = apply(result.project, [
      { type: "move-scene", sceneId: second.id, index: 0 },
    ]);
    expect(
      compileProject(reordered.project, "tr", "16:9").scenes[0].nodes[0].start,
    ).toBe(0.5);
  });

  it("rejects cross-scene anchors, zero intervals and offsets outside the shortest locale", () => {
    const project = fresh();
    const source = project.scenes[0].nodes[0];
    project.scenes.push(
      createScene("blank", "second", project.locales, project.ratios),
    );
    project.scenes[0].sentences[0].duration.tr = 2;
    const invalid = [
      { sentenceId: project.scenes[1].sentences[0].id },
      { sentenceId: source.timing.sentenceId, start: 1, end: 1 },
      { sentenceId: source.timing.sentenceId, start: 0.5, end: 3 },
      { sentenceId: source.timing.sentenceId, start: 2 },
    ];
    for (const timing of invalid) {
      const result = apply(project, [
        { type: "set-project-name", name: "Rollback" },
        { type: "set-node-timing", nodeId: source.id, timing },
      ]);
      expect(result.applied).toBe(false);
      expect(result.project).toBe(project);
    }
  });

  it("removes only selected narration and retains timing, assets and other language audio", () => {
    const project = fresh();
    const sentence = project.scenes[0].sentences[0];
    const withAudio = apply(project, [
      {
        type: "set-sentence-audio",
        sentenceId: sentence.id,
        locale: "en",
        duration: 4,
        asset: { id: "voice-en", type: "audio", src: "uploads/en.wav" },
      },
      {
        type: "set-sentence-audio",
        sentenceId: sentence.id,
        locale: "tr",
        duration: 5,
        asset: { id: "voice-tr", type: "audio", src: "uploads/tr.wav" },
      },
    ]).project;
    const operation: Operation = {
      type: "remove-sentence-audio",
      sentenceId: sentence.id,
      locale: "tr",
    };
    expect(apply(withAudio, [operation], "ai").applied).toBe(false);
    expect(apply(withAudio, [{ ...operation, locale: "fr" }]).applied).toBe(
      false,
    );
    const result = apply(withAudio, [operation]);
    expect(result.applied).toBe(true);
    expect(result.project.scenes[0].sentences[0].audioAssetId).toEqual({
      en: "voice-en",
    });
    expect(result.project.scenes[0].sentences[0].duration).toEqual({
      en: 4,
      tr: 5,
    });
    expect(result.project.assets).toEqual(withAudio.assets);
    const allRemoved = apply(result.project, [{ ...operation, locale: "en" }]);
    expect(
      allRemoved.project.scenes[0].sentences[0].audioAssetId,
    ).toBeUndefined();
    expect(undoTransaction(result.project, result.undo!).scenes).toEqual(
      withAudio.scenes,
    );
  });
});

describe("strict structural proposals and reconciliation", () => {
  it("never reserves implementation placeholder IDs in user documents", () => {
    const project = fresh();
    project.scenes[0].nodes[0].id = "operation-anchor";
    const result = apply(project, [
      {
        type: "set-node-style",
        nodeId: "operation-anchor",
        style: { fontSize: 48 },
      },
    ]);
    expect(result.applied).toBe(true);
    expect(findNode(result.project, "operation-anchor")!.style).toEqual({
      fontSize: 48,
    });
  });

  it.each([
    { type: "move-scene", sceneId: "first-scene", index: -1 },
    { type: "move-node", nodeId: "first-scene-headline", index: 1.5 },
    { type: "duplicate-scene", sceneId: "first-scene", newId: "bad id" },
    { type: "set-scene", sceneId: "first-scene" },
    { type: "set-scene", sceneId: "first-scene", theme: "unknown" },
    { type: "set-project-name", name: " " },
    {
      type: "set-node-style",
      nodeId: "first-scene-headline",
      style: { fontSize: 301 },
    },
    {
      type: "set-node-style",
      nodeId: "first-scene-headline",
      style: { color: "url(unsafe)" },
    },
    {
      type: "set-node-style",
      nodeId: "first-scene-headline",
      style: { arbitrary: true },
    },
    {
      type: "set-node-animation",
      nodeId: "first-scene-headline",
      animation: { enter: "fade", delay: -1 },
    },
    {
      type: "set-node-animation",
      nodeId: "first-scene-headline",
      animation: { enter: "fade", arbitrary: true },
    },
    {
      type: "set-node-timing",
      nodeId: "first-scene-headline",
      timing: { sentenceId: "sentence", start: -0.1 },
    },
    {
      type: "set-node-timing",
      nodeId: "first-scene-headline",
      timing: { sentenceId: "sentence", arbitrary: true },
    },
  ])("rejects malformed edit %j before mutation", (operation) => {
    expect(() => parseOperations([operation])).toThrow();
  });

  it("strictly validates nested added scene and node payloads before applying", () => {
    const scene = createScene(
      "title",
      "new-scene",
      ["en", "tr"],
      ["16:9", "9:16"],
    );
    expect(() =>
      parseOperations([
        { type: "add-scene", scene: { ...scene, execute: "no" } },
      ]),
    ).toThrow("Unknown");
    const invalid = structuredClone(scene);
    Object.assign(invalid.nodes[0].style!, { execute: "no" });
    expect(() =>
      parseOperations([{ type: "add-scene", scene: invalid }]),
    ).toThrow("Unknown");
    expect(() =>
      parseOperations([
        {
          type: "add-node",
          sceneId: scene.id,
          node: { ...scene.nodes[0], execute: "no" },
        },
      ]),
    ).toThrow("Unknown");
    expect(parseOperations([{ type: "add-scene", scene }])).toEqual([
      { type: "add-scene", scene },
    ]);
  });

  it("keeps protected scene removal, duplication and replacement atomic for AI", () => {
    const project = fresh();
    project.scenes[0].nodes[0].overrides!["9:16"]!.protected = true;
    project.scenes.push(
      createScene("blank", "other-scene", project.locales, project.ratios),
    );
    const protectedNode = project.scenes[0].nodes[0];
    const invalid: Operation[] = [
      { type: "remove-scene", sceneId: "first-scene" },
      { type: "duplicate-scene", sceneId: "first-scene", newId: "copy" },
      { type: "duplicate-node", nodeId: protectedNode.id, newId: "copy" },
      { type: "move-node", nodeId: protectedNode.id, index: 1 },
    ];
    for (const operation of invalid) {
      const result = apply(
        project,
        [{ type: "set-project-name", name: "AI mutation" }, operation],
        "ai",
      );
      expect(result.applied).toBe(false);
      expect(result.conflicts[0].code).toBe("protected-layout");
      expect(result.project).toBe(project);
    }
    const injected = structuredClone(project.scenes[0]);
    injected.id = "new-scene";
    expect(
      apply(project, [{ type: "add-scene", scene: injected }], "ai")
        .conflicts[0].code,
    ).toBe("protected-layout");
    expect(
      apply(
        project,
        [{ type: "remove-scene", sceneId: "first-scene" }],
        "human",
      ).applied,
    ).toBe(true);
  });

  it("accepts an AI-created scene but rejects stale structural proposals", () => {
    const project = createBlankProject("ai-project");
    const operation: Operation = {
      type: "add-scene",
      scene: createScene(
        "title",
        "proposed-scene",
        project.locales,
        project.ratios,
      ),
    };
    const accepted = apply(project, [operation], "ai");
    expect(accepted.applied).toBe(true);
    const stale = applyTransaction(accepted.project, {
      id: "stale-proposal",
      baseRevision: 0,
      actor: "ai",
      operations: [{ type: "remove-scene", sceneId: "proposed-scene" }],
    });
    expect(stale.conflicts[0].code).toBe("stale-revision");
    expect(stale.project).toBe(accepted.project);
  });
});
