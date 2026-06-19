export type RiggingOutputFormat = ".fbx" | ".glb" | ".obj";
export type RiggingBoneNames = "articulated" | "mixamo" | "ue5";
export type RiggingJobStatus = "queued" | "running" | "completed" | "failed";

export interface RiggingSettings {
  modelName: string;
  topK: number;
  topP: number;
  temperature: number;
  repetitionPenalty: number;
  numBeams: number;
  useSkeleton: boolean;
  useTransfer: boolean;
  usePostprocess: boolean;
  boneNames: RiggingBoneNames;
  outputFormat: RiggingOutputFormat;
  bpyServerMode: "Headless (Blender)";
}

export interface RiggingJobState {
  id: string;
  status: RiggingJobStatus;
  inputPath: string;
  inputName: string;
  executorOutputPath?: string;
  projectOutputPath?: string;
  projectOutputRelativePath?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RiggingLabState {
  projectId: string;
  projectName: string;
  projectRoot: string;
  outputDir: string;
  lastSettings: RiggingSettings;
  jobs: RiggingJobState[];
}

export interface RiggingHealth {
  ok: boolean;
  runtime: {
    ok: boolean;
    name: string;
    python?: string;
    skintokensRoot?: string;
    runtimeRoot?: string;
    blenderExe?: string;
    bpyMode?: "existing" | "embedded" | "headless";
    queueRunning?: number;
    queuePending?: number;
    error?: string;
  };
  bpy: {
    ok: boolean;
    url: string;
    error?: string;
  };
  models: {
    skintokensCheckpoint: boolean;
    skinVae: boolean;
    qwenConfig: boolean;
  };
}
