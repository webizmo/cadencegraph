import { useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Copy,
  ImagePlus,
  LoaderCircle,
  Plus,
  Trash2,
} from "lucide-react";
import {
  BRAND_PRESETS,
  createNode,
  type Asset,
  type MotionNode,
  type Operation,
  type Project,
  type Scene,
} from "../core";
import { uploadMedia } from "./api";

export interface AuthorSelection {
  sceneId: string;
  nodeId?: string;
}
export type AuthorEdit = (
  operations: Operation[],
  selection?: AuthorSelection,
) => boolean;

export function ProjectName({
  name,
  onRename,
}: {
  name: string;
  onRename: (name: string) => void;
}) {
  const [draft, setDraft] = useState(name);
  useEffect(() => setDraft(name), [name]);
  const commit = () => {
    const next = draft.trim();
    if (next && next !== name) onRename(next);
    else setDraft(name);
  };
  return (
    <input
      className="project-name-input"
      aria-label="Project name"
      maxLength={200}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") {
          setDraft(name);
        }
      }}
    />
  );
}

export function AuthoringPanel({
  project,
  scene,
  node,
  edit,
}: {
  project: Project;
  scene: Scene;
  node?: MotionNode;
  edit: AuthorEdit;
}) {
  const [sceneName, setSceneName] = useState(scene.name);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const mediaInput = useRef<HTMLInputElement>(null);
  const currentProject = useRef(project);
  currentProject.current = project;
  useEffect(() => setSceneName(scene.name), [scene.id, scene.name]);
  const sceneIndex = project.scenes.findIndex((value) => value.id === scene.id);
  const nodeIndex = scene.nodes.findIndex((value) => value.id === node?.id);
  const visualAssets = project.assets.filter((asset) =>
    ["image", "video"].includes(asset.type),
  );
  const preset = BRAND_PRESETS.find((value) =>
    Object.entries(value.brand).every(
      ([key, value]) => project.brand[key as keyof Project["brand"]] === value,
    ),
  );
  const add = (type: "text" | "card" | "caption" | "cta", asset?: Asset) => {
    const id = `layer-${crypto.randomUUID().slice(0, 12)}`;
    const created = createNode(
      asset ? "media" : type,
      id,
      scene.sentences[0].id,
      project.locales,
      asset?.id,
    );
    edit([{ type: "add-node", sceneId: scene.id, node: created }], {
      sceneId: scene.id,
      nodeId: id,
    });
  };
  const importVisual = async (file?: File) => {
    if (!file) return;
    const targetProjectId = project.id;
    const targetSceneId = scene.id;
    setUploading(true);
    setError("");
    try {
      const { asset } = await uploadMedia(file);
      if (!["image", "video"].includes(asset.type))
        throw new Error("Choose an image or video file.");
      const latest = currentProject.current;
      const target = latest.scenes.find((value) => value.id === targetSceneId);
      if (latest.id !== targetProjectId || !target)
        throw new Error(
          "The destination scene changed. Select a scene and upload again.",
        );
      const id = `media-${crypto.randomUUID().slice(0, 12)}`;
      const added = edit(
        [
          { type: "add-asset", asset },
          {
            type: "add-node",
            sceneId: target.id,
            node: createNode(
              "media",
              id,
              target.sentences[0].id,
              latest.locales,
              asset.id,
            ),
          },
        ],
        { sceneId: target.id, nodeId: id },
      );
      if (!added)
        throw new Error("The media could not be added to this scene.");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Media upload failed.");
    } finally {
      setUploading(false);
      if (mediaInput.current) mediaInput.current.value = "";
    }
  };
  return (
    <div className="authoring-panel">
      <details className="scene-settings">
        <summary>
          <span>Scene & design</span>
          <span>{scene.name}</span>
        </summary>
        <div className="authoring-settings">
          <label className="author-field">
            <span>Scene name</span>
            <input
              aria-label="Scene name"
              maxLength={200}
              value={sceneName}
              onChange={(event) => setSceneName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur();
              }}
              onBlur={() => {
                if (sceneName.trim() && sceneName.trim() !== scene.name)
                  edit([
                    {
                      type: "set-scene",
                      sceneId: scene.id,
                      name: sceneName.trim(),
                    },
                  ]);
                else setSceneName(scene.name);
              }}
            />
          </label>
          <div className="author-action-row" aria-label="Scene actions">
            <button
              className="button"
              aria-label="Move scene earlier"
              title="Move scene earlier"
              disabled={sceneIndex === 0}
              onClick={() =>
                edit(
                  [
                    {
                      type: "move-scene",
                      sceneId: scene.id,
                      index: sceneIndex - 1,
                    },
                  ],
                  { sceneId: scene.id, nodeId: node?.id },
                )
              }
            >
              <ArrowUp size={14} />
            </button>
            <button
              className="button"
              aria-label="Move scene later"
              title="Move scene later"
              disabled={sceneIndex === project.scenes.length - 1}
              onClick={() =>
                edit(
                  [
                    {
                      type: "move-scene",
                      sceneId: scene.id,
                      index: sceneIndex + 1,
                    },
                  ],
                  { sceneId: scene.id, nodeId: node?.id },
                )
              }
            >
              <ArrowDown size={14} />
            </button>
            <button
              className="button"
              aria-label="Duplicate scene"
              title="Duplicate scene"
              onClick={() => {
                const newId = `scene-${crypto.randomUUID().slice(0, 12)}`;
                edit([{ type: "duplicate-scene", sceneId: scene.id, newId }], {
                  sceneId: newId,
                });
              }}
            >
              <Copy size={14} /> Duplicate
            </button>
            <button
              className="button danger-action"
              aria-label="Delete scene"
              title={
                project.scenes.length === 1
                  ? "Keep at least one scene"
                  : "Delete scene (undo available)"
              }
              disabled={project.scenes.length === 1}
              onClick={() => {
                const next =
                  project.scenes[sceneIndex - 1] ||
                  project.scenes[sceneIndex + 1];
                if (next)
                  edit([{ type: "remove-scene", sceneId: scene.id }], {
                    sceneId: next.id,
                  });
              }}
            >
              <Trash2 size={14} />
            </button>
          </div>
          <div className="author-field-pair">
            <label className="author-field">
              <span>Scene colors</span>
              <select
                aria-label="Scene colors"
                value={scene.theme || "brand"}
                onChange={(event) =>
                  edit([
                    {
                      type: "set-scene",
                      sceneId: scene.id,
                      theme: event.target.value as "brand" | "inverted",
                    },
                  ])
                }
              >
                <option value="brand">Brand</option>
                <option value="inverted">Inverted</option>
              </select>
            </label>
            <label className="author-field">
              <span>Project design</span>
              <select
                aria-label="Project design"
                value={preset?.id || "custom"}
                onChange={(event) => {
                  const selected = BRAND_PRESETS.find(
                    (value) => value.id === event.target.value,
                  );
                  if (selected)
                    edit([{ type: "set-brand", brand: selected.brand }]);
                }}
              >
                <option value="custom" disabled>
                  Custom
                </option>
                {BRAND_PRESETS.map((value) => (
                  <option key={value.id} value={value.id}>
                    {value.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="field-hint">
            Design applies to every scene. Manual layer positions stay
            protected.
          </p>
        </div>
      </details>
      <div className="layer-creation">
        <div className="section-label">
          <span>ADD TO THIS SCENE</span>
          <Plus size={12} />
        </div>
        <div className="layer-type-grid">
          {(["text", "card", "caption", "cta"] as const).map((type) => (
            <button
              key={type}
              className="button"
              aria-label={`Insert ${type === "cta" ? "CTA" : type} layer`}
              onClick={() => add(type)}
            >
              {type === "cta" ? "CTA" : type[0].toUpperCase() + type.slice(1)}
            </button>
          ))}
        </div>
        <button
          className="button full add-media-button"
          onClick={() => mediaInput.current?.click()}
          disabled={uploading}
        >
          {uploading ? (
            <LoaderCircle size={14} className="spin" />
          ) : (
            <ImagePlus size={14} />
          )}
          {uploading ? "Uploading media…" : "Add image or video"}
        </button>
        <input
          ref={mediaInput}
          type="file"
          className="sr-only"
          aria-label="Add image or video file"
          accept="image/png,image/jpeg,image/webp,video/mp4,video/webm"
          onChange={(event) => void importVisual(event.target.files?.[0])}
        />
        {visualAssets.length ? (
          <select
            className="reuse-asset-select"
            aria-label="Insert existing media"
            value=""
            onChange={(event) => {
              const asset = visualAssets.find(
                (value) => value.id === event.target.value,
              );
              if (asset) add("text", asset);
            }}
          >
            <option value="">Reuse project media…</option>
            {visualAssets.map((asset) => (
              <option key={asset.id} value={asset.id}>
                Reuse: {asset.name || asset.id}
              </option>
            ))}
          </select>
        ) : null}
        {error ? (
          <p className="inline-error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
      {node ? (
        <div
          className="selected-layer-actions"
          aria-label="Selected layer actions"
        >
          <span>Layer</span>
          <button
            className="icon-button"
            aria-label="Move layer backward"
            title="Move layer backward"
            disabled={nodeIndex === 0}
            onClick={() =>
              edit([
                { type: "move-node", nodeId: node.id, index: nodeIndex - 1 },
              ])
            }
          >
            <ArrowUp size={14} />
          </button>
          <button
            className="icon-button"
            aria-label="Move layer forward"
            title="Move layer forward"
            disabled={nodeIndex === scene.nodes.length - 1}
            onClick={() =>
              edit([
                { type: "move-node", nodeId: node.id, index: nodeIndex + 1 },
              ])
            }
          >
            <ArrowDown size={14} />
          </button>
          <button
            className="icon-button"
            aria-label="Duplicate layer"
            title="Duplicate layer"
            onClick={() => {
              const newId = `layer-${crypto.randomUUID().slice(0, 12)}`;
              edit([{ type: "duplicate-node", nodeId: node.id, newId }], {
                sceneId: scene.id,
                nodeId: newId,
              });
            }}
          >
            <Copy size={14} />
          </button>
          <button
            className="icon-button danger-action"
            aria-label="Delete layer"
            title="Delete layer (undo available)"
            onClick={() =>
              edit([{ type: "remove-node", nodeId: node.id }], {
                sceneId: scene.id,
                nodeId:
                  scene.nodes[nodeIndex - 1]?.id ||
                  scene.nodes[nodeIndex + 1]?.id,
              })
            }
          >
            <Trash2 size={14} />
          </button>
        </div>
      ) : (
        <p className="empty-scene-hint">
          A blank canvas. Add a layer to start your scene.
        </p>
      )}
    </div>
  );
}
