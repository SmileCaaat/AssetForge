import { useState } from "react";
import {
  createMasterWorkspace,
  openMasterWorkspace,
} from "../api";
import { NewMasterWorkspaceModal } from "./NewMasterWorkspaceModal";
import { OpenMasterWorkspaceModal } from "./OpenMasterWorkspaceModal";

interface NoWorkspaceScreenProps {
  onReady: () => Promise<unknown>;
}

export function NoWorkspaceScreen({ onReady }: NoWorkspaceScreenProps) {
  const [showNew, setShowNew] = useState(false);
  const [showOpen, setShowOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async (input: { name: string; rootPath: string }) => {
    setError(null);
    await createMasterWorkspace(input);
    await onReady();
    setShowNew(false);
  };

  const handleOpen = async (input: {
    name: string;
    rootPath?: string;
    conceptRoot?: string;
    blenderRoot?: string;
  }) => {
    setError(null);
    await openMasterWorkspace(input);
    await onReady();
    setShowOpen(false);
  };

  return (
    <div className="loading-screen no-workspace-screen">
      <img className="brand-icon-img" src="/app-icon.png" alt="" width={48} height={48} />
      <h1>AssetForge · 资产锻造坊</h1>
      <p>尚未注册总工作区。请打开已有目录，或新建空白工作区。</p>
      <p className="muted">不再使用内置「默认工作区」；路径由你本机配置。</p>
      {error && <p className="form-error">{error}</p>}
      <div className="no-workspace-actions">
        <button type="button" className="btn-primary" onClick={() => setShowOpen(true)}>
          打开工作区
        </button>
        <button type="button" className="btn-ghost" onClick={() => setShowNew(true)}>
          + 新建工作区
        </button>
      </div>

      {showNew && (
        <NewMasterWorkspaceModal
          onClose={() => setShowNew(false)}
          onCreate={handleCreate}
        />
      )}

      {showOpen && (
        <OpenMasterWorkspaceModal
          onClose={() => setShowOpen(false)}
          onOpen={handleOpen}
        />
      )}
    </div>
  );
}
