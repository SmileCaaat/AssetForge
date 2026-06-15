import fs from "fs/promises";
import path from "path";
import type { MasterWorkspace } from "./types.js";
import { normalizeId } from "./config.js";
import {
  BLENDER_WORKSPACE_FOLDER,
  CONCEPT_WORKSPACE_FOLDER,
} from "./types.js";
import { getBlenderRoot, getConceptRoot } from "./workspacePaths.js";

const BLENDER_WORKSPACE_DIRS = [
  "projects",
  "assets/hdri",
  "assets/materials",
  "assets/models",
  "assets/textures",
  "docs",
  "tools",
];

export async function createMasterWorkspace(
  name: string,
  rootPath: string,
): Promise<MasterWorkspace> {
  const resolvedRoot = path.resolve(rootPath);
  const conceptRoot = path.join(resolvedRoot, CONCEPT_WORKSPACE_FOLDER);
  const blenderRoot = path.join(resolvedRoot, BLENDER_WORKSPACE_FOLDER);

  await fs.mkdir(conceptRoot, { recursive: true });

  for (const dir of BLENDER_WORKSPACE_DIRS) {
    await fs.mkdir(path.join(blenderRoot, dir), { recursive: true });
  }

  const pipelineDoc = path.join(blenderRoot, "docs", "Asset_Pipeline_Standard.md");
  try {
    await fs.access(pipelineDoc);
  } catch {
    await fs.writeFile(
      pipelineDoc,
      `# Asset Pipeline Standard\n\n${name} 生产工作区。请将管线标准文档放在此目录。\n`,
      "utf-8",
    );
  }

  const metaPath = path.join(resolvedRoot, "workspace.meta.json");
  const meta = {
    name,
    conceptWorkspace: CONCEPT_WORKSPACE_FOLDER,
    blenderWorkspace: BLENDER_WORKSPACE_FOLDER,
    createdAt: new Date().toISOString(),
  };
  await fs.writeFile(metaPath, JSON.stringify(meta, null, 2), "utf-8");

  return {
    id: normalizeId(name) || `ws-${Date.now()}`,
    name,
    rootPath: resolvedRoot,
    projects: [],
    createdAt: meta.createdAt,
  };
}

export function workspaceRoots(workspace: MasterWorkspace) {
  return {
    conceptRoot: getConceptRoot(workspace),
    blenderRoot: getBlenderRoot(workspace),
  };
}
