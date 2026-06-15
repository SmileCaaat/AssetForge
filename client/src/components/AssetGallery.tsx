import type { ConceptAssetRole, FileNode } from "../types";
import { CONCEPT_ROLE_LABELS, conceptRoleTagClass } from "../types";
import { fileUrl, formatSize, isImageFile, isModelFile } from "../api";

interface AssetGalleryProps {
  assets: FileNode[];
  selectedPath?: string;
  cutPath?: string | null;
  conceptTags?: Record<string, ConceptAssetRole>;
  onSelect: (node: FileNode) => void;
  onContextMenu: (e: React.MouseEvent, node: FileNode) => void;
  onBackgroundContextMenu?: (e: React.MouseEvent) => void;
}

function tagClass(role?: ConceptAssetRole): string {
  return conceptRoleTagClass(role);
}

export function AssetGallery({
  assets,
  selectedPath,
  cutPath,
  conceptTags,
  onSelect,
  onContextMenu,
  onBackgroundContextMenu,
}: AssetGalleryProps) {
  if (assets.length === 0) {
    return (
      <div
        className="asset-gallery asset-gallery-empty"
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onBackgroundContextMenu?.(e);
        }}
      >
        <div className="empty-list">暂无可预览资产</div>
      </div>
    );
  }

  return (
    <div
      className="asset-gallery"
      onContextMenu={(e) => {
        const target = e.target as HTMLElement;
        if (target.closest(".asset-card")) return;
        e.preventDefault();
        e.stopPropagation();
        onBackgroundContextMenu?.(e);
      }}
    >
      {assets.map((asset) => {
        const role = conceptTags?.[asset.path];
        return (
          <button
            key={asset.path}
            className={`asset-card ${asset.path === selectedPath ? "selected" : ""} ${asset.path === cutPath ? "cut" : ""} ${tagClass(role)}`}
            onClick={() => onSelect(asset)}
            onContextMenu={(e) => {
              e.stopPropagation();
              onContextMenu(e, asset);
            }}
          >
            <div className="asset-thumb">
              {isImageFile(asset) ? (
                <img src={fileUrl(asset.path)} alt={asset.name} loading="lazy" />
              ) : isModelFile(asset) ? (
                <div className="model-placeholder">3D</div>
              ) : (
                <div className="model-placeholder">BLEND</div>
              )}
              {role && (
                <span className="asset-tag-badge">{CONCEPT_ROLE_LABELS[role]}</span>
              )}
            </div>
            <div className="asset-meta">
              <span className="asset-name" title={asset.relativePath}>
                {asset.name}
              </span>
              <span className="asset-size">{formatSize(asset.size)}</span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
