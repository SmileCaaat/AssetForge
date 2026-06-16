import type {
  ConceptAssetRole,
  ConceptTagsResponse,
  FileNode,
  OpenFolderTarget,
  ProjectLink,
  ProjectSide,
  TextureMapType,
  TextureResizePreset,
  TextureTagsResponse,
  WorkspaceResponse,
} from "./types";
import type { ShortcutConfig } from "./config/shortcuts";

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  return res.json();
}

export function fileUrl(filePath: string, cacheBust?: string | number): string {
  const base = `/api/files?path=${encodeURIComponent(filePath)}`;
  if (cacheBust === undefined) return base;
  return `${base}&v=${encodeURIComponent(String(cacheBust))}`;
}

export function fetchWorkspace(): Promise<WorkspaceResponse> {
  return request<WorkspaceResponse>("/api/workspace");
}

export function createMasterWorkspace(input: { name: string; rootPath: string }) {
  return request<WorkspaceResponse>("/api/workspaces", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export function openMasterWorkspace(input: {
  name: string;
  rootPath?: string;
  conceptRoot?: string;
  blenderRoot?: string;
}) {
  return request<WorkspaceResponse>("/api/workspaces/open", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export function switchActiveWorkspace(workspaceId: string) {
  return request<WorkspaceResponse>("/api/workspaces/active", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workspaceId }),
  });
}

export function openWorkspaceFolder(workspaceId: string, target: OpenFolderTarget = "root") {
  return request<{ ok: boolean; path: string }>(`/api/workspaces/${workspaceId}/open-folder`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ target }),
  });
}

export function createProject(input: {
  displayName: string;
  conceptFolderName: string;
  blenderProjectName: string;
}): Promise<ProjectLink> {
  return request<ProjectLink>("/api/projects", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export function linkProject(input: {
  displayName: string;
  conceptPath: string;
  blenderPath: string;
}): Promise<ProjectLink> {
  return request<ProjectLink>("/api/projects/link", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export function deleteProject(id: string, deleteFolders: boolean): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(`/api/projects/${id}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ deleteFolders }),
  });
}

export function fetchProjectTree(
  projectId: string,
  side: ProjectSide,
): Promise<{ root: string; tree: FileNode | null }> {
  return request(`/api/projects/${projectId}/tree?side=${side}`);
}

export function fetchProjectAssets(
  projectId: string,
  side: ProjectSide,
): Promise<{ root: string; assets: FileNode[] }> {
  return request(`/api/projects/${projectId}/assets?side=${side}`);
}

export function fetchConceptTags(projectId: string): Promise<ConceptTagsResponse> {
  return request<ConceptTagsResponse>(`/api/projects/${projectId}/concept-tags`);
}

export function markConceptAsset(
  projectId: string,
  filePath: string,
  role: ConceptAssetRole,
): Promise<{ path: string; name: string; role: ConceptAssetRole; relativePath: string }> {
  return request(`/api/projects/${projectId}/mark-concept`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filePath, role }),
  });
}

export function fetchTextureTags(projectId: string): Promise<TextureTagsResponse> {
  return request<TextureTagsResponse>(`/api/projects/${projectId}/texture-tags`);
}

export function markTextureMap(
  projectId: string,
  filePath: string,
  type: TextureMapType,
): Promise<{ path: string; name: string; type: TextureMapType; relativePath: string }> {
  return request(`/api/projects/${projectId}/mark-texture`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filePath, type }),
  });
}

export function resizeTextureImage(
  filePath: string,
  size: TextureResizePreset,
): Promise<{ path: string; width: number; height: number; fileSize: number }> {
  return request("/api/images/resize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: filePath, size }),
  });
}

export function mirrorImageFile(
  filePath: string,
  horizontal: boolean,
  vertical: boolean,
): Promise<{ path: string; width: number; height: number; fileSize: number }> {
  return request("/api/images/mirror", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: filePath, horizontal, vertical }),
  });
}

export function isImageFile(node: FileNode): boolean {
  return [".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp"].includes(node.extension || "");
}

export function isModelFile(node: FileNode): boolean {
  return [".fbx", ".glb", ".gltf", ".obj"].includes(node.extension || "");
}

export function isBlendFile(node: FileNode): boolean {
  return node.extension === ".blend";
}

export function formatSize(bytes?: number): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function parentDir(filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/");
  const idx = normalized.lastIndexOf("/");
  return idx >= 0 ? filePath.slice(0, filePath.length - (normalized.length - idx)) : filePath;
}

export function fetchShortcuts(): Promise<ShortcutConfig> {
  return request<ShortcutConfig>("/api/shortcuts");
}

export function saveAllData(): Promise<{ savedAt: string; files: string[] }> {
  return request<{ savedAt: string; files: string[] }>("/api/save-all", {
    method: "POST",
  });
}

export function updateShortcuts(shortcuts: ShortcutConfig): Promise<ShortcutConfig> {
  return request<ShortcutConfig>("/api/shortcuts", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(shortcuts),
  });
}

export function fsRename(path: string, newName: string) {
  return request<{ path: string }>("/api/fs/rename", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, newName }),
  });
}

export function fsDelete(path: string) {
  return request<{ ok: boolean }>("/api/fs/delete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path }),
  });
}

export function fsCopy(sourcePath: string, destDir: string) {
  return request<{ path: string }>("/api/fs/copy", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sourcePath, destDir }),
  });
}

export function fsMove(sourcePath: string, destDir: string) {
  return request<{ path: string }>("/api/fs/move", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sourcePath, destDir }),
  });
}

export function fsMkdir(parentDir: string, name: string) {
  return request<{ path: string }>("/api/fs/mkdir", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ parentDir, name }),
  });
}

export function pickFolder(input?: { title?: string; defaultPath?: string }) {
  return request<{ cancelled: boolean; path?: string }>("/api/fs/pick-folder", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input ?? {}),
  });
}

export function resolvePickerToken(token: string, defaultPath?: string) {
  return request<{ path: string }>("/api/fs/resolve-picker-token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, defaultPath }),
  });
}

export async function importFilesToDirectory(
  destDir: string,
  files: FileList | File[],
): Promise<{ imported: string[] }> {
  const form = new FormData();
  form.append("destDir", destDir);
  const list = files instanceof FileList ? Array.from(files) : files;
  for (const file of list) {
    form.append("files", file);
  }

  const res = await fetch("/api/fs/import-files", {
    method: "POST",
    body: form,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  return res.json();
}

export function fsSplitImage(input: {
  filePath: string;
  rows: number;
  cols: number;
  rowSplits: number[];
  colSplits: number[];
  folderName?: string;
}) {
  return request<{ outputDir: string; files: string[] }>("/api/fs/split-image", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}
