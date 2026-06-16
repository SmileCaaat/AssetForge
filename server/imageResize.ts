import fs from "fs/promises";
import path from "path";
import sharp from "sharp";
import { assertWithinRoots } from "./fileOperations.js";

export const TEXTURE_RESIZE_PRESETS = [256, 512, 1024, 2048, 4096] as const;

export type TextureResizePreset = (typeof TEXTURE_RESIZE_PRESETS)[number];

export async function resizeTextureImage(input: {
  imagePath: string;
  size: TextureResizePreset;
  allowedRoots: string[];
}): Promise<{
  path: string;
  width: number;
  height: number;
  fileSize: number;
}> {
  const resolved = path.resolve(input.imagePath);
  await assertWithinRoots(resolved, input.allowedRoots);

  const meta = await sharp(resolved).metadata();
  if (!meta.width || !meta.height) {
    throw new Error("Unable to read image dimensions");
  }

  const buffer = await sharp(resolved)
    .resize(input.size, input.size, { fit: "fill" })
    .toBuffer();

  await fs.writeFile(resolved, buffer);
  const stat = await fs.stat(resolved);

  return {
    path: resolved,
    width: input.size,
    height: input.size,
    fileSize: stat.size,
  };
}
