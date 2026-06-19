import fs from "fs/promises";
import path from "path";
import type { MasterWorkspace, ProjectLink } from "../types.js";
import {
  DEFAULT_RIGGING_SETTINGS,
  type RiggingHealth,
  type RiggingJobState,
  type RiggingLabState,
  type RiggingSettings,
} from "../riggingTypes.js";
import { assertWithinRoots } from "../fileOperations.js";
import { resolveProjectPathAccessible } from "../projectPaths.js";
import { tagProductionAssetWithoutRename } from "../productionAssetTags.js";
import { getSkinTokensCliHealth, runSkinTokensCli } from "./skintokensCliExecutor.js";

const BPY_URL = process.env.AMT_SKINTOKENS_BPY_URL?.trim() || "http://127.0.0.1:18176";

const ALLOWED_INPUT_EXTENSIONS = new Set([".fbx", ".glb", ".gltf", ".obj"]);

function nowIso(): string {
  return new Date().toISOString();
}

function timestampForFile(date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    "_",
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join("");
}

function safeFilePart(value: string): string {
  return value
    .replace(/\.[^/.]+$/, "")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "")
    .replace(/\s+/g, "_")
    .trim()
    .slice(0, 80);
}

function normalizeSettings(input?: Partial<RiggingSettings>): RiggingSettings {
  const merged = { ...DEFAULT_RIGGING_SETTINGS, ...(input ?? {}) };
  const outputFormat = [".fbx", ".glb", ".obj"].includes(merged.outputFormat)
    ? merged.outputFormat
    : DEFAULT_RIGGING_SETTINGS.outputFormat;
  const boneNames = ["articulated", "mixamo", "ue5"].includes(merged.boneNames)
    ? merged.boneNames
    : DEFAULT_RIGGING_SETTINGS.boneNames;

  return {
    ...merged,
    topK: Math.max(1, Math.min(200, Number(merged.topK) || DEFAULT_RIGGING_SETTINGS.topK)),
    topP: Math.max(0.1, Math.min(1, Number(merged.topP) || DEFAULT_RIGGING_SETTINGS.topP)),
    temperature: Math.max(
      0.1,
      Math.min(2, Number(merged.temperature) || DEFAULT_RIGGING_SETTINGS.temperature),
    ),
    repetitionPenalty: Math.max(
      0.5,
      Math.min(3, Number(merged.repetitionPenalty) || DEFAULT_RIGGING_SETTINGS.repetitionPenalty),
    ),
    numBeams: Math.max(1, Math.min(20, Number(merged.numBeams) || DEFAULT_RIGGING_SETTINGS.numBeams)),
    outputFormat,
    boneNames,
    bpyServerMode: "Headless (Blender)",
  };
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

function createJobId(): string {
  return `rig_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeStoredJobs(jobs: unknown): RiggingJobState[] {
  if (!Array.isArray(jobs)) return [];
  const legacyTaskKey = "prompt" + "Id";
  const legacySnapshotKey = "output" + "Snapshot";
  return jobs
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    .filter((item) => !(legacyTaskKey in item) && !(legacySnapshotKey in item))
    .map((item) => ({
      id: String(item.id ?? ""),
      status: item.status as RiggingJobState["status"],
      inputPath: String(item.inputPath ?? ""),
      inputName: String(item.inputName ?? ""),
      executorOutputPath: typeof item.executorOutputPath === "string" ? item.executorOutputPath : undefined,
      projectOutputPath: typeof item.projectOutputPath === "string" ? item.projectOutputPath : undefined,
      projectOutputRelativePath:
        typeof item.projectOutputRelativePath === "string" ? item.projectOutputRelativePath : undefined,
      error: typeof item.error === "string" ? item.error : undefined,
      createdAt: String(item.createdAt ?? nowIso()),
      updatedAt: String(item.updatedAt ?? nowIso()),
    }))
    .filter((item) => item.id && item.inputPath && item.inputName)
    .slice(0, 30);
}

async function removeMissingCompletedJobs(jobs: RiggingJobState[]): Promise<RiggingJobState[]> {
  const kept: RiggingJobState[] = [];
  for (const job of jobs) {
    if (job.status === "completed" && job.projectOutputPath && !(await pathExists(job.projectOutputPath))) {
      continue;
    }
    kept.push(job);
  }
  return kept;
}

async function buildProjectOutputPath(input: {
  workspace: MasterWorkspace;
  project: ProjectLink;
  sourcePath: string;
  outputFormat: string;
  allowedRoots: string[];
}): Promise<{ outputPath: string; relativePath: string }> {
  const { projectRoot, outputDir } = await getRiggingPaths(input.workspace, input.project);
  await fs.mkdir(outputDir, { recursive: true });
  assertWithinRoots(outputDir, input.allowedRoots);

  const projectPart = safeFilePart(input.project.displayName) || "Project";
  const sourcePart = safeFilePart(path.basename(input.sourcePath)) || "Model";
  const fileName = `${projectPart}_${sourcePart}_Rigged_${timestampForFile()}${input.outputFormat}`;
  const outputPath = path.join(outputDir, fileName);
  assertWithinRoots(outputPath, input.allowedRoots);
  return {
    outputPath,
    relativePath: path.relative(projectRoot, outputPath).split(path.sep).join("/"),
  };
}

export async function getRiggingPaths(
  workspace: MasterWorkspace,
  project: ProjectLink,
): Promise<{ projectRoot: string; riggingRoot: string; outputDir: string; statePath: string }> {
  const projectRoot = await resolveProjectPathAccessible(workspace, project, "blender");
  const riggingRoot = path.join(projectRoot, "Rigging");
  const outputDir = path.join(riggingRoot, "output");
  const statePath = path.join(riggingRoot, "rigging_lab.json");
  return { projectRoot, riggingRoot, outputDir, statePath };
}

export async function loadRiggingState(
  workspace: MasterWorkspace,
  project: ProjectLink,
): Promise<RiggingLabState> {
  const { projectRoot, riggingRoot, outputDir, statePath } = await getRiggingPaths(workspace, project);
  await fs.mkdir(outputDir, { recursive: true });

  if (await pathExists(statePath)) {
    const parsed = JSON.parse(await fs.readFile(statePath, "utf-8")) as Partial<RiggingLabState>;
    const jobs = await removeMissingCompletedJobs(normalizeStoredJobs(parsed.jobs));
    const state = {
      projectId: project.id,
      projectName: project.displayName,
      projectRoot,
      outputDir,
      lastSettings: normalizeSettings(parsed.lastSettings),
      jobs,
    };
    if (jobs.length !== normalizeStoredJobs(parsed.jobs).length) {
      await fs.writeFile(statePath, JSON.stringify(state, null, 2), "utf-8");
    }
    return state;
  }

  await fs.mkdir(riggingRoot, { recursive: true });
  const state: RiggingLabState = {
    projectId: project.id,
    projectName: project.displayName,
    projectRoot,
    outputDir,
    lastSettings: DEFAULT_RIGGING_SETTINGS,
    jobs: [],
  };
  await saveRiggingState(workspace, project, state);
  return state;
}

export async function saveRiggingState(
  workspace: MasterWorkspace,
  project: ProjectLink,
  state: RiggingLabState,
): Promise<void> {
  const { riggingRoot, statePath } = await getRiggingPaths(workspace, project);
  await fs.mkdir(riggingRoot, { recursive: true });
  await fs.writeFile(statePath, JSON.stringify(state, null, 2), "utf-8");
}

export async function clearRiggingJobs(
  workspace: MasterWorkspace,
  project: ProjectLink,
): Promise<RiggingLabState> {
  const state = await loadRiggingState(workspace, project);
  state.jobs = [];
  await saveRiggingState(workspace, project, state);
  return state;
}

function validateInputMesh(inputMeshPath: string, allowedRoots: string[]): string {
  const inputPath = assertWithinRoots(inputMeshPath, allowedRoots);
  const ext = path.extname(inputPath).toLowerCase();
  if (!ALLOWED_INPUT_EXTENSIONS.has(ext)) {
    throw new Error("Rigging input must be .fbx, .glb, .gltf, or .obj");
  }
  return inputPath;
}

export async function startRiggingJob(input: {
  workspace: MasterWorkspace;
  project: ProjectLink;
  inputMeshPath: string;
  settings?: Partial<RiggingSettings>;
  allowedRoots: string[];
}): Promise<{ state: RiggingLabState; job: RiggingJobState }> {
  const inputPath = validateInputMesh(input.inputMeshPath, input.allowedRoots);
  if (!(await pathExists(inputPath))) throw new Error("Input mesh does not exist");

  const settings = normalizeSettings(input.settings);
  const state = await loadRiggingState(input.workspace, input.project);
  const at = nowIso();

  const jobId = createJobId();
  const output = await buildProjectOutputPath({
    workspace: input.workspace,
    project: input.project,
    sourcePath: inputPath,
    outputFormat: settings.outputFormat,
    allowedRoots: input.allowedRoots,
  });
  const job: RiggingJobState = {
    id: jobId,
    status: "running",
    inputPath,
    inputName: path.basename(inputPath),
    projectOutputPath: output.outputPath,
    projectOutputRelativePath: output.relativePath,
    createdAt: at,
    updatedAt: at,
  };

  state.lastSettings = settings;
  state.jobs = [job, ...state.jobs.filter((item) => item.id !== jobId)].slice(0, 30);
  await saveRiggingState(input.workspace, input.project, state);

  void runCliJobInBackground({
    workspace: input.workspace,
    project: input.project,
    jobId,
    inputPath,
    outputPath: output.outputPath,
    settings,
  });

  return { state, job };
}

async function runCliJobInBackground(input: {
  workspace: MasterWorkspace;
  project: ProjectLink;
  jobId: string;
  inputPath: string;
  outputPath: string;
  settings: RiggingSettings;
}): Promise<void> {
  try {
    await runSkinTokensCli({
      inputPath: input.inputPath,
      outputPath: input.outputPath,
      settings: input.settings,
    });

    const state = await loadRiggingState(input.workspace, input.project);
    const job = state.jobs.find((item) => item.id === input.jobId);
    if (!job) return;
    job.status = "completed";
    job.projectOutputPath = input.outputPath;
    job.projectOutputRelativePath = path.relative(state.projectRoot, input.outputPath).split(path.sep).join("/");
    job.updatedAt = nowIso();
    await tagProductionAssetWithoutRename({
      projectRoot: state.projectRoot,
      filePath: input.outputPath,
      role: "skeleton",
    });
    await saveRiggingState(input.workspace, input.project, state);
  } catch (error) {
    const state = await loadRiggingState(input.workspace, input.project);
    const job = state.jobs.find((item) => item.id === input.jobId);
    if (!job) return;
    job.status = "failed";
    job.error = error instanceof Error ? error.message : String(error);
    job.updatedAt = nowIso();
    await saveRiggingState(input.workspace, input.project, state);
  }
}

async function copySidecarFolder(sourceFile: string, destFile: string): Promise<void> {
  const sourceBase = sourceFile.replace(/\.[^/.]+$/, "");
  const sourceFolder = `${sourceBase}.fbm`;
  if (!(await pathExists(sourceFolder))) return;

  const destBase = destFile.replace(/\.[^/.]+$/, "");
  const destFolder = `${destBase}.fbm`;
  await fs.rm(destFolder, { recursive: true, force: true });
  await fs.cp(sourceFolder, destFolder, { recursive: true });
}

export async function syncLowPolyToRigInput(input: {
  workspace: MasterWorkspace;
  project: ProjectLink;
  sourcePath: string;
  allowedRoots: string[];
}): Promise<{ inputPath: string; relativePath: string }> {
  const sourcePath = assertWithinRoots(input.sourcePath, input.allowedRoots);
  if (!(await pathExists(sourcePath))) throw new Error("Low poly source file does not exist");

  const { projectRoot, riggingRoot } = await getRiggingPaths(input.workspace, input.project);
  const inputDir = path.join(riggingRoot, "input");
  await fs.mkdir(inputDir, { recursive: true });
  assertWithinRoots(inputDir, input.allowedRoots);

  const inputPath = path.join(inputDir, path.basename(sourcePath));
  assertWithinRoots(inputPath, input.allowedRoots);
  await fs.copyFile(sourcePath, inputPath);
  await copySidecarFolder(sourcePath, inputPath);
  await tagProductionAssetWithoutRename({
    projectRoot,
    filePath: inputPath,
    role: "lowPoly",
  });

  return {
    inputPath,
    relativePath: path.relative(projectRoot, inputPath).split(path.sep).join("/"),
  };
}

export async function refreshRiggingJob(input: {
  workspace: MasterWorkspace;
  project: ProjectLink;
  jobId: string;
  allowedRoots: string[];
}): Promise<{ state: RiggingLabState; job: RiggingJobState }> {
  const state = await loadRiggingState(input.workspace, input.project);
  const job = state.jobs.find((item) => item.id === input.jobId);
  if (!job) throw new Error("Rigging job not found");

  return { state, job };
}

export async function getRiggingHealth(): Promise<RiggingHealth> {
  const cli = await getSkinTokensCliHealth();

  let bpyOk = cli.bpyMode !== "existing" && cli.ok;
  let bpyError: string | undefined;
  if (cli.bpyMode === "existing") {
    try {
      const res = await fetch(`${BPY_URL}/ping`);
      const text = await res.text();
      bpyOk = res.ok && text.toLowerCase().includes("pong");
      if (!bpyOk) bpyError = `Unexpected bpy response: ${text || res.statusText}`;
    } catch (error) {
      bpyError = error instanceof Error ? error.message : String(error);
    }
  }

  const models = {
    skintokensCheckpoint: await pathExists(cli.modelCheckpoint),
    skinVae: await pathExists(cli.skinVae),
    qwenConfig: await pathExists(cli.qwenConfig),
  };

  return {
    ok: cli.ok && bpyOk && models.skintokensCheckpoint && models.skinVae && models.qwenConfig,
    runtime: {
      ok: cli.ok,
      name: "SkinTokens Runtime",
      python: cli.python,
      skintokensRoot: cli.skintokensRoot,
      runtimeRoot: cli.runtimeRoot,
      blenderExe: cli.blenderExe,
      bpyMode: cli.bpyMode,
      queueRunning: 0,
      queuePending: 0,
      error: cli.error,
    },
    bpy: {
      ok: bpyOk,
      url: BPY_URL,
      error: bpyError,
    },
    models,
  };
}
