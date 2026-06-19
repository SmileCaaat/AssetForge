import { Router } from "express";
import { findProject, loadConfig } from "../config.js";
import { assertWithinRoots } from "../fileOperations.js";
import { getAllowedRoots, getActiveWorkspace } from "../workspacePaths.js";
import { openInExplorer } from "../shell.js";
import {
  clearRiggingJobs,
  getRiggingHealth,
  getRiggingPaths,
  loadRiggingState,
  refreshRiggingJob,
  startRiggingJob,
} from "../services/riggingService.js";
import type { RiggingSettings } from "../riggingTypes.js";

export const riggingRouter = Router();

riggingRouter.get("/:id/rigging", async (req, res) => {
  try {
    const state = await loadConfig();
    const active = getActiveWorkspace(state);
    const project = findProject(state, req.params.id);
    const labState = await loadRiggingState(active, project);
    res.json({ ok: true, state: labState });
  } catch (error) {
    res.status(400).json({ ok: false, error: String(error), message: String(error) });
  }
});

riggingRouter.get("/:id/rigging/health", async (_req, res) => {
  try {
    const health = await getRiggingHealth();
    res.json({ ok: health.ok, health });
  } catch (error) {
    res.status(400).json({ ok: false, error: String(error), message: String(error) });
  }
});

riggingRouter.post("/:id/rigging/run", async (req, res) => {
  try {
    const state = await loadConfig();
    const active = getActiveWorkspace(state);
    const project = findProject(state, req.params.id);
    const allowedRoots = getAllowedRoots(state);
    const body = req.body as {
      inputMeshPath?: string;
      settings?: Partial<RiggingSettings>;
    };

    if (!body.inputMeshPath?.trim()) {
      res.status(400).json({ ok: false, error: "inputMeshPath is required" });
      return;
    }

    const result = await startRiggingJob({
      workspace: active,
      project,
      inputMeshPath: body.inputMeshPath,
      settings: body.settings,
      allowedRoots,
    });

    res.status(202).json({ ok: true, ...result });
  } catch (error) {
    res.status(400).json({ ok: false, error: String(error), message: String(error) });
  }
});

riggingRouter.get("/:id/rigging/jobs/:jobId", async (req, res) => {
  try {
    const state = await loadConfig();
    const active = getActiveWorkspace(state);
    const project = findProject(state, req.params.id);
    const allowedRoots = getAllowedRoots(state);
    const result = await refreshRiggingJob({
      workspace: active,
      project,
      jobId: req.params.jobId,
      allowedRoots,
    });
    res.json({ ok: true, ...result });
  } catch (error) {
    res.status(400).json({ ok: false, error: String(error), message: String(error) });
  }
});

riggingRouter.post("/:id/rigging/clear", async (req, res) => {
  try {
    const state = await loadConfig();
    const active = getActiveWorkspace(state);
    const project = findProject(state, req.params.id);
    const labState = await clearRiggingJobs(active, project);
    res.json({ ok: true, state: labState });
  } catch (error) {
    res.status(400).json({ ok: false, error: String(error), message: String(error) });
  }
});

riggingRouter.post("/:id/rigging/open-folder", async (req, res) => {
  try {
    const state = await loadConfig();
    const active = getActiveWorkspace(state);
    const project = findProject(state, req.params.id);
    const allowedRoots = getAllowedRoots(state);
    const { outputDir } = await getRiggingPaths(active, project);
    const resolved = assertWithinRoots(outputDir, allowedRoots);
    await openInExplorer(resolved);
    res.json({ ok: true, path: resolved });
  } catch (error) {
    res.status(400).json({ ok: false, error: String(error), message: String(error) });
  }
});
