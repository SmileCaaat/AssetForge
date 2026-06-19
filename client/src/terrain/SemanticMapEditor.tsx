import { useCallback, useEffect, useRef, useState } from "react";
import { fileUrl } from "../api";
import type { SemanticPalette, SemanticPaletteColor, StageJson } from "./terrainTypes";
import {
  applySemanticProceduralAsync,
  FUSION_RECIPE_LABELS,
  layoutScaleDefaults,
  LAYOUT_SCALE_HINTS,
  LAYOUT_SCALE_LABELS,
  REGION_RECIPE_LABELS,
  type ProceduralProgress,
  type SemanticFusionRecipe,
  type SemanticLayoutScale,
  type SemanticProceduralRecipe,
  type SemanticRegionRecipe,
} from "./semanticProcedural";
import {
  findPaletteColorByRgb,
  floodFill,
  isAnchorColor,
  parseHex,
  snapImageDataToPalette,
  type Rgb,
} from "./semanticColor";

export type SemanticTool = "brush" | "eraser" | "fill" | "picker" | "anchor" | "rect";

const TOOL_LABELS: Record<SemanticTool, string> = {
  brush: "画笔",
  eraser: "橡皮",
  fill: "填充",
  picker: "拾色",
  anchor: "锚点（钢笔）",
  rect: "矩形",
};

const MAX_UNDO = 6;
const ANCHOR_MARKER_RADIUS = 8;

interface SemanticMapEditorProps {
  stage: StageJson;
  stageRoot: string;
  palette: SemanticPalette;
  selectedColor: SemanticPaletteColor;
  textureVersion: number;
  hasBaseColor?: boolean;
  saving: boolean;
  onSaveSemantic: (file: File) => Promise<void>;
  onPickColor: (color: SemanticPaletteColor) => void;
  onDirtyChange?: (dirty: boolean) => void;
}

function textureAbsPath(stageRoot: string, rel: string): string {
  return `${stageRoot.replace(/\\/g, "/")}/${rel}`.replace(/\/+/g, "/");
}

function clientToImage(
  el: HTMLElement,
  clientX: number,
  clientY: number,
  iw: number,
  ih: number,
): { x: number; y: number } {
  const rect = el.getBoundingClientRect();
  const x = Math.floor(((clientX - rect.left) / rect.width) * iw);
  const y = Math.floor(((clientY - rect.top) / rect.height) * ih);
  return {
    x: Math.max(0, Math.min(iw - 1, x)),
    y: Math.max(0, Math.min(ih - 1, y)),
  };
}

function cloneImageData(data: ImageData): ImageData {
  return new ImageData(new Uint8ClampedArray(data.data), data.width, data.height);
}

export function SemanticMapEditor({
  stage,
  stageRoot,
  palette,
  selectedColor,
  textureVersion,
  hasBaseColor = false,
  saving,
  onSaveSemantic,
  onPickColor,
  onDirtyChange,
}: SemanticMapEditorProps) {
  const iw = stage.resolution.width;
  const ih = stage.resolution.height;
  const wrapRef = useRef<HTMLDivElement>(null);
  const displayRef = useRef<HTMLCanvasElement>(null);
  const offscreenRef = useRef<HTMLCanvasElement | null>(null);
  const undoRef = useRef<ImageData[]>([]);
  const redoRef = useRef<ImageData[]>([]);
  const paintingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const rectStartRef = useRef<{ x: number; y: number } | null>(null);
  const snapshotTakenRef = useRef(false);

  const [tool, setTool] = useState<SemanticTool>("brush");
  const [brushSize, setBrushSize] = useState(8);
  const [showGrid, setShowGrid] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [undoLen, setUndoLen] = useState(0);
  const [redoLen, setRedoLen] = useState(0);
  const [rectPreview, setRectPreview] = useState<{ x: number; y: number } | null>(null);
  const [normalizeHint, setNormalizeHint] = useState<string | null>(null);
  const [showReference, setShowReference] = useState(true);
  const [referenceOpacity, setReferenceOpacity] = useState(45);
  const [semanticOpacity, setSemanticOpacity] = useState(100);
  const [procSeed, setProcSeed] = useState(() => Math.floor(Math.random() * 99999) + 1);
  const [procFringe, setProcFringe] = useState(3);
  const [procGap, setProcGap] = useState(2);
  const [procDensity, setProcDensity] = useState(5);
  const [procPlatformCount, setProcPlatformCount] = useState(4);
  const [procRoadWidth, setProcRoadWidth] = useState(20);
  const [procLayoutScale, setProcLayoutScale] = useState<SemanticLayoutScale>("compact");
  const [procRunning, setProcRunning] = useState(false);
  const [procProgress, setProcProgress] = useState<ProceduralProgress | null>(null);
  const referenceImageRef = useRef<HTMLImageElement | null>(null);
  const [referenceReady, setReferenceReady] = useState(false);

  const grassColor = palette.colors.find((c) => c.id === "grass") ?? palette.colors[0];
  const grassHex = grassColor.hex;
  const eraserRgb = parseHex(grassHex);
  const activeRgb = parseHex(selectedColor.hex);
  const paletteRef = useRef(palette);
  paletteRef.current = palette;

  const markDirty = useCallback(
    (next: boolean) => {
      setDirty(next);
      onDirtyChange?.(next);
    },
    [onDirtyChange],
  );

  const getOffscreen = useCallback(() => {
    if (!offscreenRef.current) {
      const c = document.createElement("canvas");
      c.width = iw;
      c.height = ih;
      offscreenRef.current = c;
    }
    return offscreenRef.current;
  }, [iw, ih]);

  const blitToDisplay = useCallback(
    (previewRect?: { x0: number; y0: number; x1: number; y1: number }) => {
      const off = offscreenRef.current;
      const display = displayRef.current;
      if (!off || !display) return;
      const ctx = display.getContext("2d");
      if (!ctx) return;
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, display.width, display.height);

      if (showReference && referenceReady && referenceImageRef.current) {
        ctx.globalAlpha = referenceOpacity / 100;
        ctx.drawImage(referenceImageRef.current, 0, 0, display.width, display.height);
      }

      ctx.globalAlpha = semanticOpacity / 100;
      ctx.drawImage(off, 0, 0, display.width, display.height);
      ctx.globalAlpha = 1;

      if (showGrid) {
        ctx.strokeStyle = "rgba(255,255,255,0.18)";
        ctx.lineWidth = 1;
        for (let i = 1; i < 16; i++) {
          const x = (display.width / 16) * i;
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, display.height);
          ctx.stroke();
        }
        for (let j = 1; j < 9; j++) {
          const y = (display.height / 9) * j;
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(display.width, y);
          ctx.stroke();
        }
      }
      if (previewRect) {
        const { x0, y0, x1, y1 } = previewRect;
        const sx = display.width / iw;
        const sy = display.height / ih;
        const left = Math.min(x0, x1) * sx;
        const top = Math.min(y0, y1) * sy;
        const w = Math.abs(x1 - x0) * sx;
        const h = Math.abs(y1 - y0) * sy;
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        ctx.strokeRect(left, top, w, h);
        ctx.setLineDash([]);
      }
    },
    [iw, ih, referenceOpacity, referenceReady, semanticOpacity, showGrid, showReference],
  );

  const blitRef = useRef(blitToDisplay);
  blitRef.current = blitToDisplay;

  const pushUndo = useCallback(() => {
    const off = offscreenRef.current;
    if (!off) return;
    const ctx = off.getContext("2d");
    if (!ctx) return;
    const snap = ctx.getImageData(0, 0, iw, ih);
    undoRef.current.push(snap);
    if (undoRef.current.length > MAX_UNDO) undoRef.current.shift();
    redoRef.current = [];
    setUndoLen(undoRef.current.length);
    setRedoLen(0);
  }, [iw, ih]);

  const fillCanvas = useCallback(
    (rgb: Rgb) => {
      const off = getOffscreen();
      const ctx = off.getContext("2d");
      if (!ctx) return;
      ctx.fillStyle = `rgb(${rgb.r},${rgb.g},${rgb.b})`;
      ctx.fillRect(0, 0, iw, ih);
    },
    [getOffscreen, iw, ih],
  );

  useEffect(() => {
    let cancelled = false;
    setLoaded(false);

    if (offscreenRef.current && (offscreenRef.current.width !== iw || offscreenRef.current.height !== ih)) {
      offscreenRef.current = null;
    }
    const off = getOffscreen();
    const rel = stage.textures.semanticControl;
    const abs = textureAbsPath(stageRoot, rel);
    const url = fileUrl(abs, textureVersion);
    const eraser = parseHex(grassHex);

    const finish = () => {
      if (cancelled) return;
      undoRef.current = [];
      redoRef.current = [];
      setUndoLen(0);
      setRedoLen(0);
      setLoaded(true);
      setDirty(false);
      onDirtyChange?.(false);
      requestAnimationFrame(() => blitRef.current());
    };

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (cancelled) return;
      const ctx = off.getContext("2d");
      if (!ctx) {
        finish();
        return;
      }
      ctx.clearRect(0, 0, iw, ih);
      ctx.drawImage(img, 0, 0, iw, ih);
      const data = ctx.getImageData(0, 0, iw, ih);
      snapImageDataToPalette(data, paletteRef.current);
      ctx.putImageData(data, 0, 0);
      finish();
    };
    img.onerror = () => {
      if (cancelled) return;
      const ctx = off.getContext("2d");
      if (ctx) {
        ctx.fillStyle = `rgb(${eraser.r},${eraser.g},${eraser.b})`;
        ctx.fillRect(0, 0, iw, ih);
      }
      finish();
    };
    img.src = url;

    return () => {
      cancelled = true;
      img.onload = null;
      img.onerror = null;
    };
  }, [
    getOffscreen,
    grassHex,
    iw,
    ih,
    onDirtyChange,
    stage.stageName,
    stage.textures.semanticControl,
    stageRoot,
    textureVersion,
  ]);

  useEffect(() => {
    if (!hasBaseColor) {
      referenceImageRef.current = null;
      setReferenceReady(false);
      return;
    }
    let cancelled = false;
    const rel = stage.textures.baseColor;
    const abs = textureAbsPath(stageRoot, rel);
    const url = fileUrl(abs, textureVersion);
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (cancelled) return;
      referenceImageRef.current = img;
      setReferenceReady(true);
      requestAnimationFrame(() => blitRef.current());
    };
    img.onerror = () => {
      if (cancelled) return;
      referenceImageRef.current = null;
      setReferenceReady(false);
    };
    img.src = url;
    return () => {
      cancelled = true;
      img.onload = null;
      img.onerror = null;
    };
  }, [hasBaseColor, stage.textures.baseColor, stageRoot, textureVersion]);

  useEffect(() => {
    if (loaded) blitToDisplay();
  }, [blitToDisplay, loaded, showGrid, referenceOpacity, semanticOpacity, showReference, referenceReady]);

  const strokeAt = useCallback(
    (x: number, y: number, rgb: Rgb, radius: number) => {
      const off = getOffscreen();
      const ctx = off.getContext("2d");
      if (!ctx) return;
      ctx.fillStyle = `rgb(${rgb.r},${rgb.g},${rgb.b})`;
      if (radius <= 1) {
        ctx.fillRect(x, y, 1, 1);
        return;
      }
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    },
    [getOffscreen],
  );

  const paintStroke = useCallback(
    (x0: number, y0: number, x1: number, y1: number, rgb: Rgb, radius: number) => {
      const off = getOffscreen();
      const ctx = off.getContext("2d");
      if (!ctx) return;

      if (radius <= 1) {
        const dx = x1 - x0;
        const dy = y1 - y0;
        const dist = Math.hypot(dx, dy);
        const steps = Math.max(1, Math.ceil(dist));
        ctx.fillStyle = `rgb(${rgb.r},${rgb.g},${rgb.b})`;
        for (let i = 0; i <= steps; i++) {
          const t = i / steps;
          ctx.fillRect(Math.round(x0 + dx * t), Math.round(y0 + dy * t), 1, 1);
        }
        return;
      }

      ctx.strokeStyle = `rgb(${rgb.r},${rgb.g},${rgb.b})`;
      ctx.lineWidth = radius * 2;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
    },
    [getOffscreen],
  );

  const applyPaint = useCallback(
    (x: number, y: number, rgb: Rgb, radius: number) => {
      const last = lastPointRef.current;
      if (last) {
        paintStroke(last.x, last.y, x, y, rgb, radius);
      } else {
        strokeAt(x, y, rgb, radius);
      }
      lastPointRef.current = { x, y };
    },
    [paintStroke, strokeAt],
  );

  const paintAnchorMarker = useCallback(
    (x: number, y: number, rgb: Rgb) => {
      const off = getOffscreen();
      const ctx = off.getContext("2d");
      if (!ctx) return;
      ctx.fillStyle = `rgb(${rgb.r},${rgb.g},${rgb.b})`;
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, ANCHOR_MARKER_RADIUS, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillRect(x, y, 1, 1);
    },
    [getOffscreen],
  );

  const paintRect = useCallback(
    (x0: number, y0: number, x1: number, y1: number, rgb: Rgb) => {
      const off = getOffscreen();
      const ctx = off.getContext("2d");
      if (!ctx) return;
      const left = Math.min(x0, x1);
      const top = Math.min(y0, y1);
      const w = Math.abs(x1 - x0) + 1;
      const h = Math.abs(y1 - y0) + 1;
      ctx.fillStyle = `rgb(${rgb.r},${rgb.g},${rgb.b})`;
      ctx.fillRect(left, top, w, h);
    },
    [getOffscreen],
  );

  const applyFill = useCallback(
    (x: number, y: number, rgb: Rgb) => {
      const off = getOffscreen();
      const ctx = off.getContext("2d");
      if (!ctx) return;
      const data = ctx.getImageData(0, 0, iw, ih);
      floodFill(data, x, y, rgb);
      ctx.putImageData(data, 0, 0);
    },
    [getOffscreen, iw, ih],
  );

  const pickAt = useCallback(
    (x: number, y: number) => {
      const off = getOffscreen();
      const ctx = off.getContext("2d");
      if (!ctx) return;
      const data = ctx.getImageData(x, y, 1, 1).data;
      const match = findPaletteColorByRgb({ r: data[0], g: data[1], b: data[2] }, palette, 24);
      if (match) onPickColor(match);
    },
    [getOffscreen, onPickColor, palette],
  );

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!loaded || !wrapRef.current) return;
    e.preventDefault();
    wrapRef.current.setPointerCapture(e.pointerId);
    const { x, y } = clientToImage(wrapRef.current, e.clientX, e.clientY, iw, ih);

    if (tool === "picker") {
      pickAt(x, y);
      return;
    }

    if (tool === "fill") {
      pushUndo();
      applyFill(x, y, activeRgb);
      markDirty(true);
      blitToDisplay();
      return;
    }

    if (tool === "rect") {
      rectStartRef.current = { x, y };
      setRectPreview({ x, y });
      snapshotTakenRef.current = false;
      return;
    }

    if (tool === "anchor") {
      if (!isAnchorColor(selectedColor)) {
        setNormalizeHint("请先在右侧调色板选择道具锚点色，再用钢笔式锚点单击放置");
        return;
      }
      pushUndo();
      paintAnchorMarker(x, y, activeRgb);
      markDirty(true);
      setNormalizeHint(null);
      blitToDisplay();
      return;
    }

    paintingRef.current = true;
    snapshotTakenRef.current = false;
    lastPointRef.current = null;

    const rgb = tool === "eraser" ? eraserRgb : activeRgb;
    const radius = brushSize;

    if (!snapshotTakenRef.current) {
      pushUndo();
      snapshotTakenRef.current = true;
    }
    applyPaint(x, y, rgb, radius);
    markDirty(true);
    blitToDisplay();
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!loaded || !wrapRef.current) return;
    const { x, y } = clientToImage(wrapRef.current, e.clientX, e.clientY, iw, ih);

    if (tool === "rect" && rectStartRef.current) {
      setRectPreview({ x, y });
      blitToDisplay({
        x0: rectStartRef.current.x,
        y0: rectStartRef.current.y,
        x1: x,
        y1: y,
      });
      return;
    }

    if (!paintingRef.current) return;
    if (tool === "fill" || tool === "picker" || tool === "anchor") return;

    const rgb = tool === "eraser" ? eraserRgb : activeRgb;
    const radius = brushSize;
    applyPaint(x, y, rgb, radius);
    markDirty(true);
    blitToDisplay();
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!loaded || !wrapRef.current) return;
    paintingRef.current = false;
    lastPointRef.current = null;

    if (wrapRef.current.hasPointerCapture(e.pointerId)) {
      wrapRef.current.releasePointerCapture(e.pointerId);
    }

    if (tool === "rect" && rectStartRef.current) {
      const { x, y } = clientToImage(wrapRef.current, e.clientX, e.clientY, iw, ih);
      if (!snapshotTakenRef.current) {
        pushUndo();
        snapshotTakenRef.current = true;
      }
      paintRect(rectStartRef.current.x, rectStartRef.current.y, x, y, activeRgb);
      rectStartRef.current = null;
      setRectPreview(null);
      markDirty(true);
      blitToDisplay();
    }
  };

  const undo = () => {
    const off = getOffscreen();
    const ctx = off.getContext("2d");
    if (!ctx || undoRef.current.length === 0) return;
    const current = ctx.getImageData(0, 0, iw, ih);
    redoRef.current.push(current);
    const prev = undoRef.current.pop()!;
    ctx.putImageData(cloneImageData(prev), 0, 0);
    setUndoLen(undoRef.current.length);
    setRedoLen(redoRef.current.length);
    markDirty(true);
    blitToDisplay();
  };

  const redo = () => {
    const off = getOffscreen();
    const ctx = off.getContext("2d");
    if (!ctx || redoRef.current.length === 0) return;
    const current = ctx.getImageData(0, 0, iw, ih);
    undoRef.current.push(current);
    const next = redoRef.current.pop()!;
    ctx.putImageData(cloneImageData(next), 0, 0);
    setUndoLen(undoRef.current.length);
    setRedoLen(redoRef.current.length);
    markDirty(true);
    blitToDisplay();
  };

  const handleNewCanvas = () => {
    pushUndo();
    fillCanvas(eraserRgb);
    markDirty(true);
    blitToDisplay();
  };

  const applyLayoutScale = (scale: SemanticLayoutScale) => {
    setProcLayoutScale(scale);
    const d = layoutScaleDefaults(scale);
    setProcPlatformCount(d.platformCount);
    setProcRoadWidth(d.roadWidth);
    setProcDensity(d.scatterDensityPercent);
  };

  const procOptions = {
    seed: procSeed,
    layoutScale: procLayoutScale,
    fringeWidth: procFringe,
    gapWidth: procGap,
    gapBreak: 0.12,
    scatterDensity: procDensity / 100,
    platformCount: procPlatformCount,
    roadWidth: procRoadWidth,
  };

  const applyProcedural = (recipe: SemanticProceduralRecipe) => {
    const off = getOffscreen();
    const ctx = off.getContext("2d");
    if (!ctx || !loaded || procRunning) return;
    if (recipe === "random_stage_layout") {
      const ok = window.confirm(
        "随机地形语义布局将覆盖当前语义图（道具锚点与战斗净区会保留）。确定继续？",
      );
      if (!ok) return;
    }
    pushUndo();
    const data = ctx.getImageData(0, 0, iw, ih);
    const seedUsed = procSeed;
    setProcRunning(true);
    setProcProgress({ phase: "准备", percent: 0 });

    void (async () => {
      try {
        const changed = await applySemanticProceduralAsync(
          data,
          palette,
          recipe,
          procOptions,
          setProcProgress,
        );
        snapImageDataToPalette(data, palette);
        ctx.putImageData(data, 0, 0);
        markDirty(true);
        blitToDisplay();
        setProcSeed((s) => s + 1);
        const label =
          REGION_RECIPE_LABELS[recipe as SemanticRegionRecipe] ??
          FUSION_RECIPE_LABELS[recipe as SemanticFusionRecipe];
        setNormalizeHint(
          changed > 0
            ? `${label}：已修改 ${changed} 像素（种子 ${seedUsed}）`
            : `${label}：未产生变化，请调整参数或先准备草地/台地`,
        );
      } catch (err) {
        setNormalizeHint(err instanceof Error ? err.message : "生成失败");
      } finally {
        setProcRunning(false);
        setProcProgress(null);
      }
    })();
  };

  const handleSave = async () => {
    const off = getOffscreen();
    const ctx = off.getContext("2d");
    if (!ctx) return;
    const data = ctx.getImageData(0, 0, iw, ih);
    const changed = snapImageDataToPalette(data, palette);
    ctx.putImageData(data, 0, 0);
    blitToDisplay();
    if (changed > 0) {
      setNormalizeHint(`已归一化 ${changed} 个像素到调色板`);
      markDirty(true);
    } else {
      setNormalizeHint(null);
    }

    await new Promise<void>((resolve, reject) => {
      off.toBlob(async (blob) => {
        if (!blob) {
          reject(new Error("导出 PNG 失败"));
          return;
        }
        try {
          const file = new File([blob], `T_${stage.stageName}_SemanticControl.png`, {
            type: "image/png",
          });
          await onSaveSemantic(file);
          markDirty(false);
          resolve();
        } catch (err) {
          reject(err);
        }
      }, "image/png");
    });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.ctrlKey && e.key === "z") {
        e.preventDefault();
        undo();
      } else if (e.ctrlKey && e.key === "y") {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className="semantic-map-editor material-lab-panel">
      <div className="semantic-editor-head">
        <h4>语义控制图</h4>
        <span className="muted">
          {iw}×{ih} · {dirty ? "未保存" : "已同步"} · 可选编辑层，非强制第一步
        </span>
      </div>

      <div className="semantic-toolbar">
        {(Object.keys(TOOL_LABELS) as SemanticTool[]).map((t) => (
          <button
            key={t}
            type="button"
            className={`semantic-tool-btn${tool === t ? " active" : ""}`}
            onClick={() => setTool(t)}
            title={TOOL_LABELS[t]}
          >
            {TOOL_LABELS[t]}
          </button>
        ))}
        <span className="toolbar-sep" />
        <label className="semantic-brush-size">
          笔刷
          <input
            type="range"
            min={1}
            max={48}
            value={brushSize}
            onChange={(e) => setBrushSize(Number(e.target.value))}
            disabled={tool === "anchor" || tool === "picker" || tool === "fill"}
          />
          <span>{brushSize}px</span>
        </label>
        <button
          type="button"
          className={`semantic-tool-btn${showGrid ? " active" : ""}`}
          onClick={() => setShowGrid((v) => !v)}
        >
          网格
        </button>
        {hasBaseColor && (
          <button
            type="button"
            className={`semantic-tool-btn${showReference ? " active" : ""}`}
            disabled={!referenceReady}
            onClick={() => setShowReference((v) => !v)}
            title="叠加 BaseColor 参考图"
          >
            参考图
          </button>
        )}
        {hasBaseColor && referenceReady && showReference && (
          <label className="semantic-brush-size" title="BaseColor 参考层不透明度">
            参考
            <input
              type="range"
              min={0}
              max={100}
              value={referenceOpacity}
              onChange={(e) => setReferenceOpacity(Number(e.target.value))}
            />
            <span>{referenceOpacity}%</span>
          </label>
        )}
        <label className="semantic-brush-size" title="语义层预览不透明度（保存仍为不透明）">
          语义
          <input
            type="range"
            min={15}
            max={100}
            value={semanticOpacity}
            onChange={(e) => setSemanticOpacity(Number(e.target.value))}
          />
          <span>{semanticOpacity}%</span>
        </label>
        <button type="button" className="semantic-tool-btn" disabled={undoLen === 0} onClick={undo}>
          撤销
        </button>
        <button type="button" className="semantic-tool-btn" disabled={redoLen === 0} onClick={redo}>
          重做
        </button>
        <span className="toolbar-spacer" />
        <button type="button" className="semantic-tool-btn" onClick={handleNewCanvas}>
          新建画布
        </button>
        <button
          type="button"
          className="btn-primary semantic-save-btn"
          disabled={saving || !loaded}
          onClick={() => void handleSave()}
        >
          {saving ? "保存中…" : "保存语义控制图"}
        </button>
      </div>

      <div className="semantic-procedural-panel semantic-procedural-region">
        <span className="semantic-procedural-label">区域随机生成</span>
        <span className="semantic-scale-group">
          {(Object.keys(LAYOUT_SCALE_LABELS) as SemanticLayoutScale[]).map((scale) => (
            <button
              key={scale}
              type="button"
              className={`semantic-tool-btn semantic-scale-btn${procLayoutScale === scale ? " active" : ""}`}
              title={LAYOUT_SCALE_HINTS[scale]}
              onClick={() => applyLayoutScale(scale)}
            >
              {LAYOUT_SCALE_LABELS[scale]}
            </button>
          ))}
        </span>
        <span className="toolbar-sep" />
        <label className="semantic-brush-size" title="随机种子，每次应用后自动 +1">
          种子
          <input
            type="number"
            min={1}
            max={999999}
            value={procSeed}
            onChange={(e) => setProcSeed(Math.max(1, Number(e.target.value) || 1))}
            style={{ width: 64 }}
          />
        </label>
        <label className="semantic-brush-size" title="噪声台地团块数量上限">
          台地
          <input
            type="range"
            min={2}
            max={8}
            value={procPlatformCount}
            onChange={(e) => setProcPlatformCount(Number(e.target.value))}
          />
          <span>{procPlatformCount}</span>
        </label>
        <label className="semantic-brush-size" title="石质通道绘制宽度（随分辨率缩放）">
          通道
          <input
            type="range"
            min={10}
            max={28}
            value={procRoadWidth}
            onChange={(e) => setProcRoadWidth(Number(e.target.value))}
            disabled={procRunning}
          />
          <span>{procRoadWidth}px</span>
        </label>
        <label
          className="semantic-brush-size"
          title={procLayoutScale === "compact" ? "紧凑尺度默认不撒泥地，可调高后手动点「随机泥地区域」" : "泥地大块区域密度"}
        >
          泥地
          <input
            type="range"
            min={0}
            max={35}
            value={procDensity}
            onChange={(e) => setProcDensity(Number(e.target.value))}
          />
          <span>{procDensity}%</span>
        </label>
        <span className="toolbar-sep" />
        {(Object.keys(REGION_RECIPE_LABELS) as SemanticRegionRecipe[]).map((recipe) => (
          <button
            key={recipe}
            type="button"
            className="semantic-tool-btn semantic-proc-btn semantic-proc-region"
            disabled={!loaded || procRunning}
            title={`应用：${REGION_RECIPE_LABELS[recipe]}`}
            onClick={() => applyProcedural(recipe)}
          >
            {REGION_RECIPE_LABELS[recipe]}
          </button>
        ))}
      </div>

      <div className="semantic-procedural-panel semantic-procedural-fusion">
        <span className="semantic-procedural-label">融合修饰</span>
        <label className="semantic-brush-size" title="石道外缘草带宽度">
          草缘
          <input
            type="range"
            min={1}
            max={6}
            value={procFringe}
            onChange={(e) => setProcFringe(Number(e.target.value))}
          />
          <span>{procFringe}px</span>
        </label>
        <label className="semantic-brush-size" title="通道与台地之间草隙宽度">
          草隙
          <input
            type="range"
            min={1}
            max={5}
            value={procGap}
            onChange={(e) => setProcGap(Number(e.target.value))}
          />
          <span>{procGap}px</span>
        </label>
        <span className="toolbar-sep" />
        {(Object.keys(FUSION_RECIPE_LABELS) as SemanticFusionRecipe[]).map((recipe) => (
          <button
            key={recipe}
            type="button"
            className="semantic-tool-btn semantic-proc-btn"
            disabled={!loaded || procRunning}
            title={`应用：${FUSION_RECIPE_LABELS[recipe]}`}
            onClick={() => applyProcedural(recipe)}
          >
            {FUSION_RECIPE_LABELS[recipe]}
          </button>
        ))}
      </div>

      {procRunning && procProgress && (
        <div className="semantic-proc-progress-wrap">
          <div className="semantic-proc-progress-track">
            <div
              className="semantic-proc-progress-bar"
              style={{ width: `${procProgress.percent}%` }}
            />
          </div>
          <span className="semantic-proc-progress-label">
            {procProgress.phase} · {procProgress.percent}%
          </span>
        </div>
      )}

      <div
        ref={wrapRef}
        className="semantic-canvas-wrap"
        style={{ aspectRatio: `${iw} / ${ih}` }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      >
        {!loaded && <div className="semantic-canvas-loading">加载语义图…</div>}
        <canvas
          ref={displayRef}
          className="semantic-canvas"
          width={iw}
          height={ih}
          style={{ width: "100%", height: "100%", imageRendering: "pixelated" }}
        />
      </div>

      <div className="semantic-editor-foot muted">
        <span>
          当前色：<span className="semantic-current-swatch" style={{ background: selectedColor.hex }} />{" "}
          {selectedColor.label} ({selectedColor.hex})
        </span>
        {normalizeHint && <span className="semantic-normalize-hint">{normalizeHint}</span>}
        {rectPreview && tool === "rect" && <span>拖拽绘制矩形区域</span>}
      </div>
    </div>
  );
}
