import { isModelFile } from "../api";
import type { FileNode, ProductionAssetRole } from "../types";

export function canMarkProductionAsset(node: FileNode, _role: ProductionAssetRole): boolean {
  return isModelFile(node);
}
