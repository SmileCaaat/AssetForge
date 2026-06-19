import { request } from "../api";
import type { RiggingHealth, RiggingJobState, RiggingLabState, RiggingSettings } from "./riggingTypes";

export function fetchRiggingState(projectId: string) {
  return request<{ ok: boolean; state: RiggingLabState }>(`/api/projects/${projectId}/rigging`);
}

export function fetchRiggingHealth(projectId: string) {
  return request<{ ok: boolean; health: RiggingHealth }>(`/api/projects/${projectId}/rigging/health`);
}

export function runRigging(
  projectId: string,
  inputMeshPath: string,
  settings: Partial<RiggingSettings>,
) {
  return request<{ ok: boolean; state: RiggingLabState; job: RiggingJobState }>(
    `/api/projects/${projectId}/rigging/run`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inputMeshPath, settings }),
    },
  );
}

export function fetchRiggingJob(projectId: string, jobId: string) {
  return request<{ ok: boolean; state: RiggingLabState; job: RiggingJobState }>(
    `/api/projects/${projectId}/rigging/jobs/${jobId}`,
  );
}

export function clearRiggingJobs(projectId: string) {
  return request<{ ok: boolean; state: RiggingLabState }>(`/api/projects/${projectId}/rigging/clear`, {
    method: "POST",
  });
}

export function openRiggingOutputFolder(projectId: string) {
  return request<{ ok: boolean; path: string }>(`/api/projects/${projectId}/rigging/open-folder`, {
    method: "POST",
  });
}
