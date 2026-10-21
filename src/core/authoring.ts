import type {
  AspectRatio,
  Brand,
  Layout,
  MotionNode,
  Project,
  Scene,
} from "./types";
import { nestedId } from "./ids";
import { parseProject } from "./validation";

export const SCENE_TEMPLATES = [
  {
    id: "blank",
    name: "Blank canvas",
    description: "Start with an empty four-second scene.",
  },
  {
    id: "title",
    name: "Title",
    description: "Introduce an idea with a headline and supporting line.",
  },
  {
    id: "quote",
    name: "Quote",
    description: "Give a short quotation and its attribution room to breathe.",
  },
  {
    id: "cards",
    name: "Three points",
    description: "Arrange three clear benefits or steps.",
  },
  {
    id: "closing",
    name: "Closing",
    description: "Finish with a concise message and a call to action.",
  },
] as const;
export type SceneTemplate = (typeof SCENE_TEMPLATES)[number]["id"];

export const BRAND_PRESETS: { id: string; name: string; brand: Brand }[] = [
  {
    id: "midnight",
    name: "Midnight",
    brand: {
      name: "Midnight",
      accent: "#b7f46d",
      background: "#10191c",
      foreground: "#f5f7ef",
      fontFamily: "Manrope",
    },
  },
  {
    id: "paper",
    name: "Paper",
    brand: {
      name: "Paper",
      accent: "#d48a5f",
      background: "#f4efe5",
      foreground: "#242322",
      fontFamily: "Manrope",
    },
  },
  {
    id: "cobalt",
    name: "Cobalt",
    brand: {
      name: "Cobalt",
      accent: "#ffcf56",
      background: "#1232a0",
      foreground: "#ffffff",
      fontFamily: "Manrope",
    },
  },
];

const identifier = (value: string) => {
  if (!/^[a-zA-Z][a-zA-Z0-9_.-]{0,95}$/.test(value))
    throw new Error(
      "Use an identifier starting with a letter, up to 96 characters.",
    );
};
const localized = <T>(
  locales: string[],
  english: T,
  turkish: T,
): Record<string, T> =>
  Object.fromEntries(
    locales.map((locale) => [
      locale,
      locale.toLowerCase().startsWith("tr") ? turkish : english,
    ]),
  );
const variants = (locales: string[], ratios?: AspectRatio[]) => {
  if (
    !locales.length ||
    locales.length > 12 ||
    new Set(locales).size !== locales.length ||
    locales.some((locale) => !/^[a-z]{2,3}(?:-[A-Za-z]{2,8})?$/.test(locale))
  )
    throw new Error("Provide 1–12 unique locale codes.");
  if (
    ratios &&
    (!ratios.length ||
      new Set(ratios).size !== ratios.length ||
      ratios.some((ratio) => ratio !== "16:9" && ratio !== "9:16"))
  )
    throw new Error("Provide unique supported aspect ratios.");
};

/** Media must be selected by the user before creating its node. Other nodes need no assets. */
export function createNode(
  type: "text" | "card" | "caption" | "cta" | "media",
  id: string,
  sentenceId: string,
  locales: string[],
  assetId?: string,
): MotionNode {
  identifier(id);
  identifier(sentenceId);
  variants(locales);
  if (!["text", "card", "caption", "cta", "media"].includes(type))
    throw new Error("Unsupported node type.");
  if (type === "media" && !assetId)
    throw new Error(
      "Choose an image or video asset before creating a media node.",
    );
  if (assetId) identifier(assetId);
  const copy = {
    text: ["Your next idea.", "Bir sonraki fikrin."],
    card: ["A useful detail", "Faydalı bir ayrıntı"],
    caption: ["Add a short caption", "Kısa bir altyazı ekle"],
    cta: ["Discover more", "Daha fazlasını keşfet"],
    media: ["Your media", "Görselin"],
  }[type];
  const layouts: Record<typeof type, Layout> = {
    text: { x: 10, y: 31, width: 80, height: 25 },
    card: { x: 12, y: 40, width: 76, height: 15 },
    caption: { x: 12, y: 78, width: 76, height: 10 },
    cta: { x: 24, y: 66, width: 52, height: 12 },
    media: { x: 16, y: 18, width: 68, height: 64 },
  };
  return {
    id,
    type,
    content: localized(locales, copy[0], copy[1]),
    layout: layouts[type],
    timing: { sentenceId },
    style: {
      fontSize: type === "text" ? 64 : 30,
      fontWeight: type === "text" ? 700 : 500,
      align: "left",
    },
    animation: { enter: type === "media" ? "fade" : "rise", delay: 0 },
    ...(type === "media" ? { assetId } : {}),
  };
}

/** Deterministic editable starting points, not required scene sequences. */
export function createScene(
  template: SceneTemplate,
  id: string,
  locales: string[],
  ratios: AspectRatio[],
): Scene {
  identifier(id);
  variants(locales, ratios);
  if (!SCENE_TEMPLATES.some((item) => item.id === template))
    throw new Error("Unknown scene template.");
  const sentenceId = nestedId(id, "sentence-1");
  const scene: Scene = {
    id,
    name: SCENE_TEMPLATES.find((item) => item.id === template)!.name,
    kind: template,
    theme: "brand",
    sentences: [
      {
        id: sentenceId,
        text: localized(locales, "", ""),
        duration: localized(locales, 4, 4),
      },
    ],
    nodes: [],
  };
  const add = (
    type: "text" | "card" | "caption" | "cta",
    suffix: string,
    english: string,
    turkish: string,
    landscape: Layout,
    portrait: Layout,
    fontSize = 48,
    delay = 0,
  ) => {
    const node = createNode(type, nestedId(id, suffix), sentenceId, locales);
    node.content = localized(locales, english, turkish);
    node.layout = { ...landscape };
    node.overrides = Object.fromEntries(
      ratios.map((ratio) => [
        ratio,
        {
          layout: { ...(ratio === "9:16" ? portrait : landscape) },
          protected: false,
        },
      ]),
    );
    node.style = {
      fontSize,
      fontWeight: type === "text" ? 700 : 500,
      align: "left",
    };
    node.animation = { enter: "rise", delay };
    scene.nodes.push(node);
  };
  if (template === "title") {
    add(
      "text",
      "headline",
      "Make your next idea move.",
      "Yeni fikrine hareket kat.",
      { x: 10, y: 26, width: 80, height: 26 },
      { x: 9, y: 27, width: 82, height: 26 },
      84,
    );
    add(
      "text",
      "body",
      "A fresh story, in your own words.",
      "Kendi sözlerinle yeni bir hikâye.",
      { x: 10, y: 60, width: 76, height: 13 },
      { x: 9, y: 58, width: 82, height: 14 },
      38,
      0.25,
    );
  } else if (template === "quote") {
    add(
      "text",
      "quote",
      "“Small steps create real change.”",
      "“Küçük adımlar gerçek değişim yaratır.”",
      { x: 12, y: 25, width: 76, height: 35 },
      { x: 10, y: 25, width: 80, height: 35 },
      72,
    );
    add(
      "caption",
      "attribution",
      "Your name · Your role",
      "Adın · Unvanın",
      { x: 12, y: 70, width: 76, height: 9 },
      { x: 10, y: 68, width: 80, height: 10 },
      30,
      0.3,
    );
  } else if (template === "cards") {
    add(
      "text",
      "headline",
      "Three reasons to begin",
      "Başlamak için üç neden",
      { x: 10, y: 13, width: 80, height: 18 },
      { x: 9, y: 12, width: 82, height: 18 },
      60,
    );
    const copy = [
      ["Find your focus", "Odağını bul"],
      ["Build your story", "Hikâyeni kur"],
      ["Share your progress", "Gelişimini paylaş"],
    ];
    copy.forEach(([english, turkish], index) =>
      add(
        "card",
        `card-${index + 1}`,
        english,
        turkish,
        { x: 12, y: 37 + index * 16, width: 76, height: 12 },
        { x: 9, y: 35 + index * 16, width: 82, height: 12 },
        32,
        0.15 * index,
      ),
    );
  } else if (template === "closing") {
    add(
      "text",
      "headline",
      "Ready for the next step?",
      "Bir sonraki adıma hazır mısın?",
      { x: 12, y: 25, width: 76, height: 28 },
      { x: 10, y: 27, width: 80, height: 28 },
      76,
    );
    add(
      "cta",
      "cta",
      "Start today",
      "Bugün başla",
      { x: 24, y: 65, width: 52, height: 13 },
      { x: 15, y: 65, width: 70, height: 12 },
      32,
      0.3,
    );
  }
  return scene;
}

export function createBlankProject(
  id: string,
  name = "Untitled project",
): Project {
  identifier(id);
  return parseProject({
    schemaVersion: 1,
    id,
    name,
    revision: 0,
    locales: ["en", "tr"],
    ratios: ["16:9", "9:16"],
    fps: 30,
    brand: structuredClone(BRAND_PRESETS[0].brand),
    assets: [],
    scenes: [
      createScene(
        "blank",
        nestedId(id, "scene-1"),
        ["en", "tr"],
        ["16:9", "9:16"],
      ),
    ],
  });
}
