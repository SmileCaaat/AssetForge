import path from "path";
import { fileURLToPath } from "url";
import { loadConfig, saveConfig } from "./config.js";
import { flushConceptTags } from "./conceptTags.js";
import { flushTextureTags } from "./blenderTextureTags.js";
import { resolveProjectPath } from "./scanner.js";
import { loadShortcuts, saveShortcuts } from "./shortcuts.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "data");

export interface SaveAllResult {
  savedAt: string;
  files: string[];
}

export async function saveAllJsonData(): Promise<SaveAllResult> {
  const files: string[] = [];

  const state = await loadConfig();
  await saveConfig(state);
  files.push(path.join(DATA_DIR, "workspace.json"));

  const shortcuts = await loadShortcuts();
  await saveShortcuts(shortcuts);
  files.push(path.join(DATA_DIR, "shortcuts.json"));

  for (const workspace of state.workspaces) {
    for (const project of workspace.projects) {
      try {
        const conceptRoot = resolveProjectPath(workspace, project, "concept");
        const conceptTagPath = await flushConceptTags(conceptRoot, project.displayName);
        if (conceptTagPath) files.push(conceptTagPath);
      } catch {
        // Skip projects whose concept folder is missing or inaccessible.
      }
      try {
        const blenderRoot = resolveProjectPath(workspace, project, "blender");
        const textureTagPath = await flushTextureTags(blenderRoot, project.displayName);
        if (textureTagPath) files.push(textureTagPath);
      } catch {
        // Skip projects whose blender folder is missing or inaccessible.
      }
    }
  }

  return {
    savedAt: new Date().toISOString(),
    files,
  };
}
