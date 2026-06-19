import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FileNode } from "../types";
import { fileUrl, fsSplitImage, fsSplitImageRegions } from "../api";

interface ImageSplitModalProps {
  file: FileNode;
  onClose: () => void;
  onExported: () => void;
}

type SplitMode = "grid" | "free";

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

const MIN_GAP = 0.02;
const MIN_BOX = 0.02;

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

interface Cell {
  n: number;
  left: number;
  top: number;
  width: number;
  height: number;
  cx: number;
  cy: number;
}

function getCells(rows: number, cols: number, rowSplits: number[], colSplits: number[]): Cell[] {
  const rowBounds = [0, ...rowSplits, 1];
  const colBounds = [0, ...colSplits, 1];
  const cells: Cell[] = [];
  let n = 1;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const left = colBounds[c];
      const top = rowBounds[r];
      const width = colBounds[c + 1] - colBounds[c];
      const height = rowBounds[r + 1] - rowBounds[r];
      cells.push({
        n,
        left: left * 100,
        top: top * 100,
        width: width * 100,
        height: height * 100,
        cx: (left + width / 2) * 100,
        cy: (top + height / 2) * 100,
      });
      n += 1;
    }
  }
  return cells;
}

const PRESETS = [
  { label: "4张", rows: 2, cols: 2 },
  { label: "6张", rows: 2, cols: 3 },
  { label: "9张", rows: 3, cols: 3 },
] as const;

// Active pointer interaction in free-draw mode.
type FreeInteraction =
  | { kind: "draw"; startX: number; startY: number }
  | { kind: "move"; index: number; offsetX: number; offsetY: number }
  | { kind: "resize"; index: number };

export function ImageSplitModal({ file, onClose, onExported }: ImageSplitModalProps) {
  const [mode, setMode] = useState<SplitMode>("grid");

  // ---- Grid state ----
  const [rows, setRows] = useState(2);
  const [cols, setCols] = useState(3);
  const [rowSplits, setRowSplits] = useState(() => equalSplits(2));
  const [colSplits, setColSplits] = useState(() => equalSplits(3));
  const [selectedCells, setSelectedCells] = useState<Set<number>>(() => new Set([1, 2, 3, 4, 5, 6]));

  // ---- Free-draw state ----
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [draftBox, setDraftBox] = useState<Box | null>(null);
  const [activeBox, setActiveBox] = useState<number | null>(null);

  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const interactionRef = useRef<FreeInteraction | null>(null);

  const allCellNumbers = useMemo(
    () => Array.from({ length: rows * cols }, (_, i) => i + 1),
    [rows, cols],
  );

  const applyGrid = useCallback((nextRows: number, nextCols: number) => {
    const r = Math.max(1, Math.min(12, nextRows));
    const c = Math.max(1, Math.min(12, nextCols));
    setRows(r);
    setCols(c);
    setRowSplits(equalSplits(r));
    setColSplits(equalSplits(c));
    setSelectedCells(new Set(Array.from({ length: r * c }, (_, i) => i + 1)));
  }, []);

  const toggleCell = (n: number) => {
    setSelectedCells((prev) => {
      const next = new Set(prev);
      if (next.has(n)) next.delete(n);
      else next.add(n);
      return next;
    });
  };

  const allSelected = selectedCells.size === allCellNumbers.length;
  const toggleSelectAll = () => {
    setSelectedCells(allSelected ? new Set() : new Set(allCellNumbers));
  };

  const startDrag = (axis: "row" | "col", index: number, e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
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

  // ---- Free-draw pointer handling ----
  const pointFromEvent = (ev: PointerEvent | React.PointerEvent): { x: number; y: number } => {
    const rect = overlayRef.current!.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (ev.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (ev.clientY - rect.top) / rect.height)),
    };
  };

  const beginInteraction = (interaction: FreeInteraction, e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!overlayRef.current) return;
    interactionRef.current = interaction;

    const onMove = (ev: PointerEvent) => {
      const cur = interactionRef.current;
      if (!cur) return;
      const p = pointFromEvent(ev);

      if (cur.kind === "draw") {
        setDraftBox({
          x: Math.min(cur.startX, p.x),
          y: Math.min(cur.startY, p.y),
          w: Math.abs(p.x - cur.startX),
          h: Math.abs(p.y - cur.startY),
        });
      } else if (cur.kind === "move") {
        setBoxes((prev) =>
          prev.map((b, i) => {
            if (i !== cur.index) return b;
            const x = Math.min(1 - b.w, Math.max(0, p.x - cur.offsetX));
            const y = Math.min(1 - b.h, Math.max(0, p.y - cur.offsetY));
            return { ...b, x, y };
          }),
        );
      } else {
        setBoxes((prev) =>
          prev.map((b, i) => {
            if (i !== cur.index) return b;
            return {
              ...b,
              w: Math.max(MIN_BOX, Math.min(1 - b.x, p.x - b.x)),
              h: Math.max(MIN_BOX, Math.min(1 - b.y, p.y - b.y)),
            };
          }),
        );
      }
    };

    const onUp = () => {
      const cur = interactionRef.current;
      interactionRef.current = null;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);

      if (cur?.kind === "draw") {
        setDraftBox((draft) => {
          if (draft && draft.w >= MIN_BOX && draft.h >= MIN_BOX) {
            setBoxes((prev) => {
              setActiveBox(prev.length);
              return [...prev, draft];
            });
          }
          return null;
        });
      }
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const startDraw = (e: React.PointerEvent) => {
    if (mode !== "free" || e.button !== 0) return;
    const p = pointFromEvent(e);
    setActiveBox(null);
    beginInteraction({ kind: "draw", startX: p.x, startY: p.y }, e);
  };

  const removeBox = (index: number) => {
    setBoxes((prev) => prev.filter((_, i) => i !== index));
    setActiveBox(null);
  };

  // Delete key removes the active box in free mode.
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (mode === "free" && activeBox !== null && (ev.key === "Delete" || ev.key === "Backspace")) {
        removeBox(activeBox);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, activeBox]);

  const handleExport = async () => {
    setExporting(true);
    setError(null);
    try {
      if (mode === "grid") {
        const selected = allSelected ? undefined : Array.from(selectedCells).sort((a, b) => a - b);
        if (selected && selected.length === 0) {
          throw new Error("请至少选择一个格子");
        }
        await fsSplitImage({
          filePath: file.path,
          rows,
          cols,
          rowSplits,
          colSplits,
          selected,
        });
      } else {
        if (boxes.length === 0) {
          throw new Error("请先在图片上画出至少一个框");
        }
        await fsSplitImageRegions({
          filePath: file.path,
          regions: boxes,
        });
      }
      onExported();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setExporting(false);
    }
  };

  const cells = getCells(rows, cols, rowSplits, colSplits);
  const exportCount = mode === "grid" ? (allSelected ? rows * cols : selectedCells.size) : boxes.length;
  const baseName = file.name.replace(/\.[^.]+$/, "");

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

              {mode === "grid" ? (
                <div className="image-split-grid grid-overlay" ref={overlayRef}>
                  {cells.map((cell) => {
                    const on = selectedCells.has(cell.n);
                    return (
                      <div
                        key={`cell-${cell.n}`}
                        className={on ? "split-cell" : "split-cell off"}
                        style={{
                          left: `${cell.left}%`,
                          top: `${cell.top}%`,
                          width: `${cell.width}%`,
                          height: `${cell.height}%`,
                        }}
                        onClick={() => toggleCell(cell.n)}
                        title={on ? "点击取消导出此格" : "点击选中此格导出"}
                      />
                    );
                  })}
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
                  {cells.map((cell) => (
                    <span
                      key={`lbl-${cell.n}`}
                      className={selectedCells.has(cell.n) ? "split-cell-label" : "split-cell-label off"}
                      style={{ left: `${cell.cx}%`, top: `${cell.cy}%` }}
                    >
                      {cell.n}
                    </span>
                  ))}
                </div>
              ) : (
                <div
                  className="image-split-grid free-overlay"
                  ref={overlayRef}
                  onPointerDown={startDraw}
                >
                  {boxes.map((b, i) => (
                    <div
                      key={`box-${i}`}
                      className={activeBox === i ? "crop-box active" : "crop-box"}
                      style={{
                        left: `${b.x * 100}%`,
                        top: `${b.y * 100}%`,
                        width: `${b.w * 100}%`,
                        height: `${b.h * 100}%`,
                      }}
                      onPointerDown={(e) => {
                        const p = pointFromEvent(e);
                        setActiveBox(i);
                        beginInteraction(
                          { kind: "move", index: i, offsetX: p.x - b.x, offsetY: p.y - b.y },
                          e,
                        );
                      }}
                    >
                      <span className="crop-box-label">{i + 1}</span>
                      <button
                        type="button"
                        className="crop-box-del"
                        title="删除此框"
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          removeBox(i);
                        }}
                      >
                        ×
                      </button>
                      <span
                        className="crop-box-handle"
                        onPointerDown={(e) => {
                          setActiveBox(i);
                          beginInteraction({ kind: "resize", index: i }, e);
                        }}
                      />
                    </div>
                  ))}
                  {draftBox && (
                    <div
                      className="crop-box draft"
                      style={{
                        left: `${draftBox.x * 100}%`,
                        top: `${draftBox.y * 100}%`,
                        width: `${draftBox.w * 100}%`,
                        height: `${draftBox.h * 100}%`,
                      }}
                    />
                  )}
                </div>
              )}
            </div>
          </div>

          <aside className="image-split-sidebar">
            <div className="split-mode-tabs">
              <button
                type="button"
                className={mode === "grid" ? "split-mode-tab active" : "split-mode-tab"}
                onClick={() => setMode("grid")}
              >
                宫格分割
              </button>
              <button
                type="button"
                className={mode === "free" ? "split-mode-tab active" : "split-mode-tab"}
                onClick={() => setMode("free")}
              >
                自由画框
              </button>
            </div>

            {mode === "grid" ? (
              <>
                <p className="muted">拖动虚线调整分割位置，点击格子可取消/选中导出</p>

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

                <div className="split-selection">
                  <span className="split-section-label">导出选择</span>
                  <button type="button" className="split-link-btn" onClick={toggleSelectAll}>
                    {allSelected ? "全不选" : "全选"}
                  </button>
                  <p className="muted split-selection-hint">已选 {selectedCells.size} / {rows * cols} 个格子</p>
                </div>
              </>
            ) : (
              <>
                <p className="muted">在图片上按住拖拽即可画框；拖动框体移动，拖右下角缩放，点 × 或按 Delete 删除</p>
                <div className="split-selection">
                  <span className="split-section-label">已画框</span>
                  <p className="muted split-selection-hint">共 {boxes.length} 个框</p>
                  {boxes.length > 0 && (
                    <button
                      type="button"
                      className="split-link-btn"
                      onClick={() => {
                        setBoxes([]);
                        setActiveBox(null);
                      }}
                    >
                      清空全部
                    </button>
                  )}
                </div>
              </>
            )}

            {error && <p className="split-error">{error}</p>}

            <button
              type="button"
              className="btn-primary split-export-btn"
              onClick={() => void handleExport()}
              disabled={exporting || exportCount === 0}
            >
              {exporting ? "导出中…" : `导出${exportCount > 0 ? ` (${exportCount})` : ""}`}
            </button>
            <p className="muted split-export-hint">
              将在同目录新建「{baseName}_split」文件夹，按 1、2、3… 保存 PNG
            </p>
          </aside>
        </div>
      </div>
    </div>
  );
}
