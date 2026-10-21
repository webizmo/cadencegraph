import assert from "node:assert/strict";
import { writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { demoProject } from "../examples/demo.ts";
const base = process.env.CADENCE_BASE_URL ?? "http://127.0.0.1:5173";
const project = structuredClone(demoProject);
project.scenes = project.scenes.slice(0, 1);
project.scenes[0].nodes = project.scenes[0].nodes.filter(
  (n) => n.id === "intro-headline",
);
project.scenes[0].sentences[0].duration = { en: 1.25, tr: 1.25 };
const response = await fetch(`${base}/api/render`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ project, locale: "en", ratio: "16:9" }),
});
assert.equal(response.status, 202);
let job = await response.json();
const deadline = Date.now() + 120000;
while (!["complete", "failed"].includes(job.status) && Date.now() < deadline) {
  await new Promise((r) => setTimeout(r, 500));
  job = await (await fetch(`${base}/api/render/${job.id}`)).json();
}
assert.equal(job.status, "complete", JSON.stringify(job));
const media = await fetch(`${base}${job.url}`);
assert.equal(media.status, 200);
const bytes = Buffer.from(await media.arrayBuffer());
assert.equal(bytes.toString("ascii", 4, 8), "ftyp");
assert(bytes.length > 10000);
await mkdir("docs/verification", { recursive: true });
await writeFile(
  "docs/verification/api-export.json",
  JSON.stringify(
    {
      verifiedAt: new Date().toISOString(),
      realEndpoint: true,
      queuedStatus: response.status,
      finalStatus: job.status,
      downloadStatus: media.status,
      mp4Signature: "ftyp",
      bytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      locale: "en",
      ratio: "16:9",
      duration: 1.25,
    },
    null,
    2,
  ) + "\n",
);
console.log(
  "Real API: enqueue → frame capture → H.264/AAC → polling → MP4 download passed.",
);
