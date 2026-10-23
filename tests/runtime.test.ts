import { describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { supportedNode } from "../server/runtime";
const exec = promisify(execFile);
describe("installation diagnostics", () => {
  it("enforces the actual Node minimum", () => {
    for (const version of ["20.19.0", "22.11.0", "bad"])
      expect(supportedNode(version)).toBe(false);
    for (const version of ["22.12.0", "24.0.0", "26.12.1"])
      expect(supportedNode(version)).toBe(true);
  });
  it("exits unsuccessfully with recovery instructions when tools are missing", async () => {
    await expect(
      exec(process.execPath, ["--import", "tsx", "scripts/doctor.ts"], {
        env: {
          ...process.env,
          PATH: "/nonexistent",
          PLAYWRIGHT_BROWSERS_PATH: "/nonexistent",
        },
      }),
    ).rejects.toMatchObject({
      code: 1,
      stdout: expect.stringContaining("FAIL ffmpeg: Install FFmpeg"),
    });
  });
});
