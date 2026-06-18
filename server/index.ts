import cors from "cors";
import express from "express";
import fs from "fs";
import mime from "mime-types";
import path from "path";
import { fileURLToPath } from "url";
import {
  createProjectLink,
  findProject,
  hasActiveWorkspace,
  loadConfig,
  persistConfigIfNeeded,
  saveConfig,
  updateActiveWorkspace,
} from "./config.js";
import { createLinkedProject } from "./projectCreator.js";
import { normalizeProjectNamesForCreate } from "./projectNaming.js";
import { autoLinkWorkspaceProjects } from "./projectSync.js";
import {
  copyPath,
  deletePath,
  mkdirPath,
  movePath,
  renamePath,
  assertWithinRoots,
} from "./fileOperations.js";
import { loadShortcuts, saveShortcuts } from "./shortcuts.js";
import { saveAllJsonData } from "./saveAll.js";
import {
  buildFileTree,
  collectPreviewableFiles,
  discoverUnlinkedProjects,
  resolveProjectPath,
  suggestProjectLinks,
} from "./scanner.js";
import { openInExplorer } from "./shell.js";
import { isPathInsideRoot } from "./pathSecurity.js";
import type { MasterWorkspace, OpenFolderTarget, ProjectLink, ProjectSide } from "./types.js";
import { createMasterWorkspace } from "./workspaceCreator.js";
import { isDuplicateWorkspace, openMasterWorkspace } from "./workspaceLinker.js";
import { repairProjectLinks, resolveProjectPathAccessible, resolveProjectRootWithStatus, getAllAccessibleRoots } from "./projectPaths.js";
import { debugLog, isDebugMode } from "./debugLog.js";
import { emptyProjectTree, missingProjectWarning } from "./projectRootHelpers.js";
import {
  loadConceptTags,
  markConceptAsset,
  resolveConceptTagsByPath,
  syncConceptTagsFromFiles,
} from "./conceptTags.js";
import type { ConceptAssetRole } from "./conceptTags.js";
import {
  loadTextureTags,
  markTextureMap,
  resolveTextureTagsByPath,
  syncTextureTagsFromFiles,
  TEXTURE_MAP_TYPES,
} from "./blenderTextureTags.js";
import type { TextureMapType } from "./blenderTextureTags.js";
import { resizeTextureImage, TEXTURE_RESIZE_PRESETS } from "./imageResize.js";
import { mirrorImage } from "./imageMirror.js";
import {
  getActiveWorkspace,
  getAllowedRoots,
  getBlenderRoot,
  getConceptRoot,
  getAllAllowedRoots,
  resolveOpenFolderPath,
} from "./workspacePaths.js";
import { splitImageGrid } from "./imageSplit.js";
import { pickFolder } from "./folderPicker.js";
import { resolvePickerTokenPath } from "./pickerToken.js";
import { importFilesToDirectory } from "./importFiles.js";
import multer from "multer";
import { materialLabRouter } from "./routes/materialLab.js";
import { terrainStageRouter } from "./routes/terrainStage.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3456;

const app = express();
app.use(cors());
app.use(express.json());

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 512 * 1024 * 1024 },
});

function buildEmptyWorkspaceResponse(autoLinked: ProjectLink[] = []) {
  return {
    activeWorkspaceId: "",
    workspaces: [] as MasterWorkspace[],
    active: null,
    unlinked: { conceptOnly: [] as string[], blenderOnly: [] as string[] },
    suggestions: [] as ProjectLink[],
    autoLinked,
  };
}

function buildWorkspacePayload(state: Awaited<ReturnType<typeof loadConfig>>) {
  if (!hasActiveWorkspace(state)) {
    return {
      activeWorkspaceId: "",
      workspaces: state.workspaces,
      active: null,
    };
  }
  const active = getActiveWorkspace(state);
  return {
    activeWorkspaceId: state.activeWorkspaceId,
    workspaces: state.workspaces,
    active: {
      ...active,
      conceptRoot: getConceptRoot(active),
      blenderRoot: getBlenderRoot(active),
    },
  };
}

async function syncActiveWorkspaceProjects(state: Awaited<ReturnType<typeof loadConfig>>): Promise<{
  state: Awaited<ReturnType<typeof loadConfig>>;
  autoLinked: ProjectLink[];
}> {
  if (!hasActiveWorkspace(state)) {
    return { state, autoLinked: [] };
  }
  const active = getActiveWorkspace(state);
  const { projects, added } = await autoLinkWorkspaceProjects(active);
  if (added.length === 0) {
    return { state, autoLinked: [] };
  }

  const nextState = updateActiveWorkspace(state, (workspace) => ({
    ...workspace,
    projects,
  }));
  await saveConfig(nextState);
  return { state: nextState, autoLinked: added };
}

async function buildWorkspaceResponse(
  state: Awaited<ReturnType<typeof loadConfig>>,
  autoLinked: ProjectLink[] = [],
) {
  if (!hasActiveWorkspace(state)) {
    return buildEmptyWorkspaceResponse(autoLinked);
  }
  const active = getActiveWorkspace(state);
  const unlinked = await discoverUnlinkedProjects(active);
  const suggestions = await suggestProjectLinks(active);
  return {
    ...buildWorkspacePayload(state),
    unlinked,
    suggestions,
    autoLinked,
  };
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/workspace", async (_req, res) => {
  let state = await loadConfig();
  if (!hasActiveWorkspace(state)) {
    res.json(await buildWorkspaceResponse(state));
    return;
  }
  const { state: syncedState, autoLinked } = await syncActiveWorkspaceProjects(state);
  state = syncedState;
  ({ state } = await repairActiveWorkspace(state));
  res.json(await buildWorkspaceResponse(state, autoLinked));
});

app.post("/api/workspaces", async (req, res) => {
  try {
    const { name, rootPath } = req.body as { name: string; rootPath: string };
    if (!name?.trim() || !rootPath?.trim()) {
      res.status(400).json({ error: "name and rootPath are required" });
      return;
    }

    const state = await loadConfig();
    const workspace = await createMasterWorkspace(name.trim(), rootPath.trim());

    if (state.workspaces.some((w) => w.id === workspace.id)) {
      res.status(409).json({ error: "Workspace already exists" });
      return;
    }

    state.workspaces.push(workspace);
    state.activeWorkspaceId = workspace.id;
    await saveConfig(state);

    const { state: syncedState, autoLinked } = await syncActiveWorkspaceProjects(state);

    res.status(201).json({
      workspace: {
        ...workspace,
        conceptRoot: getConceptRoot(workspace),
        blenderRoot: getBlenderRoot(workspace),
      },
      ...(await buildWorkspaceResponse(syncedState, autoLinked)),
    });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.post("/api/workspaces/open", async (req, res) => {
  try {
    const { name, rootPath, conceptRoot, blenderRoot } = req.body as {
      name: string;
      rootPath?: string;
      conceptRoot?: string;
      blenderRoot?: string;
    };

    if (!name?.trim()) {
      res.status(400).json({ error: "name is required" });
      return;
    }

    const state = await loadConfig();
    const workspace = await openMasterWorkspace({
      name: name.trim(),
      rootPath,
      conceptRoot,
      blenderRoot,
    });

    if (isDuplicateWorkspace(state.workspaces, workspace)) {
      res.status(409).json({ error: "该工作区路径已添加" });
      return;
    }
    if (state.workspaces.some((w) => w.id === workspace.id)) {
      res.status(409).json({ error: "同名工作区已存在，请换一个名称" });
      return;
    }

    state.workspaces.push(workspace);
    state.activeWorkspaceId = workspace.id;
    await saveConfig(state);

    const { state: syncedState, autoLinked } = await syncActiveWorkspaceProjects(state);

    res.status(201).json({
      workspace: {
        ...workspace,
        conceptRoot: getConceptRoot(workspace),
        blenderRoot: getBlenderRoot(workspace),
      },
      ...(await buildWorkspaceResponse(syncedState, autoLinked)),
    });
  } catch (error) {
    res.status(400).json({ error: String(error) });
  }
});

app.put("/api/workspaces/active", async (req, res) => {
  try {
    const { workspaceId } = req.body as { workspaceId: string };
    let state = await loadConfig();
    if (!state.workspaces.some((w) => w.id === workspaceId)) {
      res.status(404).json({ error: "Workspace not found" });
      return;
    }
    state.activeWorkspaceId = workspaceId;
    await saveConfig(state);
    const { state: syncedState, autoLinked } = await syncActiveWorkspaceProjects(state);
    ({ state } = await repairActiveWorkspace(syncedState));

    res.json(await buildWorkspaceResponse(state, autoLinked));
  } catch (error) {
    res.status(400).json({ error: String(error) });
  }
});

app.post("/api/workspaces/:id/open-folder", async (req, res) => {
  try {
    const { target = "root" } = (req.body ?? {}) as { target?: OpenFolderTarget };
    const state = await loadConfig();
    const workspace = state.workspaces.find((w) => w.id === req.params.id);
    if (!workspace) {
      res.status(404).json({ error: "Workspace not found" });
      return;
    }

    const folderPath = resolveOpenFolderPath(workspace, target);
    if (!fs.existsSync(folderPath)) {
      res.status(404).json({ error: "Folder does not exist" });
      return;
    }

    await openInExplorer(folderPath);
    res.json({ ok: true, path: folderPath });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.post("/api/projects", async (req, res) => {
  try {
    const body = req.body as {
      displayName: string;
      conceptFolderName?: string;
      meshFolderName?: string;
      blenderProjectName: string;
      domain?: string;
    };
    const conceptFolderName = body.conceptFolderName || body.meshFolderName;

    if (!body.displayName || !conceptFolderName || !body.blenderProjectName) {
      res.status(400).json({
        error: "displayName, conceptFolderName, blenderProjectName are required",
      });
      return;
    }

    const names = normalizeProjectNamesForCreate({
      displayName: body.displayName,
      conceptFolderName,
      blenderProjectName: body.blenderProjectName,
      domain: body.domain,
    });

    if (!names.displayName || !names.conceptFolderName || !names.blenderProjectName) {
      res.status(400).json({ error: "Invalid project name" });
      return;
    }

    const state = await loadConfig();
    const active = getActiveWorkspace(state);
    const link = createProjectLink(
      names.displayName,
      names.conceptFolderName,
      names.blenderProjectName,
      body.domain,
    );

    if (active.projects.some((p) => p.id === link.id)) {
      res.status(409).json({ error: "Project with same id already exists" });
      return;
    }

    await createLinkedProject(
      active,
      names.displayName,
      names.conceptFolderName,
      names.blenderProjectName,
      body.domain,
    );
    const next = updateActiveWorkspace(state, (workspace) => ({
      ...workspace,
      projects: [...workspace.projects, link],
    }));
    await saveConfig(next);
    res.status(201).json(link);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.post("/api/projects/link", async (req, res) => {
  try {
    const { displayName, conceptPath, blenderPath, domain } = req.body as {
      displayName: string;
      conceptPath: string;
      blenderPath: string;
      domain?: string;
    };

    if (!displayName || !conceptPath || !blenderPath) {
      res.status(400).json({ error: "displayName, conceptPath, blenderPath are required" });
      return;
    }

    const state = await loadConfig();
    const active = getActiveWorkspace(state);
    const blenderName = blenderPath.replace(/^projects\//, "");
    const link = createProjectLink(displayName, conceptPath, blenderName, domain);

    if (active.projects.some((p) => p.id === link.id)) {
      res.status(409).json({ error: "Project with same id already exists" });
      return;
    }

    const next = updateActiveWorkspace(state, (workspace) => ({
      ...workspace,
      projects: [...workspace.projects, { ...link, conceptPath, blenderPath }],
    }));
    await saveConfig(next);
    res.status(201).json(link);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.put("/api/projects/:id", async (req, res) => {
  try {
    const state = await loadConfig();
    let updated: ProjectLink | null = null;
    const next = updateActiveWorkspace(state, (workspace) => {
      const index = workspace.projects.findIndex((p) => p.id === req.params.id);
      if (index === -1) throw new Error("Project not found");
      const projects = [...workspace.projects];
      projects[index] = { ...projects[index], ...req.body };
      updated = projects[index];
      return { ...workspace, projects };
    });
    await saveConfig(next);
    res.json(updated);
  } catch (error) {
    res.status(400).json({ error: String(error) });
  }
});

app.delete("/api/projects/:id", async (req, res) => {
  try {
    const { deleteFolders = false } = (req.body ?? {}) as { deleteFolders?: boolean };
    const state = await loadConfig();
    const active = getActiveWorkspace(state);
    const project = findProject(state, req.params.id);
    const roots = getAllowedRoots(state);
    const conceptPath = path.join(getConceptRoot(active), project.conceptPath);
    const blenderPath = path.join(getBlenderRoot(active), project.blenderPath);

    const next = updateActiveWorkspace(state, (workspace) => ({
      ...workspace,
      projects: workspace.projects.filter((p) => p.id !== req.params.id),
    }));
    await saveConfig(next);

    if (deleteFolders) {
      if (fs.existsSync(conceptPath)) await deletePath(conceptPath, roots);
      if (fs.existsSync(blenderPath)) await deletePath(blenderPath, roots);
    }

    res.json({ ok: true, deletedFolders: deleteFolders });
  } catch (error) {
    res.status(400).json({ error: String(error) });
  }
});

async function repairActiveWorkspace(state: Awaited<ReturnType<typeof loadConfig>>): Promise<{
  state: Awaited<ReturnType<typeof loadConfig>>;
  repaired: ProjectLink[];
}> {
  if (!hasActiveWorkspace(state)) {
    return { state, repaired: [] };
  }
  const active = getActiveWorkspace(state);
  const { workspace, repaired } = await repairProjectLinks(active);
  if (repaired.length === 0) {
    return { state, repaired: [] };
  }

  const nextState = updateActiveWorkspace(state, () => workspace);
  await saveConfig(nextState);
  return { state: nextState, repaired };
}

app.get("/api/projects/:id/tree", async (req, res) => {
  const started = Date.now();
  const projectId = req.params.id;
  const side = (req.query.side as ProjectSide) || "concept";
  debugLog("project.tree", "request", { projectId, side });
  try {
    let state = await loadConfig();
    if (!hasActiveWorkspace(state)) {
      debugLog("project.tree", "no active workspace", { projectId, side });
      res.status(503).json({ error: "Active workspace not found" });
      return;
    }
    ({ state } = await repairActiveWorkspace(state));
    const active = getActiveWorkspace(state);
    debugLog("project.tree", "workspace", {
      projectId,
      workspaceId: active.id,
      workspaceName: active.name,
      conceptRoot: active.conceptRoot,
    });
    const project = findProject(state, projectId);
    const { root, exists } = await resolveProjectRootWithStatus(active, project, side);
    if (!exists) {
      debugLog("project.tree", "missing", {
        projectId,
        side,
        root,
        ms: Date.now() - started,
      });
      res.json({
        root,
        tree: emptyProjectTree(root),
        missing: true,
        warning: missingProjectWarning(root),
      });
      return;
    }
    const tree = await buildFileTree(root, path.basename(root));
    debugLog("project.tree", "ok", {
      projectId,
      side,
      root,
      ms: Date.now() - started,
    });
    res.json({ root, tree: tree ?? emptyProjectTree(root) });
  } catch (error) {
    debugLog("project.tree", "error", {
      projectId,
      side,
      ms: Date.now() - started,
      error: String(error),
    });
    res.status(404).json({ error: String(error) });
  }
});

app.get("/api/projects/:id/assets", async (req, res) => {
  const started = Date.now();
  const projectId = req.params.id;
  const side = (req.query.side as ProjectSide) || "concept";
  debugLog("project.assets", "request", { projectId, side });
  try {
    let state = await loadConfig();
    if (!hasActiveWorkspace(state)) {
      debugLog("project.assets", "no active workspace", { projectId, side });
      res.status(503).json({ error: "Active workspace not found" });
      return;
    }
    ({ state } = await repairActiveWorkspace(state));
    const active = getActiveWorkspace(state);
    const project = findProject(state, projectId);
    const { root, exists } = await resolveProjectRootWithStatus(active, project, side);
    if (!exists) {
      debugLog("project.assets", "missing", {
        projectId,
        side,
        root,
        ms: Date.now() - started,
      });
      res.json({
        root,
        assets: [],
        missing: true,
        warning: missingProjectWarning(root),
      });
      return;
    }
    const assets = await collectPreviewableFiles(root);
    debugLog("project.assets", "ok", {
      projectId,
      side,
      root,
      count: assets.length,
      ms: Date.now() - started,
    });
    res.json({ root, assets });
  } catch (error) {
    debugLog("project.assets", "error", {
      projectId,
      side,
      ms: Date.now() - started,
      error: String(error),
    });
    res.status(404).json({ error: String(error) });
  }
});

app.get("/api/projects/:id/concept-tags", async (req, res) => {
  try {
    let state = await loadConfig();
    ({ state } = await repairActiveWorkspace(state));
    const active = getActiveWorkspace(state);
    const project = findProject(state, req.params.id);
    const { root, exists } = await resolveProjectRootWithStatus(active, project, "concept");
    if (!exists) {
      res.json({ tags: {}, entries: {}, missing: true, warning: missingProjectWarning(root) });
      return;
    }
    const projectRoot = root;
    let tagsFile = await loadConceptTags(projectRoot);
    tagsFile = await syncConceptTagsFromFiles(projectRoot, project.displayName, tagsFile);
    const tags = resolveConceptTagsByPath(projectRoot, tagsFile);
    res.json({ tags, entries: tagsFile.tags });
  } catch (error) {
    res.status(404).json({ error: String(error) });
  }
});

app.post("/api/projects/:id/mark-concept", async (req, res) => {
  try {
    const { filePath, role } = req.body as { filePath: string; role: ConceptAssetRole };
    if (!filePath || !role) {
      res.status(400).json({ error: "filePath and role are required" });
      return;
    }
    if (!["keyArt", "multiView", "highPoly", "lowPoly"].includes(role)) {
      res.status(400).json({ error: "Invalid role" });
      return;
    }

    const state = await loadConfig();
    const active = getActiveWorkspace(state);
    const project = findProject(state, req.params.id);
    const projectRoot = await resolveProjectPathAccessible(active, project, "concept");
    const result = await markConceptAsset({
      projectRoot,
      displayName: project.displayName,
      filePath,
      role,
      allowedRoots: getAllowedRoots(state),
    });
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: String(error) });
  }
});

app.get("/api/projects/:id/texture-tags", async (req, res) => {
  try {
    const state = await loadConfig();
    const active = getActiveWorkspace(state);
    const project = findProject(state, req.params.id);
    const { root, exists } = await resolveProjectRootWithStatus(active, project, "blender");
    if (!exists) {
      res.json({ tags: {}, entries: {}, missing: true, warning: missingProjectWarning(root) });
      return;
    }
    let tagsFile = await loadTextureTags(root);
    tagsFile = await syncTextureTagsFromFiles(root, project.displayName, tagsFile);
    const tags = resolveTextureTagsByPath(root, tagsFile);
    res.json({ tags, entries: tagsFile.tags });
  } catch (error) {
    res.status(404).json({ error: String(error) });
  }
});

app.post("/api/projects/:id/mark-texture", async (req, res) => {
  try {
    const { filePath, type } = req.body as { filePath: string; type: TextureMapType };
    if (!filePath || !type) {
      res.status(400).json({ error: "filePath and type are required" });
      return;
    }
    if (!TEXTURE_MAP_TYPES.includes(type)) {
      res.status(400).json({ error: "Invalid texture type" });
      return;
    }

    const state = await loadConfig();
    const active = getActiveWorkspace(state);
    const project = findProject(state, req.params.id);
    const projectRoot = await resolveProjectPathAccessible(active, project, "blender");
    const result = await markTextureMap({
      projectRoot,
      displayName: project.displayName,
      filePath,
      type,
      allowedRoots: getAllowedRoots(state),
    });
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: String(error) });
  }
});

app.post("/api/images/resize", async (req, res) => {
  try {
    const { path: imagePath, size } = req.body as { path: string; size: number };
    if (!imagePath || !size) {
      res.status(400).json({ error: "path and size are required" });
      return;
    }
    if (!TEXTURE_RESIZE_PRESETS.includes(size as typeof TEXTURE_RESIZE_PRESETS[number])) {
      res.status(400).json({ error: "Invalid texture size preset" });
      return;
    }

    const state = await loadConfig();
    const result = await resizeTextureImage({
      imagePath,
      size: size as typeof TEXTURE_RESIZE_PRESETS[number],
      allowedRoots: getAllowedRoots(state),
    });
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: String(error) });
  }
});

app.post("/api/images/mirror", async (req, res) => {
  try {
    const { path: imagePath, horizontal, vertical } = req.body as {
      path: string;
      horizontal?: boolean;
      vertical?: boolean;
    };
    if (!imagePath) {
      res.status(400).json({ error: "path is required" });
      return;
    }

    const state = await loadConfig();
    const result = await mirrorImage({
      imagePath,
      horizontal: Boolean(horizontal),
      vertical: Boolean(vertical),
      allowedRoots: getAllowedRoots(state),
    });
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: String(error) });
  }
});

app.get("/api/shortcuts", async (_req, res) => {
  res.json(await loadShortcuts());
});

app.put("/api/shortcuts", async (req, res) => {
  try {
    res.json(await saveShortcuts(req.body));
  } catch (error) {
    res.status(400).json({ error: String(error) });
  }
});

app.post("/api/save-all", async (_req, res) => {
  try {
    res.json(await saveAllJsonData());
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.post("/api/fs/rename", async (req, res) => {
  try {
    const { path: itemPath, newName } = req.body as { path: string; newName: string };
    const state = await loadConfig();
    const dest = await renamePath(itemPath, newName, getAllowedRoots(state));
    res.json({ path: dest });
  } catch (error) {
    res.status(400).json({ error: String(error) });
  }
});

app.post("/api/fs/delete", async (req, res) => {
  try {
    const { path: itemPath } = req.body as { path: string };
    const state = await loadConfig();
    await deletePath(itemPath, getAllowedRoots(state));
    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ error: String(error) });
  }
});

app.post("/api/fs/copy", async (req, res) => {
  try {
    const { sourcePath, destDir } = req.body as { sourcePath: string; destDir: string };
    const state = await loadConfig();
    const dest = await copyPath(sourcePath, destDir, getAllowedRoots(state));
    res.json({ path: dest });
  } catch (error) {
    res.status(400).json({ error: String(error) });
  }
});

app.post("/api/fs/move", async (req, res) => {
  try {
    const { sourcePath, destDir } = req.body as { sourcePath: string; destDir: string };
    const state = await loadConfig();
    const dest = await movePath(sourcePath, destDir, getAllowedRoots(state));
    res.json({ path: dest });
  } catch (error) {
    res.status(400).json({ error: String(error) });
  }
});

app.post("/api/fs/mkdir", async (req, res) => {
  try {
    const { parentDir, name } = req.body as { parentDir: string; name: string };
    const state = await loadConfig();
    const dest = await mkdirPath(parentDir, name, getAllowedRoots(state));
    res.json({ path: dest });
  } catch (error) {
    res.status(400).json({ error: String(error) });
  }
});

app.post("/api/fs/split-image", async (req, res) => {
  try {
    const { filePath, rows, cols, rowSplits, colSplits, folderName } = req.body as {
      filePath: string;
      rows: number;
      cols: number;
      rowSplits: number[];
      colSplits: number[];
      folderName?: string;
    };

    if (!filePath) {
      res.status(400).json({ error: "filePath is required" });
      return;
    }

    const state = await loadConfig();
    const result = await splitImageGrid({
      imagePath: filePath,
      rows: Number(rows),
      cols: Number(cols),
      rowSplits,
      colSplits,
      folderName,
      allowedRoots: getAllowedRoots(state),
    });
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: String(error) });
  }
});

app.post("/api/fs/pick-folder", async (req, res) => {
  try {
    const { title, defaultPath } = (req.body ?? {}) as {
      title?: string;
      defaultPath?: string;
    };
    const result = await pickFolder({ title, defaultPath });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.post("/api/fs/resolve-picker-token", async (req, res) => {
  try {
    const { token, defaultPath } = req.body as { token: string; defaultPath?: string };
    if (!token?.trim()) {
      res.status(400).json({ error: "token is required" });
      return;
    }
    const state = await loadConfig();
    const resolvedPath = await resolvePickerTokenPath(state, token.trim(), { defaultPath });
    res.json({ path: resolvedPath });
  } catch (error) {
    res.status(400).json({ error: String(error) });
  }
});

app.post("/api/fs/import-files", upload.array("files"), async (req, res) => {
  try {
    const destDir = String(req.body?.destDir || "");
    if (!destDir) {
      res.status(400).json({ error: "destDir is required" });
      return;
    }

    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    if (files.length === 0) {
      res.status(400).json({ error: "files are required" });
      return;
    }

    const state = await loadConfig();
    const imported = await importFilesToDirectory({
      destDir,
      files: files.map((file) => ({
        originalname: file.originalname,
        buffer: file.buffer,
      })),
      allowedRoots: getAllowedRoots(state),
    });
    res.json({ imported });
  } catch (error) {
    res.status(400).json({ error: String(error) });
  }
});

app.use("/api/projects", materialLabRouter);
app.use("/api/terrain", terrainStageRouter);

app.get("/api/files", async (req, res) => {
  try {
    const filePath = String(req.query.path || "");
    if (!filePath) {
      res.status(400).json({ error: "path is required" });
      return;
    }

    const state = await loadConfig();
    const allowedRoots = await getAllAccessibleRoots(state);
    const resolved = path.resolve(filePath);

    const insideAllowed = allowedRoots.some((root) => isPathInsideRoot(resolved, root));
    if (!insideAllowed) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    if (!fs.existsSync(resolved)) {
      res.status(404).json({ error: "File not found" });
      return;
    }

    const contentType = mime.lookup(resolved) || "application/octet-stream";
    res.setHeader("Content-Type", contentType);
    fs.createReadStream(resolved).pipe(res);
  } catch (error) {
    res.status(403).json({ error: String(error) });
  }
});

const clientDist = path.join(__dirname, "..", "client", "dist");
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(clientDist, "index.html"));
  });
}

app.listen(PORT, async () => {
  await persistConfigIfNeeded();
  console.log(`Asset Manager running at http://localhost:${PORT}`);
  if (isDebugMode()) {
    console.log("[DEBUG] Server debug logging enabled (DEBUG=1)");
  }
});
