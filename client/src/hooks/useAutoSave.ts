import { useEffect, useRef } from "react";

const AUTO_SAVE_INTERVAL_MS = 5 * 60 * 1000;

export interface UseAutoSaveOptions {
  /** 返回 true 时跳过本次自动保存（例如材质实验室打开中） */
  shouldSkip?: () => boolean;
}

export function useAutoSave(
  onSave: (silent: boolean) => Promise<void>,
  options?: UseAutoSaveOptions,
): void {
  const saveRef = useRef(onSave);
  saveRef.current = onSave;

  const skipRef = useRef(options?.shouldSkip);
  skipRef.current = options?.shouldSkip;

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (skipRef.current?.()) return;
      void saveRef.current(true);
    }, AUTO_SAVE_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, []);
}

export const AUTO_SAVE_INTERVAL_MINUTES = AUTO_SAVE_INTERVAL_MS / 60_000;
