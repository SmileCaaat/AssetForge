import path from "path";

export function isPathInsideRoot(targetPath: string, rootPath: string): boolean {
  const resolvedTarget = path.resolve(targetPath);
  const resolvedRoot = path.resolve(rootPath);
  const relative = path.relative(resolvedRoot, resolvedTarget);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

export function assertPathInsideRoot(targetPath: string, rootPath: string): string {
  const resolved = path.resolve(targetPath);
  if (!isPathInsideRoot(resolved, rootPath)) {
    throw new Error("Path is outside allowed root");
  }
  return resolved;
}
