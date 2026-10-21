import { describe, expect, it } from "vitest";
import { demoProject } from "../examples/demo";
import {
  applyTransaction,
  compileProject,
  findNode,
  parseOperations,
  parseProject,
  parseTransaction,
  projectVariants,
  resolveLayout,
  undoTransaction,
  validateProject,
  validateVariant,
  type Operation,
  type Project,
} from "../src/core";

const fresh = () => structuredClone(demoProject);
const apply = (
  project: Project,
  operations: Operation[],
  actor: "human" | "ai" = "human",
) =>
  applyTransaction(project, {
    id: "test-change",
    baseRevision: project.revision,
    actor,
    operations,
  });

describe("versioned project and compile graph", () => {
  it("validates, round trips and compiles all four real demo variants", () => {
    expect(parseProject(JSON.parse(JSON.stringify(demoProject)))).toEqual(
      demoProject,
    );
    expect(validateProject(demoProject)).toEqual([]);
    const variants = projectVariants(demoProject);
    expect(variants).toHaveLength(4);
    for (const { locale, ratio } of variants) {
      const output = compileProject(demoProject, locale, ratio);
      expect(output.duration).toBe(locale === "en" ? 19.5 : 22);
      expect(output.scenes).toHaveLength(3);
      expect(output.width / output.height).toBeCloseTo(
        ratio === "16:9" ? 16 / 9 : 9 / 16,
      );
      expect(validateVariant(demoProject, locale, ratio)).toEqual([]);
    }
  });
  it("retimes one locale and downstream events, retaining stable IDs and manual layout", () => {
    const initial = fresh();
    const moved = apply(initial, [
      {
        type: "set-layout",
        nodeId: "features-board",
        ratio: "9:16",
        layout: { y: 47 },
      },
    ]).project;
    const result = apply(
      moved,
      [
        {
          type: "set-sentence-duration",
          sentenceId: "sentence-intro",
          locale: "tr",
          duration: 10.5,
        },
      ],
      "ai",
    );
    expect(result.applied).toBe(true);
    const en = compileProject(result.project, "en", "9:16");
    const tr = compileProject(result.project, "tr", "9:16");
    expect(en.duration).toBe(19.5);
    expect(tr.duration).toBe(25);
    expect(tr.scenes[1].start).toBe(10.5);
    expect(
      tr.scenes[1].nodes.find((n) => n.id === "features-board")?.start,
    ).toBe(10.5);
    expect(
      tr.scenes[1].nodes.find((n) => n.id === "features-board")?.layout.y,
    ).toBe(47);
    expect(
      findNode(result.project, "features-board")?.overrides?.["9:16"]
        ?.protected,
    ).toBe(true);
    expect(initial.revision).toBe(0);
  });
  it("keeps sentence-relative cue offsets after prior sentences grow", () => {
    const project = fresh();
    project.scenes[1].sentences.push({
      id: "sentence-extra",
      text: { en: "Continue", tr: "Devam" },
      duration: { en: 2, tr: 3 },
    });
    project.scenes[1].nodes.push({
      id: "extra-cue",
      type: "text",
      content: { en: "Cue", tr: "İpucu" },
      layout: { x: 10, y: 10, width: 30, height: 20 },
      timing: { sentenceId: "sentence-extra", start: 0.5 },
    });
    const result = apply(project, [
      {
        type: "set-sentence-duration",
        sentenceId: "sentence-features",
        locale: "tr",
        duration: 12,
      },
    ]);
    const output = compileProject(result.project, "tr", "16:9");
    const cue = output.scenes[1].nodes.find((n) => n.id === "extra-cue")!;
    expect(cue.start).toBe(20);
    expect(cue.end).toBe(22.5);
  });
  it("rejects a duration change that would truncate a fixed cue atomically", () => {
    const project = fresh();
    project.scenes[0].nodes[0].timing.end = 6;
    const result = apply(project, [
      { type: "set-brand", brand: { accent: "#ff3344" } },
      {
        type: "set-sentence-duration",
        sentenceId: "sentence-intro",
        locale: "en",
        duration: 4,
      },
    ]);
    expect(result.applied).toBe(false);
    expect(result.project).toBe(project);
    expect(result.changes).toEqual([]);
  });
  it("rejects undeclared output selectors", () => {
    expect(() => compileProject(demoProject, "de", "16:9")).toThrow(
      "Undeclared locale",
    );
    expect(() =>
      compileProject({ ...demoProject, ratios: ["16:9"] }, "en", "9:16"),
    ).toThrow();
  });
});

describe("transaction reconciliation", () => {
  it("human drag protects only the selected ratio by default", () => {
    const result = apply(fresh(), [
      {
        type: "set-layout",
        nodeId: "intro-orbit",
        ratio: "9:16",
        layout: { y: 48 },
      },
    ]);
    const node = findNode(result.project, "intro-orbit")!;
    expect(resolveLayout(node, "9:16").y).toBe(48);
    expect(resolveLayout(node, "16:9").y).toBe(16);
    expect(node.overrides?.["9:16"]?.protected).toBe(true);
  });
  it("protected move rejects the entire AI batch, including preceding text changes", () => {
    const moved = apply(fresh(), [
      {
        type: "set-layout",
        nodeId: "intro-orbit",
        ratio: "9:16",
        layout: { x: 10 },
      },
    ]).project;
    const result = apply(
      moved,
      [
        {
          type: "set-text",
          nodeId: "intro-headline",
          locale: "en",
          text: "Should not survive",
        },
        {
          type: "set-layout",
          nodeId: "intro-orbit",
          ratio: "9:16",
          layout: { x: 30 },
        },
      ],
      "ai",
    );
    expect(result.applied).toBe(false);
    expect(result.conflicts[0].code).toBe("protected-layout");
    expect(result.project).toBe(moved);
    expect(findNode(result.project, "intro-headline")?.content.en).toBe(
      "A little more\npossible.",
    );
  });
  it("AI cannot unlock, remove, or remove-and-replace a protected node", () => {
    const moved = apply(fresh(), [
      {
        type: "set-layout",
        nodeId: "intro-orbit",
        ratio: "9:16",
        layout: { y: 48 },
      },
    ]).project;
    for (const operations of [
      [
        {
          type: "set-protection",
          nodeId: "intro-orbit",
          ratio: "9:16",
          protected: false,
        },
      ],
      [
        {
          type: "set-layout",
          nodeId: "intro-orbit",
          ratio: "9:16",
          layout: { y: 46 },
          protect: false,
        },
      ],
      [{ type: "remove-node", nodeId: "intro-orbit" }],
      [
        { type: "remove-node", nodeId: "intro-orbit" },
        {
          type: "add-node",
          sceneId: "scene-intro",
          node: findNode(moved, "intro-orbit")!,
        },
      ],
    ] as Operation[][])
      expect(apply(moved, operations, "ai").applied).toBe(false);
  });
  it("human can unlock and a fresh AI proposal can then move the object", () => {
    let project = apply(fresh(), [
      {
        type: "set-layout",
        nodeId: "intro-orbit",
        ratio: "9:16",
        layout: { y: 48 },
      },
    ]).project;
    project = apply(project, [
      {
        type: "set-protection",
        nodeId: "intro-orbit",
        ratio: "9:16",
        protected: false,
      },
    ]).project;
    expect(
      apply(
        project,
        [
          {
            type: "set-layout",
            nodeId: "intro-orbit",
            ratio: "9:16",
            layout: { y: 50 },
          },
        ],
        "ai",
      ).applied,
    ).toBe(true);
  });
  it("updates text and brand without disturbing manual portrait geometry", () => {
    const moved = apply(fresh(), [
      {
        type: "set-layout",
        nodeId: "intro-orbit",
        ratio: "9:16",
        layout: { y: 48 },
      },
    ]).project;
    const result = apply(
      moved,
      [
        {
          type: "set-text",
          nodeId: "intro-headline",
          locale: "tr",
          text: "Yeni fikir.",
        },
        { type: "set-brand", brand: { accent: "#d7a4fa", name: "New Brand" } },
      ],
      "ai",
    );
    expect(result.applied).toBe(true);
    expect(findNode(result.project, "intro-orbit")?.overrides).toEqual(
      findNode(moved, "intro-orbit")?.overrides,
    );
    expect(result.changes[0].locales).toEqual(["tr"]);
    expect(result.changes[1].ratios).toEqual(["16:9", "9:16"]);
  });
  it("stale proposal is visible and cannot overwrite newer work", () => {
    const project = apply(fresh(), [
      { type: "set-brand", brand: { name: "Human edit" } },
    ]).project;
    const result = applyTransaction(project, {
      id: "stale",
      baseRevision: 0,
      actor: "ai",
      operations: [{ type: "set-brand", brand: { name: "AI edit" } }],
    });
    expect(result.conflicts[0].code).toBe("stale-revision");
    expect(result.project.brand.name).toBe("Human edit");
  });
  it("accepts UUID transaction identities including a leading digit", () => {
    const result = applyTransaction(fresh(), {
      id: "9e312f80-0374-4dbb-a264-a8820bb56825",
      baseRevision: 0,
      actor: "human",
      operations: [{ type: "set-brand", brand: { name: "UUID edit" } }],
    });
    expect(result.applied).toBe(true);
  });
  it("undo restores all content while monotonically advancing revision", () => {
    const original = fresh();
    const result = apply(original, [
      { type: "set-brand", brand: { name: "Change" } },
    ]);
    const undone = undoTransaction(result.project, result.undo!);
    expect(undone).toEqual({ ...original, revision: 2 });
    expect(
      applyTransaction(undone, {
        id: "old",
        baseRevision: 0,
        actor: "ai",
        operations: [{ type: "set-brand", brand: { name: "Old" } }],
      }).applied,
    ).toBe(false);
    expect(() =>
      undoTransaction(result.project, { ...original, id: "other-project" }),
    ).toThrow("different project");
  });
  it("adding a node preserves existing IDs and participates in undo", () => {
    const project = fresh();
    const newNode = {
      ...structuredClone(project.scenes[1].nodes[4]),
      id: "third-benefit",
    };
    const result = apply(
      project,
      [{ type: "add-node", sceneId: "scene-features", node: newNode }],
      "ai",
    );
    expect(result.applied).toBe(true);
    expect(findNode(result.project, "third-benefit")).toBeDefined();
    expect(
      undoTransaction(result.project, result.undo!).scenes[1].nodes,
    ).toEqual(project.scenes[1].nodes);
  });
});

describe("real narration replacement", () => {
  const asset = {
    id: "new-tr-voice",
    type: "audio" as const,
    src: "uploads/new-tr-voice.wav",
    name: "New Turkish voice",
  };
  it("replaces one language audio and duration; all later cues follow, other language stays fixed", () => {
    const project = fresh();
    const result = apply(project, [
      {
        type: "set-sentence-audio",
        sentenceId: "sentence-intro",
        locale: "tr",
        asset,
        duration: 11.2,
      },
    ]);
    expect(result.applied).toBe(true);
    expect(result.project.assets).toContainEqual(asset);
    const tr = compileProject(result.project, "tr", "9:16");
    const en = compileProject(result.project, "en", "9:16");
    expect(tr.scenes[0].sentences[0].audioAssetId).toBe(asset.id);
    expect(tr.scenes[1].start).toBe(11.2);
    expect(en.duration).toBe(19.5);
    expect(tr.duration).toBeCloseTo(25.7);
    expect(undoTransaction(result.project, result.undo!).assets).toEqual(
      project.assets,
    );
  });
  it("does not accept a non-audio asset, changed existing ID, or AI media selection", () => {
    const operation: Operation = {
      type: "set-sentence-audio",
      sentenceId: "sentence-intro",
      locale: "tr",
      asset,
      duration: 10,
    };
    expect(apply(fresh(), [operation], "ai").applied).toBe(false);
    expect(
      apply(fresh(), [{ ...operation, asset: { ...asset, type: "image" } }])
        .applied,
    ).toBe(false);
    const project = apply(fresh(), [operation]).project;
    expect(
      apply(project, [
        { ...operation, asset: { ...asset, src: "uploads/other.wav" } },
      ]).applied,
    ).toBe(false);
    expect(apply(project, [operation]).applied).toBe(true);
  });
});

describe("human media replacement", () => {
  const asset = {
    id: "replacement-image",
    type: "image" as const,
    src: "uploads/replacement.png",
    name: "New mark",
  };
  it("atomically replaces media while preserving stable identity, node order, timing and protected overrides", () => {
    const project = apply(fresh(), [
      {
        type: "set-layout",
        nodeId: "intro-logo",
        ratio: "9:16",
        layout: { y: 8 },
      },
    ]).project;
    const original = structuredClone(findNode(project, "intro-logo")!);
    const order = project.scenes[0].nodes.map((node) => node.id);
    const result = apply(project, [
      { type: "set-node-media", nodeId: "intro-logo", asset },
    ]);
    expect(result.applied).toBe(true);
    expect(findNode(result.project, "intro-logo")).toEqual({
      ...original,
      assetId: asset.id,
    });
    expect(result.project.scenes[0].nodes.map((node) => node.id)).toEqual(
      order,
    );
    expect(result.project.assets).toEqual([...project.assets, asset]);
    expect(undoTransaction(result.project, result.undo!)).toEqual({
      ...project,
      revision: result.project.revision + 1,
    });
  });
  it("accepts video assets and reuses an identical existing asset regardless of property insertion order", () => {
    const video = {
      id: "replacement-video",
      type: "video" as const,
      src: "uploads/replacement.mp4",
    };
    const first = apply(fresh(), [
      { type: "set-node-media", nodeId: "intro-logo", asset: video },
    ]);
    expect(first.applied).toBe(true);
    const reused = apply(first.project, [
      {
        type: "set-node-media",
        nodeId: "intro-logo",
        asset: { src: video.src, type: video.type, id: video.id },
      },
    ]);
    expect(reused.applied).toBe(true);
    expect(reused.project.assets).toHaveLength(first.project.assets.length);
  });
  it("rejects AI, non-media nodes and wrong asset types without partially applying a batch", () => {
    const project = fresh();
    const operation: Operation = {
      type: "set-node-media",
      nodeId: "intro-logo",
      asset,
    };
    expect(apply(project, [operation], "ai").applied).toBe(false);
    expect(
      apply(project, [{ ...operation, nodeId: "intro-headline" }]).applied,
    ).toBe(false);
    const wrongAsset = apply(project, [
      { type: "set-brand", brand: { name: "Must roll back" } },
      { ...operation, asset: { ...asset, type: "audio" } },
    ]);
    expect(wrongAsset.applied).toBe(false);
    expect(wrongAsset.project).toBe(project);
    expect(wrongAsset.changes).toEqual([]);
  });
  it("rejects changed metadata under an existing ID, invalid paths and hidden extra fields", () => {
    const project = apply(fresh(), [
      { type: "set-node-media", nodeId: "intro-logo", asset },
    ]).project;
    expect(
      apply(project, [
        {
          type: "set-node-media",
          nodeId: "intro-logo",
          asset: { ...asset, src: "uploads/other.png" },
        },
      ]).applied,
    ).toBe(false);
    expect(
      apply(fresh(), [
        {
          type: "set-node-media",
          nodeId: "intro-logo",
          asset: { ...asset, src: "../outside.png" },
        },
      ]).applied,
    ).toBe(false);
    expect(() =>
      parseOperations([
        {
          type: "set-node-media",
          nodeId: "intro-logo",
          asset: { ...asset, arbitrary: true },
        },
      ]),
    ).toThrow("Unknown asset field");
  });
});

describe("untrusted import and proposal boundaries", () => {
  const strictRecords: [string, (project: Project) => object][] = [
    ["brand", (project) => project.brand],
    ["assets[0]", (project) => project.assets[0]],
    ["scenes[0]", (project) => project.scenes[0]],
    ["scenes[0].sentences[0]", (project) => project.scenes[0].sentences[0]],
    ["scenes[0].nodes[0]", (project) => project.scenes[0].nodes[0]],
    [
      "scenes[0].nodes[0].style",
      (project) => project.scenes[0].nodes[0].style!,
    ],
    [
      "scenes[0].nodes[0].timing",
      (project) => project.scenes[0].nodes[0].timing,
    ],
    [
      "scenes[0].nodes[0].animation",
      (project) => project.scenes[0].nodes[0].animation!,
    ],
    [
      "scenes[0].nodes[0].layout",
      (project) => project.scenes[0].nodes[0].layout,
    ],
    [
      "scenes[0].nodes[0].overrides",
      (project) => project.scenes[0].nodes[0].overrides!,
    ],
    [
      "scenes[0].nodes[0].overrides.9:16",
      (project) => project.scenes[0].nodes[0].overrides!["9:16"]!,
    ],
    [
      "scenes[0].nodes[0].overrides.9:16.layout",
      (project) => project.scenes[0].nodes[0].overrides!["9:16"]!.layout,
    ],
  ];
  it.each(strictRecords)(
    "rejects unknown fields in the declared %s record",
    (path, record) => {
      const project = fresh();
      Object.assign(record(project), {
        unexpectedField: "must not survive import",
      });
      const issues = validateProject(project);
      expect(
        issues.some(
          (issue) =>
            issue.path === `${path}.unexpectedField` &&
            issue.severity === "error",
        ),
      ).toBe(true);
      expect(() => parseProject(project)).toThrow();
    },
  );
  it("retains extensible component JSON props while keeping structural records strict", () => {
    const project = fresh();
    const component = findNode(project, "intro-orbit")!;
    component.props = {
      label: "Editable surface",
      customProperty: { enabled: true, values: [1, 2, "three", null] },
    };
    expect(parseProject(project)).toEqual(project);
  });
  it.each([
    null,
    [],
    "bad",
    1,
    { schemaVersion: 2 },
    { ...demoProject, schemaVersion: 2 },
  ])("rejects invalid project %j", (value) => {
    expect(validateProject(value).length).toBeGreaterThan(0);
    expect(() => parseProject(value)).toThrow();
  });
  it("rejects prototype properties, unknown fields, non-finite numbers and cycles", () => {
    expect(() =>
      parseProject(JSON.parse('{"__proto__":{"polluted":true}}')),
    ).toThrow("Unsafe property");
    expect(() =>
      parseProject({ ...demoProject, arbitraryCode: "alert(1)" }),
    ).toThrow("Unknown");
    const project = fresh();
    project.scenes[0].nodes[0].layout.x = Number.NaN;
    expect(() => parseProject(project)).toThrow("finite");
    const cyclic: any = {};
    cyclic.x = cyclic;
    expect(() => parseProject(cyclic)).toThrow("Circular");
    expect(({} as any).polluted).toBeUndefined();
  });
  it("rejects duplicate IDs, cross-scene timing references, missing locale and missing media", () => {
    const duplicate = fresh();
    duplicate.scenes[0].nodes[1].id = duplicate.scenes[0].nodes[0].id;
    expect(
      validateProject(duplicate).some((i) => i.code === "duplicate-id"),
    ).toBe(true);
    const timing = fresh();
    timing.scenes[0].nodes[0].timing.sentenceId = "sentence-outro";
    expect(
      validateProject(timing).some((i) => i.code === "missing-reference"),
    ).toBe(true);
    const locale = fresh();
    delete locale.scenes[0].nodes[0].content.tr;
    expect(() => parseProject(locale)).toThrow();
    const media = fresh();
    media.assets = [];
    expect(validateProject(media).some((i) => i.code === "missing-media")).toBe(
      true,
    );
  });
  it.each([
    "/etc/passwd",
    "../secret",
    "assets/../../secret",
    "file:///etc/passwd",
    "javascript:alert(1)",
    "data:text/html,hi",
    "C:\\secret",
  ])("rejects unsafe asset location %s", (src) => {
    const project = fresh();
    project.assets[0].src = src;
    expect(() => parseProject(project)).toThrow();
  });
  it("rejects unknown operations, fields, invalid locale and empty transaction", () => {
    expect(() =>
      parseOperations([{ type: "execute-code", code: "x" }]),
    ).toThrow();
    expect(() =>
      parseOperations([
        { type: "set-brand", brand: { name: "x" }, bypass: true },
      ]),
    ).toThrow("Unknown field");
    expect(() => parseOperations([])).toThrow();
    expect(() =>
      parseTransaction({
        id: "test",
        actor: "admin",
        baseRevision: 0,
        operations: [],
      }),
    ).toThrow();
    expect(
      apply(fresh(), [
        {
          type: "set-text",
          nodeId: "intro-headline",
          locale: "de",
          text: "Bad",
        },
      ]).applied,
    ).toBe(false);
    expect(
      apply(fresh(), [
        { type: "set-text", nodeId: "nonexistent", locale: "en", text: "Bad" },
      ]).conflicts[0].code,
    ).toBe("not-found");
  });
  it("outputs variant-specific overflow and reading warnings without hiding the project", () => {
    const project = fresh();
    const node = project.scenes[0].nodes[1];
    node.overrides!["9:16"]!.layout.x = 95;
    node.content.en = "Too much text ".repeat(80);
    expect(parseProject(project)).toBeDefined();
    const portrait = validateVariant(project, "en", "9:16");
    expect(portrait.some((i) => i.code === "layout-overflow")).toBe(true);
    expect(portrait.some((i) => i.code === "reading-time")).toBe(true);
    expect(
      validateVariant(project, "en", "16:9").some(
        (i) => i.code === "layout-overflow",
      ),
    ).toBe(false);
  });
});
