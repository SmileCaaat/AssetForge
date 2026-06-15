import { useCallback, useEffect, useState } from "react";
import {
  fsCopy,
  fsDelete,
  fsMkdir,
  fsMove,
  fsRename,
  parentDir,
} from "../api";
import type { ShortcutConfig } from "../config/shortcuts";
import { isEditableTarget, matchShortcut } from "../config/shortcuts";
import type { FileNode } from "../types";

export interface FileClipboard {
  mode: "copy" | "cut";
  node: FileNode;
}

interface UseFileManagerOptions {
  projectRoot: string | null;
  selectedNode: FileNode | null;
  shortcuts: ShortcutConfig;
  onRefresh: () => Promise<void>;
  onSelect: (node: FileNode | null) => void;
  findNodeByPath?: (path: string) => FileNode | null;
}

export function useFileManager({
  projectRoot,
  selectedNode,
  shortcuts,
  onRefresh,
  onSelect,
}: UseFileManagerOptions) {
  const [clipboard, setClipboard] = useState<FileClipboard | null>(null);
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; type: "info" | "error" } | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    node: FileNode | null;
  } | null>(null);
  const [prompt, setPrompt] = useState<{
    title: string;
    label: string;
    defaultValue: string;
    onConfirm: (value: string) => Promise<void>;
  } | null>(null);

  const notify = useCallback((text: string, type: "info" | "error" = "info") => {
    setMessage({ text, type });
    window.setTimeout(() => setMessage(null), 3000);
  }, []);

  const isRootNode = useCallback(
    (node: FileNode | null) => Boolean(node && projectRoot && node.path === projectRoot),
    [projectRoot],
  );

  const getPasteTargetDir = useCallback((): string | null => {
    if (!projectRoot) return null;
    if (!selectedNode) return projectRoot;
    if (selectedNode.isDirectory) return selectedNode.path;
    return parentDir(selectedNode.path);
  }, [projectRoot, selectedNode]);

  const handleCopy = useCallback(
    (node: FileNode | null = selectedNode) => {
      if (!node || isRootNode(node)) return;
      setClipboard({ mode: "copy", node });
      notify(`已复制: ${node.name}`);
    },
    [selectedNode, isRootNode, notify],
  );

  const handleCut = useCallback(
    (node: FileNode | null = selectedNode) => {
      if (!node || isRootNode(node)) return;
      setClipboard({ mode: "cut", node });
      notify(`已剪切: ${node.name}`);
    },
    [selectedNode, isRootNode, notify],
  );

  const handlePaste = useCallback(async () => {
    if (!clipboard) {
      notify("剪贴板为空", "error");
      return;
    }
    const destDir = getPasteTargetDir();
    if (!destDir) return;

    if (
      clipboard.node.isDirectory &&
      destDir.startsWith(clipboard.node.path) &&
      destDir !== clipboard.node.path
    ) {
      notify("不能将文件夹粘贴到自身内部", "error");
      return;
    }

    try {
      const result =
        clipboard.mode === "copy"
          ? await fsCopy(clipboard.node.path, destDir)
          : await fsMove(clipboard.node.path, destDir);

      if (clipboard.mode === "cut") setClipboard(null);
      await onRefresh();
      notify(clipboard.mode === "copy" ? `已复制到: ${destDir}` : `已移动到: ${destDir}`);
      onSelect({
        ...clipboard.node,
        path: result.path,
        name: result.path.split(/[/\\]/).pop() || clipboard.node.name,
      });
    } catch (error) {
      notify(String(error), "error");
    }
  }, [clipboard, getPasteTargetDir, onRefresh, onSelect, notify]);

  const handleDelete = useCallback(
    async (node: FileNode | null = selectedNode) => {
      if (!node || isRootNode(node)) return;
      if (!window.confirm(`确定删除「${node.name}」？此操作不可撤销。`)) return;

      try {
        await fsDelete(node.path);
        if (clipboard?.node.path === node.path) setClipboard(null);
        if (selectedNode?.path === node.path) onSelect(null);
        await onRefresh();
        notify(`已删除: ${node.name}`);
      } catch (error) {
        notify(String(error), "error");
      }
    },
    [selectedNode, isRootNode, clipboard, onSelect, onRefresh, notify],
  );

  const startRename = useCallback(
    (node: FileNode | null = selectedNode) => {
      if (!node || isRootNode(node)) return;
      setRenamingPath(node.path);
    },
    [selectedNode, isRootNode],
  );

  const commitRename = useCallback(
    async (node: FileNode, newName: string) => {
      setRenamingPath(null);
      const trimmed = newName.trim();
      if (!trimmed || trimmed === node.name) return;

      try {
        const result = await fsRename(node.path, trimmed);
        await onRefresh();
        onSelect({ ...node, path: result.path, name: trimmed });
        notify(`已重命名为: ${trimmed}`);
      } catch (error) {
        notify(String(error), "error");
      }
    },
    [onRefresh, onSelect, notify],
  );

  const cancelRename = useCallback(() => setRenamingPath(null), []);

  const startNewFolder = useCallback(
    (targetNode: FileNode | null = selectedNode) => {
      const parent = targetNode
        ? targetNode.isDirectory
          ? targetNode.path
          : parentDir(targetNode.path)
        : projectRoot;
      if (!parent) return;

      setPrompt({
        title: "新建文件夹",
        label: "文件夹名称",
        defaultValue: "新建文件夹",
        onConfirm: async (name) => {
          try {
            const result = await fsMkdir(parent, name);
            await onRefresh();
            notify(`已创建文件夹: ${name}`);
            onSelect({
              name,
              path: result.path,
              relativePath: name,
              isDirectory: true,
            });
          } catch (error) {
            notify(String(error), "error");
          }
        },
      });
    },
    [selectedNode, projectRoot, onRefresh, onSelect, notify],
  );

  const openContextMenu = useCallback((e: React.MouseEvent, node: FileNode | null) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, node });
  }, []);

  const closeContextMenu = useCallback(() => setContextMenu(null), []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target) && e.key !== "F5") return;
      if (renamingPath) return;

      if (matchShortcut(e, shortcuts.rename)) {
        e.preventDefault();
        startRename();
      } else if (matchShortcut(e, shortcuts.copy)) {
        e.preventDefault();
        handleCopy();
      } else if (matchShortcut(e, shortcuts.cut)) {
        e.preventDefault();
        handleCut();
      } else if (matchShortcut(e, shortcuts.paste)) {
        e.preventDefault();
        void handlePaste();
      } else if (matchShortcut(e, shortcuts.delete)) {
        e.preventDefault();
        void handleDelete();
      } else if (matchShortcut(e, shortcuts.newFolder)) {
        e.preventDefault();
        startNewFolder();
      } else if (matchShortcut(e, shortcuts.refresh)) {
        e.preventDefault();
        void onRefresh();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    shortcuts,
    renamingPath,
    startRename,
    handleCopy,
    handleCut,
    handlePaste,
    handleDelete,
    startNewFolder,
    onRefresh,
  ]);

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    const timer = window.setTimeout(() => {
      window.addEventListener("mousedown", close);
      window.addEventListener("scroll", close, true);
    }, 100);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("mousedown", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [contextMenu]);

  return {
    clipboard,
    renamingPath,
    message,
    contextMenu,
    prompt,
    setPrompt,
    isRootNode,
    handleCopy,
    handleCut,
    handlePaste,
    handleDelete,
    startRename,
    commitRename,
    cancelRename,
    startNewFolder,
    openContextMenu,
    closeContextMenu,
    notify,
  };
}
