import { useState } from "react";
import { PathPickerField, folderNameFromPath } from "./PathPickerField";

interface NewMasterWorkspaceModalProps {
  onClose: () => void;
  onCreate: (input: { name: string; rootPath: string }) => Promise<void>;
}

export function NewMasterWorkspaceModal({ onClose, onCreate }: NewMasterWorkspaceModalProps) {
  const [name, setName] = useState("");
  const [rootPath, setRootPath] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRootPathChange = (nextPath: string) => {
    setRootPath(nextPath);
    if (!name.trim()) {
      setName(folderNameFromPath(nextPath));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rootPath.trim()) {
      setError("请先浏览选择根目录");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onCreate({ name: name.trim(), rootPath: rootPath.trim() });
    } catch (err) {
      setError(String(err));
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>新建总工作区</h2>
        <p className="modal-desc">
          浏览选择总工作区根目录后，将自动创建 <code>ConceptWorkspace</code> 与{" "}
          <code>BlenderWorkspace</code> 子目录。
        </p>

        <form onSubmit={(e) => void handleSubmit(e)}>
          <label>
            工作区名称
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="选择文件夹后可自动填入"
              required
              autoFocus
            />
          </label>

          <PathPickerField
            label="根目录"
            value={rootPath}
            onChange={handleRootPathChange}
            pickTitle="选择总工作区根目录"
            required
            hint={
              <span className="field-hint">
                可在对话框中新建文件夹；选定后将在此目录下创建标准子结构。
              </span>
            }
          />

          <div className="name-preview">
            <div className="name-preview-title">将创建结构</div>
            <div className="name-preview-row">
              <code>{rootPath || "..."}\\ConceptWorkspace\\</code>
            </div>
            <div className="name-preview-row">
              <code>{rootPath || "..."}\\BlenderWorkspace\\projects\\</code>
            </div>
          </div>

          {error && <p className="form-error">{error}</p>}

          <div className="modal-actions">
            <button type="button" onClick={onClose} disabled={submitting}>
              取消
            </button>
            <button type="submit" className="btn-primary" disabled={submitting || !rootPath}>
              {submitting ? "创建中..." : "创建工作区"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
