import { useEffect, useRef, type RefObject } from "react";
import type { Project } from "../core";
const loadingFonts = new Map<string, Promise<FontFace>>();
export async function loadProjectFonts(project: Project) {
  await Promise.all(
    project.assets
      .filter((a) => a.type === "font")
      .map((asset) => {
        const family = asset.name || project.brand.fontFamily,
          key = `${family}:${asset.src}`;
        if (!loadingFonts.has(key))
          loadingFonts.set(
            key,
            new FontFace(family, `url(${JSON.stringify(asset.src)})`)
              .load()
              .then((face) => {
                document.fonts.add(face);
                return face;
              })
              .catch((error) => {
                loadingFonts.delete(key);
                throw error;
              }),
          );
        return loadingFonts.get(key);
      }),
  );
  await document.fonts.load(`16px ${JSON.stringify(project.brand.fontFamily)}`);
  await document.fonts.ready;
}
export function isFontLoaded(family: string) {
  const normalized = family
    .trim()
    .replace(/^['"]|['"]$/g, "")
    .toLowerCase();
  return [...document.fonts].some(
    (face) =>
      face.family.replace(/^['"]|['"]$/g, "").toLowerCase() === normalized &&
      face.status === "loaded",
  );
}
/** Sync browser media to the same semantic clock used for export. */
export function useMediaClock(
  root: RefObject<HTMLDivElement | null>,
  time: number,
  playing: boolean,
) {
  const previous = useRef<HTMLMediaElement[]>([]);
  useEffect(() => {
    const elements = [
      ...(root.current?.querySelectorAll<HTMLMediaElement>(
        "video[data-project-time],audio[data-project-time]",
      ) ?? []),
    ];
    previous.current
      .filter((media) => !elements.includes(media))
      .forEach((media) => media.pause());
    previous.current = elements;
    const cleanups: (() => void)[] = [];
    for (const media of elements) {
      const sync = () => {
        const desired = Number(media.dataset.projectTime || 0),
          slot = Number(media.dataset.slotDuration || 0);
        const speed =
          media.tagName === "AUDIO" && slot && Number.isFinite(media.duration)
            ? media.duration / slot
            : 1;
        const target = desired * speed;
        media.playbackRate = Math.max(0.0625, Math.min(16, speed));
        if (
          Number.isFinite(media.duration) &&
          Math.abs(media.currentTime - target) > (playing ? 0.15 : 0.015)
        )
          media.currentTime = Math.min(
            target,
            Math.max(0, media.duration - 0.01),
          );
        if (playing && desired >= 0 && (!slot || desired < slot))
          void media.play().catch(() => {
            media.dataset.previewError = "playback-blocked";
          });
        else media.pause();
      };
      sync();
      media.addEventListener("loadedmetadata", sync);
      cleanups.push(() => media.removeEventListener("loadedmetadata", sync));
    }
    return () => {
      cleanups.forEach((fn) => fn());
    };
  }, [root, time, playing]);
  useEffect(
    () => () => {
      previous.current.forEach((media) => media.pause());
    },
    [],
  );
}
