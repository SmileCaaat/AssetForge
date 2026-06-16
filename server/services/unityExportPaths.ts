/** 所有角色的 Unity 就绪资产包根目录（位于 BlenderWorkspace 下） */
export const UNITY_ASSETS_ROOT = "UnityAssets";

export function projectBundleRel(projectName: string): string {
  return `${UNITY_ASSETS_ROOT}/${projectName}`;
}

export function bundleHlslRelative(projectName: string): string {
  return `${projectBundleRel(projectName)}/Shaders/Generated/ToonCore.generated.hlsl`;
}

export function sharedImporterRel(): string {
  return `${UNITY_ASSETS_ROOT}/Editor/AssetManagerMaterialImporter.cs`;
}
