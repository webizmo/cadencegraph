import type { MotionNode, Operation, Scene } from "../core";

export function LayerControls({
  node,
  scene,
  transact,
}: {
  node: MotionNode;
  scene?: Scene;
  transact: (operations: Operation[]) => unknown;
}) {
  const sentence = scene?.sentences.find(
    (s) => s.id === node.timing.sentenceId,
  );
  const limit = sentence ? Math.min(...Object.values(sentence.duration)) : 120;
  return (
    <>
      {!["media", "component"].includes(node.type) ? (
        <section className="property-section">
          <div className="section-label">TEXT STYLE · ALL LANGUAGES</div>
          <div className="transform-grid">
            <label className="number-field">
              <span>Size</span>
              <input
                aria-label="Font size"
                type="number"
                min="8"
                max="300"
                key={`${node.id}-${node.style?.fontSize}`}
                defaultValue={
                  node.style?.fontSize ?? (node.type === "text" ? 48 : 30)
                }
                onBlur={(e) => {
                  const fontSize = Number(e.target.value);
                  if (fontSize !== node.style?.fontSize)
                    transact([
                      {
                        type: "set-node-style",
                        nodeId: node.id,
                        style: { ...node.style, fontSize },
                      },
                    ]);
                }}
              />
            </label>
            <label className="number-field">
              <span>Weight</span>
              <select
                aria-label="Font weight"
                value={node.style?.fontWeight ?? 500}
                onChange={(e) =>
                  transact([
                    {
                      type: "set-node-style",
                      nodeId: node.id,
                      style: {
                        ...node.style,
                        fontWeight: Number(e.target.value),
                      },
                    },
                  ])
                }
              >
                {[300, 400, 500, 600, 700, 800].map((weight) => (
                  <option key={weight} value={weight}>
                    {weight}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="duration-field">
            <span>Alignment</span>
            <select
              aria-label="Text alignment"
              value={node.style?.align ?? "left"}
              onChange={(e) =>
                transact([
                  {
                    type: "set-node-style",
                    nodeId: node.id,
                    style: {
                      ...node.style,
                      align: e.target.value as "left" | "center" | "right",
                    },
                  },
                ])
              }
            >
              <option value="left">Left</option>
              <option value="center">Center</option>
              <option value="right">Right</option>
            </select>
          </label>
          <label className="duration-field">
            <span>Text color</span>
            <input
              aria-label="Text color"
              type="text"
              placeholder="Brand default"
              key={`${node.id}-${node.style?.color}`}
              defaultValue={node.style?.color ?? ""}
              onBlur={(e) => {
                const style = { ...node.style };
                if (e.target.value.trim()) style.color = e.target.value.trim();
                else delete style.color;
                transact([{ type: "set-node-style", nodeId: node.id, style }]);
              }}
            />
          </label>
        </section>
      ) : null}
      <section className="property-section">
        <div className="section-label">MOTION & LAYER TIMING</div>
        <label className="duration-field">
          <span>Entrance</span>
          <select
            aria-label="Entrance animation"
            value={node.animation?.enter ?? "rise"}
            onChange={(e) =>
              transact([
                {
                  type: "set-node-animation",
                  nodeId: node.id,
                  animation: {
                    ...node.animation,
                    enter: e.target.value as
                      "rise" | "scale" | "slide" | "fade",
                  },
                },
              ])
            }
          >
            <option value="rise">Rise</option>
            <option value="slide">Slide</option>
            <option value="scale">Scale</option>
            <option value="fade">Fade</option>
          </select>
        </label>
        <label className="duration-field">
          <span>Entrance delay</span>
          <input
            aria-label="Entrance delay"
            type="number"
            min="0"
            max="10"
            step="0.1"
            key={`${node.id}-${node.animation?.delay}`}
            defaultValue={node.animation?.delay ?? 0}
            onBlur={(e) =>
              transact([
                {
                  type: "set-node-animation",
                  nodeId: node.id,
                  animation: {
                    enter: node.animation?.enter ?? "rise",
                    delay: Number(e.target.value),
                  },
                },
              ])
            }
          />
        </label>
        <label className="duration-field">
          <span>Start offset</span>
          <input
            aria-label="Layer start offset"
            type="number"
            min="0"
            max={limit}
            step="0.1"
            key={`${node.id}-${node.timing.start}`}
            defaultValue={node.timing.start ?? 0}
            onBlur={(e) =>
              transact([
                {
                  type: "set-node-timing",
                  nodeId: node.id,
                  timing: { ...node.timing, start: Number(e.target.value) },
                },
              ])
            }
          />
        </label>
        <label className="duration-field">
          <span>End offset</span>
          <input
            aria-label="Layer end offset"
            type="number"
            min="0.1"
            max={limit}
            step="0.1"
            placeholder="Follow sentence"
            key={`${node.id}-${node.timing.end}`}
            defaultValue={node.timing.end ?? ""}
            onBlur={(e) => {
              const timing = { ...node.timing };
              if (e.target.value === "") delete timing.end;
              else timing.end = Number(e.target.value);
              transact([{ type: "set-node-timing", nodeId: node.id, timing }]);
            }}
          />
        </label>
        <p className="field-hint">
          Offsets and motion apply to every language. Leave end empty to follow
          the sentence. Fixed offsets must fit the shortest language ({limit}s).
        </p>
      </section>
    </>
  );
}
