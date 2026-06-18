import {
  DEFAULT_PREVIEW_LIGHT_SETTINGS,
  findMatchingPreviewLightPreset,
  PREVIEW_LIGHT_PRESETS,
  type PreviewLightSettings,
} from "./materialPreviewLights";

interface PreviewLightPanelProps {
  lightSettings: PreviewLightSettings;
  onChange: (settings: PreviewLightSettings) => void;
}

function SliderRow({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format?: (v: number) => string;
  onChange: (v: number) => void;
}) {
  const display = format ? format(value) : value.toFixed(2);
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
      <span className="material-param-value">{display}</span>
    </label>
  );
}

function ColorRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: [number, number, number];
  onChange: (v: [number, number, number]) => void;
}) {
  const hex = `#${value
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
          onChange([r, g, b]);
        }}
      />
    </label>
  );
}

/** 预览定向光（角色 / 地形共用，仅影响网页预览，不写 Unity 包） */
export function PreviewLightPanel({ lightSettings, onChange }: PreviewLightPanelProps) {
  const patch = (partial: Partial<PreviewLightSettings>) =>
    onChange({ ...lightSettings, ...partial });

  const activePreset = findMatchingPreviewLightPreset(lightSettings);

  return (
    <div className="preview-light-panel">
      <h4>预览定向光</h4>
      <p className="muted preview-light-hint">
        对齐 Unity 定向光方向与色温。角色与地形共用；辅助线颜色即主光颜色。
      </p>

      <h5 className="preview-light-subtitle">光照预设</h5>
      <div className="material-preset-list preview-light-presets">
        {PREVIEW_LIGHT_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            className={`material-preset-btn${activePreset?.id === preset.id ? " active" : ""}`}
            title={preset.description}
            onClick={() => onChange({ ...preset.settings })}
          >
            {preset.label}
          </button>
        ))}
      </div>
      {activePreset && (
        <p className="material-preset-desc muted">{activePreset.description}</p>
      )}

      <SliderRow
        label="方位角"
        value={lightSettings.azimuth}
        min={0}
        max={360}
        step={1}
        format={(v) => `${v.toFixed(0)}°`}
        onChange={(v) => patch({ azimuth: v })}
      />
      <SliderRow
        label="仰角"
        value={lightSettings.elevation}
        min={5}
        max={85}
        step={1}
        format={(v) => `${v.toFixed(0)}°`}
        onChange={(v) => patch({ elevation: v })}
      />
      <ColorRow
        label="光照颜色"
        value={lightSettings.color}
        onChange={(v) => patch({ color: v })}
      />
      <SliderRow
        label="光照强度"
        value={lightSettings.intensity}
        min={0}
        max={2}
        step={0.02}
        format={(v) => v.toFixed(2)}
        onChange={(v) => patch({ intensity: v })}
      />
      <SliderRow
        label="环境光"
        value={lightSettings.ambientIntensity}
        min={0}
        max={2}
        step={0.05}
        format={(v) => v.toFixed(2)}
        onChange={(v) => patch({ ambientIntensity: v })}
      />
      <button
        type="button"
        className="preview-action-btn preview-light-reset"
        onClick={() => onChange({ ...DEFAULT_PREVIEW_LIGHT_SETTINGS })}
      >
        恢复默认光照
      </button>
    </div>
  );
}
