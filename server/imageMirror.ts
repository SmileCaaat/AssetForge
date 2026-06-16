import fs from "fs/promises";
import path from "path";
import sharp from "sharp";
import { assertWithinRoots } from "./fileOperations.js";

export type ImageMirrorAxis = "horizontal" | "vertical";

export async function mirrorImage(input: {
  imagePath: string;
  horizontal: boolean;
  vertical: boolean;
  allowedRoots: string[];
}): Promise<{
  path: string;
  width: number;
  height: number;
  fileSize: number;
}> {
  if (!input.horizontal && !input.vertical) {
    throw new Error("请至少选择水平或垂直镜像");
  }

  const resolved = path.resolve(input.imagePath);
  await assertWithinRoots(resolved, input.allowedRoots);

  let pipeline = sharp(resolved);
  if (input.horizontal) pipeline = pipeline.flop();
  if (input.vertical) pipeline = pipeline.flip();

  const buffer = await pipeline.toBuffer();
  await fs.writeFile(resolved, buffer);
  const stat = await fs.stat(resolved);
  const meta = await sharp(buffer).metadata();

  return {
    path: resolved,
    width: meta.width ?? 0,
    height: meta.height ?? 0,
    fileSize: stat.size,
  };
}
