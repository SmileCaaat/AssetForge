import { useEffect, useRef } from "react";
import { fileUrl } from "../api";
import type { StageJson, StageTextureSlot, StageTextureStatus } from "./terrainTypes";
import { STAGE_TEXTURE_SLOT_LABELS } from "./terrainTypes";

const ALL_SLOTS: StageTextureSlot[] = ["semanticControl", "baseColor"];

const UPLOADABLE: Set<StageTextureSlot> = new Set(["baseColor", "semanticControl"]);

interface StageTexturePanelProps {
  stage: StageJson;
  stageRoot: string;
  conceptProjectPath?: string;
  textureStatus: StageTextureStatus;
  textureVersion: number;
  uploading: StageTextureSlot | null;
  onUpload: (slot: StageTextureSlot, file: File) => void;
  onRegisterUploadTrigger?: (trigger: (slot: StageTextureSlot) => void) => void;
}

function textureAbsPath(stageRoot: string, rel: string): string {
  return `${stageRoot.replace(/\\/g, "/")}/${rel}`.replace(/\/+/g, "/");
}

export function StageTexturePanel({
  stage,
  stageRoot,
  conceptProjectPath,
  textureStatus,
  textureVersion,
  uploading,
  onUpload,
  onRegisterUploadTrigger,
}: StageTexturePanelProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const pendingSlot = useRef<StageTextureSlot | null>(null);

  const triggerUpload = (slot: StageTextureSlot) => {
    pendingSlot.current = slot;
    inputRef.current?.click();
  };

  useEffect(() => {
    onRegisterUploadTrigger?.(triggerUpload);
  });

  return (
    <div className="material-lab-panel stage-texture-panel">
      <h4>贴图槽管理</h4>
      <p className="muted">
        权威路径：<code>TerrainWorkspace/stages/…</code>。保存/上传语义控制图、BaseColor 时，会同步到概念侧{" "}
        {conceptProjectPath ? (
          <code>
            {conceptProjectPath}/stage-lab/{stage.stageName}/textures/
          </code>
        ) : (
          <code>stage-lab/&lt;Stage&gt;/textures/</code>
        )}
        ，可在 AssetForge 文件树中查看。
      </p>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          const slot = pendingSlot.current;
          if (file && slot) onUpload(slot, file);
          e.target.value = "";
          pendingSlot.current = null;
        }}
      />
      <ul className="stage-texture-list">
        {ALL_SLOTS.map((slot) => {
          const rel = stage.textures[slot];
          const abs = textureAbsPath(stageRoot, rel);
          const url = fileUrl(abs, textureVersion);
          const has = textureStatus[slot];
          const canUpload = UPLOADABLE.has(slot);
          return (
            <li key={slot} className={`stage-texture-row${has ? " has-file" : ""}`}>
              <div className="stage-texture-head">
                <strong>{STAGE_TEXTURE_SLOT_LABELS[slot]}</strong>
                <span className={`stage-status-badge sm${has ? " ok" : ""}`}>
                  {has ? (canUpload ? "已有" : "已生成") : canUpload ? "缺失" : "未生成"}
                </span>
                {canUpload && (
                  <button
                    type="button"
                    className="btn-sm"
                    disabled={uploading === slot}
                    onClick={() => triggerUpload(slot)}
                  >
                    {uploading === slot ? "上传中…" : "上传"}
                  </button>
                )}
              </div>
              <code className="stage-texture-path">{rel}</code>
              {has && (
                <div className="stage-texture-preview">
                  <img
                    src={url}
                    alt={slot}
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                    onLoad={(e) => {
                      (e.target as HTMLImageElement).style.display = "block";
                    }}
                  />
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
