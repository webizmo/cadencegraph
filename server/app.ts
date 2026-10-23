import express from "express";
import { randomUUID } from "node:crypto";
import { resolve, join } from "node:path";
import { mkdir } from "node:fs/promises";
import { parseProject } from "../src/core/index";
import { aiStatus, propose } from "./ai";
import { storeMedia } from "./media";
import { rendererStatus } from "./runtime";

export interface RenderJob {
  id: string;
  status: "queued" | "rendering" | "complete" | "failed";
  progress: number;
  url?: string;
  error?: string;
}
export function createApp(options: {
  baseUrl: string;
  outputDir?: string;
  ai?: typeof propose;
  status?: typeof aiStatus;
  rendererStatus?: typeof rendererStatus;
  render?: (
    project: ReturnType<typeof parseProject>,
    locale: string,
    ratio: "16:9" | "9:16",
    path: string,
    progress: (n: number) => void,
  ) => Promise<unknown>;
}) {
  const app = express();
  const jobs = new Map<string, RenderJob>();
  const outputDir = options.outputDir ?? resolve("outputs");
  let aiBusy = false;
  let renderBusy = false;
  app.disable("x-powered-by");
  app.use((req, res, next) => {
    const host = req.headers.host?.split(":")[0];
    if (!host || !["127.0.0.1", "localhost", "[::1]"].includes(host)) {
      res
        .status(403)
        .json({ error: "This server accepts localhost requests only." });
      return;
    }
    const origin = req.headers.origin;
    if (origin) {
      try {
        if (new URL(origin).host !== req.headers.host) throw new Error();
      } catch {
        res.status(403).json({ error: "Cross-origin requests are disabled." });
        return;
      }
    }
    if (req.method === "POST" && !req.is("application/json")) {
      res.status(415).json({ error: "Use application/json." });
      return;
    }
    res.setHeader("X-Content-Type-Options", "nosniff");
    next();
  });
  app.post("/api/media", express.json({ limit: "28mb" }), async (req, res) => {
    try {
      res.status(201).json(await storeMedia(req.body));
    } catch (error) {
      res.status(400).json({
        error:
          error instanceof Error ? error.message : "Unable to import media.",
      });
    }
  });
  app.use(express.json({ limit: "2mb" }));
  app.use(
    "/assets/uploads",
    express.static(resolve("public/assets/uploads"), {
      dotfiles: "deny",
      index: false,
    }),
  );
  app.get("/api/status", async (_req, res) => {
    const [ai, renderer] = await Promise.all([
      (options.status ?? aiStatus)(),
      (options.rendererStatus ?? rendererStatus)(),
    ]);
    res.json({ ai, renderer });
  });
  app.post("/api/ai", async (req, res) => {
    if (aiBusy) {
      res
        .status(429)
        .json({ error: "Another Claude proposal is running. Please wait." });
      return;
    }
    try {
      const project = parseProject(req.body.project);
      const prompt = req.body.prompt;
      if (
        typeof prompt !== "string" ||
        prompt.trim().length < 3 ||
        prompt.length > 5000
      )
        throw new Error("Enter a request between 3 and 5000 characters.");
      aiBusy = true;
      res.json(await (options.ai ?? propose)(project, prompt.trim()));
    } catch (error) {
      res.status(400).json({
        error: error instanceof Error ? error.message : "Invalid request.",
      });
    } finally {
      aiBusy = false;
    }
  });
  app.post("/api/render", async (req, res) => {
    if (renderBusy) {
      res.status(429).json({
        error: "An export is already running. Wait for it to finish.",
      });
      return;
    }
    try {
      const project = parseProject(req.body.project);
      const { locale, ratio } = req.body;
      if (!project.locales.includes(locale) || !project.ratios.includes(ratio))
        throw new Error("Choose a locale and ratio included in the project.");
      renderBusy = true;
      await mkdir(outputDir, { recursive: true });
      const id = randomUUID();
      const job: RenderJob = { id, status: "queued", progress: 0 };
      if (jobs.size >= 100) jobs.delete(jobs.keys().next().value!);
      jobs.set(id, job);
      renderBusy = true;
      res.status(202).json(job);
      void (async () => {
        try {
          job.status = "rendering";
          const progress = (n: number) => {
            job.progress = Math.max(0, Math.min(1, n));
          };
          if (options.render)
            await options.render(
              project,
              locale,
              ratio,
              join(outputDir, `${id}.mp4`),
              progress,
            );
          else {
            const { renderProject } = await import("../scripts/render");
            await renderProject(
              project,
              locale,
              ratio,
              join(outputDir, `${id}.mp4`),
              { baseUrl: options.baseUrl, onProgress: progress },
            );
          }
          Object.assign(job, {
            status: "complete",
            progress: 1,
            url: `/outputs/${id}.mp4`,
          });
        } catch (error) {
          job.status = "failed";
          job.error = error instanceof Error ? error.message : "Render failed.";
        } finally {
          renderBusy = false;
        }
      })();
    } catch (error) {
      renderBusy = false;
      res.status(400).json({
        error:
          error instanceof Error ? error.message : "Invalid render request.",
      });
    }
  });
  app.get("/api/render/:id", (req, res) => {
    const job = jobs.get(req.params.id);
    if (!job)
      res.status(404).json({
        error: "Export not found; jobs reset when the server restarts.",
      });
    else res.json(job);
  });
  app.use(
    "/outputs",
    express.static(outputDir, { dotfiles: "deny", index: false }),
  );
  app.use(
    (
      error: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      const tooLarge =
        error instanceof Error &&
        "type" in error &&
        error.type === "entity.too.large";
      res.status(tooLarge ? 413 : 400).json({
        error: tooLarge
          ? _req.path === "/api/media"
            ? "Media request exceeds the 28 MB upload limit. Choose a file no larger than 20 MB."
            : "Project exceeds the 2 MB limit."
          : "Malformed JSON request.",
      });
    },
  );
  return app;
}
