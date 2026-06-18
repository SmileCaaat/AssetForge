import path from "path";
import type { AppState, MasterWorkspace, OpenFolderTarget } from "./types.js";
import { BLENDER_WORKSPACE_FOLDER, CONCEPT_WORKSPACE_FOLDER, TERRAIN_WORKSPACE_FOLDER } from "./types.js";
import { resolveProjectPath } from "./scanner.js";

export function getConceptRoot(workspace: MasterWorkspace): string {
  if (workspace.conceptRoot) return workspace.conceptRoot;
  return path.join(workspace.rootPath, CONCEPT_WORKSPACE_FOLDER);
}

export function getBlenderRoot(workspace: MasterWorkspace): string {
  if (workspace.blenderRoot) return workspace.blenderRoot;
  return path.join(workspace.rootPath, BLENDER_WORKSPACE_FOLDER);
}

export function getTerrainRoot(workspace: MasterWorkspace): string {
  if (workspace.terrainRoot?.trim()) return path.resolve(workspace.terrainRoot.trim());
  if (workspace.rootPath?.trim()) {
    return path.join(path.resolve(workspace.rootPath), TERRAIN_WORKSPACE_FOLDER);
  }
  return path.join(path.dirname(getBlenderRoot(workspace)), TERRAIN_WORKSPACE_FOLDER);
}

export function getActiveWorkspace(state: AppState): MasterWorkspace {
  const workspace = state.workspaces.find((w) => w.id === state.activeWorkspaceId);
  if (!workspace) {
    throw new Error("Active workspace not found");
  }
  return workspace;
}

function addRoot(roots: Set<string>, candidate?: string): void {
  if (!candidate?.trim()) return;
  roots.add(path.resolve(candidate.trim()));
}

export function collectWorkspaceRoots(workspace: MasterWorkspace): string[] {
  const roots = new Set<string>();
  addRoot(roots, workspace.rootPath);
  const conceptRoot = getConceptRoot(workspace);
  const blenderRoot = getBlenderRoot(workspace);
  const terrainRoot = getTerrainRoot(workspace);
  addRoot(roots, conceptRoot);
  addRoot(roots, blenderRoot);
  addRoot(roots, terrainRoot);
  addRoot(roots, path.join(blenderRoot, "projects"));
  addRoot(roots, path.join(terrainRoot, "stages"));

  for (const project of workspace.projects) {
    addRoot(roots, resolveProjectPath(workspace, project, "concept"));
    addRoot(roots, resolveProjectPath(workspace, project, "blender"));
  }

  return [...roots];
}

export function getAllowedRoots(state: AppState): string[] {
  return collectWorkspaceRoots(getActiveWorkspace(state));
}

export function getAllAllowedRoots(state: AppState): string[] {
  const roots = new Set<string>();
  for (const workspace of state.workspaces) {
    for (const root of collectWorkspaceRoots(workspace)) {
      roots.add(root);
    }
  }
  return [...roots];
}

export function resolveOpenFolderPath(
  workspace: MasterWorkspace,
  target: OpenFolderTarget,
): string {
  switch (target) {
    case "root":
      return workspace.rootPath || getConceptRoot(workspace);
    case "concept":
      return getConceptRoot(workspace);
    case "blender":
      return getBlenderRoot(workspace);
    case "terrain":
      return getTerrainRoot(workspace);
  }
}
