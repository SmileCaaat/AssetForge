import type { MaterialLabParams, MaterialLabState } from "./materialLabTypes";
import { TEXTURE_SLOT_LABELS } from "./materialLabTypes";

interface TextureSlotPanelProps {
  textures: MaterialLabState["textures"];
  projectRoot: string | null;
  onRemap: () => void;
  onMergeMetallic: () => void;
  merging: boolean;
}

function slotFileName(relativePath: string): string {
  if (!relativePath) return "—";
  return relativePath.split(/[/\\]/).pop() ?? relativePath;
}

export function TextureSlotPanel({
  textures,
  onRemap,
  onMergeMetallic,
  merging,
}: TextureSlotPanelProps) {
  const slots = Object.entries(textures) as [keyof MaterialLabState["textures"], { path: string; unityProperty: string; colorSpace: string }][];

  return (
    <div className="material-lab-panel texture-slot-panel">
      <div className="material-lab-panel-head">
        <h4>贴图槽</h4>
        <button type="button" className="preview-action-btn" onClick={onRemap}>
          重新匹配
        </button>
      </div>
      <ul className="texture-slot-list">
        {slots.map(([key, slot]) => (
          <li key={key} className={`texture-slot-item ${slot.path ? "found" : "missing"}`}>
            <div className="texture-slot-type">{TEXTURE_SLOT_LABELS[key]}</div>
            <div className="texture-slot-file" title={slot.path || "未设置"}>
              {slotFileName(slot.path)}
            </div>
            <div className="texture-slot-meta">
              <span>{slot.unityProperty}</span>
              <span>{slot.colorSpace}</span>
            </div>
          </li>
        ))}
      </ul>
      <div className="texture-slot-actions">
        <button
          type="button"
          className="preview-action-btn"
          disabled={merging}
          onClick={onMergeMetallic}
          title="从 Metallic + Roughness 生成 T_<Name>_MetallicSmoothness.png（R=Metallic, A=Smoothness）"
        >
          {merging ? "合并中…" : "合并 Metallic + Roughness"}
        </button>
      </div>
    </div>
  );
}

interface MaterialParamPanelProps {
  params: MaterialLabParams;
  onChange: (params: MaterialLabParams) => void;
}

function ColorRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: [number, number, number, number];
  onChange: (v: [number, number, number, number]) => void;
}) {
  const hex = `#${value
    .slice(0, 3)
    .map((c) => Math.round(c * 255).toString(16).padStart(2, "0"))
    .join("")}`;
  return (
    <label className="material-param-row">
      <span>{label}</span>
      <input
        type="color"
        value={hex}
        onChange={(e) => {
          const r = parseInt(e.target.value.slice(1, 3), 16) / 255;
          const g = parseInt(e.target.value.slice(3, 5), 16) / 255;
          const b = parseInt(e.target.value.slice(5, 7), 16) / 255;
          onChange([r, g, b, value[3]]);
        }}
      />
    </label>
  );
}

function SliderRow({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="material-param-row">
      <span>{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span className="material-param-value">{value.toFixed(2)}</span>
    </label>
  );
}

export function MaterialParamPanel({ params, onChange }: MaterialParamPanelProps) {
  const patch = (partial: Partial<MaterialLabParams>) => onChange({ ...params, ...partial });

  return (
    <div className="material-lab-panel material-param-panel">
      <h4>Toon 参数</h4>
      <ColorRow label="Base Tint" value={params.baseColorTint} onChange={(v) => patch({ baseColorTint: v })} />
      <SliderRow label="Saturation" value={params.baseSaturation} min={0} max={3} step={0.05} onChange={(v) => patch({ baseSaturation: v })} />
      <SliderRow label="Value" value={params.baseValue} min={0} max={3} step={0.05} onChange={(v) => patch({ baseValue: v })} />
      <SliderRow label="Contrast" value={params.contrast} min={0} max={1} step={0.01} onChange={(v) => patch({ contrast: v })} />
      <SliderRow label="Ramp Steps" value={params.rampSteps} min={1} max={8} step={1} onChange={(v) => patch({ rampSteps: v })} />
      <SliderRow label="Shadow" value={params.shadowStrength} min={0} max={1} step={0.01} onChange={(v) => patch({ shadowStrength: v })} />
      <ColorRow label="Rim Color" value={params.rimColor} onChange={(v) => patch({ rimColor: v })} />
      <SliderRow label="Rim Power" value={params.rimPower} min={0.5} max={12} step={0.1} onChange={(v) => patch({ rimPower: v })} />
      <SliderRow label="Rim Intensity" value={params.rimIntensity} min={0} max={8} step={0.1} onChange={(v) => patch({ rimIntensity: v })} />
      <SliderRow label="Matcap" value={params.matcapStrength} min={0} max={1} step={0.01} onChange={(v) => patch({ matcapStrength: v })} />
      <label className="material-param-row checkbox-row">
        <span>Outline</span>
        <input
          type="checkbox"
          checked={params.outlineEnabled}
          onChange={(e) => patch({ outlineEnabled: e.target.checked })}
        />
      </label>
      <SliderRow label="Outline Width" value={params.outlineWidth} min={0} max={0.08} step={0.001} onChange={(v) => patch({ outlineWidth: v })} />
      <ColorRow label="Outline Color" value={params.outlineColor} onChange={(v) => patch({ outlineColor: v })} />
    </div>
  );
}
