import { useEffect, useState } from "react";
import type { FileNode } from "../types";
import { fileUrl, getUpscaleStatus, upscaleImage, type UpscaleStatus } from "../api";

interface ImageUpscaleModalProps {
  file: FileNode;
  onClose: () => void;
  onExported: () => void;
}

const SCALES = [2, 3, 4] as const;

// Friendly labels for the common ncnn-vulkan model ids.
function modelLabel(id: string): string {
  if (/anime/i.test(id)) return `${id}（风格化/动漫，推荐）`;
  if (/x4plus/i.test(id)) return `${id}（通用照片）`;
  return id;
}

export function ImageUpscaleModal({ file, onClose, onExported }: ImageUpscaleModalProps) {
  const [status, setStatus] = useState<UpscaleStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [scale, setScale] = useState<(typeof SCALES)[number]>(4);
  const [model, setModel] = useState<string>("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultPath, setResultPath] = useState<string | null>(null);
  const [resultInfo, setResultInfo] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    let alive = true;
    getUpscaleStatus()
      .then((s) => {
        if (!alive) return;
        setStatus(s);
        // Prefer the x4plus-anime model (= RealESRGAN_x4plus_anime_6B) for stylized art.
        const preferred =
          s.models.find((m) => /^realesrgan-x4plus-anime$/i.test(m)) ||
          s.models.find((m) => /x4plus/i.test(m)) ||
          s.models.find((m) => /anime/i.test(m)) ||
          s.models[0] ||
          "";
        setModel(preferred);
      })
      .catch((err) => {
        if (alive) setStatusError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      alive = false;
    };
  }, []);

  const handleRun = async () => {
    setRunning(true);
    setError(null);
    try {
      const res = await upscaleImage(file.path, scale, model || undefined);
      setResultPath(res.path);
      setResultInfo({ width: res.width, height: res.height });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  };

  const available = status?.available ?? false;
  const baseName = file.name.replace(/\.[^.]+$/, "");

  return (
    <div className="modal-overlay image-split-overlay" onClick={onClose}>
      <div className="image-split-modal" onClick={(e) => e.stopPropagation()}>
        <div className="image-split-header">
          <h2>高清化</h2>
          <span className="image-split-filename">{file.name}</span>
          <button type="button" className="image-split-close" onClick={onClose} title="关闭">
            ×
          </button>
        </div>

        <div className="image-split-body">
          <div className="image-split-canvas-wrap upscale-compare">
            <figure className="upscale-figure">
              <img src={fileUrl(file.path)} alt="原图" draggable={false} />
              <figcaption>原图</figcaption>
            </figure>
            <figure className="upscale-figure">
              {resultPath ? (
                <img src={fileUrl(resultPath, Date.now())} alt="高清结果" draggable={false} />
              ) : (
                <div className="upscale-placeholder">
                  {running ? "正在高清化…" : "高清结果将显示在此"}
                </div>
              )}
              <figcaption>
                高清结果
                {resultInfo ? ` · ${resultInfo.width}×${resultInfo.height}` : ""}
              </figcaption>
            </figure>
          </div>

          <aside className="image-split-sidebar">
            <h3>AI 超分（Real-ESRGAN）</h3>

            {statusError ? (
              <p className="split-error">无法读取引擎状态：{statusError}</p>
            ) : !status ? (
              <p className="muted">正在检测高清化引擎…</p>
            ) : !available ? (
              <div className="upscale-missing">
                <p className="split-error">未检测到高清化引擎</p>
                <p className="muted">
                  请将 <code>realesrgan-ncnn-vulkan</code> 解压到下面目录后重新打开本窗口：
                </p>
                <code className="upscale-path">{status.runtimeRoot}</code>
                <p className="muted split-export-hint">
                  需包含可执行文件与 <code>models/</code>（<code>.param</code> + <code>.bin</code>）。
                  下载：github.com/xinntao/Real-ESRGAN/releases
                </p>
              </div>
            ) : (
              <>
                <p className="muted">本地 GPU 超分，不上传图片。结果另存为新文件，不覆盖原图。</p>

                <div className="split-presets">
                  <span className="split-section-label">放大倍数</span>
                  <div className="split-preset-btns">
                    {SCALES.map((s) => (
                      <button
                        key={s}
                        type="button"
                        className={scale === s ? "split-preset-btn active" : "split-preset-btn"}
                        onClick={() => setScale(s)}
                      >
                        {s}x
                      </button>
                    ))}
                  </div>
                </div>

                <div className="split-custom">
                  <span className="split-section-label">模型</span>
                  <select
                    className="upscale-model-select"
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                  >
                    {status.models.map((m) => (
                      <option key={m} value={m}>
                        {modelLabel(m)}
                      </option>
                    ))}
                  </select>
                </div>

                {error && <p className="split-error">{error}</p>}

                <button
                  type="button"
                  className="btn-primary split-export-btn"
                  onClick={() => void handleRun()}
                  disabled={running}
                >
                  {running ? "高清化中…" : resultPath ? "重新高清化" : "开始高清化"}
                </button>

                {resultPath && (
                  <button
                    type="button"
                    className="split-link-btn"
                    onClick={onExported}
                    style={{ alignSelf: "stretch", textAlign: "center" }}
                  >
                    完成并刷新文件树
                  </button>
                )}

                <p className="muted split-export-hint">
                  输出：同目录「{baseName}_HD.png」
                </p>
              </>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}
