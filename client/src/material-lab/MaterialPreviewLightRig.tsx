import { useEffect, useMemo, useRef, type MutableRefObject } from "react";
import { useFrame } from "@react-three/fiber";
import { useHelper } from "@react-three/drei";
import * as THREE from "three";
import type { ShaderMaterial } from "three";
import { DirectionalLightHelper } from "three";
import {
  previewAmbientIntensity,
  previewLightDirectionFromAngles,
  previewLightShaderColor,
  previewLightThreeColor,
  previewSunPositionFromAngles,
  type PreviewLightSettings,
} from "./materialPreviewLights";

interface MaterialPreviewLightRigProps {
  material: ShaderMaterial | null;
  lightSettings: PreviewLightSettings;
}

/**
 * 材质实验室预览主光（角色 + 地形共用）：可见定向光辅助线 + 每帧同步 Shader uniform。
 */
export function MaterialPreviewLightRig({ material, lightSettings }: MaterialPreviewLightRigProps) {
  const lightRef = useRef<THREE.DirectionalLight>(null);

  const sunPosition = useMemo(
    () => previewSunPositionFromAngles(lightSettings.azimuth, lightSettings.elevation),
    [lightSettings.azimuth, lightSettings.elevation],
  );

  const lightDirection = useMemo(
    () => previewLightDirectionFromAngles(lightSettings.azimuth, lightSettings.elevation),
    [lightSettings.azimuth, lightSettings.elevation],
  );

  const lightColor = useMemo(() => previewLightThreeColor(lightSettings), [lightSettings]);
  const shaderLightColor = useMemo(() => previewLightShaderColor(lightSettings), [lightSettings]);
  const ambientIntensity = useMemo(
    () => previewAmbientIntensity(lightSettings),
    [lightSettings.ambientIntensity],
  );

  useHelper(
    lightRef as MutableRefObject<THREE.Object3D>,
    DirectionalLightHelper,
    10,
    lightColor,
  );

  useEffect(() => {
    if (!lightRef.current) return;
    lightRef.current.position.copy(sunPosition);
    lightRef.current.color.copy(lightColor);
    lightRef.current.intensity = Math.max(0, lightSettings.intensity) * 1.2;
  }, [sunPosition, lightColor, lightSettings.intensity]);

  useEffect(() => {
    if (!material) return;
    if (material.uniforms.lightDir) {
      material.uniforms.lightDir.value.copy(lightDirection);
    }
    if (material.uniforms.lightColor) {
      material.uniforms.lightColor.value.copy(shaderLightColor);
    }
  }, [material, lightDirection, shaderLightColor]);

  useFrame(() => {
    if (!material?.uniforms.lightDir) return;
    material.uniforms.lightDir.value.copy(lightDirection);
    if (material.uniforms.lightColor) {
      material.uniforms.lightColor.value.copy(shaderLightColor);
    }
  });

  return (
    <>
      <ambientLight intensity={ambientIntensity} />
      <directionalLight
        ref={lightRef}
        position={sunPosition}
        intensity={Math.max(0, lightSettings.intensity) * 1.2}
        color={lightColor}
        castShadow={false}
      />
    </>
  );
}
