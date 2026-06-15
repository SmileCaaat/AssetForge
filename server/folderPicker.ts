import { execFile } from "child_process";
import fs from "fs";
import path from "path";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export interface PickFolderOptions {
  title?: string;
  defaultPath?: string;
}

export interface PickFolderResult {
  cancelled: boolean;
  path?: string;
}

function psQuote(value: string): string {
  return value.replace(/'/g, "''");
}

async function pickFolderWindows(
  title: string,
  defaultPath?: string,
): Promise<PickFolderResult> {
  const initPath =
    defaultPath && fs.existsSync(defaultPath)
      ? `$dialog.SelectedPath = '${psQuote(path.win32.normalize(defaultPath))}'`
      : "";

  const script = [
    "Add-Type -AssemblyName System.Windows.Forms",
    "$dialog = New-Object System.Windows.Forms.FolderBrowserDialog",
    `$dialog.Description = '${psQuote(title)}'`,
    "$dialog.ShowNewFolderButton = $true",
    initPath,
    "$result = $dialog.ShowDialog()",
    "if ($result -eq [System.Windows.Forms.DialogResult]::OK) {",
    "  [Console]::OutputEncoding = [System.Text.Encoding]::UTF8",
    "  Write-Output $dialog.SelectedPath",
    "}",
  ]
    .filter(Boolean)
    .join("; ");

  const { stdout } = await execFileAsync(
    "powershell.exe",
    ["-STA", "-NoProfile", "-Command", script],
    { windowsHide: false, encoding: "utf8", timeout: 600_000 },
  );

  const selected = stdout.trim();
  if (!selected) return { cancelled: true };
  return { cancelled: false, path: path.win32.normalize(selected) };
}

async function pickFolderMac(title: string, defaultPath?: string): Promise<PickFolderResult> {
  const escapedTitle = title.replace(/"/g, '\\"');
  let script = `POSIX path of (choose folder with prompt "${escapedTitle}"`;
  if (defaultPath && fs.existsSync(defaultPath)) {
    script += ` default location POSIX file "${defaultPath.replace(/"/g, '\\"')}"`;
  }
  script += ")";

  try {
    const { stdout } = await execFileAsync("osascript", ["-e", script], { encoding: "utf8" });
    const selected = stdout.trim();
    if (!selected) return { cancelled: true };
    return { cancelled: false, path: selected };
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (Number(err.code) === 1) return { cancelled: true };
    throw error;
  }
}

async function pickFolderLinux(title: string, defaultPath?: string): Promise<PickFolderResult> {
  const args = ["--file-selection", "--directory", "--title", title];
  if (defaultPath && fs.existsSync(defaultPath)) {
    args.push("--filename", `${defaultPath}/`);
  }

  try {
    const { stdout } = await execFileAsync("zenity", args, { encoding: "utf8" });
    const selected = stdout.trim();
    if (!selected) return { cancelled: true };
    return { cancelled: false, path: selected };
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (Number(err.code) === 1) return { cancelled: true };
    throw error;
  }
}

export async function pickFolder(options: PickFolderOptions = {}): Promise<PickFolderResult> {
  const title = options.title?.trim() || "选择文件夹";
  const defaultPath = options.defaultPath?.trim()
    ? path.resolve(options.defaultPath)
    : undefined;

  if (process.platform === "win32") {
    return pickFolderWindows(title, defaultPath);
  }
  if (process.platform === "darwin") {
    return pickFolderMac(title, defaultPath);
  }
  return pickFolderLinux(title, defaultPath);
}
