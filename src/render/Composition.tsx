import {
  useMemo,
  useEffect,
  useRef,
  type CSSProperties,
  type PointerEvent,
} from "react";
import {
  compileProject,
  type Project,
  type AspectRatio,
  type CompiledNode,
} from "../core";
import { entrance, clamp } from "./motion";
import { getComponent } from "./registry";
import "./composition.css";
import { loadProjectFonts, useMediaClock } from "./media";

export interface CompositionProps {
  project: Project;
  locale: string;
  ratio: AspectRatio;
  time: number;
  playing?: boolean;
  synchronizeMedia?: boolean;
  selectedNodeId?: string | null;
  onSelect?: (nodeId: string) => void;
  onNodePointerDown?: (
    event: PointerEvent<HTMLDivElement>,
    nodeId: string,
  ) => void;
}
export function Composition({
  project,
  locale,
  ratio,
  time,
  playing = false,
  synchronizeMedia = true,
  selectedNodeId,
  onSelect,
  onNodePointerDown,
}: CompositionProps) {
  const compiled = useMemo(
    () => compileProject(project, locale, ratio),
    [project, locale, ratio],
  );
  const root = useRef<HTMLDivElement>(null);
  useMediaClock(root, time, playing, synchronizeMedia);
  useEffect(() => {
    void loadProjectFonts(project)
      .then(() => {
        if (root.current) delete root.current.dataset.fontError;
      })
      .catch((error) => {
        if (root.current) root.current.dataset.fontError = error.message;
      });
  }, [project.assets, project.brand.fontFamily]);
  const scene =
    compiled.scenes.find((s) => time >= s.start && time < s.end) ??
    (time >= compiled.duration ? compiled.scenes.at(-1) : compiled.scenes[0]);
  if (!scene) return null;
  const inverted =
    (scene as typeof scene & { theme?: string }).theme === "inverted";
  const background = inverted
    ? compiled.brand.foreground
    : compiled.brand.background;
  const foreground = inverted
    ? compiled.brand.background
    : compiled.brand.foreground;
  const portrait = ratio === "9:16";
  const legacyDecorations = ["intro", "features", "outro"].includes(scene.kind);
  const localTime = time - scene.start;
  const activeTime = Math.min(Math.max(time, scene.start), scene.end - 0.01);
  const style = {
    "--cg-accent": compiled.brand.accent,
    "--cg-bg": background,
    "--cg-fg": foreground,
    "--cg-font": compiled.brand.fontFamily,
    aspectRatio: `${compiled.width}/${compiled.height}`,
  } as CSSProperties;
  const size = (px: number) => `${(px / compiled.width) * 100}cqw`;
  function content(node: CompiledNode) {
    const props = {
      time: Math.max(0, activeTime - node.start),
      duration: node.end - node.start,
      locale,
      ratio,
      accent: compiled.brand.accent,
      foreground,
      props: node.props ?? {},
    };
    if (node.type === "component") {
      const definition = getComponent(node.component ?? "");
      return definition ? (
        <definition.Component {...props} />
      ) : (
        <div className="cg-missing" data-render-error="unknown-component">
          Unknown component: {node.component}
        </div>
      );
    }
    if (node.type === "media") {
      const asset = compiled.assets.find((a) => a.id === node.assetId);
      if (!asset)
        return (
          <div className="cg-missing" data-render-error="missing-media">
            Missing media: {node.assetId}
          </div>
        );
      if (asset.type === "video")
        return (
          <>
            <video
              src={asset.src}
              muted
              playsInline
              preload="auto"
              data-project-time={activeTime - node.start}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "contain",
                ...(synchronizeMedia
                  ? {}
                  : {
                      position: "absolute",
                      opacity: 0,
                      pointerEvents: "none",
                    }),
              }}
            />
            {!synchronizeMedia ? (
              <canvas
                data-video-frame
                style={{ width: "100%", height: "100%", objectFit: "contain" }}
              />
            ) : null}
          </>
        );
      return (
        <img
          src={asset.src}
          alt={node.text || asset.name || ""}
          draggable={false}
          style={{ width: "100%", height: "100%", objectFit: "contain" }}
        />
      );
    }
    if (node.type === "card")
      return (
        <div
          className="cg-card"
          style={{
            fontSize: size(node.style?.fontSize ?? (portrait ? 26 : 30)),
            fontWeight: node.style?.fontWeight,
            color: node.style?.color,
            textAlign: node.style?.align,
          }}
        >
          <span className="cg-card-icon">
            {node.props?.icon === "clock"
              ? "◷"
              : node.props?.icon === "layers"
                ? "▱"
                : "⌁"}
          </span>
          <span className="cg-card-copy">{node.text}</span>
          <span className="cg-card-check">↗</span>
        </div>
      );
    if (node.type === "cta")
      return (
        <div
          className="cg-cta"
          style={{
            fontSize: size(node.style?.fontSize ?? (portrait ? 30 : 32)),
            fontWeight: node.style?.fontWeight,
            color: node.style?.color,
            textAlign: node.style?.align,
          }}
        >
          <span style={{ flex: 1 }}>{node.text}</span>
          <span className="cg-cta-arrow">↗</span>
        </div>
      );
    if (node.type === "caption")
      return (
        <div
          className="cg-caption"
          style={{
            fontSize: size(node.style?.fontSize ?? 25),
            fontWeight: node.style?.fontWeight,
            color: node.style?.color,
            textAlign: node.style?.align,
          }}
        >
          {node.text}
        </div>
      );
    return (
      <div
        className={`cg-text cg-${node.role ?? "body"}`}
        style={{
          fontSize: size(
            node.style?.fontSize ??
              (node.role === "headline"
                ? portrait
                  ? 93
                  : 112
                : node.role === "eyebrow"
                  ? portrait
                    ? 22
                    : 22
                  : portrait
                    ? 32
                    : 32),
          ),
          fontWeight:
            node.style?.fontWeight ??
            (node.role === "headline"
              ? 800
              : node.role === "eyebrow"
                ? 650
                : 450),
          color: node.style?.color ?? foreground,
          textAlign: node.style?.align ?? "left",
          lineHeight:
            node.role === "headline"
              ? 1.04
              : node.role === "eyebrow"
                ? 1.3
                : 1.55,
        }}
      >
        {node.text}
      </div>
    );
  }
  return (
    <div
      ref={root}
      data-font-family={project.brand.fontFamily}
      className={`cg-composition ${portrait ? "cg-portrait" : ""}`}
      style={style}
      data-composition
      data-scene-id={scene.id}
      data-project-time={time}
    >
      {compiled.scenes
        .flatMap((s) => s.sentences)
        .filter((s) => s.audioAssetId && time >= s.start && time < s.end)
        .map((sentence) => {
          const asset = compiled.assets.find(
            (a) => a.id === sentence.audioAssetId,
          );
          return asset ? (
            <audio
              key={sentence.id + asset.id}
              src={asset.src}
              preload="metadata"
              data-project-time={time - sentence.start}
              data-slot-duration={sentence.duration}
            />
          ) : null;
        })}
      {legacyDecorations ? (
        <>
          <div
            className="cg-atmosphere"
            style={{
              transform: `translate(${Math.sin(localTime * 0.25) * 3}%,${Math.cos(localTime * 0.3) * 2}%)`,
            }}
          />
          <div className="cg-running-mark">
            <svg
              viewBox="0 0 50 22"
              style={{
                visibility: scene.nodes.some((n) => n.role === "brand-mark")
                  ? "hidden"
                  : undefined,
              }}
            >
              <path
                d="M1 14C6-6 9 28 17 8S26 0 29 14S37 23 42 7S47 14 49 5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.6"
                strokeLinecap="round"
              />
            </svg>
            <span>{compiled.brand.name}</span>
          </div>
          <div className="cg-scene-count">
            0{compiled.scenes.indexOf(scene) + 1}{" "}
            <span>/ 0{compiled.scenes.length}</span>
          </div>
        </>
      ) : null}
      {scene.nodes
        .filter((node) => activeTime >= node.start && activeTime < node.end)
        .map((node) => {
          const motion = entrance(
            activeTime,
            node.start,
            node.end,
            node.animation?.enter,
            node.animation?.delay,
          );
          const layout = node.layout;
          const nodeStyle: CSSProperties = {
            position: "absolute",
            left: `${layout.x}%`,
            top: `${layout.y}%`,
            width: `${layout.width}%`,
            height: `${layout.height}%`,
            opacity: motion.opacity,
            transform: `rotate(${layout.rotation ?? 0}deg) ${motion.transform}`,
            cursor: onSelect ? "pointer" : undefined,
          };
          return (
            <div
              key={node.id}
              className={`cg-node ${selectedNodeId === node.id ? "cg-selected" : ""}`}
              style={nodeStyle}
              data-node-id={node.id}
              data-node-type={node.type}
              data-node-role={node.role}
              data-layout-protected={
                node.overrides?.[ratio]?.protected ?? false
              }
              onClick={
                onSelect
                  ? (e) => {
                      e.stopPropagation();
                      onSelect(node.id);
                    }
                  : undefined
              }
              onPointerDown={
                onNodePointerDown
                  ? (e) => onNodePointerDown(e, node.id)
                  : undefined
              }
            >
              {content(node)}
            </div>
          );
        })}
      {legacyDecorations ? (
        <div className="cg-progress">
          <i style={{ width: `${clamp(time / compiled.duration) * 100}%` }} />
        </div>
      ) : null}
    </div>
  );
}
export const Stage = Composition;
export default Composition;
