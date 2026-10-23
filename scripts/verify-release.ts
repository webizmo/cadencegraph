import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { basename, join } from "node:path";
const dir = process.argv[2];
assert(dir, "Usage: npm run release:verify -- outputs/releases/v<VERSION>");
const sums = (await readFile(join(dir, "SHA256SUMS"), "utf8"))
  .trim()
  .split("\n");
const names = new Set<string>();
for (const line of sums) {
  const match = /^([a-f0-9]{64})  (.+)$/.exec(line);
  assert(match, `Invalid checksum: ${line}`);
  const [, expected, name] = match;
  assert.equal(name, basename(name));
  assert(!names.has(name), `Duplicate checksum: ${name}`);
  names.add(name);
  assert.equal(
    createHash("sha256")
      .update(await readFile(join(dir, name)))
      .digest("hex"),
    expected,
    `Checksum mismatch: ${name}`,
  );
}
assert.deepEqual((await readdir(dir)).sort(), [...names, "SHA256SUMS"].sort());
const manifest = JSON.parse(
  await readFile(join(dir, "release-manifest.json"), "utf8"),
);
assert.equal(manifest.outputs.length, 4);
assert.deepEqual(
  manifest.assets.map((a: { file: string }) => a.file).sort(),
  [...names].filter((n) => n !== "release-manifest.json").sort(),
);
assert.equal(
  createHash("sha256")
    .update(await readFile(join(dir, "community-garden.cadence.json")))
    .digest("hex"),
  manifest.source.sha256,
);
assert.equal(
  new Set(
    manifest.outputs.map(
      (o: { locale: string; ratio: string }) => `${o.locale}/${o.ratio}`,
    ),
  ).size,
  4,
);
for (const asset of manifest.assets) {
  const bytes = await readFile(join(dir, asset.file));
  assert.equal(bytes.length, asset.bytes);
  assert.equal(createHash("sha256").update(bytes).digest("hex"), asset.sha256);
}
const production = JSON.parse(
  await readFile(join(dir, "production-verification.json"), "utf8"),
);
assert.equal(production.sourceCommit, manifest.sourceCommit);
assert.equal(production.version, manifest.version);
assert.equal(production.sourceClean, true);
assert(Object.values(production.checks).every((v) => v === true));
for (const output of [...manifest.outputs, production.output]) {
  assert(names.has(output.file));
  const report = JSON.parse(
    await readFile(
      join(dir, output.file.replace(/\.mp4$/, ".report.json")),
      "utf8",
    ),
  );
  assert.equal(
    report.inspections.flatMap((i: { issues: unknown[] }) => i.issues).length,
    0,
  );
  assert.equal(report.frames, output.frames);
  assert.equal(report.width, output.width);
  assert.equal(report.height, output.height);
  const path = join(dir, output.file);
  const metadata = JSON.parse(
    execFileSync(
      "ffprobe",
      ["-v", "error", "-show_streams", "-show_format", "-of", "json", path],
      { encoding: "utf8" },
    ),
  );
  const video = metadata.streams.find(
    (s: { codec_type: string }) => s.codec_type === "video",
  );
  const audio = metadata.streams.find(
    (s: { codec_type: string }) => s.codec_type === "audio",
  );
  assert.equal(video.codec_name, "h264");
  assert.equal(audio.codec_name, "aac");
  assert.equal(video.width, output.width);
  assert.equal(video.height, output.height);
  assert.equal(Number(video.nb_frames), output.frames);
  assert(Math.abs(Number(metadata.format.duration) - output.duration) < 0.12);
  execFileSync(
    "ffmpeg",
    ["-v", "error", "-xerror", "-i", path, "-f", "null", "-"],
    { stdio: "pipe" },
  );
}
console.log(
  `Verified v${manifest.version}, ${manifest.sourceCommit}, ${names.size} checksummed assets and five fully decoded H.264/AAC MP4s.`,
);
