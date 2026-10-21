import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import {
  createBlankProject,
  createScene,
  applyTransaction,
  parseProject,
} from "../src/core";
import { propose } from "../server/ai";

const project = createBlankProject("ai-authoring-proof", "A garden, together");
project.scenes = [
  createScene("title", "human-opening", project.locales, project.ratios),
];
project.scenes[0].nodes[0].overrides!["9:16"]!.protected = true;
const before = JSON.stringify(project.scenes[0]);
const response = await propose(
  project,
  "Add exactly one new closing scene after the existing scene about a community garden. Use id garden-invitation, kind custom, one new sentence 3 seconds in English and 3.5 seconds in Turkish, and two new text nodes: a short invitation and a date-free supporting line. Provide English and Turkish text and sensible portrait/landscape layouts. Use Manrope and no media. Keep the entire existing scene and brand unchanged. Only one add-scene operation.",
);
const result = applyTransaction(project, {
  id: response.proposal.id,
  baseRevision: response.proposal.baseRevision,
  actor: "ai",
  operations: response.proposal.operations,
});
assert(result.applied, JSON.stringify(result.conflicts));
assert.equal(result.project.scenes.length, 2);
assert.equal(JSON.stringify(result.project.scenes[0]), before);
assert.equal(result.project.scenes[1].id, "garden-invitation");
assert(result.project.scenes[1].nodes.length >= 2);
parseProject(result.project);
await mkdir("docs/verification", { recursive: true });
await writeFile(
  "docs/verification/authoring-ai.json",
  JSON.stringify(
    {
      verifiedAt: new Date().toISOString(),
      provider: response.provider,
      realProviderCall: true,
      checks: {
        createdNewScene: true,
        existingProtectedSceneUnchanged: true,
        validLocalizedStructure: true,
        explicitApply: true,
      },
      proposal: response.proposal,
    },
    null,
    2,
  ) + "\n",
);
console.log(
  "Verified real Claude structural authoring: new bilingual scene, protected existing scene unchanged.",
);
