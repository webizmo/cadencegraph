import type {
  Asset,
  Brand,
  Change,
  Conflict,
  MotionNode,
  Operation,
  Project,
  Transaction,
  TransactionResult,
} from "./types";
import {
  checkJsonSafety,
  finite,
  isRatio,
  isRecord,
  parseProject,
  validateProject,
} from "./validation";

const operationKeys: Record<string, string[]> = {
  "set-text": ["type", "nodeId", "locale", "text"],
  "set-sentence-text": ["type", "sentenceId", "locale", "text"],
  "set-layout": ["type", "nodeId", "ratio", "layout", "protect"],
  "set-brand": ["type", "brand"],
  "set-sentence-duration": ["type", "sentenceId", "locale", "duration"],
  "set-sentence-audio": ["type", "sentenceId", "locale", "asset", "duration"],
  "set-node-media": ["type", "nodeId", "asset"],
  "add-asset": ["type", "asset"],
  "add-node": ["type", "sceneId", "node"],
  "remove-node": ["type", "nodeId"],
  "set-protection": ["type", "nodeId", "ratio", "protected"],
};

/** Parse proposals from remote models without trusting a TypeScript assertion. */
export function parseOperations(value: unknown): Operation[] {
  const safety = checkJsonSafety(value);
  if (safety) throw new Error(safety);
  if (!Array.isArray(value) || !value.length || value.length > 100)
    throw new Error("A transaction must have 1–100 operations.");
  value.forEach((op, i) => {
    const fail = (message: string): never => {
      throw new Error(`Operation ${i + 1}: ${message}`);
    };
    if (
      !isRecord(op) ||
      typeof op.type !== "string" ||
      !Object.hasOwn(operationKeys, op.type)
    )
      fail("Unsupported operation.");
    const obj = op as Record<string, unknown>;
    const type = obj.type as string;
    for (const key of Object.keys(obj))
      if (!operationKeys[type].includes(key)) fail(`Unknown field ${key}.`);
    for (const key of ["nodeId", "sentenceId", "sceneId", "locale"])
      if (
        operationKeys[type].includes(key) &&
        (typeof obj[key] !== "string" || !(obj[key] as string).trim())
      )
        fail(`${key} is required.`);
    if (
      ["set-text", "set-sentence-text"].includes(type) &&
      (typeof obj.text !== "string" || obj.text.length > 4000)
    )
      fail("text must be a string up to 4,000 characters.");
    if (["set-layout", "set-protection"].includes(type) && !isRatio(obj.ratio))
      fail("ratio must be 16:9 or 9:16.");
    if (type === "set-protection" && typeof obj.protected !== "boolean")
      fail("protected must be a boolean.");
    if (type === "set-layout") {
      if (obj.protect !== undefined && typeof obj.protect !== "boolean")
        fail("protect must be a boolean.");
      if (!isRecord(obj.layout) || !Object.keys(obj.layout).length)
        fail("layout must have at least one property.");
      for (const [key, val] of Object.entries(
        obj.layout as Record<string, unknown>,
      ))
        if (
          !["x", "y", "width", "height", "rotation"].includes(key) ||
          !finite(val)
        )
          fail("layout contains an invalid field or non-finite value.");
    }
    if (type === "set-brand") {
      if (!isRecord(obj.brand) || !Object.keys(obj.brand).length)
        fail("brand must have at least one property.");
      for (const [key, val] of Object.entries(
        obj.brand as Record<string, unknown>,
      ))
        if (
          ![
            "name",
            "accent",
            "background",
            "foreground",
            "fontFamily",
          ].includes(key) ||
          typeof val !== "string"
        )
          fail("brand contains an invalid field.");
    }
    if (
      ["set-sentence-duration", "set-sentence-audio"].includes(type) &&
      (!finite(obj.duration) || obj.duration < 0.2 || obj.duration > 120)
    )
      fail("duration must be 0.2–120 seconds.");
    if (["set-sentence-audio", "set-node-media", "add-asset"].includes(type)) {
      if (!isRecord(obj.asset)) fail("asset must be an object.");
      for (const key of Object.keys(obj.asset as Record<string, unknown>))
        if (!["id", "type", "src", "name", "license"].includes(key))
          fail(`Unknown asset field ${key}.`);
    }
    if (type === "add-node" && !isRecord(obj.node))
      fail("node must be an object.");
  });
  return structuredClone(value) as Operation[];
}

export function parseTransaction(value: unknown): Transaction {
  const safety = checkJsonSafety(value);
  if (safety) throw new Error(safety);
  if (!isRecord(value)) throw new Error("Transaction must be an object.");
  for (const key of Object.keys(value))
    if (!["id", "baseRevision", "actor", "operations"].includes(key))
      throw new Error(`Unknown transaction field: ${key}.`);
  if (
    typeof value.id !== "string" ||
    !/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,95}$/.test(value.id)
  )
    throw new Error("Transaction id must be an identifier or UUID.");
  if (
    !Number.isSafeInteger(value.baseRevision) ||
    (value.baseRevision as number) < 0
  )
    throw new Error("baseRevision must be a non-negative safe integer.");
  if (value.actor !== "human" && value.actor !== "ai")
    throw new Error("actor must be human or ai.");
  return {
    id: value.id,
    baseRevision: value.baseRevision as number,
    actor: value.actor,
    operations: parseOperations(value.operations),
  };
}

export function applyTransaction(
  input: Project,
  transaction: Transaction,
): TransactionResult {
  const reject = (conflicts: Conflict[]): TransactionResult => ({
    project: input,
    applied: false,
    conflicts,
    changes: [],
  });
  const invalid = validateProject(input);
  if (invalid.length)
    return reject([
      {
        code: "invalid-project",
        message: invalid.map((x) => x.message).join(" "),
      },
    ]);
  try {
    transaction = parseTransaction(transaction);
  } catch (error) {
    return reject([
      { code: "invalid-operation", message: (error as Error).message },
    ]);
  }
  if (transaction.baseRevision !== input.revision)
    return reject([
      {
        code: "stale-revision",
        message: `Proposal targets revision ${transaction.baseRevision}; current revision is ${input.revision}. Refresh the proposal before applying.`,
      },
    ]);
  let operations: Operation[];
  try {
    operations = parseOperations(transaction.operations);
  } catch (error) {
    return reject([
      { code: "invalid-operation", message: (error as Error).message },
    ]);
  }
  const project = structuredClone(input);
  const conflicts: Conflict[] = [];
  const changes: Change[] = [];
  const sameAsset = (a: Asset, b: Asset) =>
    ["id", "type", "src", "name", "license"].every(
      (key) => a[key as keyof Asset] === b[key as keyof Asset],
    );
  operations.forEach((operation, operationIndex) => {
    const conflict = (
      code: Conflict["code"],
      message: string,
      nodeId?: string,
    ) =>
      conflicts.push({
        code,
        message,
        operationIndex,
        ...(nodeId ? { nodeId } : {}),
      });
    const nodeId = "nodeId" in operation ? operation.nodeId : undefined;
    const scene = nodeId
      ? project.scenes.find((s) => s.nodes.some((n) => n.id === nodeId))
      : undefined;
    const node = nodeId ? scene?.nodes.find((n) => n.id === nodeId) : undefined;
    if (nodeId && !node) {
      conflict("not-found", `Node ${nodeId} does not exist.`, nodeId);
      return;
    }
    if ("locale" in operation && !project.locales.includes(operation.locale)) {
      conflict("invalid-operation", `Undeclared locale: ${operation.locale}`);
      return;
    }
    if ("ratio" in operation && !project.ratios.includes(operation.ratio)) {
      conflict("invalid-operation", `Undeclared ratio: ${operation.ratio}`);
      return;
    }
    const change: Change = {
      operation: operation.type,
      target: nodeId ?? project.id,
      description: "",
      locales: [...project.locales],
      ratios: [...project.ratios],
    };
    switch (operation.type) {
      case "set-text":
        node!.content[operation.locale] = operation.text;
        change.locales = [operation.locale];
        change.description = `Updated ${operation.locale} text on ${nodeId}.`;
        break;
      case "set-sentence-text": {
        const sentence = project.scenes
          .flatMap((s) => s.sentences)
          .find((s) => s.id === operation.sentenceId);
        if (!sentence) {
          conflict(
            "not-found",
            `Sentence ${operation.sentenceId} does not exist.`,
          );
          return;
        }
        sentence.text[operation.locale] = operation.text;
        change.target = sentence.id;
        change.locales = [operation.locale];
        change.description = `Updated ${operation.locale} narration text. Audio must be reviewed separately.`;
        break;
      }
      case "set-layout": {
        const previous = node!.overrides?.[operation.ratio];
        if (transaction.actor === "ai" && previous?.protected) {
          conflict(
            "protected-layout",
            `${nodeId} has a protected ${operation.ratio} layout.`,
            nodeId,
          );
          return;
        }
        if (transaction.actor === "ai" && operation.protect !== undefined) {
          conflict(
            "protected-layout",
            "Only a human may change protection.",
            nodeId,
          );
          return;
        }
        node!.overrides ??= {};
        node!.overrides[operation.ratio] = {
          layout: { ...previous?.layout, ...operation.layout },
          protected:
            transaction.actor === "human"
              ? (operation.protect ?? true)
              : (previous?.protected ?? false),
        };
        change.ratios = [operation.ratio];
        change.description = `Moved ${nodeId} in ${operation.ratio}${node!.overrides[operation.ratio]!.protected ? "; manual layout protected" : ""}.`;
        break;
      }
      case "set-protection": {
        if (transaction.actor !== "human") {
          conflict(
            "protected-layout",
            "Only a human may change protection.",
            nodeId,
          );
          return;
        }
        node!.overrides ??= {};
        node!.overrides[operation.ratio] = {
          layout: node!.overrides[operation.ratio]?.layout ?? {},
          protected: operation.protected,
        };
        change.ratios = [operation.ratio];
        change.description = `${operation.protected ? "Protected" : "Unlocked"} ${nodeId} in ${operation.ratio}.`;
        break;
      }
      case "set-brand":
        project.brand = { ...project.brand, ...operation.brand } as Brand;
        change.description = "Updated shared brand across all variants.";
        break;
      case "set-sentence-duration": {
        const sentence = project.scenes
          .flatMap((s) => s.sentences)
          .find((s) => s.id === operation.sentenceId);
        if (!sentence) {
          conflict(
            "not-found",
            `Sentence ${operation.sentenceId} does not exist.`,
          );
          return;
        }
        sentence.duration[operation.locale] = operation.duration;
        change.target = sentence.id;
        change.locales = [operation.locale];
        change.description = `Retimed ${sentence.id} to ${operation.duration}s in ${operation.locale}; dependent events follow.`;
        break;
      }
      case "set-sentence-audio": {
        if (transaction.actor !== "human") {
          conflict(
            "invalid-operation",
            "Audio replacement requires a human media selection.",
          );
          return;
        }
        const sentence = project.scenes
          .flatMap((s) => s.sentences)
          .find((s) => s.id === operation.sentenceId);
        if (!sentence) {
          conflict(
            "not-found",
            `Sentence ${operation.sentenceId} does not exist.`,
          );
          return;
        }
        if (operation.asset.type !== "audio") {
          conflict(
            "invalid-operation",
            "Sentence audio must be an audio asset.",
          );
          return;
        }
        const existing = project.assets.find(
          (a) => a.id === operation.asset.id,
        );
        if (existing && !sameAsset(existing, operation.asset)) {
          conflict(
            "invalid-operation",
            "Asset ID already exists with different metadata. Use a new stable ID.",
          );
          return;
        }
        if (!existing) project.assets.push(structuredClone(operation.asset));
        sentence.audioAssetId ??= {};
        sentence.audioAssetId[operation.locale] = operation.asset.id;
        sentence.duration[operation.locale] = operation.duration;
        change.target = sentence.id;
        change.locales = [operation.locale];
        change.description = `Replaced ${operation.locale} narration and retimed ${sentence.id} to ${operation.duration}s.`;
        break;
      }
      case "set-node-media": {
        if (transaction.actor !== "human") {
          conflict(
            "invalid-operation",
            "Replacing media requires a human media selection.",
            nodeId,
          );
          return;
        }
        if (node!.type !== "media") {
          conflict(
            "invalid-operation",
            "Only a media node can receive a replacement image or video.",
            nodeId,
          );
          return;
        }
        if (
          operation.asset.type !== "image" &&
          operation.asset.type !== "video"
        ) {
          conflict(
            "invalid-operation",
            "Media replacement must be an image or video asset.",
            nodeId,
          );
          return;
        }
        const existing = project.assets.find(
          (a) => a.id === operation.asset.id,
        );
        if (existing && !sameAsset(existing, operation.asset)) {
          conflict(
            "invalid-operation",
            "Asset ID already exists with different metadata. Use a new stable ID.",
            nodeId,
          );
          return;
        }
        if (!existing) project.assets.push(structuredClone(operation.asset));
        node!.assetId = operation.asset.id;
        change.description = `Replaced media on ${nodeId}; identity, timing and layout preserved.`;
        break;
      }
      case "add-asset": {
        if (transaction.actor !== "human") {
          conflict(
            "invalid-operation",
            "Adding an asset requires a human media selection.",
          );
          return;
        }
        project.assets.push(structuredClone(operation.asset));
        change.target = operation.asset.id;
        change.description = `Added media asset ${operation.asset.name ?? operation.asset.id}.`;
        break;
      }
      case "add-node": {
        const target = project.scenes.find((s) => s.id === operation.sceneId);
        if (!target) {
          conflict("not-found", `Scene ${operation.sceneId} does not exist.`);
          return;
        }
        // Models cannot inject their own protection and then remove/replace a user's node.
        if (
          transaction.actor === "ai" &&
          Object.values(operation.node.overrides ?? {}).some(
            (o) => o?.protected,
          )
        ) {
          conflict(
            "protected-layout",
            "AI-created nodes cannot establish manual protection.",
          );
          return;
        }
        target.nodes.push(structuredClone(operation.node));
        change.target = operation.node.id;
        change.description = `Added ${operation.node.id} to ${target.name}.`;
        break;
      }
      case "remove-node":
        if (
          transaction.actor === "ai" &&
          Object.values(node!.overrides ?? {}).some((o) => o?.protected)
        ) {
          conflict(
            "protected-layout",
            `${nodeId} has manual layout protection and cannot be removed by AI.`,
            nodeId,
          );
          return;
        }
        scene!.nodes = scene!.nodes.filter((n) => n.id !== nodeId);
        change.description = `Removed ${nodeId}.`;
        break;
    }
    changes.push(change);
  });
  if (conflicts.length) return reject(conflicts);
  project.revision += 1;
  const issues = validateProject(project);
  if (issues.length)
    return reject([
      {
        code: "invalid-project",
        message: issues.map((x) => `${x.path}: ${x.message}`).join("\n"),
      },
    ]);
  return {
    project,
    applied: true,
    conflicts: [],
    changes,
    undo: structuredClone(input),
  };
}

/** Undo restores content, but revision stays monotonic so old AI proposals remain stale. */
export function undoTransaction(current: Project, previous: Project): Project {
  const restored = parseProject(previous);
  if (current.id !== previous.id)
    throw new Error("Cannot undo a different project.");
  restored.revision = current.revision + 1;
  return restored;
}

export function findNode(
  project: Project,
  nodeId: string,
): MotionNode | undefined {
  return project.scenes
    .flatMap((scene) => scene.nodes)
    .find((node) => node.id === nodeId);
}
