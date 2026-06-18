import { formatApiError } from "../api";
import type {
  StageJson,
  StageListResponse,
  StageStateResponse,
  StageTextureSlot,
  SemanticPaletteResponse,
  SavePromptResponse,
  PromptHistoryResponse,
} from "./terrainTypes";
import type { StagePromptKind } from "./stagePrompts";

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(formatApiError(body.error || body.message || `Request failed: ${res.status}`));
  }
  return body as T;
}

export function fetchStageList(): Promise<StageListResponse> {
  return request<StageListResponse>("/api/terrain/stages");
}

export function fetchStage(stageName: string): Promise<StageStateResponse> {
  return request<StageStateResponse>(`/api/terrain/stages/${encodeURIComponent(stageName)}`);
}

export function createStage(input: {
  stageName: string;
  displayName?: string;
  stageType?: string;
  aspect?: string;
  pixelTier?: "s" | "m" | "l";
  worldSize?: { width: number; height: number };
  resolution?: { width: number; height: number };
}): Promise<StageStateResponse> {
  return request<StageStateResponse>("/api/terrain/stages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export function saveStage(stage: StageJson): Promise<StageStateResponse> {
  return request<StageStateResponse>(`/api/terrain/stages/${encodeURIComponent(stage.stageName)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(stage),
  });
}

export function deleteStage(stageName: string): Promise<StageStateResponse> {
  return request<StageStateResponse>(`/api/terrain/stages/${encodeURIComponent(stageName)}`, {
    method: "DELETE",
  });
}

export function uploadStageTexture(
  stageName: string,
  slot: StageTextureSlot,
  file: File,
  options?: { conceptProjectRel?: string },
): Promise<StageStateResponse> {
  const form = new FormData();
  form.append("file", file);
  if (options?.conceptProjectRel?.trim()) {
    form.append("conceptProjectRel", options.conceptProjectRel.trim());
  }
  return request<StageStateResponse>(
    `/api/terrain/stages/${encodeURIComponent(stageName)}/textures/${slot}`,
    { method: "POST", body: form },
  );
}

export function fetchStagePalette(stageName: string): Promise<SemanticPaletteResponse> {
  return request<SemanticPaletteResponse>(
    `/api/terrain/stages/${encodeURIComponent(stageName)}/palette`,
  );
}

export function saveStagePrompt(
  stageName: string,
  kind: StagePromptKind,
  content: string,
): Promise<SavePromptResponse> {
  return request<SavePromptResponse>(
    `/api/terrain/stages/${encodeURIComponent(stageName)}/prompts`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, content }),
    },
  );
}

export function fetchPromptHistory(stageName: string): Promise<PromptHistoryResponse> {
  return request<PromptHistoryResponse>(
    `/api/terrain/stages/${encodeURIComponent(stageName)}/prompts/history`,
  );
}
