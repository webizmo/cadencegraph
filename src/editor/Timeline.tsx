import { useRef, useState, type PointerEvent } from "react";
import { Layers, Link2 } from "lucide-react";
import { formatTime } from "./api";
import type { CompiledProject, Project, Operation, MotionNode } from "../core";
interface Props {
  compiled: CompiledProject;
  project: Project;
  onTimingChange: (operations: Operation[]) => unknown;
  time: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onSeek: (time: number) => void;
}
export function Timeline({
  compiled,
  project,
  onTimingChange,
  time,
  selectedId,
  onSelect,
  onSeek,
}: Props) {
  type Drag = {
    nodeId: string;
    pointerId: number;
    x: number;
    width: number;
    mode: "move" | "start" | "end";
    start: number;
    end: number;
    limit: number;
    timing: MotionNode["timing"];
  };
  const drag = useRef<Drag | null>(null);
  const [draft, setDraft] = useState<{
    nodeId: string;
    start: number;
    end: number;
  } | null>(null);
  const begin = (event: PointerEvent, nodeId: string, mode: Drag["mode"]) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    onSelect(nodeId);
    const scene = project.scenes.find((s) =>
      s.nodes.some((n) => n.id === nodeId),
    )!;
    const node = scene.nodes.find((n) => n.id === nodeId)!;
    const sentence = scene.sentences.find(
      (s) => s.id === node.timing.sentenceId,
    )!;
    const limit = Math.min(...Object.values(sentence.duration));
    const lane = event.currentTarget
      .closest(".track-lane")!
      .getBoundingClientRect();
    drag.current = {
      nodeId,
      pointerId: event.pointerId,
      x: event.clientX,
      width: lane.width,
      mode,
      start: node.timing.start ?? 0,
      end: node.timing.end ?? limit,
      limit,
      timing: node.timing,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const calculate = (clientX: number) => {
    const d = drag.current!;
    const delta =
      Math.round(((clientX - d.x) / d.width) * compiled.duration * 10) / 10;
    let start = d.start,
      end = d.end;
    if (d.mode === "start")
      start = Math.max(0, Math.min(end - 0.1, start + delta));
    else if (d.mode === "end")
      end = Math.max(start + 0.1, Math.min(d.limit, end + delta));
    else {
      start = Math.max(
        0,
        Math.min(
          d.timing.end === undefined ? d.limit - 0.1 : d.limit - (end - start),
          start + delta,
        ),
      );
      end = start + (d.end - d.start);
    }
    return {
      nodeId: d.nodeId,
      start: Number(start.toFixed(2)),
      end: Number(end.toFixed(2)),
    };
  };
  const move = (event: PointerEvent) => {
    if (drag.current?.pointerId === event.pointerId)
      setDraft(calculate(event.clientX));
  };
  const finish = (event: PointerEvent) => {
    const d = drag.current;
    if (!d || d.pointerId !== event.pointerId) return;
    event.stopPropagation();
    const next = calculate(event.clientX);
    drag.current = null;
    setDraft(null);
    if (Math.abs(event.clientX - d.x) < 3) return;
    const timing = { ...d.timing, start: next.start };
    if (d.mode === "end" || d.timing.end !== undefined) timing.end = next.end;
    if (JSON.stringify(timing) !== JSON.stringify(d.timing))
      onTimingChange([{ type: "set-node-timing", nodeId: d.nodeId, timing }]);
  };
  const nodes = compiled.scenes.flatMap((scene) => scene.nodes);
  const maxTicks = 10;
  const interval = Math.max(1, Math.ceil(compiled.duration / maxTicks));
  const ticks = Array.from(
    { length: Math.floor(compiled.duration / interval) + 1 },
    (_, i) => i * interval,
  );
  return (
    <section className="timeline" aria-label="Timeline">
      <div className="timeline-top">
        <span>
          <Layers size={14} /> Timeline
        </span>
        <span className="timeline-semantic">
          <Link2 size={13} /> Drag clips · trim edges
        </span>
        <span className="mono">
          {compiled.fps} FPS · {formatTime(compiled.duration)}
        </span>
      </div>
      <div className="timeline-scroll">
        <div className="timeline-inner">
          <div className="timeline-ruler">
            <div className="track-label">LAYERS</div>
            <div
              className="ruler-body"
              onPointerDown={(event) => {
                const rect = event.currentTarget.getBoundingClientRect();
                onSeek(
                  Math.max(
                    0,
                    Math.min(
                      compiled.duration,
                      ((event.clientX - rect.left) / rect.width) *
                        compiled.duration,
                    ),
                  ),
                );
              }}
              aria-label="Seek timeline"
            >
              {ticks.map((tick) => (
                <span
                  style={{ left: `${(tick / compiled.duration) * 100}%` }}
                  key={tick}
                >
                  {tick}s
                </span>
              ))}
            </div>
          </div>
          <div className="track-list">
            {nodes.map((node, index) => {
              const sentence = compiled.scenes
                .flatMap((s) => s.sentences)
                .find((s) => s.id === node.timing.sentenceId)!;
              const sourceSentence = project.scenes
                .flatMap((s) => s.sentences)
                .find((s) => s.id === node.timing.sentenceId)!;
              const shortest = Math.min(
                ...Object.values(sourceSentence.duration),
              );
              const start =
                draft?.nodeId === node.id
                  ? sentence.start + draft.start
                  : node.start;
              const end =
                draft?.nodeId === node.id &&
                (node.timing.end !== undefined || drag.current?.mode === "end")
                  ? sentence.start + draft.end
                  : node.end;
              return (
                <div
                  className={`timeline-track ${selectedId === node.id ? "selected" : ""}`}
                  key={node.id}
                >
                  <button
                    className="track-label"
                    onClick={() => {
                      onSelect(node.id);
                      onSeek(
                        Math.max(
                          Math.min(
                            node.start + 0.25,
                            (node.start + node.end) / 2,
                          ),
                          Math.min(time, node.end - 0.1),
                        ),
                      );
                    }}
                  >
                    <span className={`track-type type-${node.type}`} />
                    <span>{node.role || node.type}</span>
                  </button>
                  <div
                    className="track-lane"
                    onPointerDown={(event) => {
                      const rect = event.currentTarget.getBoundingClientRect();
                      onSeek(
                        Math.max(
                          0,
                          Math.min(
                            compiled.duration,
                            ((event.clientX - rect.left) / rect.width) *
                              compiled.duration,
                          ),
                        ),
                      );
                    }}
                  >
                    <div
                      className={`track-clip color-${index % 4}`}
                      style={{
                        left: `${(start / compiled.duration) * 100}%`,
                        width: `${((end - start) / compiled.duration) * 100}%`,
                      }}
                      role="button"
                      tabIndex={0}
                      aria-label={`Move timing ${node.id}`}
                      onPointerDown={(event) => begin(event, node.id, "move")}
                      onPointerMove={move}
                      onPointerUp={finish}
                      onPointerCancel={() => {
                        drag.current = null;
                        setDraft(null);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          onSelect(node.id);
                          onSeek(node.start + 0.1);
                        }
                      }}
                      title={`${node.id}: ${formatTime(node.start)}–${formatTime(node.end)}`}
                    >
                      <button
                        className="trim-handle trim-start"
                        aria-label={`Trim start ${node.id}`}
                        onPointerDown={(event) =>
                          begin(event, node.id, "start")
                        }
                        onPointerMove={move}
                        onPointerUp={finish}
                        onPointerCancel={() => {
                          drag.current = null;
                          setDraft(null);
                        }}
                        onKeyDown={(event) => {
                          if (["ArrowLeft", "ArrowRight"].includes(event.key)) {
                            event.preventDefault();
                            onTimingChange([
                              {
                                type: "set-node-timing",
                                nodeId: node.id,
                                timing: {
                                  ...node.timing,
                                  start: Math.max(
                                    0,
                                    (node.timing.start ?? 0) +
                                      (event.key === "ArrowRight" ? 0.1 : -0.1),
                                  ),
                                },
                              },
                            ]);
                          }
                        }}
                      />
                      <span>{node.text || node.role || node.type}</span>
                      <button
                        className="trim-handle trim-end"
                        aria-label={`Trim end ${node.id}`}
                        onPointerDown={(event) => begin(event, node.id, "end")}
                        onPointerMove={move}
                        onPointerUp={finish}
                        onPointerCancel={() => {
                          drag.current = null;
                          setDraft(null);
                        }}
                        onKeyDown={(event) => {
                          if (["ArrowLeft", "ArrowRight"].includes(event.key)) {
                            event.preventDefault();
                            onTimingChange([
                              {
                                type: "set-node-timing",
                                nodeId: node.id,
                                timing: {
                                  ...node.timing,
                                  end:
                                    (node.timing.end ?? shortest) +
                                    (event.key === "ArrowRight" ? 0.1 : -0.1),
                                },
                              },
                            ]);
                          }
                        }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <div
            className="playhead"
            style={{
              left: `calc(145px + (100% - 145px) * ${time / compiled.duration})`,
            }}
          >
            <span />
          </div>
        </div>
      </div>
    </section>
  );
}
