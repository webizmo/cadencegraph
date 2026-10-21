import {
  ASPECT_RATIOS,
  type AspectRatio,
  type Issue,
  type Project,
} from "./types";

const ID = /^[a-zA-Z][a-zA-Z0-9_.-]{0,95}$/;
const COLOR =
  /^(#(?:[a-fA-F0-9]{3}|[a-fA-F0-9]{4}|[a-fA-F0-9]{6}|[a-fA-F0-9]{8})|[a-zA-Z]{1,24})$/;
const forbidden = new Set(["__proto__", "prototype", "constructor"]);
export const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
export const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
export const isRatio = (value: unknown): value is AspectRatio =>
  typeof value === "string" && ASPECT_RATIOS.includes(value as AspectRatio);

/** JSON-only, bounded input; no executable code or prototype-bearing keys. */
export function checkJsonSafety(value: unknown): string | undefined {
  const seen = new WeakSet<object>();
  let count = 0;
  const visit = (v: unknown, depth: number): string | undefined => {
    if (++count > 100000 || depth > 24)
      return "Document is too complex (100,000 values / 24 levels maximum).";
    if (v === null || typeof v === "boolean") return;
    if (typeof v === "number")
      return Number.isFinite(v) ? undefined : "Numbers must be finite.";
    if (typeof v === "string")
      return v.length <= 100000
        ? undefined
        : "A string exceeds 100,000 characters.";
    if (typeof v !== "object") return "Only JSON values are allowed.";
    if (seen.has(v))
      return "Circular or shared object references are not JSON.";
    seen.add(v);
    if (
      !Array.isArray(v) &&
      Object.getPrototypeOf(v) !== Object.prototype &&
      Object.getPrototypeOf(v) !== null
    )
      return "Only plain JSON objects are allowed.";
    for (const [key, child] of Object.entries(v)) {
      if (forbidden.has(key)) return `Unsafe property: ${key}`;
      const error = visit(child, depth + 1);
      if (error) return error;
    }
  };
  return visit(value, 0);
}

/** Never throws on malformed user JSON. Structural and graph checks run before rendering. */
export function validateProject(value: unknown): Issue[] {
  const issues: Issue[] = [];
  const fail = (path: string, message: string, code = "schema") =>
    issues.push({ code, severity: "error", path, message });
  const known = (
    object: Record<string, unknown>,
    keys: string[],
    path: string,
  ) => {
    for (const key of Object.keys(object))
      if (!keys.includes(key)) fail(`${path}.${key}`, `Unknown field: ${key}.`);
  };
  const safety = checkJsonSafety(value);
  if (safety) {
    fail("$", safety);
    return issues;
  }
  if (!isRecord(value)) {
    fail("$", "Project must be an object.");
    return issues;
  }
  const allowed = new Set([
    "schemaVersion",
    "id",
    "name",
    "revision",
    "locales",
    "ratios",
    "fps",
    "brand",
    "assets",
    "scenes",
  ]);
  for (const key of Object.keys(value))
    if (!allowed.has(key)) fail(key, `Unknown project field: ${key}.`);
  if (value.schemaVersion !== 1)
    fail(
      "schemaVersion",
      "Unsupported schemaVersion. This release accepts version 1.",
      "unsupported-version",
    );
  const ids = new Set<string>();
  const id = (v: unknown, path: string) => {
    if (typeof v !== "string" || !ID.test(v)) {
      fail(
        path,
        "ID must start with a letter and contain only letters, numbers, _, . or -.",
      );
      return;
    }
    if (ids.has(v)) fail(path, `Duplicate stable ID: ${v}.`, "duplicate-id");
    ids.add(v);
  };
  id(value.id, "id");
  if (
    typeof value.name !== "string" ||
    !value.name.trim() ||
    value.name.length > 200
  )
    fail("name", "Project name must be 1–200 characters.");
  if (!Number.isSafeInteger(value.revision) || (value.revision as number) < 0)
    fail("revision", "Revision must be a non-negative safe integer.");
  if (!finite(value.fps) || ![24, 25, 30, 50, 60].includes(value.fps))
    fail("fps", "FPS must be 24, 25, 30, 50 or 60.");
  const locales = Array.isArray(value.locales)
    ? value.locales.filter(
        (x): x is string =>
          typeof x === "string" && /^[a-z]{2,3}(?:-[A-Za-z]{2,8})?$/.test(x),
      )
    : [];
  if (
    !Array.isArray(value.locales) ||
    locales.length !== value.locales.length ||
    locales.length < 1 ||
    locales.length > 12 ||
    new Set(locales).size !== locales.length
  )
    fail(
      "locales",
      "Provide 1–12 unique locale codes, for example en, tr or en-US.",
    );
  const ratios = Array.isArray(value.ratios) ? value.ratios : [];
  if (
    !ratios.length ||
    ratios.some((r) => !isRatio(r)) ||
    new Set(ratios).size !== ratios.length
  )
    fail("ratios", "Provide unique supported ratios: 16:9 and/or 9:16.");
  if (!isRecord(value.brand)) fail("brand", "Brand is required.");
  else {
    known(
      value.brand,
      ["name", "accent", "background", "foreground", "fontFamily"],
      "brand",
    );
    for (const field of ["name", "fontFamily"])
      if (
        typeof value.brand[field] !== "string" ||
        !(value.brand[field] as string).trim() ||
        (value.brand[field] as string).length > 200
      )
        fail(
          `brand.${field}`,
          "Must be a non-empty string up to 200 characters.",
        );
    for (const field of ["accent", "background", "foreground"])
      if (
        typeof value.brand[field] !== "string" ||
        !COLOR.test(value.brand[field] as string)
      )
        fail(`brand.${field}`, "Use a hex color or CSS named color.");
  }
  const assets = Array.isArray(value.assets) ? value.assets : [];
  if (!Array.isArray(value.assets) || assets.length > 500)
    fail("assets", "Assets must be an array of at most 500 entries.");
  const assetTypes = new Map<string, unknown>();
  assets.forEach((asset, i) => {
    const p = `assets[${i}]`;
    if (!isRecord(asset)) {
      fail(p, "Asset must be an object.");
      return;
    }
    known(asset, ["id", "type", "src", "name", "license"], p);
    for (const field of ["name", "license"])
      if (
        asset[field] !== undefined &&
        (typeof asset[field] !== "string" ||
          (asset[field] as string).length > 200)
      )
        fail(`${p}.${field}`, "Must be a string up to 200 characters.");
    id(asset.id, `${p}.id`);
    if (typeof asset.id === "string") assetTypes.set(asset.id, asset.type);
    if (!["image", "audio", "video", "font"].includes(asset.type as string))
      fail(`${p}.type`, "Unsupported asset type.");
    // Assets are workspace-relative or HTTP(S). Serving code additionally confines local paths.
    if (
      typeof asset.src !== "string" ||
      !asset.src ||
      asset.src.length > 2048 ||
      asset.src.startsWith("/") ||
      asset.src.includes("\\") ||
      /(^|\/)\.\.(\/|$)/.test(asset.src) ||
      /[\u0000-\u001f]/.test(asset.src) ||
      (/^[a-z][a-z0-9+.-]*:/i.test(asset.src) &&
        !/^https?:\/\//i.test(asset.src))
    )
      fail(`${p}.src`, "Use a safe workspace-relative path or HTTP(S) URL.");
  });
  const localized = (v: unknown, path: string, kind: "string" | "duration") => {
    if (!isRecord(v)) {
      fail(path, "Expected a locale map.");
      return;
    }
    for (const locale of locales) {
      const item = v[locale];
      if (kind === "string" && (typeof item !== "string" || item.length > 4000))
        fail(
          `${path}.${locale}`,
          "Each declared locale needs a string (max 4,000 characters).",
        );
      if (kind === "duration" && (!finite(item) || item < 0.2 || item > 120))
        fail(`${path}.${locale}`, "Sentence duration must be 0.2–120 seconds.");
    }
    for (const locale of Object.keys(v))
      if (!locales.includes(locale))
        fail(`${path}.${locale}`, `Locale ${locale} is not declared.`);
  };
  const layout = (v: unknown, path: string, partial = false) => {
    if (!isRecord(v)) {
      fail(path, "Layout must be an object.");
      return;
    }
    for (const key of Object.keys(v))
      if (!["x", "y", "width", "height", "rotation"].includes(key))
        fail(`${path}.${key}`, "Unknown layout field.");
    for (const key of ["x", "y", "width", "height"]) {
      if (partial && v[key] === undefined) continue;
      if (
        !finite(v[key]) ||
        (v[key] as number) <
          (key === "width" || key === "height" ? 0.1 : -100) ||
        (v[key] as number) > 200
      )
        fail(
          `${path}.${key}`,
          "Layout values must be finite percentages; dimensions must be positive.",
        );
    }
    if (
      v.rotation !== undefined &&
      (!finite(v.rotation) || Math.abs(v.rotation) > 360)
    )
      fail(
        `${path}.rotation`,
        "Rotation must be between -360 and 360 degrees.",
      );
  };
  const scenes = Array.isArray(value.scenes) ? value.scenes : [];
  if (!Array.isArray(value.scenes) || !scenes.length || scenes.length > 100)
    fail("scenes", "Provide 1–100 scenes.");
  scenes.forEach((scene, i) => {
    const p = `scenes[${i}]`;
    if (!isRecord(scene)) {
      fail(p, "Scene must be an object.");
      return;
    }
    known(scene, ["id", "name", "kind", "theme", "sentences", "nodes"], p);
    id(scene.id, `${p}.id`);
    if (
      typeof scene.name !== "string" ||
      !scene.name.trim() ||
      scene.name.length > 200
    )
      fail(`${p}.name`, "Scene name is required (max 200 characters).");
    if (typeof scene.kind !== "string" || !ID.test(scene.kind))
      fail(`${p}.kind`, "Scene kind must be an identifier.");
    if (
      scene.theme !== undefined &&
      !["brand", "inverted"].includes(scene.theme as string)
    )
      fail(`${p}.theme`, "Scene theme must be brand or inverted.");
    const sentences = Array.isArray(scene.sentences) ? scene.sentences : [];
    if (
      !Array.isArray(scene.sentences) ||
      !sentences.length ||
      sentences.length > 100
    )
      fail(`${p}.sentences`, "Provide 1–100 sentences.");
    const sentenceMap = new Map<string, Record<string, unknown>>();
    sentences.forEach((sentence, j) => {
      const sp = `${p}.sentences[${j}]`;
      if (!isRecord(sentence)) {
        fail(sp, "Sentence must be an object.");
        return;
      }
      known(sentence, ["id", "text", "duration", "audioAssetId"], sp);
      id(sentence.id, `${sp}.id`);
      if (typeof sentence.id === "string")
        sentenceMap.set(sentence.id, sentence);
      localized(sentence.text, `${sp}.text`, "string");
      localized(sentence.duration, `${sp}.duration`, "duration");
      if (sentence.audioAssetId !== undefined) {
        if (!isRecord(sentence.audioAssetId))
          fail(`${sp}.audioAssetId`, "Audio references must be a locale map.");
        else
          for (const [locale, assetId] of Object.entries(
            sentence.audioAssetId,
          )) {
            if (!locales.includes(locale))
              fail(`${sp}.audioAssetId.${locale}`, "Undeclared audio locale.");
            if (
              typeof assetId !== "string" ||
              assetTypes.get(assetId) !== "audio"
            )
              fail(
                `${sp}.audioAssetId.${locale}`,
                "Audio reference must point to an existing audio asset.",
                "missing-media",
              );
          }
      }
    });
    const nodes = Array.isArray(scene.nodes) ? scene.nodes : [];
    if (!Array.isArray(scene.nodes) || nodes.length > 500)
      fail(`${p}.nodes`, "Nodes must be an array of at most 500 entries.");
    nodes.forEach((node, j) => {
      const np = `${p}.nodes[${j}]`;
      if (!isRecord(node)) {
        fail(np, "Node must be an object.");
        return;
      }
      known(
        node,
        [
          "id",
          "type",
          "role",
          "content",
          "layout",
          "overrides",
          "timing",
          "style",
          "assetId",
          "component",
          "props",
          "animation",
        ],
        np,
      );
      if (
        node.role !== undefined &&
        (typeof node.role !== "string" || !ID.test(node.role))
      )
        fail(`${np}.role`, "Role must be an identifier.");
      if (
        node.component !== undefined &&
        (typeof node.component !== "string" || !ID.test(node.component))
      )
        fail(`${np}.component`, "Component must be an identifier.");
      id(node.id, `${np}.id`);
      if (
        !["text", "media", "card", "caption", "cta", "component"].includes(
          node.type as string,
        )
      )
        fail(`${np}.type`, "Unsupported node type.");
      localized(node.content, `${np}.content`, "string");
      layout(node.layout, `${np}.layout`);
      if (node.overrides !== undefined) {
        if (!isRecord(node.overrides))
          fail(`${np}.overrides`, "Overrides must be an object.");
        else
          for (const [ratio, override] of Object.entries(node.overrides)) {
            if (!isRatio(ratio) || !ratios.includes(ratio))
              fail(
                `${np}.overrides.${ratio}`,
                "Override ratio must be declared.",
              );
            if (!isRecord(override)) {
              fail(`${np}.overrides.${ratio}`, "Override must be an object.");
              continue;
            }
            known(
              override,
              ["layout", "protected"],
              `${np}.overrides.${ratio}`,
            );
            layout(override.layout, `${np}.overrides.${ratio}.layout`, true);
            if (typeof override.protected !== "boolean")
              fail(
                `${np}.overrides.${ratio}.protected`,
                "Protected must be true or false.",
              );
          }
      }
      if (!isRecord(node.timing))
        fail(`${np}.timing`, "Sentence timing is required.");
      else {
        known(node.timing, ["sentenceId", "start", "end"], `${np}.timing`);
        const sentence = sentenceMap.get(node.timing.sentenceId as string);
        if (!sentence)
          fail(
            `${np}.timing.sentenceId`,
            "Node timing must reference a sentence in this scene.",
            "missing-reference",
          );
        for (const key of ["start", "end"])
          if (
            node.timing[key] !== undefined &&
            (!finite(node.timing[key]) || (node.timing[key] as number) < 0)
          )
            fail(
              `${np}.timing.${key}`,
              "Timing offsets must be finite, non-negative seconds.",
            );
        if (sentence && isRecord(sentence.duration))
          for (const locale of locales) {
            const start = node.timing.start ?? 0;
            const end = node.timing.end ?? sentence.duration[locale];
            const duration = sentence.duration[locale];
            if (
              finite(start) &&
              finite(end) &&
              finite(duration) &&
              (start >= end || end > duration + 0.000001)
            )
              fail(
                `${np}.timing`,
                `Node timing lies outside sentence in ${locale}.`,
                "timing",
              );
          }
      }
      if (node.style !== undefined) {
        if (!isRecord(node.style))
          fail(`${np}.style`, "Style must be an object.");
        else {
          known(
            node.style,
            ["fontSize", "fontWeight", "color", "align"],
            `${np}.style`,
          );
          if (
            node.style.fontSize !== undefined &&
            (!finite(node.style.fontSize) ||
              node.style.fontSize < 8 ||
              node.style.fontSize > 300)
          )
            fail(
              `${np}.style.fontSize`,
              "Font size must be 8–300 native canvas pixels.",
            );
          if (
            node.style.fontWeight !== undefined &&
            (!finite(node.style.fontWeight) ||
              node.style.fontWeight < 100 ||
              node.style.fontWeight > 900)
          )
            fail(`${np}.style.fontWeight`, "Font weight must be 100–900.");
          if (
            node.style.align !== undefined &&
            !["left", "center", "right"].includes(node.style.align as string)
          )
            fail(`${np}.style.align`, "Invalid alignment.");
          if (
            node.style.color !== undefined &&
            (typeof node.style.color !== "string" ||
              !COLOR.test(node.style.color))
          )
            fail(`${np}.style.color`, "Use a hex color or CSS named color.");
        }
      }
      if (node.type === "media" && typeof node.assetId !== "string")
        fail(
          `${np}.assetId`,
          "Media nodes require an asset ID.",
          "missing-media",
        );
      if (
        node.assetId !== undefined &&
        (typeof node.assetId !== "string" ||
          !assetTypes.has(node.assetId) ||
          !["image", "video"].includes(assetTypes.get(node.assetId) as string))
      )
        fail(
          `${np}.assetId`,
          "Media reference must point to an existing image or video asset.",
          "missing-media",
        );
      if (
        node.type === "component" &&
        (typeof node.component !== "string" || !ID.test(node.component))
      )
        fail(`${np}.component`, "Component nodes require an identifier.");
      if (node.props !== undefined && !isRecord(node.props))
        fail(`${np}.props`, "Component props must be a JSON object.");
      if (
        node.animation !== undefined &&
        (!isRecord(node.animation) ||
          !["rise", "scale", "slide", "fade"].includes(
            node.animation.enter as string,
          ) ||
          (node.animation.delay !== undefined &&
            (!finite(node.animation.delay) ||
              node.animation.delay < 0 ||
              node.animation.delay > 10)))
      )
        fail(
          `${np}.animation`,
          "Provide a supported entrance and optional delay of 0–10 seconds.",
        );
      if (isRecord(node.animation))
        known(node.animation, ["enter", "delay"], `${np}.animation`);
    });
  });
  return issues;
}

export class ProjectValidationError extends Error {
  constructor(public issues: Issue[]) {
    super(issues.map((issue) => `${issue.path}: ${issue.message}`).join("\n"));
    this.name = "ProjectValidationError";
  }
}
export function parseProject(value: unknown): Project {
  const issues = validateProject(value);
  if (issues.some((issue) => issue.severity === "error"))
    throw new ProjectValidationError(issues);
  return structuredClone(value) as Project;
}
