import type { SemanticPalette } from "./terrainTypes";
import {
  findPaletteColorByRgb,
  isAnchorColor,
  parseHex,
  type Rgb,
} from "./semanticColor";

/** 整块区域随机生成（不含战斗/交互净区） */
export type SemanticRegionRecipe =
  | "random_stage_layout"
  | "random_platforms"
  | "random_road_network"
  | "random_boundary"
  | "random_dirt_fields";

/** 语义交界融合修饰 */
export type SemanticFusionRecipe =
  | "road_edge_grass"
  | "road_platform_gap"
  | "grass_dirt_scatter"
  | "platform_edge_dirt";

export type SemanticProceduralRecipe = SemanticRegionRecipe | SemanticFusionRecipe;

export const REGION_RECIPE_LABELS: Record<SemanticRegionRecipe, string> = {
  random_stage_layout: "随机舞台布局",
  random_platforms: "随机台地团块",
  random_road_network: "连接通道网络",
  random_boundary: "随机边界深草",
  random_dirt_fields: "随机泥地区域",
};

export const FUSION_RECIPE_LABELS: Record<SemanticFusionRecipe, string> = {
  road_edge_grass: "石道边界草缘",
  road_platform_gap: "通道↔台地草间隙",
  grass_dirt_scatter: "草地泥斑撒点",
  platform_edge_dirt: "台地边缘泥过渡",
};

export const PROCEDURAL_RECIPE_LABELS: Record<SemanticProceduralRecipe, string> = {
  ...REGION_RECIPE_LABELS,
  ...FUSION_RECIPE_LABELS,
};

export type SemanticLayoutScale = "compact" | "standard" | "expansive";

export const LAYOUT_SCALE_LABELS: Record<SemanticLayoutScale, string> = {
  compact: "紧凑（手绘）",
  standard: "标准",
  expansive: "开阔",
};

export const LAYOUT_SCALE_HINTS: Record<SemanticLayoutScale, string> = {
  compact: "少量大团块，接近手绘舞台尺度",
  standard: "中等团块与通道密度",
  expansive: "更多台地，空间分布更碎",
};

export interface ProceduralOptions {
  seed?: number;
  fringeWidth?: number;
  gapWidth?: number;
  gapBreak?: number;
  scatterDensity?: number;
  scatterScale?: number;
  transitionWidth?: number;
  platformCount?: number;
  featureScale?: number;
  roadWidth?: number;
  boundaryMargin?: number;
  layoutScale?: SemanticLayoutScale;
}

interface ResolvedProceduralOptions extends Required<ProceduralOptions> {
  layoutScale: SemanticLayoutScale;
  fbmOctaves: number;
  smoothRadius: number;
  minAreaRatio: number;
  dirtInLayout: boolean;
  /** 泥地噪声频率（已按短边归一化为绝对 scale） */
  dirtScale: number;
}

/**
 * 尺度预设。
 * - featureCycles / dirtCycles：以「短边上的特征周期数」表示，运行时除以 min(width,height)
 *   得到绝对噪声 scale，从而让团块/泥地相对画面的尺寸与分辨率无关（720p 与 4K 观感一致）。
 *   数值越小 → 团块越大越少（更接近手绘单舞台尺度）。
 */
interface ScalePreset {
  platformCount: number;
  featureCycles: number;
  dirtCycles: number;
  roadWidth: number;
  scatterDensity: number;
  scatterScale: number;
  boundaryMargin: number;
  fbmOctaves: number;
  smoothRadius: number;
  minAreaRatio: number;
  dirtInLayout: boolean;
  gapBreak: number;
}

const SCALE_PRESETS: Record<SemanticLayoutScale, ScalePreset> = {
  compact: {
    platformCount: 4,
    featureCycles: 2.2,
    dirtCycles: 1.6,
    roadWidth: 20,
    scatterDensity: 0.05,
    scatterScale: 0.016,
    boundaryMargin: 0.05,
    fbmOctaves: 2,
    smoothRadius: 7,
    minAreaRatio: 0.02,
    dirtInLayout: false,
    gapBreak: 0.1,
  },
  standard: {
    platformCount: 5,
    featureCycles: 3.4,
    dirtCycles: 2.0,
    roadWidth: 16,
    scatterDensity: 0.1,
    scatterScale: 0.026,
    boundaryMargin: 0.048,
    fbmOctaves: 3,
    smoothRadius: 4,
    minAreaRatio: 0.008,
    dirtInLayout: true,
    gapBreak: 0.12,
  },
  expansive: {
    platformCount: 6,
    featureCycles: 4.6,
    dirtCycles: 2.6,
    roadWidth: 12,
    scatterDensity: 0.16,
    scatterScale: 0.036,
    boundaryMargin: 0.04,
    fbmOctaves: 4,
    smoothRadius: 2,
    minAreaRatio: 0.003,
    dirtInLayout: true,
    gapBreak: 0.14,
  },
};

const DEFAULT_OPTS: Required<ProceduralOptions> = {
  seed: 42,
  fringeWidth: 3,
  gapWidth: 2,
  gapBreak: 0.12,
  scatterDensity: 0.1,
  scatterScale: 0.026,
  transitionWidth: 2,
  platformCount: 4,
  featureScale: 0.01,
  roadWidth: 20,
  boundaryMargin: 0.05,
  layoutScale: "compact",
};

function resolveOpts(
  options: ProceduralOptions,
  width: number,
  height: number,
): ResolvedProceduralOptions {
  const layoutScale = options.layoutScale ?? "compact";
  const preset = SCALE_PRESETS[layoutScale];
  const merged = { ...DEFAULT_OPTS, ...preset, layoutScale, ...options };
  const shortSide = Math.max(1, Math.min(width, height));
  // 显式传入的 featureScale 视为绝对覆盖，否则由短边周期数归一化得到。
  const featureScale = options.featureScale ?? preset.featureCycles / shortSide;
  return {
    ...merged,
    featureScale,
    layoutScale,
    fbmOctaves: preset.fbmOctaves,
    smoothRadius: preset.smoothRadius,
    minAreaRatio: preset.minAreaRatio,
    dirtInLayout: preset.dirtInLayout,
    dirtScale: preset.dirtCycles / shortSide,
  };
}

export function layoutScaleDefaults(scale: SemanticLayoutScale): {
  platformCount: number;
  roadWidth: number;
  scatterDensityPercent: number;
} {
  const p = SCALE_PRESETS[scale];
  return {
    platformCount: p.platformCount,
    roadWidth: p.roadWidth,
    scatterDensityPercent: Math.round(p.scatterDensity * 100),
  };
}

export interface ProceduralProgress {
  phase: string;
  percent: number;
}

export type ProceduralProgressCallback = (progress: ProceduralProgress) => void;

const yieldUi = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

async function reportProgress(
  onProgress: ProceduralProgressCallback | undefined,
  phase: string,
  percent: number,
): Promise<void> {
  onProgress?.({ phase, percent: Math.min(100, Math.max(0, Math.round(percent))) });
  await yieldUi();
}

function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function paletteAt(
  data: ImageData,
  x: number,
  y: number,
  palette: SemanticPalette,
): ReturnType<typeof findPaletteColorByRgb> {
  const { width, data: px } = data;
  const i = (y * width + x) * 4;
  return findPaletteColorByRgb({ r: px[i], g: px[i + 1], b: px[i + 2] }, palette, 0);
}

function isAnchorAt(data: ImageData, x: number, y: number, palette: SemanticPalette): boolean {
  const c = paletteAt(data, x, y, palette);
  return Boolean(c && isAnchorColor(c));
}

function isProtectedAt(data: ImageData, x: number, y: number, palette: SemanticPalette): boolean {
  if (isAnchorAt(data, x, y, palette)) return true;
  const c = paletteAt(data, x, y, palette);
  return c?.id === "clear_zone";
}

function snapshotProtectedPixels(data: ImageData, palette: SemanticPalette): Map<number, Rgb> {
  const { width, height, data: px } = data;
  const saved = new Map<number, Rgb>();
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!isProtectedAt(data, x, y, palette)) continue;
      const idx = y * width + x;
      const i = idx * 4;
      saved.set(idx, { r: px[i], g: px[i + 1], b: px[i + 2] });
    }
  }
  return saved;
}

function restoreProtectedPixels(data: ImageData, saved: Map<number, Rgb>, width: number): void {
  for (const [idx, rgb] of saved) {
    const x = idx % width;
    const y = (idx / width) | 0;
    setPixel(data, x, y, rgb);
  }
}

export function buildSemanticMask(
  data: ImageData,
  palette: SemanticPalette,
  colorIds: string[],
): Uint8Array {
  const { width, height } = data;
  const mask = new Uint8Array(width * height);
  const idSet = new Set(colorIds);
  const px = data.data;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const match = findPaletteColorByRgb(
        { r: px[i], g: px[i + 1], b: px[i + 2] },
        palette,
        0,
      );
      if (match && idSet.has(match.id)) mask[y * width + x] = 1;
    }
  }
  return mask;
}

/**
 * 方形（切比雪夫）结构元素的形态学滤波，按行/列两次 1D 滑窗实现。
 * 方形膨胀/腐蚀对结构元素可分离，复杂度从 O(n·r²) 降到 O(n·r)，
 * 视觉结果与逐像素方形扫描一致；越界像素按背景(0)处理（与旧实现一致，会腐蚀边缘）。
 */
function separableBox(
  mask: Uint8Array,
  width: number,
  height: number,
  radius: number,
  dilate: boolean,
): Uint8Array {
  const win = 2 * radius + 1;
  const tmp = new Uint8Array(mask.length);

  // 横向 1D
  for (let y = 0; y < height; y++) {
    const row = y * width;
    let count = 0;
    for (let x = 0; x <= radius && x < width; x++) count += mask[row + x];
    for (let x = 0; x < width; x++) {
      if (dilate) {
        tmp[row + x] = count > 0 ? 1 : 0;
      } else {
        tmp[row + x] = x - radius >= 0 && x + radius < width && count === win ? 1 : 0;
      }
      const outX = x - radius;
      const incX = x + radius + 1;
      if (incX < width) count += mask[row + incX];
      if (outX >= 0) count -= mask[row + outX];
    }
  }

  // 纵向 1D
  const out = new Uint8Array(mask.length);
  for (let x = 0; x < width; x++) {
    let count = 0;
    for (let y = 0; y <= radius && y < height; y++) count += tmp[y * width + x];
    for (let y = 0; y < height; y++) {
      const idx = y * width + x;
      if (dilate) {
        out[idx] = count > 0 ? 1 : 0;
      } else {
        out[idx] = y - radius >= 0 && y + radius < height && count === win ? 1 : 0;
      }
      const outY = y - radius;
      const incY = y + radius + 1;
      if (incY < height) count += tmp[incY * width + x];
      if (outY >= 0) count -= tmp[outY * width + x];
    }
  }
  return out;
}

export function dilateMask(
  mask: Uint8Array,
  width: number,
  height: number,
  radius: number,
): Uint8Array {
  if (radius <= 0) return mask.slice();
  return separableBox(mask, width, height, radius, true);
}

export function erodeMask(
  mask: Uint8Array,
  width: number,
  height: number,
  radius: number,
): Uint8Array {
  if (radius <= 0) return mask.slice();
  return separableBox(mask, width, height, radius, false);
}

function distanceFromMask(
  source: Uint8Array,
  width: number,
  height: number,
  maxDist: number,
): Int16Array {
  const dist = new Int16Array(source.length);
  dist.fill(-1);
  const queue: number[] = [];
  for (let i = 0; i < source.length; i++) {
    if (source[i]) {
      dist[i] = 0;
      queue.push(i);
    }
  }
  let head = 0;
  const neighbors = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  while (head < queue.length) {
    const idx = queue[head++];
    const d = dist[idx];
    if (d >= maxDist) continue;
    const x = idx % width;
    const y = (idx / width) | 0;
    for (const [dx, dy] of neighbors) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const ni = ny * width + nx;
      if (dist[ni] === -1) {
        dist[ni] = d + 1;
        queue.push(ni);
      }
    }
  }
  return dist;
}

function valueNoise2d(x: number, y: number, seed: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const hash = (a: number, b: number) => {
    const s = (seed + a * 374761393 + b * 668265263) >>> 0;
    return mulberry32(s)();
  };
  const v00 = hash(ix, iy);
  const v10 = hash(ix + 1, iy);
  const v01 = hash(ix, iy + 1);
  const v11 = hash(ix + 1, iy + 1);
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const top = v00 + (v10 - v00) * sx;
  const bot = v01 + (v11 - v01) * sx;
  return top + (bot - top) * sy;
}

function fbm(x: number, y: number, seed: number, octaves = 4): number {
  let amp = 0.5;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise2d(x * freq, y * freq, seed + i * 97);
    norm += amp;
    amp *= 0.5;
    freq *= 2.1;
  }
  return sum / norm;
}

function colorRgb(palette: SemanticPalette, id: string): Rgb {
  const c = palette.colors.find((x) => x.id === id);
  if (!c) throw new Error(`Palette color not found: ${id}`);
  return parseHex(c.hex);
}

function setPixel(data: ImageData, x: number, y: number, rgb: Rgb): void {
  const i = (y * data.width + x) * 4;
  const px = data.data;
  px[i] = rgb.r;
  px[i + 1] = rgb.g;
  px[i + 2] = rgb.b;
  px[i + 3] = 255;
}

function fillColor(
  data: ImageData,
  palette: SemanticPalette,
  colorId: string,
  skipAnchors: boolean,
): void {
  const { width, height } = data;
  const rgb = colorRgb(palette, colorId);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (skipAnchors && isAnchorAt(data, x, y, palette)) continue;
      setPixel(data, x, y, rgb);
    }
  }
}

function paintMask(
  data: ImageData,
  palette: SemanticPalette,
  mask: Uint8Array,
  targetId: string,
  onlyOnColorIds?: string[],
): number {
  const { width, height } = data;
  const rgb = colorRgb(palette, targetId);
  const onlyOn = onlyOnColorIds ? new Set(onlyOnColorIds) : null;
  let changed = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (!mask[idx]) continue;
      if (isProtectedAt(data, x, y, palette)) continue;
      if (onlyOn) {
        const cur = paletteAt(data, x, y, palette);
        if (!cur || !onlyOn.has(cur.id)) continue;
      }
      const i = idx * 4;
      const px = data.data;
      if (px[i] !== rgb.r || px[i + 1] !== rgb.g || px[i + 2] !== rgb.b) changed++;
      setPixel(data, x, y, rgb);
    }
  }
  return changed;
}

interface MaskComponent {
  indices: number[];
  area: number;
  cx: number;
  cy: number;
}

function findComponents(mask: Uint8Array, width: number, height: number): MaskComponent[] {
  const visited = new Uint8Array(mask.length);
  const components: MaskComponent[] = [];
  const neighbors = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];

  for (let i = 0; i < mask.length; i++) {
    if (!mask[i] || visited[i]) continue;
    const indices: number[] = [];
    const stack = [i];
    visited[i] = 1;
    let sumX = 0;
    let sumY = 0;
    while (stack.length > 0) {
      const idx = stack.pop()!;
      indices.push(idx);
      const x = idx % width;
      const y = (idx / width) | 0;
      sumX += x;
      sumY += y;
      for (const [dx, dy] of neighbors) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const ni = ny * width + nx;
        if (!mask[ni] || visited[ni]) continue;
        visited[ni] = 1;
        stack.push(ni);
      }
    }
    components.push({
      indices,
      area: indices.length,
      cx: sumX / indices.length,
      cy: sumY / indices.length,
    });
  }
  return components;
}

function maskFromComponents(
  width: number,
  height: number,
  components: MaskComponent[],
): Uint8Array {
  const out = new Uint8Array(width * height);
  for (const c of components) {
    for (const idx of c.indices) out[idx] = 1;
  }
  return out;
}

/**
 * 四边深草强度（[top,right,bottom,left]）。
 * 归一化到 [0,1] 后必有一条边为 0（近乎裸露）、一条边为 1（最深），
 * 从而破坏「四边等宽实心相框」——这是 Image2 误把边界当画框的根因。
 */
function computeEdgeStrengths(seed: number): [number, number, number, number] {
  const rng = mulberry32(seed + 1301);
  const v = [rng(), rng(), rng(), rng()];
  const max = Math.max(...v);
  const min = Math.min(...v);
  const span = Math.max(0.001, max - min);
  return v.map((t) => (t - min) / span) as [number, number, number, number];
}

/** 单像素是否落入有机边界深草（含 per-edge 强度、沿边低频起伏与缺口） */
function boundaryHit(
  x: number,
  y: number,
  width: number,
  height: number,
  baseMargin: number,
  edges: [number, number, number, number],
  seed: number,
  rng: () => number,
): boolean {
  const dists = [y, width - 1 - x, height - 1 - y, x]; // top,right,bottom,left
  let edge = 0;
  let distEdge = dists[0];
  for (let k = 1; k < 4; k++) {
    if (dists[k] < distEdge) {
      distEdge = dists[k];
      edge = k;
    }
  }
  const strength = edges[edge];
  if (strength < 0.08) return false; // 这条边基本裸露
  const along = edge === 0 || edge === 2 ? x : y;
  const wave = fbm(along * 0.012, edge * 11.7, seed + 701, 3); // 沿边低频起伏
  const edgeDepth = baseMargin * (0.35 + strength) * (0.5 + wave * 1.0);
  if (distEdge >= edgeDepth) return false;
  const depthT = 1 - distEdge / Math.max(1, edgeDepth);
  // 更激进的缺口：内缘大量透出草地，确保边界参差、不连续
  if (depthT < 0.5 && rng() > 0.12 + wave * 0.3) return false;
  if (rng() > 0.6 + depthT * 0.32) return false;
  return true;
}

function buildOrganicBoundaryMask(
  width: number,
  height: number,
  opts: ResolvedProceduralOptions,
): Uint8Array {
  const shortSide = Math.min(width, height);
  const baseMargin = Math.max(12, Math.floor(shortSide * opts.boundaryMargin));
  const mask = new Uint8Array(width * height);
  const rng = mulberry32(opts.seed + 701);
  const edges = computeEdgeStrengths(opts.seed);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (boundaryHit(x, y, width, height, baseMargin, edges, opts.seed, rng)) {
        mask[y * width + x] = 1;
      }
    }
  }
  let out = dilateMask(mask, width, height, 2);
  out = erodeMask(out, width, height, 1);
  return out;
}

async function buildOrganicBoundaryMaskAsync(
  width: number,
  height: number,
  opts: ResolvedProceduralOptions,
  onProgress?: ProceduralProgressCallback,
): Promise<Uint8Array> {
  const shortSide = Math.min(width, height);
  const baseMargin = Math.max(12, Math.floor(shortSide * opts.boundaryMargin));
  const mask = new Uint8Array(width * height);
  const rng = mulberry32(opts.seed + 701);
  const edges = computeEdgeStrengths(opts.seed);
  const chunk = Math.max(16, Math.floor(height / 24));

  for (let y0 = 0; y0 < height; y0 += chunk) {
    const y1 = Math.min(height, y0 + chunk);
    for (let y = y0; y < y1; y++) {
      for (let x = 0; x < width; x++) {
        if (boundaryHit(x, y, width, height, baseMargin, edges, opts.seed, rng)) {
          mask[y * width + x] = 1;
        }
      }
    }
    await reportProgress(onProgress, "边界深草", 8 + (y1 / height) * 14);
  }
  let out = dilateMask(mask, width, height, 2);
  out = erodeMask(out, width, height, 1);
  return out;
}

function subtractMask(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length);
  for (let i = 0; i < a.length; i++) {
    if (a[i] && !b[i]) out[i] = 1;
  }
  return out;
}

function generatePlatformMask(
  width: number,
  height: number,
  opts: ResolvedProceduralOptions,
  excludeMask: Uint8Array,
): Uint8Array {
  const minArea = Math.max(96, Math.floor(width * height * opts.minAreaRatio));
  let threshold = 0.64 + (opts.platformCount / 14) * 0.06;
  let bestMask = new Uint8Array(width * height);
  const erodeR = Math.max(1, opts.smoothRadius - 1);
  const closeR = Math.max(1, Math.floor(opts.smoothRadius / 2));

  for (let attempt = 0; attempt < 5; attempt++) {
    const raw = new Uint8Array(width * height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        if (excludeMask[idx]) continue;
        const n = fbm(
          x * opts.featureScale,
          y * opts.featureScale,
          opts.seed + attempt * 31,
          opts.fbmOctaves,
        );
        if (n > threshold) raw[idx] = 1;
      }
    }
    let smooth = dilateMask(raw, width, height, opts.smoothRadius);
    smooth = erodeMask(smooth, width, height, erodeR);
    smooth = dilateMask(smooth, width, height, closeR);

    const comps = findComponents(smooth, width, height)
      .filter((c) => c.area >= minArea)
      .sort((a, b) => b.area - a.area)
      .slice(0, opts.platformCount);

    if (comps.length > 0) {
      const area = comps.reduce((s, c) => s + c.area, 0);
      const bestArea = bestMask.reduce((s, v) => s + v, 0);
      if (area > bestArea || comps.length >= Math.min(3, opts.platformCount)) {
        bestMask = new Uint8Array(maskFromComponents(width, height, comps));
        if (comps.length >= opts.platformCount - 1) break;
      }
    }
    threshold -= 0.04;
  }
  return bestMask;
}

async function generatePlatformMaskAsync(
  width: number,
  height: number,
  opts: ResolvedProceduralOptions,
  excludeMask: Uint8Array,
  onProgress?: ProceduralProgressCallback,
): Promise<Uint8Array> {
  const minArea = Math.max(96, Math.floor(width * height * opts.minAreaRatio));
  let threshold = 0.64 + (opts.platformCount / 14) * 0.06;
  let bestMask = new Uint8Array(width * height);
  const erodeR = Math.max(1, opts.smoothRadius - 1);
  const closeR = Math.max(1, Math.floor(opts.smoothRadius / 2));
  const chunk = Math.max(16, Math.floor(height / 24));

  for (let attempt = 0; attempt < 5; attempt++) {
    const raw = new Uint8Array(width * height);
    for (let y0 = 0; y0 < height; y0 += chunk) {
      const y1 = Math.min(height, y0 + chunk);
      for (let y = y0; y < y1; y++) {
        for (let x = 0; x < width; x++) {
          const idx = y * width + x;
          if (excludeMask[idx]) continue;
          const n = fbm(
            x * opts.featureScale,
            y * opts.featureScale,
            opts.seed + attempt * 31,
            opts.fbmOctaves,
          );
          if (n > threshold) raw[idx] = 1;
        }
      }
      const pct = 22 + ((attempt * height + y1) / (5 * height)) * 28;
      await reportProgress(onProgress, "台地团块", pct);
    }
    let smooth = dilateMask(raw, width, height, opts.smoothRadius);
    smooth = erodeMask(smooth, width, height, erodeR);
    smooth = dilateMask(smooth, width, height, closeR);

    const comps = findComponents(smooth, width, height)
      .filter((c) => c.area >= minArea)
      .sort((a, b) => b.area - a.area)
      .slice(0, opts.platformCount);

    if (comps.length > 0) {
      const area = comps.reduce((s, c) => s + c.area, 0);
      const bestArea = bestMask.reduce((s, v) => s + v, 0);
      if (area > bestArea || comps.length >= Math.min(3, opts.platformCount)) {
        bestMask = new Uint8Array(maskFromComponents(width, height, comps));
        if (comps.length >= opts.platformCount - 1) break;
      }
    }
    threshold -= 0.04;
  }
  return bestMask;
}

function resolveRoadRadius(width: number, height: number, roadWidth: number): number {
  const scale = Math.min(width, height) / 1080;
  return Math.max(7, Math.round((roadWidth * Math.max(0.9, scale)) / 2));
}

function minimumSpanningTree(points: { cx: number; cy: number }[]): [number, number][] {
  const n = points.length;
  if (n < 2) return [];
  const inTree = new Set<number>([0]);
  const edges: [number, number][] = [];
  while (inTree.size < n) {
    let bestDist = Infinity;
    let bestA = 0;
    let bestB = 0;
    for (const a of inTree) {
      for (let b = 0; b < n; b++) {
        if (inTree.has(b)) continue;
        const dx = points[a].cx - points[b].cx;
        const dy = points[a].cy - points[b].cy;
        const d = dx * dx + dy * dy;
        if (d < bestDist) {
          bestDist = d;
          bestA = a;
          bestB = b;
        }
      }
    }
    inTree.add(bestB);
    edges.push([bestA, bestB]);
  }
  return edges;
}

function stampDisk(mask: Uint8Array, width: number, height: number, cx: number, cy: number, r: number): void {
  const ir = Math.ceil(r);
  for (let dy = -ir; dy <= ir; dy++) {
    for (let dx = -ir; dx <= ir; dx++) {
      if (dx * dx + dy * dy > r * r) continue;
      const x = Math.round(cx) + dx;
      const y = Math.round(cy) + dy;
      if (x < 0 || y < 0 || x >= width || y >= height) continue;
      mask[y * width + x] = 1;
    }
  }
}

function drawThickLine(
  mask: Uint8Array,
  width: number,
  height: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  radius: number,
): void {
  let x = Math.round(x0);
  let y = Math.round(y0);
  const tx = Math.round(x1);
  const ty = Math.round(y1);
  const dx = Math.abs(tx - x);
  const dy = Math.abs(ty - y);
  const sx = x < tx ? 1 : -1;
  const sy = y < ty ? 1 : -1;
  let err = dx - dy;

  while (true) {
    stampDisk(mask, width, height, x, y, radius);
    if (x === tx && y === ty) break;
    const e2 = err * 2;
    if (e2 > -dy) {
      err -= dy;
      x += sx;
    }
    if (e2 < dx) {
      err += dx;
      y += sy;
    }
  }
}

/**
 * 沿二次贝塞尔绘制弯曲的粗通道：中点沿垂直方向按种子偏移，
 * 替代笔直 MST 连线，降低「电路板」直角感，同时保持连续够宽。
 */
function drawCurvedRoad(
  mask: Uint8Array,
  width: number,
  height: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  radius: number,
  seed: number,
): void {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy) || 1;
  const px = -dy / len;
  const py = dx / len;
  const rng = mulberry32(seed);
  // 中点偏移幅度：线段长度的 ±(10%~24%)
  const amp = (rng() - 0.5) * 2 * len * (0.1 + rng() * 0.14);
  const midX = (x0 + x1) / 2 + px * amp;
  const midY = (y0 + y1) / 2 + py * amp;
  // 由所需中点反推贝塞尔控制点：C = 2M - (P0+P1)/2
  const cx = 2 * midX - (x0 + x1) / 2;
  const cy = 2 * midY - (y0 + y1) / 2;
  const steps = Math.max(2, Math.ceil(len / 6));
  let prevX = x0;
  let prevY = y0;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const it = 1 - t;
    const bx = it * it * x0 + 2 * it * t * cx + t * t * x1;
    const by = it * it * y0 + 2 * it * t * cy + t * t * y1;
    drawThickLine(mask, width, height, prevX, prevY, bx, by, radius);
    prevX = bx;
    prevY = by;
  }
}

function buildRoadNetworkMask(
  platformMask: Uint8Array,
  width: number,
  height: number,
  opts: ResolvedProceduralOptions,
): Uint8Array {
  const minArea = Math.max(96, Math.floor(width * height * opts.minAreaRatio * 0.6));
  const components = findComponents(platformMask, width, height)
    .filter((c) => c.area >= minArea)
    .sort((a, b) => b.area - a.area)
    .slice(0, Math.max(2, opts.platformCount));
  if (components.length < 2) return new Uint8Array(width * height);

  const road = new Uint8Array(width * height);
  const radius = resolveRoadRadius(width, height, opts.roadWidth);
  const edges = minimumSpanningTree(components);
  for (const [a, b] of edges) {
    drawCurvedRoad(
      road,
      width,
      height,
      components[a].cx,
      components[a].cy,
      components[b].cx,
      components[b].cy,
      radius,
      opts.seed + a * 131 + b * 17,
    );
  }
  let result = subtractMask(road, platformMask);
  result = dilateMask(result, width, height, 2);
  return subtractMask(result, platformMask);
}

function buildDirtFieldMask(
  data: ImageData,
  palette: SemanticPalette,
  opts: ResolvedProceduralOptions,
): Uint8Array {
  const { width, height } = data;
  const grass = buildSemanticMask(data, palette, ["grass"]);
  const scale = opts.dirtScale; // 低频、按短边归一化 → 大块而非满图麻点
  const threshold = 1 - opts.scatterDensity * 0.7;
  const paint = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (!grass[idx]) continue;
      const n = fbm(x * scale, y * scale, opts.seed + 401, 2);
      if (n >= threshold) paint[idx] = 1;
    }
  }
  // 大半径闭运算把零散点聚成整块，再限制回草地范围（闭运算可能外溢）
  let mask = dilateMask(paint, width, height, 5);
  mask = erodeMask(mask, width, height, 5);
  for (let i = 0; i < mask.length; i++) {
    if (mask[i] && !grass[i]) mask[i] = 0;
  }
  // 剔除残余碎斑，仅保留成片泥地
  const minArea = Math.max(240, Math.floor(width * height * 0.004));
  const comps = findComponents(mask, width, height).filter((c) => c.area >= minArea);
  return maskFromComponents(width, height, comps);
}

/** 完整随机舞台：草地底图 → 边界 → 台地 → 通道 →（可选）泥地；不生成战斗净区 */
async function applyRandomStageLayoutAsync(
  data: ImageData,
  palette: SemanticPalette,
  opts: ResolvedProceduralOptions,
  onProgress?: ProceduralProgressCallback,
): Promise<number> {
  const { width, height } = data;
  await reportProgress(onProgress, "准备", 2);
  const protectedPx = snapshotProtectedPixels(data, palette);
  const before = data.data.slice();

  await reportProgress(onProgress, "铺设草地", 8);
  fillColor(data, palette, "grass", true);

  const boundary = await buildOrganicBoundaryMaskAsync(width, height, opts, onProgress);
  await reportProgress(onProgress, "绘制边界", 24);
  paintMask(data, palette, boundary, "boundary_grass");

  const platformMask = await generatePlatformMaskAsync(width, height, opts, boundary, onProgress);
  await reportProgress(onProgress, "铺设台地", 54);
  paintMask(data, palette, platformMask, "stone_platform");

  await reportProgress(onProgress, "连接通道", 62);
  const roadMask = buildRoadNetworkMask(platformMask, width, height, opts);
  paintMask(data, palette, roadMask, "stone_road", ["grass", "dirt"]);

  if (opts.dirtInLayout && opts.scatterDensity > 0.04) {
    await reportProgress(onProgress, "泥地区域", 78);
    const dirtMask = buildDirtFieldMask(data, palette, opts);
    paintMask(data, palette, dirtMask, "dirt");
  }

  await reportProgress(onProgress, "保护锚点与净区", 92);
  restoreProtectedPixels(data, protectedPx, width);

  let changed = 0;
  for (let i = 0; i < before.length; i += 4) {
    const px = data.data;
    if (px[i] !== before[i] || px[i + 1] !== before[i + 1] || px[i + 2] !== before[i + 2]) changed++;
  }
  await reportProgress(onProgress, "完成", 100);
  return changed;
}

function applyRandomStageLayout(
  data: ImageData,
  palette: SemanticPalette,
  opts: ResolvedProceduralOptions,
): number {
  const { width, height } = data;
  const protectedPx = snapshotProtectedPixels(data, palette);
  const before = data.data.slice();

  fillColor(data, palette, "grass", true);

  const boundary = buildOrganicBoundaryMask(width, height, opts);
  paintMask(data, palette, boundary, "boundary_grass");

  const platformMask = generatePlatformMask(width, height, opts, boundary);
  paintMask(data, palette, platformMask, "stone_platform");

  const roadMask = buildRoadNetworkMask(platformMask, width, height, opts);
  paintMask(data, palette, roadMask, "stone_road", ["grass", "dirt"]);

  if (opts.dirtInLayout && opts.scatterDensity > 0.04) {
    const dirtMask = buildDirtFieldMask(data, palette, opts);
    paintMask(data, palette, dirtMask, "dirt");
  }

  restoreProtectedPixels(data, protectedPx, width);

  let changed = 0;
  for (let i = 0; i < before.length; i += 4) {
    const px = data.data;
    if (px[i] !== before[i] || px[i + 1] !== before[i + 1] || px[i + 2] !== before[i + 2]) changed++;
  }
  return changed;
}

/** 在草地上生成噪声台地团块 */
function applyRandomPlatforms(
  data: ImageData,
  palette: SemanticPalette,
  opts: ResolvedProceduralOptions,
): number {
  const { width, height } = data;
  const boundary = buildSemanticMask(data, palette, ["boundary_grass", "water_or_pit"]);
  const blocked = dilateMask(
    buildSemanticMask(data, palette, ["stone_platform", "stone_road"]),
    width,
    height,
    3,
  );
  const exclude = new Uint8Array(width * height);
  for (let i = 0; i < exclude.length; i++) {
    if (boundary[i] || blocked[i]) exclude[i] = 1;
  }
  const platformMask = generatePlatformMask(width, height, opts, exclude);
  return paintMask(data, palette, platformMask, "stone_platform", ["grass", "dirt"]);
}

/** 连接已有台地，生成通道网络 */
function applyRandomRoadNetwork(
  data: ImageData,
  palette: SemanticPalette,
  opts: ResolvedProceduralOptions,
): number {
  const { width, height } = data;
  const platform = buildSemanticMask(data, palette, ["stone_platform"]);
  if (!platform.some(Boolean)) return 0;
  const roadMask = buildRoadNetworkMask(platform, width, height, opts);
  return paintMask(data, palette, roadMask, "stone_road", ["grass", "dirt"]);
}

/** 四边有机边界深草（不规则、有缺口，避免像画框） */
function applyRandomBoundary(
  data: ImageData,
  palette: SemanticPalette,
  opts: ResolvedProceduralOptions,
): number {
  const { width, height } = data;
  const boundary = buildOrganicBoundaryMask(width, height, opts);
  return paintMask(data, palette, boundary, "boundary_grass", ["grass", "dirt"]);
}

/** 低频噪声泥地区域 */
function applyRandomDirtFields(
  data: ImageData,
  palette: SemanticPalette,
  opts: ResolvedProceduralOptions,
): number {
  const dirtMask = buildDirtFieldMask(data, palette, opts);
  return paintMask(data, palette, dirtMask, "dirt");
}

/** 石道外缘：向外 1~N 像素铺草，宽度受噪声调制，可随机断开 */
function applyRoadEdgeGrass(
  data: ImageData,
  palette: SemanticPalette,
  opts: ResolvedProceduralOptions,
): number {
  const { width, height } = data;
  const road = buildSemanticMask(data, palette, ["stone_road"]);
  const platform = buildSemanticMask(data, palette, ["stone_platform"]);
  const water = buildSemanticMask(data, palette, ["water_or_pit", "boundary_grass"]);
  const dist = distanceFromMask(road, width, height, opts.fringeWidth + 1);
  const rng = mulberry32(opts.seed);
  const grassRgb = colorRgb(palette, "grass");
  const paint = new Uint8Array(width * height);
  const softIds = new Set(["grass", "dirt"]);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (road[idx] || platform[idx] || water[idx]) continue;
      const d = dist[idx];
      if (d <= 0 || d > opts.fringeWidth) continue;
      const cur = paletteAt(data, x, y, palette);
      if (!cur || !softIds.has(cur.id)) continue;
      const n = valueNoise2d(x * 0.08, y * 0.08, opts.seed + 17);
      const maxD = 1 + Math.floor(n * (opts.fringeWidth - 1));
      if (d > maxD) continue;
      if (rng() < opts.gapBreak) continue;
      paint[idx] = 1;
    }
  }

  let changed = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (!paint[idx] || isProtectedAt(data, x, y, palette)) continue;
      const i = idx * 4;
      const px = data.data;
      if (px[i] !== grassRgb.r || px[i + 1] !== grassRgb.g || px[i + 2] !== grassRgb.b) changed++;
      setPixel(data, x, y, grassRgb);
    }
  }
  return changed;
}

function applyRoadPlatformGap(
  data: ImageData,
  palette: SemanticPalette,
  opts: ResolvedProceduralOptions,
): number {
  const { width, height } = data;
  const road = buildSemanticMask(data, palette, ["stone_road"]);
  const platform = buildSemanticMask(data, palette, ["stone_platform"]);
  if (!road.some(Boolean) || !platform.some(Boolean)) return 0;

  const roadBand = dilateMask(road, width, height, opts.gapWidth);
  const platBand = dilateMask(platform, width, height, opts.gapWidth);
  const overlap = new Uint8Array(width * height);
  const rng = mulberry32(opts.seed + 91);

  for (let i = 0; i < overlap.length; i++) {
    if (!roadBand[i] || !platBand[i]) continue;
    if (road[i] || platform[i]) continue;
    if (rng() < opts.gapBreak) continue;
    overlap[i] = 1;
  }

  return paintMask(data, palette, overlap, "grass");
}

function applyGrassDirtScatter(
  data: ImageData,
  palette: SemanticPalette,
  opts: ResolvedProceduralOptions,
): number {
  const { width, height } = data;
  const grass = buildSemanticMask(data, palette, ["grass"]);
  const paint = new Uint8Array(width * height);
  const threshold = 1 - opts.scatterDensity;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (!grass[idx]) continue;
      const n = valueNoise2d(x * opts.scatterScale, y * opts.scatterScale, opts.seed + 3);
      if (n >= threshold) paint[idx] = 1;
    }
  }

  return paintMask(data, palette, paint, "dirt");
}

function applyPlatformEdgeDirt(
  data: ImageData,
  palette: SemanticPalette,
  opts: ResolvedProceduralOptions,
): number {
  const { width, height } = data;
  const platform = buildSemanticMask(data, palette, ["stone_platform"]);
  if (!platform.some(Boolean)) return 0;

  const outer = dilateMask(platform, width, height, opts.transitionWidth);
  const inner = erodeMask(platform, width, height, 1);
  const ring = new Uint8Array(width * height);
  const rng = mulberry32(opts.seed + 203);
  const softIds = new Set(["grass", "dirt"]);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (!outer[idx] || inner[idx] || platform[idx]) continue;
      const cur = paletteAt(data, x, y, palette);
      if (!cur || !softIds.has(cur.id)) continue;
      if (rng() < opts.gapBreak * 0.5) continue;
      ring[idx] = 1;
    }
  }

  return paintMask(data, palette, ring, "dirt");
}

export function applySemanticProcedural(
  data: ImageData,
  palette: SemanticPalette,
  recipe: SemanticProceduralRecipe,
  options: ProceduralOptions = {},
): number {
  const opts = resolveOpts(options, data.width, data.height);
  switch (recipe) {
    case "random_stage_layout":
      return applyRandomStageLayout(data, palette, opts);
    case "random_platforms":
      return applyRandomPlatforms(data, palette, opts);
    case "random_road_network":
      return applyRandomRoadNetwork(data, palette, opts);
    case "random_boundary":
      return applyRandomBoundary(data, palette, opts);
    case "random_dirt_fields":
      return applyRandomDirtFields(data, palette, opts);
    case "road_edge_grass":
      return applyRoadEdgeGrass(data, palette, opts);
    case "road_platform_gap":
      return applyRoadPlatformGap(data, palette, opts);
    case "grass_dirt_scatter":
      return applyGrassDirtScatter(data, palette, opts);
    case "platform_edge_dirt":
      return applyPlatformEdgeDirt(data, palette, opts);
    default:
      return 0;
  }
}

export async function applySemanticProceduralAsync(
  data: ImageData,
  palette: SemanticPalette,
  recipe: SemanticProceduralRecipe,
  options: ProceduralOptions = {},
  onProgress?: ProceduralProgressCallback,
): Promise<number> {
  const opts = resolveOpts(options, data.width, data.height);
  await reportProgress(onProgress, "准备", 0);

  switch (recipe) {
    case "random_stage_layout":
      return applyRandomStageLayoutAsync(data, palette, opts, onProgress);
    case "random_platforms": {
      await reportProgress(onProgress, "台地团块", 20);
      const changed = applyRandomPlatforms(data, palette, opts);
      await reportProgress(onProgress, "完成", 100);
      return changed;
    }
    case "random_road_network": {
      await reportProgress(onProgress, "通道网络", 30);
      const changed = applyRandomRoadNetwork(data, palette, opts);
      await reportProgress(onProgress, "完成", 100);
      return changed;
    }
    case "random_boundary": {
      await reportProgress(onProgress, "边界深草", 25);
      const changed = applyRandomBoundary(data, palette, opts);
      await reportProgress(onProgress, "完成", 100);
      return changed;
    }
    case "random_dirt_fields": {
      await reportProgress(onProgress, "泥地区域", 30);
      const changed = applyRandomDirtFields(data, palette, opts);
      await reportProgress(onProgress, "完成", 100);
      return changed;
    }
    default: {
      await reportProgress(onProgress, "融合修饰", 40);
      const changed = applySemanticProcedural(data, palette, recipe, options);
      await reportProgress(onProgress, "完成", 100);
      return changed;
    }
  }
}
