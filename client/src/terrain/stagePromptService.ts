import type { StagePromptKind } from "./stagePrompts";
import { buildStagePrompt } from "./stagePrompts";
import type { PromptHistoryEntry, StageJson } from "./terrainTypes";
import { fetchPromptHistory, saveStagePrompt } from "./terrainApi";

export async function generateAndSavePrompt(
  stage: StageJson,
  kind: StagePromptKind,
): Promise<{ text: string; relativePath: string; entry: PromptHistoryEntry }> {
  const text = buildStagePrompt(kind, stage);
  const res = await saveStagePrompt(stage.stageName, kind, text);
  if (!res.ok || !res.relativePath || !res.historyEntry) {
    throw new Error(res.error || res.message || "保存提示词失败");
  }
  return { text, relativePath: res.relativePath, entry: res.historyEntry };
}

export async function loadPromptHistory(stageName: string): Promise<PromptHistoryEntry[]> {
  const res = await fetchPromptHistory(stageName);
  return res.entries ?? [];
}
