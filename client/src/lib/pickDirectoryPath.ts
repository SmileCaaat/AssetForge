import { pickFolder, resolvePickerToken } from "../api";
import {
  isFileSystemAccessSupported,
  pickDirectory,
  removePickerToken,
  writePickerToken,
} from "./directoryPicker";

/** Local dev: backend native dialog; request() falls back to direct :3456 if Vite proxy is down. */
function useNativeFolderPicker(): boolean {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname;
  return host === "localhost" || host === "127.0.0.1";
}

async function pickWithBrowserApi(options?: {
  defaultPath?: string;
}): Promise<{ cancelled: boolean; path?: string }> {
  const handle = await pickDirectory();
  const token = await writePickerToken(handle);
  try {
    const { path: resolvedPath } = await resolvePickerToken(token, options?.defaultPath);
    return { cancelled: false, path: resolvedPath };
  } finally {
    await removePickerToken(handle);
  }
}

export async function pickDirectoryPath(options?: {
  title?: string;
  defaultPath?: string;
}): Promise<{ cancelled: boolean; path?: string }> {
  if (useNativeFolderPicker() || !isFileSystemAccessSupported()) {
    try {
      return await pickFolder(options);
    } catch (error) {
      if (isFileSystemAccessSupported()) {
        try {
          return await pickWithBrowserApi(options);
        } catch (fsError) {
          if ((fsError as Error).name === "AbortError") {
            return { cancelled: true };
          }
        }
      }
      throw error;
    }
  }

  try {
    return await pickWithBrowserApi(options);
  } catch (error) {
    if ((error as Error).name === "AbortError") {
      return { cancelled: true };
    }
    throw error;
  }
}
