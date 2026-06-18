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

/** 文件夹名以 _Terrain 结尾时推断为地形大类 */
export function inferAssetDomainFromFolderName(folderName: string): AssetDomain {
  if (/_Terrain$/i.test(folderName)) return "terrain";
  return DEFAULT_ASSET_DOMAIN;
}

/**
 * v0.6 旧 domain=scene 表示「地形模型」时代；无 _Terrain 后缀的也归入地形。
 * 未来完整场景资产使用 domain=scene 且名称不含 _Terrain 时保留 scene。
 */
export function migrateLegacyProjectDomain(project: ProjectLink): ProjectLink {
  if (project.domain !== "scene") return project;

  const label = `${project.displayName} ${project.conceptPath} ${project.blenderPath}`;
  if (/_Terrain/i.test(label)) {
    return { ...project, domain: "terrain" };
  }

  // 地形板块上线前创建的 scene 项目，默认迁移到 terrain
  return { ...project, domain: "terrain" };
}
