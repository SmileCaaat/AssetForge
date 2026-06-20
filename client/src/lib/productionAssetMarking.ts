import { isBlendFile, isModelFile } from "../api";
import type { FileNode, ProductionAssetRole } from "../types";

export function canMarkProductionAsset(node: FileNode, role: ProductionAssetRole): boolean {
  if (role === "blendProject") return isBlendFile(node);
  return isModelFile(node);
}
