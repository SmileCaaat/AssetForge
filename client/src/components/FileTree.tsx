import { useEffect, useRef, useState } from "react";
import type { ConceptAssetRole, FileNode, ProductionAssetRole, TextureMapType } from "../types";
import {
  CONCEPT_ROLE_LABELS,
  PRODUCTION_ASSET_LABELS,
  TEXTURE_TYPE_LABELS,
  conceptRoleTagClass,
  productionAssetTagClass,
  textureTypeTagClass,
} from "../types";
import { isImageFile, isModelFile } from "../api";

interface FileTreeProps {
  node: FileNode | null;
  projectRoot: string | null;
  selectedPath?: string;
  renamingPath?: string | null;
  cutPath?: string | null;
  conceptTags?: Record<string, ConceptAssetRole>;
  productionAssetTags?: Record<string, ProductionAssetRole>;
  textureTags?: Record<string, TextureMapType>;
  onSelect: (node: FileNode) => void;
  onContextMenu: (e: React.MouseEvent, node: FileNode) => void;
  onRenameCommit: (node: FileNode, newName: string) => void;
  onRenameCancel: () => void;
  onBackgroundContextMenu: (e: React.MouseEvent) => void;
}

function RenameInput({
  initialName,
  onCommit,
  onCancel,
}: {
  initialName: string;
  onCommit: (name: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initialName);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  return (
    <input
      ref={inputRef}
      className="tree-rename-input"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") onCommit(value);
        if (e.key === "Escape") onCancel();
      }}
      onBlur={() => onCommit(value)}
      onClick={(e) => e.stopPropagation()}
    />
  );
}

function tagClass(
  conceptRole?: ConceptAssetRole,
  productionRole?: ProductionAssetRole,
  textureType?: TextureMapType,
): string {
  if (conceptRole) return conceptRoleTagClass(conceptRole);
  if (productionRole) return productionAssetTagClass(productionRole);
  if (textureType) return textureTypeTagClass();
  return "";
}

function tagLabel(
  conceptRole?: ConceptAssetRole,
  productionRole?: ProductionAssetRole,
  textureType?: TextureMapType,
): string | null {
  if (conceptRole) return CONCEPT_ROLE_LABELS[conceptRole];
  if (productionRole) return PRODUCTION_ASSET_LABELS[productionRole];
  if (textureType) return TEXTURE_TYPE_LABELS[textureType];
  return null;
}

function fileIconClass(node: FileNode): string {
  if (isImageFile(node)) return "tree-kind-icon image-icon";
  if (isModelFile(node)) return "tree-kind-icon model-icon";
  return "tree-kind-icon document-icon";
}

function TreeNode({
  node,
  projectRoot,
  selectedPath,
  renamingPath,
  cutPath,
  conceptTags,
  productionAssetTags,
  textureTags,
  onSelect,
  onContextMenu,
  onRenameCommit,
  onRenameCancel,
  depth = 0,
}: {
  node: FileNode;
  projectRoot: string | null;
  selectedPath?: string;
  renamingPath?: string | null;
  cutPath?: string | null;
  conceptTags?: Record<string, ConceptAssetRole>;
  productionAssetTags?: Record<string, ProductionAssetRole>;
  textureTags?: Record<string, TextureMapType>;
  onSelect: (node: FileNode) => void;
  onContextMenu: (e: React.MouseEvent, node: FileNode) => void;
  onRenameCommit: (node: FileNode, newName: string) => void;
  onRenameCancel: () => void;
  depth?: number;
}) {
  const [expanded, setExpanded] = useState(depth < 2);
  const isSelected = node.path === selectedPath;
  const isCut = node.path === cutPath;
  const isRenaming = node.path === renamingPath;
  const isRoot = projectRoot === node.path;
  const conceptRole = conceptTags?.[node.path];
  const productionRole = productionAssetTags?.[node.path];
  const textureType = textureTags?.[node.path];
  const label = tagLabel(conceptRole, productionRole, textureType);

  if (!node.isDirectory) {
    return (
      <button
        className={`tree-file ${isSelected ? "selected" : ""} ${isCut ? "cut" : ""} ${tagClass(conceptRole, productionRole, textureType)}`}
        style={{ paddingLeft: `${depth * 14 + 8}px` }}
        onClick={() => onSelect(node)}
        onContextMenu={(e) => {
          e.stopPropagation();
          onContextMenu(e, node);
        }}
      >
        {isRenaming ? (
          <RenameInput
            initialName={node.name}
            onCommit={(name) => onRenameCommit(node, name)}
            onCancel={onRenameCancel}
          />
        ) : (
          <>
            <span className={fileIconClass(node)} aria-hidden="true" />
            <span className="tree-node-name">{node.name}</span>
            {label && <span className="tag-badge">{label}</span>}
          </>
        )}
      </button>
    );
  }

  return (
    <div className="tree-folder">
      <div
        className={`tree-folder-row ${isSelected ? "selected" : ""} ${isCut ? "cut" : ""}`}
        style={{ paddingLeft: `${depth * 14 + 8}px` }}
      >
        <button
          type="button"
          className="tree-expand-btn"
          onClick={(e) => {
            e.stopPropagation();
            setExpanded((v) => !v);
          }}
        >
          {expanded ? "▾" : "▸"}
        </button>
        <button
          type="button"
          className="tree-folder-select"
          onClick={() => onSelect(node)}
          onContextMenu={(e) => {
            e.stopPropagation();
            onContextMenu(e, node);
          }}
        >
          {isRenaming ? (
            <RenameInput
              initialName={node.name}
              onCommit={(name) => onRenameCommit(node, name)}
              onCancel={onRenameCancel}
            />
          ) : (
            <>
              <span className="folder-icon" aria-hidden="true" />
              <span className="tree-node-name">{node.name}</span>
              {isRoot && <span className="root-badge">根目录</span>}
            </>
          )}
        </button>
      </div>
      {expanded &&
        node.children?.map((child) => (
          <TreeNode
            key={child.path}
            node={child}
            projectRoot={projectRoot}
            selectedPath={selectedPath}
            renamingPath={renamingPath}
            cutPath={cutPath}
            conceptTags={conceptTags}
            productionAssetTags={productionAssetTags}
            textureTags={textureTags}
            onSelect={onSelect}
            onContextMenu={onContextMenu}
            onRenameCommit={onRenameCommit}
            onRenameCancel={onRenameCancel}
            depth={depth + 1}
          />
        ))}
    </div>
  );
}

export function FileTree({
  node,
  projectRoot,
  selectedPath,
  renamingPath,
  cutPath,
  conceptTags,
  productionAssetTags,
  textureTags,
  onSelect,
  onContextMenu,
  onRenameCommit,
  onRenameCancel,
  onBackgroundContextMenu,
}: FileTreeProps) {
  if (!node) {
    return <div className="empty-list">目录不存在或无法访问</div>;
  }

  return (
    <div
      className="file-tree"
      onContextMenu={(e) => {
        const target = e.target as HTMLElement;
        if (target.closest(".tree-file, .tree-folder-select, .tree-expand-btn")) return;
        onBackgroundContextMenu(e);
      }}
    >
      <TreeNode
        node={node}
        projectRoot={projectRoot}
        selectedPath={selectedPath}
        renamingPath={renamingPath}
        cutPath={cutPath}
        conceptTags={conceptTags}
        productionAssetTags={productionAssetTags}
        textureTags={textureTags}
        onSelect={onSelect}
        onContextMenu={onContextMenu}
        onRenameCommit={onRenameCommit}
        onRenameCancel={onRenameCancel}
      />
    </div>
  );
}
