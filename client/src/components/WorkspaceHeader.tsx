import { useEffect, useRef, useState } from "react";
import type { ProjectLink, WorkspaceResponse } from "../types";
import { openWorkspaceFolder } from "../api";

interface WorkspaceHeaderProps {
  workspace: WorkspaceResponse;
  onCreateWorkspace: () => void;
  onOpenWorkspace: () => void;
  onSwitchWorkspace: (workspaceId: string) => void;
  onLinkSuggestion: (suggestion: ProjectLink) => void;
  onSaveAll: () => void;
  saving?: boolean;
  lastSavedAt?: Date | null;
}

export function WorkspaceHeader({
  workspace,
  onCreateWorkspace,
  onOpenWorkspace,
  onSwitchWorkspace,
  onLinkSuggestion,
  onSaveAll,
  saving = false,
  lastSavedAt = null,
}: WorkspaceHeaderProps) {
  const { active, workspaces, unlinked, suggestions } = workspace;
  const [folderMenuOpen, setFolderMenuOpen] = useState(false);
  const [pathsOpen, setPathsOpen] = useState(false);
  const folderRef = useRef<HTMLDivElement>(null);
  const pathsRef = useRef<HTMLDivElement>(null);

  const unlinkedCount = unlinked.conceptOnly.length + unlinked.blenderOnly.length;
  const showAlert = unlinkedCount > 0 || suggestions.length > 0;

  const handleOpenFolder = (target: "root" | "concept" | "blender") => {
    setFolderMenuOpen(false);
    void openWorkspaceFolder(active.id, target);
  };

  const saveTitle = saving
    ? "正在保存…"
    : lastSavedAt
      ? `保存全部 JSON 配置（上次：${lastSavedAt.toLocaleTimeString()}）`
      : "保存全部 JSON 配置";

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (folderRef.current && !folderRef.current.contains(e.target as Node)) {
        setFolderMenuOpen(false);
      }
      if (pathsRef.current && !pathsRef.current.contains(e.target as Node)) {
        setPathsOpen(false);
      }
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  return (
    <header className="top-bar">
      <div className="top-bar-row">
        <div className="top-bar-brand">
          <span className="brand-icon">◆</span>
          <span className="brand-title">资产管理器</span>
        </div>

        <div className="top-bar-divider" />

        <div className="top-bar-workspace">
          <span className="top-bar-label">总工作区</span>
          <select
            className="workspace-select"
            value={workspace.activeWorkspaceId}
            onChange={(e) => onSwitchWorkspace(e.target.value)}
            title={`已注册 ${workspaces.length} 个工作区`}
          >
            {workspaces.map((ws) => (
              <option key={ws.id} value={ws.id}>
                {ws.name}
              </option>
            ))}
          </select>
          <button type="button" className="btn-ghost" onClick={onOpenWorkspace} title="打开已有工作区">
            打开
          </button>
          <button type="button" className="btn-ghost" onClick={onCreateWorkspace} title="新建空白工作区">
            + 新建
          </button>
          <button
            type="button"
            className="btn-ghost btn-save"
            onClick={onSaveAll}
            disabled={saving}
            title={saveTitle}
          >
            {saving ? "保存中…" : "保存"}
          </button>
        </div>

        <div className="top-bar-spacer" />

        <div className="top-bar-actions">
          <div className="dropdown" ref={folderRef}>
            <button
              type="button"
              className={`btn-ghost ${folderMenuOpen ? "active" : ""}`}
              onClick={() => setFolderMenuOpen((v) => !v)}
            >
              打开文件夹 ▾
            </button>
            {folderMenuOpen && (
              <div className="dropdown-menu">
                <button type="button" onClick={() => handleOpenFolder("root")}>
                  根目录
                </button>
                <button type="button" onClick={() => handleOpenFolder("concept")}>
                  ConceptWorkspace
                </button>
                <button type="button" onClick={() => handleOpenFolder("blender")}>
                  BlenderWorkspace
                </button>
              </div>
            )}
          </div>

          <div className="dropdown" ref={pathsRef}>
            <button
              type="button"
              className={`btn-ghost ${pathsOpen ? "active" : ""}`}
              onClick={() => setPathsOpen((v) => !v)}
            >
              路径 ▾
            </button>
            {pathsOpen && (
              <div className="dropdown-menu dropdown-menu-wide">
                <div className="path-item">
                  <span>根目录</span>
                  <code title={active.rootPath || "（分散路径）"}>
                    {active.rootPath || "（分散路径工作区）"}
                  </code>
                </div>
                <div className="path-item">
                  <span>概念</span>
                  <code title={active.conceptRoot}>{active.conceptRoot}</code>
                </div>
                <div className="path-item">
                  <span>生产</span>
                  <code title={active.blenderRoot}>{active.blenderRoot}</code>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {showAlert && (
        <div className="top-bar-alert">
          {unlinkedCount > 0 && (
            <span className="alert-text">
              未关联 {unlinkedCount} 项
              <span className="muted">（打开文件夹放入项目后可关联）</span>
            </span>
          )}
          {suggestions.length > 0 && (
            <div className="alert-actions">
              {suggestions.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="chip-btn"
                  onClick={() => onLinkSuggestion(item)}
                >
                  关联 {item.displayName}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </header>
  );
}
