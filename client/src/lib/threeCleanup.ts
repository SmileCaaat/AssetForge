import * as THREE from "three";

/** 仅释放几何体，不碰材质（材质由外部 Shader 管理时不要 disposeObject3D） */
export function disposeObjectGeometry(root: THREE.Object3D): void {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry?.dispose();
  });
}

/** 释放 Three.js 对象 GPU 资源 */
export function disposeObject3D(root: THREE.Object3D): void {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;

    mesh.geometry?.dispose();

    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
      if (!material) continue;
      for (const value of Object.values(material)) {
        const tex = value as THREE.Texture | unknown;
        if (tex instanceof THREE.Texture) tex.dispose();
      }
      material.dispose();
    }
  });
}

export function disposeMaterial(material: THREE.Material | null | undefined): void {
  if (!material) return;
  for (const value of Object.values(material)) {
    const tex = value as THREE.Texture | unknown;
    if (tex instanceof THREE.Texture) tex.dispose();
  }
  material.dispose();
}

export function disposeTexture(texture: THREE.Texture | null | undefined): void {
  texture?.dispose();
}

/** 快速切换模型时清理 Loader 缓存，避免堆积 */
export function clearThreeLoaderCache(): void {
  if (THREE.Cache.enabled) {
    THREE.Cache.clear();
  }
}
