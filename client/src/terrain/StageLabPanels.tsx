import { useState } from "react";
import type { StageSummary } from "./terrainTypes";
import { STAGE_SIZE_PRESETS, STAGE_TYPE_OPTIONS } from "./terrainTypes";
import { STAGE_NEW_HINT } from "./stageWorkflow";
import { capitalizeFirstLetter } from "../utils/projectNaming";

interface NewStageFormProps {
  creating: boolean;
  onCreate: (input: {
    stageName: string;
    displayName: string;
    stageType: string;
    worldSize: { width: number; height: number };
    resolution: { width: number; height: number };
  }) => void;
}

export function NewStageForm({ creating, onCreate }: NewStageFormProps) {
  const [name, setName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [stageType, setStageType] = useState<string>(STAGE_TYPE_OPTIONS[0].id);
  const [sizePreset, setSizePreset] = useState<(typeof STAGE_SIZE_PRESETS)[number]["id"]>("s");

  const preset = STAGE_SIZE_PRESETS.find((p) => p.id === sizePreset) ?? STAGE_SIZE_PRESETS[0];
  const derivedName = capitalizeFirstLetter(name.trim().replace(/\s+/g, "_"));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!derivedName) return;
    onCreate({
      stageName: derivedName,
      displayName: displayName.trim() || derivedName,
      stageType,
      worldSize: preset.worldSize,
      resolution: preset.resolution,
    });
  };

  return (
    <form className="stage-new-form material-lab-panel" onSubmit={handleSubmit}>
      <h4>新建 Stage</h4>
      <p className="muted stage-new-hint">{STAGE_NEW_HINT}</p>

      <label>
        Stage 名称
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="例如: RuinRoad_01"
          required
        />
      </label>
      {derivedName && (
        <p className="muted">
          将创建：<code>TerrainWorkspace/stages/{derivedName}/</code>
        </p>
      )}
      <label>
        显示名称（可选）
        <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
      </label>
      <label>
        场景类型
        <select value={stageType} onChange={(e) => setStageType(e.target.value)}>
          {STAGE_TYPE_OPTIONS.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        尺寸预设（16:9）
        <select
          value={sizePreset}
          onChange={(e) => setSizePreset(e.target.value as typeof sizePreset)}
        >
          {STAGE_SIZE_PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label} · {p.resolution.width}×{p.resolution.height}px
            </option>
          ))}
        </select>
      </label>
      <button type="submit" className="btn-primary" disabled={creating || !derivedName}>
        {creating ? "创建中…" : "创建 Stage"}
      </button>
    </form>
  );
}

interface StageListPanelProps {
  stages: StageSummary[];
  selectedName: string | null;
  deletingName: string | null;
  onSelect: (name: string) => void;
  onDelete: (name: string) => void;
}

export function StageListPanel({
  stages,
  selectedName,
  deletingName,
  onSelect,
  onDelete,
}: StageListPanelProps) {
  return (
    <div className="material-lab-panel stage-list-panel">
      <h4>Stage 列表</h4>
      {stages.length === 0 ? (
        <p className="muted">暂无 Stage，请在下方新建。</p>
      ) : (
        <ul className="stage-list">
          {stages.map((s) => {
            const tags: string[] = [];
            if (s.hasSemanticControl) tags.push("语义");
            if (s.hasBaseColor) tags.push("颜色");
            return (
              <li key={s.stageName} className="stage-list-row">
                <button
                  type="button"
                  className={`stage-list-item${selectedName === s.stageName ? " active" : ""}`}
                  onClick={() => onSelect(s.stageName)}
                >
                  <span className="stage-list-name">{s.displayName}</span>
                  <span className="stage-list-meta muted">
                    {s.stageName}
                    {tags.length > 0 ? ` · ${tags.join(" / ")}` : ""}
                  </span>
                </button>
                <button
                  type="button"
                  className="stage-list-delete danger"
                  title={`删除 ${s.stageName}`}
                  disabled={deletingName === s.stageName}
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(s.stageName);
                  }}
                >
                  {deletingName === s.stageName ? "…" : "删除"}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
