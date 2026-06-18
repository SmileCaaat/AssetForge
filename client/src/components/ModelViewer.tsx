import {
  Suspense,
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { Center, Environment, useAnimations, useFBX } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { SkeletonUtils } from "three-stdlib";
import * as THREE from "three";
import { fileUrl } from "../api";
import { applySceneView } from "../lib/sceneCamera";
import { SceneCameraController } from "../lib/SceneCameraController";
import { enableDoubleSideMaterials } from "../lib/meshPreviewUtils";
import { clearThreeLoaderCache, disposeObject3D } from "../lib/threeCleanup";

function applyFrontView(
  camera: THREE.Camera,
  controls: OrbitControlsImpl,
  scene: THREE.Object3D,
): void {
  applySceneView(camera, controls, scene, "auto");
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

function AnimatedFbx({
  sourceUrl,
  object,
  selectedClipName,
  onClipsLoaded,
}: {
  sourceUrl: string;
  object: THREE.Group;
  selectedClipName: string | null;
  onClipsLoaded: (clipNames: string[], suggestedName: string | null) => void;
}) {
  const { actions, mixer } = useAnimations(object.animations, object);
  const activeClip = useMemo(() => {
    if (selectedClipName) {
      const matched = object.animations.find((clip) => clip.name === selectedClipName);
      if (matched) return matched;
    }
    return pickAnimationClip(object.animations, sourceUrl);
  }, [object.animations, selectedClipName, sourceUrl]);

  useEffect(() => {
    const suggested = pickAnimationClip(object.animations, sourceUrl);
    onClipsLoaded(
      object.animations.map((clip) => clip.name),
      suggested?.name ?? object.animations[0]?.name ?? null,
    );
  }, [object.animations, onClipsLoaded, sourceUrl]);

  useEffect(() => {
    enableDoubleSideMaterials(object);
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
  selectedClipName,
  onClipsLoaded,
}: {
  url: string;
  controlsRef: React.RefObject<OrbitControlsImpl | null>;
  onRegister: (reset: () => void) => void;
  selectedClipName: string | null;
  onClipsLoaded: (clipNames: string[], suggestedName: string | null) => void;
}) {
  const cachedFbx = useFBX(url);
  const fbx = useMemo(() => SkeletonUtils.clone(cachedFbx) as THREE.Group, [cachedFbx, url]);
  const { camera, scene } = useThree();

  useEffect(() => {
    return () => {
      disposeObject3D(fbx);
    };
  }, [fbx]);

  const resetToFrontView = useCallback(() => {
    const controls = controlsRef.current;
    if (!controls) return;
    applyFrontView(camera, controls, scene);
  }, [camera, controlsRef, scene]);

  useEffect(() => {
    onRegister(resetToFrontView);
  }, [onRegister, resetToFrontView]);

  return (
    <>
      <AnimatedFbx
        sourceUrl={url}
        object={fbx}
        selectedClipName={selectedClipName}
        onClipsLoaded={onClipsLoaded}
      />
      <SceneCameraController mode="auto" resetKey={url} controlsRef={controlsRef} />
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
  const [clipNames, setClipNames] = useState<string[]>([]);
  const [selectedClip, setSelectedClip] = useState<string | null>(null);

  useEffect(() => {
    setClipNames([]);
    setSelectedClip(null);
    return () => {
      clearThreeLoaderCache();
    };
  }, [url]);

  const handleClipsLoaded = useCallback((names: string[], suggestedName: string | null) => {
    setClipNames(names);
    setSelectedClip((prev) => {
      if (prev && names.includes(prev)) return prev;
      return suggestedName ?? names[0] ?? null;
    });
  }, []);

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
    <div className="model-viewer-wrap">
      {clipNames.length > 1 && (
        <div className="fbx-animation-toolbar">
          <span className="fbx-animation-label">
            动画 ({clipNames.length})
          </span>
          <div className="fbx-animation-options">
            {clipNames.map((name) => (
              <button
                key={name}
                type="button"
                className={`fbx-animation-btn ${selectedClip === name ? "active" : ""}`}
                title={name}
                onClick={() => setSelectedClip(name)}
              >
                {name}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="model-viewer">
        <Canvas
          key={url}
          camera={{ position: [0, 12, 24], fov: 45, near: 0.1, far: 5000 }}
          shadows
          gl={{ antialias: true, powerPreference: "default" }}
          frameloop="always"
        >
          <color attach="background" args={["#1a1d24"]} />
          <ambientLight intensity={0.6} />
          <directionalLight position={[5, 8, 5]} intensity={1.2} castShadow />
          <Suspense fallback={null}>
            <ModelScene
              key={url}
              url={url}
              controlsRef={controlsRef}
              onRegister={registerReset}
              selectedClipName={selectedClip}
              onClipsLoaded={handleClipsLoaded}
            />
          </Suspense>
        </Canvas>
      </div>
    </div>
  );
});
