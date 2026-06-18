import * as THREE from "three";

/** 场景环境光基准（× ambientScale） */
export const PREVIEW_AMBIENT_BASE = 0.12;

/** 定向光到场景原点的距离（辅助线） */
export const PREVIEW_LIGHT_DISTANCE = 40;

export interface PreviewLightSettings {
  azimuth: number;
  elevation: number;
  /** RGB 0–1 */
  color: [number, number, number];
  /** 主光强度 0–2 */
  intensity: number;
  /** 环境光强度 0–1 */
  ambientIntensity: number;
}

export const DEFAULT_PREVIEW_LIGHT_SETTINGS: PreviewLightSettings = {
  azimuth: 38,
  elevation: 58,
  color: [1, 0.96, 0.9],
  intensity: 1,
  ambientIntensity: 1,
};

export interface PreviewLightPreset {
  id: string;
  label: string;
  description: string;
  settings: PreviewLightSettings;
}

export const PREVIEW_LIGHT_PRESETS: PreviewLightPreset[] = [
  {
    id: "unity_default",
    label: "Unity 默认",
    description: "暖白高位侧照，接近 Unity 定向光",
    settings: {
      azimuth: 38,
      elevation: 58,
      color: [1, 0.96, 0.9],
      intensity: 1,
      ambientIntensity: 1,
    },
  },
  {
    id: "noon_cool",
    label: "正午冷白",
    description: "顶偏前、偏冷的高对比日光",
    settings: {
      azimuth: 18,
      elevation: 74,
      color: [0.94, 0.97, 1],
      intensity: 1.15,
      ambientIntensity: 0.85,
    },
  },
  {
    id: "sunset_warm",
    label: "黄昏暖光",
    description: "低仰角暖橙侧光",
    settings: {
      azimuth: 52,
      elevation: 24,
      color: [1, 0.78, 0.55],
      intensity: 0.95,
      ambientIntensity: 0.75,
    },
  },
  {
    id: "overcast_soft",
    label: "阴天柔光",
    description: "灰蓝、低强度漫射感",
    settings: {
      azimuth: 42,
      elevation: 48,
      color: [0.82, 0.86, 0.93],
      intensity: 0.62,
      ambientIntensity: 1.25,
    },
  },
  {
    id: "side_dramatic",
    label: "强侧光",
    description: "横向硬侧光，强调体积",
    settings: {
      azimuth: 108,
      elevation: 38,
      color: [1, 0.94, 0.86],
      intensity: 1.2,
      ambientIntensity: 0.55,
    },
  },
  {
    id: "back_rim",
    label: "逆光",
    description: "背后高位，轮廓感",
    settings: {
      azimuth: 205,
      elevation: 46,
      color: [0.9, 0.94, 1],
      intensity: 0.88,
      ambientIntensity: 0.7,
    },
  },
];

/** @deprecated 使用 PreviewLightSettings */
export type PreviewLightAngles = Pick<PreviewLightSettings, "azimuth" | "elevation">;

/** @deprecated 使用 DEFAULT_PREVIEW_LIGHT_SETTINGS */
export const DEFAULT_PREVIEW_LIGHT_ANGLES = {
  azimuth: DEFAULT_PREVIEW_LIGHT_SETTINGS.azimuth,
  elevation: DEFAULT_PREVIEW_LIGHT_SETTINGS.elevation,
};

export function previewSunPositionFromAngles(
  azimuthDeg: number,
  elevationDeg: number,
  distance = PREVIEW_LIGHT_DISTANCE,
): THREE.Vector3 {
  const az = THREE.MathUtils.degToRad(azimuthDeg);
  const el = THREE.MathUtils.degToRad(Math.max(1, Math.min(89, elevationDeg)));
  const horizontal = Math.cos(el) * distance;
  const x = horizontal * Math.sin(az);
  const z = horizontal * Math.cos(az);
  const y = Math.sin(el) * distance;
  return new THREE.Vector3(x, y, z);
}

export function previewLightDirectionFromAngles(
  azimuthDeg: number,
  elevationDeg: number,
): THREE.Vector3 {
  return previewSunPositionFromAngles(azimuthDeg, elevationDeg, 1).normalize();
}

export function previewLightThreeColor(settings: PreviewLightSettings): THREE.Color {
  return new THREE.Color(settings.color[0], settings.color[1], settings.color[2]);
}

/** 同步到 Shader uniform：颜色 × 强度 */
export function previewLightShaderColor(settings: PreviewLightSettings): THREE.Vector3 {
  const scale = Math.max(0, settings.intensity);
  return new THREE.Vector3(
    settings.color[0] * scale,
    settings.color[1] * scale,
    settings.color[2] * scale,
  );
}

export function previewAmbientIntensity(settings: PreviewLightSettings): number {
  return PREVIEW_AMBIENT_BASE * Math.max(0, settings.ambientIntensity);
}

export function findMatchingPreviewLightPreset(
  settings: PreviewLightSettings,
): PreviewLightPreset | null {
  const eps = 0.02;
  for (const preset of PREVIEW_LIGHT_PRESETS) {
    const s = preset.settings;
    if (
      Math.abs(s.azimuth - settings.azimuth) < 1 &&
      Math.abs(s.elevation - settings.elevation) < 1 &&
      Math.abs(s.intensity - settings.intensity) < eps &&
      Math.abs(s.ambientIntensity - settings.ambientIntensity) < eps &&
      Math.abs(s.color[0] - settings.color[0]) < eps &&
      Math.abs(s.color[1] - settings.color[1]) < eps &&
      Math.abs(s.color[2] - settings.color[2]) < eps
    ) {
      return preset;
    }
  }
  return null;
}

/** @deprecated */
export const PREVIEW_LIGHT_COLOR = previewLightThreeColor(DEFAULT_PREVIEW_LIGHT_SETTINGS);
/** @deprecated */
export const PREVIEW_LIGHT_COLOR_VEC = previewLightShaderColor(DEFAULT_PREVIEW_LIGHT_SETTINGS);
/** @deprecated */
export const PREVIEW_AMBIENT_INTENSITY = previewAmbientIntensity(DEFAULT_PREVIEW_LIGHT_SETTINGS);
/** @deprecated */
export const PREVIEW_LIGHT_DIR = previewLightDirectionFromAngles(
  DEFAULT_PREVIEW_LIGHT_SETTINGS.azimuth,
  DEFAULT_PREVIEW_LIGHT_SETTINGS.elevation,
);
