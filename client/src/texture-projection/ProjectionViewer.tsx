import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three-stdlib";

/**
 * Lightweight orbitable 3D preview of the model. When `texture` is set the model
 * is shown unlit with that texture as its base map (so the bake result is seen
 * exactly as baked); otherwise a neutral gray shaded preview.
 */
export function ProjectionViewer({
  object,
  texture,
  paintMode = false,
  eraseMode = false,
  onPaint,
}: {
  object: THREE.Object3D | null;
  texture: THREE.Texture | null;
  /** When true, left-drag paints into the UV mask (orbit moves to right-drag). */
  paintMode?: boolean;
  eraseMode?: boolean;
  /** Called with the UV coordinate under the cursor while painting. */
  onPaint?: (uv: THREE.Vector2, erase: boolean) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const paintRef = useRef({ paintMode, eraseMode, onPaint });
  paintRef.current = { paintMode, eraseMode, onPaint };
  const stateRef = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    controls: OrbitControls;
    holder: THREE.Group;
  } | null>(null);

  // One-time renderer / scene setup.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    // Fill the container exactly (setSize with updateStyle=false leaves CSS at the
    // canvas default 300x150, so pin CSS to 100%).
    renderer.domElement.style.display = "block";
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.add(new THREE.AmbientLight(0xffffff, 0.9));
    const key = new THREE.DirectionalLight(0xffffff, 1.0);
    key.position.set(1, 2, 3);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xffffff, 0.4);
    fill.position.set(-2, 1, -2);
    scene.add(fill);

    const camera = new THREE.PerspectiveCamera(40, 1, 0.01, 100000);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.zoomSpeed = 0.45;   // gentler wheel zoom so it doesn't overshoot the model
    controls.rotateSpeed = 0.7;

    const holder = new THREE.Group();
    scene.add(holder);

    const resize = () => {
      const w = el.clientWidth, h = el.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();

    // Painting: raycast the cursor onto the model, hand the hit UV to the parent.
    const raycaster = new THREE.Raycaster();
    let painting = false;
    const ndc = new THREE.Vector2();
    const paintAt = (ev: PointerEvent) => {
      const { onPaint, eraseMode } = paintRef.current;
      if (!onPaint) return;
      const rect = renderer.domElement.getBoundingClientRect();
      ndc.set(((ev.clientX - rect.left) / rect.width) * 2 - 1, -((ev.clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      const hit = raycaster.intersectObject(holder, true).find((h) => h.uv);
      if (hit?.uv) onPaint(hit.uv.clone(), eraseMode);
    };
    const onDown = (ev: PointerEvent) => {
      if (!paintRef.current.paintMode || ev.button !== 0) return;
      painting = true;
      paintAt(ev);
    };
    const onMove = (ev: PointerEvent) => { if (painting) paintAt(ev); };
    const onUp = () => { painting = false; };
    renderer.domElement.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);

    let raf = 0;
    const animate = () => {
      controls.update();
      renderer.render(scene, camera);
      raf = requestAnimationFrame(animate);
    };
    animate();

    stateRef.current = { renderer, scene, camera, controls, holder };
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      renderer.dispose();
      renderer.domElement.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      if (renderer.domElement.parentNode === el) el.removeChild(renderer.domElement);
      stateRef.current = null;
    };
  }, []);

  // In paint mode, free the left button for painting and orbit with right-drag.
  useEffect(() => {
    const s = stateRef.current;
    if (!s) return;
    s.controls.mouseButtons = paintMode
      ? { LEFT: null as unknown as THREE.MOUSE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE }
      : { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
    if (ref.current) ref.current.style.cursor = paintMode ? "crosshair" : "default";
  }, [paintMode]);

  // Mount the model and frame the camera.
  useEffect(() => {
    const s = stateRef.current;
    if (!s || !object) return;
    s.holder.clear();
    s.holder.add(object);

    const box = new THREE.Box3().setFromObject(object);
    const center = new THREE.Vector3();
    const size = new THREE.Vector3();
    box.getCenter(center);
    box.getSize(size);
    const radius = Math.max(size.length() * 0.5, 0.001);
    // Fit the bounding sphere within the vertical FOV (with margin) so nothing clips.
    const fov = (s.camera.fov * Math.PI) / 180;
    const dist = (radius / Math.sin(fov / 2)) * 1.15;
    s.controls.target.copy(center);
    s.camera.position.set(center.x, center.y, center.z + dist);
    // Near must stay tiny so zooming in close doesn't clip through the model.
    s.camera.near = radius * 0.005;
    s.camera.far = dist * 3;
    s.camera.updateProjectionMatrix();
    // Allow getting really close; cap how far out the wheel can fly.
    s.controls.minDistance = radius * 0.1;
    s.controls.maxDistance = dist * 2.5;
    s.controls.update();

    return () => {
      s.holder.clear();
    };
  }, [object]);

  // Swap material based on whether a baked texture is available.
  useEffect(() => {
    if (!object) return;
    const mat = texture
      ? new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide })
      : new THREE.MeshStandardMaterial({ color: 0xb8b8b8, roughness: 0.85, side: THREE.DoubleSide });
    object.traverse((c) => {
      const m = c as THREE.Mesh;
      if (m.isMesh) m.material = mat;
    });
    return () => {
      mat.dispose();
    };
  }, [object, texture]);

  return <div className="proj-viewer" ref={ref} />;
}
