import { useRef } from "react";
import type { FileNode, ProjectLink, ProjectSide } from "../types";
import { fileUrl, formatSize, isBlendFile, isImageFile, isModelFile } from "../api";
import { ModelViewer, type ModelViewerHandle } from "./ModelViewer";

interface PreviewPanelProps {
  file: FileNode | null;
  project: ProjectLink;
  side: ProjectSide;
  onSplitImage?: (file: FileNode) => void;
}

export function PreviewPanel({ file, project, side, onSplitImage }: PreviewPanelProps) {
  const modelViewerRef = useRef<ModelViewerHandle>(null);

  if (!file) {
    return (
      <div className="preview-empty">
        <p>从左侧选择图片或 3D 模型进行预览</p>
        <p className="muted">
          {side === "concept" ? project.conceptPath : project.blenderPath}
        </p>
      </div>
    );
  }

  return (
    <div className="preview-content">
      <div className="preview-meta">
        <div className="preview-meta-row">
          <strong>{file.name}</strong>
          <div className="preview-meta-actions">
            {side === "concept" && isImageFile(file) && onSplitImage && (
              <button
                type="button"
                className="preview-action-btn"
                onClick={() => onSplitImage(file)}
              >
                图片分割
              </button>
            )}
            {isModelFile(file) && file.extension === ".fbx" && (
              <button
                type="button"
                className="preview-action-btn"
                onClick={() => modelViewerRef.current?.resetFrontView()}
              >
                正视图
              </button>
            )}
          </div>
        </div>
        <span>{file.relativePath}</span>
        <span>{formatSize(file.size)}</span>
      </div>

      {isImageFile(file) && (
        <div className="image-preview">
          <img src={fileUrl(file.path)} alt={file.name} />
        </div>
      )}

      {isModelFile(file) && file.extension && (
        <ModelViewer ref={modelViewerRef} filePath={file.path} extension={file.extension} />
      )}

      {isBlendFile(file) && (
        <div className="preview-fallback">
          <div className="blend-icon">B</div>
          <p>Blender 源文件无法内嵌预览</p>
          <code>{file.path}</code>
          <p className="muted">可在 renders/ 目录查看渲染预览图</p>
        </div>
      )}
    </div>
  );
}
