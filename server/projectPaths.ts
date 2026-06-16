import fs from "fs/promises";
import path from "path";
import { normalizeId } from "./config.js";
import { listDirectories } from "./scanner.js";
import type { MasterWorkspace, ProjectLink } from "./types.js";
import { getBlenderRoot, getConceptRoot } from "./workspacePaths.js";

function scoreMatch(a: string, b: string): number {
  const na = normalizeId(a);
  const nb = normalizeId(b);
  if (!na || !nb) return 0;
  if (na === nb) return 100;
  if (na.includes(nb) || nb.includes(na)) return 80;
  return 0;
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

function toRelativePosix(root: string, absolute: string): string {
  return path.relative(root, absolute).split(path.sep).join("/");
}

export async function resolveProjectPathAccessible(
  workspace: MasterWorkspace,
  project: ProjectLink,
  side: "concept" | "blender",
): Promise<string> {
  const primary =
    side === "concept"
      ? path.join(getConceptRoot(workspace), project.conceptPath)
      : path.join(getBlenderRoot(workspace), project.blenderPath);

  if (await pathExists(primary)) return primary;

  if (side === "concept") {
    const conceptRoot = getConceptRoot(workspace);
    const dirs = await listDirectories(conceptRoot);
    let best: { name: string; score: number } | null = null;
    for (const name of dirs) {
      const score = Math.max(
        scoreMatch(name, project.conceptPath),
        scoreMatch(name, project.displayName),
      );
      if (score > 0 && (!best || score > best.score)) {
        best = { name, score };
      }
    }
    if (best && best.score >= 80) {
      return path.join(conceptRoot, best.name);
    }
  } else {
    const projectsDir = path.join(getBlenderRoot(workspace), "projects");
    const dirs = await listDirectories(projectsDir);
    const blenderName = project.blenderPath.replace(/^projects[/\\]/i, "");
    let best: { name: string; score: number } | null = null;
    for (const name of dirs) {
      const score = Math.max(
        scoreMatch(name, blenderName),
        scoreMatch(name, project.displayName),
      );
      if (score > 0 && (!best || score > best.score)) {
        best = { name, score };
      }
    }
    if (best && best.score >= 80) {
      return path.join(projectsDir, best.name);
    }
  }

  return primary;
}

export async function repairProjectLinks(workspace: MasterWorkspace): Promise<{
  workspace: MasterWorkspace;
  repaired: ProjectLink[];
}> {
  const repaired: ProjectLink[] = [];
  const projects = await Promise.all(
    workspace.projects.map(async (project) => {
      let next = project;

      const conceptAbs = await resolveProjectPathAccessible(workspace, project, "concept");
      const conceptRel = toRelativePosix(getConceptRoot(workspace), conceptAbs);
      if (conceptRel && !conceptRel.startsWith("..") && conceptRel !== project.conceptPath) {
        next = { ...next, conceptPath: conceptRel };
      }

      const blenderRoot = getBlenderRoot(workspace);
      const blenderAbs = await resolveProjectPathAccessible(workspace, next, "blender");
      const blenderFolderName = path.basename(blenderAbs);
      const blenderPath = `projects/${blenderFolderName}`;
      if (blenderPath !== next.blenderPath) {
        next = { ...next, blenderPath };
      }

      if (next.conceptPath !== project.conceptPath || next.blenderPath !== project.blenderPath) {
        repaired.push(next);
      }
      return next;
    }),
  );

  return {
    workspace: { ...workspace, projects },
    repaired,
  };
}
