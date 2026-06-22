import type { ConceptAssetRole, FileNode, ProductionAssetRole, TextureMapType } from "../types";
import {
  ANIM_CLIP_NAMES,
  ASSET_MARK_ROLES,
  CONCEPT_ROLE_LABELS,
  PRODUCTION_ASSET_HINTS,
  PRODUCTION_ASSET_LABELS,
  PRODUCTION_ASSET_ROLES,
  TEXTURE_MAP_TYPES,
  TEXTURE_TYPE_HINTS,
  TEXTURE_TYPE_LABELS,
} from "../types";
import { canMarkWithRole } from "../lib/assetMarking";
import { canMarkProductionAsset } from "../lib/productionAssetMarking";
import { canMarkTextureMap } from "../lib/textureMarking";
import { AssetGallery } from "./AssetGallery";

interface AssetGalleryPanelProps {
  assets: FileNode[];
  selectedFile: FileNode | null;
  selectedPath?: string;
  cutPath?: string | null;
  conceptTags?: Record<string, ConceptAssetRole>;
  productionAssetTags?: Record<string, ProductionAssetRole>;
  textureTags?: Record<string, TextureMapType>;
  markEnabled: boolean;
  productionMarkEnabled: boolean;
  textureMarkEnabled: boolean;
  suspendThumbnails?: boolean;
  onHide: () => void;
  onSelect: (node: FileNode) => void;
  onContextMenu: (e: React.MouseEvent, node: FileNode) => void;
  onBackgroundContextMenu: (e: React.MouseEvent) => void;
  onMarkAsset: (node: FileNode, role: ConceptAssetRole) => void;
  onMarkProductionAsset: (node: FileNode, role: ProductionAssetRole) => void;
  onMarkTexture: (node: FileNode, type: TextureMapType) => void;
}

export function AssetGalleryPanel({
  assets,
  selectedFile,
  selectedPath,
  cutPath,
  conceptTags,
  productionAssetTags,
  textureTags,
  markEnabled,
  productionMarkEnabled,
  textureMarkEnabled,
  suspendThumbnails = false,
  onHide,
  onSelect,
  onContextMenu,
  onBackgroundContextMenu,
  onMarkAsset,
  onMarkProductionAsset,
  onMarkTexture,
}: AssetGalleryPanelProps) {
  return (
    <section className="panel asset-gallery-panel">
      <div className="panel-titlebar asset-gallery-titlebar">
        <div className="panel-titlebar-main asset-gallery-titlebar-main">
          <h3>可预览资产</h3>
          {markEnabled && (
            <div className="asset-mark-toolbar">
              {ASSET_MARK_ROLES.map((role) => (
                <button
                  key={role}
                  type="button"
                  className={`asset-mark-btn asset-mark-btn-${role}`}
                  disabled={!selectedFile || !canMarkWithRole(selectedFile, role)}
                  title={`标记为${CONCEPT_ROLE_LABELS[role]}并重命名`}
                  onClick={() => {
                    if (!selectedFile) return;
                    onMarkAsset(selectedFile, role);
                  }}
                >
                  {CONCEPT_ROLE_LABELS[role]}
                </button>
              ))}
            </div>
          )}
          {textureMarkEnabled && (
            <div className="asset-mark-toolbar texture-mark-toolbar">
              {TEXTURE_MAP_TYPES.map((type) => (
                <button
                  key={type}
                  type="button"
                  className="asset-mark-btn texture-mark-btn"
                  disabled={!selectedFile || !canMarkTextureMap(selectedFile)}
                  title={`标记为 ${type}（${TEXTURE_TYPE_HINTS[type]}）并重命名为 T_<项目名>_${type}`}
                  onClick={() => {
                    if (!selectedFile) return;
                    onMarkTexture(selectedFile, type);
                  }}
                >
                  {TEXTURE_TYPE_LABELS[type]}
                </button>
              ))}
            </div>
          )}
          {productionMarkEnabled && (
            <>
              <div className="asset-mark-toolbar production-mark-toolbar">
                {PRODUCTION_ASSET_ROLES.map((role) => (
                  <button
                    key={role}
                    type="button"
                    className={`asset-mark-btn production-mark-btn production-mark-btn-${role}`}
                    disabled={!selectedFile || !canMarkProductionAsset(selectedFile, role)}
                    title={`标记为${PRODUCTION_ASSET_LABELS[role]}：${PRODUCTION_ASSET_HINTS[role]}`}
                    onClick={() => {
                      if (!selectedFile) return;
                      onMarkProductionAsset(selectedFile, role);
                    }}
                  >
                    {PRODUCTION_ASSET_LABELS[role]}
                  </button>
                ))}
              </div>
              <AnimClipChecklist productionAssetTags={productionAssetTags} />
            </>
          )}
        </div>
        <button type="button" className="panel-titlebar-btn" onClick={onHide} title="隐藏画廊">
          ✕
        </button>
      </div>
      <div
        className="panel-scroll"
        onContextMenu={(e) => {
          if (e.target !== e.currentTarget) return;
          onBackgroundContextMenu(e);
        }}
      >
        <AssetGallery
          assets={assets}
          selectedPath={selectedPath}
          cutPath={cutPath}
          suspendThumbnails={suspendThumbnails}
          conceptTags={conceptTags}
          productionAssetTags={productionAssetTags}
          textureTags={textureTags}
          onSelect={onSelect}
          onContextMenu={onContextMenu}
          onBackgroundContextMenu={onBackgroundContextMenu}
        />
      </div>
    </section>
  );
}

/** 显示 10 个标准状态机动画 clip 的已标/缺失情况。 */
function AnimClipChecklist({
  productionAssetTags,
}: {
  productionAssetTags?: Record<string, ProductionAssetRole>;
}) {
  if (!productionAssetTags) return null;

  // Collect clip stems from tagged stateMachineAnim files.
  // e.g. "Lumi_idle.fbx" → "idle", "T-Pose.fbx" → "t-pose"
  const tagged = new Set(
    Object.entries(productionAssetTags)
      .filter(([, role]) => role === "stateMachineAnim")
      .map(([p]) => {
        const base = p.split(/[/\\]/).pop() ?? p;
        const stem = base.replace(/\.[^.]+$/, ""); // strip extension
        // Strip any single leading word-prefix (project name): "Lumi_idle" → "idle"
        const under = stem.indexOf("_");
        return (under > 0 ? stem.slice(under + 1) : stem).toLowerCase();
      }),
  );

  const missing = ANIM_CLIP_NAMES.filter((c) => !tagged.has(c.toLowerCase()));

  if (missing.length === 0) return null;

  return (
    <div className="anim-clip-checklist" title="以下状态机动画 clip 尚未标记">
      <span className="anim-clip-checklist-label">动画缺失：</span>
      {missing.map((clip) => (
        <span key={clip} className="anim-clip-missing-badge">{clip}</span>
      ))}
    </div>
  );
}
