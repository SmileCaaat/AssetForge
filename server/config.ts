import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import type {
  AppState,
  LegacyWorkspaceConfig,
  MasterWorkspace,
  ProjectLink,
} from "./types.js";
import { DEFAULT_ASSET_DOMAIN, migrateLegacyProjectDomain, normalizeAssetDomain } from "./assetDomains.js";
import { debugLog } from "./debugLog.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "data");
const CONFIG_PATH = path.join(DATA_DIR, "workspace.json");
const CONFIG_TMP_PATH = `${CONFIG_PATH}.tmp`;

/** Legacy bundled workspace — removed on load; use 打开/新建 to register real paths. */
export const LEGACY_DEFAULT_WORKSPACE_ID = "default";

const DEFAULT_STATE: AppState = {
  activeWorkspaceId: "",
  workspaces: [],
};

let cachedState: AppState | null = null;
let configLock: Promise<void> = Promise.resolve();

async function withConfigLock<T>(fn: () => Promise<T>): Promise<T> {
  const prev = configLock;
  let release!: () => void;
  configLock = new Promise<void>((resolve) => {
    release = resolve;
  });
  await prev;
  try {
    return await fn();
  } finally {
    release();
  }
}

function cloneState(state: AppState): AppState {
  return JSON.parse(JSON.stringify(state)) as AppState;
}

function isLegacyDefaultWorkspace(workspace: MasterWorkspace): boolean {
  return (
    workspace.id === LEGACY_DEFAULT_WORKSPACE_ID || workspace.name === "默认工作区"
  );
}

export function sanitizeAppState(state: AppState): AppState {
  const workspaces = state.workspaces.filter((w) => !isLegacyDefaultWorkspace(w));
  let activeWorkspaceId = state.activeWorkspaceId;
  if (!workspaces.some((w) => w.id === activeWorkspaceId)) {
    activeWorkspaceId = workspaces[0]?.id ?? "";
  }
  return { activeWorkspaceId, workspaces };
}

export function hasActiveWorkspace(state: AppState): boolean {
  return (
    state.workspaces.length > 0 &&
    Boolean(state.activeWorkspaceId) &&
    state.workspaces.some((w) => w.id === state.activeWorkspaceId)
  );
}

export async function ensureDataDir(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

function normalizeProject(project: Partial<ProjectLink> & { meshPath?: string }): ProjectLink {
  const base: ProjectLink = {
    id: project.id || `project-${Date.now()}`,
    displayName: project.displayName || "Unnamed",
    domain: normalizeAssetDomain(project.domain),
    conceptPath: project.conceptPath || project.meshPath || "",
    blenderPath: project.blenderPath || "",
    stage: project.stage || "concept",
  };
  return migrateLegacyProjectDomain(base);
}

function migrateLegacyConfig(raw: LegacyWorkspaceConfig): AppState {
  if (raw.workspaces && raw.activeWorkspaceId !== undefined) {
    return sanitizeAppState({
      activeWorkspaceId: raw.activeWorkspaceId,
      workspaces: raw.workspaces.map((workspace) => ({
        ...workspace,
        projects: (workspace.projects || []).map(normalizeProject),
      })),
    });
  }

  const projects = (raw.projects || []).map(normalizeProject);
  if (projects.length === 0 && !raw.meshRoot && !raw.blenderRoot) {
    return DEFAULT_STATE;
  }

  const legacyId =
    raw.workspaceId && raw.workspaceId !== LEGACY_DEFAULT_WORKSPACE_ID
      ? raw.workspaceId
      : "imported";

  return sanitizeAppState({
    activeWorkspaceId: legacyId,
    workspaces: [
      {
        id: legacyId,
        name: "Imported Workspace",
        rootPath: "",
        conceptRoot: raw.meshRoot || "",
        blenderRoot: raw.blenderRoot || "",
        projects,
      },
    ],
  });
}

function statesEqual(a: AppState, b: AppState): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

async function readConfigFromDisk(): Promise<AppState> {
  await ensureDataDir();
  const rawText = await fs.readFile(CONFIG_PATH, "utf-8");
  const raw = JSON.parse(rawText) as LegacyWorkspaceConfig;
  return migrateLegacyConfig(raw);
}

async function writeConfigToDisk(state: AppState): Promise<void> {
  await ensureDataDir();
  const sanitized = sanitizeAppState(state);
  const payload = JSON.stringify(sanitized, null, 2);
  await fs.writeFile(CONFIG_TMP_PATH, payload, "utf-8");
  await fs.rename(CONFIG_TMP_PATH, CONFIG_PATH);
  cachedState = cloneState(sanitized);
}

export async function loadConfig(options?: { forceReload?: boolean }): Promise<AppState> {
  return withConfigLock(async () => {
    if (cachedState && !options?.forceReload) {
      return cloneState(cachedState);
    }

    try {
      const state = await readConfigFromDisk();
      cachedState = cloneState(state);
      return cloneState(state);
    } catch (error) {
      if (cachedState) {
        debugLog("config", "disk read failed, using cache", { error: String(error) });
        return cloneState(cachedState);
      }

      debugLog("config", "disk read failed, using empty state", { error: String(error) });
      cachedState = cloneState(DEFAULT_STATE);
      return cloneState(DEFAULT_STATE);
    }
  });
}

export async function saveConfig(state: AppState): Promise<AppState> {
  return withConfigLock(async () => {
    const sanitized = sanitizeAppState(state);
    if (cachedState && statesEqual(sanitized, cachedState)) {
      return cloneState(sanitized);
    }
    await writeConfigToDisk(sanitized);
    return cloneState(sanitized);
  });
}

/** Persist sanitized config after migration / legacy cleanup (startup only). */
export async function persistConfigIfNeeded(): Promise<AppState> {
  return withConfigLock(async () => {
    try {
      const rawText = await fs.readFile(CONFIG_PATH, "utf-8");
      const raw = JSON.parse(rawText) as LegacyWorkspaceConfig;
      const migrated = migrateLegacyConfig(raw);
      const sanitized = sanitizeAppState({
        activeWorkspaceId: raw.activeWorkspaceId ?? "",
        workspaces: (raw.workspaces || []).map((workspace) => ({
          ...workspace,
          projects: workspace.projects || [],
        })),
      });
      if (!statesEqual(migrated, sanitized)) {
        await writeConfigToDisk(migrated);
        debugLog("config", "migrated workspace.json on disk");
        return cloneState(migrated);
      }
      cachedState = cloneState(migrated);
      return cloneState(migrated);
    } catch (error) {
      debugLog("config", "persistConfigIfNeeded failed", { error: String(error) });
      cachedState = cloneState(DEFAULT_STATE);
      return cloneState(DEFAULT_STATE);
    }
  });
}

export function normalizeId(name: string): string {
  return name
    .toLowerCase()
    .replace(/[\u4e00-\u9fff]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function createProjectLink(
  displayName: string,
  conceptFolderName: string,
  blenderProjectName: string,
  domain?: unknown,
): ProjectLink {
  return {
    id: normalizeId(displayName) || `project-${Date.now()}`,
    displayName,
    domain: normalizeAssetDomain(domain),
    conceptPath: conceptFolderName,
    blenderPath: `projects/${blenderProjectName}`,
    stage: "concept",
  };
}

export function findProject(state: AppState, projectId: string): ProjectLink {
  const workspace = state.workspaces.find((w) => w.id === state.activeWorkspaceId);
  const project = workspace?.projects.find((p) => p.id === projectId);
  if (!project) throw new Error("Project not found");
  return project;
}

export function updateActiveWorkspace(
  state: AppState,
  updater: (workspace: MasterWorkspace) => MasterWorkspace,
): AppState {
  return {
    ...state,
    workspaces: state.workspaces.map((workspace) =>
      workspace.id === state.activeWorkspaceId ? updater(workspace) : workspace,
    ),
  };
}
