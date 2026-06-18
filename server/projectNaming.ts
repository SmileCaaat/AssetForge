import { normalizeAssetDomain } from "./assetDomains.js";

export const TERRAIN_NAME_SUFFIX = "_Terrain";

export function toBlenderProjectName(name: string): string {
  return name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "").trim();
}

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

export function normalizeProjectNamesForCreate(
  input: {
    displayName: string;
    conceptFolderName: string;
    blenderProjectName: string;
    domain?: unknown;
  },
) {
  const domain = normalizeAssetDomain(input.domain);

  const apply = (raw: string) => {
    let name = capitalizeFirstLetter(toBlenderProjectName(raw));
    if (!name) return "";
    if (domain === "terrain") name = ensureTerrainSuffix(name);
    return name;
  };

  return {
    displayName: apply(input.displayName),
    conceptFolderName: apply(input.conceptFolderName),
    blenderProjectName: apply(input.blenderProjectName),
  };
}
