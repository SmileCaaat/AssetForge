import fs from "fs/promises";
import path from "path";
import { assertPathInsideRoot } from "../pathSecurity.js";
import { resolveStageRoot } from "./stageProjectService.js";

export type StagePromptKind = "semantic_to_basecolor";

export const PROMPT_KIND_LABELS: Record<StagePromptKind, string> = {
  semantic_to_basecolor: "BaseColor（语义约束）",
};

const PROMPT_FILE = "basecolor_prompt.md";

export interface PromptHistoryEntry {
  id: string;
  kind: StagePromptKind | string;
  label: string;
  file: string;
  createdAt: string;
  preview: string;
}

interface PromptHistoryFile {
  version: 1;
  entries: PromptHistoryEntry[];
}

const MAX_HISTORY = 48;

function historyPath(stageRoot: string): string {
  return path.join(stageRoot, ".asset-manager", "prompt_history.json");
}

function promptsDir(stageRoot: string): string {
  return path.join(stageRoot, "prompts");
}

async function readHistory(stageRoot: string): Promise<PromptHistoryFile> {
  const filePath = historyPath(stageRoot);
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    const parsed = JSON.parse(raw) as PromptHistoryFile;
    if (parsed.version === 1 && Array.isArray(parsed.entries)) return parsed;
  } catch {
    /* new */
  }
  return { version: 1, entries: [] };
}

export async function saveStagePrompt(
  terrainRoot: string,
  stageName: string,
  kind: StagePromptKind,
  content: string,
): Promise<{ relativePath: string; historyEntry: PromptHistoryEntry }> {
  if (kind !== "semantic_to_basecolor") {
    throw new Error(`Unsupported prompt kind: ${kind}`);
  }

  const stageRoot = resolveStageRoot(terrainRoot, stageName);
  const relPath = `prompts/${PROMPT_FILE}`;
  const absPath = path.join(stageRoot, relPath);
  assertPathInsideRoot(absPath, terrainRoot);

  await fs.mkdir(promptsDir(stageRoot), { recursive: true });
  const header = `<!-- kind: ${kind} · ${PROMPT_KIND_LABELS[kind]} · ${new Date().toISOString()} -->\n\n`;
  await fs.writeFile(absPath, header + content.trim() + "\n", "utf-8");

  const entry: PromptHistoryEntry = {
    id: `${Date.now()}-${kind}`,
    kind,
    label: PROMPT_KIND_LABELS[kind],
    file: relPath,
    createdAt: new Date().toISOString(),
    preview: content.trim().slice(0, 160).replace(/\s+/g, " "),
  };

  const history = await readHistory(stageRoot);
  history.entries.unshift(entry);
  history.entries = history.entries.slice(0, MAX_HISTORY);
  const histAbs = historyPath(stageRoot);
  assertPathInsideRoot(histAbs, terrainRoot);
  await fs.mkdir(path.dirname(histAbs), { recursive: true });
  await fs.writeFile(histAbs, JSON.stringify(history, null, 2), "utf-8");

  return { relativePath: relPath, historyEntry: entry };
}

export async function loadPromptHistory(
  terrainRoot: string,
  stageName: string,
): Promise<PromptHistoryEntry[]> {
  const stageRoot = resolveStageRoot(terrainRoot, stageName);
  const history = await readHistory(stageRoot);
  return history.entries;
}
