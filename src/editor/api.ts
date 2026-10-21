import type { Asset, Operation, Project, AspectRatio as Ratio } from "../core";
export interface Proposal {
  id?: string;
  baseRevision: number;
  operations: Operation[];
  summary: string;
}
export interface ProposalResponse {
  proposal: Proposal;
  provider: string;
}
export interface RenderJob {
  id: string;
  status: string;
  progress?: number;
  url?: string;
  outputUrl?: string;
  error?: string;
}
async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const contentType = response.headers.get("content-type");
  if (!contentType?.includes("application/json"))
    throw new Error(
      "The local API is unavailable. Start the studio with npm run dev.",
    );
  const data = await response.json();
  if (!response.ok)
    throw new Error(
      typeof data.error === "string"
        ? data.error
        : data.message || `Request failed (${response.status})`,
    );
  return data as T;
}
export const proposeEdit = (project: Project, prompt: string) =>
  request<ProposalResponse>("/api/ai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ project, prompt }),
  });
export const startRender = (project: Project, locale: string, ratio: Ratio) =>
  request<RenderJob>("/api/render", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ project, locale, ratio }),
  });
export const getRender = (id: string) =>
  request<RenderJob>(`/api/render/${encodeURIComponent(id)}`);
export const formatTime = (time: number) =>
  `${Math.floor(time / 60)
    .toString()
    .padStart(2, "0")}:${Math.floor(time % 60)
    .toString()
    .padStart(2, "0")}.${Math.floor((time % 1) * 10)}`;
export const describeOperation = (operation: Operation) => {
  if (operation.type === "set-text")
    return `Text · ${operation.nodeId} · ${operation.locale.toUpperCase()}`;
  if (operation.type === "set-layout")
    return `Layout · ${operation.nodeId} · ${operation.ratio}`;
  if (operation.type === "set-brand") return "Brand colors and typography";
  if (operation.type === "set-sentence-text")
    return `Narration · ${operation.sentenceId} · ${operation.locale.toUpperCase()}`;
  if (operation.type === "set-sentence-duration")
    return `Voice timing · ${operation.sentenceId} · ${operation.locale.toUpperCase()}`;
  if (operation.type === "add-node") return `Add layer · ${operation.node.id}`;
  if (operation.type === "remove-node")
    return `Remove layer · ${operation.nodeId}`;
  if (operation.type === "set-sentence-audio")
    return `Narration audio · ${operation.sentenceId} · ${operation.locale.toUpperCase()}`;
  if (operation.type === "set-node-media")
    return `Replace media · ${operation.nodeId} · ${operation.asset.name || operation.asset.id}`;
  if (operation.type === "add-asset")
    return `Add media · ${operation.asset.name || operation.asset.id}`;
  return `Layout protection · ${operation.nodeId}`;
};

export async function uploadMedia(
  file: File,
): Promise<{ asset: Asset; duration?: number }> {
  if (file.size > 20 * 1024 * 1024)
    throw new Error("Choose a file smaller than 20 MB.");
  const data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = () => reject(new Error("Could not read this file."));
    reader.readAsDataURL(file);
  });
  return request("/api/media", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: file.name, mime: file.type, data }),
  });
}
