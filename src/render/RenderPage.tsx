import { useEffect, useState } from "react";
import { flushSync } from "react-dom";
import {
  compileProject,
  validateProject,
  type AspectRatio,
  type Project,
} from "../core";
import { demoProject } from "../../examples/demo.ts";
import { Composition } from "./Composition";
import { isFontLoaded, loadProjectFonts } from "./media";

export interface OutputIssue {
  code: string;
  nodeId?: string;
  message: string;
}
export interface OutputInspection {
  time: number;
  sceneId: string | null;
  fontsReady: boolean;
  images: number;
  issues: OutputIssue[];
}
export interface RenderControl {
  setProject: (
    project: Project,
    locale?: string,
    ratio?: AspectRatio,
  ) => Promise<void>;
  seek: (time: number) => Promise<void>;
  inspect: () => OutputInspection;
  metadata: () => {
    width: number;
    height: number;
    duration: number;
    fps: number;
  };
}
declare global {
  interface Window {
    __CADENCE_RENDER__?: RenderControl;
  }
}

async function settleMedia() {
  await document.fonts.ready;
  await Promise.all(
    [...document.images].map((img) => img.decode().catch(() => undefined)),
  );
  await Promise.all(
    [
      ...document.querySelectorAll<HTMLVideoElement>(
        "video[data-project-time]",
      ),
    ].map(
      (video) =>
        new Promise<void>((resolve) => {
          const target = Number(video.dataset.projectTime || "0");
          if (
            Math.abs(video.currentTime - target) < 0.015 &&
            video.readyState >= 2
          ) {
            resolve();
            return;
          }
          let timeout: ReturnType<typeof setTimeout>;
          const done = () => {
            clearTimeout(timeout);
            video.removeEventListener("seeked", done);
            video.removeEventListener("error", done);
            resolve();
          };
          video.addEventListener("seeked", done, { once: true });
          video.addEventListener("error", done, { once: true });
          timeout = setTimeout(done, 3000);
          video.currentTime = Number.isFinite(video.duration)
            ? Math.min(target, Math.max(0, video.duration - 0.01))
            : target;
        }),
    ),
  );
  await new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  );
}
export function inspectOutput(): OutputInspection {
  const root = document.querySelector<HTMLElement>("[data-composition]");
  const issues: OutputIssue[] = [];
  if (!root)
    return {
      time: 0,
      sceneId: null,
      fontsReady: false,
      images: 0,
      issues: [
        { code: "missing-canvas", message: "Composition did not mount." },
      ],
    };
  for (const node of root.querySelectorAll<HTMLElement>("[data-node-id]")) {
    const nodeId = node.dataset.nodeId;
    if (Number(getComputedStyle(node).opacity) < 0.9) continue;
    const rect = node.getBoundingClientRect(),
      canvas = root.getBoundingClientRect();
    if (
      rect.left < canvas.left - 2 ||
      rect.top < canvas.top - 2 ||
      rect.right > canvas.right + 2 ||
      rect.bottom > canvas.bottom + 2
    )
      issues.push({
        code: "canvas-overflow",
        nodeId,
        message: "Node extends beyond the output canvas.",
      });
    for (const text of node.querySelectorAll<HTMLElement>(
      ".cg-text,.cg-caption,.cg-card-copy,.cg-cta",
    )) {
      if (
        text.scrollHeight > text.clientHeight + 3 ||
        text.scrollWidth > text.clientWidth + 3
      )
        issues.push({
          code: "text-overflow",
          nodeId,
          message: `Text exceeds its allocated box (${text.scrollWidth}×${text.scrollHeight} > ${text.clientWidth}×${text.clientHeight}).`,
        });
    }
    for (const bad of node.querySelectorAll<HTMLElement>("[data-render-error]"))
      issues.push({
        code: bad.dataset.renderError!,
        nodeId,
        message: bad.textContent || "Render error.",
      });
  }
  for (const img of root.querySelectorAll<HTMLImageElement>("img"))
    if (!img.complete || img.naturalWidth === 0)
      issues.push({
        code: "missing-media",
        nodeId: img.closest<HTMLElement>("[data-node-id]")?.dataset.nodeId,
        message: `Image could not be decoded: ${img.getAttribute("src")}`,
      });
  for (const audio of root.querySelectorAll<HTMLAudioElement>("audio"))
    if (audio.error)
      issues.push({
        code: "missing-audio",
        message: `Audio could not be decoded: ${audio.getAttribute("src")}`,
      });
  for (const video of root.querySelectorAll<HTMLVideoElement>("video"))
    if (video.error || video.readyState < 2)
      issues.push({
        code: "missing-media",
        nodeId: video.closest<HTMLElement>("[data-node-id]")?.dataset.nodeId,
        message: `Video could not be decoded: ${video.getAttribute("src")}`,
      });
  const family = root.dataset.fontFamily || "Manrope";
  const fontsReady = document.fonts.status === "loaded" && isFontLoaded(family);
  if (!fontsReady)
    issues.push({
      code: "font-not-ready",
      message: `Requested font '${family}' is not registered and loaded. Bundle a font asset instead of relying on system fallback.`,
    });
  if (root.dataset.fontError)
    issues.push({ code: "font-load-failed", message: root.dataset.fontError });
  return {
    time: Number(root.dataset.projectTime),
    sceneId: root.dataset.sceneId || null,
    fontsReady,
    images: root.querySelectorAll("img").length,
    issues,
  };
}
export function RenderPage({
  initialProject,
  project: providedProject,
}: { initialProject?: Project; project?: Project } = {}) {
  const query = new URLSearchParams(window.location.search);
  const [project, setProject] = useState(
    providedProject ?? initialProject ?? demoProject,
  );
  const [locale, setLocale] = useState(
    query.get("locale") || project.locales[0],
  );
  const [ratio, setRatio] = useState<AspectRatio>(
    query.get("ratio") === "9:16" ? "9:16" : "16:9",
  );
  const [time, setTime] = useState(0);
  useEffect(() => {
    const control: RenderControl = {
      async setProject(next, nextLocale = locale, nextRatio = ratio) {
        const issues = validateProject(next).filter(
          (i) => i.severity === "error",
        );
        if (issues.length)
          throw new Error(issues.map((i) => i.message).join("; "));
        await loadProjectFonts(next);
        flushSync(() => {
          setProject(next);
          setLocale(nextLocale);
          setRatio(nextRatio);
          setTime(0);
        });
        await settleMedia();
      },
      async seek(nextTime) {
        flushSync(() => setTime(nextTime));
        await settleMedia();
      },
      inspect: inspectOutput,
      metadata() {
        const c = compileProject(project, locale, ratio);
        return {
          width: c.width,
          height: c.height,
          duration: c.duration,
          fps: c.fps,
        };
      },
    };
    window.__CADENCE_RENDER__ = control;
    return () => {
      if (window.__CADENCE_RENDER__ === control)
        delete window.__CADENCE_RENDER__;
    };
  }, [project, locale, ratio]);
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        overflow: "hidden",
        background: project.brand.background,
      }}
    >
      <Composition
        project={project}
        locale={locale}
        ratio={ratio}
        time={time}
      />
    </div>
  );
}
export default RenderPage;
