export const TERRAIN_WORKSPACE_FOLDER = "TerrainWorkspace";

export const STAGE_JSON_VERSION = 2 as const;

/** Stage Lab 仅管理语义图与 BaseColor 参考 */
export type StageTextureSlot = "baseColor" | "semanticControl";

export const STAGE_TEXTURE_SLOTS: StageTextureSlot[] = ["semanticControl", "baseColor"];

export const STAGE_TEXTURE_SLOT_LABELS: Record<StageTextureSlot, string> = {
  baseColor: "BaseColor",
  semanticControl: "Semantic Control",
};

export const STAGE_UPLOAD_SLOTS: StageTextureSlot[] = ["baseColor", "semanticControl"];

export interface StageWorldSize {
  width: number;
  height: number;
  unit: string;
}

export interface StageResolution {
  width: number;
  height: number;
}

export interface StageTextures {
  baseColor: string;
  semanticControl: string;
}

export interface StageJson {
  version: typeof STAGE_JSON_VERSION;
  stageName: string;
  displayName: string;
  stageType: string;
  aspect: "16:9";
  worldSize: StageWorldSize;
  actualGroundSize: StageWorldSize;
  resolution: StageResolution;
  textures: StageTextures;
  palette: string;
  promptProfile: {
    style: string;
    camera: string;
    outputType: string;
  };
  updatedAt: string;
}

export interface StageSummary {
  stageName: string;
  displayName: string;
  stageType: string;
  updatedAt: string;
  hasBaseColor: boolean;
  hasSemanticControl: boolean;
}

export interface StageTextureStatus {
  baseColor: boolean;
  semanticControl: boolean;
}

export interface CreateStageInput {
  stageName: string;
  displayName?: string;
  stageType?: string;
  worldSize?: { width: number; height: number };
  resolution?: { width: number; height: number };
}

export interface StageListResponse {
  ok: boolean;
  stages?: StageSummary[];
  terrainRoot?: string;
  error?: string;
}

export interface StageStateResponse {
  ok: boolean;
  stage?: StageJson;
  terrainRoot?: string;
  stageRoot?: string;
  textureStatus?: StageTextureStatus;
  created?: boolean;
  message?: string;
  error?: string;
}
