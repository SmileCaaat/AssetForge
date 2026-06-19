import { useCallback, useEffect, useRef, useState } from "react";
import type { ProjectLink } from "../types";
import type {
  SemanticPalette,
  SemanticPaletteColor,
  StageJson,
  StageSummary,
  StageTextureSlot,
  StageTextureStatus,
} from "./terrainTypes";
import { DEFAULT_SEMANTIC_PALETTE } from "./semanticColor";
import {
  createStage,
  deleteStage,
  fetchStage,
  fetchStageList,
  fetchStagePalette,
  saveStage,
  uploadStageTexture,
} from "./terrainApi";
import { NewStageForm, StageListPanel } from "./StageLabPanels";
import { StageTexturePanel } from "./StageTexturePanel";
import { SemanticMapEditor } from "./SemanticMapEditor";
import { SemanticPalettePanel } from "./SemanticPalettePanel";
import { StageStatusPanel } from "./StageStatusPanel";
import { StagePromptHistoryPanel } from "./StagePromptHistoryPanel";
import { STAGE_PRODUCT_SUMMARY } from "./stageWorkflow";
import type { StageActionId } from "./stageActions";
import { emptyTextureStatus } from "./stageActions";
import { PROMPT_KIND_FOR_ACTION } from "./stagePrompts";
import { generateAndSavePrompt, loadPromptHistory } from "./stagePromptService";
import type { PromptHistoryEntry } from "./terrainTypes";

interface StageLabModalProps {
  project: ProjectLink;
  onClose: () => void;
  onNotify: (message: string, type?: "info" | "error") => void;
}

export function StageLabModal({ project, onClose, onNotify }: StageLabModalProps) {
  const [stages, setStages] = useState<StageSummary[]>([]);
  const [terrainRoot, setTerrainRoot] = useState("");
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [stage, setStage] = useState<StageJson | null>(null);
  const [stageRoot, setStageRoot] = useState("");
  const [textureStatus, setTextureStatus] = useState<StageTextureStatus>(emptyTextureStatus());
  const [palette, setPalette] = useState<SemanticPalette>(DEFAULT_SEMANTIC_PALETTE);
  const [selectedColor, setSelectedColor] = useState<SemanticPaletteColor>(DEFAULT_SEMANTIC_PALETTE.colors[0]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [deletingName, setDeletingName] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savingSemantic, setSavingSemantic] = useState(false);
  const [uploading, setUploading] = useState<StageTextureSlot | null>(null);
  const [textureVersion, setTextureVersion] = useState(0);
  const [promptHistory, setPromptHistory] = useState<PromptHistoryEntry[]>([]);
  const [promptHistoryLoading, setPromptHistoryLoading] = useState(false);
  const editorRef = useRef<HTMLDivElement>(null);
  const uploadTriggerRef = useRef<((slot: StageTextureSlot) => void) | null>(null);
  const onNotifyRef = useRef(onNotify);
  onNotifyRef.current = onNotify;

  const loadList = useCallback(async () => {
    const res = await fetchStageList();
    setStages(res.stages ?? []);
    if (res.terrainRoot) setTerrainRoot(res.terrainRoot);
    return res.stages ?? [];
  }, []);

  const loadPalette = useCallback(async (stageName: string) => {
    try {
      const res = await fetchStagePalette(stageName);
      if (res.palette?.colors?.length) {
        setPalette(res.palette);
        setSelectedColor(res.palette.colors[0]);
      }
    } catch {
      setPalette(DEFAULT_SEMANTIC_PALETTE);
      setSelectedColor(DEFAULT_SEMANTIC_PALETTE.colors[0]);
    }
  }, []);

  const refreshPromptHistory = useCallback(async (stageName: string) => {
    setPromptHistoryLoading(true);
    try {
      setPromptHistory(await loadPromptHistory(stageName));
    } catch {
      setPromptHistory([]);
    } finally {
      setPromptHistoryLoading(false);
    }
  }, []);

  const loadStageDetail = useCallback(
    async (stageName: string) => {
      const res = await fetchStage(stageName);
      if (res.stage) {
        setStage(res.stage);
        setStageRoot(res.stageRoot ?? "");
        setTextureStatus(res.textureStatus ?? emptyTextureStatus());
        setSelectedName(stageName);
        await loadPalette(stageName);
        await refreshPromptHistory(stageName);
      }
    },
    [loadPalette, refreshPromptHistory],
  );

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const list = await loadList();
        if (list.length > 0) {
          await loadStageDetail(list[0].stageName);
        }
      } catch (error) {
        onNotifyRef.current(String(error), "error");
      } finally {
        setLoading(false);
      }
    })();
  }, [loadList, loadStageDetail]);

  const handleCreate = async (input: Parameters<typeof createStage>[0]) => {
    setCreating(true);
    try {
      const res = await createStage(input);
      await loadList();
      if (res.stage) {
        setStage(res.stage);
        setStageRoot(res.stageRoot ?? "");
        setTextureStatus(res.textureStatus ?? emptyTextureStatus());
        setSelectedName(res.stage.stageName);
        await loadPalette(res.stage.stageName);
      }
      onNotifyRef.current(res.message ?? "地形语义已创建");
    } catch (error) {
      onNotifyRef.current(String(error), "error");
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteStage = async (stageName: string) => {
    const summary = stages.find((s) => s.stageName === stageName);
    const label = summary?.displayName ?? stageName;
    if (
      !window.confirm(
        `确定删除地形语义「${label}」？\n将永久删除 TerrainWorkspace/stages/${stageName}/ 下所有文件，不可撤销。`,
      )
    ) {
      return;
    }

    setDeletingName(stageName);
    try {
      const res = await deleteStage(stageName);
      const list = await loadList();
      if (selectedName === stageName) {
        setStage(null);
        setStageRoot("");
        setSelectedName(null);
        setTextureStatus(emptyTextureStatus());
        setPromptHistory([]);
        if (list.length > 0) {
          await loadStageDetail(list[0].stageName);
        }
      }
      onNotifyRef.current(res.message ?? "地形语义已删除");
    } catch (error) {
      onNotifyRef.current(String(error), "error");
    } finally {
      setDeletingName(null);
    }
  };

  const handleSave = async () => {
    if (!stage) return;
    setSaving(true);
    try {
      const res = await saveStage(stage);
      if (res.stage) setStage(res.stage);
      await loadList();
      onNotifyRef.current(res.message ?? "已保存");
    } catch (error) {
      onNotifyRef.current(String(error), "error");
    } finally {
      setSaving(false);
    }
  };

  const refreshAfterTextureChange = async (res: { stage?: StageJson; textureStatus?: StageTextureStatus }) => {
    if (res.stage) setStage(res.stage);
    if (res.textureStatus) setTextureStatus(res.textureStatus);
    else if (res.stage && selectedName) await loadStageDetail(selectedName);
    setTextureVersion((v) => v + 1);
    await loadList();
  };

  const handleUpload = async (slot: StageTextureSlot, file: File) => {
    if (!stage) return;
    setUploading(slot);
    try {
      const res = await uploadStageTexture(stage.stageName, slot, file, {
        conceptProjectRel: project.conceptPath,
      });
      await refreshAfterTextureChange(res);
      onNotifyRef.current(res.message ?? "上传完成");
    } catch (error) {
      onNotifyRef.current(String(error), "error");
    } finally {
      setUploading(null);
    }
  };

  const handleSaveSemantic = async (file: File) => {
    if (!stage) return;
    setSavingSemantic(true);
    try {
      const res = await uploadStageTexture(stage.stageName, "semanticControl", file, {
        conceptProjectRel: project.conceptPath,
      });
      await refreshAfterTextureChange(res);
      onNotifyRef.current(res.message ?? "语义控制图已保存");
    } catch (error) {
      onNotifyRef.current(String(error), "error");
      throw error;
    } finally {
      setSavingSemantic(false);
    }
  };

  const handleGeneratePrompt = async (actionId: StageActionId) => {
    if (!stage) return;
    const promptKind = PROMPT_KIND_FOR_ACTION[actionId];
    if (!promptKind) return;

    try {
      const { text, relativePath } = await generateAndSavePrompt(stage, promptKind);
      try {
        await navigator.clipboard.writeText(text);
        onNotifyRef.current(`已保存 ${relativePath}，并复制到剪贴板`);
      } catch {
        onNotifyRef.current(`已保存 ${relativePath}`);
      }
      await refreshPromptHistory(stage.stageName);
    } catch (error) {
      onNotifyRef.current(String(error), "error");
    }
  };

  const handleStageAction = (actionId: StageActionId) => {
    if (!stage) return;

    const uploadSlotMap: Partial<Record<StageActionId, StageTextureSlot>> = {
      upload_basecolor: "baseColor",
      upload_semantic: "semanticControl",
    };

    const uploadSlot = uploadSlotMap[actionId];
    if (uploadSlot) {
      uploadTriggerRef.current?.(uploadSlot);
      return;
    }

    if (actionId === "open_semantic_editor") {
      editorRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      onNotifyRef.current("请在中间画布编辑语义控制图");
      return;
    }

    if (PROMPT_KIND_FOR_ACTION[actionId]) {
      void handleGeneratePrompt(actionId);
      return;
    }

    onNotifyRef.current("该操作尚未实现", "error");
  };

  return (
    <div className="modal-overlay material-lab-overlay stage-lab-overlay" onClick={onClose}>
      <div className="material-lab-modal stage-lab-modal" onClick={(e) => e.stopPropagation()}>
        <header className="material-lab-header">
          <div>
            <h2>地形语义</h2>
            <p className="muted stage-lab-tagline">{STAGE_PRODUCT_SUMMARY}</p>
            <p className="muted">
              {project.displayName}
              {terrainRoot && (
                <>
                  {" "}
                  · <code>{terrainRoot}</code>
                </>
              )}
            </p>
          </div>
          <div className="material-lab-header-actions">
            <button
              type="button"
              className="preview-action-btn"
              disabled={saving || !stage}
              onClick={() => void handleSave()}
            >
              {saving ? "保存中…" : "保存配置"}
            </button>
            <button type="button" className="preview-action-btn" onClick={onClose}>
              关闭
            </button>
          </div>
        </header>

        {loading ? (
          <div className="material-lab-loading">加载中…</div>
        ) : (
          <div className="material-lab-body stage-lab-body">
            <aside className="material-lab-col material-lab-col-left">
              <StageListPanel
                stages={stages}
                selectedName={selectedName}
                deletingName={deletingName}
                onSelect={(name) => void loadStageDetail(name)}
                onDelete={(name) => void handleDeleteStage(name)}
              />
              <NewStageForm creating={creating} onCreate={(input) => void handleCreate(input)} />
            </aside>

            <main className="material-lab-col material-lab-col-center stage-lab-center">
              {stage && stageRoot ? (
                <div ref={editorRef}>
                  <SemanticMapEditor
                    key={stage.stageName}
                    stage={stage}
                    stageRoot={stageRoot}
                    palette={palette}
                    selectedColor={selectedColor}
                    textureVersion={textureVersion}
                    hasBaseColor={textureStatus.baseColor}
                    saving={savingSemantic}
                    onSaveSemantic={handleSaveSemantic}
                    onPickColor={setSelectedColor}
                  />
                </div>
              ) : (
                <div className="material-lab-panel">
                  <p className="muted">选择或新建地形语义，从绘制语义控制图开始；BaseColor 可作为参考叠加层导入。</p>
                </div>
              )}
            </main>

            <aside className="material-lab-col material-lab-col-right">
              {stage && (
                <StageStatusPanel
                  stage={stage}
                  textureStatus={textureStatus}
                  onAction={handleStageAction}
                />
              )}
              {stage && (
                <SemanticPalettePanel
                  palette={palette}
                  selectedId={selectedColor.id}
                  onSelect={setSelectedColor}
                />
              )}
              {stage && stageRoot && (
                <StageTexturePanel
                  stage={stage}
                  stageRoot={stageRoot}
                  conceptProjectPath={project.conceptPath}
                  textureStatus={textureStatus}
                  textureVersion={textureVersion}
                  uploading={uploading}
                  onUpload={(slot, file) => void handleUpload(slot, file)}
                  onRegisterUploadTrigger={(fn) => {
                    uploadTriggerRef.current = fn;
                  }}
                />
              )}
              {stage && (
                <StagePromptHistoryPanel entries={promptHistory} loading={promptHistoryLoading} />
              )}
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}
