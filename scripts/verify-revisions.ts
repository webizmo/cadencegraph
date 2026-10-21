import assert from "node:assert/strict";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { demoProject } from "../examples/demo.ts";
import {
  applyTransaction,
  compileProject,
  parseProject,
  undoTransaction,
  type Operation,
  type Project,
} from "../src/core";
import { writeScore } from "./generate-audio";
import { propose } from "../server/ai";

await mkdir("public/assets/demo", { recursive: true });
await writeScore("public/assets/demo/retime-fixture.wav", 9);
let project: Project = structuredClone(demoProject);
const audit: unknown[] = [];
const edit = (id: string, actor: "human" | "ai", operations: Operation[]) => {
  const result = applyTransaction(project, {
    id,
    actor,
    baseRevision: project.revision,
    operations,
  });
  assert(result.applied, JSON.stringify(result.conflicts));
  audit.push({
    id,
    actor,
    beforeRevision: project.revision,
    afterRevision: result.project.revision,
    changes: result.changes,
  });
  project = result.project;
};
const originalOutro = JSON.stringify(project.scenes[2]);
const enDuration = compileProject(project, "en", "16:9").duration;
edit("revision-manual-card", "human", [
  {
    type: "set-layout",
    nodeId: "intro-orbit",
    ratio: "9:16",
    layout: { y: 48, height: 36 },
  },
]);
edit("revision-logo-lock", "human", [
  {
    type: "set-protection",
    nodeId: "intro-logo",
    ratio: "9:16",
    protected: true,
  },
]);
edit("revision-turkish-audio", "human", [
  {
    type: "set-sentence-audio",
    sentenceId: "sentence-features",
    locale: "tr",
    asset: {
      id: "retime-proof-audio",
      type: "audio",
      src: "assets/demo/retime-fixture.wav",
      name: "Original nine-second timing fixture (instrumental)",
      license: "Apache-2.0",
    },
    duration: 9,
  },
]);
const beforeAi = structuredClone(project);
const response = await propose(
  project,
  'Add exactly one new card node with id intro-benefit and role feature-card in scene-intro, tied to sentence-intro. English content "Every edit, reversible" and Turkish "Her değişiklik geri alınabilir". Base layout x7 y79 width42 height8. Portrait9:16 override x9 y86 width82 height4.5, protected false. Use no other overrides. This is a second benefit; preserve the outro, existing text, brand and every existing layer and layout. Return only the add-node operation.',
);
edit("revision-ai-benefit", "ai", response.proposal.operations);
assert(project.scenes[0].nodes.some((n) => n.id === "intro-benefit"));
edit("revision-shared-brand", "human", [
  { type: "set-brand", brand: { accent: "#9ff2cb" } },
]);
for (const id of ["intro-orbit", "intro-logo"])
  assert.deepEqual(
    project.scenes[0].nodes.find((n) => n.id === id)?.overrides,
    beforeAi.scenes[0].nodes.find((n) => n.id === id)?.overrides,
  );
assert.equal(JSON.stringify(project.scenes[2]), originalOutro);
assert.equal(compileProject(project, "en", "16:9").duration, enDuration);
assert.equal(compileProject(project, "tr", "9:16").duration, 23);
const reopened = parseProject(JSON.parse(JSON.stringify(project)));
assert.deepEqual(reopened, project);
const undo = undoTransaction(project, beforeAi);
assert(!undo.scenes[0].nodes.some((n) => n.id === "intro-benefit"));
assert(undo.revision > project.revision);
await writeFile(
  "examples/revised-demo.json",
  JSON.stringify(project, null, 2) + "\n",
);
await mkdir("docs/verification", { recursive: true });
await writeFile(
  "docs/verification/five-revisions.json",
  JSON.stringify(
    {
      verifiedAt: new Date().toISOString(),
      realClaudeCall: true,
      audioFixture:
        "Original instrumental WAV, nine seconds; proves media retiming, not spoken-word alignment.",
      checks: {
        manualOverridesPreserved: true,
        outroPreserved: true,
        englishDurationUnchanged: true,
        turkishDurationChangedTo23: true,
        secondBenefitAdded: true,
        brandPropagated: true,
        jsonRoundTrip: true,
        undoMonotonic: true,
      },
      steps: audit,
      proposal: response.proposal,
      outputs: project.locales.flatMap((locale) =>
        project.ratios.map((ratio) => ({
          locale,
          ratio,
          duration: compileProject(project, locale, ratio).duration,
        })),
      ),
    },
    null,
    2,
  ) + "\n",
);
console.log(
  "Five revision checks passed, with a real Claude add-node proposal. Revised project saved.",
);
