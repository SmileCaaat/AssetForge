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
  shadowReceiveStrength?: number;
  ambientStrength?: number;
  rimLightInfluence?: number;
  lightColorInfluence?: number;
  celShadowColor: [number, number, number, number];
  celHighlightColor: [number, number, number, number];
  celHighlightPos: number;
  posterizeLevels: [number, number, number, number, number];
  terrainRampBlend?: number;
  terrainAlbedoInfluence?: number;
  terrainNormalStrength?: number;
  terrainAlbedoPosterize?: number;
  terrainDistanceSmooth?: number;
  terrainSlopeTint?: number;
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

export interface MaterialLabStateResponse {
  ok: boolean;
  state: MaterialLabState;
  warnings: string[];
  created?: boolean;
  message?: string;
  error?: string;
}

export interface MergeMetallicSmoothnessResponse {
  ok: boolean;
  relativePath?: string;
  absolutePath?: string;
  width?: number;
  height?: number;
  message?: string;
  error?: string;
}

export interface ExportUnityResponse {
  ok: boolean;
  exportRoot?: string;
  sharedRoot?: string;
  files?: string[];
  message?: string;
  error?: string;
}

export interface MaterialCheckResponse {
  ok: boolean;
  items?: MaterialCheckItem[];
  message?: string;
  error?: string;
}

export const TEXTURE_SLOT_LABELS: Record<keyof MaterialLabState["textures"], string> = {
  baseColor: "BaseColor",
  normal: "Normal",
  metallicSmoothness: "MetallicSmoothness",
  ao: "AO",
  emission: "Emission",
};

export function isTerrainMaterialLab(state: Pick<MaterialLabState, "shaderType">): boolean {
  return state.shaderType === "toon_terrain_urp";
}
