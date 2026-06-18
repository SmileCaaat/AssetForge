import type { MaterialLabParams, MaterialLabShaderType, MaterialLabState } from "./materialLabTypes";
import { isTerrainMaterialLab } from "./materialLabTypes";
import { TEXTURE_SLOT_LABELS } from "./materialLabTypes";
import {
  findMatchingPreset,
  findMatchingTerrainPreset,
  MATERIAL_LAB_PRESETS,
  TERRAIN_MATERIAL_LAB_PRESETS,
} from "./materialLabPresets";

interface TextureSlotPanelProps {
  textures: MaterialLabState["textures"];
  shaderType: MaterialLabShaderType;
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
  shaderType,
  onRemap,
  onMergeMetallic,
  merging,
}: TextureSlotPanelProps) {
  const isTerrain = shaderType === "toon_terrain_urp";
  const allSlots = Object.entries(textures) as [
    keyof MaterialLabState["textures"],
    { path: string; unityProperty: string; colorSpace: string },
  ][];
  const slots = isTerrain ? allSlots.filter(([key]) => key === "baseColor") : allSlots;

  return (
    <div className="material-lab-panel texture-slot-panel">
      <div className="material-lab-panel-head">
        <h4>贴图槽</h4>
        <button type="button" className="preview-action-btn" onClick={onRemap}>
          重新匹配
        </button>
      </div>
      {isTerrain && (
        <p className="muted texture-slot-terrain-hint">
          地形 Unity 包仅导出 BaseColor；Height 等留在 Blender 置换用。
        </p>
      )}
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
      {!isTerrain && (
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
      )}
    </div>
  );
}

interface MaterialParamPanelProps {
  shaderType: MaterialLabShaderType;
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

function TerrainMaterialParamPanel({ params, onChange }: { params: MaterialLabParams; onChange: (p: MaterialLabParams) => void }) {
  const patch = (partial: Partial<MaterialLabParams>) => onChange({ ...params, ...partial });
  const activePreset = findMatchingTerrainPreset(params);

  return (
    <>
      <h4>参数预设</h4>
      <div className="material-preset-list">
        {TERRAIN_MATERIAL_LAB_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            className={`material-preset-btn${activePreset?.id === preset.id ? " active" : ""}`}
            title={preset.description}
            onClick={() => onChange(preset.params)}
          >
            {preset.label}
          </button>
        ))}
      </div>
      {activePreset && <p className="material-preset-desc muted">{activePreset.description}</p>}

      <h4>地形 Toon 参数</h4>
      <ColorRow label="Base Tint" value={params.baseColorTint} onChange={(v) => patch({ baseColorTint: v })} />
      <SliderRow label="Saturation" value={params.baseSaturation} min={0} max={3} step={0.05} onChange={(v) => patch({ baseSaturation: v })} />
      <SliderRow label="Value" value={params.baseValue} min={0} max={3} step={0.05} onChange={(v) => patch({ baseValue: v })} />
      <SliderRow label="Ramp Steps" value={params.rampSteps} min={2} max={8} step={1} onChange={(v) => patch({ rampSteps: v })} />
      <SliderRow label="Ramp 柔和" value={params.terrainRampBlend ?? 0.18} min={0.05} max={0.45} step={0.01} onChange={(v) => patch({ terrainRampBlend: v })} />
      <SliderRow label="Albedo 保留" value={params.terrainAlbedoInfluence ?? 0.72} min={0.5} max={0.9} step={0.01} onChange={(v) => patch({ terrainAlbedoInfluence: v })} />
      <SliderRow label="Albedo 轻分层" value={params.terrainAlbedoPosterize ?? 0.22} min={0} max={0.6} step={0.01} onChange={(v) => patch({ terrainAlbedoPosterize: v })} />
      <SliderRow label="法线强度" value={params.terrainNormalStrength ?? 1.15} min={0.5} max={1.5} step={0.01} onChange={(v) => patch({ terrainNormalStrength: v })} />
      <ColorRow label="Cel 暗部" value={params.celShadowColor} onChange={(v) => patch({ celShadowColor: v })} />
      <ColorRow label="Cel 亮部" value={params.celHighlightColor} onChange={(v) => patch({ celHighlightColor: v })} />
      <SliderRow label="接收阴影" value={params.shadowReceiveStrength ?? 0.7} min={0} max={1} step={0.01} onChange={(v) => patch({ shadowReceiveStrength: v })} />
      <SliderRow label="环境光" value={params.ambientStrength ?? 0.25} min={0} max={1} step={0.01} onChange={(v) => patch({ ambientStrength: v })} />
      <SliderRow label="远景平滑" value={params.terrainDistanceSmooth ?? 0.35} min={0} max={0.8} step={0.01} onChange={(v) => patch({ terrainDistanceSmooth: v })} />
      <SliderRow label="坡度染色" value={params.terrainSlopeTint ?? 0.12} min={0} max={0.4} step={0.01} onChange={(v) => patch({ terrainSlopeTint: v })} />
    </>
  );
}

function CharacterMaterialParamPanel({ params, onChange }: { params: MaterialLabParams; onChange: (p: MaterialLabParams) => void }) {
  const patch = (partial: Partial<MaterialLabParams>) => onChange({ ...params, ...partial });
  const activePreset = findMatchingPreset(params);

  return (
    <>
      <h4>参数预设</h4>
      <div className="material-preset-list">
        {MATERIAL_LAB_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            className={`material-preset-btn${activePreset?.id === preset.id ? " active" : ""}`}
            title={preset.description}
            onClick={() => onChange(preset.params)}
          >
            {preset.label}
          </button>
        ))}
      </div>
      {activePreset && <p className="material-preset-desc muted">{activePreset.description}</p>}

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
      <SliderRow label="Outline Width" value={params.outlineWidth} min={0} max={0.03} step={0.001} onChange={(v) => patch({ outlineWidth: v })} />
      <ColorRow label="Outline Color" value={params.outlineColor} onChange={(v) => patch({ outlineColor: v })} />
      <SliderRow label="Outline Far Width Scale" value={params.outlineFarWidthScale} min={0} max={1} step={0.01} onChange={(v) => patch({ outlineFarWidthScale: v })} />
      <SliderRow label="Outline Fade Start" value={params.outlineFadeStart} min={-30} max={30} step={1} onChange={(v) => patch({ outlineFadeStart: v })} />
      <SliderRow label="Outline Fade End" value={params.outlineFadeEnd} min={0} max={50} step={0.5} onChange={(v) => patch({ outlineFadeEnd: v })} />
      <SliderRow label="Outline Min Width" value={params.outlineMinWidth} min={0} max={0.01} step={0.001} onChange={(v) => patch({ outlineMinWidth: v })} />
    </>
  );
}

export function MaterialParamPanel({ shaderType, params, onChange }: MaterialParamPanelProps) {
  const isTerrain = isTerrainMaterialLab({ shaderType });

  return (
    <div className="material-lab-panel material-param-panel">
      {isTerrain ? (
        <TerrainMaterialParamPanel params={params} onChange={onChange} />
      ) : (
        <CharacterMaterialParamPanel params={params} onChange={onChange} />
      )}
    </div>
  );
}
