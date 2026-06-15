import fs from "fs/promises";
import path from "path";
import { renamePath } from "./fileOperations.js";
import { isPreviewableImage, isPreviewableModel } from "./scanner.js";

export type ConceptAssetRole = "keyArt" | "multiView" | "highPoly" | "lowPoly";

export interface ConceptTagEntry {
  role: ConceptAssetRole;
  relativePath: string;
  taggedAt: string;
  index?: number;
}

export interface ConceptTagsFile {
  version: 1;
  tags: Record<string, ConceptTagEntry>;
}

const META_DIR = ".asset-manager";
const TAGS_FILE = "concept_tags.json";

function tagsFilePath(projectRoot: string): string {
  return path.join(projectRoot, META_DIR, TAGS_FILE);
}

export async function loadConceptTags(projectRoot: string): Promise<ConceptTagsFile> {
  try {
    const raw = await fs.readFile(tagsFilePath(projectRoot), "utf-8");
    const parsed = JSON.parse(raw) as ConceptTagsFile;
    return { version: 1, tags: parsed.tags || {} };
  } catch {
    return { version: 1, tags: {} };
  }
}

async function saveConceptTags(projectRoot: string, data: ConceptTagsFile): Promise<void> {
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
  if (rel.startsWith("..")) throw new Error("File is outside concept project");
  return rel.split(path.sep).join("/");
}

export function buildKeyArtName(prefix: string, ext: string, existingNames: Set<string>): string {
  const primary = `${prefix}_KeyArt${ext}`;
  if (!existingNames.has(primary)) return primary;

  let index = 2;
  while (existingNames.has(`${prefix}_KeyArt_${pad2(index)}${ext}`)) {
    index += 1;
  }
  return `${prefix}_KeyArt_${pad2(index)}${ext}`;
}

export function buildMultiViewName(
  prefix: string,
  ext: string,
  existingNames: Set<string>,
  usedIndexes: Set<number>,
): { name: string; index: number } {
  let index = 1;
  while (
    existingNames.has(`${prefix}_MultiView_${pad2(index)}${ext}`) ||
    usedIndexes.has(index)
  ) {
    index += 1;
  }
  return { name: `${prefix}_MultiView_${pad2(index)}${ext}`, index };
}

export function buildHighPolyName(prefix: string, ext: string, existingNames: Set<string>): string {
  const primary = `${prefix}_High${ext}`;
  if (!existingNames.has(primary)) return primary;

  let index = 2;
  while (existingNames.has(`${prefix}_High_${pad2(index)}${ext}`)) {
    index += 1;
  }
  return `${prefix}_High_${pad2(index)}${ext}`;
}

export function buildLowPolyName(prefix: string, ext: string, existingNames: Set<string>): string {
  const primary = `${prefix}_Low${ext}`;
  if (!existingNames.has(primary)) return primary;

  let index = 2;
  while (existingNames.has(`${prefix}_Low_${pad2(index)}${ext}`)) {
    index += 1;
  }
  return `${prefix}_Low_${pad2(index)}${ext}`;
}

function validateRoleForFile(role: ConceptAssetRole, filename: string): void {
  if ((role === "keyArt" || role === "multiView") && !isPreviewableImage(filename)) {
    throw new Error("Only image files can be marked as key art or multi-view");
  }
  if ((role === "highPoly" || role === "lowPoly") && !isPreviewableModel(filename)) {
    throw new Error("Only 3D model files can be marked as high/low poly");
  }
}

function removeTagsByRole(tags: ConceptTagsFile, role: ConceptAssetRole): void {
  for (const [key, entry] of Object.entries(tags.tags)) {
    if (entry.role === role) delete tags.tags[key];
  }
}

function removeTagByRelativePath(tags: ConceptTagsFile, relativePath: string): void {
  for (const [key, entry] of Object.entries(tags.tags)) {
    if (entry.relativePath === relativePath || key === relativePath) {
      delete tags.tags[key];
    }
  }
}

export function resolveConceptTagsByPath(
  projectRoot: string,
  tagsFile: ConceptTagsFile,
): Record<string, ConceptAssetRole> {
  const result: Record<string, ConceptAssetRole> = {};
  for (const entry of Object.values(tagsFile.tags)) {
    const abs = path.join(projectRoot, entry.relativePath.split("/").join(path.sep));
    result[path.resolve(abs)] = entry.role;
  }
  return result;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function syncConceptTagsFromFiles(
  projectRoot: string,
  displayName: string,
  tagsFile: ConceptTagsFile,
): Promise<ConceptTagsFile> {
  const prefix = sanitizePrefix(displayName);
  if (!prefix) return tagsFile;

  const keyArtPattern = new RegExp(`^${escapeRegex(prefix)}_KeyArt(_\\d+)?\\.`, "i");
  const multiViewPattern = new RegExp(`^${escapeRegex(prefix)}_MultiView_(\\d+)\\.`, "i");
  const highPolyPattern = new RegExp(`^${escapeRegex(prefix)}_High(_\\d+)?\\.`, "i");
  const lowPolyPattern = new RegExp(`^${escapeRegex(prefix)}_Low(_\\d+)?\\.`, "i");
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

      if (isPreviewableImage(entry.name)) {
        if (keyArtPattern.test(entry.name)) {
          tagsFile.tags[entryRel] = {
            role: "keyArt",
            relativePath: entryRel,
            taggedAt: new Date().toISOString(),
          };
          changed = true;
          continue;
        }

        const multiMatch = entry.name.match(multiViewPattern);
        if (multiMatch) {
          tagsFile.tags[entryRel] = {
            role: "multiView",
            relativePath: entryRel,
            taggedAt: new Date().toISOString(),
            index: Number(multiMatch[1]),
          };
          changed = true;
        }
        continue;
      }

      if (isPreviewableModel(entry.name)) {
        if (highPolyPattern.test(entry.name)) {
          tagsFile.tags[entryRel] = {
            role: "highPoly",
            relativePath: entryRel,
            taggedAt: new Date().toISOString(),
          };
          changed = true;
          continue;
        }

        if (lowPolyPattern.test(entry.name)) {
          tagsFile.tags[entryRel] = {
            role: "lowPoly",
            relativePath: entryRel,
            taggedAt: new Date().toISOString(),
          };
          changed = true;
        }
      }
    }
  }

  await walk(projectRoot);
  if (changed) await saveConceptTags(projectRoot, tagsFile);
  return tagsFile;
}

export async function flushConceptTags(
  projectRoot: string,
  displayName: string,
): Promise<string | null> {
  try {
    await fs.access(projectRoot);
  } catch {
    return null;
  }

  let tagsFile = await loadConceptTags(projectRoot);
  tagsFile = await syncConceptTagsFromFiles(projectRoot, displayName, tagsFile);
  await saveConceptTags(projectRoot, tagsFile);
  return tagsFilePath(projectRoot);
}

export async function markConceptAsset(input: {
  projectRoot: string;
  displayName: string;
  filePath: string;
  role: ConceptAssetRole;
  allowedRoots: string[];
}): Promise<{
  path: string;
  name: string;
  role: ConceptAssetRole;
  relativePath: string;
}> {
  const { projectRoot, displayName, filePath, role, allowedRoots } = input;
  const resolved = path.resolve(filePath);
  const basename = path.basename(resolved);

  validateRoleForFile(role, basename);

  const oldRelative = findRelativePath(projectRoot, resolved);
  const prefix = sanitizePrefix(displayName);
  if (!prefix) throw new Error("Invalid project name");

  const ext = path.extname(resolved);
  const parentDir = path.dirname(resolved);
  const existingNames = await collectFileNames(projectRoot);
  existingNames.delete(basename);

  const tags = await loadConceptTags(projectRoot);

  if (role === "keyArt") {
    removeTagsByRole(tags, "keyArt");
  } else if (role === "highPoly") {
    removeTagsByRole(tags, "highPoly");
  } else if (role === "lowPoly") {
    removeTagsByRole(tags, "lowPoly");
  }

  const usedMultiViewIndexes = new Set(
    Object.values(tags.tags)
      .filter((entry) => entry.role === "multiView" && entry.index)
      .map((entry) => entry.index as number),
  );

  let newName: string;
  let multiViewIndex: number | undefined;

  if (role === "keyArt") {
    newName = buildKeyArtName(prefix, ext, existingNames);
  } else if (role === "multiView") {
    const built = buildMultiViewName(prefix, ext, existingNames, usedMultiViewIndexes);
    newName = built.name;
    multiViewIndex = built.index;
  } else if (role === "highPoly") {
    newName = buildHighPolyName(prefix, ext, existingNames);
  } else {
    newName = buildLowPolyName(prefix, ext, existingNames);
  }

  removeTagByRelativePath(tags, oldRelative);

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
    ...(multiViewIndex ? { index: multiViewIndex } : {}),
  };

  await saveConceptTags(projectRoot, tags);

  return {
    path: renamedPath,
    name: newName,
    role,
    relativePath: newRelative,
  };
}
