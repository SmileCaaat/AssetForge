import fs from "fs/promises";
import path from "path";
import type { MasterWorkspace } from "./types.js";
import { getBlenderRoot, getConceptRoot } from "./workspacePaths.js";

const BLENDER_PROJECT_DIRS = [
  "animations/mixamo",
  "backups",
  "exports",
  "references",
  "renders",
  "textures/source",
];

export async function createBlenderProject(
  blenderRoot: string,
  projectName: string,
): Promise<string> {
  const projectRoot = path.join(blenderRoot, "projects", projectName);

  for (const dir of BLENDER_PROJECT_DIRS) {
    await fs.mkdir(path.join(projectRoot, dir), { recursive: true });
  }

  const shaderDoc = path.join(projectRoot, "references", `Toon_Shader_${projectName}.md`);
  try {
    await fs.access(shaderDoc);
  } catch {
    await fs.writeFile(
      shaderDoc,
      `# Toon Shader — ${projectName}\n\n记录该角色的卡通 Shader 参数。\n`,
      "utf-8",
    );
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
): Promise<{ conceptPath: string; blenderPath: string }> {
  const conceptPath = await createConceptProject(getConceptRoot(workspace), conceptFolderName);
  const blenderPath = await createBlenderProject(getBlenderRoot(workspace), blenderProjectName);
  return { conceptPath, blenderPath };
}
