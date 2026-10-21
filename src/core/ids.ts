/** Stable nested IDs fit the schema even when the parent's ID uses all 96 characters. */
export function nestedId(parent: string, suffix: string): string {
  const value = `${parent}-${suffix}`;
  if (value.length <= 96) return value;
  let hash = 2166136261;
  for (const char of parent)
    hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  const tail = `-${(hash >>> 0).toString(36)}-${suffix}`;
  return `${parent.slice(0, 96 - tail.length)}${tail}`;
}
