import type { FileNode } from "../types";
import { parentDir } from "../api";

export function resolveCurrentDirectoryPath(
  projectRoot: string | null,
  selectedFile: FileNode | null,
): string | null {
  if (!projectRoot) return null;
  if (!selectedFile) return projectRoot;
  if (selectedFile.isDirectory) return selectedFile.path;
  return parentDir(selectedFile.path);
}

export function resolveCopyPathTarget(
  node: FileNode | null,
  projectRoot: string | null,
  selectedFile: FileNode | null = null,
): string | null {
  if (node?.path) return node.path;
  return resolveCurrentDirectoryPath(projectRoot, selectedFile);
}

export async function copyPathToClipboard(path: string): Promise<void> {
  await navigator.clipboard.writeText(path);
}
