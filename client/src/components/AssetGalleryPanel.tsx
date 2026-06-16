import type { ConceptAssetRole, FileNode, TextureMapType } from "../types";
import { ASSET_MARK_ROLES, CONCEPT_ROLE_LABELS, TEXTURE_MAP_TYPES, TEXTURE_TYPE_HINTS } from "../types";
import { canMarkWithRole } from "../lib/assetMarking";
import { canMarkTextureMap } from "../lib/textureMarking";
import { AssetGallery } from "./AssetGallery";

interface AssetGalleryPanelProps {
  assets: FileNode[];
  selectedFile: FileNode | null;
  selectedPath?: string;
  cutPath?: string | null;
  conceptTags?: Record<string, ConceptAssetRole>;
  textureTags?: Record<string, TextureMapType>;
  markEnabled: boolean;
  textureMarkEnabled: boolean;
  onHide: () => void;
  onSelect: (node: FileNode) => void;
  onContextMenu: (e: React.MouseEvent, node: FileNode) => void;
  onBackgroundContextMenu: (e: React.MouseEvent) => void;
  onMarkAsset: (node: FileNode, role: ConceptAssetRole) => void;
  onMarkTexture: (node: FileNode, type: TextureMapType) => void;
}

export function AssetGalleryPanel({
  assets,
  selectedFile,
  selectedPath,
  cutPath,
  conceptTags,
  textureTags,
  markEnabled,
  textureMarkEnabled,
  onHide,
  onSelect,
  onContextMenu,
  onBackgroundContextMenu,
  onMarkAsset,
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
                  {type}
                </button>
              ))}
            </div>
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
          conceptTags={conceptTags}
          textureTags={textureTags}
          onSelect={onSelect}
          onContextMenu={onContextMenu}
          onBackgroundContextMenu={onBackgroundContextMenu}
        />
      </div>
    </section>
  );
}
