import { useEffect, useRef, useState } from "react";
import {
  LockKeyhole,
  UnlockKeyhole,
  Link2,
  MoveUpRight,
  AudioLines,
  LoaderCircle,
  Upload,
} from "lucide-react";
import type {
  Asset,
  MotionNode,
  Operation,
  AspectRatio as Ratio,
  Scene,
} from "../core";

import { uploadMedia } from "./api";

interface Props {
  assets: Asset[];
  node?: MotionNode;
  scene?: Scene;
  locale: string;
  ratio: Ratio;
  transact: (ops: Operation[]) => unknown;
}
export function Inspector({
  assets,
  node,
  scene,
  locale,
  ratio,
  transact,
}: Props) {
  const mediaInput = useRef<HTMLInputElement>(null);
  const [mediaUploading, setMediaUploading] = useState(false);
  const [mediaError, setMediaError] = useState("");
  const audioInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [audioError, setAudioError] = useState("");
  const [text, setText] = useState(node?.content[locale] || "");
  useEffect(
    () => setText(node?.content[locale] || ""),
    [node?.id, node?.content[locale], locale],
  );
  if (!node)
    return (
      <div className="empty-state">
        <MoveUpRight size={22} />
        <p>Select a layer to edit its content, timing, and layout.</p>
      </div>
    );
  const layout = { ...node.layout, ...node.overrides?.[ratio]?.layout };
  const protectedLayout = node.overrides?.[ratio]?.protected ?? false;
  const sentence = scene?.sentences.find(
    (sentence) => sentence.id === node.timing.sentenceId,
  );
  const visualAsset = assets.find((asset) => asset.id === node.assetId);
  const importVisual = async (file?: File) => {
    if (!file) return;
    setMediaUploading(true);
    setMediaError("");
    try {
      const result = await uploadMedia(file);
      if (!["image", "video"].includes(result.asset.type))
        throw new Error("Choose an image or video file.");
      transact([
        { type: "set-node-media", nodeId: node.id, asset: result.asset },
      ]);
    } catch (error) {
      setMediaError(
        error instanceof Error ? error.message : "Media import failed.",
      );
    } finally {
      setMediaUploading(false);
      if (mediaInput.current) mediaInput.current.value = "";
    }
  };
  const audioAsset = assets.find(
    (asset) => asset.id === sentence?.audioAssetId?.[locale],
  );
  const importAudio = async (file?: File) => {
    if (!file || !sentence) return;
    setUploading(true);
    setAudioError("");
    try {
      const result = await uploadMedia(file);
      if (result.asset.type !== "audio" || !result.duration)
        throw new Error("Choose an audio file with a readable duration.");
      transact([
        {
          type: "set-sentence-audio",
          sentenceId: sentence.id,
          locale,
          asset: result.asset,
          duration: result.duration,
        },
      ]);
    } catch (error) {
      setAudioError(
        error instanceof Error ? error.message : "Audio import failed.",
      );
    } finally {
      setUploading(false);
      if (audioInput.current) audioInput.current.value = "";
    }
  };
  const updateLayout = (key: "x" | "y" | "width" | "height", value: number) => {
    if (!Number.isFinite(value) || value === layout[key]) return;
    transact([
      {
        type: "set-layout",
        nodeId: node.id,
        ratio,
        layout: { [key]: value },
        protect: true,
      },
    ]);
  };
  return (
    <div className="inspector-content">
      <div className="inspector-identity">
        <span className="type-square">
          {node.type.slice(0, 1).toUpperCase()}
        </span>
        <div>
          <strong>{node.role || node.type}</strong>
          <small className="mono">{node.id}</small>
        </div>
      </div>
      <section className="property-section">
        <div className="section-label">
          <span>
            {node.type === "component"
              ? "DESCRIPTION"
              : node.type === "media"
                ? "ALT TEXT"
                : "CONTENT"}
          </span>
          <span className="mini-badge">{locale.toUpperCase()}</span>
        </div>
        <label className="sr-only" htmlFor="layer-content">
          Layer text
        </label>
        <textarea
          id="layer-content"
          value={text}
          onChange={(event) => setText(event.target.value)}
          onBlur={() => {
            if (text !== node.content[locale])
              transact([{ type: "set-text", nodeId: node.id, locale, text }]);
          }}
          rows={4}
        />
        <p className="field-hint">
          {node.type === "component"
            ? "Semantic description. This component’s visual design is defined in its registered code."
            : "Text changes apply to this language."}
        </p>
      </section>
      {node.type === "media" ? (
        <section className="property-section">
          <div className="section-label">
            <span>MEDIA SOURCE</span>
            <span className="mini-badge">{visualAsset?.type || "MEDIA"}</span>
          </div>
          {visualAsset ? (
            <div className="media-source-preview">
              {visualAsset.type === "video" ? (
                <video
                  src={visualAsset.src}
                  controls
                  muted
                  playsInline
                  preload="metadata"
                />
              ) : (
                <img
                  src={visualAsset.src}
                  alt={text || visualAsset.name || "Selected media"}
                />
              )}
            </div>
          ) : null}
          <span className="narration-name">
            {visualAsset?.name || node.assetId || "No media selected"}
          </span>
          <button
            className="button full"
            onClick={() => mediaInput.current?.click()}
            disabled={mediaUploading}
          >
            {mediaUploading ? (
              <LoaderCircle size={14} className="spin" />
            ) : (
              <Upload size={14} />
            )}{" "}
            {mediaUploading ? "Importing media…" : "Replace image / video"}
          </button>
          <input
            ref={mediaInput}
            className="sr-only"
            type="file"
            accept="image/png,image/jpeg,image/webp,video/mp4,video/webm"
            aria-label="Replace layer media"
            onChange={(event) => void importVisual(event.target.files?.[0])}
          />
          <p className="field-hint">
            PNG, JPEG, WebP, MP4 or WebM · up to 20 MB. Your layout and layer
            identity stay intact.
          </p>
          {mediaError ? (
            <div className="message error" role="alert">
              {mediaError}
            </div>
          ) : null}
        </section>
      ) : null}
      <section className="property-section">
        <div className="section-label">
          <span>TRANSFORM</span>
          <span className="mini-badge">{ratio}</span>
        </div>
        <div className="transform-grid">
          {(["x", "y", "width", "height"] as const).map((key) => (
            <label
              key={`${node.id}-${ratio}-${key}-${layout[key]}`}
              className="number-field"
            >
              <span>
                {key === "width"
                  ? "W"
                  : key === "height"
                    ? "H"
                    : key.toUpperCase()}
              </span>
              <input
                aria-label={`Layer ${key}`}
                type="number"
                min={key === "width" || key === "height" ? 1 : -100}
                max={200}
                step="0.1"
                defaultValue={Number(layout[key].toFixed(1))}
                onBlur={(event) =>
                  updateLayout(key, Number(event.target.value))
                }
                onKeyDown={(event) => {
                  if (event.key === "Enter") event.currentTarget.blur();
                }}
              />
              <span>%</span>
            </label>
          ))}
        </div>
        <button
          className={`protection-toggle ${protectedLayout ? "protected" : ""}`}
          onClick={() =>
            transact([
              {
                type: "set-protection",
                nodeId: node.id,
                ratio,
                protected: !protectedLayout,
              },
            ])
          }
        >
          {protectedLayout ? (
            <LockKeyhole size={14} />
          ) : (
            <UnlockKeyhole size={14} />
          )}
          <span>
            {protectedLayout
              ? "Manual layout protected"
              : "Layout open to AI edits"}
          </span>
          <span className={`switch ${protectedLayout ? "on" : ""}`} />
        </button>
        <p className="field-hint">
          Moving a layer protects this ratio from AI layout changes.
        </p>
      </section>
      <section className="property-section">
        <div className="section-label">
          <span>SEMANTIC TIMING</span>
          <Link2 size={13} />
        </div>
        <div className="anchor-label">
          <span className="anchor-dot" />
          <span>{sentence?.id || node.timing.sentenceId}</span>
        </div>
        <p className="sentence-copy">{sentence?.text[locale]}</p>
        {sentence ? (
          <label className="duration-field">
            <span>Sentence duration</span>
            <div>
              <input
                aria-label="Sentence duration"
                type="number"
                min="0.5"
                max="120"
                step="0.1"
                key={`${sentence.id}-${locale}-${sentence.duration[locale]}`}
                defaultValue={sentence.duration[locale]}
                onBlur={(event) => {
                  const duration = Number(event.target.value);
                  if (
                    Number.isFinite(duration) &&
                    duration > 0 &&
                    duration !== sentence.duration[locale]
                  )
                    transact([
                      {
                        type: "set-sentence-duration",
                        sentenceId: sentence.id,
                        locale,
                        duration,
                      },
                    ]);
                }}
              />
              <span>s</span>
            </div>
          </label>
        ) : null}
        <p className="field-hint">
          Attached layers follow this sentence when its duration changes.
        </p>
        {sentence ? (
          <div className="narration-upload">
            <button
              className="button full"
              onClick={() => audioInput.current?.click()}
              disabled={uploading}
            >
              {uploading ? (
                <LoaderCircle size={14} className="spin" />
              ) : (
                <Upload size={14} />
              )}{" "}
              {uploading
                ? "Importing audio…"
                : audioAsset
                  ? "Replace narration"
                  : "Import narration"}
            </button>
            <input
              ref={audioInput}
              className="sr-only"
              type="file"
              accept="audio/mpeg,audio/wav,audio/x-wav,audio/ogg,audio/mp4,audio/x-m4a"
              aria-label="Import narration audio"
              onChange={(event) => void importAudio(event.target.files?.[0])}
            />
            {audioAsset ? (
              <>
                <span className="narration-name">
                  <AudioLines size={12} />
                  {audioAsset.name || audioAsset.id}
                </span>
                <audio
                  controls
                  src={audioAsset.src}
                  preload="metadata"
                  aria-label="Narration audio preview"
                />
              </>
            ) : null}
            <p className="field-hint">
              WAV, MP3, OGG or M4A · up to 20 MB. The clip duration retimes this
              language.
            </p>
            {audioError ? (
              <div className="message error" role="alert">
                {audioError}
              </div>
            ) : null}
          </div>
        ) : null}
      </section>
      <div className="inspector-foot">
        <span className="status-dot" /> Stable identity across all variants
      </div>
    </div>
  );
}
