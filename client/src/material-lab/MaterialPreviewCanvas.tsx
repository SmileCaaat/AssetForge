import { Suspense, useEffect, useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { Center, useFBX } from "@react-three/drei";
import { SkeletonUtils } from "three-stdlib";
import * as THREE from "three";
import type { MaterialLabParams, MaterialLabShaderType } from "./materialLabTypes";
import { isTerrainMaterialLab } from "./materialLabTypes";
import { fileUrl } from "../api";
import { TerrainPreviewLightSync } from "./TerrainPreviewLightSync";
import {
  TERRAIN_PREVIEW_LIGHT_COLOR,
  TERRAIN_PREVIEW_LIGHT_DIR,
  TERRAIN_TOON_FRAG,
  TERRAIN_TOON_VERT,
} from "./terrainToonShader";
import { enableDoubleSideMaterials } from "../lib/meshPreviewUtils";
import { disposeMaterial, disposeObjectGeometry, disposeTexture } from "../lib/threeCleanup";
import { SceneCameraController } from "../lib/SceneCameraController";

/** 阶段 A 已验证的 Toon 核心（几何法线，不采样 Normal 贴图） */
const TOON_VERT = `
varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vViewDir;

void main() {
  vUv = uv;
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vNormal = normalize(normalMatrix * normal);
  vViewDir = normalize(cameraPosition - worldPos.xyz);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const TOON_FRAG = `
uniform sampler2D baseMap;
uniform float hasBaseMap;
uniform vec4 baseColorTint;
uniform float baseSaturation;
uniform float baseValue;
uniform float contrast;
uniform float rampSteps;
uniform float shadowStrength;
uniform vec3 rimColor;
uniform float rimPower;
uniform float rimIntensity;
uniform float matcapStrength;
uniform vec3 lightDir;
varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vViewDir;

vec3 adjustHSV(vec3 c) {
  float gray = dot(c, vec3(0.299, 0.587, 0.114));
  c = mix(vec3(gray), c, baseSaturation);
  c *= baseValue;
  c = mix(vec3(0.5), c, 1.0 + contrast);
  return clamp(c, 0.0, 1.0);
}

vec3 sampleMatcap(vec3 worldNormal) {
  vec3 viewNormal = normalize((viewMatrix * vec4(worldNormal, 0.0)).xyz);
  vec2 muv = viewNormal.xy * 0.5 + 0.5;
  float highlight = smoothstep(0.15, 0.75, 1.0 - length(muv - vec2(0.42, 0.38)));
  float shade = smoothstep(0.05, 0.65, muv.y);
  return mix(vec3(0.28, 0.32, 0.38), vec3(1.0, 0.97, 0.9), shade * 0.55 + highlight * 0.45);
}

void main() {
  vec3 base = hasBaseMap > 0.5
    ? texture2D(baseMap, vUv).rgb
    : vec3(0.75, 0.78, 0.82);
  base *= baseColorTint.rgb;
  base = adjustHSV(base);

  vec3 n = normalize(vNormal);
  vec3 l = normalize(lightDir);
  vec3 v = normalize(vViewDir);
  float ndotl = max(dot(n, l), 0.0);
  float steps = max(rampSteps, 1.0);
  float level = floor(ndotl * steps) / max(steps - 1.0, 1.0);
  float shade = mix(shadowStrength, 1.0, level);
  vec3 color = base * shade;

  float rim = pow(1.0 - max(dot(n, v), 0.0), rimPower);
  color += rimColor * rim * rimIntensity;

  if (matcapStrength > 0.001) {
    vec3 mc = sampleMatcap(n);
    color = mix(color, color * mc, matcapStrength);
  }

  gl_FragColor = vec4(color, 1.0);
}
`;

const OUTLINE_VERT = `
uniform float outlineWidth;
uniform float outlineFarWidthScale;
uniform float outlineFadeStart;
uniform float outlineFadeEnd;
uniform float outlineMinWidth;

void main() {
  vec4 clipPos = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  vec3 clipNormal = normalize(mat3(projectionMatrix * modelViewMatrix) * normal);

  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  float dist = length(cameraPosition - worldPos.xyz);
  float farT = clamp(
    (dist - outlineFadeStart) / max(outlineFadeEnd - outlineFadeStart, 0.0001),
    0.0,
    1.0
  );
  float widthScale = mix(1.0, outlineFarWidthScale, farT);
  float scaledWidth = outlineWidth * widthScale;
  float finalOutlineWidth = scaledWidth;
  if (farT > 0.001)
    finalOutlineWidth = max(scaledWidth, outlineMinWidth * farT);

  clipPos.xy += clipNormal.xy * finalOutlineWidth * clipPos.w;
  gl_Position = clipPos;
}
`;

const OUTLINE_FRAG = `
uniform vec4 outlineColor;

void main() {
  gl_FragColor = outlineColor;
}
`;

function useBaseTexture(url: string | null): THREE.Texture | null {
  return useMemo(() => {
    if (!url) return null;
    const loader = new THREE.TextureLoader();
    const tex = loader.load(url);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }, [url]);
}

function useToonMaterial(
  texture: THREE.Texture | null,
  params: MaterialLabParams,
  shaderType: MaterialLabShaderType,
): THREE.ShaderMaterial {
  const isTerrain = isTerrainMaterialLab({ shaderType });
  const material = useMemo(() => {
    const uniforms: Record<string, { value: unknown }> = {
      baseMap: { value: texture },
      hasBaseMap: { value: texture ? 1 : 0 },
      baseColorTint: { value: new THREE.Vector4(...params.baseColorTint) },
      baseSaturation: { value: params.baseSaturation },
      baseValue: { value: params.baseValue },
      lightDir: { value: new THREE.Vector3(0.4, 0.8, 0.5) },
    };

    if (isTerrain) {
      uniforms.rampSteps = { value: params.rampSteps };
      uniforms.rampBlend = { value: params.terrainRampBlend ?? 0.18 };
      uniforms.albedoInfluence = { value: params.terrainAlbedoInfluence ?? 0.72 };
      uniforms.albedoPosterize = { value: params.terrainAlbedoPosterize ?? 0.22 };
      uniforms.normalStrength = { value: params.terrainNormalStrength ?? 1.15 };
      uniforms.celShadowColor = { value: new THREE.Vector3(...params.celShadowColor.slice(0, 3)) };
      uniforms.celHighlightColor = { value: new THREE.Vector3(...params.celHighlightColor.slice(0, 3)) };
      uniforms.shadowReceiveStrength = { value: params.shadowReceiveStrength ?? 0.7 };
      uniforms.ambientStrength = { value: params.ambientStrength ?? 0.25 };
      uniforms.lightColorInfluence = { value: params.lightColorInfluence ?? 0.6 };
      uniforms.distanceSmoothStrength = { value: params.terrainDistanceSmooth ?? 0.35 };
      uniforms.distanceSmoothFar = { value: 48 };
      uniforms.slopeTintStrength = { value: params.terrainSlopeTint ?? 0.12 };
      uniforms.slopeRockTint = { value: new THREE.Vector3(0.55, 0.5, 0.42) };
      uniforms.lightDir = { value: TERRAIN_PREVIEW_LIGHT_DIR.clone() };
      uniforms.lightColor = { value: TERRAIN_PREVIEW_LIGHT_COLOR.clone() };
    } else {
      uniforms.contrast = { value: params.contrast };
      uniforms.rampSteps = { value: params.rampSteps };
      uniforms.shadowStrength = { value: params.shadowStrength };
      uniforms.rimColor = { value: new THREE.Vector3(...params.rimColor.slice(0, 3)) };
      uniforms.rimPower = { value: params.rimPower };
      uniforms.rimIntensity = { value: params.rimIntensity };
      uniforms.matcapStrength = { value: params.matcapStrength };
    }

    return new THREE.ShaderMaterial({
      vertexShader: isTerrain ? TERRAIN_TOON_VERT : TOON_VERT,
      fragmentShader: isTerrain ? TERRAIN_TOON_FRAG : TOON_FRAG,
      uniforms,
      side: THREE.DoubleSide,
    });
  }, [texture, isTerrain]);

  useEffect(() => () => disposeMaterial(material), [material]);

  useEffect(() => {
    material.uniforms.baseMap.value = texture;
    material.uniforms.hasBaseMap.value = texture ? 1 : 0;
  }, [material, texture]);

  useEffect(() => {
    material.uniforms.baseColorTint.value.set(...params.baseColorTint);
    material.uniforms.baseSaturation.value = params.baseSaturation;
    material.uniforms.baseValue.value = params.baseValue;

    if (isTerrain) {
      material.uniforms.rampSteps.value = params.rampSteps;
      material.uniforms.rampBlend.value = params.terrainRampBlend ?? 0.18;
      material.uniforms.albedoInfluence.value = params.terrainAlbedoInfluence ?? 0.72;
      material.uniforms.albedoPosterize.value = params.terrainAlbedoPosterize ?? 0.22;
      material.uniforms.normalStrength.value = params.terrainNormalStrength ?? 1.15;
      material.uniforms.celShadowColor.value.set(...params.celShadowColor.slice(0, 3));
      material.uniforms.celHighlightColor.value.set(...params.celHighlightColor.slice(0, 3));
      material.uniforms.shadowReceiveStrength.value = params.shadowReceiveStrength ?? 0.7;
      material.uniforms.ambientStrength.value = params.ambientStrength ?? 0.25;
      material.uniforms.lightColorInfluence.value = params.lightColorInfluence ?? 0.6;
      material.uniforms.distanceSmoothStrength.value = params.terrainDistanceSmooth ?? 0.35;
      material.uniforms.slopeTintStrength.value = params.terrainSlopeTint ?? 0.12;
    } else {
      material.uniforms.contrast.value = params.contrast;
      material.uniforms.rampSteps.value = params.rampSteps;
      material.uniforms.shadowStrength.value = params.shadowStrength;
      material.uniforms.rimColor.value.set(...params.rimColor.slice(0, 3));
      material.uniforms.rimPower.value = params.rimPower;
      material.uniforms.rimIntensity.value = params.rimIntensity;
      material.uniforms.matcapStrength.value = params.matcapStrength;
    }
  }, [material, params, isTerrain]);

  return material;
}

function useOutlineMaterial(params: MaterialLabParams): THREE.ShaderMaterial {
  const material = useMemo(() => {
    return new THREE.ShaderMaterial({
      vertexShader: OUTLINE_VERT,
      fragmentShader: OUTLINE_FRAG,
      uniforms: {
        outlineWidth: { value: params.outlineWidth },
        outlineColor: { value: new THREE.Vector4(...params.outlineColor) },
        outlineFarWidthScale: { value: params.outlineFarWidthScale },
        outlineFadeStart: { value: params.outlineFadeStart },
        outlineFadeEnd: { value: params.outlineFadeEnd },
        outlineMinWidth: { value: params.outlineMinWidth },
      },
      side: THREE.BackSide,
      depthWrite: true,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    });
  }, []);

  useEffect(() => () => disposeMaterial(material), [material]);

  useEffect(() => {
    material.uniforms.outlineWidth.value = params.outlineEnabled ? params.outlineWidth : 0;
    material.uniforms.outlineColor.value.set(...params.outlineColor);
    material.uniforms.outlineFarWidthScale.value = params.outlineFarWidthScale;
    material.uniforms.outlineFadeStart.value = params.outlineFadeStart;
    material.uniforms.outlineFadeEnd.value = params.outlineFadeEnd;
    material.uniforms.outlineMinWidth.value = params.outlineMinWidth;
  }, [material, params]);

  return material;
}

function applyMaterial(root: THREE.Object3D, material: THREE.Material): void {
  root.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      (child as THREE.Mesh).material = material;
    }
  });
}

function SpherePreview({
  toonMaterial,
  outlineMaterial,
  outlineEnabled,
}: {
  toonMaterial: THREE.ShaderMaterial;
  outlineMaterial: THREE.ShaderMaterial;
  outlineEnabled: boolean;
}) {
  return (
    <>
      {outlineEnabled && (
        <mesh material={outlineMaterial}>
          <sphereGeometry args={[1, 48, 48]} />
        </mesh>
      )}
      <mesh material={toonMaterial}>
        <sphereGeometry args={[1, 48, 48]} />
      </mesh>
    </>
  );
}

function FbxPreview({
  modelUrl,
  toonMaterial,
  outlineMaterial,
  outlineEnabled,
}: {
  modelUrl: string;
  toonMaterial: THREE.ShaderMaterial;
  outlineMaterial: THREE.ShaderMaterial;
  outlineEnabled: boolean;
}) {
  const cached = useFBX(modelUrl);
  const body = useMemo(() => {
    const clone = SkeletonUtils.clone(cached) as THREE.Group;
    enableDoubleSideMaterials(clone);
    return clone;
  }, [cached, modelUrl]);
  const outline = useMemo(() => {
    if (!outlineEnabled) return null;
    return SkeletonUtils.clone(cached) as THREE.Group;
  }, [cached, modelUrl, outlineEnabled]);

  useEffect(() => () => disposeObjectGeometry(body), [body]);
  useEffect(() => {
    if (!outline) return;
    return () => disposeObjectGeometry(outline);
  }, [outline]);

  useEffect(() => {
    applyMaterial(body, toonMaterial);
  }, [body, toonMaterial]);

  useEffect(() => {
    if (!outline) return;
    applyMaterial(outline, outlineMaterial);
  }, [outline, outlineMaterial]);

  return (
    <Center>
      {outline && <primitive object={outline} />}
      <primitive object={body} />
    </Center>
  );
}

function ToonMesh({
  modelUrl,
  baseColorUrl,
  shaderType,
  params,
}: {
  modelUrl: string | null;
  baseColorUrl: string | null;
  shaderType: MaterialLabShaderType;
  params: MaterialLabParams;
}) {
  const texture = useBaseTexture(baseColorUrl);
  useEffect(() => () => disposeTexture(texture), [texture]);

  const toonMaterial = useToonMaterial(texture, params, shaderType);
  const outlineMaterial = useOutlineMaterial(params);
  const isTerrain = isTerrainMaterialLab({ shaderType });

  if (modelUrl) {
    return (
      <>
        <FbxPreview
          modelUrl={modelUrl}
          toonMaterial={toonMaterial}
          outlineMaterial={outlineMaterial}
          outlineEnabled={!isTerrain && params.outlineEnabled}
        />
        {isTerrain && <TerrainPreviewLightSync material={toonMaterial} />}
      </>
    );
  }

  return (
    <>
      <SpherePreview
        toonMaterial={toonMaterial}
        outlineMaterial={outlineMaterial}
        outlineEnabled={!isTerrain && params.outlineEnabled}
      />
      {isTerrain && <TerrainPreviewLightSync material={toonMaterial} />}
    </>
  );
}

function CameraReset({
  modelUrl,
  isTerrain,
}: {
  modelUrl: string | null;
  isTerrain: boolean;
}) {
  return <SceneCameraController mode={isTerrain ? "terrain" : "auto"} resetKey={modelUrl} />;
}

interface MaterialPreviewCanvasProps {
  projectRoot: string | null;
  modelRelativePath: string;
  baseColorRelativePath: string;
  shaderType: MaterialLabShaderType;
  params: MaterialLabParams;
}

function resolveFileUrl(projectRoot: string | null, relativePath: string): string | null {
  if (!projectRoot || !relativePath) return null;
  const abs = `${projectRoot.replace(/\\/g, "/")}/${relativePath}`.replace(/\/+/g, "/");
  return fileUrl(abs);
}

export function MaterialPreviewCanvas({
  projectRoot,
  modelRelativePath,
  baseColorRelativePath,
  shaderType,
  params,
}: MaterialPreviewCanvasProps) {
  const isTerrain = isTerrainMaterialLab({ shaderType });
  const modelUrl = useMemo(
    () => resolveFileUrl(projectRoot, modelRelativePath),
    [projectRoot, modelRelativePath],
  );
  const baseColorUrl = useMemo(
    () => resolveFileUrl(projectRoot, baseColorRelativePath),
    [projectRoot, baseColorRelativePath],
  );

  const canvasKey = `${modelUrl ?? "none"}-${baseColorUrl ?? "none"}`;

  return (
    <div className="material-lab-preview">
      <Canvas
        key={canvasKey}
        camera={{ position: [0, 12, 24], fov: 45, near: 0.1, far: 5000 }}
        gl={{ antialias: true }}
      >
        <color attach="background" args={["#2a2f3a"]} />
        {!isTerrain && (
          <>
            <ambientLight intensity={0.35} />
            <directionalLight position={[4, 6, 3]} intensity={1.1} />
          </>
        )}
        <Suspense fallback={null}>
          <ToonMesh
            modelUrl={modelUrl}
            baseColorUrl={baseColorUrl}
            shaderType={shaderType}
            params={params}
          />
          <CameraReset modelUrl={modelUrl} isTerrain={isTerrain} />
        </Suspense>
      </Canvas>
      {!modelRelativePath && (
        <div className="material-lab-preview-hint">
          {isTerrain ? "未找到 exports/SM_*_Terrain.fbx，显示默认球体" : "未找到 exports FBX，显示默认球体"}
        </div>
      )}
      {isTerrain && modelRelativePath && (
        <div className="material-lab-preview-hint material-lab-preview-hint-sub">
          预览对齐 Unity ToonTerrainURP（无实时阴影贴图，角色投影请在 Unity 查看）
        </div>
      )}
    </div>
  );
}
