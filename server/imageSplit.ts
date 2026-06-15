import fs from "fs/promises";
import path from "path";
import sharp from "sharp";
import { assertWithinRoots } from "./fileOperations.js";

export interface SplitImageInput {
  imagePath: string;
  rows: number;
  cols: number;
  rowSplits: number[];
  colSplits: number[];
  folderName?: string;
  allowedRoots: string[];
}

function validateSplits(rows: number, cols: number, rowSplits: number[], colSplits: number[]): void {
  if (rows < 1 || cols < 1 || rows > 12 || cols > 12) {
    throw new Error("Rows and cols must be between 1 and 12");
  }
  if (rowSplits.length !== rows - 1) {
    throw new Error("Invalid row split count");
  }
  if (colSplits.length !== cols - 1) {
    throw new Error("Invalid column split count");
  }

  const checkSorted = (splits: number[]) => {
    for (let i = 0; i < splits.length; i++) {
      if (splits[i] <= 0 || splits[i] >= 1) throw new Error("Split lines must be inside image");
      if (i > 0 && splits[i] <= splits[i - 1]) throw new Error("Split lines cannot overlap");
    }
  };

  checkSorted(rowSplits);
  checkSorted(colSplits);
}

export async function splitImageGrid(input: SplitImageInput): Promise<{
  outputDir: string;
  files: string[];
}> {
  const { imagePath, rows, cols, rowSplits, colSplits, folderName, allowedRoots } = input;
  validateSplits(rows, cols, rowSplits, colSplits);

  const resolved = assertWithinRoots(imagePath, allowedRoots);
  const parentDir = path.dirname(resolved);
  const baseName = path.basename(resolved, path.extname(resolved));
  const outputDir = path.join(parentDir, folderName?.trim() || `${baseName}_split`);

  await fs.mkdir(outputDir, { recursive: true });

  const metadata = await sharp(resolved).metadata();
  const width = metadata.width;
  const height = metadata.height;
  if (!width || !height) throw new Error("Unable to read image dimensions");

  const rowBounds = [0, ...rowSplits, 1];
  const colBounds = [0, ...colSplits, 1];
  const files: string[] = [];
  let index = 1;

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const left = Math.max(0, Math.round(colBounds[col] * width));
      const top = Math.max(0, Math.round(rowBounds[row] * height));
      const right = Math.min(width, Math.round(colBounds[col + 1] * width));
      const bottom = Math.min(height, Math.round(rowBounds[row + 1] * height));
      const cropWidth = Math.max(1, right - left);
      const cropHeight = Math.max(1, bottom - top);

      const outPath = path.join(outputDir, `${index}.png`);
      await sharp(resolved)
        .extract({ left, top, width: cropWidth, height: cropHeight })
        .png()
        .toFile(outPath);

      files.push(outPath);
      index += 1;
    }
  }

  return { outputDir, files };
}
