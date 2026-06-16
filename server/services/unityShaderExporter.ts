import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import type { MaterialLabState } from "../materialLabTypes.js";

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

export async function exportUnityMaterialPackage(
  projectRoot: string,
  state: MaterialLabState,
): Promise<{ exportRoot: string; files: string[] }> {
  const unityRoot = path.join(projectRoot, "unity");
  const shadersDir = path.join(unityRoot, "shaders");
  const generatedDir = path.join(shadersDir, "Generated");
  const materialsDir = path.join(unityRoot, "materials");
  const importerDir = path.join(unityRoot, "importer");

  await fs.mkdir(generatedDir, { recursive: true });
  await fs.mkdir(materialsDir, { recursive: true });
  await fs.mkdir(importerDir, { recursive: true });

  const hlslRel = "unity/shaders/Generated/ToonCore.generated.hlsl";
  const hlslAbs = path.join(projectRoot, hlslRel.split("/").join(path.sep));
  try {
    await fs.access(hlslAbs);
  } catch {
    await fs.writeFile(hlslAbs, FALLBACK_HLSL, "utf-8");
  }

  const shaderTemplate = await readTemplate("unity/ToonURP.template.shader");
  const shaderContent = renderTemplate(shaderTemplate, {
    SHADER_NAME: state.unity.shaderName,
  });
  const shaderRel = "unity/shaders/ToonURP.shader";
  await fs.writeFile(path.join(projectRoot, shaderRel.split("/").join(path.sep)), shaderContent, "utf-8");

  const materialName = `M_${state.projectName}`;
  const materialJson = {
    version: 1,
    name: materialName,
    shader: state.unity.shaderName,
    textures: {
      _BaseMap: state.textures.baseColor.path,
      _BumpMap: state.textures.normal.path,
      _MetallicGlossMap: state.textures.metallicSmoothness.path,
      _OcclusionMap: state.textures.ao.path,
      _EmissionMap: state.textures.emission.path,
    },
    colors: {
      _BaseColorTint: state.params.baseColorTint,
      _RimColor: state.params.rimColor,
      _OutlineColor: state.params.outlineColor,
    },
    floats: {
      _RampSteps: state.params.rampSteps,
      _ShadowStrength: state.params.shadowStrength,
      _RimPower: state.params.rimPower,
      _RimIntensity: state.params.rimIntensity,
      _OutlineWidth: state.params.outlineWidth,
    },
  };
  const materialRel = `unity/materials/${materialName}.material.json`;
  await fs.writeFile(
    path.join(projectRoot, materialRel.split("/").join(path.sep)),
    JSON.stringify(materialJson, null, 2),
    "utf-8",
  );

  const importerTemplate = await readTemplate("unity/AssetManagerMaterialImporter.template.cs");
  const importerContent = renderTemplate(importerTemplate, {
    MATERIAL_NAME: materialName,
    SHADER_NAME: state.unity.shaderName,
  });
  const importerRel = "unity/importer/AssetManagerMaterialImporter.cs";
  await fs.writeFile(
    path.join(projectRoot, importerRel.split("/").join(path.sep)),
    importerContent,
    "utf-8",
  );

  const readmeTemplate = await readTemplate("unity/README_UnityImport.template.md");
  const readmeContent = renderTemplate(readmeTemplate, {
    PROJECT_NAME: state.projectName,
    DISPLAY_NAME: state.displayName,
    MATERIAL_NAME: materialName,
    SHADER_NAME: state.unity.shaderName,
  });
  const readmeRel = "unity/README_UnityImport.md";
  await fs.writeFile(path.join(projectRoot, readmeRel.split("/").join(path.sep)), readmeContent, "utf-8");

  state.unity.exportedAt = new Date().toISOString();

  return {
    exportRoot: "unity/",
    files: [shaderRel, hlslRel, materialRel, importerRel, readmeRel],
  };
}

export { FALLBACK_HLSL };
