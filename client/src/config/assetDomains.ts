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

export const ASSET_DOMAIN_LABELS: Record<AssetDomain, string> = {
  character: "角色",
  terrain: "地形",
  scene: "场景",
  prop: "道具",
  ui: "UI",
  vfx: "VFX",
};

/** Domains that can browse projects and create new ones. */
export const ASSET_DOMAIN_ENABLED: Record<AssetDomain, boolean> = {
  character: true,
  terrain: true,
  scene: false,
  prop: false,
  ui: false,
  vfx: false,
};

/** Domains shown greyed out and not selectable in the tab bar. */
export const ASSET_DOMAIN_LOCKED: Record<AssetDomain, boolean> = {
  character: false,
  terrain: false,
  scene: true,
  prop: true,
  ui: true,
  vfx: true,
};

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

/** Legacy session value: scene used to mean terrain in older builds. */
export function migrateLegacySessionDomain(value: string | null): AssetDomain | null {
  if (!value) return null;
  if (value === "scene") return "terrain";
  if (ASSET_DOMAIN_ORDER.includes(value as AssetDomain)) {
    return value as AssetDomain;
  }
  return null;
}
