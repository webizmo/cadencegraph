import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
const report = JSON.parse(
  await readFile("docs/verification/authoring-acceptance.json", "utf8"),
);
await mkdir("outputs/authoring/frames", { recursive: true });
for (const output of [...report.outputs, report.studioExport]) {
  const name = output.filename || output.file;
  const path = `outputs/authoring/${name}`;
  const bytes = await readFile(path);
  assert.equal(createHash("sha256").update(bytes).digest("hex"), output.sha256);
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
  assert(["yuv420p", "yuvj420p"].includes(video.pix_fmt));
  assert.equal(video.width, output.width || 1280);
  assert.equal(video.height, output.height || 720);
  assert(
    Math.abs(Number(metadata.format.duration) - (output.duration || 12)) < 0.05,
  );
  execFileSync(
    "ffmpeg",
    ["-hide_banner", "-v", "error", "-i", path, "-f", "null", "-"],
    { stdio: "pipe" },
  );
  output.decodedWithoutErrors = true;
  if (output.realUiAndApi) {
    output.width = video.width;
    output.height = video.height;
    output.duration = Number(metadata.format.duration);
    output.videoCodec = video.codec_name;
    output.audioCodec = audio.codec_name;
  }
  if (output.filename) {
    const time = output.duration === 12 ? "1.5,4.5,7.5,10.5" : "1.5,5,9,13";
    for (const [i, t] of time.split(",").entries())
      execFileSync("ffmpeg", [
        "-hide_banner",
        "-v",
        "error",
        "-y",
        "-ss",
        t,
        "-i",
        path,
        "-frames:v",
        "1",
        `outputs/authoring/frames/${name.replace(".mp4", "")}-${i}.png`,
      ]);
  }
}
report.mediaDecodeVerifiedAt = new Date().toISOString();
await writeFile(
  "docs/verification/authoring-acceptance.json",
  JSON.stringify(report, null, 2) + "\n",
);
console.log(
  "Five H.264/AAC MP4 hashes, dimensions, durations and full decodes passed; 16 scene frames extracted.",
);
