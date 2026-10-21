import { describe, expect, test } from "vitest";
import { entrance, easeOut, stagger } from "../src/render/motion";
import { synthesizeScore } from "../scripts/generate-audio";
import { listComponents, registerComponent } from "../src/render/registry";

describe("seek-safe rendering", () => {
  test("reverse seeks reproduce identical animation state", () => {
    const first = entrance(2, 0, 6, "scale", 0.2);
    entrance(5, 0, 6, "scale", 0.2);
    entrance(0, 0, 6, "scale", 0.2);
    expect(entrance(2, 0, 6, "scale", 0.2)).toEqual(first);
  });
  test("entrances are bounded and disappear outside the active range", () => {
    expect(entrance(-1, 0, 6).opacity).toBe(0);
    expect(entrance(6.1, 0, 6).opacity).toBe(0);
    expect(easeOut(-0.5)).toBe(0);
    expect(easeOut(4)).toBe(1);
    expect(stagger(0.1, 3)).toBe(0);
  });
  test("the original score has correct PCM header, duration, determinism and fade", () => {
    const a = synthesizeScore(0.4, 8000),
      b = synthesizeScore(0.4, 8000);
    expect(a.equals(b)).toBe(true);
    expect(a.toString("ascii", 0, 4)).toBe("RIFF");
    expect(a.readUInt32LE(40)).toBe(6400);
    expect(a.length).toBe(6444);
    expect(a.readInt16LE(44)).toBe(0);
    expect(a.subarray(100, 500).some((v) => v !== 0)).toBe(true);
  });
  test("components must be explicitly registered with stable unique names", () => {
    expect(listComponents().map((c) => c.name)).toContain("metric-bars");
    expect(() =>
      registerComponent("signal-orbit", {
        description: "duplicate",
        Component: () => null,
      }),
    ).toThrow("already registered");
    expect(() =>
      registerComponent("../script", {
        description: "unsafe",
        Component: () => null,
      }),
    ).toThrow("lowercase");
  });
});
