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
    colorEqual(a.outlineColor, b.outlineColor)
  );
}

export function findMatchingPreset(params: MaterialLabParams): MaterialLabPreset | null {
  return MATERIAL_LAB_PRESETS.find((p) => materialLabParamsEqual(params, p.params)) ?? null;
}
