import { pickFolder, resolvePickerToken } from "../api";
import {
  isFileSystemAccessSupported,
  pickDirectory,
  removePickerToken,
  writePickerToken,
} from "./directoryPicker";

/** Local dev (start.bat): native dialog returns path instantly — no disk scan. */
function useNativeFolderPicker(): boolean {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname;
  return host === "localhost" || host === "127.0.0.1";
}

export async function pickDirectoryPath(options?: {
  title?: string;
  defaultPath?: string;
}): Promise<{ cancelled: boolean; path?: string }> {
  if (useNativeFolderPicker() || !isFileSystemAccessSupported()) {
    return pickFolder(options);
  }

  try {
    const handle = await pickDirectory();
    const token = await writePickerToken(handle);
    try {
      const { path: resolvedPath } = await resolvePickerToken(token, options?.defaultPath);
      return { cancelled: false, path: resolvedPath };
    } finally {
      await removePickerToken(handle);
    }
  } catch (error) {
    if ((error as Error).name === "AbortError") {
      return { cancelled: true };
    }
    throw error;
  }
}
