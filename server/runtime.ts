import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { chromium } from "playwright";
const exec = promisify(execFile);
export interface RuntimeCheck {
  name: string;
  available: boolean;
  detail: string;
}
export function supportedNode(version: string) {
  const [major, minor] = version.replace(/^v/, "").split(".").map(Number);
  return major > 22 || (major === 22 && minor >= 12);
}
export async function rendererStatus() {
  const checks = await Promise.all([
    ...["ffmpeg", "ffprobe"].map(async (command): Promise<RuntimeCheck> => {
      try {
        const { stdout } = await exec(
          command,
          command === "ffmpeg" ? ["-hide_banner", "-encoders"] : ["-version"],
          { timeout: 10000, maxBuffer: 1024 * 1024 },
        );
        if (command === "ffmpeg" && !/\blibx264\b/.test(stdout))
          throw new Error("libx264 missing");
        return {
          name: command,
          available: true,
          detail:
            command === "ffmpeg"
              ? "H.264 encoder available"
              : "Media inspection available",
        };
      } catch {
        return {
          name: command,
          available: false,
          detail: `Install FFmpeg with ffprobe and libx264, and make ${command} available on PATH.`,
        };
      }
    }),
    (async (): Promise<RuntimeCheck> => {
      try {
        const browser = await chromium.launch({
          headless: true,
          timeout: 10000,
        });
        await browser.close();
        return {
          name: "chromium",
          available: true,
          detail: "Headless browser launched successfully",
        };
      } catch {
        return {
          name: "chromium",
          available: false,
          detail:
            "Run npx playwright install chromium (Linux: npx playwright install --with-deps chromium).",
        };
      }
    })(),
  ]);
  return {
    available: checks.every((check) => check.available),
    engine: "Chromium + FFmpeg",
    checks,
  };
}
