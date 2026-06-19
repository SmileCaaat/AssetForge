import type { ProjectLink } from "./types.js";

export type AssetDomain = "character" | "terrain" | "scene" | "prop" | "ui" | "vfx";

export const DEFAULT_ASSET_DOMAIN: AssetDomain = "character";

export const ASSET_DOMAIN_ORDER: AssetDomain[] = [
  "character",
  "terrain",
  "scene",
  "prop",
  "ui",
  "vfx",
];

export function normalizeAssetDomain(value: unknown): AssetDomain {
  if (
    value === "character" ||
    value === "terrain" ||
    value === "scene" ||
    value === "prop" ||
    value === "ui" ||
    value === "vfx"
  ) {
    return value;
  }
  return DEFAULT_ASSET_DOMAIN;
}

/** Folder names ending in _Terrain are inferred as terrain projects. */
export function inferAssetDomainFromFolderName(folderName: string): AssetDomain {
  if (/_Terrain$/i.test(folderName)) return "terrain";
  return DEFAULT_ASSET_DOMAIN;
}

/**
 * In older builds, domain=scene represented terrain assets. Keep migrating
 * those records to terrain so the current terrain board owns them.
 */
export function migrateLegacyProjectDomain(project: ProjectLink): ProjectLink {
  if (project.domain !== "scene") return project;

  const label = `${project.displayName} ${project.conceptPath} ${project.blenderPath}`;
  if (/_Terrain/i.test(label)) {
    return { ...project, domain: "terrain" };
  }

  return { ...project, domain: "terrain" };
}
