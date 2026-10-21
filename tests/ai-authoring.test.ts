import { describe, expect, test } from "vitest";
import { applyTransaction, createBlankProject, createScene } from "../src/core";
import { proposalSchema, validateProposal } from "../server/ai";

describe("reviewed structural AI proposals", () => {
  test("schema exposes new scenes and a complete original sequence applies atomically", () => {
    expect(JSON.stringify(proposalSchema)).toContain('"const":"add-scene"');
    const project = createBlankProject("new-film");
    const first = createScene(
      "title",
      "opening",
      project.locales,
      project.ratios,
    );
    const last = createScene(
      "closing",
      "invitation",
      project.locales,
      project.ratios,
    );
    const proposal = validateProposal(
      {
        summary: "An original two-scene film",
        operations: [
          { type: "add-scene", scene: first },
          { type: "add-scene", scene: last },
          { type: "remove-scene", sceneId: project.scenes[0].id },
        ],
      },
      project,
    );
    expect(project.scenes).toHaveLength(1);
    const applied = applyTransaction(project, {
      id: proposal.id,
      baseRevision: proposal.baseRevision,
      operations: proposal.operations,
      actor: "ai",
    });
    expect(applied.applied).toBe(true);
    expect(applied.project.scenes.map((s) => s.id)).toEqual([
      "opening",
      "invitation",
    ]);
  });
  test("AI scene removal cannot erase a human layout and cannot partially add content", () => {
    const project = createBlankProject("protected-film");
    project.scenes = [
      createScene("title", "protected", project.locales, project.ratios),
    ];
    project.scenes[0].nodes[0].overrides!["9:16"]!.protected = true;
    const proposal = validateProposal(
      {
        summary: "Blocked deletion",
        operations: [
          {
            type: "add-scene",
            scene: createScene(
              "quote",
              "added",
              project.locales,
              project.ratios,
            ),
          },
          { type: "remove-scene", sceneId: "protected" },
        ],
      },
      project,
    );
    const result = applyTransaction(project, {
      id: proposal.id,
      baseRevision: 0,
      actor: "ai",
      operations: proposal.operations,
    });
    expect(result.applied).toBe(false);
    expect(result.project).toEqual(project);
    expect(result.conflicts[0].code).toBe("protected-layout");
  });
});
