import fs from "fs/promises";
import path from "path";
import { assertWithinRoots } from "./fileOperations.js";

function uniqueImportName(existing: Set<string>, fileName: string): string {
  if (!existing.has(fileName)) return fileName;
  const dot = fileName.lastIndexOf(".");
  const base = dot >= 0 ? fileName.slice(0, dot) : fileName;
  const ext = dot >= 0 ? fileName.slice(dot) : "";
  let index = 1;
  while (existing.has(`${base}_${index}${ext}`)) index += 1;
  return `${base}_${index}${ext}`;
}

export async function importFilesToDirectory(input: {
  destDir: string;
  files: { originalname: string; buffer: Buffer }[];
  allowedRoots: string[];
}): Promise<string[]> {
  const { destDir, files, allowedRoots } = input;
  const resolvedDest = assertWithinRoots(destDir, allowedRoots);

  const stat = await fs.stat(resolvedDest);
  if (!stat.isDirectory()) {
    throw new Error("目标必须是文件夹");
  }

  let entries: string[] = [];
  try {
    entries = await fs.readdir(resolvedDest);
  } catch {
    entries = [];
  }
  const existing = new Set(entries);

  const imported: string[] = [];
  for (const file of files) {
    const safeName = path.basename(file.originalname);
    if (!safeName || safeName === "." || safeName === "..") continue;

    const finalName = uniqueImportName(existing, safeName);
    existing.add(finalName);
    const outPath = path.join(resolvedDest, finalName);
    await fs.writeFile(outPath, file.buffer);
    imported.push(outPath);
  }

  if (imported.length === 0) {
    throw new Error("没有可导入的文件");
  }

  return imported;
}
