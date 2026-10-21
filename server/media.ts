import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import { resolve, join } from "node:path";
import { randomUUID } from "node:crypto";
import type { Asset } from "../src/core";
const exec = promisify(execFile);
const formats: Record<string, { ext: string; type: Asset["type"] }> = {
  "audio/mpeg": { ext: "mp3", type: "audio" },
  "audio/wav": { ext: "wav", type: "audio" },
  "audio/x-wav": { ext: "wav", type: "audio" },
  "audio/ogg": { ext: "ogg", type: "audio" },
  "audio/mp4": { ext: "m4a", type: "audio" },
  "audio/x-m4a": { ext: "m4a", type: "audio" },
  "image/png": { ext: "png", type: "image" },
  "image/jpeg": { ext: "jpg", type: "image" },
  "image/webp": { ext: "webp", type: "image" },
  "video/mp4": { ext: "mp4", type: "video" },
  "video/webm": { ext: "webm", type: "video" },
};
export async function storeMedia(input: unknown) {
  const { name, mime, data } = (input ?? {}) as Record<string, unknown>;
  if (
    typeof name !== "string" ||
    name.length > 200 ||
    typeof mime !== "string" ||
    !formats[mime] ||
    typeof data !== "string" ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(data)
  )
    throw new Error(
      "Choose a WAV, MP3, OGG, M4A, PNG, JPEG, WebP, MP4 or WebM file.",
    );
  const buffer = Buffer.from(data, "base64");
  if (!buffer.length || buffer.length > 20 * 1024 * 1024)
    throw new Error("Media must be between 1 byte and 20 MB.");
  // Reject executable/document uploads even if their caller-supplied MIME type is allowed.
  const format = formats[mime];
  if (format.type === "image") {
    const png = buffer
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const jpeg = buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255;
    const webp =
      buffer.toString("ascii", 0, 4) === "RIFF" &&
      buffer.toString("ascii", 8, 12) === "WEBP";
    if (!(
      (mime === "image/png" && png) ||
      (mime === "image/jpeg" && jpeg) ||
      (mime === "image/webp" && webp)
    ))
      throw new Error("Image file contents do not match its type.");
  }
  const id = `media-${randomUUID()}`;
  const filename = `${id}.${format.ext}`;
  const dir = resolve("public/assets/uploads");
  await mkdir(dir, { recursive: true });
  const path = join(dir, filename);
  await writeFile(path, buffer, { flag: "wx" });
  let duration: number | undefined;
  try {
    const { stdout } = await exec(
      "ffprobe",
      [
        "-v",
        "error",
        "-show_entries",
        "format=duration:stream=codec_type",
        "-of",
        "json",
        path,
      ],
      { timeout: 10000, maxBuffer: 65536 },
    );
    const metadata = JSON.parse(stdout);
    if (
      !metadata.streams?.some(
        (s: { codec_type: string }) =>
          s.codec_type === (format.type === "image" ? "video" : format.type),
      )
    )
      throw new Error("The file does not contain the expected media stream.");
    if (format.type !== "image") {
      duration = Number(metadata.format.duration);
      if (!Number.isFinite(duration) || duration < 0.2 || duration > 120)
        throw new Error("Use a clip between 0.2 and 120 seconds.");
      duration = Math.round(duration * 1000) / 1000;
    }
  } catch (error) {
    await unlink(path);
    throw new Error(
      error instanceof Error && !("code" in error)
        ? error.message
        : "Unable to inspect media. Ensure FFmpeg/ffprobe is installed and the file is valid.",
    );
  }
  return {
    asset: {
      id,
      type: format.type,
      src: `assets/uploads/${filename}`,
      name: name.replace(/[\r\n\x00-\x1f]/g, ""),
    } satisfies Asset,
    ...(duration ? { duration } : {}),
  };
}
