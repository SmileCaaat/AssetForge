import fs from "fs/promises";
import path from "path";
import type { AppState } from "./types.js";
import { getAllAllowedRoots } from "./workspacePaths.js";

const TOKEN_FILE = ".asset-manager-path-token";
const MAX_DEPTH = 4;
const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "$recycle.bin",
  "system volume information",
]);

function collectSearchRoots(state: AppState, defaultPath?: string): string[] {
  const roots = new Set<string>();

  if (defaultPath?.trim()) {
    let current = path.resolve(defaultPath.trim());
    for (let i = 0; i < 8; i++) {
      roots.add(current);
      const parent = path.dirname(current);
      if (parent === current) break;
      current = parent;
    }
  }

  for (const allowed of getAllAllowedRoots(state)) {
    roots.add(path.resolve(allowed));
  }

  const home = process.env.USERPROFILE || process.env.HOME;
  if (home) {
    roots.add(path.resolve(home));
    roots.add(path.join(home, "Desktop"));
  }

  return [...roots];
}

async function readTokenFile(filePath: string): Promise<string | null> {
  try {
    const content = await fs.readFile(filePath, "utf-8");
    return content.trim() || null;
  } catch {
    return null;
  }
}

async function searchTokenInDir(
  dir: string,
  token: string,
  depth: number,
): Promise<string | null> {
  if (depth > MAX_DEPTH) return null;

  const tokenPath = path.join(dir, TOKEN_FILE);
  try {
    const content = await readTokenFile(tokenPath);
    if (content === token) {
      await fs.unlink(tokenPath).catch(() => undefined);
      return dir;
    }
  } catch {
    /* continue */
  }

  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return null;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (SKIP_DIRS.has(entry.name.toLowerCase())) continue;
    const found = await searchTokenInDir(path.join(dir, entry.name), token, depth + 1);
    if (found) return found;
  }

  return null;
}

export async function resolvePickerTokenPath(
  state: AppState,
  token: string,
  options?: { defaultPath?: string },
): Promise<string> {
  const trimmed = token.trim();
  if (!trimmed) {
    throw new Error("token is required");
  }

  const roots = collectSearchRoots(state, options?.defaultPath);
  for (const root of roots) {
    try {
      await fs.access(root);
    } catch {
      continue;
    }

    const directToken = path.join(root, TOKEN_FILE);
    const directContent = await readTokenFile(directToken);
    if (directContent === trimmed) {
      await fs.unlink(directToken).catch(() => undefined);
      return path.win32.normalize(path.resolve(root));
    }

    const found = await searchTokenInDir(path.resolve(root), trimmed, 0);
    if (found) {
      return path.win32.normalize(path.resolve(found));
    }
  }

  throw new Error("无法解析所选文件夹路径，请确认项目目录在常用磁盘位置");
}
