import { Suspense, useEffect, useMemo, useRef } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { Center, OrbitControls, useFBX } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { SkeletonUtils } from "three-stdlib";
import * as THREE from "three";
import type { MaterialLabParams } from "./materialLabTypes";
import { fileUrl } from "../api";
import { disposeMaterial, disposeObject3D, disposeTexture } from "../lib/threeCleanup";

const VERT = `
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

const FRAG = `
uniform sampler2D baseMap;
uniform bool hasBaseMap;
uniform vec4 baseColorTint;
uniform float baseSaturation;
uniform float baseValue;
uniform float contrast;
uniform float rampSteps;
uniform float shadowStrength;
uniform vec3 rimColor;
uniform float rimPower;
uniform float rimIntensity;
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

void main() {
  vec3 base = hasBaseMap ? texture2D(baseMap, vUv).rgb : vec3(0.75, 0.78, 0.82);
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

  gl_FragColor = vec4(color, 1.0);
}
`;

function ToonMesh({
  modelUrl,
  baseColorUrl,
  params,
}: {
  modelUrl: string | null;
  baseColorUrl: string | null;
  params: MaterialLabParams;
}) {
  const texture = useMemo(() => {
    if (!baseColorUrl) return null;
    const loader = new THREE.TextureLoader();
    const tex = loader.load(baseColorUrl);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }, [baseColorUrl]);

  useEffect(() => {
    return () => {
      disposeTexture(texture);
    };
  }, [texture]);

  const material = useMemo(() => {
    return new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        baseMap: { value: texture },
        hasBaseMap: { value: Boolean(texture) },
        baseColorTint: { value: new THREE.Vector4(...params.baseColorTint) },
        baseSaturation: { value: params.baseSaturation },
        baseValue: { value: params.baseValue },
        contrast: { value: params.contrast },
        rampSteps: { value: params.rampSteps },
        shadowStrength: { value: params.shadowStrength },
        rimColor: { value: new THREE.Vector3(...params.rimColor.slice(0, 3)) },
        rimPower: { value: params.rimPower },
        rimIntensity: { value: params.rimIntensity },
        lightDir: { value: new THREE.Vector3(0.4, 0.8, 0.5) },
      },
    });
  }, [texture]);

  useEffect(() => {
    return () => {
      disposeMaterial(material);
    };
  }, [material]);

  useEffect(() => {
    material.uniforms.baseMap.value = texture;
    material.uniforms.hasBaseMap.value = Boolean(texture);
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
  }, [material, params]);

  if (modelUrl) {
    return <FbxToon modelUrl={modelUrl} material={material} />;
  }

  return (
    <mesh material={material}>
      <sphereGeometry args={[1, 48, 48]} />
    </mesh>
  );
}

function FbxToon({ modelUrl, material }: { modelUrl: string; material: THREE.ShaderMaterial }) {
  const cached = useFBX(modelUrl);
  const clone = useMemo(() => SkeletonUtils.clone(cached) as THREE.Group, [cached, modelUrl]);

  useEffect(() => {
    return () => {
      disposeObject3D(clone);
    };
  }, [clone]);

  useEffect(() => {
    clone.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        (child as THREE.Mesh).material = material;
      }
    });
  }, [clone, material]);

  return (
    <Center>
      <primitive object={clone} />
    </Center>
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
  params: MaterialLabParams;
}

export function MaterialPreviewCanvas({
  projectRoot,
  modelRelativePath,
  baseColorRelativePath,
  params,
}: MaterialPreviewCanvasProps) {
  const modelUrl = useMemo(() => {
    if (!projectRoot || !modelRelativePath) return null;
    const abs = `${projectRoot.replace(/\\/g, "/")}/${modelRelativePath}`.replace(/\/+/g, "/");
    return fileUrl(abs);
  }, [projectRoot, modelRelativePath]);

  const baseColorUrl = useMemo(() => {
    if (!projectRoot || !baseColorRelativePath) return null;
    const abs = `${projectRoot.replace(/\\/g, "/")}/${baseColorRelativePath}`.replace(/\/+/g, "/");
    return fileUrl(abs);
  }, [projectRoot, baseColorRelativePath]);

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
