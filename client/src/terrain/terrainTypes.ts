export type StageTextureSlot = "baseColor" | "semanticControl";

export const STAGE_TEXTURE_SLOTS: StageTextureSlot[] = ["semanticControl", "baseColor"];

export const STAGE_TEXTURE_SLOT_LABELS: Record<StageTextureSlot, string> = {
  baseColor: "BaseColor",
  semanticControl: "语义控制图",
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
  version: 2;
  stageName: string;
  displayName: string;
  stageType: string;
  aspect: string;
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

export interface StageTextureStatus {
  baseColor: boolean;
  semanticControl: boolean;
}

export interface StageSummary {
  stageName: string;
  displayName: string;
  stageType: string;
  updatedAt: string;
  hasBaseColor?: boolean;
  hasSemanticControl: boolean;
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
  conceptMirrorPath?: string;
  message?: string;
  error?: string;
}

export const STAGE_TYPE_OPTIONS = [
  { id: "ruin_road", label: "遗迹道路" },
  { id: "grass_battle", label: "草地战斗场" },
  { id: "town_square", label: "城邦广场" },
  { id: "camp_site", label: "营地" },
] as const;

export interface SemanticPaletteColor {
  id: string;
  label: string;
  hex: string;
  walkable?: boolean;
  decoratable?: boolean;
  anchorType?: string;
  description?: string;
}

export interface SemanticPalette {
  version: 1;
  colors: SemanticPaletteColor[];
}

export interface PromptHistoryEntry {
  id: string;
  kind: string;
  label: string;
  file: string;
  createdAt: string;
  preview: string;
}

export interface PromptHistoryResponse {
  ok: boolean;
  entries?: PromptHistoryEntry[];
  error?: string;
}

export interface SavePromptResponse {
  ok: boolean;
  relativePath?: string;
  historyEntry?: PromptHistoryEntry;
  message?: string;
  error?: string;
}

export interface SemanticPaletteResponse {
  ok: boolean;
  palette?: SemanticPalette;
  error?: string;
}
