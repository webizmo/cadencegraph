import express from "express";
import { resolve } from "node:path";
import { createServer } from "vite";
import { createApp } from "./app";

const port = Number(process.env.PORT ?? 5173);
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error("PORT must be an integer between 1024 and 65535.");
const app = createApp({ baseUrl: `http://127.0.0.1:${port}` });
if (process.env.NODE_ENV === "production") {
  app.use(express.static(resolve("dist")));
  app.get("/{*path}", (_req, res) => res.sendFile(resolve("dist/index.html")));
} else {
  const vite = await createServer({
    server: { middlewareMode: true },
    appType: "spa",
  });
  app.use(vite.middlewares);
}
app.listen(port, "127.0.0.1", () =>
  console.log(`CadenceGraph → http://127.0.0.1:${port}`),
);
