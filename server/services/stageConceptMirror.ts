import fs from "fs/promises";
import path from "path";
import type { MasterWorkspace } from "../types.js";
import type { StageTextureSlot } from "../stageTypes.js";
import { STAGE_UPLOAD_SLOTS } from "../stageTypes.js";
import { assertPathInsideRoot } from "../pathSecurity.js";
import { getConceptRoot } from "../workspacePaths.js";

const MIRROR_SLOTS = new Set<StageTextureSlot>(STAGE_UPLOAD_SLOTS);

export function resolveConceptMirrorDir(
  workspace: MasterWorkspace,
  conceptProjectRel: string,
  stageName: string,
): string {
  const conceptRoot = getConceptRoot(workspace);
  const safeRel = conceptProjectRel.trim().replace(/^[./\\]+/, "");
  if (!safeRel) throw new Error("conceptProjectRel is required");
  const dest = path.join(conceptRoot, safeRel, "stage-lab", stageName, "textures");
  assertPathInsideRoot(dest, conceptRoot);
  return dest;
}

export async function mirrorStageTextureToConcept(
  workspace: MasterWorkspace,
  conceptProjectRel: string,
  stageName: string,
  slot: StageTextureSlot,
  textureFileName: string,
  fileBuffer: Buffer,
): Promise<string | null> {
  if (!MIRROR_SLOTS.has(slot)) return null;
  if (!conceptProjectRel?.trim()) return null;

  const conceptRoot = getConceptRoot(workspace);
  const mirrorDir = resolveConceptMirrorDir(workspace, conceptProjectRel, stageName);
  const dest = path.join(mirrorDir, path.basename(textureFileName));
  assertPathInsideRoot(dest, conceptRoot);
  await fs.mkdir(mirrorDir, { recursive: true });
  await fs.writeFile(dest, fileBuffer);
  return path.relative(conceptRoot, dest).split(path.sep).join("/");
}
