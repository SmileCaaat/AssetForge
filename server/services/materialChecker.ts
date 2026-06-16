import fs from "fs/promises";
import path from "path";
import sharp from "sharp";
import { loadTextureTags, syncTextureTagsFromFiles } from "../blenderTextureTags.js";
import type { MaterialCheckItem } from "../materialLabTypes.js";

const META_DIR = ".asset-manager";

function sanitizePrefix(displayName: string): string {
  return displayName.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "").trim();
}

async function pathExists(absPath: string): Promise<boolean> {
  try {
    await fs.access(absPath);
    return true;
  } catch {
    return false;
  }
}

async function imageSize(absPath: string): Promise<{ width: number; height: number } | null> {
  try {
    const meta = await sharp(absPath).metadata();
    if (!meta.width || !meta.height) return null;
    return { width: meta.width, height: meta.height };
  } catch {
    return null;
  }
}

export async function checkUnityTextureStandard(
  projectRoot: string,
  displayName: string,
): Promise<MaterialCheckItem[]> {
  const items: MaterialCheckItem[] = [];
  const prefix = sanitizePrefix(displayName);

  const texturesDir = path.join(projectRoot, "textures");
  const metaDir = path.join(projectRoot, META_DIR);
  const sourceDir = path.join(texturesDir, "source");

  if (!(await pathExists(texturesDir))) {
    items.push({
      level: "error",
      code: "TEXTURES_DIR_MISSING",
      message: "textures/ 目录不存在。",
      suggestion: "在生产项目中创建 textures/ 并放入最终贴图。",
    });
    return items;
  }

  items.push({
    level: "ok",
    code: "TEXTURES_DIR_FOUND",
    message: "textures/ 目录已找到。",
  });

  const tagsPath = path.join(metaDir, "blender_texture_tags.json");
  if (await pathExists(tagsPath)) {
    items.push({ level: "ok", code: "TEXTURE_TAGS_FOUND", message: "blender_texture_tags.json 已找到。" });
  } else {
    items.push({
      level: "warning",
      code: "TEXTURE_TAGS_MISSING",
      message: "未找到 blender_texture_tags.json。",
      suggestion: "在生产视图中标记贴图类型。",
    });
  }

  if (await pathExists(sourceDir)) {
    items.push({ level: "ok", code: "SOURCE_DIR_FOUND", message: "textures/source/ 已找到。" });
  } else {
    items.push({
      level: "info",
      code: "SOURCE_DIR_MISSING",
      message: "textures/source/ 不存在（可选）。",
    });
  }

  let tagsFile = await loadTextureTags(projectRoot);
  tagsFile = await syncTextureTagsFromFiles(projectRoot, displayName, tagsFile);

  const taggedPaths = new Set(Object.keys(tagsFile.tags));
  for (const rel of taggedPaths) {
    if (rel.replace(/\\/g, "/").includes("textures/source/")) {
      items.push({
        level: "warning",
        code: "SOURCE_USED_AS_FINAL",
        message: `textures/source/ 下的文件被标记为最终贴图：${rel}`,
        file: rel,
        suggestion: "source 目录应仅存放原始烘焙源，不应作为材质最终贴图。",
      });
    }
  }

  const findFile = async (pattern: RegExp): Promise<string | null> => {
    try {
      const entries = await fs.readdir(texturesDir, { withFileTypes: true });
      const hit = entries.find((e) => e.isFile() && pattern.test(e.name));
      return hit ? path.join(texturesDir, hit.name) : null;
    } catch {
      return null;
    }
  };

  const baseColorAbs =
    (await findFile(new RegExp(`^T_${prefix}_BaseColor\\.`, "i"))) ??
    null;
  const normalAbs = (await findFile(new RegExp(`^T_${prefix}_Normal\\.`, "i"))) ?? null;
  const msAbs =
    (await findFile(new RegExp(`^T_${prefix}_MetallicSmoothness\\.`, "i"))) ?? null;

  let hasMetallic = false;
  let hasRoughness = false;
  for (const entry of Object.values(tagsFile.tags)) {
    if (entry.type === "Metallic") hasMetallic = true;
    if (entry.type === "Roughness") hasRoughness = true;
  }

  if (baseColorAbs) {
    items.push({ level: "ok", code: "BASECOLOR_FOUND", message: "BaseColor 已找到。", file: baseColorAbs });
    const size = await imageSize(baseColorAbs);
    if (size) {
      if (size.width > 4096 || size.height > 4096) {
        items.push({
          level: "warning",
          code: "BASECOLOR_TOO_LARGE",
          message: `BaseColor 分辨率 ${size.width}×${size.height} 超过 4096。`,
          file: baseColorAbs,
        });
      }
      if (size.width < 512 || size.height < 512) {
        items.push({
          level: "warning",
          code: "BASECOLOR_TOO_SMALL",
          message: `BaseColor 分辨率 ${size.width}×${size.height} 低于 512。`,
          file: baseColorAbs,
        });
      }
    }
  } else {
    items.push({
      level: "error",
      code: "BASECOLOR_MISSING",
      message: "未找到 BaseColor 贴图。",
      suggestion: `期望文件名 T_${prefix}_BaseColor.*`,
    });
  }

  if (normalAbs) {
    items.push({ level: "ok", code: "NORMAL_FOUND", message: "Normal 已找到。", file: normalAbs });
    const size = await imageSize(normalAbs);
    if (size && (size.width > 4096 || size.height > 4096)) {
      items.push({
        level: "warning",
        code: "NORMAL_TOO_LARGE",
        message: `Normal 分辨率 ${size.width}×${size.height} 超过 4096。`,
        file: normalAbs,
      });
    }
  } else {
    items.push({
      level: "warning",
      code: "NORMAL_MISSING",
      message: "未找到 Normal 贴图。",
      suggestion: `期望文件名 T_${prefix}_Normal.*`,
    });
  }

  if (msAbs) {
    items.push({
      level: "ok",
      code: "METALLIC_SMOOTHNESS_FOUND",
      message: "MetallicSmoothness 已找到。",
      file: msAbs,
    });
  } else if (hasMetallic && hasRoughness) {
    items.push({
      level: "warning",
      code: "METALLIC_ROUGHNESS_NEED_MERGE",
      message: "存在 Metallic 与 Roughness，但未找到 MetallicSmoothness。",
      suggestion: "在材质实验室使用「合并 Metallic + Roughness」生成 Unity 用贴图。",
    });
  } else {
    items.push({
      level: "warning",
      code: "METALLIC_SMOOTHNESS_MISSING",
      message: "未找到 MetallicSmoothness；若角色不使用金属/光滑度，可忽略。",
    });
  }

  if ((hasMetallic || hasRoughness) && !msAbs) {
    items.push({
      level: "info",
      code: "SEPARATE_PBR_MAPS",
      message: "检测到分离的 Metallic / Roughness 贴图。",
      suggestion: "Unity URP 推荐使用 T_<Name>_MetallicSmoothness.png（R=Metallic, A=Smoothness）。",
    });
  }

  return items;
}
