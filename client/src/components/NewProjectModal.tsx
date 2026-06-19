import { useMemo, useState } from "react";
import type { AssetDomain } from "../config/assetDomains";
import { ASSET_DOMAIN_LABELS } from "../config/assetDomains";
import { deriveProjectNames } from "../utils/projectNaming";

interface NewProjectModalProps {
  domain: AssetDomain;
  onClose: () => void;
  onCreate: (input: {
    displayName: string;
    conceptFolderName: string;
    blenderProjectName: string;
  }) => Promise<void>;
}

const PLACEHOLDERS: Record<AssetDomain, string> = {
  character: "例如: Stonemork",
  terrain: "例如: ForestArena",
  scene: "例如: Dungeon01",
  prop: "例如: WoodenCrate",
  ui: "例如: MainMenu",
  vfx: "例如: FireBurst",
};

export function NewProjectModal({ domain, onClose, onCreate }: NewProjectModalProps) {
  const [projectName, setProjectName] = useState("");
  const [customMode, setCustomMode] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [conceptFolderName, setConceptFolderName] = useState("");
  const [blenderProjectName, setBlenderProjectName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const derived = useMemo(() => deriveProjectNames(projectName, domain), [projectName, domain]);
  const finalNames = customMode
    ? { displayName, conceptFolderName, blenderProjectName }
    : derived;

  const handleProjectNameChange = (value: string) => {
    setProjectName(value);
    if (!customMode) {
      const next = deriveProjectNames(value, domain);
      setDisplayName(next.displayName);
      setConceptFolderName(next.conceptFolderName);
      setBlenderProjectName(next.blenderProjectName);
    }
  };

  const toggleCustomMode = () => {
    const next = !customMode;
    if (next) {
      setDisplayName(derived.displayName);
      setConceptFolderName(derived.conceptFolderName);
      setBlenderProjectName(derived.blenderProjectName);
    }
    setCustomMode(next);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await onCreate(finalNames);
    } catch (err) {
      setError(String(err));
      setSubmitting(false);
    }
  };

  const canSubmit =
    finalNames.displayName.trim() &&
    finalNames.conceptFolderName.trim() &&
    finalNames.blenderProjectName.trim();

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>新建项目</h2>
        <p className="modal-desc">
          将在 ConceptWorkspace 和 BlenderWorkspace 中创建关联目录，并按资产大类使用对应结构。
        </p>
        <div className="modal-domain-badge">资产大类：{ASSET_DOMAIN_LABELS[domain]}</div>

        <form onSubmit={(e) => void handleSubmit(e)}>
          <label>
            项目名称
            <input
              value={projectName}
              onChange={(e) => handleProjectNameChange(e.target.value)}
              placeholder={PLACEHOLDERS[domain]}
              required
              autoFocus
            />
          </label>

          <div className="name-preview">
            <div className="name-preview-title">将创建以下目录</div>
            <div className="name-preview-row">
              <span>显示名称</span>
              <code>{finalNames.displayName || "-"}</code>
            </div>
            <div className="name-preview-row">
              <span>概念目录</span>
              <code>ConceptWorkspace/{finalNames.conceptFolderName || "-"}</code>
            </div>
            <div className="name-preview-row">
              <span>生产目录</span>
              <code>BlenderWorkspace/projects/{finalNames.blenderProjectName || "-"}</code>
            </div>
            {domain === "terrain" && (
              <p className="muted name-preview-hint">
                地形项目使用轻量模板，不创建 animations/mixamo。
              </p>
            )}
          </div>

          <button type="button" className="link-btn" onClick={toggleCustomMode}>
            {customMode ? "使用统一命名" : "分别自定义名称"}
          </button>

          {customMode && (
            <div className="custom-names">
              <label>
                显示名称
                <input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  required
                />
              </label>
              <label>
                概念文件夹名
                <input
                  value={conceptFolderName}
                  onChange={(e) => setConceptFolderName(e.target.value)}
                  required
                />
              </label>
              <label>
                Blender 项目名
                <input
                  value={blenderProjectName}
                  onChange={(e) => setBlenderProjectName(e.target.value)}
                  required
                />
              </label>
            </div>
          )}

          {error && <p className="form-error">{error}</p>}

          <div className="modal-actions">
            <button type="button" onClick={onClose} disabled={submitting}>
              取消
            </button>
            <button type="submit" className="btn-primary" disabled={submitting || !canSubmit}>
              {submitting ? "创建中..." : "创建项目"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
