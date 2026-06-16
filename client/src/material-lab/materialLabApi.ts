import type {
  ExportUnityResponse,
  MaterialCheckResponse,
  MaterialLabState,
  MaterialLabStateResponse,
  MergeMetallicSmoothnessResponse,
} from "./materialLabTypes";

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.ok === false) {
    throw new Error(body.message || body.error || `Request failed: ${res.status}`);
  }
  return body as T;
}

export function fetchMaterialLabState(projectId: string): Promise<MaterialLabStateResponse> {
  return request<MaterialLabStateResponse>(`/api/projects/${projectId}/material-lab`);
}

export function saveMaterialLabState(
  projectId: string,
  state: MaterialLabState,
): Promise<{ ok: boolean; savedPath: string; message?: string }> {
  return request(`/api/projects/${projectId}/material-lab`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(state),
  });
}

export function mergeMetallicSmoothness(
  projectId: string,
  input?: { metallicPath?: string; roughnessPath?: string },
): Promise<MergeMetallicSmoothnessResponse> {
  return request<MergeMetallicSmoothnessResponse>(
    `/api/projects/${projectId}/material-lab/merge-metallic-smoothness`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input ?? {}),
    },
  );
}

export function exportUnityMaterialPackage(projectId: string): Promise<ExportUnityResponse> {
  return request<ExportUnityResponse>(`/api/projects/${projectId}/material-lab/export-unity`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
}

export function checkUnityTextureStandard(projectId: string): Promise<MaterialCheckResponse> {
  return request<MaterialCheckResponse>(`/api/projects/${projectId}/material-lab/check`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
}

export function openMaterialLabExportFolder(projectId: string): Promise<{ ok: boolean; path: string }> {
  return request(`/api/projects/${projectId}/material-lab/open-export-folder`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
}
