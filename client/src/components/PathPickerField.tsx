import { useState } from "react";
import { formatApiError } from "../api";
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
      setError(formatApiError(err));
    } finally {
      setPicking(false);
    }
  };

  return (
    <div className="path-picker-field">
      <span className="path-picker-label">{label}</span>
      {!fsSupported && (
        <p className="path-picker-note">
          当前浏览器不支持文件夹选择，将使用系统对话框（请优先使用 Chrome / Edge）。
        </p>
      )}
      <div className="path-picker-row">
        <button
          type="button"
          className="btn-pick-folder"
          onClick={() => void handleBrowse()}
          disabled={picking}
        >
          {picking ? "选择中…" : "选择文件夹"}
        </button>
        <div className="path-picker-path" title={value || undefined}>
          {value ? (
            <code className="path-picker-value">{value}</code>
          ) : (
            <span className="path-picker-placeholder">
              {required ? "尚未选择文件夹" : "未选择（可选）"}
            </span>
          )}
        </div>
      </div>
      {hint}
      {error && <p className="form-error">{error}</p>}
    </div>
  );
}
