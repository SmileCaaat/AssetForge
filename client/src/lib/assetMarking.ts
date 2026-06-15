import { isImageFile, isModelFile } from "../api";
import type { ConceptAssetRole, FileNode } from "../types";

export function canMarkWithRole(node: FileNode, role: ConceptAssetRole): boolean {
  if (role === "keyArt" || role === "multiView") return isImageFile(node);
  if (role === "highPoly" || role === "lowPoly") return isModelFile(node);
  return false;
}
