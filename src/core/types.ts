export const SCHEMA_VERSION = 1 as const;
export const ASPECT_RATIOS = ["16:9", "9:16"] as const;
export type AspectRatio = (typeof ASPECT_RATIOS)[number];
export type Locale = string;
export type Localized<T> = Record<Locale, T>;

/** Percentages of the output canvas. x/y describe the top-left corner. */
export interface Layout {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
}
export interface LayoutOverride {
  layout: Partial<Layout>;
  protected: boolean;
}
export interface Brand {
  name: string;
  accent: string;
  background: string;
  foreground: string;
  fontFamily: string;
}
export interface Asset {
  id: string;
  type: "image" | "audio" | "video" | "font";
  src: string;
  name?: string;
  license?: string;
}
export interface Sentence {
  id: string;
  text: Localized<string>;
  duration: Localized<number>;
  audioAssetId?: Localized<string>;
}
export interface NodeStyle {
  fontSize?: number;
  fontWeight?: number;
  color?: string;
  align?: "left" | "center" | "right";
}
export interface MotionNode {
  id: string;
  type: "text" | "media" | "card" | "caption" | "cta" | "component";
  role?: string;
  content: Localized<string>;
  layout: Layout;
  overrides?: Partial<Record<AspectRatio, LayoutOverride>>;
  timing: { sentenceId: string; start?: number; end?: number };
  style?: NodeStyle;
  assetId?: string;
  component?: string;
  props?: Record<string, unknown>;
  animation?: { enter: "rise" | "scale" | "slide" | "fade"; delay?: number };
}
export interface Scene {
  id: string;
  name: string;
  kind: string;
  theme?: "brand" | "inverted";
  sentences: Sentence[];
  nodes: MotionNode[];
}
export interface Project {
  schemaVersion: typeof SCHEMA_VERSION;
  id: string;
  name: string;
  revision: number;
  locales: Locale[];
  ratios: AspectRatio[];
  fps: number;
  brand: Brand;
  assets: Asset[];
  scenes: Scene[];
}
export interface CompiledSentence {
  id: string;
  text: string;
  duration: number;
  start: number;
  end: number;
  audioAssetId?: string;
}
export interface CompiledNode extends MotionNode {
  text: string;
  start: number;
  end: number;
}
export interface CompiledScene {
  id: string;
  name: string;
  kind: string;
  theme?: "brand" | "inverted";
  start: number;
  end: number;
  duration: number;
  sentences: CompiledSentence[];
  nodes: CompiledNode[];
}
export interface CompiledProject {
  id: string;
  name: string;
  revision: number;
  locale: Locale;
  ratio: AspectRatio;
  width: number;
  height: number;
  fps: number;
  duration: number;
  brand: Brand;
  assets: Asset[];
  scenes: CompiledScene[];
}
export interface Issue {
  code: string;
  severity: "error" | "warning";
  message: string;
  path: string;
  nodeId?: string;
  locale?: string;
  ratio?: AspectRatio;
}
export type Operation =
  | { type: "set-text"; nodeId: string; locale: Locale; text: string }
  | {
      type: "set-sentence-text";
      sentenceId: string;
      locale: Locale;
      text: string;
    }
  | {
      type: "set-layout";
      nodeId: string;
      ratio: AspectRatio;
      layout: Partial<Layout>;
      protect?: boolean;
    }
  | { type: "set-brand"; brand: Partial<Brand> }
  | {
      type: "set-sentence-duration";
      sentenceId: string;
      locale: Locale;
      duration: number;
    }
  | {
      type: "set-sentence-audio";
      sentenceId: string;
      locale: Locale;
      asset: Asset;
      duration: number;
    }
  | { type: "set-node-media"; nodeId: string; asset: Asset }
  | { type: "add-asset"; asset: Asset }
  | { type: "add-node"; sceneId: string; node: MotionNode }
  | { type: "remove-node"; nodeId: string }
  | { type: "add-scene"; scene: Scene; index?: number }
  | { type: "remove-scene"; sceneId: string }
  | { type: "move-scene"; sceneId: string; index: number }
  | {
      type: "set-scene";
      sceneId: string;
      name?: string;
      theme?: "brand" | "inverted";
    }
  | { type: "set-project-name"; name: string }
  | { type: "duplicate-scene"; sceneId: string; newId: string }
  | { type: "duplicate-node"; nodeId: string; newId: string }
  | { type: "move-node"; nodeId: string; index: number }
  | { type: "set-node-style"; nodeId: string; style: NodeStyle }
  | {
      type: "set-node-animation";
      nodeId: string;
      animation?: MotionNode["animation"];
    }
  | { type: "set-node-timing"; nodeId: string; timing: MotionNode["timing"] }
  | { type: "remove-sentence-audio"; sentenceId: string; locale: Locale }
  | {
      type: "set-protection";
      nodeId: string;
      ratio: AspectRatio;
      protected: boolean;
    };
export interface Transaction {
  id: string;
  baseRevision: number;
  actor: "human" | "ai";
  operations: Operation[];
}
export interface Conflict {
  code:
    | "stale-revision"
    | "protected-layout"
    | "invalid-operation"
    | "invalid-project"
    | "not-found";
  message: string;
  operationIndex?: number;
  nodeId?: string;
}
export interface Change {
  operation: Operation["type"];
  target: string;
  description: string;
  locales: string[];
  ratios: AspectRatio[];
}
export interface TransactionResult {
  project: Project;
  applied: boolean;
  conflicts: Conflict[];
  changes: Change[];
  undo?: Project;
}
