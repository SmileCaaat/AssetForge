import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { ShaderMaterial } from "three";
import { TERRAIN_PREVIEW_LIGHT_COLOR, TERRAIN_PREVIEW_LIGHT_DIR } from "./terrainToonShader";

interface TerrainPreviewLightSyncProps {
  material: ShaderMaterial | null;
}

/**
 * 将预览主光方向/颜色同步到地形 Shader uniform，与 Unity 定向光习惯一致。
 * 场景内 directionalLight intensity=0，不参与光照计算，仅作方向参考。
 */
export function TerrainPreviewLightSync({ material }: TerrainPreviewLightSyncProps) {
  const lightRef = useRef<THREE.DirectionalLight>(null);

  useEffect(() => {
    if (!material?.uniforms.lightDir) return;
    material.uniforms.lightDir.value.copy(TERRAIN_PREVIEW_LIGHT_DIR);
    material.uniforms.lightColor.value.copy(TERRAIN_PREVIEW_LIGHT_COLOR);
  }, [material]);

  useFrame(() => {
    if (!material?.uniforms.lightDir || !lightRef.current) return;
    const towardLight = new THREE.Vector3();
    lightRef.current.getWorldDirection(towardLight);
    towardLight.negate().normalize();
    material.uniforms.lightDir.value.copy(towardLight);
  });

  return (
    <directionalLight
      ref={lightRef}
      position={[14, 32, 18]}
      intensity={0}
      color={new THREE.Color(1, 0.96, 0.9)}
    />
  );
}
