import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import { spawn } from "child_process";
import sharp from "sharp";
import { assertWithinRoots } from "./fileOperations.js";

// realesrgan-ncnn-vulkan lives in runtime/upscale/ (gitignored, shipped per-machine).
const PLATFORM_ROOT = process.env.AMT_PLATFORM_ROOT?.trim() || process.cwd();
const UPSCALE_RUNTIME_ROOT =
  process.env.AMT_UPSCALE_RUNTIME_ROOT?.trim() || path.join(PLATFORM_ROOT, "runtime", "upscale");

export const UPSCALE_SCALES = [2, 3, 4] as const;
export type UpscaleScale = (typeof UPSCALE_SCALES)[number];

const MAX_SCAN_DEPTH = 3;

// Recursively find the first file in `root` matching `predicate` (depth-limited).
function findFile(root: string, predicate: (name: string) => boolean, depth = MAX_SCAN_DEPTH): string | null {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return null;
  }
  for (const entry of entries) {
    if (entry.isFile() && predicate(entry.name)) return path.join(root, entry.name);
  }
  if (depth > 0) {
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const hit = findFile(path.join(root, entry.name), predicate, depth - 1);
        if (hit) return hit;
      }
    }
  }
  return null;
}

// The ncnn zip extracts into a versioned subfolder, so scan recursively.
function findExe(): string | null {
  return findFile(UPSCALE_RUNTIME_ROOT, (f) => /realesrgan-ncnn-vulkan(\.exe)?$/i.test(f));
}

function findModelsDir(): string | null {
  const anyParam = findFile(UPSCALE_RUNTIME_ROOT, (f) => f.endsWith(".param"));
  return anyParam ? path.dirname(anyParam) : null;
}

// Prefer the x4plus-anime model (= RealESRGAN_x4plus_anime_6B) for stylized concept art.
export function pickDefaultModel(models: string[]): string {
  return (
    models.find((m) => /^realesrgan-x4plus-anime$/i.test(m)) ||
    models.find((m) => /x4plus.*anime|anime.*x4plus/i.test(m)) ||
    models.find((m) => /x4plus/i.test(m)) ||
    models.find((m) => /anime/i.test(m)) ||
    models[0] ||
    ""
  );
}

function listModels(modelsDir: string | null): string[] {
  if (!modelsDir) return [];
  try {
    return fs
      .readdirSync(modelsDir)
      .filter((f) => f.endsWith(".param"))
      .map((f) => f.replace(/\.param$/, ""))
      .sort();
  } catch {
    return [];
  }
}

export interface UpscaleStatus {
  available: boolean;
  exePath: string | null;
  modelsDir: string | null;
  models: string[];
  runtimeRoot: string;
}

export function getUpscaleStatus(): UpscaleStatus {
  const exePath = findExe();
  const modelsDir = findModelsDir();
  const models = listModels(modelsDir);
  return {
    available: Boolean(exePath) && models.length > 0,
    exePath,
    modelsDir,
    models,
    runtimeRoot: UPSCALE_RUNTIME_ROOT,
  };
}

export interface UpscaleInput {
  imagePath: string;
  scale: UpscaleScale;
  model?: string;
  allowedRoots: string[];
}

export interface UpscaleResult {
  path: string;
  width: number;
  height: number;
  fileSize: number;
}

export async function upscaleImage(input: UpscaleInput): Promise<UpscaleResult> {
  const { scale } = input;
  if (!UPSCALE_SCALES.includes(scale)) {
    throw new Error("Scale must be 2, 3 or 4");
  }

  const status = getUpscaleStatus();
  if (!status.exePath) {
    throw new Error(
      "未检测到高清化引擎。请将 realesrgan-ncnn-vulkan 解压到 runtime/upscale/ 后重试。",
    );
  }
  if (status.models.length === 0) {
    throw new Error("未检测到任何超分模型 (.param/.bin)，请确认 runtime/upscale/models 已就绪。");
  }

  const model =
    input.model && status.models.includes(input.model)
      ? input.model
      : pickDefaultModel(status.models);

  const resolved = assertWithinRoots(input.imagePath, input.allowedRoots);
  await fsp.access(resolved);

  const dir = path.dirname(resolved);
  const base = path.basename(resolved, path.extname(resolved));
  const outPath = path.join(dir, `${base}_HD.png`);

  const args = [
    "-i", resolved,
    "-o", outPath,
    "-s", String(scale),
    "-n", model,
    "-f", "png",
  ];

  await runExe(status.exePath, args, status.modelsDir, path.dirname(status.exePath));

  if (!fs.existsSync(outPath)) {
    throw new Error("高清化失败：引擎未生成输出文件，请检查模型与显卡驱动。");
  }

  const meta = await sharp(outPath).metadata();
  const stat = await fsp.stat(outPath);
  return {
    path: outPath,
    width: meta.width ?? 0,
    height: meta.height ?? 0,
    fileSize: stat.size,
  };
}

function runExe(
  exePath: string,
  args: string[],
  modelsDir: string | null,
  cwd: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    // Point -m at the models dir when it is a subfolder, so any model name resolves.
    const fullArgs = modelsDir ? [...args, "-m", modelsDir] : args;
    const child = spawn(exePath, fullArgs, { cwd });

    let stderr = "";
    child.stderr.on("data", (d) => {
      stderr += d.toString();
    });
    child.on("error", (err) => reject(new Error(`无法启动高清化引擎: ${err.message}`)));
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        const tail = stderr.trim().split("\n").slice(-4).join("\n");
        reject(new Error(`高清化引擎退出码 ${code}${tail ? `:\n${tail}` : ""}`));
      }
    });
  });
}
