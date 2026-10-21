import { Layers, Link2 } from "lucide-react";
import { formatTime } from "./api";
import type { CompiledProject } from "../core";
interface Props {
  compiled: CompiledProject;
  time: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onSeek: (time: number) => void;
}
export function Timeline({
  compiled,
  time,
  selectedId,
  onSelect,
  onSeek,
}: Props) {
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
          <Link2 size={13} /> Sentence-linked timing
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
            {nodes.map((node, index) => (
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
                        node.start + 0.25,
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
                  <button
                    className={`track-clip color-${index % 4}`}
                    style={{
                      left: `${(node.start / compiled.duration) * 100}%`,
                      width: `${((node.end - node.start) / compiled.duration) * 100}%`,
                    }}
                    onClick={(event) => {
                      event.stopPropagation();
                      onSelect(node.id);
                    }}
                    title={`${node.id}: ${formatTime(node.start)}–${formatTime(node.end)}`}
                  >
                    <span>{node.text || node.role || node.type}</span>
                  </button>
                </div>
              </div>
            ))}
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
