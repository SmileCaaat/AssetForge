import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import type {
  AppState,
  LegacyWorkspaceConfig,
  MasterWorkspace,
  ProjectLink,
} from "./types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "data");
const CONFIG_PATH = path.join(DATA_DIR, "workspace.json");

const DEFAULT_LEGACY_PROJECTS: ProjectLink[] = [
  {
    id: "punchgob",
    displayName: "Punchgob",
    conceptPath: "Punchgob庞哥布",
    blenderPath: "projects/Punchgob",
    stage: "production",
  },
  {
    id: "stonemork",
    displayName: "StoneMork",
    conceptPath: "StoneMork石莫克",
    blenderPath: "projects/stonemork",
    stage: "production",
  },
];

const DEFAULT_STATE: AppState = {
  activeWorkspaceId: "default",
  workspaces: [
    {
      id: "default",
      name: "默认工作区",
      rootPath: "",
      conceptRoot: "C:\\Users\\JamLew\\Desktop\\Meshworkspace",
      blenderRoot: "D:\\blenderworkspace",
      projects: DEFAULT_LEGACY_PROJECTS,
    },
  ],
};

export async function ensureDataDir(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

function normalizeProject(project: Partial<ProjectLink> & { meshPath?: string }): ProjectLink {
  return {
    id: project.id || `project-${Date.now()}`,
    displayName: project.displayName || "Unnamed",
    conceptPath: project.conceptPath || project.meshPath || "",
    blenderPath: project.blenderPath || "",
    stage: project.stage || "concept",
  };
}

function migrateLegacyConfig(raw: LegacyWorkspaceConfig): AppState {
  if (raw.workspaces && raw.activeWorkspaceId) {
    return {
      activeWorkspaceId: raw.activeWorkspaceId,
      workspaces: raw.workspaces.map((workspace) => ({
        ...workspace,
        projects: (workspace.projects || []).map(normalizeProject),
      })),
    };
  }

  const projects = (raw.projects || DEFAULT_LEGACY_PROJECTS).map(normalizeProject);

  return {
    activeWorkspaceId: raw.workspaceId || "default",
    workspaces: [
      {
        id: raw.workspaceId || "default",
        name: "默认工作区",
        rootPath: "",
        conceptRoot: raw.meshRoot || DEFAULT_STATE.workspaces[0].conceptRoot,
        blenderRoot: raw.blenderRoot || DEFAULT_STATE.workspaces[0].blenderRoot,
        projects,
      },
    ],
  };
}

export async function loadConfig(): Promise<AppState> {
  await ensureDataDir();
  try {
    const raw = JSON.parse(await fs.readFile(CONFIG_PATH, "utf-8")) as LegacyWorkspaceConfig;
    const state = migrateLegacyConfig(raw);
    await saveConfig(state);
    return state;
  } catch {
    await saveConfig(DEFAULT_STATE);
    return DEFAULT_STATE;
  }
}

export async function saveConfig(state: AppState): Promise<AppState> {
  await ensureDataDir();
  await fs.writeFile(CONFIG_PATH, JSON.stringify(state, null, 2), "utf-8");
  return state;
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
): ProjectLink {
  return {
    id: normalizeId(displayName) || `project-${Date.now()}`,
    displayName,
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
