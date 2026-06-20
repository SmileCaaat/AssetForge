import fs from "fs/promises";
import path from "path";
import { renamePath } from "./fileOperations.js";
import { isPreviewableModel, isBlendFile } from "./scanner.js";

export const PRODUCTION_ASSET_ROLES = ["lowPoly", "skeleton", "smModel", "blendProject"] as const;

export type ProductionAssetRole = (typeof PRODUCTION_ASSET_ROLES)[number];

export interface ProductionAssetTagEntry {
  role: ProductionAssetRole;
  relativePath: string;
  taggedAt: string;
}

export interface ProductionAssetTagsFile {
  version: 1;
  tags: Record<string, ProductionAssetTagEntry>;
}

const META_DIR = ".asset-manager";
const TAGS_FILE = "production_asset_tags.json";

function tagsFilePath(projectRoot: string): string {
  return path.join(projectRoot, META_DIR, TAGS_FILE);
}

export async function loadProductionAssetTags(projectRoot: string): Promise<ProductionAssetTagsFile> {
  try {
    const raw = await fs.readFile(tagsFilePath(projectRoot), "utf-8");
    const parsed = JSON.parse(raw) as ProductionAssetTagsFile;
    return { version: 1, tags: parsed.tags || {} };
  } catch {
    return { version: 1, tags: {} };
  }
}

async function saveProductionAssetTags(
  projectRoot: string,
  data: ProductionAssetTagsFile,
): Promise<void> {
  const metaDir = path.join(projectRoot, META_DIR);
  await fs.mkdir(metaDir, { recursive: true });
  await fs.writeFile(tagsFilePath(projectRoot), JSON.stringify(data, null, 2), "utf-8");
}

function sanitizePrefix(displayName: string): string {
  return displayName.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "").trim();
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function findRelativePath(projectRoot: string, filePath: string): string {
  const rel = path.relative(projectRoot, filePath);
  if (rel.startsWith("..")) throw new Error("File is outside production project");
  return rel.split(path.sep).join("/");
}

async function collectFileNames(projectRoot: string): Promise<Set<string>> {
  const names = new Set<string>();

  async function walk(dir: string) {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name === META_DIR) continue;
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(abs);
      else names.add(entry.name);
    }
  }

  await walk(projectRoot);
  return names;
}

function buildProductionAssetName(
  prefix: string,
  role: ProductionAssetRole,
  ext: string,
  existingNames: Set<string>,
): string {
  const stem =
    role === "lowPoly"
      ? `${prefix}_Low`
      : role === "skeleton"
        ? `${prefix}_Skeleton`
        : role === "blendProject"
          ? prefix
          : `SM_${prefix}`;
  const primary = `${stem}${ext}`;
  if (!existingNames.has(primary)) return primary;

  let index = 2;
  while (existingNames.has(`${stem}_${pad2(index)}${ext}`)) index += 1;
  return `${stem}_${pad2(index)}${ext}`;
}

function removeTagsByRole(tags: ProductionAssetTagsFile, role: ProductionAssetRole): void {
  for (const [key, entry] of Object.entries(tags.tags)) {
    if (entry.role === role) delete tags.tags[key];
  }
}

function removeTagByRelativePath(tags: ProductionAssetTagsFile, relativePath: string): void {
  for (const [key, entry] of Object.entries(tags.tags)) {
    if (entry.relativePath === relativePath || key === relativePath) delete tags.tags[key];
  }
}

export function resolveProductionAssetTagsByPath(
  projectRoot: string,
  tagsFile: ProductionAssetTagsFile,
): Record<string, ProductionAssetRole> {
  const result: Record<string, ProductionAssetRole> = {};
  for (const entry of Object.values(tagsFile.tags)) {
    const abs = path.join(projectRoot, entry.relativePath.split("/").join(path.sep));
    result[path.resolve(abs)] = entry.role;
  }
  return result;
}

export async function markProductionAsset(input: {
  projectRoot: string;
  displayName: string;
  filePath: string;
  role: ProductionAssetRole;
  allowedRoots: string[];
}): Promise<{
  path: string;
  name: string;
  role: ProductionAssetRole;
  relativePath: string;
}> {
  const { projectRoot, displayName, filePath, role, allowedRoots } = input;
  if (!PRODUCTION_ASSET_ROLES.includes(role)) throw new Error("Invalid production asset role");

  const resolved = path.resolve(filePath);
  const basename = path.basename(resolved);
  if (role === "blendProject") {
    if (!isBlendFile(basename)) {
      throw new Error("Only .blend files can be marked as the Blender project");
    }
  } else if (!isPreviewableModel(basename)) {
    throw new Error("Only 3D model files can be marked as production assets");
  }

  const oldRelative = findRelativePath(projectRoot, resolved);
  const prefix = sanitizePrefix(displayName);
  if (!prefix) throw new Error("Invalid project name");

  const ext = path.extname(resolved);
  const parentDir = path.dirname(resolved);
  const existingNames = await collectFileNames(projectRoot);
  existingNames.delete(basename);

  const tags = await loadProductionAssetTags(projectRoot);
  removeTagsByRole(tags, role);
  removeTagByRelativePath(tags, oldRelative);

  const newName = buildProductionAssetName(prefix, role, ext, existingNames);
  const destPath = path.join(parentDir, newName);
  const renamedPath =
    path.resolve(resolved) === path.resolve(destPath)
      ? resolved
      : await renamePath(resolved, newName, allowedRoots);

  const newRelative = findRelativePath(projectRoot, renamedPath);
  tags.tags[newRelative] = {
    role,
    relativePath: newRelative,
    taggedAt: new Date().toISOString(),
  };

  await saveProductionAssetTags(projectRoot, tags);

  return {
    path: renamedPath,
    name: path.basename(renamedPath),
    role,
    relativePath: newRelative,
  };
}

export async function tagProductionAssetWithoutRename(input: {
  projectRoot: string;
  filePath: string;
  role: ProductionAssetRole;
}): Promise<void> {
  const relativePath = findRelativePath(input.projectRoot, input.filePath);
  const tags = await loadProductionAssetTags(input.projectRoot);
  removeTagByRelativePath(tags, relativePath);
  tags.tags[relativePath] = {
    role: input.role,
    relativePath,
    taggedAt: new Date().toISOString(),
  };
  await saveProductionAssetTags(input.projectRoot, tags);
}
