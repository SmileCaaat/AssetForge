import fs from "fs/promises";
import path from "path";
import { renamePath } from "./fileOperations.js";
import { isPreviewableImage } from "./scanner.js";

export const TEXTURE_MAP_TYPES = [
  "BaseColor",
  "Roughness",
  "Metallic",
  "Normal",
  "AO",
  "Height",
  "Edge",
  "Detection",
  "Alpha",
  "Bump",
  "Curvature",
  "Emission",
] as const;

export type TextureMapType = (typeof TEXTURE_MAP_TYPES)[number];

export interface TextureTagEntry {
  type: TextureMapType;
  relativePath: string;
  taggedAt: string;
}

export interface TextureTagsFile {
  version: 1;
  tags: Record<string, TextureTagEntry>;
}

const META_DIR = ".asset-manager";
const TAGS_FILE = "blender_texture_tags.json";

function tagsFilePath(projectRoot: string): string {
  return path.join(projectRoot, META_DIR, TAGS_FILE);
}

export async function loadTextureTags(projectRoot: string): Promise<TextureTagsFile> {
  try {
    const raw = await fs.readFile(tagsFilePath(projectRoot), "utf-8");
    const parsed = JSON.parse(raw) as TextureTagsFile;
    return { version: 1, tags: parsed.tags || {} };
  } catch {
    return { version: 1, tags: {} };
  }
}

async function saveTextureTags(projectRoot: string, data: TextureTagsFile): Promise<void> {
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

async function collectFileNames(projectRoot: string): Promise<Set<string>> {
  const names = new Set<string>();

  async function walk(dir: string) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === META_DIR) continue;
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(abs);
      } else {
        names.add(entry.name);
      }
    }
  }

  await walk(projectRoot);
  return names;
}

function findRelativePath(projectRoot: string, filePath: string): string {
  const rel = path.relative(projectRoot, filePath);
  if (rel.startsWith("..")) throw new Error("File is outside blender project");
  return rel.split(path.sep).join("/");
}

export function buildTextureMapName(
  prefix: string,
  type: TextureMapType,
  ext: string,
  existingNames: Set<string>,
): string {
  const primary = `T_${prefix}_${type}${ext}`;
  if (!existingNames.has(primary)) return primary;

  let index = 2;
  while (existingNames.has(`T_${prefix}_${type}_${pad2(index)}${ext}`)) {
    index += 1;
  }
  return `T_${prefix}_${type}_${pad2(index)}${ext}`;
}

function validateTextureFile(filename: string): void {
  if (!isPreviewableImage(filename)) {
    throw new Error("Only image files can be marked as texture maps");
  }
}

function removeTagsByType(tags: TextureTagsFile, type: TextureMapType): void {
  for (const [key, entry] of Object.entries(tags.tags)) {
    if (entry.type === type) delete tags.tags[key];
  }
}

function removeTagByRelativePath(tags: TextureTagsFile, relativePath: string): void {
  for (const [key, entry] of Object.entries(tags.tags)) {
    if (entry.relativePath === relativePath || key === relativePath) {
      delete tags.tags[key];
    }
  }
}

export function resolveTextureTagsByPath(
  projectRoot: string,
  tagsFile: TextureTagsFile,
): Record<string, TextureMapType> {
  const result: Record<string, TextureMapType> = {};
  for (const entry of Object.values(tagsFile.tags)) {
    const abs = path.join(projectRoot, entry.relativePath.split("/").join(path.sep));
    result[path.resolve(abs)] = entry.type;
  }
  return result;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function syncTextureTagsFromFiles(
  projectRoot: string,
  displayName: string,
  tagsFile: TextureTagsFile,
): Promise<TextureTagsFile> {
  const prefix = sanitizePrefix(displayName);
  if (!prefix) return tagsFile;

  const patterns = TEXTURE_MAP_TYPES.map((type) => ({
    type,
    pattern: new RegExp(`^T_${escapeRegex(prefix)}_${type}(_\\d+)?\\.`, "i"),
  }));
  let changed = false;

  async function walk(dir: string, rel = "") {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === META_DIR) continue;
      const abs = path.join(dir, entry.name);
      const entryRel = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        await walk(abs, entryRel);
        continue;
      }
      if (tagsFile.tags[entryRel]) continue;
      if (!isPreviewableImage(entry.name)) continue;

      for (const { type, pattern } of patterns) {
        if (pattern.test(entry.name)) {
          tagsFile.tags[entryRel] = {
            type,
            relativePath: entryRel,
            taggedAt: new Date().toISOString(),
          };
          changed = true;
          break;
        }
      }
    }
  }

  await walk(projectRoot);
  if (changed) await saveTextureTags(projectRoot, tagsFile);
  return tagsFile;
}

export async function flushTextureTags(
  projectRoot: string,
  displayName: string,
): Promise<string | null> {
  try {
    await fs.access(projectRoot);
  } catch {
    return null;
  }

  let tagsFile = await loadTextureTags(projectRoot);
  tagsFile = await syncTextureTagsFromFiles(projectRoot, displayName, tagsFile);
  await saveTextureTags(projectRoot, tagsFile);
  return tagsFilePath(projectRoot);
}

export async function markTextureMap(input: {
  projectRoot: string;
  displayName: string;
  filePath: string;
  type: TextureMapType;
  allowedRoots: string[];
}): Promise<{
  path: string;
  name: string;
  type: TextureMapType;
  relativePath: string;
}> {
  const { projectRoot, displayName, filePath, type, allowedRoots } = input;
  const resolved = path.resolve(filePath);
  const basename = path.basename(resolved);

  validateTextureFile(basename);
  if (!TEXTURE_MAP_TYPES.includes(type)) {
    throw new Error("Invalid texture map type");
  }

  const oldRelative = findRelativePath(projectRoot, resolved);
  const prefix = sanitizePrefix(displayName);
  if (!prefix) throw new Error("Invalid project name");

  const ext = path.extname(resolved);
  const parentDir = path.dirname(resolved);
  const existingNames = await collectFileNames(projectRoot);
  existingNames.delete(basename);

  const tags = await loadTextureTags(projectRoot);
  removeTagsByType(tags, type);

  const newName = buildTextureMapName(prefix, type, ext, existingNames);
  removeTagByRelativePath(tags, oldRelative);

  const destPath = path.join(parentDir, newName);
  const renamedPath =
    path.resolve(resolved) === path.resolve(destPath)
      ? resolved
      : await renamePath(resolved, newName, allowedRoots);

  const newRelative = findRelativePath(projectRoot, renamedPath);
  tags.tags[newRelative] = {
    type,
    relativePath: newRelative,
    taggedAt: new Date().toISOString(),
  };

  await saveTextureTags(projectRoot, tags);

  return {
    path: renamedPath,
    name: path.basename(renamedPath),
    type,
    relativePath: newRelative,
  };
}
