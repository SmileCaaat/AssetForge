import { useMemo, useState } from "react";
import type { StagePixelTierId } from "./stageSizing";
import type { StageSummary } from "./terrainTypes";
import { STAGE_TYPE_OPTIONS } from "./terrainTypes";
import { STAGE_NEW_HINT } from "./stageWorkflow";
import {
  STAGE_ASPECT_PRESETS,
  STAGE_PIXEL_TIERS,
  computeStageDimensions,
  formatStageDimensionsSummary,
  parseAspectRatio,
  type StageAspectPresetId,
} from "./stageSizing";
import { capitalizeFirstLetter } from "../utils/projectNaming";

interface NewStageFormProps {
  creating: boolean;
  onCreate: (input: {
    stageName: string;
    displayName: string;
    stageType: string;
    aspect: string;
    pixelTier: StagePixelTierId;
  }) => void;
}

export function NewStageForm({ creating, onCreate }: NewStageFormProps) {
  const [name, setName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [stageType, setStageType] = useState<string>(STAGE_TYPE_OPTIONS[0].id);
  const [aspectPreset, setAspectPreset] = useState<StageAspectPresetId>("16:9");
  const [customWidthRatio, setCustomWidthRatio] = useState("5");
  const [customHeightRatio, setCustomHeightRatio] = useState("3");
  const [pixelTier, setPixelTier] = useState<StagePixelTierId>("s");

  const derivedName = capitalizeFirstLetter(name.trim().replace(/\s+/g, "_"));

  const resolvedAspect = useMemo(() => {
    if (aspectPreset === "custom") {
      return parseAspectRatio(`${customWidthRatio}:${customHeightRatio}`);
    }
    const preset = STAGE_ASPECT_PRESETS.find((p) => p.id === aspectPreset);
    if (!preset) return null;
    return parseAspectRatio(preset.id);
  }, [aspectPreset, customWidthRatio, customHeightRatio]);

  const dimensions = useMemo(() => {
    if (!resolvedAspect) return null;
    return computeStageDimensions(resolvedAspect, pixelTier);
  }, [resolvedAspect, pixelTier]);

  const customAspectInvalid =
    aspectPreset === "custom" &&
    (!customWidthRatio.trim() || !customHeightRatio.trim() || !resolvedAspect);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!derivedName || !dimensions) return;
    onCreate({
      stageName: derivedName,
      displayName: displayName.trim() || derivedName,
      stageType,
      aspect: dimensions.aspect,
      pixelTier,
    });
  };

  return (
    <form className="stage-new-form material-lab-panel" onSubmit={handleSubmit}>
      <h4>新建地形语义</h4>
      <p className="muted stage-new-hint">{STAGE_NEW_HINT}</p>

      <label>
        语义名称
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
        地形比例（宽:高）
        <select
          value={aspectPreset}
          onChange={(e) => setAspectPreset(e.target.value as StageAspectPresetId)}
        >
          {STAGE_ASPECT_PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
          <option value="custom">自定义比例…</option>
        </select>
      </label>

      {aspectPreset === "custom" && (
        <div className="stage-aspect-custom-row">
          <label>
            宽
            <input
              type="number"
              min={0.1}
              step={0.1}
              value={customWidthRatio}
              onChange={(e) => setCustomWidthRatio(e.target.value)}
              placeholder="宽"
            />
          </label>
          <span className="stage-aspect-sep">:</span>
          <label>
            高
            <input
              type="number"
              min={0.1}
              step={0.1}
              value={customHeightRatio}
              onChange={(e) => setCustomHeightRatio(e.target.value)}
              placeholder="高"
            />
          </label>
        </div>
      )}
      {customAspectInvalid && (
        <p className="stage-aspect-error muted">请输入有效的宽:高比例（例如 5 和 3）</p>
      )}

      <label>
        像素层级
        <select
          value={pixelTier}
          onChange={(e) => setPixelTier(e.target.value as StagePixelTierId)}
        >
          {STAGE_PIXEL_TIERS.map((tier) => {
            const preview = resolvedAspect
              ? computeStageDimensions(resolvedAspect, tier.id)
              : null;
            return (
              <option key={tier.id} value={tier.id}>
                {tier.label}
                {preview ? ` · ${preview.resolution.width}×${preview.resolution.height}px` : ""}
              </option>
            );
          })}
        </select>
      </label>

      {dimensions && (
        <p className="stage-dimensions-preview muted">
          比例 <strong>{dimensions.aspect}</strong> → {formatStageDimensionsSummary(dimensions)}
        </p>
      )}

      <button
        type="submit"
        className="btn-primary"
        disabled={creating || !derivedName || !dimensions || customAspectInvalid}
      >
        {creating ? "创建中…" : "创建地形语义"}
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
      <h4>地形语义列表</h4>
      {stages.length === 0 ? (
        <p className="muted">暂无地形语义，请在下方新建。</p>
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
