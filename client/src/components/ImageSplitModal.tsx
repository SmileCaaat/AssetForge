import { useCallback, useRef, useState } from "react";
import type { FileNode } from "../types";
import { fileUrl, fsSplitImage } from "../api";

interface ImageSplitModalProps {
  file: FileNode;
  onClose: () => void;
  onExported: () => void;
}

const MIN_GAP = 0.02;

function equalSplits(dim: number): number[] {
  if (dim <= 1) return [];
  return Array.from({ length: dim - 1 }, (_, i) => (i + 1) / dim);
}

function clampSplit(splits: number[], index: number, value: number): number[] {
  const min = index === 0 ? MIN_GAP : splits[index - 1] + MIN_GAP;
  const max = index === splits.length - 1 ? 1 - MIN_GAP : splits[index + 1] - MIN_GAP;
  const next = [...splits];
  next[index] = Math.max(min, Math.min(max, value));
  return next;
}

function getCellLabels(rows: number, cols: number, rowSplits: number[], colSplits: number[]) {
  const rowBounds = [0, ...rowSplits, 1];
  const colBounds = [0, ...colSplits, 1];
  const labels: { n: number; x: number; y: number }[] = [];
  let n = 1;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      labels.push({
        n,
        x: ((colBounds[c] + colBounds[c + 1]) / 2) * 100,
        y: ((rowBounds[r] + rowBounds[r + 1]) / 2) * 100,
      });
      n += 1;
    }
  }
  return labels;
}

const PRESETS = [
  { label: "4张", rows: 2, cols: 2 },
  { label: "6张", rows: 2, cols: 3 },
  { label: "9张", rows: 3, cols: 3 },
] as const;

export function ImageSplitModal({ file, onClose, onExported }: ImageSplitModalProps) {
  const [rows, setRows] = useState(2);
  const [cols, setCols] = useState(3);
  const [rowSplits, setRowSplits] = useState(() => equalSplits(2));
  const [colSplits, setColSplits] = useState(() => equalSplits(3));
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  const applyGrid = useCallback((nextRows: number, nextCols: number) => {
    const r = Math.max(1, Math.min(12, nextRows));
    const c = Math.max(1, Math.min(12, nextCols));
    setRows(r);
    setCols(c);
    setRowSplits(equalSplits(r));
    setColSplits(equalSplits(c));
  }, []);

  const startDrag = (axis: "row" | "col", index: number, e: React.PointerEvent) => {
    e.preventDefault();
    const rect = overlayRef.current?.getBoundingClientRect();
    if (!rect) return;

    const onMove = (ev: PointerEvent) => {
      if (axis === "col") {
        const fraction = (ev.clientX - rect.left) / rect.width;
        setColSplits((prev) => clampSplit(prev, index, fraction));
      } else {
        const fraction = (ev.clientY - rect.top) / rect.height;
        setRowSplits((prev) => clampSplit(prev, index, fraction));
      }
    };

    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const handleExport = async () => {
    setExporting(true);
    setError(null);
    try {
      await fsSplitImage({
        filePath: file.path,
        rows,
        cols,
        rowSplits,
        colSplits,
      });
      onExported();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setExporting(false);
    }
  };

  const labels = getCellLabels(rows, cols, rowSplits, colSplits);

  return (
    <div className="modal-overlay image-split-overlay" onClick={onClose}>
      <div className="image-split-modal" onClick={(e) => e.stopPropagation()}>
        <div className="image-split-header">
          <h2>图片分割</h2>
          <span className="image-split-filename">{file.name}</span>
          <button type="button" className="image-split-close" onClick={onClose} title="关闭">
            ×
          </button>
        </div>

        <div className="image-split-body">
          <div className="image-split-canvas-wrap">
            <div className="image-split-canvas">
              <img src={fileUrl(file.path)} alt={file.name} draggable={false} />
              <div className="image-split-grid" ref={overlayRef}>
                {colSplits.map((x, i) => (
                  <div
                    key={`v-${i}`}
                    className="split-line split-line-v"
                    style={{ left: `${x * 100}%` }}
                    onPointerDown={(e) => startDrag("col", i, e)}
                  />
                ))}
                {rowSplits.map((y, i) => (
                  <div
                    key={`h-${i}`}
                    className="split-line split-line-h"
                    style={{ top: `${y * 100}%` }}
                    onPointerDown={(e) => startDrag("row", i, e)}
                  />
                ))}
                {labels.map((cell) => (
                  <span
                    key={cell.n}
                    className="split-cell-label"
                    style={{ left: `${cell.x}%`, top: `${cell.y}%` }}
                  >
                    {cell.n}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <aside className="image-split-sidebar">
            <h3>宫格分割</h3>
            <p className="muted">拖动预览区中的虚线调整分割位置</p>

            <div className="split-presets">
              <span className="split-section-label">平均分割</span>
              <div className="split-preset-btns">
                {PRESETS.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    className={
                      rows === preset.rows && cols === preset.cols
                        ? "split-preset-btn active"
                        : "split-preset-btn"
                    }
                    onClick={() => applyGrid(preset.rows, preset.cols)}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="split-custom">
              <span className="split-section-label">自定义</span>
              <label>
                行
                <input
                  type="number"
                  min={1}
                  max={12}
                  value={rows}
                  onChange={(e) => applyGrid(Number(e.target.value), cols)}
                />
              </label>
              <label>
                列
                <input
                  type="number"
                  min={1}
                  max={12}
                  value={cols}
                  onChange={(e) => applyGrid(rows, Number(e.target.value))}
                />
              </label>
            </div>

            {error && <p className="split-error">{error}</p>}

            <button
              type="button"
              className="btn-primary split-export-btn"
              onClick={() => void handleExport()}
              disabled={exporting}
            >
              {exporting ? "导出中…" : "导出"}
            </button>
            <p className="muted split-export-hint">
              将在同目录新建「{file.name.replace(/\.[^.]+$/, "")}_split」文件夹，按 1、2、3… 保存 PNG
            </p>
          </aside>
        </div>
      </div>
    </div>
  );
}
