import { useEffect } from "react";
import { isEditableTarget } from "../config/shortcuts";

export function useDisableBrowserContextMenu() {
  useEffect(() => {
    const onContextMenu = (event: MouseEvent) => {
      if (isEditableTarget(event.target)) return;
      event.preventDefault();
    };

    document.addEventListener("contextmenu", onContextMenu);
    return () => document.removeEventListener("contextmenu", onContextMenu);
  }, []);
}
