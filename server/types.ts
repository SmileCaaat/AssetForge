export type ProjectStage = "concept" | "production" | "done";

export const CONCEPT_WORKSPACE_FOLDER = "ConceptWorkspace";
export const BLENDER_WORKSPACE_FOLDER = "BlenderWorkspace";

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

export interface AppState {
  activeWorkspaceId: string;
  workspaces: MasterWorkspace[];
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

/** @deprecated legacy shape */
export interface LegacyWorkspaceConfig {
  workspaceId?: string;
  meshRoot?: string;
  blenderRoot?: string;
  projects?: Array<Partial<ProjectLink> & { meshPath?: string }>;
  activeWorkspaceId?: string;
  workspaces?: MasterWorkspace[];
}
