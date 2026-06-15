import fs from "fs/promises";
import path from "path";
import type { FileNode, MasterWorkspace, ProjectLink } from "./types.js";
import { normalizeId } from "./config.js";
import { getBlenderRoot, getConceptRoot } from "./workspacePaths.js";

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp"]);
const MODEL_EXTENSIONS = new Set([".fbx", ".glb", ".gltf", ".obj"]);
const BLEND_EXTENSIONS = new Set([".blend"]);

export function getExtension(filename: string): string {
  return path.extname(filename).toLowerCase();
}

export function isPreviewableImage(filename: string): boolean {
  return IMAGE_EXTENSIONS.has(getExtension(filename));
}

export function isPreviewableModel(filename: string): boolean {
  return MODEL_EXTENSIONS.has(getExtension(filename));
}

export function isBlendFile(filename: string): boolean {
  return BLEND_EXTENSIONS.has(getExtension(filename));
}

function scoreMatch(a: string, b: string): number {
  const na = normalizeId(a);
  const nb = normalizeId(b);
  if (!na || !nb) return 0;
  if (na === nb) return 100;
  if (na.includes(nb) || nb.includes(na)) return 80;
  return 0;
}

export async function listDirectories(root: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(root, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }
}

export async function discoverUnlinkedProjects(workspace: MasterWorkspace): Promise<{
  conceptOnly: string[];
  blenderOnly: string[];
}> {
  const conceptDirs = await listDirectories(getConceptRoot(workspace));
  const blenderDirs = (await listDirectories(path.join(getBlenderRoot(workspace), "projects"))).map(
    (name) => `projects/${name}`,
  );

  const linkedConcept = new Set(workspace.projects.map((p) => p.conceptPath));
  const linkedBlender = new Set(workspace.projects.map((p) => p.blenderPath));

  return {
    conceptOnly: conceptDirs.filter((d) => !linkedConcept.has(d)),
    blenderOnly: blenderDirs.filter((d) => !linkedBlender.has(d)),
  };
}

export async function suggestProjectLinks(workspace: MasterWorkspace): Promise<ProjectLink[]> {
  const conceptDirs = await listDirectories(getConceptRoot(workspace));
  const blenderDirs = await listDirectories(path.join(getBlenderRoot(workspace), "projects"));
  const suggestions: ProjectLink[] = [];

  for (const conceptName of conceptDirs) {
    let best: { name: string; score: number } | null = null;
    for (const blenderName of blenderDirs) {
      const score = scoreMatch(conceptName, blenderName);
      if (score > 0 && (!best || score > best.score)) {
        best = { name: blenderName, score };
      }
    }
    if (best && best.score >= 80) {
      suggestions.push({
        id: normalizeId(conceptName) || normalizeId(best.name),
        displayName: best.name,
        conceptPath: conceptName,
        blenderPath: `projects/${best.name}`,
        stage: "production",
      });
    }
  }

  return suggestions;
}

export async function buildFileTree(
  absolutePath: string,
  relativePath = "",
  maxDepth = 6,
  depth = 0,
): Promise<FileNode | null> {
  try {
    const stat = await fs.stat(absolutePath);
    const name = path.basename(absolutePath);

    if (!stat.isDirectory()) {
      return {
        name,
        path: absolutePath,
        relativePath,
        isDirectory: false,
        extension: getExtension(name),
        size: stat.size,
        modifiedAt: stat.mtime.toISOString(),
      };
    }

    if (depth >= maxDepth) {
      return {
        name,
        path: absolutePath,
        relativePath,
        isDirectory: true,
        children: [],
      };
    }

    const entries = await fs.readdir(absolutePath, { withFileTypes: true });
    const children: FileNode[] = [];

    const sorted = entries.sort((a, b) => {
      if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
      return a.name.localeCompare(b.name, "zh-CN");
    });

    for (const entry of sorted) {
      const childAbs = path.join(absolutePath, entry.name);
      const childRel = relativePath ? `${relativePath}/${entry.name}` : entry.name;
      const child = await buildFileTree(childAbs, childRel, maxDepth, depth + 1);
      if (child) children.push(child);
    }

    return {
      name,
      path: absolutePath,
      relativePath,
      isDirectory: true,
      children,
      modifiedAt: stat.mtime.toISOString(),
    };
  } catch {
    return null;
  }
}

export async function collectPreviewableFiles(
  root: string,
  relativeRoot = "",
): Promise<FileNode[]> {
  const results: FileNode[] = [];

  async function walk(abs: string, rel: string) {
    let entries;
    try {
      entries = await fs.readdir(abs, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const childAbs = path.join(abs, entry.name);
      const childRel = rel ? `${rel}/${entry.name}` : entry.name;

      if (entry.isDirectory()) {
        await walk(childAbs, childRel);
        continue;
      }

      if (
        isPreviewableImage(entry.name) ||
        isPreviewableModel(entry.name) ||
        isBlendFile(entry.name)
      ) {
        const stat = await fs.stat(childAbs);
        results.push({
          name: entry.name,
          path: childAbs,
          relativePath: childRel,
          isDirectory: false,
          extension: getExtension(entry.name),
          size: stat.size,
          modifiedAt: stat.mtime.toISOString(),
        });
      }
    }
  }

  await walk(root, relativeRoot);
  return results.sort((a, b) => a.relativePath.localeCompare(b.relativePath, "zh-CN"));
}

export function resolveProjectPath(
  workspace: MasterWorkspace,
  project: ProjectLink,
  side: "concept" | "blender",
): string {
  return side === "concept"
    ? path.join(getConceptRoot(workspace), project.conceptPath)
    : path.join(getBlenderRoot(workspace), project.blenderPath);
}
