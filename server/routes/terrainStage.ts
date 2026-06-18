import { Router } from "express";
import multer from "multer";
import { loadConfig } from "../config.js";
import { getActiveWorkspace } from "../workspacePaths.js";
import type { CreateStageInput, StageJson, StageTextureSlot } from "../stageTypes.js";
import { STAGE_UPLOAD_SLOTS } from "../stageTypes.js";
import {
  createStage,
  getTerrainRoot,
  listStages,
  loadStage,
  saveStage,
  deleteStage,
  uploadStageTexture,
  loadStagePalette,
  getStageTextureStatus,
  migrateStageJson,
} from "../services/stageProjectService.js";
import {
  loadPromptHistory,
  saveStagePrompt,
  type StagePromptKind,
} from "../services/stagePromptService.js";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 64 * 1024 * 1024 } });

export const terrainStageRouter = Router();

function paramString(value: string | string[]): string {
  return Array.isArray(value) ? (value[0] ?? "") : value;
}

function parseTextureSlot(raw: string): StageTextureSlot {
  const allowed = new Set<string>(STAGE_UPLOAD_SLOTS);
  if (!allowed.has(raw)) throw new Error(`Invalid texture slot: ${raw}`);
  return raw as StageTextureSlot;
}

const PROMPT_KINDS = new Set<string>(["semantic_to_basecolor"]);

terrainStageRouter.get("/stages", async (_req, res) => {
  try {
    const state = await loadConfig();
    const active = getActiveWorkspace(state);
    const terrainRoot = getTerrainRoot(active);
    const stages = await listStages(terrainRoot);
    res.json({ ok: true, stages, terrainRoot });
  } catch (error) {
    res.status(400).json({ ok: false, error: String(error), message: String(error) });
  }
});

terrainStageRouter.post("/stages", async (req, res) => {
  try {
    const body = req.body as CreateStageInput;
    if (!body?.stageName?.trim()) {
      res.status(400).json({ ok: false, error: "stageName is required" });
      return;
    }

    const state = await loadConfig();
    const active = getActiveWorkspace(state);
    const terrainRoot = getTerrainRoot(active);
    const { stage, stageRoot } = await createStage(terrainRoot, body);
    const textureStatus = await getStageTextureStatus(stageRoot, stage);
    res.status(201).json({
      ok: true,
      stage,
      terrainRoot,
      stageRoot,
      textureStatus,
      message: `已创建 Stage：${stage.stageName}`,
    });
  } catch (error) {
    res.status(400).json({ ok: false, error: String(error), message: String(error) });
  }
});

terrainStageRouter.delete("/stages/:stageName", async (req, res) => {
  try {
    const state = await loadConfig();
    const active = getActiveWorkspace(state);
    const terrainRoot = getTerrainRoot(active);
    const stageName = paramString(req.params.stageName);
    await deleteStage(terrainRoot, stageName);
    res.json({ ok: true, message: `已删除 Stage：${stageName}` });
  } catch (error) {
    res.status(400).json({ ok: false, error: String(error), message: String(error) });
  }
});

terrainStageRouter.get("/stages/:stageName/palette", async (req, res) => {
  try {
    const state = await loadConfig();
    const active = getActiveWorkspace(state);
    const terrainRoot = getTerrainRoot(active);
    const stageName = paramString(req.params.stageName);
    const palette = await loadStagePalette(terrainRoot, stageName);
    res.json({ ok: true, palette });
  } catch (error) {
    res.status(404).json({ ok: false, error: String(error), message: String(error) });
  }
});

terrainStageRouter.get("/stages/:stageName", async (req, res) => {
  try {
    const state = await loadConfig();
    const active = getActiveWorkspace(state);
    const terrainRoot = getTerrainRoot(active);
    const stageName = paramString(req.params.stageName);
    const { stage, stageRoot } = await loadStage(terrainRoot, stageName);
    const textureStatus = await getStageTextureStatus(stageRoot, stage);
    res.json({ ok: true, stage, terrainRoot, stageRoot, textureStatus });
  } catch (error) {
    res.status(404).json({ ok: false, error: String(error), message: String(error) });
  }
});

terrainStageRouter.get("/stages/:stageName/prompts/history", async (req, res) => {
  try {
    const state = await loadConfig();
    const active = getActiveWorkspace(state);
    const terrainRoot = getTerrainRoot(active);
    const stageName = paramString(req.params.stageName);
    const entries = await loadPromptHistory(terrainRoot, stageName);
    res.json({ ok: true, entries });
  } catch (error) {
    res.status(404).json({ ok: false, error: String(error), message: String(error) });
  }
});

terrainStageRouter.post("/stages/:stageName/prompts", async (req, res) => {
  try {
    const kind = req.body?.kind as string;
    const content = req.body?.content as string;
    if (!kind || !PROMPT_KINDS.has(kind)) {
      res.status(400).json({ ok: false, error: "Invalid prompt kind" });
      return;
    }
    if (!content?.trim()) {
      res.status(400).json({ ok: false, error: "content is required" });
      return;
    }

    const state = await loadConfig();
    const active = getActiveWorkspace(state);
    const terrainRoot = getTerrainRoot(active);
    const stageName = paramString(req.params.stageName);
    const result = await saveStagePrompt(
      terrainRoot,
      stageName,
      kind as StagePromptKind,
      content,
    );
    res.json({
      ok: true,
      relativePath: result.relativePath,
      historyEntry: result.historyEntry,
      message: `已保存 ${result.relativePath}`,
    });
  } catch (error) {
    res.status(400).json({ ok: false, error: String(error), message: String(error) });
  }
});

terrainStageRouter.put("/stages/:stageName", async (req, res) => {
  try {
    const body = req.body;
    if (!body || typeof body !== "object") {
      res.status(400).json({ ok: false, error: "Invalid stage.json body" });
      return;
    }

    const state = await loadConfig();
    const active = getActiveWorkspace(state);
    const terrainRoot = getTerrainRoot(active);
    const stageName = paramString(req.params.stageName);
    const migrated = migrateStageJson(body);
    if (migrated.stageName !== stageName) {
      res.status(400).json({ ok: false, error: "stageName mismatch" });
      return;
    }

    await saveStage(terrainRoot, migrated);
    const { stage } = await loadStage(terrainRoot, migrated.stageName);
    res.json({ ok: true, stage, message: "已保存 stage.json" });
  } catch (error) {
    res.status(400).json({ ok: false, error: String(error), message: String(error) });
  }
});

terrainStageRouter.post(
  "/stages/:stageName/textures/:slot",
  upload.single("file"),
  async (req, res) => {
    try {
      if (!req.file?.buffer) {
        res.status(400).json({ ok: false, error: "file is required" });
        return;
      }

      const stageName = paramString(req.params.stageName);
      const slot = parseTextureSlot(paramString(req.params.slot));
      const conceptProjectRel =
        typeof req.body?.conceptProjectRel === "string" ? req.body.conceptProjectRel.trim() : "";
      const state = await loadConfig();
      const active = getActiveWorkspace(state);
      const terrainRoot = getTerrainRoot(active);
      const result = await uploadStageTexture(
        terrainRoot,
        stageName,
        slot,
        req.file.buffer,
        conceptProjectRel ? { workspace: active, conceptProjectRel } : undefined,
      );
      const { stage, stageRoot } = await loadStage(terrainRoot, stageName);
      const textureStatus = await getStageTextureStatus(stageRoot, stage);
      res.json({
        ok: true,
        stage,
        relativePath: result.relativePath,
        absolutePath: result.absolutePath,
        conceptMirrorPath: result.conceptMirrorPath,
        textureStatus,
        message: result.conceptMirrorPath
          ? `已上传 ${slot}，并同步到概念目录 ${result.conceptMirrorPath}`
          : `已上传 ${slot}`,
      });
    } catch (error) {
      res.status(400).json({ ok: false, error: String(error), message: String(error) });
    }
  },
);
