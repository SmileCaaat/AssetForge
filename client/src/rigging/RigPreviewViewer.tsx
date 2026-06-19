import { Component, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Center, Environment, Html, useFBX } from "@react-three/drei";
import { SkeletonUtils } from "three-stdlib";
import * as THREE from "three";
import { fileUrl } from "../api";
import { enableDoubleSideMaterials } from "../lib/meshPreviewUtils";
import { SceneCameraController } from "../lib/SceneCameraController";
import { clearThreeLoaderCache, disposeObject3D } from "../lib/threeCleanup";

interface RigPreviewStats {
  boneCount: number;
  skinnedMeshCount: number;
  meshCount: number;
  rootBoneName: string;
}

interface RigGeometryInfo {
  markerRadius: number;
}

interface RigPreviewViewerProps {
  filePath: string;
  extension: string;
}

class RigPreviewErrorBoundary extends Component<
  { resetKey: string; children: ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidUpdate(prevProps: { resetKey: string }) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="preview-fallback rig-preview-load-error">
          <p>无法加载这个 FBX 的骨骼预览。</p>
          <code>{this.state.error.message}</code>
        </div>
      );
    }
    return this.props.children;
  }
}

interface RigSceneProps {
  url: string;
  showSkeleton: boolean;
  showJoints: boolean;
  showBoneNames: boolean;
  xraySkeleton: boolean;
  selectedBoneName: string | null;
  onStats: (stats: RigPreviewStats) => void;
  onSelectBone: (name: string | null) => void;
}

function collectRigStats(root: THREE.Object3D): {
  stats: RigPreviewStats;
  bones: THREE.Bone[];
  rootBone: THREE.Bone | null;
} {
  const bones: THREE.Bone[] = [];
  let meshCount = 0;
  let skinnedMeshCount = 0;

  root.traverse((child) => {
    const maybeBone = child as THREE.Bone;
    const maybeMesh = child as THREE.Mesh;
    const maybeSkinnedMesh = child as THREE.SkinnedMesh;

    if (maybeBone.isBone) bones.push(maybeBone);
    if (maybeMesh.isMesh) meshCount += 1;
    if (maybeSkinnedMesh.isSkinnedMesh) skinnedMeshCount += 1;
  });

  const rootBone = bones.find((bone) => !((bone.parent as THREE.Bone | null)?.isBone)) ?? bones[0] ?? null;

  return {
    bones,
    rootBone,
    stats: {
      boneCount: bones.length,
      skinnedMeshCount,
      meshCount,
      rootBoneName: rootBone?.name || "None",
    },
  };
}

function prepareRigObject(object: THREE.Group): void {
  enableDoubleSideMaterials(object);

  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    const skinnedMesh = child as THREE.SkinnedMesh;

    if (!mesh.isMesh) return;
    mesh.visible = true;
    mesh.frustumCulled = false;
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    if (skinnedMesh.isSkinnedMesh && skinnedMesh.skeleton) {
      skinnedMesh.skeleton.update();
    }
  });

  const box = new THREE.Box3().setFromObject(object);
  if (box.isEmpty()) return;

  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  object.position.sub(center);
  object.position.y += size.y / 2;
  object.updateMatrixWorld(true);
}

function getRigGeometryInfo(object: THREE.Object3D): RigGeometryInfo {
  const box = new THREE.Box3().setFromObject(object);
  if (box.isEmpty()) return { markerRadius: 0.035 };

  const size = box.getSize(new THREE.Vector3());
  const maxDimension = Math.max(size.x, size.y, size.z);
  return {
    markerRadius: Math.max(0.035, maxDimension * 0.018),
  };
}

function RigJointMarkers({
  bones,
  markerRadius,
  selectedBoneName,
  showJoints,
  showBoneNames,
  onSelectBone,
}: {
  bones: THREE.Bone[];
  markerRadius: number;
  selectedBoneName: string | null;
  showJoints: boolean;
  showBoneNames: boolean;
  onSelectBone: (name: string | null) => void;
}) {
  const markerRefs = useRef<Array<THREE.Mesh | null>>([]);
  const labelRefs = useRef<Array<THREE.Group | null>>([]);
  const temp = useMemo(() => new THREE.Vector3(), []);

  useFrame(() => {
    bones.forEach((bone, index) => {
      bone.getWorldPosition(temp);
      markerRefs.current[index]?.position.copy(temp);
      labelRefs.current[index]?.position.copy(temp);
    });
  });

  return (
    <>
      {bones.map((bone, index) => {
        const selected = bone.name === selectedBoneName;
        return (
          <group key={`${bone.uuid}-${index}`}>
            {showJoints && (
              <mesh
                ref={(mesh) => {
                  markerRefs.current[index] = mesh;
                }}
                renderOrder={1000}
                onPointerDown={(event) => {
                  event.stopPropagation();
                  onSelectBone(selected ? null : bone.name);
                }}
              >
                <sphereGeometry args={[selected ? markerRadius * 1.65 : markerRadius, 12, 12]} />
                <meshBasicMaterial
                  color={selected ? "#00ff66" : "#4ade80"}
                  depthTest={false}
                  depthWrite={false}
                  transparent
                  opacity={selected ? 0.95 : 0.68}
                />
              </mesh>
            )}
            {showBoneNames && (selected || index === 0 || bone.children.length > 1) && (
              <group
                ref={(group) => {
                  labelRefs.current[index] = group;
                }}
              >
                <Html center distanceFactor={8} className="rig-bone-label">
                  {bone.name || `Bone ${index + 1}`}
                </Html>
              </group>
            )}
          </group>
        );
      })}
    </>
  );
}

function RigScene({
  url,
  showSkeleton,
  showJoints,
  showBoneNames,
  xraySkeleton,
  selectedBoneName,
  onStats,
  onSelectBone,
}: RigSceneProps) {
  const cachedFbx = useFBX(url);
  const rig = useMemo(() => {
    const clone = SkeletonUtils.clone(cachedFbx) as THREE.Group;
    prepareRigObject(clone);
    return clone;
  }, [cachedFbx, url]);
  const { bones, rootBone, stats } = useMemo(() => collectRigStats(rig), [rig]);
  const geometryInfo = useMemo(() => getRigGeometryInfo(rig), [rig]);
  const helper = useMemo(() => {
    if (!rootBone) return null;
    const skeletonHelper = new THREE.SkeletonHelper(rootBone);
    const material = skeletonHelper.material as THREE.LineBasicMaterial;
    material.color.set("#22d3ee");
    material.transparent = true;
    return skeletonHelper;
  }, [rootBone]);

  useEffect(() => {
    onStats(stats);
  }, [onStats, stats]);

  useEffect(() => {
    return () => {
      disposeObject3D(rig);
    };
  }, [rig]);

  useEffect(() => {
    if (!helper) return undefined;
    return () => {
      helper.geometry.dispose();
      (helper.material as THREE.Material).dispose();
    };
  }, [helper]);

  useEffect(() => {
    if (!helper) return;
    const material = helper.material as THREE.LineBasicMaterial;
    material.depthTest = !xraySkeleton;
    material.opacity = xraySkeleton ? 0.95 : 0.8;
    material.needsUpdate = true;
  }, [helper, xraySkeleton]);

  useFrame(() => {
    rig.traverse((child) => {
      const skinnedMesh = child as THREE.SkinnedMesh;
      if (skinnedMesh.isSkinnedMesh && skinnedMesh.skeleton) {
        skinnedMesh.updateMatrixWorld(true);
        skinnedMesh.skeleton.update();
      }
    });
  });

  return (
    <>
      <Center>
        <primitive object={rig} onPointerMissed={() => onSelectBone(null)} />
      </Center>
      {helper && <primitive object={helper} visible={showSkeleton} />}
      <RigJointMarkers
        bones={bones}
        markerRadius={geometryInfo.markerRadius}
        selectedBoneName={selectedBoneName}
        showJoints={showJoints}
        showBoneNames={showBoneNames}
        onSelectBone={onSelectBone}
      />
      <SceneCameraController mode="auto" resetKey={url} />
      <Environment preset="city" />
    </>
  );
}

const emptyStats: RigPreviewStats = {
  boneCount: 0,
  skinnedMeshCount: 0,
  meshCount: 0,
  rootBoneName: "None",
};

export function RigPreviewViewer({ filePath, extension }: RigPreviewViewerProps) {
  const url = useMemo(() => fileUrl(filePath), [filePath]);
  const [showSkeleton, setShowSkeleton] = useState(true);
  const [showJoints, setShowJoints] = useState(true);
  const [showBoneNames, setShowBoneNames] = useState(false);
  const [xraySkeleton, setXraySkeleton] = useState(true);
  const [selectedBoneName, setSelectedBoneName] = useState<string | null>(null);
  const [stats, setStats] = useState<RigPreviewStats>(emptyStats);

  useEffect(() => {
    setSelectedBoneName(null);
    setStats(emptyStats);
    return () => {
      clearThreeLoaderCache();
    };
  }, [url]);

  if (extension !== ".fbx") {
    return (
      <div className="preview-fallback">
        骨骼预览目前仅支持 FBX。{extension.toUpperCase() || "当前文件"} 可以保存，但暂不能检查骨骼。
      </div>
    );
  }

  const hasSkeleton = stats.boneCount > 0;
  const hasSkinnedMesh = stats.skinnedMeshCount > 0;

  return (
    <div className="rig-preview-viewer-wrap">
      <div className="rig-preview-toolbar">
        <button
          type="button"
          className={`preview-action-btn ${showSkeleton ? "active" : ""}`}
          onClick={() => setShowSkeleton((value) => !value)}
        >
          骨架
        </button>
        <button
          type="button"
          className={`preview-action-btn ${showJoints ? "active" : ""}`}
          onClick={() => setShowJoints((value) => !value)}
        >
          关节
        </button>
        <button
          type="button"
          className={`preview-action-btn ${showBoneNames ? "active" : ""}`}
          onClick={() => setShowBoneNames((value) => !value)}
        >
          名称
        </button>
        <button
          type="button"
          className={`preview-action-btn ${xraySkeleton ? "active" : ""}`}
          onClick={() => setXraySkeleton((value) => !value)}
        >
          透视
        </button>
      </div>
      <div className="rig-preview-stats">
        <span className={hasSkeleton ? "ok" : "warn"}>{hasSkeleton ? "已检测到骨架" : "未检测到骨架"}</span>
        <span>骨骼 {stats.boneCount}</span>
        <span>蒙皮 {stats.skinnedMeshCount}</span>
        <span>网格 {stats.meshCount}</span>
        <span>根骨骼 {stats.rootBoneName}</span>
      </div>
      {selectedBoneName && (
        <div className="rig-preview-selected">
          已选择骨骼 <strong>{selectedBoneName}</strong>
        </div>
      )}
      {!hasSkinnedMesh && hasSkeleton && (
        <div className="rig-preview-warning">
          已检测到骨架，但没有检测到蒙皮网格。
        </div>
      )}
      <RigPreviewErrorBoundary resetKey={url}>
        <div className="model-viewer rig-preview-canvas">
          <Canvas
            key={url}
            camera={{ position: [0, 12, 24], fov: 45, near: 0.1, far: 5000 }}
            shadows
            gl={{ antialias: true, powerPreference: "default" }}
            frameloop="always"
          >
            <color attach="background" args={["#171a21"]} />
            <ambientLight intensity={0.7} />
            <directionalLight position={[5, 8, 5]} intensity={1.2} castShadow />
            <gridHelper args={[50000, 50, "#3f4655", "#242936"]} />
            <Suspense fallback={null}>
              <RigScene
                key={url}
                url={url}
                showSkeleton={showSkeleton}
                showJoints={showJoints}
                showBoneNames={showBoneNames}
                xraySkeleton={xraySkeleton}
                selectedBoneName={selectedBoneName}
                onStats={setStats}
                onSelectBone={(name) => {
                  setSelectedBoneName(name);
                  if (name) setShowBoneNames(true);
                }}
              />
            </Suspense>
          </Canvas>
        </div>
      </RigPreviewErrorBoundary>
    </div>
  );
}
