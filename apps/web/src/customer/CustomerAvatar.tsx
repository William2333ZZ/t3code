const INK = "#16181d";

// Main colour and the light tint of the same hue.
const HUES = [
  ["#4f6bff", "#cfd8ff"],
  ["#22a06b", "#c9f0dc"],
  ["#f0a020", "#ffe7b8"],
  ["#8b5cf6", "#e2d9ff"],
  ["#e5567a", "#ffd6e0"],
  ["#0e9aa7", "#c5eef2"],
] as const;

/** A stable pick from the palette for any id or name (FNV-1a). */
export function customerHue(seed: string): (typeof HUES)[number] {
  let hash = 0x811c9dc5;
  for (let index = 0; index < seed.length; index += 1) {
    hash = Math.imul(hash ^ seed.charCodeAt(index), 0x01000193);
  }
  return HUES[(hash >>> 0) % HUES.length]!;
}

/**
 * A pixel robot on an 8x8 grid. It stands for an assistant or a task, never a real person; the
 * seed only picks its colour.
 */
export function CustomerAvatar({ seed, size }: { seed: string; size: number }) {
  const [main, tint] = customerHue(seed);
  return (
    <svg
      aria-hidden="true"
      className="shrink-0"
      width={size}
      height={size}
      viewBox="0 0 8 8"
      shapeRendering="crispEdges"
    >
      <rect x="3" y="0" width="2" height="1" fill={main} />
      <rect x="1" y="1" width="6" height="3" fill={tint} />
      <rect x="2" y="2" width="1" height="1" fill={INK} />
      <rect x="5" y="2" width="1" height="1" fill={INK} />
      <rect x="2" y="4" width="4" height="3" fill={main} />
      <rect x="1" y="5" width="1" height="1" fill={main} />
      <rect x="6" y="5" width="1" height="1" fill={main} />
      <rect x="2" y="7" width="1" height="1" fill={INK} />
      <rect x="5" y="7" width="1" height="1" fill={INK} />
    </svg>
  );
}
