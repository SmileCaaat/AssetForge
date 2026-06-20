import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { FBXLoader } from "three-stdlib";
import { ProjectionViewer } from "./ProjectionViewer";
import type { FileNode, ProjectLink } from "../types";
import { fetchProjectAssets, fileUrl, isImageFile, isModelFile, saveImageBase64 } from "../api";
import {
  PROJECTION_DIRECTIONS,
  DIRECTION_LABELS,
  AXIS_NAMES,
  buildDirectionCameras,
  bakeProjection,
  type ProjectionDirection,
  type AxisName,
  type BakeMesh,
  type BakeView,
} from "./projectionBake";
import { floodFillMatte, DEFAULT_MATTE } from "./matte";

interface TextureProjectionModalProps {
  project: ProjectLink;
  onClose: () => void;
  onExported: () => void;
}

const SIZES = [1024, 2048] as const;

function sanitizePrefix(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, "").trim();
}

export function TextureProjectionModal({ project, onClose, onExported }: TextureProjectionModalProps) {
  const prefix = sanitizePrefix(project.displayName) || project.id;

  const [fbxPath, setFbxPath] = useState<string | null>(null);
  const [blenderRoot, setBlenderRoot] = useState<string | null>(null);
  const [conceptImages, setConceptImages] = useState<FileNode[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [meshes, setMeshes] = useState<BakeMesh[]>([]);
  const [box, setBox] = useState<THREE.Box3 | null>(null);
  const [fbxObject, setFbxObject] = useState<THREE.Object3D | null>(null);
  const [bakedTexture, setBakedTexture] = useState<THREE.Texture | null>(null);
  const uvCanvasRef = useRef<HTMLCanvasElement>(null);

  const [assign, setAssign] = useState<Record<ProjectionDirection, string>>({
    front: "", back: "", left: "", right: "", top: "", bottom: "",
  });
  const [front, setFront] = useState<AxisName>("+z");
  const [up, setUp] = useState<AxisName>("+y");
  const [mirrorLR, setMirrorLR] = useState(false);
  const [size, setSize] = useState<(typeof SIZES)[number]>(2048);
  const [matteOn, setMatteOn] = useState(true);
  const [whiteThreshold, setWhiteThreshold] = useState(DEFAULT_MATTE.whiteThreshold);
  const [edgeShrink, setEdgeShrink] = useState(DEFAULT_MATTE.edgeShrink);
  const [facingExp, setFacingExp] = useState(3);
  const [occlusion, setOcclusion] = useState(true);
  const [depthBias, setDepthBias] = useState(0.004);
  const [mattePreviews, setMattePreviews] = useState<Partial<Record<ProjectionDirection, string>>>({});
  const [depthPreviews, setDepthPreviews] = useState<Partial<Record<ProjectionDirection, string>>>({});
  const [previewTab, setPreviewTab] = useState<"matte" | "depth">("matte");

  // --- Local-repair mode: composite projection over an existing BaseColor via a painted mask. ---
  const [mode, setMode] = useState<"full" | "repair">("full");
  const [productionImages, setProductionImages] = useState<FileNode[]>([]);
  const [basePath, setBasePath] = useState<string>("");
  const [fbxBaseImage, setFbxBaseImage] = useState<CanvasImageSource | null>(null);
  const [localBaseName, setLocalBaseName] = useState<string>("");
  const [paintOn, setPaintOn] = useState(true);
  const [eraseMode, setEraseMode] = useState(false);
  const [brushSize, setBrushSize] = useState(48);
  const projCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const baseCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const compositeRaf = useRef(0);

  const [baking, setBaking] = useState(false);
  const [bakedUrl, setBakedUrl] = useState<string | null>(null);
  const [coverage, setCoverage] = useState<number | null>(null);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 1. Resolve the low-poly FBX (production side) + concept images.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [blender, concept] = await Promise.all([
          fetchProjectAssets(project.id, "blender"),
          fetchProjectAssets(project.id, "concept"),
        ]);
        if (!alive) return;
        setBlenderRoot(blender.root);
        const models = blender.assets.filter((a) => !a.isDirectory && isModelFile(a));
        const low =
          models.find((m) => /rigging[\\/]+input[\\/].*_low\.fbx$/i.test(m.path)) ||
          models.find((m) => /_low\.fbx$/i.test(m.name)) ||
          models.find((m) => m.extension === ".fbx") ||
          null;
        setFbxPath(low?.path ?? null);
        setConceptImages(concept.assets.filter((a) => !a.isDirectory && isImageFile(a)));
        const prodImgs = blender.assets.filter((a) => !a.isDirectory && isImageFile(a));
        setProductionImages(prodImgs);
        // Auto-pick a likely BaseColor as the repair base.
        const base =
          prodImgs.find((m) => /basecolor|albedo|texture_pbr/i.test(m.name)) || prodImgs[0];
        if (base) setBasePath(base.path);
        if (!low) setLoadError("未找到低模 FBX（Rigging/input/<项目>_Low.fbx），请先在概念侧标记低模。");
      } catch (e) {
        if (alive) setLoadError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => { alive = false; };
  }, [project.id]);

  // 2. Load FBX geometry for baking.
  useEffect(() => {
    if (!fbxPath) return;
    let alive = true;
    const loader = new FBXLoader();
    loader.load(
      fileUrl(fbxPath),
      (obj) => {
        if (!alive) return;
        obj.updateMatrixWorld(true);
        const ms: BakeMesh[] = [];
        const bbox = new THREE.Box3();
        let mapTex: THREE.Texture | null = null;
        obj.traverse((c) => {
          const m = c as THREE.Mesh;
          if (m.isMesh && m.geometry) {
            const g = m.geometry as THREE.BufferGeometry;
            if (!g.attributes.uv) return; // need UVs to bake
            if (!g.attributes.normal) g.computeVertexNormals();
            ms.push({ geometry: g, modelMatrix: m.matrixWorld.clone() });
            bbox.expandByObject(m);
            // Grab the embedded BaseColor map (if the FBX ships one) for repair mode.
            const mats = Array.isArray(m.material) ? m.material : [m.material];
            for (const mat of mats) {
              const map = (mat as THREE.MeshStandardMaterial | undefined)?.map;
              if (!mapTex && map) mapTex = map;
            }
          }
        });
        // Embedded FBX textures decode asynchronously — wait for the image, then use it.
        if (mapTex) {
          const tex = mapTex as THREE.Texture;
          const img = tex.image as CanvasImageSource & { complete?: boolean; addEventListener?: (t: string, l: () => void, o?: object) => void };
          const use = () => { if (alive) { setFbxBaseImage(tex.image as CanvasImageSource); setBasePath("__fbx__"); } };
          if (img && img.complete === false && img.addEventListener) {
            img.addEventListener("load", use, { once: true });
          } else if (img) {
            use();
          }
        }
        if (ms.length === 0) setLoadError("FBX 没有带 UV 的网格，无法烘焙。");
        setMeshes(ms);
        setBox(bbox);
        setFbxObject(obj);
      },
      undefined,
      (e) => alive && setLoadError(`FBX 加载失败：${(e as ErrorEvent).message ?? e}`),
    );
    return () => { alive = false; };
  }, [fbxPath]);

  // Draw the UV layout (wireframe of all islands) like Blender's UV editor.
  useEffect(() => {
    const canvas = uvCanvasRef.current;
    if (!canvas || meshes.length === 0) return;
    const S = canvas.width;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, S, S);
    ctx.fillStyle = "#15171c";
    ctx.fillRect(0, 0, S, S);
    ctx.strokeStyle = "rgba(150,180,220,0.55)";
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    for (const m of meshes) {
      const uv = m.geometry.attributes.uv;
      const index = m.geometry.index;
      const tri = (a: number, b: number, c: number) => {
        const ax = uv.getX(a) * S, ay = (1 - uv.getY(a)) * S;
        const bx = uv.getX(b) * S, by = (1 - uv.getY(b)) * S;
        const cx = uv.getX(c) * S, cy = (1 - uv.getY(c)) * S;
        ctx.moveTo(ax, ay); ctx.lineTo(bx, by);
        ctx.lineTo(cx, cy); ctx.lineTo(ax, ay);
      };
      if (index) {
        for (let i = 0; i < index.count; i += 3)
          tri(index.getX(i), index.getX(i + 1), index.getX(i + 2));
      } else {
        for (let i = 0; i < uv.count; i += 3) tri(i, i + 1, i + 2);
      }
    }
    ctx.stroke();
  }, [meshes]);

  // Compute matte (cutout) previews for assigned directions.
  useEffect(() => {
    let alive = true;
    const loadImg = (src: string) =>
      new Promise<HTMLImageElement>((res, rej) => {
        const im = new Image();
        im.onload = () => res(im);
        im.onerror = rej;
        im.src = src;
      });
    (async () => {
      const next: Partial<Record<ProjectionDirection, string>> = {};
      for (const dir of PROJECTION_DIRECTIONS) {
        const p = assign[dir];
        if (!p) continue;
        try {
          const im = await loadImg(fileUrl(p));
          if (matteOn) {
            const c = floodFillMatte(im, { whiteThreshold, edgeShrink, cropToContent: true });
            next[dir] = c.toDataURL("image/png");
          } else {
            next[dir] = fileUrl(p);
          }
        } catch {
          /* ignore */
        }
      }
      if (alive) setMattePreviews(next);
    })();
    return () => { alive = false; };
  }, [assign, matteOn, whiteThreshold, edgeShrink]);

  const assignedCount = useMemo(
    () => PROJECTION_DIRECTIONS.filter((d) => assign[d]).length,
    [assign],
  );

  const setPreviewFromCanvas = (c: HTMLCanvasElement) => {
    setBakedUrl(c.toDataURL("image/png"));
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    setBakedTexture((prev) => { prev?.dispose(); return tex; });
  };

  const ensureMask = (): HTMLCanvasElement => {
    let m = maskCanvasRef.current;
    if (!m || m.width !== size) {
      m = document.createElement("canvas");
      m.width = size; m.height = size;
      const mx = m.getContext("2d")!;
      mx.fillStyle = "#000"; mx.fillRect(0, 0, size, size); // black = keep base
      maskCanvasRef.current = m;
    }
    return m;
  };

  // Composite the projection over the base BaseColor, revealed only where the mask is painted.
  const composite = () => {
    const proj = projCanvasRef.current;
    const base = baseCanvasRef.current;
    if (!proj || !base) return;
    const mask = ensureMask();
    const out = document.createElement("canvas");
    out.width = size; out.height = size;
    const o = out.getContext("2d")!;
    o.drawImage(base, 0, 0, size, size);

    const pj = document.createElement("canvas");
    pj.width = size; pj.height = size;
    const pc = pj.getContext("2d")!;
    pc.drawImage(proj, 0, 0, size, size);
    const pdata = pc.getImageData(0, 0, size, size);
    const mdata = mask.getContext("2d")!.getImageData(0, 0, size, size);
    for (let i = 0; i < size * size; i++) {
      pdata.data[i * 4 + 3] = Math.round((pdata.data[i * 4 + 3] * mdata.data[i * 4]) / 255);
    }
    pc.putImageData(pdata, 0, 0);
    o.drawImage(pj, 0, 0); // masked projection over base
    setPreviewFromCanvas(out);
  };

  const applyBaseImage = (img: CanvasImageSource) => {
    const c = document.createElement("canvas");
    c.width = size; c.height = size;
    c.getContext("2d")!.drawImage(img, 0, 0, size, size);
    baseCanvasRef.current = c;
    composite();
  };

  const handlePaint = (uv: THREE.Vector2, erase: boolean) => {
    const m = ensureMask();
    const mx = m.getContext("2d")!;
    const x = uv.x * size;
    const y = (1 - uv.y) * size;
    const col = erase ? "0,0,0" : "255,255,255";
    const g = mx.createRadialGradient(x, y, 0, x, y, brushSize);
    g.addColorStop(0, `rgba(${col},1)`);
    g.addColorStop(1, `rgba(${col},0)`);
    mx.fillStyle = g;
    mx.beginPath(); mx.arc(x, y, brushSize, 0, Math.PI * 2); mx.fill();
    if (!compositeRaf.current) {
      compositeRaf.current = requestAnimationFrame(() => { compositeRaf.current = 0; composite(); });
    }
  };

  const clearMask = () => {
    const m = ensureMask();
    const mx = m.getContext("2d")!;
    mx.fillStyle = "#000"; mx.fillRect(0, 0, size, size);
    composite();
  };

  // Load the base BaseColor into a working-size canvas, then refresh the composite.
  useEffect(() => {
    if (mode !== "repair") return;
    if (basePath === "__local__") return; // handled by the file picker
    if (basePath === "__fbx__") {
      if (fbxBaseImage) applyBaseImage(fbxBaseImage);
      return;
    }
    if (!basePath) return;
    let alive = true;
    const im = new Image();
    im.onload = () => { if (alive) applyBaseImage(im); };
    im.onerror = () => setError(`底图加载失败: ${basePath}`);
    im.src = fileUrl(basePath);
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, basePath, size, fbxBaseImage]);

  const handlePickLocalBase = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const url = URL.createObjectURL(f);
    const im = new Image();
    im.onload = () => { applyBaseImage(im); URL.revokeObjectURL(url); };
    im.onerror = () => { setError(`底图加载失败: ${f.name}`); URL.revokeObjectURL(url); };
    im.src = url;
    setBasePath("__local__");
    setLocalBaseName(f.name);
  };

  // Switching back to full mode re-shows the raw projection (if already baked).
  useEffect(() => {
    if (mode === "full" && projCanvasRef.current) setPreviewFromCanvas(projCanvasRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const loadTexture = (path: string): Promise<THREE.Texture> =>
    new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => {
        try {
          let t: THREE.Texture;
          if (matteOn) {
            const canvas = floodFillMatte(image, { whiteThreshold, edgeShrink, cropToContent: true });
            t = new THREE.CanvasTexture(canvas);
          } else {
            t = new THREE.Texture(image);
            t.needsUpdate = true;
          }
          t.colorSpace = THREE.SRGBColorSpace;
          resolve(t);
        } catch (e) {
          reject(e);
        }
      };
      image.onerror = () => reject(new Error(`图片加载失败: ${path}`));
      image.src = fileUrl(path);
    });

  const handleBake = async () => {
    if (!box || meshes.length === 0) return;
    setBaking(true);
    setError(null);
    try {
      // Load textures first so each (cropped) image's aspect can shape its camera.
      const loaded: { dir: ProjectionDirection; texture: THREE.Texture; aspect: number }[] = [];
      for (const dir of PROJECTION_DIRECTIONS) {
        const p = assign[dir];
        if (!p) continue;
        const texture = await loadTexture(p);
        const im = texture.image as { width: number; height: number };
        const aspect = im && im.height ? im.width / im.height : 1;
        loaded.push({ dir, texture, aspect });
      }
      if (loaded.length === 0) {
        throw new Error("请至少给一个方向指派参考图");
      }
      const aspects: Partial<Record<ProjectionDirection, number>> = {};
      loaded.forEach((l) => { aspects[l.dir] = l.aspect; });
      const cams = buildDirectionCameras(box, { front, up, mirrorLR }, aspects);
      const views: BakeView[] = loaded.map((l) => ({
        direction: l.dir, texture: l.texture, camera: cams[l.dir], enabled: true, weight: 1,
      }));
      const result = bakeProjection({
        meshes,
        views,
        size,
        facingExponent: facingExp,
        occlusion,
        depthBias,
        fillColor: new THREE.Color(0.5, 0.5, 0.5),
      });
      projCanvasRef.current = result.canvas;
      setCoverage(result.coverage);
      const dp: Partial<Record<ProjectionDirection, string>> = {};
      for (const dir of PROJECTION_DIRECTIONS) {
        const c = result.depthPreviews[dir];
        if (c) dp[dir] = c.toDataURL("image/png");
      }
      setDepthPreviews(dp);
      if (Object.keys(dp).length) setPreviewTab("depth");
      if (mode === "repair") {
        // Composite over the base; the (initially empty) mask reveals projection where painted.
        composite();
      } else {
        // CanvasTexture default flipY=true maps the top-left-origin canvas onto
        // standard UVs correctly; if the preview looks vertically flipped, toggle.
        setPreviewFromCanvas(result.canvas);
      }
      views.forEach((v) => v.texture.dispose());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBaking(false);
    }
  };

  const handleExport = async () => {
    if (!bakedUrl || !blenderRoot) return;
    setExporting(true);
    setError(null);
    try {
      const dest = `${blenderRoot.replace(/\\/g, "/")}/textures/T_${prefix}_BaseColor.png`;
      await saveImageBase64(dest, bakedUrl);
      onExported();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="modal-overlay image-split-overlay" onClick={onClose}>
      <div className="image-split-modal" onClick={(e) => e.stopPropagation()}>
        <div className="image-split-header">
          <h2>纹理投影</h2>
          <span className="image-split-filename">
            {fbxPath ? fbxPath.split(/[\\/]/).pop() : "查找低模 FBX…"}
          </span>
          <button type="button" className="image-split-close" onClick={onClose} title="关闭">×</button>
        </div>

        <div className="image-split-body">
          <div className="proj-stage">
            <div className="proj-left">
              <figure className="proj-panel">
                <div className="proj-panel-canvas">
                  <canvas ref={uvCanvasRef} width={1024} height={1024} className="proj-uv-canvas" />
                </div>
                <figcaption>UV 布局</figcaption>
              </figure>
              <figure className="proj-panel">
                <div className="proj-panel-canvas">
                  {bakedUrl ? (
                    <img src={bakedUrl} alt="烘焙结果" draggable={false} />
                  ) : (
                    <div className="upscale-placeholder">{baking ? "正在烘焙…" : "烘焙结果"}</div>
                  )}
                </div>
                <figcaption>
                  烘焙结果{coverage != null ? ` · 覆盖 ${(coverage * 100).toFixed(1)}%` : ""}
                </figcaption>
              </figure>

              <div className="proj-debug">
                <div className="proj-debug-tabs">
                  <button
                    type="button"
                    className={previewTab === "matte" ? "split-mode-tab active" : "split-mode-tab"}
                    onClick={() => setPreviewTab("matte")}
                  >抠图预览</button>
                  <button
                    type="button"
                    className={previewTab === "depth" ? "split-mode-tab active" : "split-mode-tab"}
                    onClick={() => setPreviewTab("depth")}
                  >深度遮挡{Object.keys(depthPreviews).length ? "" : "（烘焙后）"}</button>
                </div>
                <div className="proj-debug-grid">
                  {PROJECTION_DIRECTIONS.map((dir) => {
                    const src = previewTab === "matte" ? mattePreviews[dir] : depthPreviews[dir];
                    return (
                      <div key={dir} className="proj-debug-cell">
                        {src ? <img src={src} alt={DIRECTION_LABELS[dir]} /> : <span>—</span>}
                        <em>{DIRECTION_LABELS[dir]}</em>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
            <div className="proj-viewer-wrap">
              <ProjectionViewer
                object={fbxObject}
                texture={bakedTexture}
                paintMode={mode === "repair" && paintOn}
                eraseMode={eraseMode}
                onPaint={handlePaint}
              />
              <span className="proj-viewer-hint">
                {mode === "repair" && paintOn
                  ? `${eraseMode ? "擦除" : "涂抹"}修补区 · 左键刷 / 右键旋转`
                  : bakedTexture ? "已贴贴图 · 拖拽旋转查看" : "灰模预览 · 拖拽旋转"}
              </span>
            </div>
          </div>

          <aside className="image-split-sidebar">
            <h3>多视图投影</h3>

            <div className="split-mode-tabs">
              <button
                type="button"
                className={mode === "full" ? "split-mode-tab active" : "split-mode-tab"}
                onClick={() => setMode("full")}
              >整张烘焙</button>
              <button
                type="button"
                className={mode === "repair" ? "split-mode-tab active" : "split-mode-tab"}
                onClick={() => setMode("repair")}
              >局部修补</button>
            </div>

            {mode === "repair" && (
              <div className="split-custom">
                <span className="split-section-label">底图（BaseColor，在其上修补）</span>
                <select className="upscale-model-select" value={basePath}
                  onChange={(e) => setBasePath(e.target.value)}>
                  <option value="">（选择底图）</option>
                  {fbxBaseImage && <option value="__fbx__">（FBX 内嵌贴图）</option>}
                  {localBaseName && <option value="__local__">本地: {localBaseName}</option>}
                  {productionImages.map((img) => (
                    <option key={img.path} value={img.path}>{img.name}</option>
                  ))}
                </select>
                <label className="split-link-btn" style={{ textAlign: "center", cursor: "pointer" }}>
                  从本地选择底图…
                  <input type="file" accept="image/*" style={{ display: "none" }}
                    onChange={handlePickLocalBase} />
                </label>
                <label>笔刷绘制
                  <input type="checkbox" checked={paintOn} onChange={(e) => setPaintOn(e.target.checked)} />
                </label>
                <label>擦除模式
                  <input type="checkbox" checked={eraseMode} disabled={!paintOn}
                    onChange={(e) => setEraseMode(e.target.checked)} />
                </label>
                <label>笔刷大小
                  <input type="number" min={8} max={200} step={4} value={brushSize}
                    onChange={(e) => setBrushSize(Number(e.target.value))} />
                </label>
                <button type="button" className="split-link-btn" onClick={clearMask}>清空修补</button>
                <p className="muted split-selection-hint">
                  先「开始烘焙」算出投影，再在右边 3D 上左键刷出要替换的错位区域，其余保留底图。
                </p>
              </div>
            )}

            {loadError ? <p className="split-error">{loadError}</p> : null}

            <div className="split-custom">
              <span className="split-section-label">朝向（对齐相机）</span>
              <label>正面轴
                <select value={front} onChange={(e) => setFront(e.target.value as AxisName)}>
                  {AXIS_NAMES.map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
              </label>
              <label>朝上轴
                <select value={up} onChange={(e) => setUp(e.target.value as AxisName)}>
                  {AXIS_NAMES.map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
              </label>
              <label>镜像左右
                <input type="checkbox" checked={mirrorLR} onChange={(e) => setMirrorLR(e.target.checked)} />
              </label>
            </div>

            <div className="split-selection">
              <span className="split-section-label">方向参考图（{assignedCount}/6）</span>
              {PROJECTION_DIRECTIONS.map((dir) => (
                <div key={dir} className="proj-slot">
                  {assign[dir] ? (
                    <img className="proj-slot-thumb" src={fileUrl(assign[dir])} alt={DIRECTION_LABELS[dir]} />
                  ) : (
                    <div className="proj-slot-thumb empty">{DIRECTION_LABELS[dir][0]}</div>
                  )}
                  <span className="proj-slot-label">{DIRECTION_LABELS[dir]}</span>
                  <select
                    value={assign[dir]}
                    onChange={(e) => setAssign((p) => ({ ...p, [dir]: e.target.value }))}
                  >
                    <option value="">（未指派）</option>
                    {conceptImages.map((img) => (
                      <option key={img.path} value={img.path}>{img.name}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            <div className="split-custom">
              <span className="split-section-label">参数</span>
              <label>贴图尺寸
                <select value={size} onChange={(e) => setSize(Number(e.target.value) as (typeof SIZES)[number])}>
                  {SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>
              <label>抠图去底（边缘连通）
                <input type="checkbox" checked={matteOn} onChange={(e) => setMatteOn(e.target.checked)} />
              </label>
              <label>白底阈值
                <input type="number" min={0.5} max={1} step={0.02} value={whiteThreshold} disabled={!matteOn}
                  onChange={(e) => setWhiteThreshold(Number(e.target.value))} />
              </label>
              <label>边缘收缩(px)
                <input type="number" min={0} max={8} step={1} value={edgeShrink} disabled={!matteOn}
                  onChange={(e) => setEdgeShrink(Number(e.target.value))} />
              </label>
              <label>朝向锐度
                <input type="number" min={1} max={8} step={1} value={facingExp}
                  onChange={(e) => setFacingExp(Number(e.target.value))} />
              </label>
              <label>深度遮挡
                <input type="checkbox" checked={occlusion} onChange={(e) => setOcclusion(e.target.checked)} />
              </label>
              <label>遮挡偏差
                <input type="number" min={0} max={0.05} step={0.001} value={depthBias} disabled={!occlusion}
                  onChange={(e) => setDepthBias(Number(e.target.value))} />
              </label>
            </div>

            {error && <p className="split-error">{error}</p>}

            <button
              type="button"
              className="btn-primary split-export-btn"
              onClick={() => void handleBake()}
              disabled={baking || meshes.length === 0 || assignedCount === 0}
            >
              {baking ? "烘焙中…" : bakedUrl ? "重新烘焙" : "开始烘焙"}
            </button>

            {bakedUrl && (
              <button
                type="button"
                className="split-link-btn"
                onClick={() => void handleExport()}
                disabled={exporting}
                style={{ alignSelf: "stretch", textAlign: "center" }}
              >
                {exporting ? "导出中…" : `导出到 textures/T_${prefix}_BaseColor.png`}
              </button>
            )}

            <p className="muted split-export-hint">
              纯本地 WebGL 投影，6 个正交方向把参考图映射到现有 UV。抠图用边缘连通法去白底，
              人物身上的白色元素（如白衬衫）不会被误删。
            </p>
          </aside>
        </div>
      </div>
    </div>
  );
}
