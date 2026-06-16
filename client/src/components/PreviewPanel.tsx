import { useEffect, useRef, useState } from "react";
import type { FileNode, ProjectLink, ProjectSide, TextureResizePreset } from "../types";
import { TEXTURE_SIZE_PRESETS } from "../types";
import { fileUrl, formatSize, isBlendFile, isImageFile, isModelFile } from "../api";
import { ModelViewer, type ModelViewerHandle } from "./ModelViewer";

interface PreviewPanelProps {
  file: FileNode | null;
  project: ProjectLink;
  side: ProjectSide;
  previewKey?: string;
  suspendModelPreview?: boolean;
  onSplitImage?: (file: FileNode) => void;
  onMirrorImage?: (
    file: FileNode,
    horizontal: boolean,
    vertical: boolean,
  ) => Promise<void>;
  onResizeTexture?: (file: FileNode, size: TextureResizePreset) => Promise<void>;
}

export function PreviewPanel({
  file,
  project,
  side,
  previewKey,
  suspendModelPreview = false,
  onSplitImage,
  onMirrorImage,
  onResizeTexture,
}: PreviewPanelProps) {
  const modelViewerRef = useRef<ModelViewerHandle>(null);
  const [resizing, setResizing] = useState(false);
  const [mirroring, setMirroring] = useState(false);
  const [flipHorizontal, setFlipHorizontal] = useState(false);
  const [flipVertical, setFlipVertical] = useState(false);
  const [previewVersion, setPreviewVersion] = useState(0);

  useEffect(() => {
    setFlipHorizontal(false);
    setFlipVertical(false);
    setPreviewVersion(0);
  }, [file?.path]);

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

  const showTextureResize = side === "blender" && isImageFile(file) && onResizeTexture;
  const showConceptMirror = side === "concept" && isImageFile(file) && onMirrorImage;
  const hasMirrorPreview = flipHorizontal || flipVertical;

  const handleResize = async (size: TextureResizePreset) => {
    if (!onResizeTexture || resizing) return;
    setResizing(true);
    try {
      await onResizeTexture(file, size);
      setPreviewVersion((v) => v + 1);
    } finally {
      setResizing(false);
    }
  };

  const handleApplyMirror = async () => {
    if (!onMirrorImage || mirroring || !hasMirrorPreview) return;
    setMirroring(true);
    try {
      await onMirrorImage(file, flipHorizontal, flipVertical);
      setFlipHorizontal(false);
      setFlipVertical(false);
      setPreviewVersion((v) => v + 1);
    } finally {
      setMirroring(false);
    }
  };

  const imageTransform = [
    flipHorizontal ? "scaleX(-1)" : "scaleX(1)",
    flipVertical ? "scaleY(-1)" : "scaleY(1)",
  ].join(" ");

  return (
    <div className="preview-content">
      <div className="preview-meta">
        <div className="preview-meta-row">
          <strong>{file.name}</strong>
          <div className="preview-meta-actions">
            {showConceptMirror && (
              <>
                <button
                  type="button"
                  className={`preview-action-btn ${flipHorizontal ? "active" : ""}`}
                  onClick={() => setFlipHorizontal((v) => !v)}
                  title="预览左右镜像"
                >
                  水平镜像
                </button>
                <button
                  type="button"
                  className={`preview-action-btn ${flipVertical ? "active" : ""}`}
                  onClick={() => setFlipVertical((v) => !v)}
                  title="预览上下镜像"
                >
                  垂直镜像
                </button>
                <button
                  type="button"
                  className="preview-action-btn"
                  disabled={!hasMirrorPreview || mirroring}
                  onClick={() => void handleApplyMirror()}
                  title="将当前镜像效果写入文件（覆盖原图）"
                >
                  {mirroring ? "保存中…" : "保存镜像"}
                </button>
                {hasMirrorPreview && (
                  <button
                    type="button"
                    className="preview-action-btn"
                    onClick={() => {
                      setFlipHorizontal(false);
                      setFlipVertical(false);
                    }}
                    title="重置预览镜像"
                  >
                    重置
                  </button>
                )}
              </>
            )}
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

      {showTextureResize && (
        <div className="texture-resize-toolbar">
          <span className="texture-resize-label">纹理尺寸</span>
          <div className="texture-resize-options">
            {TEXTURE_SIZE_PRESETS.map((preset) => (
              <button
                key={preset.size}
                type="button"
                className="texture-resize-btn"
                disabled={resizing}
                title={`${preset.label}×${preset.label} — ${preset.title}`}
                onClick={() => void handleResize(preset.size)}
              >
                <span className="texture-resize-size">{preset.label}</span>
                <span className="texture-resize-title">{preset.title}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {isImageFile(file) && (
        <div className="image-preview">
          <img
            src={fileUrl(
              file.path,
              `${file.modifiedAt ?? file.size ?? file.name}-${previewVersion}`,
            )}
            alt={file.name}
            style={{ transform: imageTransform }}
          />
        </div>
      )}

      {isModelFile(file) && file.extension && (
        suspendModelPreview ? (
          <div className="preview-fallback muted">项目加载中，3D 预览已暂停…</div>
        ) : (
          <ModelViewer
            key={`${previewKey ?? "preview"}-${file.path}`}
            ref={modelViewerRef}
            filePath={file.path}
            extension={file.extension}
          />
        )
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
