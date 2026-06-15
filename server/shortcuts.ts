import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

export interface ShortcutConfig {
  rename: string;
  copy: string;
  cut: string;
  paste: string;
  delete: string;
  newFolder: string;
  refresh: string;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SHORTCUTS_PATH = path.join(__dirname, "..", "data", "shortcuts.json");

export const DEFAULT_SHORTCUTS: ShortcutConfig = {
  rename: "F2",
  copy: "Control+c",
  cut: "Control+x",
  paste: "Control+v",
  delete: "Delete",
  newFolder: "Control+Shift+n",
  refresh: "F5",
};

export async function loadShortcuts(): Promise<ShortcutConfig> {
  try {
    const raw = await fs.readFile(SHORTCUTS_PATH, "utf-8");
    return { ...DEFAULT_SHORTCUTS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_SHORTCUTS;
  }
}

export async function saveShortcuts(shortcuts: ShortcutConfig): Promise<ShortcutConfig> {
  await fs.mkdir(path.dirname(SHORTCUTS_PATH), { recursive: true });
  await fs.writeFile(SHORTCUTS_PATH, JSON.stringify(shortcuts, null, 2), "utf-8");
  return shortcuts;
}
