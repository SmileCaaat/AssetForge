import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fileUrl, isModelFile } from "../api";
import { copyPathToClipboard } from "../lib/copyPath";
import { clearThreeLoaderCache } from "../lib/threeCleanup";
import { ModelViewer } from "../components/ModelViewer";
import type { FileNode, ProjectLink } from "../types";
import { RigPreviewViewer } from "./RigPreviewViewer";
import {
  clearRiggingJobs,
  fetchRiggingHealth,
  fetchRiggingJob,
  fetchRiggingState,
  openRiggingOutputFolder,
  runRigging,
} from "./riggingApi";
import type { RiggingHealth, RiggingJobState, RiggingLabState, RiggingSettings } from "./riggingTypes";

interface RiggingLabModalProps {
  project: ProjectLink;
  projectRoot: string | null;
  selectedFile: FileNode | null;
  onClose: () => void;
  onNotify: (message: string, type?: "info" | "error") => void;
  onRefreshProject?: () => void;
}

function extensionFromPath(filePath: string): string {
  const name = filePath.split(/[\\/]/).pop() ?? "";
  const index = name.lastIndexOf(".");
  return index >= 0 ? name.slice(index).toLowerCase() : "";
}

function statusLabel(status?: RiggingJobState["status"]): string {
  if (status === "queued") return "排队中";
  if (status === "running") return "生成中";
  if (status === "completed") return "已完成";
  if (status === "failed") return "失败";
  return "待机";
}

function healthLine(health: RiggingHealth | null): string {
  if (!health) return "正在检查服务...";
  if (health.ok) return "骨骼运行环境与 Blender 服务已就绪";
  const issues = [
    !health.runtime.ok ? "骨骼运行环境缺失" : "",
    !health.bpy.ok ? "Blender 服务离线" : "",
    !health.models.skintokensCheckpoint ? "绑定模型缺失" : "",
    !health.models.skinVae ? "蒙皮 VAE 缺失" : "",
    !health.models.qwenConfig ? "Qwen 配置缺失" : "",
  ].filter(Boolean);
  return issues.join("，") || "服务未就绪";
}

export function RiggingLabModal({
  project,
  projectRoot,
  selectedFile,
  onClose,
  onNotify,
  onRefreshProject,
}: RiggingLabModalProps) {
  const initialInput = selectedFile && isModelFile(selectedFile) ? selectedFile.path : "";
  const [state, setState] = useState<RiggingLabState | null>(null);
  const [health, setHealth] = useState<RiggingHealth | null>(null);
  const [inputPath, setInputPath] = useState(initialInput);
  const [settings, setSettings] = useState<Partial<RiggingSettings>>({});
  const [activeJob, setActiveJob] = useState<RiggingJobState | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [checkingHealth, setCheckingHealth] = useState(false);
  const onNotifyRef = useRef(onNotify);
  const onRefreshProjectRef = useRef(onRefreshProject);
  onNotifyRef.current = onNotify;
  onRefreshProjectRef.current = onRefreshProject;

  const mergedSettings = useMemo(
    () => ({ ...(state?.lastSettings ?? {}), ...settings }) as Partial<RiggingSettings>,
    [settings, state?.lastSettings],
  );
  const inputExtension = extensionFromPath(inputPath);
  const latestCompletedJob =
    activeJob?.status === "completed"
      ? activeJob
      : state?.jobs.find((job) => job.status === "completed");
  const expectedOutputPath = activeJob?.projectOutputPath ?? "";
  const outputPath = latestCompletedJob?.projectOutputPath ?? "";
  const outputRelativePath =
    latestCompletedJob?.projectOutputRelativePath ??
    activeJob?.projectOutputRelativePath ??
    "Waiting for output";
  const outputExtension = extensionFromPath(outputPath);
  const canPreviewInput = inputPath && inputExtension === ".fbx";
  const canPreviewOutput = Boolean(outputPath && outputExtension === ".fbx");
  const canRun = Boolean(inputPath.trim()) && !running;

  const loadState = useCallback(async () => {
    const res = await fetchRiggingState(project.id);
    setState(res.state);
    setSettings(res.state.lastSettings);
    setActiveJob(res.state.jobs[0] ?? null);
  }, [project.id]);

  const loadHealth = useCallback(async () => {
    setCheckingHealth(true);
    try {
      const res = await fetchRiggingHealth(project.id);
      setHealth(res.health);
    } catch (error) {
      onNotifyRef.current(String(error), "error");
    } finally {
      setCheckingHealth(false);
    }
  }, [project.id]);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        await Promise.all([loadState(), loadHealth()]);
      } catch (error) {
        onNotifyRef.current(String(error), "error");
      } finally {
        setLoading(false);
      }
    })();
  }, [loadHealth, loadState]);

  useEffect(() => {
    if (!activeJob || activeJob.status === "completed" || activeJob.status === "failed") return undefined;
    const timer = window.setInterval(() => {
      void (async () => {
        try {
          const res = await fetchRiggingJob(project.id, activeJob.id);
          setState(res.state);
          setActiveJob(res.job);
          if (res.job.status === "completed") {
            setRunning(false);
            onRefreshProjectRef.current?.();
            onNotifyRef.current("绑定 FBX 已保存到项目输出目录");
          }
          if (res.job.status === "failed") {
            setRunning(false);
            onNotifyRef.current(res.job.error ?? "骨骼绑定失败", "error");
          }
        } catch (error) {
          setRunning(false);
          onNotifyRef.current(String(error), "error");
        }
      })();
    }, 2000);
    return () => window.clearInterval(timer);
  }, [activeJob, project.id]);

  const handleUseSelected = () => {
    if (!selectedFile || !isModelFile(selectedFile)) {
      onNotifyRef.current("请先在文件树中选择 FBX/GLB/OBJ 模型", "error");
      return;
    }
    setInputPath(selectedFile.path);
  };

  const handleRun = async () => {
    if (!canRun) return;
    setRunning(true);
    try {
      const res = await runRigging(project.id, inputPath.trim(), mergedSettings);
      setState(res.state);
      setActiveJob(res.job);
      onNotifyRef.current("骨骼绑定任务已提交");
    } catch (error) {
      setRunning(false);
      onNotifyRef.current(String(error), "error");
    }
  };

  const handleOpenOutput = async () => {
    try {
      await openRiggingOutputFolder(project.id);
    } catch (error) {
      onNotifyRef.current(String(error), "error");
    }
  };

  const handleCopyOutput = async () => {
    if (!outputPath) return;
    await copyPathToClipboard(outputPath);
    onNotifyRef.current("输出路径已复制");
  };

  const handleClearResults = async () => {
    try {
      const res = await clearRiggingJobs(project.id);
      clearThreeLoaderCache();
      setState(res.state);
      setActiveJob(null);
      setRunning(false);
      onNotifyRef.current("骨骼结果缓存已清空");
    } catch (error) {
      onNotifyRef.current(String(error), "error");
    }
  };

  return (
    <div className="modal-overlay material-lab-overlay rigging-lab-overlay" onClick={onClose}>
      <div className="material-lab-modal rigging-lab-modal" onClick={(e) => e.stopPropagation()}>
        <header className="material-lab-header rigging-lab-header">
          <div>
            <h2>骨骼实验室</h2>
            <p className="muted">{project.displayName} · 平台原生骨骼流程</p>
          </div>
          <div className="material-lab-header-actions">
            <span className={`rigging-status-pill status-${activeJob?.status ?? "idle"}`}>
              {statusLabel(activeJob?.status)}
            </span>
            <button type="button" className="preview-action-btn" disabled={checkingHealth} onClick={() => void loadHealth()}>
              {checkingHealth ? "检查中..." : "检查服务"}
            </button>
            <button type="button" className="preview-action-btn" onClick={handleOpenOutput}>
              打开输出
            </button>
            <button type="button" className="preview-action-btn" onClick={() => void handleClearResults()}>
              清空
            </button>
            <button type="button" className="preview-action-btn" onClick={onClose}>
              关闭
            </button>
          </div>
        </header>

        {loading || !state ? (
          <div className="material-lab-loading">正在加载骨骼流程...</div>
        ) : (
          <div className="rigging-lab-body">
            <section className="rigging-preview-column">
              <div className="rigging-panel-head">
                <div>
                  <h3>输入模型</h3>
                  <span className="muted">{projectRoot ?? state.projectRoot}</span>
                </div>
                <button type="button" className="preview-action-btn" onClick={handleUseSelected}>
                  使用所选
                </button>
              </div>
              <input
                className="rigging-path-input"
                value={inputPath}
                onChange={(e) => setInputPath(e.target.value)}
                placeholder="选择或粘贴 FBX 路径"
              />
              <div className="rigging-viewer-frame">
                {canPreviewInput ? (
                  <ModelViewer filePath={inputPath} extension={inputExtension} />
                ) : (
                  <div className="preview-fallback">
                    {inputPath ? `暂不支持预览 ${inputExtension || "未知格式"}` : "请选择 FBX 模型"}
                  </div>
                )}
              </div>
            </section>

            <section className="rigging-workflow-column">
              <div className="rigging-action-strip">
                <button type="button" className="preview-action-btn" onClick={handleUseSelected}>
                  1 选择
                </button>
                <button type="button" className="preview-action-btn" onClick={() => void loadHealth()}>
                  2 检查
                </button>
                <button type="button" className="preview-action-btn primary" disabled={!canRun} onClick={() => void handleRun()}>
                  {running ? "绑定中..." : "3 自动绑定"}
                </button>
                <button type="button" className="preview-action-btn" disabled={!outputPath} onClick={() => void handleCopyOutput()}>
                  4 复制输出
                </button>
              </div>

              <div className="material-lab-panel rigging-settings-panel">
                <h4>流程设置</h4>
                <label>
                  输出格式
                  <select
                    value={mergedSettings.outputFormat ?? ".fbx"}
                    onChange={(e) => setSettings((prev) => ({ ...prev, outputFormat: e.target.value as RiggingSettings["outputFormat"] }))}
                  >
                    <option value=".fbx">FBX</option>
                    <option value=".glb">GLB</option>
                    <option value=".obj">OBJ</option>
                  </select>
                </label>
                <label>
                  骨骼命名
                  <select
                    value={mergedSettings.boneNames ?? "articulated"}
                    onChange={(e) => setSettings((prev) => ({ ...prev, boneNames: e.target.value as RiggingSettings["boneNames"] }))}
                  >
                    <option value="articulated">通用骨架</option>
                    <option value="mixamo">Mixamo</option>
                    <option value="ue5">UE5</option>
                  </select>
                </label>
                <label className="rigging-checkbox-row">
                  <input
                    type="checkbox"
                    checked={mergedSettings.useTransfer ?? true}
                    onChange={(e) => setSettings((prev) => ({ ...prev, useTransfer: e.target.checked }))}
                  />
                  保留材质与贴图
                </label>
                <label className="rigging-checkbox-row">
                  <input
                    type="checkbox"
                    checked={mergedSettings.usePostprocess ?? true}
                    onChange={(e) => setSettings((prev) => ({ ...prev, usePostprocess: e.target.checked }))}
                  />
                  后处理结果
                </label>
              </div>

              <div className="material-lab-panel rigging-status-panel">
                <h4>服务状态</h4>
                <p>{healthLine(health)}</p>
                <div className="rigging-status-grid">
                  <span>运行环境</span>
                  <strong>{health?.runtime.ok ? "正常" : "缺失"}</strong>
                  <span>Blender</span>
                  <strong>{health?.bpy.ok ? "正常" : "离线"}</strong>
                  <span>队列</span>
                  <strong>{health ? `${health.runtime.queueRunning ?? 0}/${health.runtime.queuePending ?? 0}` : "-"}</strong>
                </div>
              </div>

              {activeJob?.error && (
                <div className="material-lab-panel rigging-error-panel">
                  <h4>错误</h4>
                  <pre>{activeJob.error}</pre>
                </div>
              )}
            </section>

            <section className="rigging-preview-column">
              <div className="rigging-panel-head">
                <div className="rigging-panel-title">
                  <h3>绑定结果</h3>
                  <span className="muted">{outputRelativePath}</span>
                </div>
                <div className="rigging-panel-actions">
                  <button type="button" className="preview-action-btn" disabled={!outputPath} onClick={() => void handleCopyOutput()}>
                    复制路径
                  </button>
                  <button type="button" className="preview-action-btn" disabled={!activeJob && !outputPath} onClick={() => void handleClearResults()}>
                    清空结果
                  </button>
                </div>
              </div>
              <div className="rigging-output-meta">
                <code>{outputPath || expectedOutputPath || "尚未生成绑定文件"}</code>
                {outputPath && (
                  <a href={fileUrl(outputPath)} target="_blank" rel="noreferrer">
                    打开原始文件
                  </a>
                )}
              </div>
              <div className="rigging-viewer-frame">
                {canPreviewOutput ? (
                  <RigPreviewViewer filePath={outputPath} extension={outputExtension} />
                ) : (
                  <div className="preview-fallback">
                    {activeJob?.status === "running"
                      ? "正在自动绑定。导出完成后会加载绑定结果预览。"
                      : expectedOutputPath
                        ? "正在等待绑定 FBX 写入。"
                        : "运行自动绑定后查看结果"}
                  </div>
                )}
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
