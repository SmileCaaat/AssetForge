export type StagePixelTierId = "s" | "m" | "l";

export interface StageAspectRatio {
  widthRatio: number;
  heightRatio: number;
  label: string;
}

export interface StageComputedDimensions {
  aspect: string;
  worldSize: { width: number; height: number };
  resolution: { width: number; height: number };
}

/** 舞台横向比例预设（宽:高） */
export const STAGE_ASPECT_PRESETS = [
  { id: "16:9", label: "16:9 宽屏", widthRatio: 16, heightRatio: 9 },
  { id: "1:1", label: "1:1 方形", widthRatio: 1, heightRatio: 1 },
  { id: "2:1", label: "2:1 横向", widthRatio: 2, heightRatio: 1 },
  { id: "3:1", label: "3:1 横向", widthRatio: 3, heightRatio: 1 },
  { id: "4:1", label: "4:1 横向", widthRatio: 4, heightRatio: 1 },
] as const;

export type StageAspectPresetId = (typeof STAGE_ASPECT_PRESETS)[number]["id"] | "custom";

/** 像素层级：按横向基准宽度（px）划分，比例变化时自动换算另一维 */
export const STAGE_PIXEL_TIERS = [
  { id: "s" as const, label: "S", basePixelWidth: 2048 },
  { id: "m" as const, label: "M", basePixelWidth: 3072 },
  { id: "l" as const, label: "L", basePixelWidth: 4096 },
];

export const STAGE_PIXELS_PER_UNIT = 64;

export function formatAspectLabel(widthRatio: number, heightRatio: number): string {
  const w = Number.isInteger(widthRatio) ? String(widthRatio) : String(widthRatio);
  const h = Number.isInteger(heightRatio) ? String(heightRatio) : String(heightRatio);
  return `${w}:${h}`;
}

/** 解析比例字符串，支持 `16:9`、`16/9`、`16×9` */
export function parseAspectRatio(input: string): StageAspectRatio | null {
  const trimmed = input.trim().replace(/\s+/g, "");
  const match = trimmed.match(/^(\d+(?:\.\d+)?)[:\/×x](\d+(?:\.\d+)?)$/i);
  if (!match) return null;
  const widthRatio = Number(match[1]);
  const heightRatio = Number(match[2]);
  if (!Number.isFinite(widthRatio) || !Number.isFinite(heightRatio) || widthRatio <= 0 || heightRatio <= 0) {
    return null;
  }
  return {
    widthRatio,
    heightRatio,
    label: formatAspectLabel(widthRatio, heightRatio),
  };
}

export function aspectFromPresetId(presetId: string): StageAspectRatio | null {
  const preset = STAGE_ASPECT_PRESETS.find((p) => p.id === presetId);
  if (!preset) return null;
  return {
    widthRatio: preset.widthRatio,
    heightRatio: preset.heightRatio,
    label: preset.id,
  };
}

export function computeStageDimensions(
  aspect: StageAspectRatio,
  tierId: StagePixelTierId,
): StageComputedDimensions {
  const tier = STAGE_PIXEL_TIERS.find((t) => t.id === tierId) ?? STAGE_PIXEL_TIERS[0];
  const wRatio = aspect.widthRatio;
  const hRatio = aspect.heightRatio;

  const resolutionWidth = tier.basePixelWidth;
  const resolutionHeight = Math.max(1, Math.round((tier.basePixelWidth * hRatio) / wRatio));

  const worldWidth = resolutionWidth / STAGE_PIXELS_PER_UNIT;
  const worldHeight = resolutionHeight / STAGE_PIXELS_PER_UNIT;

  return {
    aspect: aspect.label,
    worldSize: { width: worldWidth, height: worldHeight },
    resolution: { width: resolutionWidth, height: resolutionHeight },
  };
}

export function inferAspectLabelFromResolution(width: number, height: number): string {
  if (!width || !height) return "16:9";
  const gcd = (a: number, b: number): number => {
    let x = Math.abs(Math.round(a));
    let y = Math.abs(Math.round(b));
    while (y) {
      const t = y;
      y = x % y;
      x = t;
    }
    return x || 1;
  };
  const g = gcd(width, height);
  return formatAspectLabel(width / g, height / g);
}

export function formatWorldSize(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, "");
}

export function formatStageDimensionsSummary(dimensions: StageComputedDimensions): string {
  const { resolution, worldSize } = dimensions;
  return `${resolution.width}×${resolution.height} px · 世界 ${formatWorldSize(worldSize.width)}×${formatWorldSize(worldSize.height)}`;
}
