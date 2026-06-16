import { Suspense, useEffect, useMemo, useRef } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { Center, OrbitControls, useFBX } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { SkeletonUtils } from "three-stdlib";
import * as THREE from "three";
import type { MaterialLabParams } from "./materialLabTypes";
import { fileUrl } from "../api";
import { disposeMaterial, disposeObject3D, disposeTexture } from "../lib/threeCleanup";

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

void main() {
  vec4 clipPos = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  vec3 clipNormal = normalize(mat3(projectionMatrix * modelViewMatrix) * normal);
  clipPos.xy += clipNormal.xy * outlineWidth * clipPos.w;
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

function useToonMaterial(texture: THREE.Texture | null, params: MaterialLabParams): THREE.ShaderMaterial {
  const material = useMemo(() => {
    return new THREE.ShaderMaterial({
      vertexShader: TOON_VERT,
      fragmentShader: TOON_FRAG,
      uniforms: {
        baseMap: { value: texture },
        hasBaseMap: { value: texture ? 1 : 0 },
        baseColorTint: { value: new THREE.Vector4(...params.baseColorTint) },
        baseSaturation: { value: params.baseSaturation },
        baseValue: { value: params.baseValue },
        contrast: { value: params.contrast },
        rampSteps: { value: params.rampSteps },
        shadowStrength: { value: params.shadowStrength },
        rimColor: { value: new THREE.Vector3(...params.rimColor.slice(0, 3)) },
        rimPower: { value: params.rimPower },
        rimIntensity: { value: params.rimIntensity },
        matcapStrength: { value: params.matcapStrength },
        lightDir: { value: new THREE.Vector3(0.4, 0.8, 0.5) },
      },
    });
  }, [texture]);

  useEffect(() => () => disposeMaterial(material), [material]);

  useEffect(() => {
    material.uniforms.baseMap.value = texture;
    material.uniforms.hasBaseMap.value = texture ? 1 : 0;
  }, [material, texture]);

  useEffect(() => {
    material.uniforms.baseColorTint.value.set(...params.baseColorTint);
    material.uniforms.baseSaturation.value = params.baseSaturation;
    material.uniforms.baseValue.value = params.baseValue;
    material.uniforms.contrast.value = params.contrast;
    material.uniforms.rampSteps.value = params.rampSteps;
    material.uniforms.shadowStrength.value = params.shadowStrength;
    material.uniforms.rimColor.value.set(...params.rimColor.slice(0, 3));
    material.uniforms.rimPower.value = params.rimPower;
    material.uniforms.rimIntensity.value = params.rimIntensity;
    material.uniforms.matcapStrength.value = params.matcapStrength;
  }, [material, params]);

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
  const body = useMemo(() => SkeletonUtils.clone(cached) as THREE.Group, [cached, modelUrl]);
  const outline = useMemo(() => {
    if (!outlineEnabled) return null;
    return SkeletonUtils.clone(cached) as THREE.Group;
  }, [cached, modelUrl, outlineEnabled]);

  useEffect(() => () => disposeObject3D(body), [body]);
  useEffect(() => {
    if (outline) return () => disposeObject3D(outline);
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
  params,
}: {
  modelUrl: string | null;
  baseColorUrl: string | null;
  params: MaterialLabParams;
}) {
  const texture = useBaseTexture(baseColorUrl);
  useEffect(() => () => disposeTexture(texture), [texture]);

  const toonMaterial = useToonMaterial(texture, params);
  const outlineMaterial = useOutlineMaterial(params);

  if (modelUrl) {
    return (
      <FbxPreview
        modelUrl={modelUrl}
        toonMaterial={toonMaterial}
        outlineMaterial={outlineMaterial}
        outlineEnabled={params.outlineEnabled}
      />
    );
  }

  return (
    <SpherePreview
      toonMaterial={toonMaterial}
      outlineMaterial={outlineMaterial}
      outlineEnabled={params.outlineEnabled}
    />
  );
}

function CameraReset({ modelUrl }: { modelUrl: string | null }) {
  const { camera, scene } = useThree();
  const controlsRef = useRef<OrbitControlsImpl | null>(null);

  useEffect(() => {
    const box = new THREE.Box3();
    scene.updateMatrixWorld(true);
    scene.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) box.expandByObject(obj);
    });
    const center = box.isEmpty() ? new THREE.Vector3() : box.getCenter(new THREE.Vector3());
    const size = box.isEmpty() ? new THREE.Vector3(1, 1, 1) : box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z, 0.001);
    const distance = maxDim * 2.4;
    camera.position.set(center.x, center.y, center.z + distance);
    camera.lookAt(center);
    controlsRef.current?.target.copy(center);
    controlsRef.current?.update();
  }, [camera, scene, modelUrl]);

  return <OrbitControls ref={controlsRef} makeDefault />;
}

interface MaterialPreviewCanvasProps {
  projectRoot: string | null;
  modelRelativePath: string;
  baseColorRelativePath: string;
  normalRelativePath: string;
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
  params,
}: MaterialPreviewCanvasProps) {
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
      <Canvas key={canvasKey} camera={{ position: [0, 0, 3], fov: 45 }} gl={{ antialias: true }}>
        <color attach="background" args={["#2a2f3a"]} />
        <ambientLight intensity={0.35} />
        <directionalLight position={[4, 6, 3]} intensity={1.1} />
        <Suspense fallback={null}>
          <ToonMesh modelUrl={modelUrl} baseColorUrl={baseColorUrl} params={params} />
          <CameraReset modelUrl={modelUrl} />
        </Suspense>
      </Canvas>
      {!modelRelativePath && (
        <div className="material-lab-preview-hint">未找到 exports FBX，显示默认球体</div>
      )}
    </div>
  );
}
