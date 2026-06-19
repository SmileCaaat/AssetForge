export type ProjectStage = "concept" | "production" | "done";

export type ConceptAssetRole = "keyArt" | "multiView" | "highPoly" | "lowPoly";

export const CONCEPT_ROLE_LABELS: Record<ConceptAssetRole, string> = {
  keyArt: "立绘",
  multiView: "多视图",
  highPoly: "高模",
  lowPoly: "低模",
};

export const ASSET_MARK_ROLES: ConceptAssetRole[] = [
  "keyArt",
  "multiView",
  "highPoly",
  "lowPoly",
];

export function conceptRoleTagClass(role?: ConceptAssetRole): string {
  if (role === "keyArt") return "tag-key-art";
  if (role === "multiView") return "tag-multi-view";
  if (role === "highPoly") return "tag-high-poly";
  if (role === "lowPoly") return "tag-low-poly";
  return "";
}

export type TextureMapType =
  | "BaseColor"
  | "Roughness"
  | "Metallic"
  | "MetallicSmoothness"
  | "Normal"
  | "AO"
  | "Height"
  | "Edge"
  | "Detection"
  | "Alpha"
  | "Bump"
  | "Curvature"
  | "Emission";

export const TEXTURE_MAP_TYPES: TextureMapType[] = [
  "BaseColor",
  "Roughness",
  "Metallic",
  "MetallicSmoothness",
  "Normal",
  "AO",
  "Height",
  "Edge",
  "Detection",
  "Alpha",
  "Bump",
  "Curvature",
  "Emission",
];

export const TEXTURE_TYPE_LABELS: Record<TextureMapType, string> = {
  BaseColor: "BaseColor",
  Roughness: "Roughness",
  Metallic: "Metallic",
  MetallicSmoothness: "MetSmth",
  Normal: "Normal",
  AO: "AO",
  Height: "Height",
  Edge: "Edge",
  Detection: "Detection",
  Alpha: "Alpha",
  Bump: "Bump",
  Curvature: "Curvature",
  Emission: "Emission",
};

export const TEXTURE_TYPE_HINTS: Record<TextureMapType, string> = {
  BaseColor: "基础色",
  Roughness: "粗糙度",
  Metallic: "金属度",
  MetallicSmoothness: "金属+光滑度合并（R=Metallic, A=Smoothness）",
  Normal: "法线",
  AO: "环境光遮蔽",
  Height: "高度",
  Edge: "边缘",
  Detection: "检测",
  Alpha: "透明",
  Bump: "凹凸",
  Curvature: "曲率",
  Emission: "自发光",
};

export interface TextureTagEntry {
  type: TextureMapType;
  relativePath: string;
  taggedAt: string;
}

export interface TextureTagsResponse {
  tags: Record<string, TextureMapType>;
  entries: Record<string, TextureTagEntry>;
  warning?: string;
  missing?: boolean;
}

export type TextureResizePreset = 256 | 512 | 1024 | 2048 | 4096;

export interface TextureSizePreset {
  size: TextureResizePreset;
  label: string;
  title: string;
}

export const TEXTURE_SIZE_PRESETS: TextureSizePreset[] = [
  { size: 256, label: "256", title: "Small" },
  { size: 512, label: "512", title: "Medium" },
  { size: 1024, label: "1024", title: "Standard" },
  { size: 2048, label: "2048", title: "High" },
  { size: 4096, label: "4096", title: "Ultra" },
];

export function textureTypeTagClass(): string {
  return "tag-texture-map";
}

export type ProductionAssetRole = "lowPoly" | "skeleton" | "smModel";

export const PRODUCTION_ASSET_ROLES: ProductionAssetRole[] = [
  "lowPoly",
  "skeleton",
  "smModel",
];

export const PRODUCTION_ASSET_LABELS: Record<ProductionAssetRole, string> = {
  lowPoly: "低模",
  skeleton: "骨骼",
  smModel: "SM模型",
};

export const PRODUCTION_ASSET_HINTS: Record<ProductionAssetRole, string> = {
  lowPoly: "可用于自动绑定的低模模型",
  skeleton: "已绑定骨骼或骨架结果",
  smModel: "Static Mesh / 引擎用静态模型",
};

export function productionAssetTagClass(role?: ProductionAssetRole): string {
  if (role === "lowPoly") return "tag-low-poly";
  if (role === "skeleton") return "tag-skeleton";
  if (role === "smModel") return "tag-sm-model";
  return "";
}

export interface ProductionAssetTagEntry {
  role: ProductionAssetRole;
  relativePath: string;
  taggedAt: string;
}

export interface ProductionAssetTagsResponse {
  tags: Record<string, ProductionAssetRole>;
  entries: Record<string, ProductionAssetTagEntry>;
  warning?: string;
  missing?: boolean;
}

export interface ConceptTagEntry {
  role: ConceptAssetRole;
  relativePath: string;
  taggedAt: string;
  index?: number;
}

export interface ConceptTagsResponse {
  tags: Record<string, ConceptAssetRole>;
  entries: Record<string, ConceptTagEntry>;
  warning?: string;
  missing?: boolean;
}

export interface ProjectLink {
  id: string;
  displayName: string;
  /** Asset pipeline category: character, terrain, scene, prop, ui, vfx */
  domain?: import("./config/assetDomains").AssetDomain;
  conceptPath: string;
  blenderPath: string;
  stage: ProjectStage;
}

export interface MasterWorkspace {
  id: string;
  name: string;
  rootPath: string;
  conceptRoot?: string;
  blenderRoot?: string;
  projects: ProjectLink[];
  createdAt?: string;
}

export interface ActiveWorkspace extends MasterWorkspace {
  conceptRoot: string;
  blenderRoot: string;
}

export interface FileNode {
  name: string;
  path: string;
  relativePath: string;
  isDirectory: boolean;
  children?: FileNode[];
  extension?: string;
  size?: number;
  modifiedAt?: string;
}

export type ProjectSide = "concept" | "blender" | "rigging";

export type OpenFolderTarget = "root" | "concept" | "blender" | "terrain";

export interface WorkspaceResponse {
  activeWorkspaceId: string;
  workspaces: MasterWorkspace[];
  active: ActiveWorkspace | null;
  unlinked: { conceptOnly: string[]; blenderOnly: string[] };
  suggestions: ProjectLink[];
  autoLinked?: ProjectLink[];
}
