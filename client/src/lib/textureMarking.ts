import { isImageFile } from "../api";
import type { FileNode } from "../types";

export function canMarkTextureMap(node: FileNode): boolean {
  return isImageFile(node);
}
