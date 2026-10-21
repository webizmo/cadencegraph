import type {
  Asset,
  Brand,
  Change,
  Conflict,
  MotionNode,
  Operation,
  Project,
  Scene,
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
import { nestedId } from "./ids";

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
  "add-scene": ["type", "scene", "index"],
  "remove-scene": ["type", "sceneId"],
  "move-scene": ["type", "sceneId", "index"],
  "set-scene": ["type", "sceneId", "name", "theme"],
  "set-project-name": ["type", "name"],
  "duplicate-scene": ["type", "sceneId", "newId"],
  "duplicate-node": ["type", "nodeId", "newId"],
  "move-node": ["type", "nodeId", "index"],
  "set-node-style": ["type", "nodeId", "style"],
  "set-node-animation": ["type", "nodeId", "animation"],
  "set-node-timing": ["type", "nodeId", "timing"],
  "remove-sentence-audio": ["type", "sentenceId", "locale"],
  "set-protection": ["type", "nodeId", "ratio", "protected"],
};

/** Reuse the project schema for nested operation payloads. Existing graph references
 * are represented by temporary assets/anchors and checked against the real graph at commit. */
function validateInsertedContent(
  value: Record<string, unknown>,
  kind: "node" | "scene",
) {
  const occupied = new Set<string>();
  const collect = (item: unknown) => {
    if (!item || typeof item !== "object") return;
    for (const [key, child] of Object.entries(item)) {
      if (key === "id" && typeof child === "string") occupied.add(child);
      collect(child);
    }
  };
  collect(value);
  const unique = (base: string) => {
    let id = base;
    while (occupied.has(id)) id += "-x";
    occupied.add(id);
    return id;
  };
  const localizedSource =
    kind === "node"
      ? value.content
      : Array.isArray(value.sentences) && isRecord(value.sentences[0])
        ? value.sentences[0].text
        : undefined;
  const locales = isRecord(localizedSource)
    ? Object.keys(localizedSource)
    : ["en"];
  const emptyText = Object.fromEntries(locales.map((locale) => [locale, ""]));
  const assets = new Map<string, Asset>();
  const reference = (id: unknown, type: "image" | "audio") => {
    if (typeof id === "string")
      assets.set(id, { id, type, src: "assets/validation-placeholder" });
  };
  const nodes =
    kind === "node" ? [value] : Array.isArray(value.nodes) ? value.nodes : [];
  const sentences =
    kind === "scene" && Array.isArray(value.sentences) ? value.sentences : [];
  for (const node of nodes)
    if (isRecord(node)) reference(node.assetId, "image");
  for (const sentence of sentences)
    if (isRecord(sentence) && isRecord(sentence.audioAssetId))
      for (const id of Object.values(sentence.audioAssetId))
        reference(id, "audio");
  const anchor =
    isRecord(value.timing) && typeof value.timing.sentenceId === "string"
      ? value.timing.sentenceId
      : unique("operation-anchor");
  occupied.add(anchor);
  for (const id of assets.keys()) occupied.add(id);
  const scene =
    kind === "scene"
      ? value
      : {
          id: unique("operation-scene"),
          name: "Operation validation",
          kind: "blank",
          sentences: [
            {
              id: anchor,
              text: emptyText,
              duration: Object.fromEntries(
                locales.map((locale) => [locale, 120]),
              ),
            },
          ],
          nodes: [value],
        };
  const issues = validateProject({
    schemaVersion: 1,
    id: unique("operation-project"),
    name: "Operation validation",
    revision: 0,
    locales,
    ratios: ["16:9", "9:16"],
    fps: 30,
    brand: {
      name: "Validation",
      accent: "#fff",
      background: "#000",
      foreground: "#fff",
      fontFamily: "Arial",
    },
    assets: [...assets.values()],
    scenes: [scene],
  });
  if (issues.length)
    throw new Error(issues.map((issue) => issue.message).join(" "));
}

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
    for (const key of ["nodeId", "sentenceId", "sceneId", "newId", "locale"])
      if (
        operationKeys[type].includes(key) &&
        (typeof obj[key] !== "string" || !(obj[key] as string).trim())
      )
        fail(`${key} is required.`);
    for (const key of ["nodeId", "sentenceId", "sceneId", "newId"])
      if (
        operationKeys[type].includes(key) &&
        !/^[a-zA-Z][a-zA-Z0-9_.-]{0,95}$/.test(obj[key] as string)
      )
        fail(`${key} must be a valid identifier.`);
    if (
      operationKeys[type].includes("locale") &&
      !/^[a-z]{2,3}(?:-[A-Za-z]{2,8})?$/.test(obj.locale as string)
    )
      fail("locale must be a valid locale code.");
    if (
      ["move-node", "move-scene"].includes(type) ||
      (type === "add-scene" && obj.index !== undefined)
    )
      if (
        !Number.isSafeInteger(obj.index) ||
        (obj.index as number) < 0 ||
        (obj.index as number) > 500
      )
        fail("index must be a non-negative integer in range.");
    if (
      type === "set-project-name" ||
      (type === "set-scene" && obj.name !== undefined)
    )
      if (
        typeof obj.name !== "string" ||
        !obj.name.trim() ||
        obj.name.length > 200
      )
        fail("name must be 1–200 characters.");
    if (type === "set-scene") {
      if (obj.name === undefined && obj.theme === undefined)
        fail("Provide a scene name or theme.");
      if (
        obj.theme !== undefined &&
        obj.theme !== "brand" &&
        obj.theme !== "inverted"
      )
        fail("theme must be brand or inverted.");
    }
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
    if (type === "add-node" || type === "add-scene") {
      const field = type === "add-node" ? "node" : "scene";
      if (!isRecord(obj[field])) fail(`${field} must be an object.`);
      validateInsertedContent(obj[field] as Record<string, unknown>, field);
    }
    if (
      ["set-node-style", "set-node-animation", "set-node-timing"].includes(type)
    ) {
      const field =
        type === "set-node-style"
          ? "style"
          : type === "set-node-animation"
            ? "animation"
            : "timing";
      if (
        !(field === "animation" && obj[field] === undefined) &&
        !isRecord(obj[field])
      )
        fail(`${field} must be an object.`);
      validateInsertedContent(
        {
          id: obj.nodeId,
          type: "text",
          content: { en: "" },
          layout: { x: 0, y: 0, width: 50, height: 50 },
          timing: {
            sentenceId:
              obj.nodeId === "operation-anchor"
                ? "operation-anchor-alternate"
                : "operation-anchor",
          },
          ...(obj[field] === undefined ? {} : { [field]: obj[field] }),
        },
        "node",
      );
    }
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
  const hasProtection = (node: MotionNode) =>
    Object.values(node.overrides ?? {}).some((override) => override?.protected);
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
      case "set-project-name":
        project.name = operation.name;
        change.description = `Renamed project to ${operation.name}.`;
        break;
      case "add-scene": {
        const index = operation.index ?? project.scenes.length;
        if (index > project.scenes.length) {
          conflict(
            "invalid-operation",
            "Scene insertion index is outside the scene list.",
          );
          return;
        }
        if (
          transaction.actor === "ai" &&
          operation.scene.nodes.some(hasProtection)
        ) {
          conflict(
            "protected-layout",
            "AI-created scenes cannot establish manual protection.",
          );
          return;
        }
        project.scenes.splice(index, 0, structuredClone(operation.scene));
        change.target = operation.scene.id;
        change.description = `Added scene ${operation.scene.name} at position ${index + 1}.`;
        break;
      }
      case "set-scene":
      case "remove-scene":
      case "move-scene":
      case "duplicate-scene": {
        const sourceIndex = project.scenes.findIndex(
          (item) => item.id === operation.sceneId,
        );
        if (sourceIndex < 0) {
          conflict("not-found", `Scene ${operation.sceneId} does not exist.`);
          return;
        }
        const source = project.scenes[sourceIndex];
        change.target = source.id;
        if (operation.type === "set-scene") {
          if (operation.name !== undefined) source.name = operation.name;
          if (operation.theme !== undefined) source.theme = operation.theme;
          change.description = `Updated scene ${source.name}.`;
        } else if (operation.type === "remove-scene") {
          if (transaction.actor === "ai" && source.nodes.some(hasProtection)) {
            conflict(
              "protected-layout",
              `Scene ${source.id} contains protected manual layout and cannot be removed by AI.`,
            );
            return;
          }
          if (project.scenes.length === 1) {
            conflict(
              "invalid-operation",
              "A project must retain at least one scene.",
            );
            return;
          }
          project.scenes.splice(sourceIndex, 1);
          change.description = `Removed scene ${source.name}.`;
        } else if (operation.type === "move-scene") {
          if (operation.index >= project.scenes.length) {
            conflict(
              "invalid-operation",
              "Scene destination index is outside the scene list.",
            );
            return;
          }
          project.scenes.splice(sourceIndex, 1);
          project.scenes.splice(operation.index, 0, source);
          change.description = `Moved scene ${source.name} to position ${operation.index + 1}.`;
        } else {
          if (transaction.actor === "ai" && source.nodes.some(hasProtection)) {
            conflict(
              "protected-layout",
              "AI cannot duplicate a scene containing protected manual layout.",
            );
            return;
          }
          const copy: Scene = structuredClone(source);
          copy.id = operation.newId;
          copy.name = `${source.name.slice(0, 195)} copy`;
          const sentenceIds = new Map(
            copy.sentences.map((sentence, index) => [
              sentence.id,
              nestedId(copy.id, `sentence-${index + 1}`),
            ]),
          );
          copy.sentences.forEach((sentence) => {
            sentence.id = sentenceIds.get(sentence.id)!;
          });
          copy.nodes.forEach((item, index) => {
            item.id = nestedId(copy.id, `node-${index + 1}`);
            item.timing.sentenceId = sentenceIds.get(item.timing.sentenceId)!;
          });
          project.scenes.splice(sourceIndex + 1, 0, copy);
          change.target = copy.id;
          change.description = `Duplicated scene ${source.name} with fresh scene, sentence and node identities.`;
        }
        break;
      }
      case "duplicate-node": {
        if (transaction.actor === "ai" && hasProtection(node!)) {
          conflict(
            "protected-layout",
            "AI cannot duplicate a node with protected manual layout.",
            nodeId,
          );
          return;
        }
        const copy = structuredClone(node!);
        copy.id = operation.newId;
        scene!.nodes.splice(scene!.nodes.indexOf(node!) + 1, 0, copy);
        change.target = copy.id;
        change.description = `Duplicated ${nodeId} with a fresh identity.`;
        break;
      }
      case "move-node": {
        if (transaction.actor === "ai" && hasProtection(node!)) {
          conflict(
            "protected-layout",
            "AI cannot reorder a node with protected manual layout.",
            nodeId,
          );
          return;
        }
        if (operation.index >= scene!.nodes.length) {
          conflict(
            "invalid-operation",
            "Layer destination index is outside the scene's layer list.",
            nodeId,
          );
          return;
        }
        scene!.nodes.splice(scene!.nodes.indexOf(node!), 1);
        scene!.nodes.splice(operation.index, 0, node!);
        change.description = `Moved ${nodeId} to layer ${operation.index + 1}.`;
        break;
      }
      case "set-node-style":
        node!.style = structuredClone(operation.style);
        change.description = `Updated text style on ${nodeId}.`;
        break;
      case "set-node-animation":
        if (operation.animation)
          node!.animation = structuredClone(operation.animation);
        else delete node!.animation;
        change.description = `${operation.animation ? "Updated" : "Reset default"} entrance animation on ${nodeId}.`;
        break;
      case "set-node-timing":
        node!.timing = structuredClone(operation.timing);
        change.description = `Updated sentence-relative timing on ${nodeId}.`;
        break;
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
      case "remove-sentence-audio": {
        if (transaction.actor !== "human") {
          conflict(
            "invalid-operation",
            "Removing narration requires a human media selection.",
          );
          return;
        }
        const sentence = project.scenes
          .flatMap((item) => item.sentences)
          .find((item) => item.id === operation.sentenceId);
        if (!sentence) {
          conflict(
            "not-found",
            `Sentence ${operation.sentenceId} does not exist.`,
          );
          return;
        }
        if (sentence.audioAssetId) {
          delete sentence.audioAssetId[operation.locale];
          if (!Object.keys(sentence.audioAssetId).length)
            delete sentence.audioAssetId;
        }
        change.target = sentence.id;
        change.locales = [operation.locale];
        change.description = `Removed ${operation.locale} narration from ${sentence.id}; duration and reusable media preserved.`;
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
