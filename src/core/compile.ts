import type {
  AspectRatio,
  CompiledNode,
  CompiledProject,
  Issue,
  Layout,
  MotionNode,
  Project,
} from "./types";
import { parseProject } from "./validation";

export function resolveLayout(node: MotionNode, ratio: AspectRatio): Layout {
  return { ...node.layout, ...node.overrides?.[ratio]?.layout };
}
export function compileProject(
  input: Project,
  locale: string,
  ratio: AspectRatio,
): CompiledProject {
  const project = parseProject(input);
  if (!project.locales.includes(locale))
    throw new Error(`Undeclared locale: ${locale}`);
  if (!project.ratios.includes(ratio))
    throw new Error(`Undeclared ratio: ${ratio}`);
  let cursor = 0;
  const scenes = project.scenes.map((scene) => {
    const start = cursor;
    const sentences = scene.sentences.map((sentence) => {
      const sentenceStart = cursor;
      cursor += sentence.duration[locale];
      return {
        id: sentence.id,
        text: sentence.text[locale],
        duration: sentence.duration[locale],
        start: sentenceStart,
        end: cursor,
        ...(sentence.audioAssetId?.[locale]
          ? { audioAssetId: sentence.audioAssetId[locale] }
          : {}),
      };
    });
    const nodes: CompiledNode[] = scene.nodes.map((node) => {
      const sentence = sentences.find((s) => s.id === node.timing.sentenceId)!;
      return {
        ...node,
        text: node.content[locale],
        layout: resolveLayout(node, ratio),
        start: sentence.start + (node.timing.start ?? 0),
        end:
          node.timing.end === undefined
            ? sentence.end
            : sentence.start + node.timing.end,
      };
    });
    return {
      id: scene.id,
      name: scene.name,
      kind: scene.kind,
      ...(scene.theme ? { theme: scene.theme } : {}),
      start,
      end: cursor,
      duration: cursor - start,
      sentences,
      nodes,
    };
  });
  return {
    id: project.id,
    name: project.name,
    revision: project.revision,
    locale,
    ratio,
    width: ratio === "16:9" ? 1920 : 1080,
    height: ratio === "16:9" ? 1080 : 1920,
    fps: project.fps,
    duration: cursor,
    brand: project.brand,
    assets: project.assets,
    scenes,
  };
}

/** Fast output preflight. Text capacity is an estimate; the render preflight measures DOM. */
export function validateVariant(
  project: Project,
  locale: string,
  ratio: AspectRatio,
): Issue[] {
  const issues: Issue[] = [];
  const output = compileProject(project, locale, ratio);
  for (const scene of output.scenes)
    for (const node of scene.nodes) {
      const { x, y, width, height, rotation = 0 } = node.layout;
      const base = { path: `nodes.${node.id}`, nodeId: node.id, locale, ratio };
      if (x < 0 || y < 0 || x + width > 100.001 || y + height > 100.001)
        issues.push({
          ...base,
          code: "layout-overflow",
          severity: "error",
          message: `${node.id} extends outside the ${ratio} canvas.`,
        });
      if (rotation !== 0)
        issues.push({
          ...base,
          code: "rotated-bounds",
          severity: "warning",
          message:
            "Rotated bounds need visual review; axis-aligned bounds cannot prove they fit.",
        });
      if (node.text && ["text", "caption", "cta"].includes(node.type)) {
        const font =
          node.style?.fontSize ?? (node.type === "caption" ? 26 : 48);
        const charsPerLine = Math.max(
          1,
          Math.floor(((width / 100) * output.width) / (font * 0.53)),
        );
        const estimatedLines = node.text
          .split("\n")
          .reduce(
            (sum, line) =>
              sum + Math.max(1, Math.ceil(line.length / charsPerLine)),
            0,
          );
        if (estimatedLines * font * 1.15 > (height / 100) * output.height)
          issues.push({
            ...base,
            code: "text-capacity",
            severity: "warning",
            message:
              "Estimated text height exceeds its box. Render preflight measures the actual font and wrapping.",
          });
        if (node.text.split(/\s+/).length / (node.end - node.start) > 4)
          issues.push({
            ...base,
            code: "reading-time",
            severity: "warning",
            message: "Text exceeds 240 words per minute; review reading time.",
          });
      }
      if (
        node.animation?.delay &&
        node.animation.delay >= node.end - node.start
      )
        issues.push({
          ...base,
          code: "animation-timing",
          severity: "error",
          message: "Entrance delay consumes the entire visible interval.",
        });
    }
  return issues;
}
export function projectVariants(project: Project) {
  return project.locales.flatMap((locale) =>
    project.ratios.map((ratio) => ({ locale, ratio })),
  );
}
