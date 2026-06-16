import path from "path";
import type { FileNode } from "./types.js";

export function emptyProjectTree(root: string): FileNode {
  return {
    name: path.basename(root) || root,
    path: root,
    relativePath: "",
    isDirectory: true,
    children: [],
  };
}

export function missingProjectWarning(root: string): string {
  return `项目目录不存在或无法访问：${root}`;
}
