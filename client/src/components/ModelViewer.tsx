import {
  Suspense,
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { Center, Environment, OrbitControls, useAnimations, useFBX } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { SkeletonUtils } from "three-stdlib";
import * as THREE from "three";
import { fileUrl } from "../api";

function collectSceneBounds(scene: THREE.Object3D): THREE.Box3 {
  const box = new THREE.Box3();
  scene.updateMatrixWorld(true);
  scene.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh) {
      box.expandByObject(obj);
    }
  });
  return box;
}

function applyFrontView(
  camera: THREE.Camera,
  controls: OrbitControlsImpl,
  scene: THREE.Object3D,
): void {
  const box = collectSceneBounds(scene);
  const center = box.isEmpty() ? new THREE.Vector3() : box.getCenter(new THREE.Vector3());
  const size = box.isEmpty() ? new THREE.Vector3(1, 1, 1) : box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z, 0.001);
  const distance = maxDim * 2.4;

  camera.position.set(center.x, center.y, center.z + distance);
  camera.up.set(0, 1, 0);
  controls.target.copy(center);
  camera.lookAt(center);
  controls.update();
}

function normalizeToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function fileStemFromUrl(sourceUrl: string): string {
  const fileName = sourceUrl.split(/[/\\]/).pop() ?? "";
  return fileName.replace(/\.fbx$/i, "");
}

function pickAnimationClip(animations: THREE.AnimationClip[], sourceUrl: string): THREE.AnimationClip | null {
  if (animations.length === 0) return null;
  if (animations.length === 1) return animations[0];

  const stem = fileStemFromUrl(sourceUrl);
  const stemNorm = normalizeToken(stem);
  const stemTokens = stem.toLowerCase().split(/[_\-\s]+/).filter(Boolean);

  const byStem = animations.find((clip) => {
    const clipNorm = normalizeToken(clip.name);
    return clipNorm.includes(stemNorm) || stemNorm.includes(clipNorm);
  });
  if (byStem) return byStem;

  const byTokens = animations.find((clip) => {
    const clipName = clip.name.toLowerCase();
    return stemTokens.length > 0 && stemTokens.every((token) => clipName.includes(token));
  });
  if (byTokens) return byTokens;

  return animations[0];
}

function AnimatedFbx({ sourceUrl, object }: { sourceUrl: string; object: THREE.Group }) {
  const { actions, mixer } = useAnimations(object.animations, object);
  const activeClip = useMemo(
    () => pickAnimationClip(object.animations, sourceUrl),
    [object.animations, sourceUrl],
  );

  useEffect(() => {
    object.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });
  }, [object]);

  useEffect(() => {
    if (!activeClip) return undefined;

    mixer.stopAllAction();
    const action = actions[activeClip.name];
    if (!action) return undefined;

    action.reset();
    action.setLoop(THREE.LoopRepeat, Infinity);
    action.clampWhenFinished = false;
    action.play();

    return () => {
      action.stop();
      mixer.stopAllAction();
    };
  }, [actions, activeClip, mixer, object, sourceUrl]);

  return (
    <Center>
      <primitive object={object} />
    </Center>
  );
}

function ModelScene({
  url,
  controlsRef,
  onRegister,
}: {
  url: string;
  controlsRef: React.RefObject<OrbitControlsImpl | null>;
  onRegister: (reset: () => void) => void;
}) {
  const cachedFbx = useFBX(url);
  const fbx = useMemo(() => SkeletonUtils.clone(cachedFbx) as THREE.Group, [cachedFbx, url]);
  const { camera, scene } = useThree();

  const resetToFrontView = useCallback(() => {
    const controls = controlsRef.current;
    if (!controls) return;
    applyFrontView(camera, controls, scene);
  }, [camera, controlsRef, scene]);

  useEffect(() => {
    onRegister(resetToFrontView);
  }, [onRegister, resetToFrontView]);

  useEffect(() => {
    let cancelled = false;
    let attempts = 0;
    let frameId = 0;

    const tryReset = () => {
      if (cancelled) return;
      if (controlsRef.current) {
        resetToFrontView();
        return;
      }
      if (attempts >= 12) return;
      attempts += 1;
      frameId = requestAnimationFrame(tryReset);
    };

    frameId = requestAnimationFrame(() => {
      frameId = requestAnimationFrame(tryReset);
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(frameId);
    };
  }, [fbx, url, resetToFrontView, controlsRef]);

  return (
    <>
      <AnimatedFbx sourceUrl={url} object={fbx} />
      <Environment preset="city" />
    </>
  );
}

export interface ModelViewerHandle {
  resetFrontView: () => void;
}

interface ModelViewerProps {
  filePath: string;
  extension: string;
}

export const ModelViewer = forwardRef<ModelViewerHandle, ModelViewerProps>(function ModelViewer(
  { filePath, extension },
  ref,
) {
  const url = useMemo(() => fileUrl(filePath), [filePath]);
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const resetFrontViewRef = useRef<(() => void) | null>(null);

  useImperativeHandle(ref, () => ({
    resetFrontView: () => {
      resetFrontViewRef.current?.();
    },
  }));

  const registerReset = useCallback((reset: () => void) => {
    resetFrontViewRef.current = reset;
  }, []);

  if (extension !== ".fbx") {
    return (
      <div className="preview-fallback">
        当前仅支持 FBX 预览。{extension.toUpperCase()} 支持即将加入。
      </div>
    );
  }

  return (
    <div className="model-viewer">
      <Canvas camera={{ position: [2, 2, 2], fov: 45 }} shadows>
        <color attach="background" args={["#1a1d24"]} />
        <ambientLight intensity={0.6} />
        <directionalLight position={[5, 8, 5]} intensity={1.2} castShadow />
        <Suspense fallback={null}>
          <ModelScene key={url} url={url} controlsRef={controlsRef} onRegister={registerReset} />
        </Suspense>
        <OrbitControls ref={controlsRef} makeDefault />
      </Canvas>
    </div>
  );
});
