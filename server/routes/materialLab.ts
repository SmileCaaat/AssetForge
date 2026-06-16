import { Router } from "express";
import fs from "fs/promises";
import path from "path";
import { findProject, loadConfig } from "../config.js";
import { getAllowedRoots, getActiveWorkspace } from "../workspacePaths.js";
import { resolveProjectPathAccessible } from "../projectPaths.js";
import {
  loadMaterialLabState,
  saveMaterialLabState,
  validateMaterialLabState,
} from "../services/materialLabService.js";
import { mergeMetallicRoughness } from "../services/metallicSmoothnessMerge.js";
import { checkUnityTextureStandard } from "../services/materialChecker.js";
import { exportUnityMaterialPackage } from "../services/unityShaderExporter.js";

export const materialLabRouter = Router();

materialLabRouter.get("/:id/material-lab", async (req, res) => {
  try {
    const state = await loadConfig();
    const active = getActiveWorkspace(state);
    const project = findProject(state, req.params.id);
    const projectRoot = await resolveProjectPathAccessible(active, project, "blender");
    const result = await loadMaterialLabState(projectRoot, project);
    res.json({ ok: true, state: result.state, warnings: result.warnings, created: result.created });
  } catch (error) {
    res.status(404).json({ ok: false, error: String(error), message: String(error) });
  }
});

materialLabRouter.put("/:id/material-lab", async (req, res) => {
  try {
    const state = await loadConfig();
    const active = getActiveWorkspace(state);
    const project = findProject(state, req.params.id);
    const projectRoot = await resolveProjectPathAccessible(active, project, "blender");
    const body = validateMaterialLabState(req.body);
    const savedPath = await saveMaterialLabState(projectRoot, body);
    res.json({ ok: true, savedPath, message: "已保存 material_lab.json" });
  } catch (error) {
    res.status(400).json({ ok: false, error: String(error), message: String(error) });
  }
});

materialLabRouter.post("/:id/material-lab/merge-metallic-smoothness", async (req, res) => {
  try {
    const state = await loadConfig();
    const active = getActiveWorkspace(state);
    const project = findProject(state, req.params.id);
    const projectRoot = await resolveProjectPathAccessible(active, project, "blender");
    const { metallicPath, roughnessPath } = (req.body ?? {}) as {
      metallicPath?: string;
      roughnessPath?: string;
    };

    const merged = await mergeMetallicRoughness({
      projectRoot,
      displayName: project.displayName,
      allowedRoots: getAllowedRoots(state),
      metallicPath,
      roughnessPath,
    });

    const { state: labState } = await loadMaterialLabState(projectRoot, project);
    labState.textures.metallicSmoothness.path = merged.relativePath;
    await saveMaterialLabState(projectRoot, labState);

    res.json({
      ok: true,
      relativePath: merged.relativePath,
      absolutePath: merged.absolutePath,
      width: merged.width,
      height: merged.height,
      message: `已生成 ${merged.relativePath}（R=Metallic, A=Smoothness）`,
    });
  } catch (error) {
    res.status(400).json({ ok: false, error: String(error), message: String(error) });
  }
});

materialLabRouter.post("/:id/material-lab/check", async (req, res) => {
  try {
    const state = await loadConfig();
    const active = getActiveWorkspace(state);
    const project = findProject(state, req.params.id);
    const projectRoot = await resolveProjectPathAccessible(active, project, "blender");
    const items = await checkUnityTextureStandard(projectRoot, project.displayName);
    res.json({ ok: true, items });
  } catch (error) {
    res.status(400).json({ ok: false, error: String(error), message: String(error) });
  }
});

materialLabRouter.post("/:id/material-lab/export-unity", async (req, res) => {
  try {
    const state = await loadConfig();
    const active = getActiveWorkspace(state);
    const project = findProject(state, req.params.id);
    const projectRoot = await resolveProjectPathAccessible(active, project, "blender");
    const { state: labState } = await loadMaterialLabState(projectRoot, project);
    const exported = await exportUnityMaterialPackage(projectRoot, labState);
    await saveMaterialLabState(projectRoot, labState);
    res.json({ ok: true, ...exported, message: "Unity 材质包已导出" });
  } catch (error) {
    res.status(400).json({ ok: false, error: String(error), message: String(error) });
  }
});

materialLabRouter.post("/:id/material-lab/open-export-folder", async (req, res) => {
  try {
    const state = await loadConfig();
    const active = getActiveWorkspace(state);
    const project = findProject(state, req.params.id);
    const projectRoot = await resolveProjectPathAccessible(active, project, "blender");
    const unityDir = path.join(projectRoot, "unity");
    await fs.mkdir(unityDir, { recursive: true });
    const { openInExplorer } = await import("../shell.js");
    await openInExplorer(unityDir);
    res.json({ ok: true, path: unityDir });
  } catch (error) {
    res.status(400).json({ ok: false, error: String(error), message: String(error) });
  }
});
