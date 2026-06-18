import * as THREE from "three";

export function collectSceneBounds(scene: THREE.Object3D): THREE.Box3 {
  const box = new THREE.Box3();
  scene.updateMatrixWorld(true);
  scene.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh) {
      box.expandByObject(obj);
    }
  });
  return box;
}

export function collectObjectBounds(root: THREE.Object3D): THREE.Box3 {
  const box = new THREE.Box3();
  root.updateMatrixWorld(true);
  box.setFromObject(root);
  return box;
}

type ThinAxis = "x" | "y" | "z" | null;

/** 找出最薄的那一维（铺地/竖板类网格） */
export function detectThinAxis(size: THREE.Vector3): ThinAxis {
  const dims: { axis: ThinAxis; value: number }[] = [
    { axis: "x", value: size.x },
    { axis: "y", value: size.y },
    { axis: "z", value: size.z },
  ];
  dims.sort((a, b) => a.value - b.value);
  const min = dims[0].value;
  const max = Math.max(size.x, size.y, size.z);
  if (max < 0.5) return null;
  if (min / max > 0.4) return null;
  return dims[0].axis;
}

/** @deprecated 用 detectThinAxis */
export function isLandscapeBounds(size: THREE.Vector3): boolean {
  return detectThinAxis(size) === "y";
}

export type SceneViewMode = "auto" | "front" | "terrain";

function cameraOffsetForBounds(
  center: THREE.Vector3,
  size: THREE.Vector3,
  mode: SceneViewMode,
): THREE.Vector3 {
  const span = Math.max(size.x, size.y, size.z, 0.001);
  const distance = span * 1.55;
  const thin = detectThinAxis(size);
  const forceTerrain = mode === "terrain";

  // 薄轴 = Y → 铺地（XZ 平面），俯视斜角
  if (forceTerrain || thin === "y") {
    return new THREE.Vector3(
      center.x + span * 0.14,
      center.y + distance * 0.88,
      center.z + span * 0.52,
    );
  }

  // 薄轴 = Z → 竖板（XY 平面，Blender 默认平面），正面看
  if (thin === "z") {
    return new THREE.Vector3(center.x, center.y, center.z + distance);
  }

  // 薄轴 = X → 侧板（YZ 平面）
  if (thin === "x") {
    return new THREE.Vector3(center.x + distance, center.y + span * 0.15, center.z + span * 0.2);
  }

  // 角色 / 通用：正面（与地形改动前一致）
  return new THREE.Vector3(center.x, center.y, center.z + distance);
}

export function adjustCameraClipPlanes(camera: THREE.Camera, box: THREE.Box3): void {
  if (!(camera instanceof THREE.PerspectiveCamera)) return;
  const size = box.getSize(new THREE.Vector3());
  const span = Math.max(size.x, size.y, size.z, 1);
  camera.near = Math.max(span / 500, 0.05);
  camera.far = Math.max(span * 80, 500);
  camera.updateProjectionMatrix();
}

export function applySceneView(
  camera: THREE.Camera,
  controls: { target: THREE.Vector3; update: () => void } | null,
  scene: THREE.Object3D,
  mode: SceneViewMode = "auto",
): boolean {
  const box = collectSceneBounds(scene);
  if (box.isEmpty()) return false;

  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  if (Math.max(size.x, size.y, size.z) < 0.001) return false;

  camera.position.copy(cameraOffsetForBounds(center, size, mode));
  camera.up.set(0, 1, 0);
  camera.lookAt(center);
  controls?.target.copy(center);
  controls?.update();
  adjustCameraClipPlanes(camera, box);
  return true;
}

export function boundsFingerprint(box: THREE.Box3): string {
  const c = box.getCenter(new THREE.Vector3());
  const s = box.getSize(new THREE.Vector3());
  return [...c.toArray(), ...s.toArray()].map((v) => v.toFixed(3)).join(",");
}
