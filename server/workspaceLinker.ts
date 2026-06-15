import fs from "fs/promises";
import path from "path";
import type { MasterWorkspace } from "./types.js";
import { normalizeId } from "./config.js";
import {
  BLENDER_WORKSPACE_FOLDER,
  CONCEPT_WORKSPACE_FOLDER,
} from "./types.js";

interface WorkspaceMeta {
  name?: string;
  conceptWorkspace?: string;
  blenderWorkspace?: string;
  createdAt?: string;
}

export interface OpenMasterWorkspaceInput {
  name: string;
  rootPath?: string;
  conceptRoot?: string;
  blenderRoot?: string;
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function readWorkspaceMeta(rootPath: string): Promise<WorkspaceMeta | null> {
  const metaPath = path.join(rootPath, "workspace.meta.json");
  try {
    return JSON.parse(await fs.readFile(metaPath, "utf-8")) as WorkspaceMeta;
  } catch {
    return null;
  }
}

function workspaceFingerprint(workspace: {
  rootPath?: string;
  conceptRoot?: string;
  blenderRoot?: string;
}): string {
  const root = workspace.rootPath?.trim() || "";
  const concept = workspace.conceptRoot?.trim() || "";
  const blender = workspace.blenderRoot?.trim() || "";
  return `${root}|${concept}|${blender}`.toLowerCase();
}

export function isDuplicateWorkspace(
  existing: MasterWorkspace[],
  candidate: { rootPath?: string; conceptRoot?: string; blenderRoot?: string },
): boolean {
  const fingerprint = workspaceFingerprint(candidate);
  return existing.some((workspace) => workspaceFingerprint(workspace) === fingerprint);
}

export async function openMasterWorkspace(
  input: OpenMasterWorkspaceInput,
): Promise<MasterWorkspace> {
  const name = input.name.trim();
  if (!name) {
    throw new Error("工作区名称不能为空");
  }

  const hasDispersedPaths = Boolean(input.conceptRoot?.trim() || input.blenderRoot?.trim());
  const hasRootPath = Boolean(input.rootPath?.trim());

  if (!hasDispersedPaths && !hasRootPath) {
    throw new Error("请填写总工作区根目录，或填写概念/生产路径");
  }

  if (hasDispersedPaths) {
    const conceptRoot = input.conceptRoot?.trim()
      ? path.resolve(input.conceptRoot.trim())
      : undefined;
    const blenderRoot = input.blenderRoot?.trim()
      ? path.resolve(input.blenderRoot.trim())
      : undefined;

    if (!conceptRoot && !blenderRoot) {
      throw new Error("概念路径与生产路径至少填写一项");
    }
    if (conceptRoot && !(await pathExists(conceptRoot))) {
      throw new Error(`概念路径不存在: ${conceptRoot}`);
    }
    if (blenderRoot && !(await pathExists(blenderRoot))) {
      throw new Error(`生产路径不存在: ${blenderRoot}`);
    }

    return {
      id: normalizeId(name) || `ws-${Date.now()}`,
      name,
      rootPath: "",
      conceptRoot,
      blenderRoot,
      projects: [],
    };
  }

  const resolvedRoot = path.resolve(input.rootPath!.trim());
  if (!(await pathExists(resolvedRoot))) {
    throw new Error(`根目录不存在: ${resolvedRoot}`);
  }

  const meta = await readWorkspaceMeta(resolvedRoot);
  const conceptFolder = meta?.conceptWorkspace || CONCEPT_WORKSPACE_FOLDER;
  const blenderFolder = meta?.blenderWorkspace || BLENDER_WORKSPACE_FOLDER;
  const conceptRoot = path.join(resolvedRoot, conceptFolder);
  const blenderRoot = path.join(resolvedRoot, blenderFolder);

  const conceptExists = await pathExists(conceptRoot);
  const blenderExists = await pathExists(blenderRoot);
  if (!conceptExists && !blenderExists) {
    throw new Error(
      `未在根目录找到 ${conceptFolder} 或 ${blenderFolder}，请确认路径或改用分散路径模式`,
    );
  }

  return {
    id: normalizeId(name) || `ws-${Date.now()}`,
    name: meta?.name?.trim() || name,
    rootPath: resolvedRoot,
    conceptRoot: conceptExists ? conceptRoot : undefined,
    blenderRoot: blenderExists ? blenderRoot : undefined,
    projects: [],
    createdAt: meta?.createdAt,
  };
}
