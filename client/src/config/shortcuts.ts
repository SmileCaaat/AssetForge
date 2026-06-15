export interface ShortcutConfig {
  rename: string;
  copy: string;
  cut: string;
  paste: string;
  delete: string;
  newFolder: string;
  refresh: string;
}

export const DEFAULT_SHORTCUTS: ShortcutConfig = {
  rename: "F2",
  copy: "Control+c",
  cut: "Control+x",
  paste: "Control+v",
  delete: "Delete",
  newFolder: "Control+Shift+n",
  refresh: "F5",
};

export const SHORTCUT_LABELS: Record<keyof ShortcutConfig, string> = {
  rename: "重命名",
  copy: "复制",
  cut: "剪切",
  paste: "粘贴",
  delete: "删除",
  newFolder: "新建文件夹",
  refresh: "刷新",
};

export function formatShortcut(shortcut: string): string {
  return shortcut
    .replace(/Control/gi, "Ctrl")
    .replace(/Delete/i, "Del")
    .split("+")
    .map((part) => {
      if (part.length === 1) return part.toUpperCase();
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join(" + ");
}

export function matchShortcut(event: KeyboardEvent, shortcut: string): boolean {
  const parts = shortcut.toLowerCase().split("+").map((p) => p.trim());
  const keyPart = parts[parts.length - 1];
  const needCtrl = parts.includes("control") || parts.includes("ctrl");
  const needShift = parts.includes("shift");
  const needAlt = parts.includes("alt");

  const eventKey = event.key.toLowerCase();
  const normalizedKey =
    eventKey === "delete"
      ? "delete"
      : eventKey.length === 1
        ? eventKey
        : eventKey;

  const shortcutKey =
    keyPart === "del"
      ? "delete"
      : keyPart.length === 1
        ? keyPart
        : keyPart;

  return (
    normalizedKey === shortcutKey &&
    event.ctrlKey === needCtrl &&
    event.shiftKey === needShift &&
    event.altKey === needAlt
  );
}

export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable;
}
