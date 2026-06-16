import { useCallback, useEffect, useRef, useState } from "react";
import type { ProjectLink } from "../types";
import type { MaterialCheckItem, MaterialLabState } from "./materialLabTypes";
import {
  checkUnityTextureStandard,
  exportUnityMaterialPackage,
  fetchMaterialLabState,
  mergeMetallicSmoothness,
  openMaterialLabExportFolder,
  saveMaterialLabState,
} from "./materialLabApi";
import { MaterialParamPanel, TextureSlotPanel } from "./MaterialLabPanels";
import { MaterialPreviewCanvas } from "./MaterialPreviewCanvas";

interface MaterialLabModalProps {
  project: ProjectLink;
  projectRoot: string | null;
  onClose: () => void;
  onNotify: (message: string, type?: "info" | "error") => void;
  onRefreshProject?: () => void;
}

export function MaterialLabModal({
  project,
  projectRoot,
  onClose,
  onNotify,
  onRefreshProject,
}: MaterialLabModalProps) {
  const [state, setState] = useState<MaterialLabState | null>(null);
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [merging, setMerging] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [checking, setChecking] = useState(false);
  const [checkItems, setCheckItems] = useState<MaterialCheckItem[]>([]);
  const [exportFiles, setExportFiles] = useState<string[]>([]);
  const savedSnapshot = useRef("");
  const onNotifyRef = useRef(onNotify);
  const onRefreshProjectRef = useRef(onRefreshProject);
  onNotifyRef.current = onNotify;
  onRefreshProjectRef.current = onRefreshProject;

  const loadState = useCallback(async (options?: { showLoading?: boolean }) => {
    const showLoading = options?.showLoading ?? true;
    if (showLoading) setLoading(true);
    try {
      const res = await fetchMaterialLabState(project.id);
      setState(res.state);
      savedSnapshot.current = JSON.stringify(res.state);
      setDirty(false);
      if (res.warnings?.length) {
        onNotifyRef.current(res.warnings.join("；"), "info");
      }
    } catch (error) {
      onNotifyRef.current(String(error), "error");
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [project.id]);

  useEffect(() => {
    void loadState();
  }, [loadState]);
  const updateState = (next: MaterialLabState) => {
    setState(next);
    setDirty(JSON.stringify(next) !== savedSnapshot.current);
  };

  const handleClose = () => {
    if (dirty && !window.confirm("有未保存的修改，确定关闭材质实验室？")) return;
    onClose();
  };

  const handleSave = async () => {
    if (!state) return;
    setSaving(true);
    try {
      await saveMaterialLabState(project.id, state);
      savedSnapshot.current = JSON.stringify(state);
      setDirty(false);
      onNotifyRef.current("已保存 material_lab.json");
    } catch (error) {
      onNotifyRef.current(String(error), "error");
    } finally {
      setSaving(false);
    }
  };

  const handleRemap = async () => {
    await loadState();
    onNotifyRef.current("已根据贴图标记重新匹配");
  };

  const handleMerge = async () => {
    setMerging(true);
    try {
      const res = await mergeMetallicSmoothness(project.id);
      await loadState();
      onRefreshProjectRef.current?.();
      onNotifyRef.current(res.message ?? "合并完成");
    } catch (error) {
      onNotifyRef.current(String(error), "error");
    } finally {
      setMerging(false);
    }
  };

  const handleCheck = async () => {
    setChecking(true);
    try {
      const res = await checkUnityTextureStandard(project.id);
      setCheckItems(res.items ?? []);
    } catch (error) {
      onNotifyRef.current(String(error), "error");
    } finally {
      setChecking(false);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      if (dirty && state) {
        await saveMaterialLabState(project.id, state);
        savedSnapshot.current = JSON.stringify(state);
        setDirty(false);
      }
      const res = await exportUnityMaterialPackage(project.id);
      setExportFiles(res.files ?? []);
      await loadState({ showLoading: false });
      onNotifyRef.current(res.message ?? "导出完成");
    } catch (error) {
      onNotifyRef.current(String(error), "error");
    } finally {
      setExporting(false);
    }
  };

  const handleOpenExport = async () => {
    try {
      await openMaterialLabExportFolder(project.id);
    } catch (error) {
      onNotifyRef.current(String(error), "error");
    }
  };

  return (
    <div className="modal-overlay material-lab-overlay" onClick={handleClose}>
      <div className="material-lab-modal" onClick={(e) => e.stopPropagation()}>
        <header className="material-lab-header">
          <div>
            <h2>材质实验室</h2>
            <p className="muted">{project.displayName} · 生产项目</p>
          </div>
          <div className="material-lab-header-actions">
            {dirty && <span className="material-lab-dirty">未保存</span>}
            <button type="button" className="preview-action-btn" disabled={saving || !state} onClick={() => void handleSave()}>
              {saving ? "保存中…" : "保存"}
            </button>
            <button type="button" className="preview-action-btn" disabled={checking} onClick={() => void handleCheck()}>
              {checking ? "检查中…" : "检查贴图规范"}
            </button>
            <button type="button" className="preview-action-btn" disabled={exporting || !state} onClick={() => void handleExport()}>
              {exporting ? "导出中…" : "导出 Unity 材质"}
            </button>
            <button type="button" className="preview-action-btn" onClick={() => void handleOpenExport()} title="打开 BlenderWorkspace/UnityAssets/<项目名>/">
              打开 Unity 资产包
            </button>
            <button type="button" className="preview-action-btn" onClick={handleClose}>
              关闭
            </button>
          </div>
        </header>

        {loading || !state ? (
          <div className="material-lab-loading">加载中…</div>
        ) : (
          <div className="material-lab-body">
            <aside className="material-lab-col material-lab-col-left">
              <TextureSlotPanel
                textures={state.textures}
                projectRoot={projectRoot}
                onRemap={() => void handleRemap()}
                onMergeMetallic={() => void handleMerge()}
                merging={merging}
              />
              {checkItems.length > 0 && (
                <div className="material-lab-panel check-panel">
                  <h4>检查结果</h4>
                  <ul className="check-item-list">
                    {checkItems.map((item) => (
                      <li key={item.code + item.message} className={`check-item check-${item.level}`}>
                        <strong>[{item.level}]</strong> {item.message}
                        {item.suggestion && <span className="muted"> — {item.suggestion}</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {exportFiles.length > 0 && (
                <div className="material-lab-panel export-panel">
                  <h4>最近导出</h4>
                  <p className="muted export-panel-hint">
                    导出至 <code>BlenderWorkspace/UnityAssets/&lt;项目名&gt;/</code>（Models · Textures · Shaders · Materials）。
                    首次请将 <code>UnityAssets/Editor/</code> 拷入 Unity；批量导入用菜单 Import All Materials In Folder。
                  </p>
                  <ul className="export-file-list">
                    {exportFiles.map((f) => (
                      <li key={f}>{f}</li>
                    ))}
                  </ul>
                  {state.unity.exportedAt && (
                    <p className="muted">导出时间：{new Date(state.unity.exportedAt).toLocaleString()}</p>
                  )}
                </div>
              )}
            </aside>

            <main className="material-lab-col material-lab-col-center">
              <MaterialPreviewCanvas
                projectRoot={projectRoot}
                modelRelativePath={state.preview.modelPath}
                baseColorRelativePath={state.textures.baseColor.path}
                normalRelativePath={state.textures.normal.path}
                params={state.params}
              />
            </main>

            <aside className="material-lab-col material-lab-col-right">
              <MaterialParamPanel
                params={state.params}
                onChange={(params) => updateState({ ...state, params })}
              />
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}
