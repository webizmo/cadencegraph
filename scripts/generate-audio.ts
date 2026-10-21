import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

/** Original, deterministic synthesized score. No samples, voices or external service. */
export function synthesizeScore(duration: number, sampleRate = 48000): Buffer {
  const frames = Math.ceil(duration * sampleRate),
    data = Buffer.alloc(frames * 2 + 44);
  data.write("RIFF", 0);
  data.writeUInt32LE(data.length - 8, 4);
  data.write("WAVEfmt ", 8);
  data.writeUInt32LE(16, 16);
  data.writeUInt16LE(1, 20);
  data.writeUInt16LE(1, 22);
  data.writeUInt32LE(sampleRate, 24);
  data.writeUInt32LE(sampleRate * 2, 28);
  data.writeUInt16LE(2, 32);
  data.writeUInt16LE(16, 34);
  data.write("data", 36);
  data.writeUInt32LE(frames * 2, 40);
  const chords = [
    [130.8128, 164.8138, 195.9977, 246.9417],
    [110, 130.8128, 164.8138, 195.9977],
    [87.3071, 110, 130.8128, 164.8138],
    [97.9989, 123.4708, 146.8324, 195.9977],
  ];
  for (let i = 0; i < frames; i++) {
    const t = i / sampleRate,
      beat = t / (60 / 108),
      chord = chords[Math.floor(beat / 8) % 4];
    const fade = Math.min(1, t / 0.7, Math.max(0, (duration - t) / 1.2));
    let sample = 0;
    for (const f of chord)
      sample +=
        0.026 *
        (Math.sin(2 * Math.PI * f * t) +
          0.3 * Math.sin(2 * Math.PI * f * 2 * t)) *
        Math.sin(Math.PI * Math.min(1, (beat % 8) / 0.3));
    const phase = beat % 1,
      half = (beat * 2) % 1;
    sample +=
      0.13 *
      Math.sin(2 * Math.PI * (43 + 30 * Math.exp(-phase * 26)) * t) *
      Math.exp(-phase * 12);
    const note = chord[Math.floor(beat * 2) % 4] * 4;
    sample += 0.052 * Math.sin(2 * Math.PI * note * t) * Math.exp(-half * 7);
    const noise = Math.sin(i * 78.233 + Math.sin(i * 0.123) * 43758.5453);
    sample += 0.018 * noise * Math.exp(-((beat * 4) % 1) * 40);
    data.writeInt16LE(
      Math.round(Math.max(-1, Math.min(1, sample * fade)) * 32767),
      44 + i * 2,
    );
  }
  return data;
}
export async function writeScore(path: string, duration: number) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, synthesizeScore(duration));
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const path = process.argv[2] || "outputs/original-score.wav";
  await writeScore(path, Number(process.argv[3] || 24));
  console.log(`Wrote original procedural score: ${path}`);
}
