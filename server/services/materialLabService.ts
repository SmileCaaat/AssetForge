import fs from "fs/promises";
import path from "path";
import type { ProjectLink } from "../types.js";
import { loadTextureTags, syncTextureTagsFromFiles } from "../blenderTextureTags.js";
import type { TextureMapType } from "../blenderTextureTags.js";
import {
  DEFAULT_MATERIAL_LAB_PARAMS,
  DEFAULT_TERRAIN_MATERIAL_LAB_PARAMS,
  type MaterialLabParams,
  type MaterialLabState,
  type MaterialLabTextureSlot,
} from "../materialLabTypes.js";
import { normalizeAssetDomain } from "../assetDomains.js";
import { bundleHlslRelative } from "./unityExportPaths.js";

const META_DIR = ".asset-manager";
const STATE_FILE = "material_lab.json";

function stateFilePath(projectRoot: string): string {
  return path.join(projectRoot, META_DIR, STATE_FILE);
}

function emptySlot(unityProperty: string, colorSpace: MaterialLabTextureSlot["colorSpace"]): MaterialLabTextureSlot {
  return { path: "", unityProperty, colorSpace };
}

function sanitizePrefix(displayName: string): string {
  return displayName.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "").trim();
}

async function fileExists(projectRoot: string, relativePath: string): Promise<boolean> {
  if (!relativePath) return false;
  try {
    await fs.access(path.join(projectRoot, relativePath.split("/").join(path.sep)));
    return true;
  } catch {
    return false;
  }
}

async function findByTagType(
  projectRoot: string,
  tags: Record<string, { type: TextureMapType; relativePath: string }>,
  type: TextureMapType,
): Promise<string> {
  for (const entry of Object.values(tags)) {
    if (entry.type === type) return entry.relativePath.replace(/\\/g, "/");
  }
  return "";
}

async function findMetallicSmoothnessByName(projectRoot: string, displayName: string): Promise<string> {
  const prefix = sanitizePrefix(displayName);
  if (!prefix) return "";

  const texturesDir = path.join(projectRoot, "textures");
  try {
    const entries = await fs.readdir(texturesDir, { withFileTypes: true });
    const match = entries.find(
      (e) =>
        e.isFile() &&
        new RegExp(`^T_${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}_MetallicSmoothness\\.`, "i").test(e.name),
    );
    return match ? `textures/${match.name}` : "";
  } catch {
    return "";
  }
}

async function findExportModel(
  projectRoot: string,
  displayName: string,
  isTerrain: boolean,
): Promise<string> {
  const prefix = sanitizePrefix(displayName);
  const stem = isTerrain ? prefix.replace(/_Terrain$/i, "") : prefix;
  const candidates = isTerrain
    ? [
        `exports/SM_${stem}_Terrain.fbx`,
        `exports/SM_${prefix}.fbx`,
        `exports/${stem}.fbx`,
        `exports/${stem.toLowerCase()}.fbx`,
      ]
    : [`exports/SM_${prefix}.fbx`, `exports/SM_${prefix}_Low.fbx`];

  for (const rel of candidates) {
    if (await fileExists(projectRoot, rel)) return rel;
  }

  try {
    const exportsDir = path.join(projectRoot, "exports");
    const entries = await fs.readdir(exportsDir, { withFileTypes: true });
    const fbx = entries.find((e) => e.isFile() && e.name.toLowerCase().endsWith(".fbx"));
    return fbx ? `exports/${fbx.name}` : "";
  } catch {
    return "";
  }
}

export async function buildDefaultMaterialLabState(
  projectRoot: string,
  project: ProjectLink,
): Promise<MaterialLabState> {
  const isTerrain = normalizeAssetDomain(project.domain) === "terrain";

  let tagsFile = await loadTextureTags(projectRoot);
  tagsFile = await syncTextureTagsFromFiles(projectRoot, project.displayName, tagsFile);

  const tags = tagsFile.tags;
  const baseColor = (await findByTagType(projectRoot, tags, "BaseColor")) || "";
  const normal = isTerrain ? "" : (await findByTagType(projectRoot, tags, "Normal")) || "";
  const ao = isTerrain ? "" : (await findByTagType(projectRoot, tags, "AO")) || "";
  const emission = isTerrain ? "" : (await findByTagType(projectRoot, tags, "Emission")) || "";
  const metallicSmoothness = isTerrain
    ? ""
    : (await findByTagType(projectRoot, tags, "MetallicSmoothness")) ||
      (await findMetallicSmoothnessByName(projectRoot, project.displayName)) ||
      "";

  const modelPath = await findExportModel(projectRoot, project.displayName, isTerrain);
  const projectName = sanitizePrefix(project.displayName) || project.id;
  const defaultParams = isTerrain ? DEFAULT_TERRAIN_MATERIAL_LAB_PARAMS : DEFAULT_MATERIAL_LAB_PARAMS;

  return {
    version: 1,
    projectName,
    displayName: project.displayName,
    shaderType: isTerrain ? "toon_terrain_urp" : "toon_urp",
    preview: {
      modelPath,
      cameraMode: isTerrain ? "orbit" : "front",
      background: "checker",
    },
    textures: {
      baseColor: { path: baseColor, unityProperty: "_BaseMap", colorSpace: "sRGB" },
      normal: { path: normal, unityProperty: "_BumpMap", colorSpace: "Non-Color" },
      metallicSmoothness: {
        path: metallicSmoothness,
        unityProperty: "_MetallicGlossMap",
        colorSpace: "Non-Color",
      },
      ao: { path: ao, unityProperty: "_OcclusionMap", colorSpace: "Non-Color" },
      emission: { path: emission, unityProperty: "_EmissionMap", colorSpace: "sRGB" },
    },
    params: { ...defaultParams },
    slang: {
      enabled: !isTerrain,
      source: "server/templates/slang/ToonCore.slang",
      lastCompiledAt: "",
      generatedHlsl: bundleHlslRelative(projectName),
    },
    unity: {
      shaderName: isTerrain ? "AssetManagerTools/ToonTerrainURP" : "AssetManagerTools/ToonURP",
      renderPipeline: "URP",
      surfaceType: "Opaque",
      exportedAt: "",
    },
  };
}

function normalizeOutlineLodParams(params: MaterialLabParams): MaterialLabParams {
  let next = params;
  if (params.outlineMinWidth > params.outlineWidth * 2) {
    next = { ...next, outlineMinWidth: 0.001 };
  }
  // 旧版 Material Lab 默认（FarScale 0.25 / FadeStart 8）→ Unity 实测标准
  if (
    Math.abs(params.outlineFarWidthScale - 0.25) < 0.001 &&
    Math.abs(params.outlineFadeStart - 8) < 0.001
  ) {
    next = {
      ...next,
      outlineFarWidthScale: 0.01,
      outlineFadeStart: -20,
      outlineMinWidth: 0.001,
    };
  }
  return next;
}

function mergeMaterialLabParams(
  defaults: MaterialLabParams,
  parsed: Partial<MaterialLabParams> | undefined,
): MaterialLabParams {
  const p = parsed ?? {};
  return normalizeOutlineLodParams({
    ...defaults,
    ...p,
    baseColorTint: p.baseColorTint ?? defaults.baseColorTint,
    rimColor: p.rimColor ?? defaults.rimColor,
    outlineColor: p.outlineColor ?? defaults.outlineColor,
    celShadowColor: p.celShadowColor ?? defaults.celShadowColor,
    celHighlightColor: p.celHighlightColor ?? defaults.celHighlightColor,
    celHighlightPos: p.celHighlightPos ?? defaults.celHighlightPos,
    posterizeLevels: p.posterizeLevels ?? defaults.posterizeLevels,
    terrainRampBlend: p.terrainRampBlend ?? defaults.terrainRampBlend,
    terrainAlbedoInfluence: p.terrainAlbedoInfluence ?? defaults.terrainAlbedoInfluence,
    terrainNormalStrength: p.terrainNormalStrength ?? defaults.terrainNormalStrength,
    terrainAlbedoPosterize: p.terrainAlbedoPosterize ?? defaults.terrainAlbedoPosterize,
    terrainDistanceSmooth: p.terrainDistanceSmooth ?? defaults.terrainDistanceSmooth,
    terrainSlopeTint: p.terrainSlopeTint ?? defaults.terrainSlopeTint,
  });
}

export async function loadMaterialLabState(
  projectRoot: string,
  project: ProjectLink,
): Promise<{ state: MaterialLabState; created: boolean; warnings: string[] }> {
  const warnings: string[] = [];
  const isTerrain = normalizeAssetDomain(project.domain) === "terrain";
  try {
    const raw = await fs.readFile(stateFilePath(projectRoot), "utf-8");
    const parsed = JSON.parse(raw) as MaterialLabState;
    if (parsed.version !== 1) {
      warnings.push("material_lab.json 版本未知，已尝试合并默认字段。");
    }
    const defaults = await buildDefaultMaterialLabState(projectRoot, project);
    const shaderType =
      parsed.shaderType === "toon_terrain_urp" || parsed.shaderType === "toon_urp"
        ? parsed.shaderType
        : defaults.shaderType;
    if (isTerrain && shaderType !== "toon_terrain_urp") {
      warnings.push("地形项目已切换为 toon_terrain_urp profile。");
    }
    const state: MaterialLabState = {
      ...defaults,
      ...parsed,
      shaderType: isTerrain ? "toon_terrain_urp" : shaderType,
      textures: { ...defaults.textures, ...parsed.textures },
      params: mergeMaterialLabParams(defaults.params, parsed.params),
      preview: { ...defaults.preview, ...parsed.preview },
      slang: { ...defaults.slang, ...parsed.slang },
      unity: { ...defaults.unity, ...parsed.unity },
    };
    if (isTerrain) {
      state.unity.shaderName = "AssetManagerTools/ToonTerrainURP";
    }

    // Self-heal a stale preview model path (e.g. the FBX was renamed/typo'd on disk).
    if (state.preview.modelPath && !(await fileExists(projectRoot, state.preview.modelPath))) {
      if (defaults.preview.modelPath) {
        warnings.push(
          `预览模型「${state.preview.modelPath}」不存在，已自动改用「${defaults.preview.modelPath}」。`,
        );
        state.preview.modelPath = defaults.preview.modelPath;
      } else {
        warnings.push(`预览模型「${state.preview.modelPath}」不存在，且未找到可用的 exports FBX，已回退默认球体。`);
        state.preview.modelPath = "";
      }
    }

    return { state, created: false, warnings };
  } catch {
    const state = await buildDefaultMaterialLabState(projectRoot, project);
    return { state, created: true, warnings };
  }
}

export async function saveMaterialLabState(
  projectRoot: string,
  state: MaterialLabState,
): Promise<string> {
  const metaDir = path.join(projectRoot, META_DIR);
  await fs.mkdir(metaDir, { recursive: true });
  const rel = path.join(META_DIR, STATE_FILE).replace(/\\/g, "/");
  await fs.writeFile(stateFilePath(projectRoot), JSON.stringify(state, null, 2), "utf-8");
  return rel;
}

export function validateMaterialLabState(body: unknown): MaterialLabState {
  if (!body || typeof body !== "object") {
    throw new Error("Invalid material lab state");
  }
  const state = body as MaterialLabState;
  if (state.version !== 1) throw new Error("Unsupported material_lab.json version");
  if (!state.params || !state.textures) throw new Error("Missing params or textures");
  return state;
}
