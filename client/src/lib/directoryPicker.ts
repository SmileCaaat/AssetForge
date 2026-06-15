/** File System Access API helpers (FMVMAKER_WEB pattern) */

export interface DirectoryHandle {
  name: string;
  kind: "directory";
  getDirectoryHandle(
    name: string,
    options?: { create?: boolean },
  ): Promise<DirectoryHandle>;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<FileSystemFileHandle>;
  removeEntry(name: string): Promise<void>;
  values(): AsyncIterable<{ kind: "file" | "directory"; name: string }>;
}

export function isFileSystemAccessSupported(): boolean {
  return typeof window !== "undefined" && "showDirectoryPicker" in window;
}

export async function pickDirectory(): Promise<DirectoryHandle> {
  const w = window as Window & {
    showDirectoryPicker?: (options?: {
      mode?: "read" | "readwrite";
    }) => Promise<DirectoryHandle>;
  };
  if (!w.showDirectoryPicker) {
    throw new Error("File System Access API 不可用，请使用 Chrome 或 Edge 桌面版");
  }
  return w.showDirectoryPicker({ mode: "readwrite" });
}

export async function runFsAction(
  action: () => Promise<void>,
  onError?: (message: string) => void,
): Promise<void> {
  if (!isFileSystemAccessSupported()) {
    onError?.("当前浏览器不支持本地文件夹访问，请使用 Chrome 或 Edge 桌面版");
    return;
  }
  try {
    await action();
  } catch (error) {
    if ((error as Error).name !== "AbortError") {
      onError?.((error as Error).message);
    }
  }
}

const TOKEN_FILE = ".asset-manager-path-token";

export async function writePickerToken(handle: DirectoryHandle): Promise<string> {
  const token = crypto.randomUUID();
  const fileHandle = await handle.getFileHandle(TOKEN_FILE, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(token);
  await writable.close();
  return token;
}

export async function removePickerToken(handle: DirectoryHandle): Promise<void> {
  try {
    await handle.removeEntry(TOKEN_FILE);
  } catch {
    /* already removed */
  }
}
