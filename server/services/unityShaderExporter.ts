import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import type { MaterialLabState } from "../materialLabTypes.js";
import { isTerrainMaterialLab } from "../materialLabTypes.js";
import {
  UNITY_ASSETS_ROOT,
  bundleHlslRelative,
  projectBundleRel,
  sharedImporterRel,
} from "./unityExportPaths.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES_ROOT = path.join(__dirname, "..", "templates");

const FALLBACK_HLSL = `// Auto-generated fallback Toon core (AssetManagerTools Material Lab)
#ifndef AMT_TOON_CORE_INCLUDED
#define AMT_TOON_CORE_INCLUDED

struct ToonParams
{
    float3 baseColor;
    float rampSteps;
    float shadowStrength;
    float rimPower;
    float rimIntensity;
    float3 rimColor;
};

float3 AMT_ApplyToonRamp(float ndotl, ToonParams p)
{
    float safeSteps = max(p.rampSteps, 1.0);
    float level = floor(saturate(ndotl) * safeSteps) / max(safeSteps - 1.0, 1.0);
    float shade = lerp(p.shadowStrength, 1.0, level);
    return p.baseColor * shade;
}

float3 AMT_ApplyRim(float3 color, float3 normalWS, float3 viewDirWS, ToonParams p)
{
    float rim = pow(1.0 - saturate(dot(normalize(normalWS), normalize(viewDirWS))), p.rimPower);
    return color + p.rimColor * rim * p.rimIntensity;
}

float3 AMT_EvaluateToon(
    float3 normalWS,
    float3 lightDirWS,
    float3 viewDirWS,
    ToonParams p
)
{
    float ndotl = saturate(dot(normalize(normalWS), normalize(lightDirWS)));
    float3 color = AMT_ApplyToonRamp(ndotl, p);
    color = AMT_ApplyRim(color, normalWS, viewDirWS, p);
    return color;
}

#endif
`;

async function readTemplate(relativePath: string): Promise<string> {
  return fs.readFile(path.join(TEMPLATES_ROOT, relativePath), "utf-8");
}

function renderTemplate(template: string, vars: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replaceAll(`{{${key}}}`, value);
  }
  return result;
}

function rel(...parts: string[]): string {
  return parts.join("/");
}

async function writeAmtLightingCommon(generatedDir: string, bundleRel: string): Promise<string> {
  const hlsl = await readTemplate("unity/AMTLightingCommon.hlsl");
  const lightingRel = rel(bundleRel, "Shaders/Generated/AMTLightingCommon.hlsl");
  await fs.writeFile(path.join(generatedDir, "AMTLightingCommon.hlsl"), hlsl, "utf-8");
  return lightingRel;
}

async function copyProjectFile(
  projectRoot: string,
  relativePath: string,
  destAbs: string,
): Promise<boolean> {
  if (!relativePath.trim()) return false;
  const srcAbs = path.resolve(projectRoot, relativePath.split("/").join(path.sep));
  if (!srcAbs.startsWith(path.resolve(projectRoot))) return false;
  try {
    await fs.access(srcAbs);
    await fs.mkdir(path.dirname(destAbs), { recursive: true });
    await fs.copyFile(srcAbs, destAbs);
    return true;
  } catch {
    return false;
  }
}

interface MaterialJsonV2 {
  version: 2;
  name: string;
  shader: string;
  bundleName: string;
  displayName: string;
  model: string;
  textures: { key: string; path: string }[];
  colors: { key: string; value: number[] }[];
  floats: { key: string; value: number }[];
}

const DEFAULT_LIGHTING_PARAMS = {
  shadowReceiveStrength: 0.7,
  ambientStrength: 0.25,
  rimLightInfluence: 0.2,
  lightColorInfluence: 0.6,
} as const;

function lightingParam(
  state: MaterialLabState,
  key: keyof typeof DEFAULT_LIGHTING_PARAMS,
): number {
  const value = state.params[key];
  return typeof value === "number" ? value : DEFAULT_LIGHTING_PARAMS[key];
}

function buildTerrainMaterialJson(
  state: MaterialLabState,
  bundleName: string,
  copied: CopiedAssets,
): MaterialJsonV2 {
  const materialName = `M_${state.projectName}`;
  const textureEntries: { key: string; path: string }[] = [];
  if (copied.baseColor) textureEntries.push({ key: "_BaseMap", path: copied.baseColor });

  const p = state.params;

  return {
    version: 2,
    name: materialName,
    shader: state.unity.shaderName,
    bundleName,
    displayName: state.displayName,
    model: copied.model ?? "",
    textures: textureEntries,
    colors: [
      { key: "_BaseColorTint", value: [...p.baseColorTint] },
      { key: "_CelShadowColor", value: [...p.celShadowColor] },
      { key: "_CelHighlightColor", value: [...p.celHighlightColor] },
      { key: "_SlopeRockTint", value: [0.55, 0.5, 0.42, 1] },
    ],
    floats: [
      { key: "_BaseSaturation", value: p.baseSaturation },
      { key: "_BaseValue", value: p.baseValue },
      { key: "_RampSteps", value: p.rampSteps },
      { key: "_RampBlend", value: p.terrainRampBlend ?? 0.18 },
      { key: "_AlbedoInfluence", value: p.terrainAlbedoInfluence ?? 0.72 },
      { key: "_AlbedoPosterize", value: p.terrainAlbedoPosterize ?? 0.22 },
      { key: "_NormalStrength", value: p.terrainNormalStrength ?? 1.15 },
      { key: "_SlopeTintStrength", value: p.terrainSlopeTint ?? 0.12 },
      { key: "_ShadowReceiveStrength", value: lightingParam(state, "shadowReceiveStrength") },
      { key: "_AmbientStrength", value: lightingParam(state, "ambientStrength") },
      { key: "_LightColorInfluence", value: lightingParam(state, "lightColorInfluence") },
      { key: "_DistanceSmoothStrength", value: p.terrainDistanceSmooth ?? 0.35 },
      { key: "_DistanceSmoothFar", value: 48 },
    ],
  };
}

function buildCharacterMaterialJson(state: MaterialLabState, bundleName: string, copied: CopiedAssets): MaterialJsonV2 {
  const materialName = `M_${state.projectName}`;
  const textureEntries: { key: string; path: string }[] = [];

  const slots: [string, string | undefined][] = [
    ["_BaseMap", copied.baseColor],
    ["_BumpMap", copied.normal],
    ["_MetallicGlossMap", copied.metallicSmoothness],
    ["_OcclusionMap", copied.ao],
    ["_EmissionMap", copied.emission],
  ];

  for (const [key, relPath] of slots) {
    if (relPath) textureEntries.push({ key, path: relPath });
  }

  return {
    version: 2,
    name: materialName,
    shader: state.unity.shaderName,
    bundleName,
    displayName: state.displayName,
    model: copied.model ?? "",
    textures: textureEntries,
    colors: [
      { key: "_BaseColorTint", value: [...state.params.baseColorTint] },
      { key: "_RimColor", value: [...state.params.rimColor] },
      { key: "_OutlineColor", value: [...state.params.outlineColor] },
    ],
    floats: [
      { key: "_RampSteps", value: state.params.rampSteps },
      { key: "_ShadowStrength", value: state.params.shadowStrength },
      { key: "_ShadowReceiveStrength", value: lightingParam(state, "shadowReceiveStrength") },
      { key: "_AmbientStrength", value: lightingParam(state, "ambientStrength") },
      { key: "_RimPower", value: state.params.rimPower },
      { key: "_RimIntensity", value: state.params.rimIntensity },
      { key: "_RimLightInfluence", value: lightingParam(state, "rimLightInfluence") },
      { key: "_LightColorInfluence", value: lightingParam(state, "lightColorInfluence") },
      {
        key: "_OutlineWidth",
        value: state.params.outlineEnabled ? state.params.outlineWidth : 0,
      },
      { key: "_OutlineFarWidthScale", value: state.params.outlineFarWidthScale },
      { key: "_OutlineFadeStart", value: state.params.outlineFadeStart },
      { key: "_OutlineFadeEnd", value: state.params.outlineFadeEnd },
      { key: "_OutlineMinWidth", value: state.params.outlineMinWidth },
      { key: "_BumpScale", value: 1 },
    ],
  };
}

function buildMaterialJson(state: MaterialLabState, bundleName: string, copied: CopiedAssets): MaterialJsonV2 {
  if (isTerrainMaterialLab(state)) {
    return buildTerrainMaterialJson(state, bundleName, copied);
  }
  return buildCharacterMaterialJson(state, bundleName, copied);
}

interface CopiedAssets {
  model?: string;
  baseColor?: string;
  normal?: string;
  metallicSmoothness?: string;
  ao?: string;
  emission?: string;
}

async function writeSharedImporter(blenderRoot: string, state: MaterialLabState): Promise<string> {
  const importerAbs = path.join(blenderRoot, sharedImporterRel().split("/").join(path.sep));
  await fs.mkdir(path.dirname(importerAbs), { recursive: true });
  const importerTemplate = await readTemplate("unity/AssetManagerMaterialImporter.template.cs");
  const importerContent = renderTemplate(importerTemplate, {
    MATERIAL_NAME: `M_${state.projectName}`,
    SHADER_NAME: state.unity.shaderName,
  });
  await fs.writeFile(importerAbs, importerContent, "utf-8");
  return sharedImporterRel();
}

async function exportProjectUnityBundle(
  projectRoot: string,
  blenderRoot: string,
  state: MaterialLabState,
): Promise<{ bundleRel: string; files: string[] }> {
  const bundleName = state.projectName;
  const bundleRel = projectBundleRel(bundleName);
  const bundleAbs = path.join(blenderRoot, bundleRel.split("/").join(path.sep));

  const modelsDir = path.join(bundleAbs, "Models");
  const texturesDir = path.join(bundleAbs, "Textures");
  const shadersDir = path.join(bundleAbs, "Shaders");
  const generatedDir = path.join(shadersDir, "Generated");
  const materialsDir = path.join(bundleAbs, "Materials");

  await fs.mkdir(modelsDir, { recursive: true });
  await fs.mkdir(texturesDir, { recursive: true });
  await fs.mkdir(generatedDir, { recursive: true });
  await fs.mkdir(materialsDir, { recursive: true });

  const files: string[] = [];
  const copied: CopiedAssets = {};

  if (state.preview.modelPath) {
    const fileName = path.basename(state.preview.modelPath);
    const destAbs = path.join(modelsDir, fileName);
    if (await copyProjectFile(projectRoot, state.preview.modelPath, destAbs)) {
      copied.model = rel("Models", fileName);
      files.push(rel(bundleRel, copied.model));
    }
  }

  const isTerrain = isTerrainMaterialLab(state);

  const textureSlots: [keyof CopiedAssets, string][] = isTerrain
    ? [["baseColor", state.textures.baseColor.path]]
    : [
        ["baseColor", state.textures.baseColor.path],
        ["normal", state.textures.normal.path],
        ["metallicSmoothness", state.textures.metallicSmoothness.path],
        ["ao", state.textures.ao.path],
        ["emission", state.textures.emission.path],
      ];

  for (const [key, srcRel] of textureSlots) {
    if (!srcRel) continue;
    const fileName = path.basename(srcRel);
    const destAbs = path.join(texturesDir, fileName);
    if (await copyProjectFile(projectRoot, srcRel, destAbs)) {
      copied[key] = rel("Textures", fileName);
      files.push(rel(bundleRel, copied[key]!));
    }
  }

  if (!isTerrain) {
    const hlslRel = rel(bundleRel, "Shaders/Generated/ToonCore.generated.hlsl");
    await fs.writeFile(path.join(blenderRoot, hlslRel.split("/").join(path.sep)), FALLBACK_HLSL, "utf-8");
    files.push(hlslRel);
  }

  const lightingHlslRel = await writeAmtLightingCommon(generatedDir, bundleRel);
  files.push(lightingHlslRel);

  const shaderTemplateName = isTerrain ? "unity/ToonTerrainURP.template.shader" : "unity/ToonURP.template.shader";
  const shaderFileName = isTerrain ? "ToonTerrainURP.shader" : "ToonURP.shader";
  const shaderTemplate = await readTemplate(shaderTemplateName);
  const shaderRel = rel(bundleRel, "Shaders", shaderFileName);
  await fs.writeFile(
    path.join(blenderRoot, shaderRel.split("/").join(path.sep)),
    renderTemplate(shaderTemplate, { SHADER_NAME: state.unity.shaderName }),
    "utf-8",
  );
  files.push(shaderRel);

  const materialName = `M_${bundleName}`;
  const materialJson = buildMaterialJson(state, bundleName, copied);
  const materialRel = rel(bundleRel, "Materials", `${materialName}.material.json`);
  await fs.writeFile(
    path.join(blenderRoot, materialRel.split("/").join(path.sep)),
    JSON.stringify(materialJson, null, 2),
    "utf-8",
  );
  files.push(materialRel);

  const manifestRel = rel(bundleRel, "bundle.manifest.json");
  await fs.writeFile(
    path.join(blenderRoot, manifestRel.split("/").join(path.sep)),
    JSON.stringify(
      {
        version: 1,
        bundleName,
        displayName: state.displayName,
        shader: state.unity.shaderName,
        material: rel("Materials", `${materialName}.material.json`),
        model: copied.model ?? "",
        exportedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
    "utf-8",
  );
  files.push(manifestRel);

  const readmeRel = rel(bundleRel, "README.md");
  const readme = `# ${state.displayName} (${bundleName})

Unity 就绪资产包 — 由 AssetManagerTools Material Lab 导出。

## 目录结构

\`\`\`
${bundleName}/
├── Models/          FBX 模型
├── Textures/        贴图
├── Shaders/         ToonURP Shader + HLSL
├── Materials/       材质 JSON（供 Asset Manager 菜单导入）
├── bundle.manifest.json
└── README.md
\`\`\`

## 导入 Unity

1. 将整个 \`${bundleName}/\` 文件夹复制到 Unity 项目的 \`Assets/\` 下（例如 \`Assets/Characters/${bundleName}/\`）。
2. **首次**使用时，还需复制工作区 \`${UNITY_ASSETS_ROOT}/Editor/\` 到 \`Assets/\`（只需一次，含 Asset Manager 菜单脚本）。
3. 在 Unity 菜单：
   - **Asset Manager → Import Material From JSON** — 导入单个 \`${materialName}.material.json\`
   - **Asset Manager → Import All Materials In Folder…** — 选择 \`${bundleName}\` 文件夹，批量生成 .mat
   - 或在 Project 窗口右键该文件夹 → **Asset Manager → Import Materials In Selected Folder**

4. Normal 贴图 Import Settings 设为 **Normal Map**；MetallicSmoothness：R=Metallic，A=Smoothness。

## 批量导入多个角色

将 \`${UNITY_ASSETS_ROOT}/\` 下多个角色文件夹（如 Mushpig、StoneMork）一并复制到 \`Assets/\`，
然后对父文件夹执行 **Import All Materials In Folder** 即可遍历所有 \`.material.json\`。
`;
  await fs.writeFile(path.join(blenderRoot, readmeRel.split("/").join(path.sep)), readme, "utf-8");
  files.push(readmeRel);

  return { bundleRel, files };
}

async function writeUnityAssetsReadme(blenderRoot: string): Promise<string> {
  const readmeRel = rel(UNITY_ASSETS_ROOT, "README.md");
  const readme = `# UnityAssets

由 AssetManagerTools Material Lab 导出的 Unity 就绪角色资产包。

- \`Editor/\` — Asset Manager 导入菜单（复制到 Unity \`Assets/\` 一次即可）
- \`<角色名>/\` — 每个角色的 Models、Textures、Shaders、Materials

在 Unity 中使用 **Asset Manager → Import All Materials In Folder** 可批量生成材质。
`;
  await fs.writeFile(path.join(blenderRoot, readmeRel.split("/").join(path.sep)), readme, "utf-8");
  return readmeRel;
}

export async function exportUnityMaterialPackage(
  projectRoot: string,
  blenderRoot: string,
  state: MaterialLabState,
): Promise<{ exportRoot: string; sharedRoot: string; files: string[] }> {
  const importerRel = await writeSharedImporter(blenderRoot, state);
  const readmeRootRel = await writeUnityAssetsReadme(blenderRoot);
  const { bundleRel, files } = await exportProjectUnityBundle(projectRoot, blenderRoot, state);

  state.slang.generatedHlsl = bundleHlslRelative(state.projectName);
  state.unity.exportedAt = new Date().toISOString();

  return {
    exportRoot: `${bundleRel}/`,
    sharedRoot: `${UNITY_ASSETS_ROOT}/`,
    files: [importerRel, readmeRootRel, ...files],
  };
}

export { FALLBACK_HLSL };
