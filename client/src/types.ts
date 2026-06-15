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

export interface ConceptTagEntry {
  role: ConceptAssetRole;
  relativePath: string;
  taggedAt: string;
  index?: number;
}

export interface ConceptTagsResponse {
  tags: Record<string, ConceptAssetRole>;
  entries: Record<string, ConceptTagEntry>;
}

export interface ProjectLink {
  id: string;
  displayName: string;
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

export type ProjectSide = "concept" | "blender";

export type OpenFolderTarget = "root" | "concept" | "blender";

export interface WorkspaceResponse {
  activeWorkspaceId: string;
  workspaces: MasterWorkspace[];
  active: ActiveWorkspace;
  unlinked: { conceptOnly: string[]; blenderOnly: string[] };
  suggestions: ProjectLink[];
}
