import type { ConceptAssetRole, FileNode } from "../types";
import { ASSET_MARK_ROLES, CONCEPT_ROLE_LABELS } from "../types";
import { canMarkWithRole } from "../lib/assetMarking";
import { AssetGallery } from "./AssetGallery";

interface AssetGalleryPanelProps {
  assets: FileNode[];
  selectedFile: FileNode | null;
  selectedPath?: string;
  cutPath?: string | null;
  conceptTags?: Record<string, ConceptAssetRole>;
  markEnabled: boolean;
  onHide: () => void;
  onSelect: (node: FileNode) => void;
  onContextMenu: (e: React.MouseEvent, node: FileNode) => void;
  onBackgroundContextMenu: (e: React.MouseEvent) => void;
  onMarkAsset: (node: FileNode, role: ConceptAssetRole) => void;
}

export function AssetGalleryPanel({
  assets,
  selectedFile,
  selectedPath,
  cutPath,
  conceptTags,
  markEnabled,
  onHide,
  onSelect,
  onContextMenu,
  onBackgroundContextMenu,
  onMarkAsset,
}: AssetGalleryPanelProps) {
  return (
    <section className="panel">
      <div className="panel-titlebar">
        <div className="panel-titlebar-main">
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
          onSelect={onSelect}
          onContextMenu={onContextMenu}
          onBackgroundContextMenu={onBackgroundContextMenu}
        />
      </div>
    </section>
  );
}
