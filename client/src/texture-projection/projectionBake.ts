import * as THREE from "three";

// Pure WebGL multi-view projection baking.
//
// Renders a mesh into UV space (each triangle placed at its UV coords) and, for
// every UV texel, projects the corresponding world position into up to 6
// orthographic view cameras, samples the assigned reference image, and blends
// the samples weighted by how directly the surface faces each camera.
//
// No AI, no external services — runs entirely in the browser via Three.js.
//
// ⚠️  注意：此功能不适合作为人物模型贴图制作。
//    人物角色的头发、睫毛等前景遮挡物会干扰深度测试，导致脸部等关键区域无法正确投影。
//    是否适合规则多边形道具（建筑、武器、载具等）使用，有待进一步测试。

export const PROJECTION_DIRECTIONS = [
  "front",
  "back",
  "left",
  "right",
  "top",
  "bottom",
] as const;
export type ProjectionDirection = (typeof PROJECTION_DIRECTIONS)[number];

export const DIRECTION_LABELS: Record<ProjectionDirection, string> = {
  front: "正视图",
  back: "背视图",
  left: "左视图",
  right: "右视图",
  top: "顶视图",
  bottom: "底视图",
};

const MAX_VIEWS = 6;

export interface BakeView {
  direction: ProjectionDirection;
  texture: THREE.Texture;
  /** World-space orthographic camera framing the mesh for this direction. */
  camera: THREE.OrthographicCamera;
  enabled: boolean;
  weight: number;
}

export interface BakeMesh {
  geometry: THREE.BufferGeometry;
  modelMatrix: THREE.Matrix4;
}

export interface BakeOptions {
  /** One or more meshes sharing the same UV layout / output texture. */
  meshes: BakeMesh[];
  views: BakeView[];
  size: number;
  /** Falloff exponent for facing weight; higher = sharper view boundaries. */
  facingExponent: number;
  /** Depth-test each view so its image only lands on its nearest visible surface. */
  occlusion: boolean;
  /** Depth comparison bias (0..1) to avoid self-occlusion z-fighting. */
  depthBias: number;
  /** Fill color for texels no camera covers (RGB 0..1). */
  fillColor: THREE.Color;
}

const VERT = /* glsl */ `
  varying vec3 vWorldPos;
  varying vec3 vWorldNormal;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    vec2 p = uv * 2.0 - 1.0;          // place vertex at its UV coordinate
    gl_Position = vec4(p, 0.0, 1.0);
  }
`;

const FRAG = /* glsl */ `
  precision highp float;
  #define MAX_VIEWS ${MAX_VIEWS}
  uniform sampler2D uViews[MAX_VIEWS];
  uniform sampler2D uDepth[MAX_VIEWS];
  uniform mat4 uViewProj[MAX_VIEWS];
  uniform vec3 uForward[MAX_VIEWS];
  uniform float uEnabled[MAX_VIEWS];
  uniform float uWeight[MAX_VIEWS];
  uniform float uFacingExp;
  uniform float uOcclusion;
  uniform float uDepthBias;
  uniform vec3 uFillColor;
  varying vec3 vWorldPos;
  varying vec3 vWorldNormal;

  vec4 sampleView(sampler2D tex, sampler2D depthTex, mat4 vp, vec3 fwd, vec3 N, float userW) {
    vec4 clip = vp * vec4(vWorldPos, 1.0);
    if (clip.w <= 0.0) return vec4(0.0);
    vec3 ndc = clip.xyz / clip.w;
    vec2 suv = ndc.xy * 0.5 + 0.5;
    if (suv.x < 0.0 || suv.x > 1.0 || suv.y < 0.0 || suv.y > 1.0) return vec4(0.0);
    float facing = dot(N, -normalize(fwd));   // >0 => surface faces this camera
    if (facing <= 0.0) return vec4(0.0);
    if (uOcclusion > 0.5) {
      // Depth test: only the nearest surface to this camera receives its image.
      float nearest = texture2D(depthTex, suv).r;
      float d = ndc.z * 0.5 + 0.5;
      if (d > nearest + uDepthBias) return vec4(0.0);   // behind something -> occluded
    }
    vec4 c = texture2D(tex, suv);
    // Alpha (from the edge-connected matte) rejects background; multiply weight by it.
    float w = pow(facing, uFacingExp) * userW * c.a;
    return vec4(c.rgb, 1.0) * w;
  }

  void main() {
    vec3 N = normalize(vWorldNormal);
    vec4 acc = vec4(0.0);
    for (int i = 0; i < MAX_VIEWS; i++) {
      if (uEnabled[i] < 0.5) continue;
      // sampler arrays require constant index in GLSL ES 1.0 -> manual dispatch
      if (i == 0) acc += sampleView(uViews[0], uDepth[0], uViewProj[0], uForward[0], N, uWeight[0]);
      else if (i == 1) acc += sampleView(uViews[1], uDepth[1], uViewProj[1], uForward[1], N, uWeight[1]);
      else if (i == 2) acc += sampleView(uViews[2], uDepth[2], uViewProj[2], uForward[2], N, uWeight[2]);
      else if (i == 3) acc += sampleView(uViews[3], uDepth[3], uViewProj[3], uForward[3], N, uWeight[3]);
      else if (i == 4) acc += sampleView(uViews[4], uDepth[4], uViewProj[4], uForward[4], N, uWeight[4]);
      else acc += sampleView(uViews[5], uDepth[5], uViewProj[5], uForward[5], N, uWeight[5]);
    }
    if (acc.a > 0.0001) {
      gl_FragColor = vec4(acc.rgb / acc.a, 1.0);
    } else {
      gl_FragColor = vec4(uFillColor, 0.0);   // alpha 0 marks uncovered texels
    }
  }
`;

// Renders linear window-space depth (gl_FragCoord.z) as grayscale for the
// occlusion depth test and the depth preview.
const DEPTH_VERT = /* glsl */ `
  void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const DEPTH_FRAG = /* glsl */ `
  precision highp float;
  void main() { gl_FragColor = vec4(vec3(gl_FragCoord.z), 1.0); }
`;

function identityMat() {
  return new THREE.Matrix4();
}

/**
 * Build an orthographic camera that frames `box` looking along `dir` (unit world
 * vector pointing FROM the camera TOWARD the object).
 */
export function buildDirectionCamera(
  box: THREE.Box3,
  dir: THREE.Vector3,
  up: THREE.Vector3,
  pad = 1.05,
  /** If given, frame by mesh height × this aspect (width/height) so the image is not stretched. */
  imageAspect?: number,
): THREE.OrthographicCamera {
  const center = new THREE.Vector3();
  const size = new THREE.Vector3();
  box.getCenter(center);
  box.getSize(size);
  const radius = size.length() * 0.5;
  const d = dir.clone().normalize();
  const camPos = center.clone().add(d.clone().multiplyScalar(-radius * 2.5));

  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, radius * 6);
  cam.position.copy(camPos);
  cam.up.copy(up);
  cam.lookAt(center);
  cam.updateMatrixWorld(true);

  // Frame extents: project the box corners into camera space to get tight ortho bounds.
  const inv = cam.matrixWorldInverse;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  const c = new THREE.Vector3();
  for (let i = 0; i < 8; i++) {
    c.set(
      i & 1 ? box.max.x : box.min.x,
      i & 2 ? box.max.y : box.min.y,
      i & 4 ? box.max.z : box.min.z,
    ).applyMatrix4(inv);
    minX = Math.min(minX, c.x); maxX = Math.max(maxX, c.x);
    minY = Math.min(minY, c.y); maxY = Math.max(maxY, c.y);
  }
  const halfH = ((maxY - minY) / 2) * pad;
  // Match the reference image's aspect (width = height × aspect) so the cropped
  // character maps without horizontal stretch; otherwise tight-fit the bbox.
  const halfW = imageAspect ? halfH * imageAspect : ((maxX - minX) / 2) * pad;
  const cx = (minX + maxX) / 2; // keep the frame centred on the projected bbox
  const cy = (minY + maxY) / 2;
  cam.left = cx - halfW; cam.right = cx + halfW;
  cam.top = cy + halfH; cam.bottom = cy - halfH;
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld(true);
  return cam;
}

export type AxisName = "+x" | "-x" | "+y" | "-y" | "+z" | "-z";
export const AXIS_NAMES: AxisName[] = ["+x", "-x", "+y", "-y", "+z", "-z"];

export function axisVec(a: AxisName): THREE.Vector3 {
  switch (a) {
    case "+x": return new THREE.Vector3(1, 0, 0);
    case "-x": return new THREE.Vector3(-1, 0, 0);
    case "+y": return new THREE.Vector3(0, 1, 0);
    case "-y": return new THREE.Vector3(0, -1, 0);
    case "+z": return new THREE.Vector3(0, 0, 1);
    case "-z": return new THREE.Vector3(0, 0, -1);
  }
}

export interface OrientationConfig {
  /** World axis the character faces (front view looks back along this). */
  front: AxisName;
  /** World up axis. */
  up: AxisName;
  /** Swap left/right to fix handedness mirroring. */
  mirrorLR: boolean;
}

/** Build the 6 orthographic direction cameras from the bounding box + orientation. */
export function buildDirectionCameras(
  box: THREE.Box3,
  cfg: OrientationConfig,
  /** Optional per-direction reference image aspect (width/height) to avoid stretch. */
  aspects?: Partial<Record<ProjectionDirection, number>>,
): Record<ProjectionDirection, THREE.OrthographicCamera> {
  const f = axisVec(cfg.front);
  const u = axisVec(cfg.up);
  const r = new THREE.Vector3().crossVectors(f, u).normalize();
  if (cfg.mirrorLR) r.negate();
  const back = f.clone().negate();
  const a = aspects ?? {};
  return {
    front: buildDirectionCamera(box, f.clone().negate(), u, 1.05, a.front),
    back: buildDirectionCamera(box, f.clone(), u, 1.05, a.back),
    right: buildDirectionCamera(box, r.clone().negate(), u, 1.05, a.right),
    left: buildDirectionCamera(box, r.clone(), u, 1.05, a.left),
    top: buildDirectionCamera(box, u.clone().negate(), back, 1.05, a.top),
    bottom: buildDirectionCamera(box, u.clone(), f.clone(), 1.05, a.bottom),
  };
}

export interface BakeResult {
  canvas: HTMLCanvasElement;
  /** Fraction of texels covered by at least one view (0..1). */
  coverage: number;
  /** Grayscale depth map per direction (near = dark), for the occlusion preview. */
  depthPreviews: Partial<Record<ProjectionDirection, HTMLCanvasElement>>;
}

function rtToGrayCanvas(renderer: THREE.WebGLRenderer, rt: THREE.WebGLRenderTarget): HTMLCanvasElement {
  const s = rt.width;
  const buf = new Uint8Array(s * s * 4);
  renderer.readRenderTargetPixels(rt, 0, 0, s, s, buf);
  const canvas = document.createElement("canvas");
  canvas.width = s; canvas.height = s;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(s, s);
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const src = ((s - 1 - y) * s + x) * 4; // flip Y
      const dst = (y * s + x) * 4;
      const v = buf[src]; // R channel = depth
      img.data[dst] = v; img.data[dst + 1] = v; img.data[dst + 2] = v; img.data[dst + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/** Bake the projection into a canvas (square, `size`×`size`). */
export function bakeProjection(opts: BakeOptions): BakeResult {
  const { meshes, views, size } = opts;

  const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, preserveDrawingBuffer: true });
  renderer.setSize(size, size, false);
  const target = new THREE.WebGLRenderTarget(size, size, {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    format: THREE.RGBAFormat,
    type: THREE.UnsignedByteType,
  });

  const scene = new THREE.Scene();
  for (const m of meshes) {
    const mesh = new THREE.Mesh(m.geometry, new THREE.MeshBasicMaterial());
    mesh.matrixAutoUpdate = false;
    mesh.matrix.copy(m.modelMatrix);
    mesh.matrixWorld.copy(m.modelMatrix);
    scene.add(mesh);
  }

  const white = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
  white.needsUpdate = true;

  // --- Depth pre-pass: render each view's nearest-surface depth (gl_FragCoord.z). ---
  const depthMat = new THREE.ShaderMaterial({
    vertexShader: DEPTH_VERT,
    fragmentShader: DEPTH_FRAG,
    side: THREE.DoubleSide,
  });
  const depthRTs: (THREE.WebGLRenderTarget | null)[] = [];
  const depthPreviews: Partial<Record<ProjectionDirection, HTMLCanvasElement>> = {};
  scene.overrideMaterial = depthMat;
  for (let i = 0; i < MAX_VIEWS; i++) {
    const v = views[i];
    if (opts.occlusion && v && v.enabled && v.texture) {
      // Match the bake output resolution so depth precision equals bake precision.
      const rt = new THREE.WebGLRenderTarget(size, size, {
        minFilter: THREE.NearestFilter,
        magFilter: THREE.NearestFilter,
        format: THREE.RGBAFormat,
        type: THREE.UnsignedByteType,
      });
      v.camera.updateMatrixWorld(true);
      renderer.setRenderTarget(rt);
      renderer.setClearColor(0xffffff, 1); // far = white
      renderer.clear();
      renderer.render(scene, v.camera);
      depthRTs.push(rt);
      depthPreviews[v.direction] = rtToGrayCanvas(renderer, rt);
    } else {
      depthRTs.push(null);
    }
  }
  scene.overrideMaterial = null;

  // --- Main UV-space projection pass. ---
  const tex: THREE.Texture[] = [];
  const depthTex: THREE.Texture[] = [];
  const vp: THREE.Matrix4[] = [];
  const fwd: THREE.Vector3[] = [];
  const enabled: number[] = [];
  const weight: number[] = [];
  for (let i = 0; i < MAX_VIEWS; i++) {
    const v = views[i];
    if (v && v.enabled && v.texture) {
      v.camera.updateMatrixWorld(true);
      const m = new THREE.Matrix4().multiplyMatrices(v.camera.projectionMatrix, v.camera.matrixWorldInverse);
      const f = new THREE.Vector3(0, 0, -1).applyQuaternion(v.camera.quaternion).normalize();
      tex.push(v.texture); vp.push(m); fwd.push(f); enabled.push(1); weight.push(v.weight);
      depthTex.push(depthRTs[i]?.texture ?? white);
    } else {
      tex.push(white); vp.push(identityMat()); fwd.push(new THREE.Vector3(0, 0, -1)); enabled.push(0); weight.push(0);
      depthTex.push(white);
    }
  }

  const material = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    side: THREE.DoubleSide,
    uniforms: {
      uViews: { value: tex },
      uDepth: { value: depthTex },
      uViewProj: { value: vp },
      uForward: { value: fwd },
      uEnabled: { value: enabled },
      uWeight: { value: weight },
      uFacingExp: { value: opts.facingExponent },
      uOcclusion: { value: opts.occlusion ? 1 : 0 },
      uDepthBias: { value: opts.depthBias },
      uFillColor: { value: opts.fillColor },
    },
  });
  scene.traverse((c) => {
    const mesh = c as THREE.Mesh;
    if (mesh.isMesh) mesh.material = material;
  });

  const dummyCam = new THREE.Camera();
  renderer.setRenderTarget(target);
  renderer.setClearColor(0x000000, 0);
  renderer.clear();
  renderer.render(scene, dummyCam);

  // Read back and flip vertically into the output canvas.
  const buf = new Uint8Array(size * size * 4);
  renderer.readRenderTargetPixels(target, 0, 0, size, size, buf);
  let covered = 0;
  for (let i = 3; i < buf.length; i += 4) if (buf[i] > 0) covered++;
  const canvas = document.createElement("canvas");
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    const src = (size - 1 - y) * size * 4;
    const dst = y * size * 4;
    img.data.set(buf.subarray(src, src + size * 4), dst);
  }
  ctx.putImageData(img, 0, 0);

  material.dispose();
  depthMat.dispose();
  depthRTs.forEach((rt) => rt?.dispose());
  target.dispose();
  white.dispose();
  renderer.dispose();

  return { canvas, coverage: covered / (size * size), depthPreviews };
}
