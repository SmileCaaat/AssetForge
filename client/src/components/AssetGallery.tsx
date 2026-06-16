import type { ConceptAssetRole, FileNode, TextureMapType } from "../types";
import {
  CONCEPT_ROLE_LABELS,
  TEXTURE_TYPE_LABELS,
  conceptRoleTagClass,
  textureTypeTagClass,
} from "../types";
import { fileUrl, formatSize, isImageFile, isModelFile } from "../api";

interface AssetGalleryProps {
  assets: FileNode[];
  selectedPath?: string;
  cutPath?: string | null;
  conceptTags?: Record<string, ConceptAssetRole>;
  textureTags?: Record<string, TextureMapType>;
  onSelect: (node: FileNode) => void;
  onContextMenu: (e: React.MouseEvent, node: FileNode) => void;
  onBackgroundContextMenu?: (e: React.MouseEvent) => void;
}

function tagClass(
  conceptRole?: ConceptAssetRole,
  textureType?: TextureMapType,
): string {
  if (conceptRole) return conceptRoleTagClass(conceptRole);
  if (textureType) return textureTypeTagClass();
  return "";
}

export function AssetGallery({
  assets,
  selectedPath,
  cutPath,
  conceptTags,
  textureTags,
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
        const conceptRole = conceptTags?.[asset.path];
        const textureType = textureTags?.[asset.path];
        const badgeLabel = conceptRole
          ? CONCEPT_ROLE_LABELS[conceptRole]
          : textureType
            ? TEXTURE_TYPE_LABELS[textureType]
            : null;

        return (
          <button
            key={asset.path}
            className={`asset-card ${asset.path === selectedPath ? "selected" : ""} ${asset.path === cutPath ? "cut" : ""} ${tagClass(conceptRole, textureType)}`}
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
              {badgeLabel && <span className="asset-tag-badge">{badgeLabel}</span>}
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
