import { useRef, useState } from "react";

interface ExternalImportZoneProps {
  enabled: boolean;
  children: React.ReactNode;
  onImportFiles: (files: FileList) => void | Promise<void>;
}

export function ExternalImportZone({
  enabled,
  children,
  onImportFiles,
}: ExternalImportZoneProps) {
  const [dragOver, setDragOver] = useState(false);

  if (!enabled) {
    return <>{children}</>;
  }

  return (
    <div
      className={`import-drop-zone ${dragOver ? "is-drag-over" : ""}`}
      onDragEnter={(e) => {
        if (!e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        setDragOver(true);
      }}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
        setDragOver(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node)) return;
        setDragOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        if (e.dataTransfer.files?.length) {
          void onImportFiles(e.dataTransfer.files);
        }
      }}
    >
      {children}
      {dragOver && <div className="import-drop-hint">松开鼠标导入文件</div>}
    </div>
  );
}

interface ImportFileButtonProps {
  disabled?: boolean;
  onImportFiles: (files: FileList) => void | Promise<void>;
}

export function ImportFileButton({ disabled, onImportFiles }: ImportFileButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <button type="button" disabled={disabled} onClick={() => inputRef.current?.click()}>
        导入
      </button>
      <input
        ref={inputRef}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files?.length) void onImportFiles(e.target.files);
          e.target.value = "";
        }}
      />
    </>
  );
}
