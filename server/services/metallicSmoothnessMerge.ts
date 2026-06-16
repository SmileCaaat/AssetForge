import fs from "fs/promises";
import path from "path";
import sharp from "sharp";
import { loadTextureTags, syncTextureTagsFromFiles } from "../blenderTextureTags.js";
import { assertPathInsideRoot } from "../pathSecurity.js";

function sanitizePrefix(displayName: string): string {
  return displayName.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "").trim();
}

function assertAllowed(absPath: string, allowedRoots: string[]): void {
  const ok = allowedRoots.some((root) => {
    try {
      assertPathInsideRoot(absPath, root);
      return true;
    } catch {
      return false;
    }
  });
  if (!ok) throw new Error("Path is outside allowed root");
}

async function resolveTaggedPath(
  projectRoot: string,
  displayName: string,
  type: "Metallic" | "Roughness",
  overrideRelative?: string,
): Promise<string> {
  if (overrideRelative) {
    const abs = path.resolve(projectRoot, overrideRelative.split("/").join(path.sep));
    return abs;
  }

  let tagsFile = await loadTextureTags(projectRoot);
  tagsFile = await syncTextureTagsFromFiles(projectRoot, displayName, tagsFile);
  for (const entry of Object.values(tagsFile.tags)) {
    if (entry.type === type) {
      return path.join(projectRoot, entry.relativePath.split("/").join(path.sep));
    }
  }

  const prefix = sanitizePrefix(displayName);
  const texturesDir = path.join(projectRoot, "textures");
  const entries = await fs.readdir(texturesDir);
  const pattern =
    type === "Metallic"
      ? new RegExp(`^T_${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}_Metallic\\.`, "i")
      : new RegExp(`^T_${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}_Roughness\\.`, "i");
  const match = entries.find((name) => pattern.test(name));
  if (!match) {
    throw new Error(type === "Metallic" ? "未找到 Metallic 贴图" : "未找到 Roughness 贴图");
  }
  return path.join(texturesDir, match);
}

async function readGrayscaleBuffer(imagePath: string, width: number, height: number): Promise<Buffer> {
  return sharp(imagePath)
    .resize(width, height, { fit: "fill" })
    .ensureAlpha()
    .raw()
    .toBuffer();
}

export async function mergeMetallicRoughness(input: {
  projectRoot: string;
  displayName: string;
  allowedRoots: string[];
  metallicPath?: string;
  roughnessPath?: string;
}): Promise<{
  ok: true;
  relativePath: string;
  absolutePath: string;
  width: number;
  height: number;
}> {
  const { projectRoot, displayName, allowedRoots, metallicPath, roughnessPath } = input;
  const prefix = sanitizePrefix(displayName);
  if (!prefix) throw new Error("Invalid project name");

  const metallicAbs = await resolveTaggedPath(projectRoot, displayName, "Metallic", metallicPath);
  const roughnessAbs = await resolveTaggedPath(projectRoot, displayName, "Roughness", roughnessPath);

  assertAllowed(metallicAbs, allowedRoots);
  assertAllowed(roughnessAbs, allowedRoots);

  const [metallicMeta, roughnessMeta] = await Promise.all([
    sharp(metallicAbs).metadata(),
    sharp(roughnessAbs).metadata(),
  ]);

  const width = Math.max(metallicMeta.width ?? 0, roughnessMeta.width ?? 0);
  const height = Math.max(metallicMeta.height ?? 0, roughnessMeta.height ?? 0);
  if (width <= 0 || height <= 0) throw new Error("无法读取贴图尺寸");

  const [metallicRaw, roughnessRaw] = await Promise.all([
    readGrayscaleBuffer(metallicAbs, width, height),
    readGrayscaleBuffer(roughnessAbs, width, height),
  ]);

  const pixelCount = width * height;
  const output = Buffer.alloc(pixelCount * 4);

  for (let i = 0; i < pixelCount; i += 1) {
    const mi = i * 4;
    const metallic = metallicRaw[mi];
    const roughness = roughnessRaw[mi];
    const smoothness = 255 - roughness;
    const o = i * 4;
    output[o] = metallic;
    output[o + 1] = 0;
    output[o + 2] = 0;
    output[o + 3] = smoothness;
  }

  const texturesDir = path.join(projectRoot, "textures");
  await fs.mkdir(texturesDir, { recursive: true });
  const fileName = `T_${prefix}_MetallicSmoothness.png`;
  const outputAbs = path.join(texturesDir, fileName);
  assertAllowed(outputAbs, allowedRoots);

  await sharp(output, { raw: { width, height, channels: 4 } }).png().toFile(outputAbs);

  const relativePath = `textures/${fileName}`;
  return {
    ok: true,
    relativePath,
    absolutePath: outputAbs,
    width,
    height,
  };
}
