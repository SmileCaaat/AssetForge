import type { MaterialLabParams } from "./materialLabTypes";

export const DEFAULT_MATERIAL_LAB_PARAMS: MaterialLabParams = {
  baseColorTint: [1, 1, 1, 1],
  baseSaturation: 1.35,
  baseValue: 1.05,
  contrast: 0.15,
  rampSteps: 3,
  shadowStrength: 0.45,
  rimColor: [1, 0.82, 0.55, 1],
  rimPower: 4,
  rimIntensity: 2.5,
  matcapStrength: 0,
  outlineEnabled: true,
  outlineWidth: 0.01,
  outlineColor: [0, 0, 0, 1],
  outlineFarWidthScale: 0.01,
  outlineFadeStart: -20,
  outlineFadeEnd: 25,
  outlineMinWidth: 0.001,
  celShadowColor: [0.08, 0.1, 0.07, 1],
  celHighlightColor: [1, 0.97, 0.9, 1],
  celHighlightPos: 0.9,
  posterizeLevels: [0.2, 0.4, 0.6, 0.8, 1],
};

export const DEFAULT_TERRAIN_MATERIAL_LAB_PARAMS: MaterialLabParams = {
  ...DEFAULT_MATERIAL_LAB_PARAMS,
  baseSaturation: 1.55,
  baseValue: 1,
  contrast: 0,
  rampSteps: 4,
  outlineEnabled: false,
  celShadowColor: [0.12, 0.14, 0.1, 1],
  celHighlightColor: [1, 0.97, 0.9, 1],
  celHighlightPos: 0.75,
  posterizeLevels: [0.14, 0.32, 0.52, 0.72, 0.9],
  terrainRampBlend: 0.18,
  terrainAlbedoInfluence: 0.72,
  terrainNormalStrength: 1.15,
  terrainAlbedoPosterize: 0.22,
  terrainDistanceSmooth: 0.35,
  terrainSlopeTint: 0.12,
  shadowReceiveStrength: 0.7,
  ambientStrength: 0.25,
  lightColorInfluence: 0.6,
};

export interface MaterialLabPreset {
  id: string;
  label: string;
  description: string;
  params: MaterialLabParams;
}

function preset(params: Partial<MaterialLabParams>): MaterialLabParams {
  return { ...DEFAULT_MATERIAL_LAB_PARAMS, ...params };
}

export const MATERIAL_LAB_PRESETS: MaterialLabPreset[] = [
  {
    id: "default",
    label: "推荐默认",
    description: "略增饱和与 Rim，适合大多数 Lowpoly 角色",
    params: DEFAULT_MATERIAL_LAB_PARAMS,
  },
  {
    id: "faithful",
    label: "贴图原色",
    description: "尽量还原 BaseColor 贴图本色，便于核对贴图",
    params: preset({
      baseSaturation: 1,
      baseValue: 1,
      contrast: 0,
      rampSteps: 2,
      shadowStrength: 0.55,
      rimIntensity: 0.8,
      rimPower: 5,
      matcapStrength: 0,
      outlineEnabled: false,
    }),
  },
  {
    id: "classic-toon",
    label: "经典 Toon",
    description: "三阶色带 + 中等阴影，通用卡通风格",
    params: preset({
      baseSaturation: 1.15,
      baseValue: 1,
      contrast: 0.12,
      rampSteps: 3,
      shadowStrength: 0.45,
      rimIntensity: 2,
      matcapStrength: 0,
      outlineEnabled: true,
      outlineWidth: 0.012,
    }),
  },
  {
    id: "cel-hard",
    label: "硬边赛璐璐",
    description: "更多色阶、更深阴影，偏日系硬边卡通",
    params: preset({
      baseSaturation: 1.2,
      baseValue: 1.02,
      contrast: 0.22,
      rampSteps: 5,
      shadowStrength: 0.32,
      rimIntensity: 1.8,
      rimPower: 3.5,
      matcapStrength: 0,
      outlineEnabled: true,
      outlineWidth: 0.018,
    }),
  },
  {
    id: "soft",
    label: "柔和插画",
    description: "浅阴影、弱 Rim，偏绘本 / 插画感",
    params: preset({
      baseSaturation: 1.05,
      baseValue: 1.08,
      contrast: 0.08,
      rampSteps: 2,
      shadowStrength: 0.62,
      rimColor: [1, 0.92, 0.82, 1],
      rimPower: 6,
      rimIntensity: 1.2,
      matcapStrength: 0,
      outlineEnabled: true,
      outlineWidth: 0.01,
    }),
  },
  {
    id: "outline",
    label: "强调描边",
    description: "加粗黑色描边，便于检查轮廓与比例",
    params: preset({
      baseSaturation: 1,
      baseValue: 1,
      contrast: 0.05,
      rampSteps: 2,
      shadowStrength: 0.5,
      rimIntensity: 0.5,
      matcapStrength: 0,
      outlineEnabled: true,
      outlineWidth: 0.018,
      outlineColor: [0, 0, 0, 1],
    }),
  },
  {
    id: "matcap",
    label: "Matcap 质感",
    description: "叠加轻微 Matcap，增加体积感",
    params: preset({
      baseSaturation: 1.1,
      baseValue: 1,
      contrast: 0.1,
      rampSteps: 3,
      shadowStrength: 0.48,
      rimIntensity: 1.5,
      matcapStrength: 0.35,
      outlineEnabled: true,
      outlineWidth: 0.012,
    }),
  },
  {
    id: "unity-export",
    label: "Unity 导出",
    description: "接近导出 JSON 的保守参数，便于与引擎侧对齐",
    params: preset({
      baseSaturation: 1,
      baseValue: 1,
      contrast: 0.1,
      rampSteps: 3,
      shadowStrength: 0.45,
      rimColor: [1, 0.82, 0.55, 1],
      rimPower: 4,
      rimIntensity: 2.5,
      matcapStrength: 0,
      outlineEnabled: true,
      outlineWidth: 0.01,
    }),
  },
];

export const TERRAIN_MATERIAL_LAB_PRESETS: MaterialLabPreset[] = [
  {
    id: "overview",
    label: "Overview 默认",
    description: "柔和 Toon 分层 + 保留 BaseColor 可读性",
    params: DEFAULT_TERRAIN_MATERIAL_LAB_PARAMS,
  },
  {
    id: "vivid-grass",
    label: "鲜绿草地",
    description: "更高饱和，草地更纯净",
    params: preset({
      ...DEFAULT_TERRAIN_MATERIAL_LAB_PARAMS,
      baseSaturation: 2.05,
      posterizeLevels: [0.14, 0.32, 0.52, 0.72, 0.9],
    }),
  },
];

const FLOAT_EPS = 0.001;

function colorEqual(a: [number, number, number, number], b: [number, number, number, number]): boolean {
  return a.every((v, i) => Math.abs(v - b[i]) < FLOAT_EPS);
}

export function materialLabParamsEqual(a: MaterialLabParams, b: MaterialLabParams): boolean {
  return (
    colorEqual(a.baseColorTint, b.baseColorTint) &&
    Math.abs(a.baseSaturation - b.baseSaturation) < FLOAT_EPS &&
    Math.abs(a.baseValue - b.baseValue) < FLOAT_EPS &&
    Math.abs(a.contrast - b.contrast) < FLOAT_EPS &&
    Math.abs(a.rampSteps - b.rampSteps) < FLOAT_EPS &&
    Math.abs(a.shadowStrength - b.shadowStrength) < FLOAT_EPS &&
    colorEqual(a.rimColor, b.rimColor) &&
    Math.abs(a.rimPower - b.rimPower) < FLOAT_EPS &&
    Math.abs(a.rimIntensity - b.rimIntensity) < FLOAT_EPS &&
    Math.abs(a.matcapStrength - b.matcapStrength) < FLOAT_EPS &&
    a.outlineEnabled === b.outlineEnabled &&
    Math.abs(a.outlineWidth - b.outlineWidth) < FLOAT_EPS &&
    colorEqual(a.outlineColor, b.outlineColor) &&
    Math.abs(a.outlineFarWidthScale - b.outlineFarWidthScale) < FLOAT_EPS &&
    Math.abs(a.outlineFadeStart - b.outlineFadeStart) < FLOAT_EPS &&
    Math.abs(a.outlineFadeEnd - b.outlineFadeEnd) < FLOAT_EPS &&
    Math.abs(a.outlineMinWidth - b.outlineMinWidth) < FLOAT_EPS
  );
}

export function findMatchingPreset(params: MaterialLabParams): MaterialLabPreset | null {
  return MATERIAL_LAB_PRESETS.find((p) => materialLabParamsEqual(params, p.params)) ?? null;
}

export function terrainMaterialLabParamsEqual(a: MaterialLabParams, b: MaterialLabParams): boolean {
  return (
    materialLabParamsEqual(a, b) &&
    colorEqual(a.celShadowColor, b.celShadowColor) &&
    colorEqual(a.celHighlightColor, b.celHighlightColor) &&
    Math.abs((a.terrainRampBlend ?? 0.18) - (b.terrainRampBlend ?? 0.18)) < FLOAT_EPS &&
    Math.abs((a.terrainAlbedoInfluence ?? 0.72) - (b.terrainAlbedoInfluence ?? 0.72)) < FLOAT_EPS &&
    Math.abs((a.terrainNormalStrength ?? 1.15) - (b.terrainNormalStrength ?? 1.15)) < FLOAT_EPS
  );
}

export function findMatchingTerrainPreset(params: MaterialLabParams): MaterialLabPreset | null {
  return TERRAIN_MATERIAL_LAB_PRESETS.find((p) => terrainMaterialLabParamsEqual(params, p.params)) ?? null;
}
