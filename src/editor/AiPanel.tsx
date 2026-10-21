import { useState } from "react";
import {
  ArrowUp,
  Check,
  GitCompareArrows,
  LoaderCircle,
  Sparkles,
  X,
  ShieldCheck,
} from "lucide-react";
import { applyTransaction, type Project } from "../core";
import { describeOperation, proposeEdit, type ProposalResponse } from "./api";

interface Props {
  project: Project;
  onApply: (response: ProposalResponse) => void;
  onClose: () => void;
}
export function AiPanel({ project, onApply, onClose }: Props) {
  const [prompt, setPrompt] = useState(
    "Make the English headline shorter and more confident. Keep the Turkish copy unchanged.",
  );
  const [response, setResponse] = useState<ProposalResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const preview = response
    ? applyTransaction(project, {
        id: response.proposal.id || "proposal-preview",
        baseRevision: response.proposal.baseRevision,
        actor: "ai",
        operations: response.proposal.operations,
      })
    : null;
  const propose = async () => {
    if (!prompt.trim()) return;
    setBusy(true);
    setError("");
    setResponse(null);
    try {
      setResponse(await proposeEdit(project, prompt));
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Could not create a proposal.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="ai-panel" aria-labelledby="ai-title">
      <div className="panel-heading">
        <span>
          <Sparkles size={16} />
          <strong id="ai-title">Create with Claude</strong>
        </span>
        <button
          className="icon-button"
          onClick={onClose}
          aria-label="Close Claude panel"
        >
          <X size={16} />
        </button>
      </div>
      <p className="ai-intro">
        Describe your revision. Review every change before it touches your
        project.
      </p>
      <label className="sr-only" htmlFor="ai-prompt">
        Revision request
      </label>
      <textarea
        id="ai-prompt"
        rows={4}
        value={prompt}
        onChange={(event) => setPrompt(event.target.value)}
        placeholder="Shorten the opening. Make the English CTA more direct…"
      />
      <div className="ai-request-footer">
        <span className="mono">Revision {project.revision}</span>
        <button
          className="button accent"
          onClick={propose}
          disabled={busy || !prompt.trim()}
        >
          {busy ? (
            <LoaderCircle className="spin" size={15} />
          ) : (
            <ArrowUp size={15} />
          )}{" "}
          {busy ? "Thinking…" : "Propose changes"}
        </button>
      </div>
      <div className="ai-safety">
        <ShieldCheck size={15} />
        <span>Your manual layouts stay protected.</span>
      </div>
      {error ? (
        <div className="message error" role="alert">
          {error}
        </div>
      ) : null}
      {response ? (
        <div className="proposal">
          <div className="proposal-heading">
            <GitCompareArrows size={16} />
            <strong>Review proposal</strong>
            <span className="mini-badge">{response.provider}</span>
          </div>
          <p>{response.proposal.summary}</p>
          <div className="operation-list">
            {response.proposal.operations.map((operation, index) => (
              <div className="operation" key={index}>
                <Check size={13} />
                <div>
                  <strong>{describeOperation(operation)}</strong>
                  {operation.type === "set-text" ? (
                    <q>{operation.text}</q>
                  ) : (
                    <code>
                      {JSON.stringify(
                        operation.type === "set-layout"
                          ? operation.layout
                          : operation,
                      )}
                    </code>
                  )}
                </div>
              </div>
            ))}
          </div>
          {preview?.conflicts.length ? (
            <div className="message error">
              <strong>Changes blocked</strong>
              <p>
                The proposal conflicts with the current revision or a protected
                field. Your project has not changed.
              </p>
              <ul>
                {preview.conflicts.map((conflict, index) => (
                  <li key={index}>
                    {typeof conflict === "string"
                      ? conflict
                      : "message" in conflict
                        ? String(conflict.message)
                        : JSON.stringify(conflict)}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="proposal-actions">
            <button className="button" onClick={() => setResponse(null)}>
              Discard
            </button>
            <button
              className="button accent"
              onClick={() => {
                onApply(response);
                setResponse(null);
              }}
              disabled={
                !preview?.applied || !response.proposal.operations.length
              }
            >
              <Check size={14} /> Apply {response.proposal.operations.length}{" "}
              changes
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
