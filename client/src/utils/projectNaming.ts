export function toBlenderProjectName(name: string): string {
  return name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "").trim();
}

export function deriveProjectNames(projectName: string, chineseSuffix = "") {
  const trimmed = toBlenderProjectName(projectName);
  const suffix = chineseSuffix.trim();

  return {
    displayName: trimmed,
    blenderProjectName: trimmed,
    conceptFolderName: suffix ? `${trimmed}${suffix}` : trimmed,
  };
}
