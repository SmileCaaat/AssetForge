import type { AssetDomain } from "../config/assetDomains";

export const TERRAIN_NAME_SUFFIX = "_Terrain";

export function toBlenderProjectName(name: string): string {
  return name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "").trim();
}

/** 首字母大写，避免 stonemork → 忘记写成 Stonemork */
export function capitalizeFirstLetter(name: string): string {
  if (!name) return name;
  return name.charAt(0).toUpperCase() + name.slice(1);
}

export function ensureTerrainSuffix(name: string): string {
  if (/_terrain$/i.test(name)) {
    return name.replace(/_terrain$/i, TERRAIN_NAME_SUFFIX);
  }
  return `${name}${TERRAIN_NAME_SUFFIX}`;
}

export function deriveProjectNames(projectName: string, domain: AssetDomain) {
  let base = capitalizeFirstLetter(toBlenderProjectName(projectName));
  if (!base) {
    return {
      displayName: "",
      blenderProjectName: "",
      conceptFolderName: "",
    };
  }

  if (domain === "terrain") {
    base = ensureTerrainSuffix(base);
  }

  return {
    displayName: base,
    blenderProjectName: base,
    conceptFolderName: base,
  };
}
