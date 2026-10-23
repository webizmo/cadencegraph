import { afterEach, describe, expect, it } from "vitest";
import type { Server } from "node:http";
import { createApp } from "../server/app";
import { validateProposal } from "../server/ai";
import { demoProject } from "../examples/demo.ts";
const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(
    servers.splice(0).map((s) => new Promise<void>((r) => s.close(() => r()))),
  );
});
async function start() {
  const app = createApp({
    baseUrl: "http://127.0.0.1:5173",
    status: async () => ({ provider: "fixture", available: true }),
    ai: async (project) => ({
      provider: "claude-cli",
      proposal: validateProposal(
        {
          summary: "A test edit",
          operations: [
            {
              type: "set-text",
              nodeId: "intro-headline",
              locale: "en",
              text: "Test edit",
            },
          ],
        },
        project,
      ),
    }),
  });
  const server = app.listen(0, "127.0.0.1");
  servers.push(server);
  await new Promise<void>((r) => server.once("listening", r));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error();
  return `http://127.0.0.1:${address.port}`;
}
describe("Local API boundaries", () => {
  it("rejects cross-site proposals before executing the provider", async () => {
    const url = await start();
    const r = await fetch(`${url}/api/ai`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://untrusted.example",
      },
      body: JSON.stringify({ project: demoProject, prompt: "Edit this" }),
    });
    expect(r.status).toBe(403);
  });
  it("rejects malformed projects and unexpected transaction fields", async () => {
    const url = await start();
    const r = await fetch(`${url}/api/ai`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        project: { schemaVersion: 99 },
        prompt: "Edit this",
      }),
    });
    expect(r.status).toBe(400);
    expect(() =>
      validateProposal(
        {
          summary: "bad",
          operations: [
            {
              type: "set-text",
              nodeId: "intro-headline",
              locale: "en",
              text: "Hi",
              execute: "evil",
            },
          ],
        },
        demoProject,
      ),
    ).toThrow();
  });
  it("binds proposal revision to the supplied project and validates operations", async () => {
    const url = await start();
    const r = await fetch(`${url}/api/ai`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project: demoProject, prompt: "Edit headline" }),
    });
    const body = await r.json();
    expect(r.status).toBe(200);
    expect(body.proposal.baseRevision).toBe(0);
    expect(body.proposal.operations[0].nodeId).toBe("intro-headline");
  });
  it("does not admit wrong media types, path names, or undeclared variants", async () => {
    const url = await start();
    const headers = { "Content-Type": "application/json" };
    expect(
      (
        await fetch(`${url}/api/media`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            name: "../../evil.html",
            mime: "image/png",
            data: Buffer.from("<script>alert(1)</script>").toString("base64"),
          }),
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await fetch(`${url}/api/render`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            project: demoProject,
            locale: "fr",
            ratio: "16:9",
          }),
        })
      ).status,
    ).toBe(400);
  });
});

describe("release readiness API", () => {
  it("reports missing renderer dependencies instead of unconditional availability", async () => {
    const app = createApp({
      baseUrl: "http://127.0.0.1",
      status: async () => ({ provider: "fixture", available: false }),
      rendererStatus: async () => ({
        available: false,
        engine: "Chromium + FFmpeg",
        checks: [
          { name: "ffmpeg", available: false, detail: "Install FFmpeg" },
        ],
      }),
    });
    const server = app.listen(0, "127.0.0.1");
    servers.push(server);
    await new Promise<void>((r) => server.once("listening", r));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error();
    const response = await fetch(`http://127.0.0.1:${address.port}/api/status`);
    expect(await response.json()).toMatchObject({
      renderer: {
        available: false,
        checks: [{ name: "ffmpeg", detail: "Install FFmpeg" }],
      },
    });
  });
  it("returns 413 with the correct project and media limits", async () => {
    const base = await start();
    for (const [path, size, message] of [
      ["/api/render", 3, "2 MB"],
      ["/api/media", 29, "28 MB"],
    ] as const) {
      const response = await fetch(`${base}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: "a".repeat(size * 1024 * 1024) }),
      });
      expect(response.status).toBe(413);
      expect((await response.json()).error).toContain(message);
    }
  });
});
