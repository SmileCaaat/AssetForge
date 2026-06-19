import { spawn } from "child_process";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import type { RiggingSettings } from "../riggingTypes.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PLATFORM_ROOT = process.env.AMT_PLATFORM_ROOT?.trim() || process.cwd();
const RIGGING_RUNTIME_ROOT =
  process.env.AMT_RIGGING_RUNTIME_ROOT?.trim() || path.join(PLATFORM_ROOT, "runtime", "rigging");
const SKINTOKENS_ROOT =
  process.env.AMT_SKINTOKENS_ROOT?.trim() ||
  path.join(RIGGING_RUNTIME_ROOT, "SkinTokens");
const PYTHON_EXE =
  process.env.AMT_SKINTOKENS_PYTHON?.trim() ||
  path.join(RIGGING_RUNTIME_ROOT, "python", "Scripts", "python.exe");
const MODEL_ROOT =
  process.env.AMT_SKINTOKENS_MODEL_ROOT?.trim() ||
  path.join(RIGGING_RUNTIME_ROOT, "models", "skintoken");
const QWEN_ROOT =
  process.env.AMT_SKINTOKENS_QWEN_ROOT?.trim() ||
  path.join(RIGGING_RUNTIME_ROOT, "models", "Qwen3-0.6B");
const BLENDER_EXE_CANDIDATES = [
  process.env.AMT_BLENDER_EXE?.trim(),
  "D:\\Blender 4.5\\blender.EXE",
  "C:\\Program Files\\Blender Foundation\\Blender 4.5\\blender.exe",
  "C:\\Program Files\\Blender Foundation\\Blender 4.4\\blender.exe",
  "C:\\Program Files\\Blender Foundation\\Blender\\blender.exe",
].filter(Boolean) as string[];
const BLENDER_EXE = BLENDER_EXE_CANDIDATES[0];
const BPY_MODE = (process.env.AMT_SKINTOKENS_BPY_MODE?.trim() || "headless") as
  | "existing"
  | "embedded"
  | "headless";
const BPY_URL = process.env.AMT_SKINTOKENS_BPY_URL?.trim() || "http://127.0.0.1:18176";

export interface SkinTokensCliRunInput {
  inputPath: string;
  outputPath: string;
  settings: RiggingSettings;
}

export interface SkinTokensCliRunResult {
  outputPath: string;
  stdout: string;
  stderr: string;
}

function runnerPath(): string {
  return path.resolve(__dirname, "..", "scripts", "skintokens_runner.py");
}

function modelCheckpointPath(settings: RiggingSettings): string {
  if (path.isAbsolute(settings.modelName)) return settings.modelName;
  return path.join(MODEL_ROOT, ...settings.modelName.replace(/\\/g, "/").split("/"));
}

export async function getSkinTokensCliHealth(): Promise<{
  ok: boolean;
  python: string;
  skintokensRoot: string;
  runner: string;
  modelCheckpoint: string;
  skinVae: string;
  qwenConfig: string;
  blenderExe: string;
  bpyMode: "existing" | "embedded" | "headless";
  error?: string;
  runtimeRoot: string;
  modelRoot: string;
}> {
  const runner = runnerPath();
  const modelCheckpoint = modelCheckpointPath({
    modelName: "experiments/articulation_xl_quantization_256_token_4/grpo_1400.ckpt",
  } as RiggingSettings);
  const skinVae = path.join(MODEL_ROOT, "experiments", "skin_vae_2_10_32768", "last.ckpt");
  const qwenConfig = path.join(QWEN_ROOT, "config.json");

  try {
    await Promise.all([
      fs.access(PYTHON_EXE),
      fs.access(SKINTOKENS_ROOT),
      fs.access(runner),
      fs.access(modelCheckpoint),
      fs.access(skinVae),
      fs.access(qwenConfig),
      BPY_MODE === "headless" ? fs.access(BLENDER_EXE) : Promise.resolve(),
    ]);
    return {
      ok: true,
      python: PYTHON_EXE,
      skintokensRoot: SKINTOKENS_ROOT,
      runner,
      modelCheckpoint,
      skinVae,
      qwenConfig,
      blenderExe: BLENDER_EXE,
      bpyMode: BPY_MODE,
      runtimeRoot: RIGGING_RUNTIME_ROOT,
      modelRoot: MODEL_ROOT,
    };
  } catch (error) {
    return {
      ok: false,
      python: PYTHON_EXE,
      skintokensRoot: SKINTOKENS_ROOT,
      runner,
      modelCheckpoint,
      skinVae,
      qwenConfig,
      blenderExe: BLENDER_EXE,
      bpyMode: BPY_MODE,
      runtimeRoot: RIGGING_RUNTIME_ROOT,
      modelRoot: MODEL_ROOT,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export function runSkinTokensCli(input: SkinTokensCliRunInput): Promise<SkinTokensCliRunResult> {
  const args = [
    runnerPath(),
    "--skintokens-root",
    SKINTOKENS_ROOT,
    "--input",
    input.inputPath,
    "--output",
    input.outputPath,
    "--model-ckpt",
    modelCheckpointPath(input.settings),
    "--top-k",
    String(input.settings.topK),
    "--top-p",
    String(input.settings.topP),
    "--temperature",
    String(input.settings.temperature),
    "--repetition-penalty",
    String(input.settings.repetitionPenalty),
    "--num-beams",
    String(input.settings.numBeams),
    "--bone-names",
    input.settings.boneNames,
    "--bpy-mode",
    BPY_MODE,
    "--bpy-url",
    BPY_URL,
  ];

  if (input.settings.useSkeleton) args.push("--use-skeleton");
  if (input.settings.useTransfer) args.push("--use-transfer");
  if (input.settings.usePostprocess) args.push("--use-postprocess");

  return new Promise((resolve, reject) => {
    const child = spawn(PYTHON_EXE, args, {
      cwd: SKINTOKENS_ROOT,
      env: {
        ...process.env,
        SKINTOKENS_BPY_PORT: new URL(BPY_URL).port || "18176",
        AMT_SKINTOKENS_MODEL_ROOT: MODEL_ROOT,
        AMT_SKINTOKENS_QWEN_ROOT: QWEN_ROOT,
        AMT_BLENDER_EXE: BLENDER_EXE,
        XFORMERS_IGNORE_FLASH_VERSION_CHECK: "1",
      },
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ outputPath: input.outputPath, stdout, stderr });
      } else {
        reject(new Error(`SkinTokens CLI failed with code ${code}\n${stderr || stdout}`));
      }
    });
  });
}
