import type { SemanticPalette, SemanticPaletteColor } from "./terrainTypes";

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export function parseHex(hex: string): Rgb {
  const raw = hex.replace("#", "").trim();
  const full =
    raw.length === 3
      ? raw
          .split("")
          .map((c) => c + c)
          .join("")
      : raw;
  const n = Number.parseInt(full, 16);
  return {
    r: (n >> 16) & 0xff,
    g: (n >> 8) & 0xff,
    b: n & 0xff,
  };
}

export function rgbToHex(rgb: Rgb): string {
  const to = (v: number) => v.toString(16).padStart(2, "0");
  return `#${to(rgb.r)}${to(rgb.g)}${to(rgb.b)}`.toUpperCase();
}

export function colorDistance(a: Rgb, b: Rgb): number {
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return dr * dr + dg * dg + db * db;
}

export function paletteRgbMap(palette: SemanticPalette): Map<string, Rgb> {
  const map = new Map<string, Rgb>();
  for (const c of palette.colors) {
    map.set(c.id, parseHex(c.hex));
  }
  return map;
}

export function findPaletteColorByRgb(
  rgb: Rgb,
  palette: SemanticPalette,
  tolerance = 12,
): SemanticPaletteColor | null {
  let best: SemanticPaletteColor | null = null;
  let bestDist = tolerance * tolerance * 3 + 1;
  for (const c of palette.colors) {
    const d = colorDistance(rgb, parseHex(c.hex));
    if (d < bestDist) {
      bestDist = d;
      best = c;
    }
  }
  return best;
}

/** 调色板 v1 → v2：旧石质色精确映射，保存时自动升级像素 */
const LEGACY_PALETTE_HEX: Record<string, string> = {
  "#9D9A8C": "stone_road",
  "#B8B3A2": "stone_platform",
};

function resolvePaletteColor(rgb: Rgb, palette: SemanticPalette): SemanticPaletteColor | null {
  const legacyId = LEGACY_PALETTE_HEX[rgbToHex(rgb)];
  if (legacyId) {
    return palette.colors.find((c) => c.id === legacyId) ?? null;
  }
  return (
    findPaletteColorByRgb(rgb, palette, 0) ?? findPaletteColorByRgb(rgb, palette, 48)
  );
}

export function snapImageDataToPalette(data: ImageData, palette: SemanticPalette): number {
  let changed = 0;
  const px = data.data;
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] === 0) {
      const grass = palette.colors.find((c) => c.id === "grass") ?? palette.colors[0];
      const g = parseHex(grass.hex);
      px[i] = g.r;
      px[i + 1] = g.g;
      px[i + 2] = g.b;
      px[i + 3] = 255;
      changed++;
      continue;
    }
    const rgb = { r: px[i], g: px[i + 1], b: px[i + 2] };
    const nearest = resolvePaletteColor(rgb, palette);
    if (nearest) {
      const exact = parseHex(nearest.hex);
      if (px[i] !== exact.r || px[i + 1] !== exact.g || px[i + 2] !== exact.b) changed++;
      px[i] = exact.r;
      px[i + 1] = exact.g;
      px[i + 2] = exact.b;
      px[i + 3] = 255;
    }
  }
  return changed;
}

export function floodFill(data: ImageData, startX: number, startY: number, fillRgb: Rgb): void {
  const { width, height, data: px } = data;
  const startIdx = (startY * width + startX) * 4;
  const match = { r: px[startIdx], g: px[startIdx + 1], b: px[startIdx + 2] };
  if (match.r === fillRgb.r && match.g === fillRgb.g && match.b === fillRgb.b) return;

  const stack: [number, number][] = [[startX, startY]];
  const visited = new Uint8Array(width * height);

  while (stack.length > 0) {
    const [x, y] = stack.pop()!;
    const vi = y * width + x;
    if (x < 0 || y < 0 || x >= width || y >= height || visited[vi]) continue;
    const i = vi * 4;
    if (px[i] !== match.r || px[i + 1] !== match.g || px[i + 2] !== match.b) continue;
    visited[vi] = 1;
    px[i] = fillRgb.r;
    px[i + 1] = fillRgb.g;
    px[i + 2] = fillRgb.b;
    px[i + 3] = 255;
    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
}

export function isAnchorColor(c: SemanticPaletteColor): boolean {
  return Boolean(c.anchorType);
}

export const DEFAULT_SEMANTIC_PALETTE: SemanticPalette = {
  version: 1,
  colors: [
    { id: "grass", label: "普通草地", hex: "#3FA34D", walkable: true, decoratable: true },
    { id: "dirt", label: "泥地", hex: "#7A5A36", walkable: true, decoratable: true },
    { id: "stone_road", label: "石质通道", hex: "#6E6A62", walkable: true, decoratable: false },
    { id: "stone_platform", label: "石质台地", hex: "#D5CFC0", walkable: true, decoratable: false },
    { id: "boundary_grass", label: "边界深草", hex: "#1F5E36", walkable: false, decoratable: true },
    { id: "water_or_pit", label: "水体/深坑", hex: "#2D4F73", walkable: false, decoratable: false },
    { id: "clear_zone", label: "战斗/交互净区", hex: "#FFFFFF", walkable: true, decoratable: false },
    { id: "ruin_anchor", label: "遗迹锚点", hex: "#FF0000", anchorType: "ruin" },
    { id: "nature_anchor", label: "自然锚点", hex: "#00FF00", anchorType: "nature" },
    { id: "interact_anchor", label: "交互锚点", hex: "#FFFF00", anchorType: "interact" },
    { id: "npc_anchor", label: "NPC锚点", hex: "#FF00FF", anchorType: "npc" },
    { id: "special_anchor", label: "特殊锚点", hex: "#00FFFF", anchorType: "special" },
  ],
};
