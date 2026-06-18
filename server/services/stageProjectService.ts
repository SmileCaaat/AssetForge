import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import type {
  CreateStageInput,
  StageJson,
  StageSummary,
  StageTextureSlot,
  StageTextureStatus,
} from "../stageTypes.js";
import { STAGE_JSON_VERSION, STAGE_TEXTURE_SLOTS } from "../stageTypes.js";
import { assertPathInsideRoot } from "../pathSecurity.js";
import { getTerrainRoot } from "../workspacePaths.js";
import { mirrorStageTextureToConcept } from "./stageConceptMirror.js";
import type { MasterWorkspace } from "../types.js";

export { getTerrainRoot };

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = path.join(__dirname, "..", "templates", "terrain");

const STAGE_SUBDIRS = [".asset-manager", "textures", "prompts", "exports", "preview"];

const TEXTURE_FILE_SUFFIX: Record<StageTextureSlot, string> = {
  baseColor: "BaseColor",
  semanticControl: "SemanticControl",
};

export function getStagesRoot(terrainRoot: string): string {
  return path.join(terrainRoot, "stages");
}

export function sanitizeStageName(raw: string): string {
  const cleaned = raw.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "").trim();
  if (!cleaned) return "";
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

function textureRelPath(stageName: string, slot: StageTextureSlot): string {
  return `textures/T_${stageName}_${TEXTURE_FILE_SUFFIX[slot]}.png`;
}

function computeActualGroundSize(width: number, height: number) {
  return {
    width: width * 1.125,
    height: height * 1.125,
    unit: "unity",
  };
}

function emptyTextures(stageName: string): StageJson["textures"] {
  return {
    baseColor: textureRelPath(stageName, "baseColor"),
    semanticControl: textureRelPath(stageName, "semanticControl"),
  };
}

async function loadStageDefaults() {
  return readJsonFile<{
    stageType: string;
    aspect: "16:9";
    worldSize: { width: number; height: number; unit: string };
    resolution: { width: number; height: number };
    promptProfile: StageJson["promptProfile"];
  }>(path.join(TEMPLATES_DIR, "stage_defaults.json"));
}

function stageMetaPath(stageRoot: string): string {
  return path.join(stageRoot, ".asset-manager", "stage.json");
}

export function resolveStageRoot(terrainRoot: string, stageName: string): string {
  const safeName = sanitizeStageName(stageName);
  if (!safeName) throw new Error("Invalid stage name");
  const stageRoot = path.join(getStagesRoot(terrainRoot), safeName);
  assertPathInsideRoot(stageRoot, terrainRoot);
  return stageRoot;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJsonFile<T>(filePath: string): Promise<T> {
  const raw = await fs.readFile(filePath, "utf-8");
  return JSON.parse(raw) as T;
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
}

function asWorldSize(v: unknown, fallback: StageJson["worldSize"]): StageJson["worldSize"] {
  const o = asRecord(v);
  const width = Number(o.width);
  const height = Number(o.height);
  if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
    return { width, height, unit: typeof o.unit === "string" ? o.unit : "unity" };
  }
  return fallback;
}

function asResolution(v: unknown, fallback: StageJson["resolution"]): StageJson["resolution"] {
  const o = asRecord(v);
  const width = Number(o.width);
  const height = Number(o.height);
  if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
    return { width, height };
  }
  return fallback;
}

function asPromptProfile(
  v: unknown,
  fallback: StageJson["promptProfile"],
): StageJson["promptProfile"] {
  const o = asRecord(v);
  return {
    style: typeof o.style === "string" ? o.style : fallback.style,
    camera: typeof o.camera === "string" ? o.camera : fallback.camera,
    outputType: typeof o.outputType === "string" ? o.outputType : fallback.outputType,
  };
}

/** v1 / 胖模型 → stage.json v2（仅 SemanticControl + BaseColor） */
export function migrateStageJson(raw: unknown, defaults?: Awaited<ReturnType<typeof loadStageDefaults>>): StageJson {
  const r = asRecord(raw);
  const stageName = sanitizeStageName(String(r.stageName ?? ""));
  if (!stageName) throw new Error("Invalid stage.json: missing stageName");

  const def = defaults;
  const worldSize = asWorldSize(r.worldSize, def?.worldSize ?? { width: 32, height: 18, unit: "unity" });
  const texturesRaw = asRecord(r.textures);

  return {
    version: STAGE_JSON_VERSION,
    stageName,
    displayName: String(r.displayName ?? stageName).trim() || stageName,
    stageType: typeof r.stageType === "string" ? r.stageType : def?.stageType ?? "ruin_road",
    aspect: "16:9",
    worldSize,
    actualGroundSize: asWorldSize(r.actualGroundSize, computeActualGroundSize(worldSize.width, worldSize.height)),
    resolution: asResolution(r.resolution, def?.resolution ?? { width: 2048, height: 1152 }),
    textures: {
      baseColor:
        typeof texturesRaw.baseColor === "string"
          ? texturesRaw.baseColor
          : textureRelPath(stageName, "baseColor"),
      semanticControl:
        typeof texturesRaw.semanticControl === "string"
          ? texturesRaw.semanticControl
          : textureRelPath(stageName, "semanticControl"),
    },
    palette: typeof r.palette === "string" ? r.palette : "semantic_palette.json",
    promptProfile: asPromptProfile(r.promptProfile, def?.promptProfile ?? {
      style: "lowpoly_toon_ruins",
      camera: "top_down_orthographic",
      outputType: "basecolor_only",
    }),
    updatedAt: typeof r.updatedAt === "string" ? r.updatedAt : new Date().toISOString(),
  };
}

export function normalizeStageJson(stage: StageJson): StageJson {
  return migrateStageJson(stage);
}

export async function getStageTextureStatus(
  stageRoot: string,
  stage: StageJson,
): Promise<StageTextureStatus> {
  const status = {} as StageTextureStatus;
  for (const slot of STAGE_TEXTURE_SLOTS) {
    const rel = stage.textures[slot];
    const abs = path.join(stageRoot, rel.split("/").join(path.sep));
    status[slot] = await fileExists(abs);
  }
  return status;
}

export async function listStages(terrainRoot: string): Promise<StageSummary[]> {
  const stagesRoot = getStagesRoot(terrainRoot);
  await fs.mkdir(stagesRoot, { recursive: true });

  let entries: string[] = [];
  try {
    const dirs = await fs.readdir(stagesRoot, { withFileTypes: true });
    entries = dirs.filter((d) => d.isDirectory()).map((d) => d.name);
  } catch {
    return [];
  }

  const summaries: StageSummary[] = [];
  for (const name of entries) {
    const metaPath = stageMetaPath(path.join(stagesRoot, name));
    if (!(await fileExists(metaPath))) continue;
    try {
      const raw = await readJsonFile<unknown>(metaPath);
      const defaults = await loadStageDefaults();
      const stage = migrateStageJson(raw, defaults);
      if (asRecord(raw).version !== STAGE_JSON_VERSION) {
        await saveStage(terrainRoot, stage);
      }
      const stageDir = path.join(stagesRoot, name);
      const texStatus = await getStageTextureStatus(stageDir, stage);
      summaries.push({
        stageName: stage.stageName,
        displayName: stage.displayName,
        stageType: stage.stageType,
        updatedAt: stage.updatedAt,
        hasBaseColor: texStatus.baseColor,
        hasSemanticControl: texStatus.semanticControl,
      });
    } catch {
      /* skip invalid */
    }
  }

  summaries.sort((a, b) => a.stageName.localeCompare(b.stageName));
  return summaries;
}

export async function loadStage(
  terrainRoot: string,
  stageName: string,
): Promise<{ stage: StageJson; stageRoot: string; created: boolean }> {
  const stageRoot = resolveStageRoot(terrainRoot, stageName);
  const metaPath = stageMetaPath(stageRoot);

  if (await fileExists(metaPath)) {
    const raw = await readJsonFile<unknown>(metaPath);
    const defaults = await loadStageDefaults();
    const stage = migrateStageJson(raw, defaults);
    if (asRecord(raw).version !== STAGE_JSON_VERSION) {
      await saveStage(terrainRoot, stage);
    }
    return { stage, stageRoot, created: false };
  }

  throw new Error(`Stage not found: ${stageName}`);
}

export async function createStage(
  terrainRoot: string,
  input: CreateStageInput,
): Promise<{ stage: StageJson; stageRoot: string }> {
  const stageName = sanitizeStageName(input.stageName);
  if (!stageName) throw new Error("stageName is required");

  const stageRoot = resolveStageRoot(terrainRoot, stageName);
  if (await fileExists(stageMetaPath(stageRoot))) {
    throw new Error(`Stage already exists: ${stageName}`);
  }

  const defaults = await loadStageDefaults();
  const worldWidth = input.worldSize?.width ?? defaults.worldSize.width;
  const worldHeight = input.worldSize?.height ?? defaults.worldSize.height;

  for (const dir of STAGE_SUBDIRS) {
    await fs.mkdir(path.join(stageRoot, dir), { recursive: true });
  }

  const paletteTemplate = path.join(TEMPLATES_DIR, "semantic_palette.json");
  const paletteDest = path.join(stageRoot, ".asset-manager", "semantic_palette.json");
  await fs.copyFile(paletteTemplate, paletteDest);

  const stage: StageJson = {
    version: STAGE_JSON_VERSION,
    stageName,
    displayName: input.displayName?.trim() || stageName,
    stageType: input.stageType || defaults.stageType,
    aspect: defaults.aspect,
    worldSize: { width: worldWidth, height: worldHeight, unit: "unity" },
    actualGroundSize: computeActualGroundSize(worldWidth, worldHeight),
    resolution: input.resolution ?? defaults.resolution,
    textures: emptyTextures(stageName),
    palette: "semantic_palette.json",
    promptProfile: { ...defaults.promptProfile },
    updatedAt: new Date().toISOString(),
  };

  await saveStage(terrainRoot, stage);
  return { stage, stageRoot };
}

export async function saveStage(terrainRoot: string, stage: StageJson): Promise<string> {
  const stageRoot = resolveStageRoot(terrainRoot, stage.stageName);
  const metaPath = stageMetaPath(stageRoot);
  assertPathInsideRoot(metaPath, terrainRoot);

  const next: StageJson = normalizeStageJson({
    ...stage,
    updatedAt: new Date().toISOString(),
  });

  await fs.mkdir(path.dirname(metaPath), { recursive: true });
  await fs.writeFile(metaPath, JSON.stringify(next, null, 2), "utf-8");
  return metaPath;
}

const PALETTE_V2_STONE: Record<
  string,
  { label: string; hex: string; description: string }
> = {
  stone_road: {
    label: "石质通道",
    hex: "#6E6A62",
    description: "台地之间的连接通道、主走线，略低于台地",
  },
  stone_platform: {
    label: "石质台地",
    hex: "#D5CFC0",
    description: "独立块状石质台地、遗迹庭院、战斗站位区，高于通道",
  },
};

function applyPaletteV2Patches(palette: {
  version: 1;
  colors: Array<{ id: string; label?: string; hex?: string; description?: string }>;
}): boolean {
  let changed = false;
  for (const c of palette.colors) {
    const patch = PALETTE_V2_STONE[c.id];
    if (!patch) continue;
    if (c.hex?.toUpperCase() !== patch.hex || c.label !== patch.label) {
      Object.assign(c, patch);
      changed = true;
    }
  }
  return changed;
}

export async function loadStagePalette(
  terrainRoot: string,
  stageName: string,
): Promise<{ version: 1; colors: unknown[] }> {
  const { stage, stageRoot } = await loadStage(terrainRoot, stageName);
  const paletteRel = stage.palette || "semantic_palette.json";
  const palettePath = path.join(stageRoot, ".asset-manager", path.basename(paletteRel));
  assertPathInsideRoot(palettePath, terrainRoot);
  if (!(await fileExists(palettePath))) {
    const template = path.join(TEMPLATES_DIR, "semantic_palette.json");
    return readJsonFile(template);
  }
  const palette = await readJsonFile<{ version: 1; colors: unknown[] }>(palettePath);
  if (applyPaletteV2Patches(palette as Parameters<typeof applyPaletteV2Patches>[0])) {
    await fs.writeFile(palettePath, JSON.stringify(palette, null, 2), "utf-8");
  }
  return palette;
}

export async function deleteStage(terrainRoot: string, stageName: string): Promise<void> {
  const stageRoot = resolveStageRoot(terrainRoot, stageName);
  const stagesRoot = getStagesRoot(terrainRoot);
  assertPathInsideRoot(stageRoot, terrainRoot);
  if (path.resolve(path.dirname(stageRoot)) !== path.resolve(stagesRoot)) {
    throw new Error("Invalid stage path");
  }
  if (!(await fileExists(stageMetaPath(stageRoot)))) {
    throw new Error(`Stage not found: ${stageName}`);
  }
  await fs.rm(stageRoot, { recursive: true, force: true });
}

export async function uploadStageTexture(
  terrainRoot: string,
  stageName: string,
  slot: StageTextureSlot,
  fileBuffer: Buffer,
  mirror?: { workspace: MasterWorkspace; conceptProjectRel: string },
): Promise<{ relativePath: string; absolutePath: string; conceptMirrorPath?: string }> {
  const { stage, stageRoot } = await loadStage(terrainRoot, stageName);
  const relPath = stage.textures[slot];
  if (!relPath) throw new Error(`Unknown texture slot: ${slot}`);

  const absPath = path.join(stageRoot, relPath.split("/").join(path.sep));
  assertPathInsideRoot(absPath, terrainRoot);
  await fs.mkdir(path.dirname(absPath), { recursive: true });
  await fs.writeFile(absPath, fileBuffer);

  stage.textures[slot] = relPath;
  await saveStage(terrainRoot, stage);

  let conceptMirrorPath: string | undefined;
  if (mirror?.conceptProjectRel?.trim()) {
    const mirrored = await mirrorStageTextureToConcept(
      mirror.workspace,
      mirror.conceptProjectRel,
      stageName,
      slot,
      path.basename(relPath),
      fileBuffer,
    );
    if (mirrored) conceptMirrorPath = mirrored;
  }

  return { relativePath: relPath, absolutePath: absPath, conceptMirrorPath };
}
