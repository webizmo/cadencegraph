import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Check,
  ChevronDown,
  ChevronRight,
  Clapperboard,
  Download,
  Expand,
  Film,
  Grid2X2,
  Image,
  Layers,
  LockKeyhole,
  Pause,
  Play,
  Plus,
  Redo2,
  Sparkles,
  Type,
  Undo2,
  X,
} from "lucide-react";
import {
  applyTransaction,
  compileProject,
  parseProject,
  resolveLayout,
  type AspectRatio,
  type Layout,
  type MotionNode,
  type Operation,
} from "../core";
import { Composition } from "../render/Composition";
import { Inspector } from "./Inspector";
import { Timeline } from "./Timeline";
import { AiPanel } from "./AiPanel";
import { ChecksPanel } from "./ChecksPanel";
import { formatTime, type ProposalResponse } from "./api";
import { useProject } from "./useProject";

function WaveMark() {
  return (
    <svg
      width="37"
      height="25"
      viewBox="0 0 42 26"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M2 15c5 8 6-11 11-11s2 19 8 18S26 3 31 4s4 14 9 8"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
function NodeIcon({ node }: { node: MotionNode }) {
  return node.type === "text" || node.type === "caption" ? (
    <Type size={14} />
  ) : node.type === "media" ? (
    <Image size={14} />
  ) : node.type === "cta" ? (
    <ArrowUpFromLine size={14} />
  ) : (
    <Layers size={14} />
  );
}
function downloadProject(project: unknown, name: string) {
  const blob = new Blob([JSON.stringify(project, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.cadence.json`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function Studio() {
  const {
    project,
    replace,
    transact,
    undo,
    redo,
    canUndo,
    canRedo,
    storageError,
    notice,
    setNotice,
  } = useProject();
  const [locale, setLocale] = useState(
    project.locales.includes("en") ? "en" : project.locales[0],
  );
  const [ratio, setRatio] = useState<AspectRatio>(project.ratios[0]);
  const [selectedId, setSelectedId] = useState<string | null>(
    project.scenes[0]?.nodes.find((node) => node.role === "headline")?.id ||
      project.scenes[0]?.nodes[0]?.id ||
      null,
  );
  const [time, setTime] = useState(1.5);
  const [playing, setPlaying] = useState(false);
  const [panel, setPanel] = useState<"properties" | "claude" | "checks">(
    "properties",
  );
  const [leftTab, setLeftTab] = useState<"scenes" | "assets">("scenes");
  const [variants, setVariants] = useState(false);
  const [renderRequest, setRenderRequest] = useState(0);
  const [drag, setDrag] = useState<{
    nodeId: string;
    pointerX: number;
    pointerY: number;
    origin: Layout;
    layout: Layout;
    pointerId: number;
  } | null>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragDraft, setDragDraft] = useState<Layout | null>(null);
  const currentLocale = project.locales.includes(locale)
    ? locale
    : project.locales[0];
  const currentRatio = project.ratios.includes(ratio)
    ? ratio
    : project.ratios[0];
  const compiled = useMemo(
    () => compileProject(project, currentLocale, currentRatio),
    [project, currentLocale, currentRatio],
  );
  const activeScene =
    compiled.scenes.find((scene) => time >= scene.start && time < scene.end) ||
    compiled.scenes[compiled.scenes.length - 1];
  const selectedScene = project.scenes.find((scene) =>
    scene.nodes.some((node) => node.id === selectedId),
  );
  const selectedNode = selectedScene?.nodes.find(
    (node) => node.id === selectedId,
  );
  const protectedCount = project.scenes
    .flatMap((scene) => scene.nodes)
    .filter((node) => node.overrides?.[currentRatio]?.protected).length;
  const stageProject = useMemo(
    () =>
      drag && dragDraft
        ? applyTransaction(project, {
            id: "drag-preview",
            actor: "human",
            baseRevision: project.revision,
            operations: [
              {
                type: "set-layout",
                nodeId: drag.nodeId,
                ratio: currentRatio,
                layout: dragDraft,
                protect: true,
              },
            ],
          }).project
        : project,
    [project, drag?.nodeId, dragDraft, currentRatio],
  );
  useEffect(() => {
    setTime((value) => Math.min(value, Math.max(0, compiled.duration - 0.001)));
  }, [compiled.duration]);
  useEffect(() => {
    if (!playing) return;
    let previous = performance.now();
    let animation = 0;
    const tick = (now: number) => {
      const elapsed = (now - previous) / 1000;
      previous = now;
      setTime((value) => {
        if (value + elapsed >= compiled.duration) {
          setPlaying(false);
          return 0;
        }
        return value + elapsed;
      });
      animation = requestAnimationFrame(tick);
    };
    animation = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animation);
  }, [playing, compiled.duration]);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 4500);
    return () => clearTimeout(timer);
  }, [notice, setNotice]);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.matches("input,textarea,select") || target.isContentEditable)
        return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        event.shiftKey ? redo() : undo();
      } else if (event.code === "Space") {
        event.preventDefault();
        setPlaying((value) => !value);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [undo, redo]);
  const update = (operations: Operation[]) => {
    const result = transact(operations);
    if (!result.applied)
      setNotice(result.conflicts.map((conflict) => conflict.message).join(" "));
  };
  const select = (id: string) => {
    setSelectedId(id);
  };
  const switchLocale = (language: string) => {
    const target = compileProject(project, language, currentRatio).scenes.find(
      (scene) => scene.id === activeScene.id,
    );
    if (target)
      setTime(
        target.start +
          Math.max(
            0,
            Math.min(0.999, (time - activeScene.start) / activeScene.duration),
          ) *
            target.duration,
      );
    setLocale(language);
    setPlaying(false);
  };
  const seek = (next: number) => {
    setTime(next);
    setPlaying(false);
  };
  const handlePointerDown = (event: PointerEvent, nodeId: string) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    setPlaying(false);
    select(nodeId);
    const node = project.scenes
      .flatMap((scene) => scene.nodes)
      .find((node) => node.id === nodeId);
    if (!node) return;
    const layout = resolveLayout(node, currentRatio);
    frameRef.current?.setPointerCapture(event.pointerId);
    setDrag({
      nodeId,
      pointerX: event.clientX,
      pointerY: event.clientY,
      origin: layout,
      layout,
      pointerId: event.pointerId,
    });
    setDragDraft(layout);
  };
  const handlePointerMove = (event: PointerEvent) => {
    if (!drag || !frameRef.current) return;
    const rect = frameRef.current.getBoundingClientRect();
    setDragDraft({
      ...drag.origin,
      x:
        Math.round(
          (drag.origin.x +
            ((event.clientX - drag.pointerX) / rect.width) * 100) *
            10,
        ) / 10,
      y:
        Math.round(
          (drag.origin.y +
            ((event.clientY - drag.pointerY) / rect.height) * 100) *
            10,
        ) / 10,
    });
  };
  const handlePointerUp = () => {
    if (!drag) return;
    if (
      dragDraft &&
      (dragDraft.x !== drag.origin.x || dragDraft.y !== drag.origin.y)
    ) {
      update([
        {
          type: "set-layout",
          nodeId: drag.nodeId,
          ratio: currentRatio,
          layout: dragDraft,
          protect: true,
        },
      ]);
      setNotice(`Manual position protected for ${currentRatio}.`);
    }
    setDrag(null);
    setDragDraft(null);
  };
  const importFile = async (file?: File) => {
    if (!file) return;
    try {
      if (file.size > 5_000_000)
        throw new Error("Project JSON must be smaller than 5 MB.");
      const next = parseProject(JSON.parse(await file.text()));
      replace(next);
      setLocale(next.locales[0]);
      setRatio(next.ratios[0]);
      setSelectedId(next.scenes[0]?.nodes[0]?.id || null);
      setTime(0.8);
      setPlaying(false);
      setNotice(`Imported ${next.name}.`);
    } catch (error) {
      setNotice(
        `Import failed: ${error instanceof Error ? error.message : "Invalid project file"}`,
      );
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  };
  const applyProposal = (response: ProposalResponse) => {
    const result = transact(
      response.proposal.operations,
      "ai",
      response.proposal.baseRevision,
    );
    setNotice(
      result.applied
        ? `Applied ${result.changes.length} changes from ${response.provider}.`
        : result.conflicts.map((conflict) => conflict.message).join(" "),
    );
  };
  const addLayer = () => {
    const scene =
      project.scenes.find((scene) => scene.id === activeScene?.id) ||
      project.scenes[0];
    if (!scene) return;
    const id = `text-${crypto.randomUUID().slice(0, 8)}`;
    update([
      {
        type: "add-node",
        sceneId: scene.id,
        node: {
          id,
          type: "text",
          role: "new-text",
          content: Object.fromEntries(
            project.locales.map((locale) => [locale, "Your next idea."]),
          ),
          layout: { x: 10, y: 45, width: 75, height: 20 },
          timing: { sentenceId: scene.sentences[0].id },
          style: { fontSize: 74, fontWeight: 700 },
          animation: { enter: "rise" },
        },
      },
    ]);
    setSelectedId(id);
  };
  return (
    <div className="studio-shell">
      <header className="studio-header">
        <a href="/" className="brand" aria-label="CadenceGraph studio">
          <WaveMark />
          <span>CadenceGraph</span>
        </a>
        <div className="header-divider" />
        <div className="project-title">
          <span>{project.name}</span>
          <ChevronDown size={14} />
        </div>
        <div className="header-actions">
          <div className="history-actions">
            <button
              className="text-button"
              disabled={!canUndo}
              onClick={undo}
              title="Undo (⌘Z)"
            >
              <Undo2 size={15} />
              <span>Undo</span>
            </button>
            <button
              className="text-button"
              disabled={!canRedo}
              onClick={redo}
              title="Redo (⌘⇧Z)"
            >
              <Redo2 size={15} />
              <span>Redo</span>
            </button>
          </div>
          <button
            className="button compact import-button"
            aria-label="Import project JSON"
            onClick={() => inputRef.current?.click()}
          >
            <ArrowUpFromLine size={15} />
            <span>Import</span>
          </button>
          <button
            className="button compact save-button"
            aria-label="Save project JSON"
            onClick={() => {
              downloadProject(project, project.name);
              setNotice("Project JSON exported.");
            }}
          >
            <ArrowDownToLine size={15} />
            <span>Save project</span>
          </button>
          <button
            className="button accent compact export-button"
            onClick={() => {
              setPanel("checks");
              setRenderRequest((value) => value + 1);
            }}
          >
            <Download size={15} />
            <span>Export film</span>
          </button>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept=".json,.cadence.json,application/json"
          className="sr-only"
          aria-label="Import project"
          onChange={(event) => void importFile(event.target.files?.[0])}
        />
      </header>
      <main className="studio-main">
        <aside className="scene-rail" aria-label="Project scenes and layers">
          <div className="rail-tabs">
            <button
              className={leftTab === "scenes" ? "active" : ""}
              onClick={() => setLeftTab("scenes")}
            >
              Scenes
            </button>
            <button
              className={leftTab === "assets" ? "active" : ""}
              onClick={() => setLeftTab("assets")}
            >
              Assets
            </button>
            <button
              className="icon-button add-layer-top"
              title="Add text layer"
              aria-label="Add text layer"
              onClick={addLayer}
            >
              <Plus size={17} />
            </button>
          </div>
          <div className="scene-scroll">
            {leftTab === "scenes" ? (
              project.scenes.map((scene, index) => {
                const sceneTiming = compiled.scenes.find(
                  (compiled) => compiled.id === scene.id,
                )!;
                return (
                  <div className="scene-group" key={scene.id}>
                    <button
                      className={`scene-row ${activeScene?.id === scene.id ? "active" : ""}`}
                      onClick={() => {
                        seek(
                          sceneTiming.start +
                            Math.min(1, sceneTiming.duration / 2),
                        );
                        setSelectedId(
                          scene.nodes.find((node) => node.role === "headline")
                            ?.id ||
                            scene.nodes[0]?.id ||
                            null,
                        );
                      }}
                    >
                      <span className="scene-number">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <strong>{scene.name}</strong>
                      <span className="mono">
                        {sceneTiming.duration.toFixed(1)}s
                      </span>
                    </button>
                    <div className="layer-list">
                      {scene.nodes.map((node) => (
                        <button
                          className={`layer-row ${selectedId === node.id ? "selected" : ""}`}
                          key={node.id}
                          onClick={() => {
                            select(node.id);
                            if (activeScene?.id !== scene.id)
                              seek(
                                sceneTiming.start +
                                  Math.min(1, sceneTiming.duration / 2),
                              );
                          }}
                        >
                          <NodeIcon node={node} />
                          <span>{node.role || node.type}</span>
                          {node.overrides?.[currentRatio]?.protected ? (
                            <LockKeyhole size={12} className="layer-lock" />
                          ) : (
                            <span className="layer-dot" />
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="asset-list">
                {project.assets.map((asset) => (
                  <div key={asset.id} className="asset-row">
                    {asset.type === "image" ? (
                      <img src={asset.src} alt="" />
                    ) : (
                      <Film size={20} />
                    )}
                    <div>
                      <strong>{asset.name || asset.id}</strong>
                      <small>{asset.type}</small>
                    </div>
                  </div>
                ))}
                <p className="field-hint">
                  Assets are referenced by stable IDs in your project JSON.
                </p>
              </div>
            )}
          </div>
          <div className="rail-footer">
            <button className="text-button" onClick={addLayer}>
              <Plus size={15} /> Add text layer
            </button>
            <span className="mono">
              {project.scenes.flatMap((scene) => scene.nodes).length} layers
            </span>
          </div>
        </aside>
        <div className="workspace">
          <div className="canvas-heading">
            <div>
              <span>
                Scene{" "}
                {String(
                  compiled.scenes.findIndex(
                    (scene) => scene.id === activeScene?.id,
                  ) + 1,
                ).padStart(2, "0")}
              </span>
              <span>{activeScene?.name}</span>
            </div>
            <button
              className={`text-button ${variants ? "mint" : ""}`}
              onClick={() => setVariants((value) => !value)}
            >
              <Grid2X2 size={14} />
              {variants ? "Single view" : "4 variants"}
            </button>
          </div>
          <div
            className={`canvas-workspace ${currentRatio === "9:16" && !variants ? "portrait" : ""}`}
          >
            {variants ? (
              <div className="variants-grid">
                {project.locales.flatMap((language) =>
                  project.ratios.map((aspect) => {
                    const output = compileProject(project, language, aspect);
                    const match = output.scenes.find(
                      (scene) => scene.id === activeScene.id,
                    )!;
                    const variantTime =
                      match.start +
                      Math.max(
                        0,
                        Math.min(
                          0.999,
                          (time - activeScene.start) / activeScene.duration,
                        ),
                      ) *
                        match.duration;
                    return (
                      <button
                        className={`variant-tile ${aspect === "9:16" ? "tall" : ""}`}
                        key={`${language}-${aspect}`}
                        onClick={() => {
                          switchLocale(language);
                          setRatio(aspect);
                          setVariants(false);
                        }}
                      >
                        <div
                          className="variant-preview"
                          style={{ aspectRatio: aspect.replace(":", "/") }}
                        >
                          <Composition
                            project={project}
                            locale={language}
                            ratio={aspect}
                            time={variantTime}
                          />
                        </div>
                        <span>
                          {language.toUpperCase()}{" "}
                          <span>
                            {aspect} · {output.duration.toFixed(1)}s
                          </span>
                        </span>
                      </button>
                    );
                  }),
                )}
              </div>
            ) : (
              <div className="canvas-fit">
                <div
                  ref={frameRef}
                  className={`canvas-frame ${drag ? "dragging" : ""}`}
                  style={{ aspectRatio: currentRatio.replace(":", "/") }}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerCancel={() => {
                    setDrag(null);
                    setDragDraft(null);
                  }}
                >
                  <Composition
                    project={stageProject}
                    locale={currentLocale}
                    ratio={currentRatio}
                    time={time}
                    playing={playing}
                    selectedNodeId={selectedId}
                    onSelect={select}
                    onNodePointerDown={handlePointerDown}
                  />
                </div>
              </div>
            )}
          </div>
          <div className="transport">
            <button
              className="play-button"
              aria-label={playing ? "Pause preview" : "Play preview"}
              onClick={() => setPlaying((value) => !value)}
            >
              {playing ? (
                <Pause size={20} fill="currentColor" />
              ) : (
                <Play size={20} fill="currentColor" />
              )}
            </button>
            <div className="timecode mono">
              <strong>{formatTime(time)}</strong>
              <span>/ {formatTime(compiled.duration)}</span>
            </div>
            <input
              className="playback-range"
              aria-label="Preview position"
              type="range"
              min="0"
              max={compiled.duration}
              step="0.01"
              value={time}
              onChange={(event) => seek(Number(event.target.value))}
            />
            <div className="transport-divider" />
            <label className="locale-control">
              <span className="sr-only">Preview language</span>
              <select
                value={currentLocale}
                onChange={(event) => switchLocale(event.target.value)}
              >
                {project.locales.map((value) => (
                  <option key={value} value={value}>
                    {value === "en"
                      ? "English"
                      : value === "tr"
                        ? "Türkçe"
                        : value.toUpperCase()}
                  </option>
                ))}
              </select>
              <ChevronDown size={13} />
            </label>
            <div className="ratio-toggle" aria-label="Aspect ratio">
              {project.ratios.map((value) => (
                <button
                  key={value}
                  className={currentRatio === value ? "selected" : ""}
                  onClick={() => setRatio(value)}
                >
                  {value}
                </button>
              ))}
            </div>
            <button
              className="icon-button fullscreen-button"
              aria-label="Fullscreen preview"
              onClick={() => {
                void frameRef.current
                  ?.requestFullscreen()
                  .catch(() =>
                    setNotice("Fullscreen is not available in this browser."),
                  );
              }}
            >
              <Expand size={17} />
            </button>
          </div>
          <Timeline
            compiled={compiled}
            time={time}
            selectedId={selectedId}
            onSelect={select}
            onSeek={seek}
          />
        </div>
        <aside className="property-rail" aria-label="Layer inspector">
          <div className="inspector-heading">
            <Clapperboard size={16} />
            <strong>
              {panel === "properties"
                ? selectedNode?.role || selectedNode?.type || "Inspector"
                : panel === "claude"
                  ? "Creative assistant"
                  : "Output preflight"}
            </strong>
            <span className="status-dot" />
          </div>
          <div className="property-tabs">
            <button
              className={panel === "properties" ? "active" : ""}
              onClick={() => setPanel("properties")}
            >
              Properties
            </button>
            <button
              className={panel === "claude" ? "active" : ""}
              onClick={() => setPanel("claude")}
            >
              <Sparkles size={12} />
              Claude
            </button>
            <button
              className={panel === "checks" ? "active" : ""}
              onClick={() => setPanel("checks")}
            >
              Checks
            </button>
          </div>
          <div className="property-scroll">
            {panel === "properties" ? (
              <>
                <Inspector
                  assets={project.assets}
                  node={selectedNode}
                  scene={selectedScene}
                  locale={currentLocale}
                  ratio={currentRatio}
                  transact={update}
                />
                <div className="claude-invite">
                  <Sparkles size={17} />
                  <h3>Keep your creative flow.</h3>
                  <p>
                    Revise copy, timing, or style with a reviewable Claude
                    proposal.
                  </p>
                  <button
                    className="button full"
                    onClick={() => setPanel("claude")}
                  >
                    Create with Claude <ChevronRight size={14} />
                  </button>
                </div>
              </>
            ) : panel === "claude" ? (
              <AiPanel
                project={project}
                onApply={applyProposal}
                onClose={() => setPanel("properties")}
              />
            ) : null}
            <div hidden={panel !== "checks"}>
              <ChecksPanel
                project={project}
                locale={currentLocale}
                ratio={currentRatio}
                autoRender={renderRequest}
              />
            </div>
          </div>
          <div className="property-footer">
            <LockKeyhole size={12} />
            {protectedCount} protected layout{protectedCount === 1 ? "" : "s"}
            <span className="mono">v1</span>
          </div>
        </aside>
      </main>
      <footer className="studio-status">
        <span>
          <span className="status-dot" />
          {storageError || "Saved in this browser"}
        </span>
        <span className="status-center">
          Open project format <span>·</span> Revision {project.revision}
        </span>
        <span className="mono">
          {compiled.width} × {compiled.height} <span>·</span> {project.fps} fps
        </span>
      </footer>
      {notice ? (
        <div className="toast" role="status">
          <Check size={15} />
          <span>{notice}</span>
          <button
            aria-label="Dismiss notification"
            onClick={() => setNotice("")}
          >
            <X size={14} />
          </button>
        </div>
      ) : null}
    </div>
  );
}
