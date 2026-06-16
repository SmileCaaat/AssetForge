import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ConceptAssetRole,
  FileNode,
  ProjectLink,
  ProjectSide,
  TextureMapType,
  TextureResizePreset,
  WorkspaceResponse,
} from "./types";
import { CONCEPT_ROLE_LABELS, TEXTURE_TYPE_LABELS } from "./types";
import {
  createMasterWorkspace,
  createProject,
  deleteProject,
  fetchConceptTags,
  fetchProjectAssets,
  fetchProjectTree,
  fetchShortcuts,
  fetchTextureTags,
  importFilesToDirectory,
  isImageFile,
  markConceptAsset,
  markTextureMap,
  mirrorImageFile,
  resizeTextureImage,
  openMasterWorkspace,
  saveAllData,
  switchActiveWorkspace,
} from "./api";
import { DEFAULT_SHORTCUTS, type ShortcutConfig } from "./config/shortcuts";
import { AssetGalleryPanel } from "./components/AssetGalleryPanel";
import { FileTree } from "./components/FileTree";
import { NewProjectModal } from "./components/NewProjectModal";
import { NewMasterWorkspaceModal } from "./components/NewMasterWorkspaceModal";
import { OpenMasterWorkspaceModal } from "./components/OpenMasterWorkspaceModal";
import { DeleteProjectModal } from "./components/DeleteProjectModal";
import { PreviewPanel } from "./components/PreviewPanel";
import { ImageSplitModal } from "./components/ImageSplitModal";
import { ProjectSidebar } from "./components/ProjectSidebar";
import { WorkspaceHeader } from "./components/WorkspaceHeader";
import { FileToolbar } from "./components/FileToolbar";
import { ExternalImportZone } from "./components/ExternalImportZone";
import {
  ContextMenu,
  PromptDialog,
  ShortcutsPanel,
  Toast,
} from "./components/FileOperationsUI";
import { useFileManager } from "./hooks/useFileManager";
import { useAutoSave } from "./hooks/useAutoSave";
import { copyPathToClipboard, resolveCopyPathTarget, resolveCurrentDirectoryPath } from "./lib/copyPath";

interface AppProps {
  workspace: WorkspaceResponse;
  onRefresh: () => Promise<WorkspaceResponse>;
}

export default function App({ workspace, onRefresh }: AppProps) {
  const { active } = workspace;
  const projects = active.projects;

  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    projects[0]?.id ?? null,
  );
  const [side, setSide] = useState<ProjectSide>("concept");
  const [tree, setTree] = useState<FileNode | null>(null);
  const [projectRoot, setProjectRoot] = useState<string | null>(null);
  const [assets, setAssets] = useState<FileNode[]>([]);
  const [selectedFile, setSelectedFile] = useState<FileNode | null>(null);
  const [showNewProject, setShowNewProject] = useState(false);
  const [showNewMasterWorkspace, setShowNewMasterWorkspace] = useState(false);
  const [showOpenMasterWorkspace, setShowOpenMasterWorkspace] = useState(false);
  const [deletingProject, setDeletingProject] = useState<ProjectLink | null>(null);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [loadingProject, setLoadingProject] = useState(false);
  const [shortcuts, setShortcuts] = useState<ShortcutConfig>(DEFAULT_SHORTCUTS);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [galleryCollapsed, setGalleryCollapsed] = useState(false);
  const [conceptTags, setConceptTags] = useState<Record<string, ConceptAssetRole>>({});
  const [textureTags, setTextureTags] = useState<Record<string, TextureMapType>>({});
  const [splitFile, setSplitFile] = useState<FileNode | null>(null);
  const [savingAll, setSavingAll] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);

  const selectedProject = projects.find((p) => p.id === selectedProjectId) ?? null;

  useEffect(() => {
    if (!projects.some((p) => p.id === selectedProjectId)) {
      setSelectedProjectId(projects[0]?.id ?? null);
      setSelectedFile(null);
    }
  }, [projects, selectedProjectId]);

  useEffect(() => {
    void fetchShortcuts().then(setShortcuts).catch(() => setShortcuts(DEFAULT_SHORTCUTS));
  }, []);

  const reloadProjectFiles = useCallback(async () => {
    if (!selectedProjectId) return;
    try {
      const [treeRes, assetsRes] = await Promise.all([
        fetchProjectTree(selectedProjectId, side),
        fetchProjectAssets(selectedProjectId, side),
      ]);
      setProjectRoot(treeRes.root);
      setTree(treeRes.tree);
      setAssets(assetsRes.assets);

      if (side === "concept") {
        const tagRes = await fetchConceptTags(selectedProjectId);
        setConceptTags(tagRes.tags);
        setTextureTags({});
      } else {
        const tagRes = await fetchTextureTags(selectedProjectId);
        setTextureTags(tagRes.tags);
        setConceptTags({});
      }
    } catch (error) {
      setProjectRoot(null);
      setTree(null);
      setAssets([]);
      setConceptTags({});
      setTextureTags({});
      setSelectedFile(null);
      throw error;
    }
  }, [selectedProjectId, side]);

  useEffect(() => {
    if (!selectedProjectId) return;

    let cancelled = false;
    setLoadingProject(true);

    reloadProjectFiles()
      .then(() => {
        if (!cancelled) setSelectedFile(null);
      })
      .catch((error) => {
        if (!cancelled) {
          console.error(error);
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingProject(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedProjectId, side, reloadProjectFiles]);

  const fileManager = useFileManager({
    projectRoot,
    selectedNode: selectedFile,
    shortcuts,
    onRefresh: reloadProjectFiles,
    onSelect: setSelectedFile,
  });

  const lastAutoLinkedKeyRef = useRef("");

  useEffect(() => {
    const linked = workspace.autoLinked;
    if (!linked?.length) return;
    const key = linked.map((p) => p.id).join(",");
    if (lastAutoLinkedKeyRef.current === key) return;
    lastAutoLinkedKeyRef.current = key;
    const names = linked.map((p) => p.displayName).join("、");
    fileManager.notify(`已自动关联 ${linked.length} 个项目：${names}`);
  }, [workspace.autoLinked, fileManager]);

  useEffect(() => {
    if (selectedProjectId && projects.some((p) => p.id === selectedProjectId)) return;
    if (projects[0]) setSelectedProjectId(projects[0].id);
  }, [projects, selectedProjectId]);

  const handleSaveAll = useCallback(
    async (silent = false) => {
      if (savingAll) return;
      setSavingAll(true);
      try {
        const result = await saveAllData();
        setLastSavedAt(new Date(result.savedAt));
        if (side === "concept" && selectedProjectId) {
          const tagRes = await fetchConceptTags(selectedProjectId);
          setConceptTags(tagRes.tags);
        }
        if (side === "blender" && selectedProjectId) {
          const tagRes = await fetchTextureTags(selectedProjectId);
          setTextureTags(tagRes.tags);
        }
        if (!silent) {
          fileManager.notify(`已保存 ${result.files.length} 个 JSON 配置文件`);
        }
      } catch (error) {
        if (!silent) {
          fileManager.notify(String(error), "error");
        } else {
          console.error("Auto save failed:", error);
        }
      } finally {
        setSavingAll(false);
      }
    },
    [savingAll, side, selectedProjectId, fileManager],
  );

  useAutoSave(handleSaveAll);

  const handleMarkAsset = async (node: FileNode, role: ConceptAssetRole) => {
    if (!selectedProjectId) return;
    try {
      const result = await markConceptAsset(selectedProjectId, node.path, role);
      await reloadProjectFiles();
      setSelectedFile({
        ...node,
        path: result.path,
        name: result.name,
        relativePath: result.relativePath,
      });
      fileManager.notify(`已标记为${CONCEPT_ROLE_LABELS[role]}: ${result.name}`);
    } catch (error) {
      fileManager.notify(String(error), "error");
    }
  };

  const handleMarkTexture = async (node: FileNode, type: TextureMapType) => {
    if (!selectedProjectId) return;
    try {
      const result = await markTextureMap(selectedProjectId, node.path, type);
      await reloadProjectFiles();
      setSelectedFile({
        ...node,
        path: result.path,
        name: result.name,
        relativePath: result.relativePath,
      });
      fileManager.notify(`已标记为 ${TEXTURE_TYPE_LABELS[type]}: ${result.name}`);
    } catch (error) {
      fileManager.notify(String(error), "error");
    }
  };

  const handleResizeTexture = async (node: FileNode, size: TextureResizePreset) => {
    try {
      const result = await resizeTextureImage(node.path, size);
      await reloadProjectFiles();
      setSelectedFile({
        ...node,
        path: result.path,
        size: result.fileSize,
      });
      fileManager.notify(`已转换为 ${result.width}×${result.height}`);
    } catch (error) {
      fileManager.notify(String(error), "error");
    }
  };

  const handleMirrorImage = async (
    node: FileNode,
    horizontal: boolean,
    vertical: boolean,
  ) => {
    try {
      const result = await mirrorImageFile(node.path, horizontal, vertical);
      await reloadProjectFiles();
      setSelectedFile({
        ...node,
        path: result.path,
        size: result.fileSize,
        modifiedAt: new Date().toISOString(),
      });
      const axes = [horizontal && "水平", vertical && "垂直"].filter(Boolean).join("、");
      fileManager.notify(`已保存镜像（${axes}）: ${node.name}`);
    } catch (error) {
      fileManager.notify(String(error), "error");
    }
  };

  const handleCopyPath = async (node: FileNode | null) => {
    const targetPath = resolveCopyPathTarget(node, projectRoot, selectedFile);
    if (!targetPath) {
      fileManager.notify("没有可复制的路径", "error");
      return;
    }
    try {
      await copyPathToClipboard(targetPath);
      fileManager.notify(`已复制路径: ${targetPath}`);
    } catch (error) {
      fileManager.notify(String(error), "error");
    }
  };

  const openBackgroundContextMenu = useCallback(
    (e: React.MouseEvent, ignoreSelector: string) => {
      if ((e.target as HTMLElement).closest(ignoreSelector)) return;
      e.preventDefault();
      e.stopPropagation();
      fileManager.openContextMenu(e, null);
    },
    [fileManager],
  );

  const resolveImportDestDir = useCallback((): string | null => {
    return resolveCurrentDirectoryPath(projectRoot, selectedFile);
  }, [projectRoot, selectedFile]);

  const handleImportFiles = useCallback(
    async (files: FileList) => {
      const destDir = resolveImportDestDir();
      if (!destDir) {
        fileManager.notify("请先选择项目", "error");
        return;
      }
      try {
        const result = await importFilesToDirectory(destDir, files);
        await reloadProjectFiles();
        fileManager.notify(`已导入 ${result.imported.length} 个文件`);
      } catch (error) {
        fileManager.notify(String(error), "error");
      }
    },
    [resolveImportDestDir, reloadProjectFiles, fileManager],
  );

  const buildContextMenuItems = (node: FileNode | null) => {
    const isRoot = fileManager.isRootNode(node);
    const target = node;

    return [
      {
        label: node ? "复制路径" : "复制当前目录路径",
        disabled: !resolveCopyPathTarget(node, projectRoot, selectedFile),
        onClick: () => {
          void handleCopyPath(node);
        },
      },
      {
        label: "新建文件夹",
        shortcut: shortcuts.newFolder,
        onClick: () => fileManager.startNewFolder(target),
      },
      {
        label: "重命名",
        shortcut: shortcuts.rename,
        disabled: !target || isRoot,
        onClick: () => fileManager.startRename(target),
      },
      {
        label: "复制",
        shortcut: shortcuts.copy,
        disabled: !target || isRoot,
        onClick: () => fileManager.handleCopy(target),
      },
      {
        label: "剪切",
        shortcut: shortcuts.cut,
        disabled: !target || isRoot,
        onClick: () => fileManager.handleCut(target),
      },
      {
        label: "粘贴",
        shortcut: shortcuts.paste,
        disabled: !fileManager.clipboard,
        onClick: () => void fileManager.handlePaste(),
      },
      {
        label: "删除",
        shortcut: shortcuts.delete,
        disabled: !target || isRoot,
        danger: true,
        onClick: () => void fileManager.handleDelete(target),
      },
      { label: "刷新", shortcut: shortcuts.refresh, onClick: () => void reloadProjectFiles() },
    ];
  };

  const handleCreateProject = async (input: {
    displayName: string;
    conceptFolderName: string;
    blenderProjectName: string;
  }) => {
    const project = await createProject(input);
    await onRefresh();
    setSelectedProjectId(project.id);
    setShowNewProject(false);
  };

  const handleCreateMasterWorkspace = async (input: { name: string; rootPath: string }) => {
    await createMasterWorkspace(input);
    await onRefresh();
    setShowNewMasterWorkspace(false);
    setSelectedProjectId(null);
    fileManager.notify(`已创建总工作区: ${input.name}`);
  };

  const handleOpenMasterWorkspace = async (input: {
    name: string;
    rootPath?: string;
    conceptRoot?: string;
    blenderRoot?: string;
  }) => {
    lastAutoLinkedKeyRef.current = "";
    await openMasterWorkspace(input);
    await onRefresh();
    setShowOpenMasterWorkspace(false);
    setSelectedProjectId(null);
    setSelectedFile(null);
    fileManager.notify(`已打开工作区: ${input.name}`);
  };

  const handleSwitchWorkspace = async (workspaceId: string) => {
    lastAutoLinkedKeyRef.current = "";
    await switchActiveWorkspace(workspaceId);
    setSelectedProjectId(null);
    setSelectedFile(null);
    await onRefresh();
  };

  const handleDeleteProject = async (deleteFolders: boolean) => {
    if (!deletingProject) return;
    await deleteProject(deletingProject.id, deleteFolders);
    const remaining = projects.filter((p) => p.id !== deletingProject.id);
    if (selectedProjectId === deletingProject.id) {
      setSelectedProjectId(remaining[0]?.id ?? null);
      setSelectedFile(null);
    }
    setDeletingProject(null);
    await onRefresh();
    fileManager.notify(
      deleteFolders
        ? `已删除项目及文件夹: ${deletingProject.displayName}`
        : `已从列表移除: ${deletingProject.displayName}`,
    );
  };

  return (
    <div className="app">
      <WorkspaceHeader
        workspace={workspace}
        onCreateWorkspace={() => setShowNewMasterWorkspace(true)}
        onOpenWorkspace={() => setShowOpenMasterWorkspace(true)}
        onSwitchWorkspace={(id) => void handleSwitchWorkspace(id)}
        onSaveAll={() => void handleSaveAll(false)}
        onRefreshProject={() => void reloadProjectFiles()}
        canRefreshProject={Boolean(selectedProjectId)}
        saving={savingAll}
        lastSavedAt={lastSavedAt}
      />

      <div className={`app-body ${sidebarCollapsed ? "is-sidebar-collapsed" : ""}`}>
        <ProjectSidebar
          collapsed={sidebarCollapsed}
          projects={projects}
          selectedId={selectedProjectId}
          onToggle={() => setSidebarCollapsed((v) => !v)}
          onSelect={setSelectedProjectId}
          onDelete={setDeletingProject}
          onNewProject={() => setShowNewProject(true)}
        />

        <main className="main">
          {selectedProject ? (
            <>
              <div className="main-toolbar">
                <div className="project-title">
                  <button
                    type="button"
                    className="sidebar-toggle-mobile"
                    onClick={() => setSidebarCollapsed((v) => !v)}
                    title="切换项目列表"
                  >
                    ☰
                  </button>
                  <h1>{selectedProject.displayName}</h1>
                  <span className="stage-badge">{selectedProject.stage}</span>
                </div>
                <div className="side-toggle">
                  <button
                    className={side === "concept" ? "active" : ""}
                    onClick={() => setSide("concept")}
                  >
                    概念
                  </button>
                  <button
                    className={side === "blender" ? "active" : ""}
                    onClick={() => setSide("blender")}
                  >
                    生产
                  </button>
                </div>
              </div>

              <div className="project-paths">
                <span title={selectedProject.conceptPath}>概念: {selectedProject.conceptPath}</span>
                <span title={selectedProject.blenderPath}>生产: {selectedProject.blenderPath}</span>
              </div>

              <FileToolbar
                shortcuts={shortcuts}
                hasSelection={Boolean(selectedFile)}
                isRoot={fileManager.isRootNode(selectedFile)}
                hasClipboard={Boolean(fileManager.clipboard)}
                canImport={Boolean(selectedProject && projectRoot)}
                onImportFiles={(files) => void handleImportFiles(files)}
                onNewFolder={() => fileManager.startNewFolder()}
                onRename={() => fileManager.startRename()}
                onCopy={() => fileManager.handleCopy()}
                onCut={() => fileManager.handleCut()}
                onPaste={() => void fileManager.handlePaste()}
                onDelete={() => void fileManager.handleDelete()}
                onRefresh={() => void reloadProjectFiles()}
                onShowShortcuts={() => setShowShortcuts(true)}
                galleryVisible={!galleryCollapsed}
                onToggleGallery={() => setGalleryCollapsed((v) => !v)}
              />

              {loadingProject ? (
                <div className="panel-loading">正在扫描项目文件...</div>
              ) : (
                <div className={`content-grid ${galleryCollapsed ? "is-gallery-hidden" : ""}`}>
                  <section className="panel">
                    <h3>文件树</h3>
                    <ExternalImportZone
                      enabled={Boolean(selectedProject && projectRoot)}
                      onImportFiles={handleImportFiles}
                    >
                    <div
                      className="panel-scroll"
                      onContextMenu={(e) =>
                        openBackgroundContextMenu(
                          e,
                          ".tree-file, .tree-folder-select, .tree-expand-btn",
                        )
                      }
                    >
                    <FileTree
                      node={tree}
                      projectRoot={projectRoot}
                      selectedPath={selectedFile?.path}
                      renamingPath={fileManager.renamingPath}
                      cutPath={
                        fileManager.clipboard?.mode === "cut"
                          ? fileManager.clipboard.node.path
                          : null
                      }
                      conceptTags={side === "concept" ? conceptTags : undefined}
                      textureTags={side === "blender" ? textureTags : undefined}
                      onSelect={setSelectedFile}
                      onContextMenu={(e, node) => {
                        setSelectedFile(node);
                        fileManager.openContextMenu(e, node);
                      }}
                      onRenameCommit={(node, name) => void fileManager.commitRename(node, name)}
                      onRenameCancel={fileManager.cancelRename}
                      onBackgroundContextMenu={(e) => {
                        openBackgroundContextMenu(
                          e,
                          ".tree-file, .tree-folder-select, .tree-expand-btn",
                        );
                      }}
                    />
                    </div>
                    </ExternalImportZone>
                  </section>

                  {!galleryCollapsed && (
                    <AssetGalleryPanel
                      assets={assets}
                      selectedFile={selectedFile}
                      selectedPath={selectedFile?.path}
                      cutPath={
                        fileManager.clipboard?.mode === "cut"
                          ? fileManager.clipboard.node.path
                          : null
                      }
                      conceptTags={side === "concept" ? conceptTags : undefined}
                      textureTags={side === "blender" ? textureTags : undefined}
                      markEnabled={side === "concept"}
                      textureMarkEnabled={side === "blender"}
                      onHide={() => setGalleryCollapsed(true)}
                      onSelect={setSelectedFile}
                      onContextMenu={(e, node) => {
                        setSelectedFile(node);
                        fileManager.openContextMenu(e, node);
                      }}
                      onBackgroundContextMenu={(e) => {
                        openBackgroundContextMenu(e, ".asset-card");
                      }}
                      onMarkAsset={(node, role) => void handleMarkAsset(node, role)}
                      onMarkTexture={(node, type) => void handleMarkTexture(node, type)}
                    />
                  )}

                  <section className="panel preview-panel">
                    <div className="panel-titlebar">
                      <h3>预览</h3>
                      {galleryCollapsed && (
                        <button
                          type="button"
                          className="panel-titlebar-btn show-gallery-btn"
                          onClick={() => setGalleryCollapsed(false)}
                          title="显示可预览资产"
                        >
                          显示画廊
                        </button>
                      )}
                    </div>
                    <div className="panel-scroll">
                    <PreviewPanel
                      file={selectedFile}
                      project={selectedProject}
                      side={side}
                      onSplitImage={
                        side === "concept" && selectedFile && isImageFile(selectedFile)
                          ? setSplitFile
                          : undefined
                      }
                      onMirrorImage={
                        side === "concept" && selectedFile && isImageFile(selectedFile)
                          ? (node, horizontal, vertical) =>
                              handleMirrorImage(node, horizontal, vertical)
                          : undefined
                      }
                      onResizeTexture={
                        side === "blender" && selectedFile && isImageFile(selectedFile)
                          ? (node, size) => handleResizeTexture(node, size)
                          : undefined
                      }
                    />
                    </div>
                  </section>
                </div>
              )}
            </>
          ) : (
            <div className="empty-state">
              <button
                type="button"
                className="sidebar-toggle-mobile"
                onClick={() => setSidebarCollapsed((v) => !v)}
                title="切换项目列表"
              >
                ☰ 项目
              </button>
              <p>选择一个项目，或新建一个逻辑项目。</p>
              <p className="muted">
                打开工作区后会自动关联名称匹配的概念与生产目录；无法匹配的文件夹会显示在顶部提示中。
              </p>
            </div>
          )}
        </main>
      </div>

      {showNewProject && (
        <NewProjectModal
          onClose={() => setShowNewProject(false)}
          onCreate={handleCreateProject}
        />
      )}

      {showNewMasterWorkspace && (
        <NewMasterWorkspaceModal
          onClose={() => setShowNewMasterWorkspace(false)}
          onCreate={handleCreateMasterWorkspace}
        />
      )}

      {showOpenMasterWorkspace && (
        <OpenMasterWorkspaceModal
          onClose={() => setShowOpenMasterWorkspace(false)}
          onOpen={handleOpenMasterWorkspace}
        />
      )}

      {deletingProject && (
        <DeleteProjectModal
          project={deletingProject}
          active={active}
          onClose={() => setDeletingProject(null)}
          onConfirm={handleDeleteProject}
        />
      )}

      {fileManager.prompt && (
        <PromptDialog
          title={fileManager.prompt.title}
          label={fileManager.prompt.label}
          defaultValue={fileManager.prompt.defaultValue}
          onConfirm={fileManager.prompt.onConfirm}
          onClose={() => fileManager.setPrompt(null)}
        />
      )}

      {showShortcuts && (
        <ShortcutsPanel shortcuts={shortcuts} onClose={() => setShowShortcuts(false)} />
      )}

      {fileManager.contextMenu && (
        <ContextMenu
          x={fileManager.contextMenu.x}
          y={fileManager.contextMenu.y}
          items={buildContextMenuItems(fileManager.contextMenu.node)}
          onClose={fileManager.closeContextMenu}
        />
      )}

      {splitFile && (
        <ImageSplitModal
          file={splitFile}
          onClose={() => setSplitFile(null)}
          onExported={async () => {
            await reloadProjectFiles();
            setSplitFile(null);
          }}
        />
      )}

      <Toast message={fileManager.message} />
    </div>
  );
}
