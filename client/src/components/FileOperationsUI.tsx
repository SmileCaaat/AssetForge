import { useState } from "react";
import { formatShortcut, SHORTCUT_LABELS, type ShortcutConfig } from "../config/shortcuts";

interface ContextMenuItem {
  label: string;
  shortcut?: string;
  disabled?: boolean;
  danger?: boolean;
  onClick: () => void;
}

interface ContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  return (
    <div className="context-menu" style={{ left: x, top: y }} onClick={(e) => e.stopPropagation()}>
      {items.map((item) => (
        <button
          key={item.label}
          className={`context-menu-item ${item.danger ? "danger" : ""}`}
          disabled={item.disabled}
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onClick={(e) => {
            if (item.disabled) return;
            e.preventDefault();
            e.stopPropagation();
            item.onClick();
            onClose();
          }}
        >
          <span>{item.label}</span>
          {item.shortcut && <kbd>{formatShortcut(item.shortcut)}</kbd>}
        </button>
      ))}
    </div>
  );
}

interface ToastProps {
  message: { text: string; type: "info" | "error" } | null;
}

export function Toast({ message }: ToastProps) {
  if (!message) return null;
  return <div className={`toast ${message.type}`}>{message.text}</div>;
}

interface PromptDialogProps {
  title: string;
  label: string;
  defaultValue: string;
  onConfirm: (value: string) => Promise<void>;
  onClose: () => void;
}

export function PromptDialog({
  title,
  label,
  defaultValue,
  onConfirm,
  onClose,
}: PromptDialogProps) {
  const [value, setValue] = useState(defaultValue);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await onConfirm(value);
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-sm" onClick={(e) => e.stopPropagation()}>
        <h2>{title}</h2>
        <form onSubmit={(e) => void handleSubmit(e)}>
          <label>
            {label}
            <input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              autoFocus
              onFocus={(e) => e.target.select()}
            />
          </label>
          <div className="modal-actions">
            <button type="button" onClick={onClose} disabled={submitting}>
              取消
            </button>
            <button type="submit" className="btn-primary" disabled={submitting}>
              确定
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface ShortcutsPanelProps {
  shortcuts: ShortcutConfig;
  onClose: () => void;
}

export function ShortcutsPanel({ shortcuts, onClose }: ShortcutsPanelProps) {
  const entries = Object.entries(shortcuts) as [keyof ShortcutConfig, string][];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-sm" onClick={(e) => e.stopPropagation()}>
        <h2>快捷键</h2>
        <div className="shortcuts-list">
          {entries.map(([key, value]) => (
            <div key={key} className="shortcut-row">
              <span>{SHORTCUT_LABELS[key]}</span>
              <kbd>{formatShortcut(value)}</kbd>
            </div>
          ))}
        </div>
        <div className="modal-actions">
          <button type="button" className="btn-primary" onClick={onClose}>
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}
