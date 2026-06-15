import fs from "fs/promises";
import path from "path";
import { isPathInsideRoot } from "./pathSecurity.js";

const INVALID_NAME_PATTERN = /[<>:"/\\|?*\u0000-\u001f]/;

export function assertWithinRoots(targetPath: string, roots: string[]): string {
  const resolved = path.resolve(targetPath);
  const allowed = roots.some((root) => isPathInsideRoot(resolved, root));
  if (!allowed) {
    throw new Error("Access denied: path outside workspace");
  }
  return resolved;
}

export function validateName(name: string): void {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Name cannot be empty");
  if (trimmed === "." || trimmed === "..") throw new Error("Invalid name");
  if (INVALID_NAME_PATTERN.test(trimmed)) {
    throw new Error("Name contains invalid characters");
  }
}

async function ensureNotExists(targetPath: string): Promise<void> {
  try {
    await fs.access(targetPath);
    throw new Error("Target already exists");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

export async function renamePath(
  itemPath: string,
  newName: string,
  roots: string[],
): Promise<string> {
  validateName(newName);
  const resolved = assertWithinRoots(itemPath, roots);
  const dest = path.join(path.dirname(resolved), newName.trim());
  assertWithinRoots(dest, roots);
  await ensureNotExists(dest);
  await fs.rename(resolved, dest);
  return dest;
}

export async function deletePath(itemPath: string, roots: string[]): Promise<void> {
  const resolved = assertWithinRoots(itemPath, roots);
  const stat = await fs.stat(resolved);
  if (stat.isDirectory()) {
    await fs.rm(resolved, { recursive: true, force: true });
  } else {
    await fs.unlink(resolved);
  }
}

export async function copyPath(
  sourcePath: string,
  destDir: string,
  roots: string[],
): Promise<string> {
  const source = assertWithinRoots(sourcePath, roots);
  const destParent = assertWithinRoots(destDir, roots);
  const dest = path.join(destParent, path.basename(source));
  assertWithinRoots(dest, roots);
  await ensureNotExists(dest);

  const stat = await fs.stat(source);
  if (stat.isDirectory()) {
    await fs.cp(source, dest, { recursive: true });
  } else {
    await fs.copyFile(source, dest);
  }
  return dest;
}

export async function movePath(
  sourcePath: string,
  destDir: string,
  roots: string[],
): Promise<string> {
  const source = assertWithinRoots(sourcePath, roots);
  const destParent = assertWithinRoots(destDir, roots);
  const dest = path.join(destParent, path.basename(source));
  assertWithinRoots(dest, roots);
  await ensureNotExists(dest);

  const samePath = path.resolve(source) === path.resolve(dest);
  if (samePath) return dest;

  if (isPathInsideRoot(destParent, source)) {
    throw new Error("Cannot move a folder into itself");
  }

  await fs.rename(source, dest);
  return dest;
}

export async function mkdirPath(
  parentDir: string,
  folderName: string,
  roots: string[],
): Promise<string> {
  validateName(folderName);
  const parent = assertWithinRoots(parentDir, roots);
  const dest = path.join(parent, folderName.trim());
  assertWithinRoots(dest, roots);
  await ensureNotExists(dest);
  await fs.mkdir(dest);
  return dest;
}
