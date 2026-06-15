import { useState } from "react";
import { pickDirectoryPath } from "../lib/pickDirectoryPath";
import { isFileSystemAccessSupported } from "../lib/directoryPicker";

interface PathPickerFieldProps {
  label: string;
  value: string;
  onChange: (path: string) => void;
  pickTitle: string;
  hint?: React.ReactNode;
  required?: boolean;
}

export function folderNameFromPath(folderPath: string): string {
  const normalized = folderPath.replace(/[\\/]+$/, "");
  const parts = normalized.split(/[/\\]/);
  return parts[parts.length - 1] || "";
}

export function PathPickerField({
  label,
  value,
  onChange,
  pickTitle,
  hint,
  required = false,
}: PathPickerFieldProps) {
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fsSupported = isFileSystemAccessSupported();

  const handleBrowse = async () => {
    setPicking(true);
    setError(null);
    try {
      const result = await pickDirectoryPath({
        title: pickTitle,
        defaultPath: value || undefined,
      });
      if (!result.cancelled && result.path) {
        onChange(result.path);
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setPicking(false);
    }
  };

  return (
    <div className="path-picker-field">
      <span className="path-picker-label">{label}</span>
      {!fsSupported && (
        <p className="modal-hint">当前浏览器不支持文件夹选择，将使用系统对话框（请优先使用 Chrome / Edge）。</p>
      )}
      <div className="path-picker-actions">
        <button
          type="button"
          className="btn-ghost path-picker-btn"
          onClick={() => void handleBrowse()}
          disabled={picking}
        >
          {picking ? "选择中…" : "选择文件夹"}
        </button>
        {value ? (
          <code className="path-picker-value" title={value}>
            {value}
          </code>
        ) : (
          <span className="path-picker-placeholder">
            {required ? "请点击左侧按钮选择文件夹" : "未选择"}
          </span>
        )}
      </div>
      {hint}
      {error && <p className="form-error">{error}</p>}
    </div>
  );
}
