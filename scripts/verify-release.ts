import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile, writeFile, mkdir, copyFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { chromium } from "playwright";
const sha = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const outputs = [];
try {
  for (const kind of ["cadencegraph", "revised"])
    for (const locale of ["en", "tr"])
      for (const ratio of ["16x9", "9x16"]) {
        const name = `${kind}-${locale}-${ratio}`;
        const report = JSON.parse(
          await readFile(`outputs/${name}.report.json`, "utf8"),
        );
        const metadata = JSON.parse(
          execFileSync(
            "ffprobe",
            [
              "-v",
              "error",
              "-show_streams",
              "-show_format",
              "-of",
              "json",
              `outputs/${name}.mp4`,
            ],
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
        assert.equal(video.width, ratio === "16x9" ? 1280 : 720);
        assert.equal(video.height, ratio === "16x9" ? 720 : 1280);
        assert.equal(Number(video.nb_frames), report.frames);
        assert(
          Math.abs(Number(metadata.format.duration) - report.duration) < 0.12,
        );
        assert(report.inspections.length > 20);
        assert.equal(
          report.inspections.flatMap((i: { issues: unknown[] }) => i.issues)
            .length,
          0,
        );
        const url = `http://127.0.0.1:5173/outputs/${name}.mp4`;
        await page.goto(url);
        await page.waitForFunction(
          () => {
            const v = document.querySelector("video");
            return !!v && v.readyState >= 2;
          },
          { timeout: 15000 },
        );
        const playback = await page.evaluate(async () => {
          const v = document.querySelector("video")!;
          v.muted = true;
          v.currentTime = Math.min(8, v.duration / 2);
          await v.play();
          await new Promise((r) => setTimeout(r, 150));
          v.pause();
          return {
            width: v.videoWidth,
            height: v.videoHeight,
            duration: v.duration,
            time: v.currentTime,
            error: v.error?.message ?? null,
          };
        });
        assert.equal(playback.error, null);
        assert.equal(playback.width, video.width);
        assert(playback.time > 0);
        const source =
          kind === "cadencegraph"
            ? "examples/demo.json"
            : "examples/revised-demo.json";
        const bytes = await readFile(`outputs/${name}.mp4`);
        outputs.push({
          file: `${name}.mp4`,
          bytes: bytes.length,
          sha256: sha(bytes),
          source,
          sourceSha256: sha(await readFile(source)),
          revision: report.revision,
          locale,
          ratio: report.ratio,
          width: video.width,
          height: video.height,
          fps: report.fps,
          frames: report.frames,
          duration: report.duration,
          videoCodec: video.codec_name,
          audioCodec: audio.codec_name,
          inspectionCount: report.inspections.length,
          inspectionIssues: 0,
          chromiumPlaybackVerified: true,
          sentenceTracks: report.audio.sentenceTracks,
        });
        await mkdir("docs/verification/demos", { recursive: true });
        await copyFile(
          `outputs/${name}.report.json`,
          `docs/verification/demos/${name}.report.json`,
        );
      }
} finally {
  await browser.close();
}
const unit = await readFile(".local/vitest-results.json", "utf8")
  .then(JSON.parse)
  .catch(() => null);
const e2e = await readFile("test-results/e2e-results.json", "utf8")
  .then(JSON.parse)
  .catch(() => null);
const audit = await readFile(".local/audit.json", "utf8")
  .then(JSON.parse)
  .catch(() => null);
await writeFile(
  "docs/verification/release-verification.json",
  JSON.stringify(
    {
      verifiedAt: new Date().toISOString(),
      version: "0.1.0-alpha.1",
      unitAndIntegrationTests: unit?.numPassedTests ?? null,
      browserTests: e2e?.stats?.expected ?? null,
      dependencyAuditVulnerabilities:
        audit?.metadata?.vulnerabilities?.total ?? null,
      outputs,
    },
    null,
    2,
  ) + "\n",
);
await writeFile(
  "outputs/SHA256SUMS",
  outputs.map((o) => `${o.sha256}  ${o.file}`).join("\n") + "\n",
);
console.log(
  `Verified ${outputs.length} real H.264/AAC outputs, hashes, frame counts, zero recorded layout issues and actual browser playback.`,
);
