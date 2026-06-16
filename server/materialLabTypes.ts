export interface MaterialLabTextureSlot {
  path: string;
  unityProperty: string;
  colorSpace: "sRGB" | "Non-Color";
}

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
}

export interface MaterialLabState {
  version: 1;
  projectName: string;
  displayName: string;
  shaderType: "toon_urp";
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
  outlineWidth: 0.015,
  outlineColor: [0, 0, 0, 1],
};
