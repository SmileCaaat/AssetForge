import cors from "cors";
import express from "express";
import fs from "fs";
import mime from "mime-types";
import path from "path";
import { fileURLToPath } from "url";
import {
  createProjectLink,
  findProject,
  loadConfig,
  saveConfig,
  updateActiveWorkspace,
} from "./config.js";
import { createLinkedProject } from "./projectCreator.js";
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
import type { OpenFolderTarget, ProjectLink, ProjectSide } from "./types.js";
import { createMasterWorkspace } from "./workspaceCreator.js";
import { isDuplicateWorkspace, openMasterWorkspace } from "./workspaceLinker.js";
import {
  loadConceptTags,
  markConceptAsset,
  resolveConceptTagsByPath,
  syncConceptTagsFromFiles,
} from "./conceptTags.js";
import type { ConceptAssetRole } from "./conceptTags.js";
import {
  getActiveWorkspace,
  getAllowedRoots,
  getBlenderRoot,
  getConceptRoot,
  resolveOpenFolderPath,
} from "./workspacePaths.js";
import { splitImageGrid } from "./imageSplit.js";
import { pickFolder } from "./folderPicker.js";
import { resolvePickerTokenPath } from "./pickerToken.js";
import { importFilesToDirectory } from "./importFiles.js";
import multer from "multer";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3456;

const app = express();
app.use(cors());
app.use(express.json());

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 512 * 1024 * 1024 },
});

function buildWorkspacePayload(state: Awaited<ReturnType<typeof loadConfig>>) {
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

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/workspace", async (_req, res) => {
  const state = await loadConfig();
  const active = getActiveWorkspace(state);
  const unlinked = await discoverUnlinkedProjects(active);
  const suggestions = await suggestProjectLinks(active);
  res.json({
    ...buildWorkspacePayload(state),
    unlinked,
    suggestions,
  });
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

    res.status(201).json({
      workspace: {
        ...workspace,
        conceptRoot: getConceptRoot(workspace),
        blenderRoot: getBlenderRoot(workspace),
      },
      ...buildWorkspacePayload(state),
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

    const active = getActiveWorkspace(state);
    const unlinked = await discoverUnlinkedProjects(active);
    const suggestions = await suggestProjectLinks(active);

    res.status(201).json({
      workspace: {
        ...workspace,
        conceptRoot: getConceptRoot(workspace),
        blenderRoot: getBlenderRoot(workspace),
      },
      ...buildWorkspacePayload(state),
      unlinked,
      suggestions,
    });
  } catch (error) {
    res.status(400).json({ error: String(error) });
  }
});

app.put("/api/workspaces/active", async (req, res) => {
  try {
    const { workspaceId } = req.body as { workspaceId: string };
    const state = await loadConfig();
    if (!state.workspaces.some((w) => w.id === workspaceId)) {
      res.status(404).json({ error: "Workspace not found" });
      return;
    }
    state.activeWorkspaceId = workspaceId;
    await saveConfig(state);
    const active = getActiveWorkspace(state);
    const unlinked = await discoverUnlinkedProjects(active);
    const suggestions = await suggestProjectLinks(active);
    res.json({ ...buildWorkspacePayload(state), unlinked, suggestions });
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
    };
    const conceptFolderName = body.conceptFolderName || body.meshFolderName;

    if (!body.displayName || !conceptFolderName || !body.blenderProjectName) {
      res.status(400).json({
        error: "displayName, conceptFolderName, blenderProjectName are required",
      });
      return;
    }

    const state = await loadConfig();
    const active = getActiveWorkspace(state);
    const link = createProjectLink(body.displayName, conceptFolderName, body.blenderProjectName);

    if (active.projects.some((p) => p.id === link.id)) {
      res.status(409).json({ error: "Project with same id already exists" });
      return;
    }

    await createLinkedProject(active, body.displayName, conceptFolderName, body.blenderProjectName);
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
    const { displayName, conceptPath, blenderPath } = req.body as {
      displayName: string;
      conceptPath: string;
      blenderPath: string;
    };

    if (!displayName || !conceptPath || !blenderPath) {
      res.status(400).json({ error: "displayName, conceptPath, blenderPath are required" });
      return;
    }

    const state = await loadConfig();
    const active = getActiveWorkspace(state);
    const blenderName = blenderPath.replace(/^projects\//, "");
    const link = createProjectLink(displayName, conceptPath, blenderName);

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

app.get("/api/projects/:id/tree", async (req, res) => {
  try {
    const side = (req.query.side as ProjectSide) || "concept";
    const state = await loadConfig();
    const active = getActiveWorkspace(state);
    const project = findProject(state, req.params.id);
    const root = resolveProjectPath(active, project, side);
    const tree = await buildFileTree(
      root,
      project[side === "concept" ? "conceptPath" : "blenderPath"],
    );
    res.json({ root, tree });
  } catch (error) {
    res.status(404).json({ error: String(error) });
  }
});

app.get("/api/projects/:id/assets", async (req, res) => {
  try {
    const side = (req.query.side as ProjectSide) || "concept";
    const state = await loadConfig();
    const active = getActiveWorkspace(state);
    const project = findProject(state, req.params.id);
    const root = resolveProjectPath(active, project, side);
    const assets = await collectPreviewableFiles(root);
    res.json({ root, assets });
  } catch (error) {
    res.status(404).json({ error: String(error) });
  }
});

app.get("/api/projects/:id/concept-tags", async (req, res) => {
  try {
    const state = await loadConfig();
    const active = getActiveWorkspace(state);
    const project = findProject(state, req.params.id);
    const projectRoot = resolveProjectPath(active, project, "concept");
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
    const projectRoot = resolveProjectPath(active, project, "concept");
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

app.get("/api/files", async (req, res) => {
  try {
    const filePath = String(req.query.path || "");
    if (!filePath) {
      res.status(400).json({ error: "path is required" });
      return;
    }

    const state = await loadConfig();
    const allowedRoots = getAllowedRoots(state);
    const resolved = path.resolve(filePath);

    const allowed = allowedRoots.some(
      (root) => isPathInsideRoot(resolved, root) && fs.existsSync(resolved),
    );
    if (!allowed) {
      res.status(403).json({ error: "Access denied" });
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

app.listen(PORT, () => {
  console.log(`Asset Manager running at http://localhost:${PORT}`);
});
