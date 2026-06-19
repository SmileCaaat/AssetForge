import fs from "fs/promises";
import path from "path";
import type { MasterWorkspace } from "./types.js";
import { normalizeAssetDomain } from "./assetDomains.js";
import { getBlenderRoot, getConceptRoot } from "./workspacePaths.js";

const BLENDER_CHARACTER_DIRS = [
  "animations/mixamo",
  "backups",
  "exports",
  "references",
  "renders",
  "Rigging/input",
  "Rigging/output",
  "Rigging/jobs",
  "textures/source",
];

const BLENDER_TERRAIN_DIRS = ["backups", "exports", "references", "renders", "textures/source"];

export async function createBlenderProject(
  blenderRoot: string,
  projectName: string,
  domain?: unknown,
): Promise<string> {
  const assetDomain = normalizeAssetDomain(domain);
  const projectRoot = path.join(blenderRoot, "projects", projectName);
  const dirs = assetDomain === "terrain" ? BLENDER_TERRAIN_DIRS : BLENDER_CHARACTER_DIRS;

  for (const dir of dirs) {
    await fs.mkdir(path.join(projectRoot, dir), { recursive: true });
  }

  const isTerrain = assetDomain === "terrain";
  const refFileName = isTerrain ? `Terrain_${projectName}.md` : `Toon_Shader_${projectName}.md`;
  const refContent = isTerrain
    ? `# Terrain - ${projectName}\n\n记录该地形资产的制作说明。\n`
    : `# Toon Shader - ${projectName}\n\n记录该角色的卡通 Shader 参数。\n`;
  const refDoc = path.join(projectRoot, "references", refFileName);

  try {
    await fs.access(refDoc);
  } catch {
    await fs.writeFile(refDoc, refContent, "utf-8");
  }

  return projectRoot;
}

export async function createConceptProject(
  conceptRoot: string,
  folderName: string,
): Promise<string> {
  const projectRoot = path.join(conceptRoot, folderName);
  await fs.mkdir(projectRoot, { recursive: true });
  return projectRoot;
}

export async function createLinkedProject(
  workspace: MasterWorkspace,
  displayName: string,
  conceptFolderName: string,
  blenderProjectName: string,
  domain?: unknown,
): Promise<{ conceptPath: string; blenderPath: string }> {
  const conceptPath = await createConceptProject(getConceptRoot(workspace), conceptFolderName);
  const blenderPath = await createBlenderProject(
    getBlenderRoot(workspace),
    blenderProjectName,
    domain,
  );
  return { conceptPath, blenderPath };
}
