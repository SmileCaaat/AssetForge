import path from "path";
import type { AppState, MasterWorkspace, OpenFolderTarget } from "./types.js";
import { BLENDER_WORKSPACE_FOLDER, CONCEPT_WORKSPACE_FOLDER } from "./types.js";

export function getConceptRoot(workspace: MasterWorkspace): string {
  if (workspace.conceptRoot) return workspace.conceptRoot;
  return path.join(workspace.rootPath, CONCEPT_WORKSPACE_FOLDER);
}

export function getBlenderRoot(workspace: MasterWorkspace): string {
  if (workspace.blenderRoot) return workspace.blenderRoot;
  return path.join(workspace.rootPath, BLENDER_WORKSPACE_FOLDER);
}

export function getActiveWorkspace(state: AppState): MasterWorkspace {
  const workspace = state.workspaces.find((w) => w.id === state.activeWorkspaceId);
  if (!workspace) {
    throw new Error("Active workspace not found");
  }
  return workspace;
}

export function getAllowedRoots(state: AppState): string[] {
  const workspace = getActiveWorkspace(state);
  return [getConceptRoot(workspace), getBlenderRoot(workspace)];
}

export function getAllAllowedRoots(state: AppState): string[] {
  const roots = new Set<string>();
  for (const workspace of state.workspaces) {
    roots.add(getConceptRoot(workspace));
    roots.add(getBlenderRoot(workspace));
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
  }
}
