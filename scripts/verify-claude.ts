import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { demoProject } from "../examples/demo.ts";
import { applyTransaction, compileProject } from "../src/core";
import { propose } from "../server/ai";

const manual = applyTransaction(demoProject, {
  id: "manual-live-proof",
  baseRevision: 0,
  actor: "human",
  operations: [
    {
      type: "set-layout",
      nodeId: "intro-orbit",
      ratio: "9:16",
      layout: { y: 49, height: 35 },
    },
  ],
});
assert(manual.applied);
const project = manual.project;
const protectedBefore = JSON.stringify(
  project.scenes[0].nodes.find((n) => n.id === "intro-orbit")!.overrides,
);
const outroBefore = JSON.stringify(project.scenes[2]);
const response = await propose(
  project,
  'Make exactly these edits: set the English intro-headline to "A little more\\npossible together."; set shared brand accent to #9ff2cb; extend only the Turkish sentence-features duration to 9 seconds. Preserve all layouts, all other text, and the entire outro.',
);
const result = applyTransaction(project, {
  id: response.proposal.id,
  baseRevision: response.proposal.baseRevision,
  operations: response.proposal.operations,
  actor: "ai",
});
assert(result.applied, JSON.stringify(result.conflicts));
assert.equal(
  JSON.stringify(
    result.project.scenes[0].nodes.find((n) => n.id === "intro-orbit")!
      .overrides,
  ),
  protectedBefore,
);
assert.equal(JSON.stringify(result.project.scenes[2]), outroBefore);
assert.equal(result.project.brand.accent, "#9ff2cb");
assert.equal(result.project.scenes[1].sentences[0].duration.tr, 9);
assert.equal(
  compileProject(result.project, "en", "16:9").duration,
  compileProject(project, "en", "16:9").duration,
);
assert.notEqual(
  result.project.scenes[0].nodes.find((n) => n.id === "intro-headline")!.content
    .en,
  demoProject.scenes[0].nodes.find((n) => n.id === "intro-headline")!.content
    .en,
);
const report = {
  verifiedAt: new Date().toISOString(),
  provider: response.provider,
  realProviderCall: true,
  checks: {
    manualPortraitLayoutPreserved: true,
    outroPreserved: true,
    englishDurationUnchanged: true,
    turkishDurationUpdated: true,
    brandUpdated: true,
    headlineUpdated: true,
  },
  proposal: response.proposal,
};
await mkdir("docs/verification", { recursive: true });
await writeFile(
  "docs/verification/claude-live.json",
  JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify(report, null, 2));
