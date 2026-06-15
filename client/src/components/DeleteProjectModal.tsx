import { useState } from "react";
import type { ActiveWorkspace, ProjectLink } from "../types";

interface DeleteProjectModalProps {
  project: ProjectLink;
  active: ActiveWorkspace;
  onClose: () => void;
  onConfirm: (deleteFolders: boolean) => Promise<void>;
}

export function DeleteProjectModal({
  project,
  active,
  onClose,
  onConfirm,
}: DeleteProjectModalProps) {
  const [deleteFolders, setDeleteFolders] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await onConfirm(deleteFolders);
    } catch (err) {
      setError(String(err));
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>删除项目</h2>
        <p className="modal-desc">
          确定要删除项目「<strong>{project.displayName}</strong>」吗？
        </p>

        <form onSubmit={(e) => void handleSubmit(e)}>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={deleteFolders}
              onChange={(e) => setDeleteFolders(e.target.checked)}
            />
            <span>同时删除磁盘上的概念与生产文件夹（不可恢复）</span>
          </label>

          {deleteFolders && (
            <div className="delete-preview">
              <div>
                <span>概念</span>
                <code>{active.conceptRoot}\{project.conceptPath}</code>
              </div>
              <div>
                <span>生产</span>
                <code>{active.blenderRoot}\{project.blenderPath}</code>
              </div>
            </div>
          )}

          {!deleteFolders && (
            <p className="modal-hint">不勾选时仅从工具列表中移除，磁盘文件夹会保留。</p>
          )}

          {error && <p className="form-error">{error}</p>}

          <div className="modal-actions">
            <button type="button" onClick={onClose} disabled={submitting}>
              取消
            </button>
            <button type="submit" className="btn-danger" disabled={submitting}>
              {submitting ? "删除中..." : "确认删除"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
