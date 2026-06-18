import { useEffect, useRef, type MutableRefObject } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { applySceneView, boundsFingerprint, collectSceneBounds, type SceneViewMode } from "./sceneCamera";

interface SceneCameraControllerProps {
  mode?: SceneViewMode;
  /** URL / 路径变化时重新对焦 */
  resetKey?: string | null;
  controlsRef?: MutableRefObject<OrbitControlsImpl | null>;
}

/**
 * 等待场景内 mesh 包围盒稳定后自动对焦（地形/竖板/角色通用）。
 */
export function SceneCameraController({
  mode = "auto",
  resetKey = null,
  controlsRef: externalControlsRef,
}: SceneCameraControllerProps) {
  const { camera, scene } = useThree();
  const internalControlsRef = useRef<OrbitControlsImpl | null>(null);
  const lastFingerprint = useRef("");
  const stableFrames = useRef(0);
  const fitted = useRef(false);

  useEffect(() => {
    lastFingerprint.current = "";
    stableFrames.current = 0;
    fitted.current = false;
  }, [resetKey]);

  useFrame(() => {
    if (fitted.current) return;

    const box = collectSceneBounds(scene);
    if (box.isEmpty()) {
      stableFrames.current = 0;
      return;
    }

    const fp = boundsFingerprint(box);
    if (fp !== lastFingerprint.current) {
      lastFingerprint.current = fp;
      stableFrames.current = 0;
      return;
    }

    stableFrames.current += 1;
    // 连续 2 帧包围盒不变再对焦（等 Center / FBX 布局完成）
    if (stableFrames.current < 2) return;

    if (applySceneView(camera, internalControlsRef.current, scene, mode)) {
      fitted.current = true;
    }
  });

  return (
    <OrbitControls
      ref={(instance) => {
        internalControlsRef.current = instance;
        if (externalControlsRef) externalControlsRef.current = instance;
      }}
      makeDefault
      enableDamping
      dampingFactor={0.08}
      minDistance={0.5}
      maxDistance={5000}
    />
  );
}
