/** Every animation is a pure function of project time, including reverse seeks. */
export const clamp = (value: number, min = 0, max = 1) =>
  Math.min(max, Math.max(min, value));
export const easeOut = (value: number) => 1 - Math.pow(1 - clamp(value), 4);
export const easeInOut = (value: number) => {
  const t = clamp(value);
  return t * t * (3 - 2 * t);
};
export const stagger = (
  time: number,
  index: number,
  interval = 0.12,
  duration = 0.75,
) => easeOut((time - index * interval) / duration);
export const lerp = (from: number, to: number, progress: number) =>
  from + (to - from) * progress;
export function entrance(
  time: number,
  start: number,
  end: number,
  animation = "rise",
  delay = 0,
) {
  const progress = easeOut((time - start - delay) / 0.65);
  const exit = clamp((end - time) / 0.22);
  return {
    opacity: progress * exit,
    transform:
      animation === "scale"
        ? `scale(${lerp(0.87, 1, progress)})`
        : animation === "slide"
          ? `translateX(${lerp(7, 0, progress)}%)`
          : animation === "fade"
            ? "none"
            : `translateY(${lerp(22, 0, progress)}%)`,
  };
}
