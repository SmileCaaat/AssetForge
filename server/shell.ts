import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { promisify } from "util";
import { exec } from "child_process";

const execAsync = promisify(exec);

function quoteForShell(targetPath: string): string {
  return `"${targetPath.replace(/"/g, '\\"')}"`;
}

function normalizeTarget(targetPath: string): string {
  return process.platform === "win32"
    ? path.win32.normalize(path.resolve(targetPath))
    : path.resolve(targetPath);
}

function escapeCmdQuotes(value: string): string {
  return value.replace(/"/g, '""');
}

function escapePowerShellLiteral(value: string): string {
  return value.replace(/'/g, "''");
}

function launchDetached(command: string, args: string[]): void {
  const child = spawn(command, args, {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
    shell: false,
  });
  child.unref();
}

function openWindowsDirectory(dirPath: string): void {
  const quoted = escapeCmdQuotes(dirPath);
  launchDetached("cmd.exe", ["/d", "/c", `start "" explorer.exe "${quoted}"`]);
}

function selectFileInWindowsExplorer(filePath: string): void {
  const normalized = normalizeTarget(filePath);
  const dir = path.dirname(normalized);
  const file = path.basename(normalized);
  const psScript = [
    `$dir='${escapePowerShellLiteral(dir)}'`,
    `$file='${escapePowerShellLiteral(file)}'`,
    `$shell=New-Object -ComObject Shell.Application`,
    `$folder=$shell.Namespace($dir)`,
    `if ($folder) {`,
    `  $item=$folder.ParseName($file)`,
    `  if ($item) { $item.InvokeVerb('select') } else { Start-Process explorer.exe -ArgumentList $dir }`,
    `} else { Start-Process explorer.exe -ArgumentList $dir }`,
  ].join("; ");

  launchDetached("powershell.exe", [
    "-NoProfile",
    "-STA",
    "-WindowStyle",
    "Hidden",
    "-Command",
    psScript,
  ]);
}

function openWindowsExplorer(targetPath: string): void {
  const normalized = normalizeTarget(targetPath);
  const stat = fs.statSync(normalized);

  if (stat.isDirectory()) {
    openWindowsDirectory(normalized);
    return;
  }

  selectFileInWindowsExplorer(normalized);
}

export async function openInExplorer(targetPath: string): Promise<void> {
  const resolved = normalizeTarget(targetPath);
  if (!fs.existsSync(resolved)) {
    throw new Error("Path does not exist");
  }

  if (process.platform === "win32") {
    openWindowsExplorer(resolved);
    return;
  }

  if (process.platform === "darwin") {
    if (fs.statSync(resolved).isFile()) {
      await execAsync(`open -R ${quoteForShell(resolved)}`);
    } else {
      await execAsync(`open ${quoteForShell(resolved)}`);
    }
    return;
  }

  const openPath = fs.statSync(resolved).isFile() ? path.dirname(resolved) : resolved;
  await execAsync(`xdg-open ${quoteForShell(openPath)}`);
}
