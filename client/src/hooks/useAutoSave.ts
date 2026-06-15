import { useEffect, useRef } from "react";

const AUTO_SAVE_INTERVAL_MS = 5 * 60 * 1000;

export function useAutoSave(onSave: (silent: boolean) => Promise<void>): void {
  const saveRef = useRef(onSave);
  saveRef.current = onSave;

  useEffect(() => {
    const timer = window.setInterval(() => {
      void saveRef.current(true);
    }, AUTO_SAVE_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, []);
}

export const AUTO_SAVE_INTERVAL_MINUTES = AUTO_SAVE_INTERVAL_MS / 60_000;
