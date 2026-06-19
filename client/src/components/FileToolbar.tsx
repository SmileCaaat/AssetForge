import { useRef } from "react";
import { formatShortcut, type ShortcutConfig } from "../config/shortcuts";

interface FileToolbarProps {
  shortcuts: ShortcutConfig;
  hasSelection: boolean;
  isRoot: boolean;
  hasClipboard: boolean;
  canImport?: boolean;
  onImportFiles?: (files: FileList) => void | Promise<void>;
  onNewFolder: () => void;
  onRename: () => void;
  onCopy: () => void;
  onCut: () => void;
  onPaste: () => void;
  onDelete: () => void;
  onRefresh: () => void;
  onShowShortcuts: () => void;
  galleryVisible?: boolean;
  onToggleGallery?: () => void;
  showMaterialLab?: boolean;
  onOpenMaterialLab?: () => void;
  showStageLab?: boolean;
  onOpenStageLab?: () => void;
  showRiggingLab?: boolean;
  onOpenRiggingLab?: () => void;
}

export function FileToolbar({
  shortcuts,
  hasSelection,
  isRoot,
  hasClipboard,
  canImport = false,
  onImportFiles,
  onNewFolder,
  onRename,
  onCopy,
  onCut,
  onPaste,
  onDelete,
  onRefresh,
  onShowShortcuts,
  galleryVisible = true,
  onToggleGallery,
  showMaterialLab = false,
  onOpenMaterialLab,
  showStageLab = false,
  onOpenStageLab,
  showRiggingLab = false,
  onOpenRiggingLab,
}: FileToolbarProps) {
  const canModify = hasSelection && !isRoot;
  const importInputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="file-toolbar">
      <button
        disabled={!canImport}
        title="导入外部文件，或拖入文件树区域"
        onClick={() => importInputRef.current?.click()}
      >
        导入
      </button>
      <input
        ref={importInputRef}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files?.length && onImportFiles) {
            void onImportFiles(e.target.files);
          }
          e.target.value = "";
        }}
      />
      <button title={formatShortcut(shortcuts.newFolder)} onClick={onNewFolder}>
        新建文件夹
      </button>
      <button title={formatShortcut(shortcuts.rename)} onClick={onRename} disabled={!canModify}>
        重命名
      </button>
      <span className="toolbar-sep" />
      <button title={formatShortcut(shortcuts.copy)} onClick={onCopy} disabled={!canModify}>
        复制
      </button>
      <button title={formatShortcut(shortcuts.cut)} onClick={onCut} disabled={!canModify}>
        剪切
      </button>
      <button title={formatShortcut(shortcuts.paste)} onClick={onPaste} disabled={!hasClipboard}>
        粘贴
      </button>
      <span className="toolbar-sep" />
      <button
        title={formatShortcut(shortcuts.delete)}
        onClick={onDelete}
        disabled={!canModify}
        className="danger"
      >
        删除
      </button>
      <span className="toolbar-spacer" />
      {onToggleGallery && (
        <button
          onClick={onToggleGallery}
          title={galleryVisible ? "隐藏可预览资产画廊" : "显示可预览资产画廊"}
        >
          {galleryVisible ? "隐藏画廊" : "显示画廊"}
        </button>
      )}
      {showStageLab && onOpenStageLab && (
        <>
          <span className="toolbar-sep" />
          <button type="button" onClick={onOpenStageLab} title="打开地形语义控制图工具">
            地形语义
          </button>
        </>
      )}
      {showRiggingLab && onOpenRiggingLab && (
        <>
          <span className="toolbar-sep" />
          <button type="button" onClick={onOpenRiggingLab} title="打开自动骨骼绑定流程">
            骨骼实验室
          </button>
        </>
      )}
      {showMaterialLab && onOpenMaterialLab && (
        <>
          <span className="toolbar-sep" />
          <button type="button" onClick={onOpenMaterialLab} title="打开材质实验室（仅生产项目）">
            材质实验室
          </button>
        </>
      )}
      <button title={formatShortcut(shortcuts.refresh)} onClick={onRefresh}>
        刷新
      </button>
      <button onClick={onShowShortcuts}>快捷键</button>
    </div>
  );
}
