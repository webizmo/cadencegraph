import { spawn, execFileSync, type ChildProcess } from "node:child_process";
import {
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
  rm,
  copyFile,
  realpath,
} from "node:fs/promises";
import { dirname, join, resolve, relative, isAbsolute } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { once } from "node:events";
import { chromium } from "playwright";
import { createServer, type ViteDevServer } from "vite";
import {
  compileProject,
  validateVariant,
  parseProject,
  type AspectRatio,
  type Project,
} from "../src/core/index";
import { demoProject } from "../examples/demo.ts";
import { writeScore } from "./generate-audio";
import type { OutputInspection } from "../src/render/RenderPage";

export interface RenderOptions {
  baseUrl?: string;
  onProgress?: (progress: number) => void;
  width?: number;
  fps?: number;
  score?: boolean;
  quality?: number;
  signal?: AbortSignal;
}
export interface RenderReport {
  projectId: string;
  revision: number;
  locale: string;
  ratio: AspectRatio;
  width: number;
  height: number;
  fps: number;
  frames: number;
  duration: number;
  audio: {
    score: boolean;
    scoreGain: number;
    sentenceTracks: number;
    note: string;
  };
  inspections: OutputInspection[];
  preflight: ReturnType<typeof validateVariant>;
  output: string;
  ffprobe: unknown;
  renderedAt: string;
}
async function waitProcess(child: ChildProcess) {
  const [code] = await once(child, "close");
  if (code !== 0) throw new Error(`Process exited with code ${code}.`);
}
function probe(path: string) {
  return JSON.parse(
    execFileSync(
      "ffprobe",
      ["-v", "error", "-show_streams", "-show_format", "-of", "json", path],
      { encoding: "utf8", maxBuffer: 4 * 1024 * 1024 },
    ),
  );
}
async function localAssetPath(src: string) {
  if (/^https?:|^data:|^blob:/i.test(src))
    throw new Error(
      "Export accepts local project assets only. Import remote assets first.",
    );
  const path = resolve("public", src.replace(/^\//, ""));
  const rel = relative(resolve("public"), path);
  if (rel.startsWith("..") || isAbsolute(rel))
    throw new Error("Asset path escapes public/.");
  const actual = await realpath(path),
    root = await realpath(resolve("public"));
  if (!actual.startsWith(root + "/"))
    throw new Error("Asset resolves outside public/.");
  return actual;
}
function tempoChain(speed: number) {
  const rates: number[] = [];
  while (speed > 2) {
    rates.push(2);
    speed /= 2;
  }
  while (speed < 0.5) {
    rates.push(0.5);
    speed /= 0.5;
  }
  rates.push(speed);
  return rates.map((n) => `atempo=${n.toFixed(6)}`).join(",");
}

/** The same React composition drives browser preview and MP4. No remote renderer. */
export async function renderProject(
  input: Project,
  locale: string,
  ratio: AspectRatio,
  outputPath: string,
  options: RenderOptions = {},
): Promise<RenderReport> {
  execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
  execFileSync("ffprobe", ["-version"], { stdio: "ignore" });
  const project = parseProject(input),
    compiled = compileProject(project, locale, ratio),
    preflight = validateVariant(project, locale, ratio);
  for (const asset of project.assets) await localAssetPath(asset.src);
  if (preflight.some((i) => i.severity === "error"))
    throw new Error(
      `Variant preflight failed: ${preflight
        .filter((i) => i.severity === "error")
        .map((i) => i.message)
        .join("; ")}`,
    );
  const fps = options.fps ?? compiled.fps,
    width = options.width ?? (ratio === "16:9" ? 1280 : 720),
    height = Math.round((width * compiled.height) / compiled.width / 2) * 2;
  if (
    !Number.isInteger(fps) ||
    fps < 1 ||
    fps > 60 ||
    !Number.isInteger(width) ||
    width < 320 ||
    width > 3840 ||
    width % 2
  )
    throw new Error("Render size/fps outside supported limits.");
  const frames = Math.ceil(compiled.duration * fps),
    temp = await mkdtemp(join(tmpdir(), "cadencegraph-render-"));
  await mkdir(dirname(resolve(outputPath)), { recursive: true });
  let server: ViteDevServer | undefined,
    browser: Awaited<ReturnType<typeof chromium.launch>> | undefined,
    encoder: ChildProcess | undefined;
  let encoderLog = "";
  try {
    let baseUrl = options.baseUrl;
    if (!baseUrl) {
      server = await createServer({
        server: { host: "127.0.0.1", port: 0 },
        logLevel: "error",
      });
      await server.listen();
      const addr = server.httpServer?.address();
      if (!addr || typeof addr === "string")
        throw new Error("Preview server did not start.");
      baseUrl = `http://127.0.0.1:${addr.port}`;
    }
    browser = await chromium.launch({
      headless: true,
      args: ["--font-render-hinting=none"],
    });
    const page = await browser.newPage({
      viewport: { width, height },
      deviceScaleFactor: 1,
    });
    const browserErrors: string[] = [];
    page.on("pageerror", (error) => browserErrors.push(error.message));
    await page.route("**/*", (route) => {
      const url = new URL(route.request().url());
      if (
        !["http:", "https:"].includes(url.protocol) ||
        url.origin === new URL(baseUrl!).origin
      )
        return route.continue();
      return route.abort("blockedbyclient");
    });
    await page.goto(
      `${baseUrl}/?render=1&locale=${encodeURIComponent(locale)}&ratio=${encodeURIComponent(ratio)}`,
      { waitUntil: "networkidle" },
    );
    await page.waitForFunction(() => !!window.__CADENCE_RENDER__, {
      timeout: 30000,
    });
    await page.evaluate(
      async ({ project, locale, ratio }) => {
        await window.__CADENCE_RENDER__!.setProject(project, locale, ratio);
      },
      { project, locale, ratio },
    );
    const inspections: OutputInspection[] = [];
    // Measure every active node at a settled point, then inspect output repeatedly during capture.
    const sampleTimes = new Set(
      compiled.scenes.flatMap((s) => [
        s.start + Math.min(1.8, s.duration * 0.4),
        s.start + s.duration * 0.65,
      ]),
    );
    for (const scene of compiled.scenes)
      for (const node of scene.nodes)
        sampleTimes.add(
          Math.min(
            node.end - 0.26,
            node.start + (node.animation?.delay ?? 0) + 0.9,
          ),
        );
    for (const time of [...sampleTimes].sort((a, b) => a - b)) {
      if (time < 0) continue;
      await page.evaluate(
        async (t) => window.__CADENCE_RENDER__!.seek(t),
        time,
      );
      inspections.push(
        await page.evaluate(() => window.__CADENCE_RENDER__!.inspect()),
      );
    }
    const outputIssues = inspections.flatMap((i) => i.issues);
    if (outputIssues.length)
      throw new Error(
        `Rendered output preflight failed: ${outputIssues.map((i) => `${i.nodeId ?? "canvas"}: ${i.message}`).join("; ")}`,
      );
    const silentPath = join(temp, "silent.mp4");
    encoder = spawn(
      "ffmpeg",
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-f",
        "image2pipe",
        "-framerate",
        String(fps),
        "-vcodec",
        "mjpeg",
        "-i",
        "pipe:0",
        "-an",
        "-c:v",
        "libx264",
        "-preset",
        "fast",
        "-crf",
        "19",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        silentPath,
      ],
      { stdio: ["pipe", "ignore", "pipe"] },
    );
    encoder.stderr?.on("data", (chunk) => {
      encoderLog += chunk.toString();
    });
    const encodeDone = waitProcess(encoder).then(
      () => ({ ok: true as const }),
      (error) => ({ ok: false as const, error }),
    );
    encoder.stdin!.on("error", () => {});
    for (let frame = 0; frame < frames; frame++) {
      if (options.signal?.aborted) throw new Error("Render cancelled.");
      const time = frame / fps;
      await page.evaluate(
        async (t) => window.__CADENCE_RENDER__!.seek(t),
        time,
      );
      if (frame % fps === 0) {
        const inspection = await page.evaluate(() =>
          window.__CADENCE_RENDER__!.inspect(),
        );
        inspections.push(inspection);
        if (inspection.issues.length)
          throw new Error(
            `Output validation failed at ${time.toFixed(3)}s: ${JSON.stringify(inspection.issues)}`,
          );
      }
      const pixels = await page.screenshot({
        type: "jpeg",
        quality: options.quality ?? 92,
        animations: "disabled",
      });
      if (!encoder.stdin!.write(pixels))
        await Promise.race([
          once(encoder.stdin!, "drain"),
          encodeDone.then((result) => {
            throw new Error(
              result.ok
                ? "Encoder closed before all frames were written."
                : String(result.error),
            );
          }),
        ]);
      if (frame === Math.min(Math.round(fps * 2), Math.floor(frames / 2)))
        await page.screenshot({
          path: outputPath.replace(/\.mp4$/i, "") + ".poster.png",
          type: "png",
        });
      options.onProgress?.(((frame + 1) / frames) * 0.92);
    }
    encoder.stdin!.end();
    const encoded = await encodeDone;
    if (!encoded.ok) throw encoded.error;
    encoder = undefined;
    if (browserErrors.length)
      throw new Error(`Browser errors: ${browserErrors.join("; ")}`);
    const scoreGain =
      options.score === false
        ? 0
        : compiled.scenes.some((scene) =>
              scene.sentences.some((sentence) => sentence.audioAssetId),
            )
          ? 0.55
          : 2.2;
    const audioInputs: string[] = [],
      filters: string[] = [],
      mixLabels: string[] = [];
    let idx = 1;
    if (options.score !== false) {
      const score = join(temp, "score.wav");
      await writeScore(score, frames / fps);
      audioInputs.push("-i", score);
      filters.push(`[${idx}:a]volume=${scoreGain}[score]`);
      mixLabels.push("[score]");
      idx++;
    }
    let sentenceTracks = 0;
    for (const sentence of compiled.scenes
      .flatMap((s) => s.sentences)
      .filter((s) => s.audioAssetId)) {
      const asset = compiled.assets.find(
        (a) => a.id === sentence.audioAssetId && a.type === "audio",
      );
      if (!asset)
        throw new Error(`Missing sentence audio ${sentence.audioAssetId}`);
      const path = await localAssetPath(asset.src),
        media = probe(path),
        duration = Number(media.format?.duration);
      if (!Number.isFinite(duration) || duration <= 0)
        throw new Error(`Cannot measure audio duration: ${asset.id}`);
      audioInputs.push("-i", path);
      const label = `voice${sentenceTracks}`;
      filters.push(
        `[${idx}:a]${tempoChain(duration / sentence.duration)},atrim=duration=${sentence.duration},asetpts=PTS-STARTPTS,adelay=${Math.round(sentence.start * 1000)}:all=1[${label}]`,
      );
      mixLabels.push(`[${label}]`);
      idx++;
      sentenceTracks++;
    }
    if (audioInputs.length) {
      filters.push(
        `${mixLabels.join("")}amix=inputs=${mixLabels.length}:duration=longest:normalize=0,alimiter=limit=0.95[audio]`,
      );
      execFileSync(
        "ffmpeg",
        [
          "-hide_banner",
          "-loglevel",
          "error",
          "-y",
          "-i",
          silentPath,
          ...audioInputs,
          "-filter_complex",
          filters.join(";"),
          "-map",
          "0:v",
          "-map",
          "[audio]",
          "-c:v",
          "copy",
          "-c:a",
          "aac",
          "-b:a",
          "192k",
          "-t",
          String(frames / fps),
          "-movflags",
          "+faststart",
          resolve(outputPath),
        ],
        { maxBuffer: 8 * 1024 * 1024 },
      );
    } else await copyFile(silentPath, resolve(outputPath));
    const metadata = probe(resolve(outputPath));
    if (metadata.format)
      metadata.format.filename = outputPath.split("/").at(-1);
    const video = metadata.streams.find(
      (s: { codec_type: string }) => s.codec_type === "video",
    );
    if (
      video?.width !== width ||
      video?.height !== height ||
      Math.abs(Number(metadata.format.duration) - frames / fps) > 0.12
    )
      throw new Error(
        "Encoded video dimensions or duration do not match the requested variant.",
      );
    const report: RenderReport = {
      projectId: project.id,
      revision: project.revision,
      locale,
      ratio,
      width,
      height,
      fps,
      frames,
      duration: frames / fps,
      audio: {
        score: options.score !== false,
        scoreGain,
        sentenceTracks,
        note: sentenceTracks
          ? "Original synthesized score mixed with user-supplied sentence audio, fitted to sentence duration."
          : "Original synthesized score. No spoken narration in this demo.",
      },
      inspections,
      preflight,
      output: outputPath.split("/").at(-1)!,
      ffprobe: metadata,
      renderedAt: new Date().toISOString(),
    };
    await writeFile(
      outputPath.replace(/\.mp4$/i, "") + ".report.json",
      JSON.stringify(report, null, 2) + "\n",
    );
    options.onProgress?.(1);
    return report;
  } catch (error) {
    throw new Error(
      `${error instanceof Error ? error.message : String(error)}${encoderLog ? `\nFFmpeg: ${encoderLog}` : ""}`,
    );
  } finally {
    encoder?.kill("SIGTERM");
    await browser?.close();
    await server?.close();
    await rm(temp, { recursive: true, force: true });
  }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2),
    get = (key: string) => args[args.indexOf(key) + 1],
    project = args.includes("--project")
      ? parseProject(
          JSON.parse(await readFile(resolve(get("--project")), "utf8")),
        )
      : demoProject;
  const variants = args.includes("--all")
    ? project.locales.flatMap((locale) =>
        project.ratios.map((ratio) => ({ locale, ratio })),
      )
    : [
        {
          locale: args.includes("--locale")
            ? get("--locale")
            : project.locales[0],
          ratio: (args.includes("--ratio")
            ? get("--ratio")
            : project.ratios[0]) as AspectRatio,
        },
      ];
  for (const { locale, ratio } of variants) {
    const output =
      args.includes("--output") && variants.length === 1
        ? get("--output")
        : `outputs/cadencegraph-${locale}-${ratio.replace(":", "x")}.mp4`;
    console.log(`Rendering ${locale} ${ratio} → ${output}`);
    let last = -1;
    const report = await renderProject(project, locale, ratio, output, {
      width: args.includes("--width") ? Number(get("--width")) : undefined,
      fps: args.includes("--fps") ? Number(get("--fps")) : undefined,
      score: !args.includes("--no-score"),
      onProgress: (p) => {
        const n = Math.floor(p * 10);
        if (n !== last) {
          last = n;
          console.log(`${Math.round(p * 100)}%`);
        }
      },
    });
    console.log(
      `Verified ${report.frames} frames, ${report.width}×${report.height}, ${report.duration.toFixed(2)}s; ${report.inspections.length} output checks.`,
    );
  }
}
