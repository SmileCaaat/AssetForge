import { useState } from "react";
import { PathPickerField, folderNameFromPath } from "./PathPickerField";

interface OpenMasterWorkspaceModalProps {
  onClose: () => void;
  onOpen: (input: {
    name: string;
    rootPath?: string;
    conceptRoot?: string;
    blenderRoot?: string;
  }) => Promise<void>;
}

export function OpenMasterWorkspaceModal({ onClose, onOpen }: OpenMasterWorkspaceModalProps) {
  const [name, setName] = useState("");
  const [dispersed, setDispersed] = useState(false);
  const [rootPath, setRootPath] = useState("");
  const [conceptRoot, setConceptRoot] = useState("");
  const [blenderRoot, setBlenderRoot] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const maybeFillName = (folderPath: string) => {
    if (!name.trim()) {
      setName(folderNameFromPath(folderPath));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dispersed && !rootPath.trim()) {
      setError("请先浏览选择总工作区根目录");
      return;
    }
    if (dispersed && !conceptRoot.trim() && !blenderRoot.trim()) {
      setError("请至少浏览选择一个概念或生产路径");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await onOpen(
        dispersed
          ? { name: name.trim(), conceptRoot: conceptRoot.trim(), blenderRoot: blenderRoot.trim() }
          : { name: name.trim(), rootPath: rootPath.trim() },
      );
    } catch (err) {
      setError(String(err));
      setSubmitting(false);
    }
  };

  const canSubmit = dispersed
    ? Boolean(conceptRoot.trim() || blenderRoot.trim())
    : Boolean(rootPath.trim());

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>打开工作区</h2>
        <p className="modal-desc">
          浏览选择磁盘上已有的工作区目录，注册到列表中，可与其它工作区并存。
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

          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={dispersed}
              onChange={(e) => setDispersed(e.target.checked)}
            />
            分散路径（概念与生产不在同一根目录）
          </label>

          {!dispersed ? (
            <PathPickerField
              label="总工作区根目录"
              value={rootPath}
              onChange={(next) => {
                setRootPath(next);
                maybeFillName(next);
              }}
              pickTitle="选择已有工作区根目录"
              required
              hint={
                <span className="field-hint">
                  需包含 <code>ConceptWorkspace</code> 与/或 <code>BlenderWorkspace</code>
                </span>
              }
            />
          ) : (
            <>
              <PathPickerField
                label="概念路径 (ConceptWorkspace)"
                value={conceptRoot}
                onChange={(next) => {
                  setConceptRoot(next);
                  maybeFillName(next);
                }}
                pickTitle="选择概念工作区文件夹"
              />
              <PathPickerField
                label="生产路径 (BlenderWorkspace)"
                value={blenderRoot}
                onChange={(next) => {
                  setBlenderRoot(next);
                  if (!name.trim() && !conceptRoot.trim()) {
                    maybeFillName(next);
                  }
                }}
                pickTitle="选择生产工作区文件夹"
              />
              <p className="modal-hint">概念与生产路径至少选择一项。</p>
            </>
          )}

          {error && <p className="form-error">{error}</p>}

          <div className="modal-actions">
            <button type="button" onClick={onClose} disabled={submitting}>
              取消
            </button>
            <button
              type="submit"
              className="btn-primary"
              disabled={submitting || !canSubmit}
            >
              {submitting ? "打开中..." : "打开工作区"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
