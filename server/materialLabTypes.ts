export interface MaterialLabTextureSlot {
  path: string;
  unityProperty: string;
  colorSpace: "sRGB" | "Non-Color";
}

export type MaterialLabShaderType = "toon_urp" | "toon_terrain_urp";

export interface MaterialLabParams {
  baseColorTint: [number, number, number, number];
  baseSaturation: number;
  baseValue: number;
  contrast: number;
  rampSteps: number;
  shadowStrength: number;
  rimColor: [number, number, number, number];
  rimPower: number;
  rimIntensity: number;
  matcapStrength: number;
  outlineEnabled: boolean;
  outlineWidth: number;
  outlineColor: [number, number, number, number];
  outlineFarWidthScale: number;
  outlineFadeStart: number;
  outlineFadeEnd: number;
  outlineMinWidth: number;
  shadowReceiveStrength: number;
  ambientStrength: number;
  rimLightInfluence: number;
  lightColorInfluence: number;
  /** 地形 Cel 暗部色（暖暗阴影） */
  celShadowColor: [number, number, number, number];
  /** 地形 Cel 亮部色（暖亮高光） */
  celHighlightColor: [number, number, number, number];
  /** Cel 亮部在 NdotL 上的起始位置（兼容旧 JSON，新 shader 以软 Ramp 为主） */
  celHighlightPos: number;
  /** @deprecated 新 shader 不再使用硬 Posterize 分界 */
  posterizeLevels: [number, number, number, number, number];
  /** 软 Ramp 阶间混合宽度 0.1–0.25 */
  terrainRampBlend: number;
  /** BaseColor 保留比例 0.6–0.8 */
  terrainAlbedoInfluence: number;
  /** 几何法线影响强度 */
  terrainNormalStrength: number;
  /** Albedo 轻量分层强度 0=关 */
  terrainAlbedoPosterize: number;
  /** 远景光照平滑 */
  terrainDistanceSmooth: number;
  /** 坡度岩石染色 */
  terrainSlopeTint: number;
}

export interface MaterialLabState {
  version: 1;
  projectName: string;
  displayName: string;
  shaderType: MaterialLabShaderType;
  preview: {
    modelPath: string;
    cameraMode: "front" | "orbit";
    background: "checker" | "dark";
  };
  textures: {
    baseColor: MaterialLabTextureSlot;
    normal: MaterialLabTextureSlot;
    metallicSmoothness: MaterialLabTextureSlot;
    ao: MaterialLabTextureSlot;
    emission: MaterialLabTextureSlot;
  };
  params: MaterialLabParams;
  slang: {
    enabled: boolean;
    source: string;
    lastCompiledAt: string;
    generatedHlsl: string;
  };
  unity: {
    shaderName: string;
    renderPipeline: "URP";
    surfaceType: "Opaque";
    exportedAt: string;
  };
}

export type MaterialCheckLevel = "ok" | "info" | "warning" | "error";

export interface MaterialCheckItem {
  level: MaterialCheckLevel;
  code: string;
  message: string;
  file?: string;
  suggestion?: string;
}

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
  shadowReceiveStrength: 0.7,
  ambientStrength: 0.25,
  rimLightInfluence: 0.2,
  lightColorInfluence: 0.6,
  celShadowColor: [0.08, 0.1, 0.07, 1],
  celHighlightColor: [1, 0.97, 0.9, 1],
  celHighlightPos: 0.9,
  posterizeLevels: [0.2, 0.4, 0.6, 0.8, 1],
  terrainRampBlend: 0.18,
  terrainAlbedoInfluence: 0.72,
  terrainNormalStrength: 1.15,
  terrainAlbedoPosterize: 0.22,
  terrainDistanceSmooth: 0.35,
  terrainSlopeTint: 0.12,
};

/** Overview_Terrain — 柔和 Toon 地形光照默认值 */
export const DEFAULT_TERRAIN_MATERIAL_LAB_PARAMS: MaterialLabParams = {
  ...DEFAULT_MATERIAL_LAB_PARAMS,
  baseSaturation: 1.55,
  baseValue: 1,
  contrast: 0,
  rampSteps: 4,
  shadowStrength: 0.45,
  rimIntensity: 0,
  matcapStrength: 0,
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
};

export function isTerrainMaterialLab(state: Pick<MaterialLabState, "shaderType">): boolean {
  return state.shaderType === "toon_terrain_urp";
}
