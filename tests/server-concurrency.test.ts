import { afterEach, describe, expect, it } from "vitest";
import type { Server } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../server/app";
import { demoProject } from "../examples/demo";

const servers: Server[] = [];
const directories: string[] = [];
const releaseRenders: (() => void)[] = [];
afterEach(async () => {
  releaseRenders.splice(0).forEach((release) => release());
  await Promise.all(
    servers
      .splice(0)
      .map(
        (server) =>
          new Promise<void>((resolve) => server.close(() => resolve())),
      ),
  );
  await Promise.all(
    directories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe("export slot reservation", () => {
  it("accepts exactly one simultaneous render request and holds its slot until completion", async () => {
    const outputDir = await mkdtemp(
      join(tmpdir(), "cadencegraph-concurrency-"),
    );
    directories.push(outputDir);
    let release = () => {};
    const deferred = new Promise<void>((resolve) => {
      release = resolve;
    });
    releaseRenders.push(release);
    let renderCalls = 0;
    const app = createApp({
      baseUrl: "http://127.0.0.1:5173",
      outputDir,
      render: async () => {
        renderCalls++;
        await deferred;
      },
    });
    const server = app.listen(0, "127.0.0.1");
    servers.push(server);
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("No listening address");
    const base = `http://127.0.0.1:${address.port}`;
    const render = () =>
      fetch(`${base}/api/render`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project: demoProject,
          locale: "en",
          ratio: "16:9",
        }),
      });
    // Both requests reach the real HTTP server concurrently. Only the actual renderer is deferred.
    const responses = await Promise.all([render(), render()]);
    expect(responses.map((response) => response.status).sort()).toEqual([
      202, 429,
    ]);
    expect(renderCalls).toBe(1);
    const accepted = await responses
      .find((response) => response.status === 202)!
      .json();
    const rejected = await responses
      .find((response) => response.status === 429)!
      .json();
    expect(rejected.error).toContain("already running");
    expect((await render()).status).toBe(429);
    expect(
      (await (await fetch(`${base}/api/render/${accepted.id}`)).json()).status,
    ).toBe("rendering");
    release();
    await expect
      .poll(
        async () =>
          (await (await fetch(`${base}/api/render/${accepted.id}`)).json())
            .status,
      )
      .toBe("complete");
    expect((await render()).status).toBe(202);
    expect(renderCalls).toBe(2);
  });
});
