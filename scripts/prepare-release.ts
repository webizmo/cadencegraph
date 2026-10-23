import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdir,
  readFile,
  writeFile,
  copyFile,
  readdir,
} from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseProject } from "../src/core";
import { renderProject } from "./render";
const git = (...args: string[]) =>
  execFileSync("git", args, { encoding: "utf8" }).trim();
assert.equal(
  git("status", "--porcelain", "--untracked-files=normal"),
  "",
  "Commit all source changes before preparing a release.",
);
const sourceCommit = git("rev-parse", "HEAD");
const { version } = JSON.parse(await readFile("package.json", "utf8"));
assert.match(version, /^\d+\.\d+\.\d+(?:-[\w.]+)?$/);
const dir = join("outputs", "releases", `v${version}`);
await mkdir(dir, { recursive: true });
assert.equal(
  (await readdir(dir)).length,
  0,
  "Release directory must be empty; preserve or move the previous package before retrying.",
);
const production = JSON.parse(
  await readFile("outputs/production/production-verification.json", "utf8"),
);
assert.equal(production.version, version);
assert.equal(
  production.sourceClean,
  true,
  "Production evidence must come from a clean checkout.",
);
assert.equal(
  production.sourceCommit,
  sourceCommit,
  "Run npm run verify:production for this commit first.",
);
const source = "examples/community-garden.cadence.json";
const bytes = await readFile(source);
const project = parseProject(JSON.parse(bytes.toString()));
await copyFile(source, join(dir, "community-garden.cadence.json"));
const outputs = [];
for (const locale of project.locales)
  for (const ratio of project.ratios) {
    const name = `garden-${locale}-${ratio.replace(":", "x")}.mp4`;
    console.log(`Rendering ${name}`);
    const report = await renderProject(
      project,
      locale,
      ratio,
      join(dir, name),
      { fps: 24 },
    );
    assert.equal(report.inspections.flatMap((i) => i.issues).length, 0);
    execFileSync(
      "ffmpeg",
      ["-v", "error", "-xerror", "-i", join(dir, name), "-f", "null", "-"],
      { stdio: "pipe" },
    );
    outputs.push({
      file: name,
      locale,
      ratio,
      width: report.width,
      height: report.height,
      duration: report.duration,
      frames: report.frames,
      fps: report.fps,
      fullDecode: true,
    });
  }
for (const name of [
  "production-verification.json",
  "production-export.mp4",
  "production-export.poster.png",
  "production-export.report.json",
  "studio-desktop.png",
  "studio-mobile.png",
])
  await copyFile(join("outputs/production", name), join(dir, name));
const archive = `cadencegraph-v${version}.tar.gz`;
execFileSync("git", [
  "archive",
  "--format=tar.gz",
  `--prefix=cadencegraph-v${version}/`,
  `--output=${resolve(dir, archive)}`,
  sourceCommit,
]);
const assets = [];
for (const name of (await readdir(dir)).sort()) {
  const content = await readFile(join(dir, name));
  assets.push({
    file: name,
    bytes: content.length,
    sha256: createHash("sha256").update(content).digest("hex"),
  });
}
await writeFile(
  join(dir, "release-manifest.json"),
  JSON.stringify(
    {
      version,
      sourceCommit,
      preparedAt: new Date().toISOString(),
      source: {
        file: source,
        sha256: createHash("sha256").update(bytes).digest("hex"),
      },
      outputs,
      assets,
      provider:
        "No new live-provider call; historical alpha.5 evidence remains in docs/verification/authoring-ai.json.",
    },
    null,
    2,
  ) + "\n",
);
const sums = [];
for (const name of (await readdir(dir)).sort())
  sums.push(
    `${createHash("sha256")
      .update(await readFile(join(dir, name)))
      .digest("hex")}  ${name}`,
  );
await writeFile(join(dir, "SHA256SUMS"), sums.join("\n") + "\n");
console.log(`Prepared ${dir}. Verify with npm run release:verify -- ${dir}`);
