import {
  Check,
  CheckCircle2,
  CircleAlert,
  Download,
  Film,
  LoaderCircle,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
  validateProject,
  validateVariant,
  type AspectRatio,
  type Project,
} from "../core";
import { getRender, startRender, type RenderJob } from "./api";
interface Props {
  project: Project;
  locale: string;
  ratio: AspectRatio;
  autoRender: number;
}
export function ChecksPanel({ project, locale, ratio, autoRender }: Props) {
  const [job, setJob] = useState<RenderJob | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const sourceIssues = validateProject(project);
  const outputIssues = validateVariant(project, locale, ratio);
  const issues = [...sourceIssues, ...outputIssues];
  const checkGroups = [
    { label: "Project structure", passed: sourceIssues.length === 0 },
    {
      label: "Stable layer identities",
      passed: !sourceIssues.some(
        (issue) =>
          issue.code.includes("duplicate") || issue.code.includes("id"),
      ),
    },
    {
      label: "Sentence-linked timing",
      passed: !issues.some(
        (issue) =>
          issue.code.includes("timing") || issue.path.includes("timing"),
      ),
    },
    {
      label: "Responsive bounds",
      passed: !outputIssues.some(
        (issue) =>
          issue.code.includes("overflow") || issue.code.includes("bounds"),
      ),
    },
  ];
  const blocking = issues.filter((issue) => issue.severity === "error");
  const render = async () => {
    setBusy(true);
    setError("");
    setJob(null);
    try {
      setJob(await startRender(project, locale, ratio));
    } catch (error) {
      setError(error instanceof Error ? error.message : "Render failed.");
      setBusy(false);
    }
  };
  useEffect(() => {
    if (autoRender > 0) void render();
  }, [autoRender]);
  useEffect(() => {
    if (
      !job ||
      ["complete", "completed", "failed", "error"].includes(job.status)
    ) {
      if (job) setBusy(false);
      return;
    }
    const timer = window.setTimeout(async () => {
      try {
        setJob(await getRender(job.id));
      } catch (error) {
        setError(
          error instanceof Error
            ? error.message
            : "Could not read render status.",
        );
        setBusy(false);
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, [job]);
  const complete = job && ["complete", "completed"].includes(job.status);
  const download = job?.url || job?.outputUrl;
  return (
    <div className="checks-panel">
      <div className="check-summary">
        <div
          className={`check-summary-icon ${blocking.length ? "has-errors" : ""}`}
        >
          {blocking.length ? (
            <CircleAlert size={23} />
          ) : (
            <CheckCircle2 size={23} />
          )}
        </div>
        <h3>
          {blocking.length ? "Needs attention" : "Ready for a closer look"}
        </h3>
        <p>
          {locale.toUpperCase()} · {ratio} · Revision {project.revision}
        </p>
      </div>
      <div className="check-list">
        {checkGroups.map((check) => (
          <div key={check.label}>
            {check.passed ? <Check size={14} /> : <CircleAlert size={14} />}
            <span>{check.label}</span>
          </div>
        ))}
      </div>
      <p className="field-hint">
        These are source checks. The MP4 renderer also measures text, loads
        media, and verifies fonts in Chromium.
      </p>
      {issues.length ? (
        <div className="issues">
          {issues.map((issue, index) => (
            <div key={index} className={`issue ${issue.severity}`}>
              <CircleAlert size={14} />
              <div>
                <strong>{issue.code.replaceAll("-", " ")}</strong>
                <p>{issue.message}</p>
                {issue.nodeId ? <code>{issue.nodeId}</code> : null}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="check-clear">
          <CheckCircle2 size={14} /> No source issues in this output
        </div>
      )}
      <div className="render-section">
        <h3>
          <Film size={16} /> Render MP4
        </h3>
        <p>
          {ratio === "16:9" ? "1280 × 720" : "720 × 1280"} · H.264 ·{" "}
          {project.fps} fps
        </p>
        <button
          className="button accent full"
          onClick={render}
          disabled={busy || blocking.length > 0}
        >
          {busy ? (
            <LoaderCircle className="spin" size={15} />
          ) : (
            <Film size={15} />
          )}{" "}
          {busy ? "Rendering…" : "Render this variant"}
        </button>
        {job ? (
          <div className="render-progress">
            <span>{job.status}</span>
            {typeof job.progress === "number" ? (
              <>
                <progress
                  value={job.progress > 1 ? job.progress : job.progress * 100}
                  max={100}
                />
                <span className="mono">
                  {Math.round(
                    job.progress > 1 ? job.progress : job.progress * 100,
                  )}
                  %
                </span>
              </>
            ) : null}
          </div>
        ) : null}
        {complete && download ? (
          <a className="button full" href={download} download>
            <Download size={15} /> Download MP4
          </a>
        ) : null}
        {job?.error ? <div className="message error">{job.error}</div> : null}
        {error ? (
          <div className="message error" role="alert">
            {error}
          </div>
        ) : null}
      </div>
    </div>
  );
}
