# AssetManagerTools：Material Lab / Slang-URP 导出模块开发说明

仓库地址：<https://github.com/SmileCaaat/AssetManagerTools>

本文件用于指导 AI Coding 工具在现有仓库上进行增量开发。不要重写项目，不要改变现有工作区逻辑，不要破坏现有 ConceptWorkspace / BlenderWorkspace 管理流程。开发目标是在 AssetManagerTools 内增加一个 `Material Lab` 模块，用于在网页端预览 Lowpoly / Toon / URP 风格化材质，并导出 Unity URP 可用的 Shader、HLSL、材质参数 JSON 与导入脚本。

相关外部工具与文档：

- Slang 官方仓库：<https://github.com/shader-slang/slang>
- Slang 编译说明：<https://shader-slang.org/slang/user-guide/compiling>
- Unity URP Shader 编写文档：<https://docs.unity3d.com/Manual/urp/writing-custom-shaders-urp.html>

---

## 零、实现状态（同步仓库，请以此为准）

> **最后更新：2026-06-16** · 仓库：`main` 分支拉取后可见本段。  
> 在另一台电脑：`git pull` 或运行 `update.bat` 即可同步本文与代码。

### 总览

| 阶段 | 状态 | 说明 |
|------|------|------|
| **阶段 A** — Material Lab MVP（无 Slang） | **已完成** | 可日常使用 |
| **阶段 C** — 导出体验（部分） | **已完成** | 一键导出 `unity/`、检查器、打开导出目录 |
| **阶段 B** — Slang `slangc` HLSL 编译 | **未实现** | 见下文「后续阶段」 |
| **阶段 D** — 预览精调 | **未实现** | Normal 参与光照、Outline Pass、Matcap 视觉等待做 |

### 已实现（阶段 A + 部分 C）

**入口与 UI**

- 生产视图工具栏 **「材质实验室」** → 大型 Modal（三栏：贴图槽 / 3D 预览 / 参数面板）
- 仅生产侧可用；切换项目时自动关闭 Modal

**数据与 API**（`server/routes/materialLab.ts` 等）

- `GET/PUT /api/projects/:id/material-lab` — 读写 `.asset-manager/material_lab.json`
- 不存在时根据 `blender_texture_tags.json` 自动生成默认状态
- 项目目录缺失时返回空状态 + `warning`，不抛 500

**贴图槽**

- 自动匹配 BaseColor、Normal、MetallicSmoothness（按文件名）、AO、Emission
- **「合并 Metallic + Roughness」** — 独立功能，生成 `T_<Name>_MetallicSmoothness.png`（R=Metallic，A=Smoothness）
- 「重新匹配」按钮

**网页预览（Three.js 手写 GLSL，非 Slang）**

- 加载 `exports/` 下 FBX（无则显示默认球体）
- BaseColor 贴图 + Toon 色阶（RampSteps / ShadowStrength）
- Rim Light 参数可调并实时预览
- BaseColorTint / Saturation / Value / Contrast

**参数面板（已持久化到 JSON，部分仅参数无完整视觉）**

- MatcapStrength、OutlineEnabled / Width / Color — **已写入 JSON，预览端未完整呈现 Matcap/描边 Pass**

**Unity 导出**

- `POST .../material-lab/export-unity` → `<生产项目>/unity/`
- `shaders/ToonURP.shader`
- `shaders/Generated/ToonCore.generated.hlsl` — **内置 fallback HLSL**（非 Slang 编译产物）
- `materials/M_<项目名>.material.json`
- `importer/AssetManagerMaterialImporter.cs`
- `README_UnityImport.md`
- **Unity 侧需人工验收** Shader 编译与画面

**规范检查**

- `POST .../material-lab/check` — BaseColor/Normal/MetallicSmoothness、分辨率、source 误用等

**代码位置**

```text
server/routes/materialLab.ts
server/services/materialLabService.ts
server/services/metallicSmoothnessMerge.ts
server/services/materialChecker.ts
server/services/unityShaderExporter.ts
server/templates/unity/
client/src/material-lab/
```

### 未实现 — 阶段 B（Slang）

以下在原始规划中存在，**当前代码库尚未接入**：

- `tools/slang/` 与 `slangc` 检测
- `server/services/slangCompiler.ts`
- `POST .../material-lab/compile-slang`
- `server/templates/slang/*.slang` 源文件与真实编译输出
- 导出时「先编译 Slang，失败再 fallback」的完整流程（现仅始终写 fallback HLSL）
- 前端 Export 面板中的 Slang 编译状态 / stderr 展示

### 未实现 — 阶段 D（预览接近 Unity）

以下**留作后续**，不要在 issue/PR 中误以为已完成：

- **Normal Map 参与 Toon 光照**（预览 Shader 未采样 Normal）
- **Outline Pass**（Unity Shader 仅 ForwardLit 单 Pass；预览无描边第二 Pass）
- **Matcap 视觉**（参数可存，预览未贴 Matcap 纹理）
- Three.js 预览与 Slang 核心逻辑对齐
- WebGPU / WGSL 实验预览

### 其它已合并到主线的相关改动（非 Material Lab 专属）

- FBX 多动画 clip 切换预览（`ModelViewer`）
- `update.bat` / `update.ps1` — Git 拉取 + 依赖更新
- 快速切换项目时的加载竞态修复、缺失目录容错
- 开发模式 API 在 Vite 代理不可用时可回退 `localhost:3456`

### 给 AI / 下一台电脑的接续说明

1. **不要重做阶段 A**；从 **阶段 B（Slang）** 或 **阶段 D（预览）** 增量开发。
2. 开发前阅读本文「零、实现状态」确认边界。
3. 完成阶段 B 后更新本表，把「未实现」改为「已完成」并注明 commit 日期。

---

## 一、当前项目定位

`AssetManagerTools` 是一个本地网页资产管理器。现有功能已经包括：

- 管理 `ConceptWorkspace` 与 `BlenderWorkspace`
- 概念侧资产标记：立绘、多视图、高模、低模
- 生产侧贴图标记：`BaseColor`、`Normal`、`AO`、`Roughness`、`Metallic`、`Height`、`Emission` 等
- FBX 预览
- 图片预览、镜像、分割、尺寸转换
- 本地 Express API
- React + Vite + Three.js 前端
- 工作区与项目关系写入 JSON

本次开发不另起新项目，而是在该仓库内增加：

```text
Material Lab
├─ 当前生产项目材质预览
├─ 自动读取贴图标记
├─ Toon / Matcap / Rim / Outline 参数面板
├─ Slang 核心 Shader 编译
├─ Unity URP Shader 模板导出
├─ material_lab.json 参数保存
└─ Unity 导入脚本生成
```

---

## 二、核心开发原则

### 不要做的事情

不要重构整个仓库。

不要把 Slang 编译器塞进浏览器前端。

不要试图在网页中完整复刻 Unity URP 渲染管线。

不要直接生成 Unity `.mat` YAML 资产，除非后续明确实现 GUID / meta / shader 引用管理。

不要第一版就实现完整 PBR、透明材质、多光源、Deferred、Shader Graph 互转、复杂 ShadowCaster。

### 必须做的事情

保持现有目录结构和 API 兼容。

所有新增功能应作为 `Material Lab` 独立模块挂载。

Slang 只作为本地开发期 / 导出期编译器使用。

网页端预览可以近似 Unity 效果，但最终导出文件必须能被 Unity URP 项目导入和使用。

所有材质参数必须保存为机器可读 JSON。

所有导出文件必须落在当前生产项目目录下，不污染概念侧目录。

---

## 三、推荐最终产品形态

产品名称建议：

```text
AssetManagerTools Material Lab
```

一句话定义：

```text
面向 Lowpoly / Toon 角色资产的本地网页材质预览与 Unity URP 导出模块。
```

核心工作流：

```text
打开 AssetManagerTools
↓
选择已有总工作区
↓
进入某个 Blender 生产项目
↓
点击“材质实验室”
↓
自动加载当前项目 FBX 与已标记贴图
↓
调整 Toon / Rim / Matcap / Outline 参数
↓
保存 material_lab.json
↓
导出 Unity URP 材质包
↓
在 Unity 中导入 shader、hlsl、贴图和参数
```

---

## 四、现有仓库结构参考

当前仓库结构大致如下：

```text
AssetManagerTools/
├── assets/
├── client/
│   └── public/
├── server/
├── data/
├── Asset_Pipeline_Standard.md
├── README.md
├── package.json
├── package-lock.json
├── start.bat
├── start.ps1
├── create-launcher.bat
└── create-launcher.ps1
```

当前工作区结构大致如下：

```text
<用户选择的根目录>/
├── workspace.meta.json
├── ConceptWorkspace/
│   └── <项目名>/
│       ├── .asset-manager/
│       │   └── concept_tags.json
│       └── ...
└── BlenderWorkspace/
    ├── projects/
    │   └── <项目名>/
    │       ├── .asset-manager/
    │       │   └── blender_texture_tags.json
    │       ├── textures/
    │       │   ├── source/
    │       │   ├── T_<项目名>_BaseColor.png
    │       │   ├── T_<项目名>_Normal.png
    │       │   └── T_<项目名>_MetallicSmoothness.png
    │       ├── exports/
    │       │   └── SM_<项目名>.fbx
    │       ├── renders/
    │       ├── references/
    │       └── ...
    ├── assets/
    ├── docs/
    └── tools/
```

本次新增功能应继续以 `BlenderWorkspace/projects/<项目名>/` 为核心，不应改变现有 ConceptWorkspace 的标记机制。

---

## 五、新增目录结构

在仓库内新增如下结构：

```text
AssetManagerTools/
├── server/
│   ├── routes/
│   │   └── materialLab.ts
│   ├── services/
│   │   ├── materialLabService.ts
│   │   ├── slangCompiler.ts
│   │   ├── unityShaderExporter.ts
│   │   └── materialChecker.ts
│   └── templates/
│       ├── unity/
│       │   ├── ToonURP.template.shader
│       │   ├── LitApproxURP.template.shader
│       │   └── AssetManagerMaterialImporter.template.cs
│       └── slang/
│           ├── ToonCore.slang
│           ├── RimLight.slang
│           ├── Matcap.slang
│           └── Common.slang
│
├── client/
│   └── src/
│       ├── material-lab/
│       │   ├── MaterialLabPage.tsx
│       │   ├── MaterialPreviewCanvas.tsx
│       │   ├── MaterialParamPanel.tsx
│       │   ├── TextureSlotPanel.tsx
│       │   ├── ExportPanel.tsx
│       │   ├── MaterialCheckPanel.tsx
│       │   ├── materialLabTypes.ts
│       │   └── materialLabApi.ts
│       └── shaders/
│           ├── previewToon.vert.glsl
│           └── previewToon.frag.glsl
│
└── tools/
    └── slang/
        ├── README.md
        ├── win-x64/
        │   └── slangc.exe
        ├── linux-x64/
        │   └── slangc
        ├── linux-arm64/
        │   └── slangc
        └── macos-arm64/
            └── slangc
```

说明：

- `tools/slang/` 第一版可以只放当前平台需要的 `slangc`。
- 如果没有找到本地 `slangc`，后端接口应返回明确错误，而不是导致服务崩溃。
- 不要强制把所有平台二进制文件提交到仓库；可以只保留目录说明和自动检测逻辑。
- 若后续仓库体积变大，可以改为用户手动下载 Slang 并在配置里指定路径。

---

## 六、生产项目内新增文件结构

在每个 Blender 生产项目中新增：

```text
BlenderWorkspace/projects/<项目名>/
├── .asset-manager/
│   ├── blender_texture_tags.json
│   └── material_lab.json
├── unity/
│   ├── shaders/
│   │   ├── ToonURP.shader
│   │   └── Generated/
│   │       └── ToonCore.generated.hlsl
│   ├── materials/
│   │   └── M_<项目名>.material.json
│   ├── importer/
│   │   └── AssetManagerMaterialImporter.cs
│   └── README_UnityImport.md
└── ...
```

`.asset-manager/material_lab.json` 是工具内部状态文件。  
`unity/` 是给 Unity 使用的导出包。  
两个目录不要混用。

---

## 七、Material Lab 数据结构

新增文件：

```text
<生产项目>/.asset-manager/material_lab.json
```

推荐结构：

```json
{
  "version": 1,
  "projectName": "Punchgob",
  "displayName": "庞哥布",
  "shaderType": "toon_urp",
  "preview": {
    "modelPath": "exports/SM_Punchgob.fbx",
    "cameraMode": "front",
    "background": "checker"
  },
  "textures": {
    "baseColor": {
      "path": "textures/T_Punchgob_BaseColor.png",
      "unityProperty": "_BaseMap",
      "colorSpace": "sRGB"
    },
    "normal": {
      "path": "textures/T_Punchgob_Normal.png",
      "unityProperty": "_BumpMap",
      "colorSpace": "Non-Color"
    },
    "metallicSmoothness": {
      "path": "textures/T_Punchgob_MetallicSmoothness.png",
      "unityProperty": "_MetallicGlossMap",
      "colorSpace": "Non-Color"
    },
    "ao": {
      "path": "",
      "unityProperty": "_OcclusionMap",
      "colorSpace": "Non-Color"
    },
    "emission": {
      "path": "",
      "unityProperty": "_EmissionMap",
      "colorSpace": "sRGB"
    }
  },
  "params": {
    "baseColorTint": [1, 1, 1, 1],
    "baseSaturation": 1.35,
    "baseValue": 1.05,
    "contrast": 0.15,
    "rampSteps": 3,
    "shadowStrength": 0.45,
    "rimColor": [1.0, 0.82, 0.55, 1.0],
    "rimPower": 4.0,
    "rimIntensity": 2.5,
    "matcapStrength": 0.0,
    "outlineEnabled": true,
    "outlineWidth": 0.015,
    "outlineColor": [0, 0, 0, 1]
  },
  "slang": {
    "enabled": true,
    "source": "server/templates/slang/ToonCore.slang",
    "lastCompiledAt": "",
    "generatedHlsl": "unity/shaders/Generated/ToonCore.generated.hlsl"
  },
  "unity": {
    "shaderName": "AssetManagerTools/ToonURP",
    "renderPipeline": "URP",
    "surfaceType": "Opaque",
    "exportedAt": ""
  }
}
```

要求：

- 所有路径使用相对生产项目目录的路径。
- 不要写绝对路径进 `material_lab.json`。
- 如果贴图不存在，保留空字符串并在 UI 中显示缺失状态。
- `version` 必须保留，后续迁移用。

---

## 八、后端 API 设计

新增路由文件：

```text
server/routes/materialLab.ts
```

挂载到现有 Express 应用中，路径建议：

```text
/api/projects/:id/material-lab
```

接口设计如下。

### 读取 Material Lab 状态

```http
GET /api/projects/:id/material-lab
```

行为：

- 根据项目 ID 找到生产项目路径。
- 读取 `.asset-manager/material_lab.json`。
- 如果不存在，则根据 `blender_texture_tags.json` 自动生成默认状态。
- 返回当前 FBX、贴图槽、参数、检查结果。

返回：

```json
{
  "ok": true,
  "state": {},
  "warnings": []
}
```

### 保存 Material Lab 状态

```http
PUT /api/projects/:id/material-lab
Content-Type: application/json
```

行为：

- 校验 JSON。
- 写入 `.asset-manager/material_lab.json`。
- 不直接导出 Unity 文件。

返回：

```json
{
  "ok": true,
  "savedPath": ".asset-manager/material_lab.json"
}
```

### 编译 Slang

```http
POST /api/projects/:id/material-lab/compile-slang
Content-Type: application/json
```

行为：

- 检测 `slangc` 是否存在。
- 读取 `server/templates/slang/ToonCore.slang` 或当前配置指定源文件。
- 编译生成 HLSL。
- 输出到 `unity/shaders/Generated/ToonCore.generated.hlsl`。
- 第一版不强制生成 WGSL / GLSL；网页预览可以继续使用手写 GLSL 近似预览。
- 如果 Slang 编译失败，应返回 stderr 给前端展示。

返回：

```json
{
  "ok": true,
  "outputs": {
    "hlsl": "unity/shaders/Generated/ToonCore.generated.hlsl"
  },
  "log": ""
}
```

错误返回：

```json
{
  "ok": false,
  "error": "SLANGC_NOT_FOUND",
  "message": "未找到 slangc，请在 tools/slang/<platform>/ 中放置 slangc，或在配置中指定路径。"
}
```

### 导出 Unity URP 材质包

```http
POST /api/projects/:id/material-lab/export-unity
Content-Type: application/json
```

行为：

- 确保 `material_lab.json` 已存在。
- 生成 `unity/shaders/ToonURP.shader`。
- 确保 `unity/shaders/Generated/ToonCore.generated.hlsl` 存在；如果没有，尝试编译 Slang；如果没有 Slang，则生成 fallback HLSL。
- 生成 `unity/materials/M_<项目名>.material.json`。
- 生成 `unity/importer/AssetManagerMaterialImporter.cs`。
- 生成 `unity/README_UnityImport.md`。
- 不复制贴图，默认使用项目内原贴图相对路径；如果需要 Unity 独立包，后续另做 `copyTextures` 选项。

返回：

```json
{
  "ok": true,
  "exportRoot": "unity/",
  "files": [
    "unity/shaders/ToonURP.shader",
    "unity/shaders/Generated/ToonCore.generated.hlsl",
    "unity/materials/M_Punchgob.material.json",
    "unity/importer/AssetManagerMaterialImporter.cs",
    "unity/README_UnityImport.md"
  ]
}
```

### 检查 Unity 贴图规范

```http
POST /api/projects/:id/material-lab/check
```

行为：

检查当前生产项目是否满足 Unity 导入要求：

- BaseColor 是否存在
- Normal 是否存在
- MetallicSmoothness 是否存在
- 是否存在未打包的 Roughness / Metallic
- 是否存在 AO 但未烘焙进 BaseColor
- Normal 是否命名规范
- BaseColor 分辨率是否高于 4096 或低于 512
- MetallicSmoothness 是否为 Non-Color 标记
- 是否存在 source 贴图被误用为最终材质贴图

返回：

```json
{
  "ok": true,
  "items": [
    {
      "level": "ok",
      "code": "BASECOLOR_FOUND",
      "message": "BaseColor 已找到。"
    },
    {
      "level": "warning",
      "code": "METALLIC_SMOOTHNESS_MISSING",
      "message": "未找到 MetallicSmoothness；如果该角色不使用金属/光滑度，可忽略。"
    }
  ]
}
```

---

## 九、Slang 编译服务

新增文件：

```text
server/services/slangCompiler.ts
```

职责：

- 检测当前平台。
- 找到合适的 `slangc`。
- 使用 `child_process.spawn` 调用编译命令。
- 捕获 stdout / stderr。
- 编译失败时不抛出未处理异常，而是返回结构化错误。
- 所有路径必须使用 `path.resolve` 和 `path.normalize`。
- Windows 路径必须兼容空格。

推荐平台检测：

```ts
function getPlatformKey() {
  const p = process.platform;
  const a = process.arch;

  if (p === "win32" && a === "x64") return "win-x64";
  if (p === "linux" && a === "x64") return "linux-x64";
  if (p === "linux" && a === "arm64") return "linux-arm64";
  if (p === "darwin" && a === "arm64") return "macos-arm64";
  if (p === "darwin" && a === "x64") return "macos-x64";

  return `${p}-${a}`;
}
```

推荐编译策略：

```text
.slang
↓
HLSL
↓
Unity ShaderLab include
```

第一版只实现 HLSL 输出即可。WGSL / GLSL 输出放到后续阶段。

编译命令形式示意：

```bash
slangc ToonCore.slang -target hlsl -profile sm_5_0 -o ToonCore.generated.hlsl
```

实际参数要以当前 Slang 版本测试为准。AI Coding 工具在实现时应通过小型测试文件验证 `slangc` 参数，而不是硬编码未经验证的命令。

---

## 十、Slang 源文件设计

新增：

```text
server/templates/slang/Common.slang
server/templates/slang/ToonCore.slang
server/templates/slang/RimLight.slang
server/templates/slang/Matcap.slang
```

第一版只需要 `Common.slang` 和 `ToonCore.slang` 能工作。

`ToonCore.slang` 示例：

```hlsl
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
```

命名规则：

- 所有函数加 `AMT_` 前缀，避免与 Unity / URP include 内部函数冲突。
- Slang 文件只写核心算法，不写完整 Unity Pass。
- Unity 相关宏、`GetMainLight()`、`TransformObjectToWorld()` 不要写进 Slang 核心文件。
- Unity 相关代码由 `.shader` 模板负责。

---

## 十一、Unity Shader 模板

新增：

```text
server/templates/unity/ToonURP.template.shader
```

职责：

- 提供完整 Unity ShaderLab 壳。
- 使用 URP include。
- include 生成的 `Generated/ToonCore.generated.hlsl`。
- 暴露 Unity 材质属性。
- 第一版只做 `UniversalForward` Pass。
- Outline 可以先作为参数导出，实际描边 Pass 放到第二版。

模板应生成：

```text
unity/shaders/ToonURP.shader
```

Shader 名称：

```text
AssetManagerTools/ToonURP
```

模板内容示意：

```hlsl
Shader "AssetManagerTools/ToonURP"
{
    Properties
    {
        _BaseMap ("Base Map", 2D) = "white" {}
        _BaseColorTint ("Base Color Tint", Color) = (1,1,1,1)

        _BumpMap ("Normal Map", 2D) = "bump" {}
        _BumpScale ("Normal Strength", Float) = 1

        _RampSteps ("Ramp Steps", Float) = 3
        _ShadowStrength ("Shadow Strength", Range(0,1)) = 0.45

        _RimColor ("Rim Color", Color) = (1,0.82,0.55,1)
        _RimPower ("Rim Power", Float) = 4
        _RimIntensity ("Rim Intensity", Float) = 2.5

        _OutlineWidth ("Outline Width", Float) = 0.015
        _OutlineColor ("Outline Color", Color) = (0,0,0,1)
    }

    SubShader
    {
        Tags
        {
            "RenderPipeline" = "UniversalPipeline"
            "RenderType" = "Opaque"
            "Queue" = "Geometry"
        }

        Pass
        {
            Name "ForwardLit"
            Tags { "LightMode" = "UniversalForward" }

            HLSLPROGRAM

            #pragma vertex vert
            #pragma fragment frag

            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Lighting.hlsl"
            #include "Generated/ToonCore.generated.hlsl"

            TEXTURE2D(_BaseMap);
            SAMPLER(sampler_BaseMap);

            float4 _BaseColorTint;
            float _RampSteps;
            float _ShadowStrength;
            float4 _RimColor;
            float _RimPower;
            float _RimIntensity;

            struct Attributes
            {
                float4 positionOS : POSITION;
                float3 normalOS : NORMAL;
                float2 uv : TEXCOORD0;
            };

            struct Varyings
            {
                float4 positionHCS : SV_POSITION;
                float3 positionWS : TEXCOORD0;
                float3 normalWS : TEXCOORD1;
                float2 uv : TEXCOORD2;
            };

            Varyings vert(Attributes input)
            {
                Varyings output;
                output.positionWS = TransformObjectToWorld(input.positionOS.xyz);
                output.positionHCS = TransformWorldToHClip(output.positionWS);
                output.normalWS = TransformObjectToWorldNormal(input.normalOS);
                output.uv = input.uv;
                return output;
            }

            half4 frag(Varyings input) : SV_Target
            {
                float4 baseSample = SAMPLE_TEXTURE2D(_BaseMap, sampler_BaseMap, input.uv);
                float3 baseColor = baseSample.rgb * _BaseColorTint.rgb;

                Light mainLight = GetMainLight();
                float3 normalWS = normalize(input.normalWS);
                float3 lightDirWS = normalize(mainLight.direction);
                float3 viewDirWS = normalize(GetWorldSpaceViewDir(input.positionWS));

                ToonParams p;
                p.baseColor = baseColor;
                p.rampSteps = _RampSteps;
                p.shadowStrength = _ShadowStrength;
                p.rimPower = _RimPower;
                p.rimIntensity = _RimIntensity;
                p.rimColor = _RimColor.rgb;

                float3 color = AMT_EvaluateToon(normalWS, lightDirWS, viewDirWS, p);

                return half4(color, baseSample.a * _BaseColorTint.a);
            }

            ENDHLSL
        }
    }

    FallBack "Hidden/Universal Render Pipeline/FallbackError"
}
```

注意：

- 上面是模板示意，AI Coding 实现时应以实际 Unity URP 编译结果为准。
- 第一版不需要完全 SRP Batcher 最优，但属性命名要稳定。
- 第二版再补 `ShadowCaster` / `DepthOnly` / `Outline` Pass。

---

## 十二、Unity material.json 导出

生成文件：

```text
unity/materials/M_<项目名>.material.json
```

结构：

```json
{
  "version": 1,
  "name": "M_Punchgob",
  "shader": "AssetManagerTools/ToonURP",
  "textures": {
    "_BaseMap": "textures/T_Punchgob_BaseColor.png",
    "_BumpMap": "textures/T_Punchgob_Normal.png",
    "_MetallicGlossMap": "textures/T_Punchgob_MetallicSmoothness.png"
  },
  "colors": {
    "_BaseColorTint": [1, 1, 1, 1],
    "_RimColor": [1, 0.82, 0.55, 1],
    "_OutlineColor": [0, 0, 0, 1]
  },
  "floats": {
    "_RampSteps": 3,
    "_ShadowStrength": 0.45,
    "_RimPower": 4,
    "_RimIntensity": 2.5,
    "_OutlineWidth": 0.015
  }
}
```

说明：

- Unity 侧导入脚本读取此 JSON。
- 不直接生成 `.mat`，避免 GUID 与 Unity 序列化问题。
- 后续可以在 Unity Editor 中通过脚本生成 `.mat`。

---

## 十三、Unity 导入脚本模板

新增模板：

```text
server/templates/unity/AssetManagerMaterialImporter.template.cs
```

生成：

```text
unity/importer/AssetManagerMaterialImporter.cs
```

用途：

- 放入 Unity 项目的 `Assets/Editor/`。
- 读取 `M_<项目名>.material.json`。
- 查找 Shader。
- 创建 Material。
- 根据 JSON 设置颜色、浮点、贴图。
- 保存到 `Assets/Materials/M_<项目名>.mat`。

第一版允许用户手动选择 JSON 文件。

脚本功能要求：

- 如果 Shader 找不到，输出明确错误。
- 如果贴图找不到，输出 warning，而不是终止。
- Normal 贴图需要提示用户在 Unity Import Settings 中设为 Normal Map；自动设置可作为第二版。
- 材质生成路径不存在时自动创建。

---

## 十四、前端 UI 设计

新增页面：

```text
client/src/material-lab/MaterialLabPage.tsx
```

入口位置：

在生产视图中增加按钮：

```text
[材质实验室]
[生成 Unity 材质包]
[检查 Unity 贴图规范]
```

不要在概念视图显示这些按钮，或显示为禁用状态并提示“仅生产项目可用”。

### MaterialLabPage 布局

推荐三栏：

```text
┌────────────────────────────────────────────────────────────┐
│ 顶部：项目名 / 保存 / 编译 Slang / 导出 Unity / 返回        │
├───────────────┬──────────────────────────┬─────────────────┤
│ 贴图槽         │ 3D 预览画布               │ 参数面板          │
│ BaseColor      │ FBX / GLB / fallback cube │ Toon             │
│ Normal         │ 灯光 / 视角 / 背景         │ Rim              │
│ MetallicSmooth │                           │ Matcap           │
│ AO             │                           │ Outline          │
└───────────────┴──────────────────────────┴─────────────────┘
```

### MaterialPreviewCanvas

职责：

- 加载当前项目的 FBX。
- 如果没有 FBX，显示默认球体 / 立方体。
- 加载贴图槽中的图片。
- 使用 Three.js `ShaderMaterial` 或 `MeshStandardMaterial` 近似预览 Toon 效果。
- 参数变化实时更新材质。
- 不要依赖 Slang 浏览器编译。
- 第一版可用手写 GLSL 实现近似预览。

### TextureSlotPanel

显示：

- BaseColor
- Normal
- MetallicSmoothness
- AO
- Emission
- Matcap，可选

每个槽位显示：

```text
类型
文件名
是否存在
颜色空间建议
Unity 属性名
```

支持：

- 点击槽位定位文件树中的文件
- 手动替换贴图路径
- 一键根据 `blender_texture_tags.json` 重新匹配

### MaterialParamPanel

参数：

```text
BaseColorTint
BaseSaturation
BaseValue
Contrast
RampSteps
ShadowStrength
RimColor
RimPower
RimIntensity
MatcapStrength
OutlineEnabled
OutlineWidth
OutlineColor
```

要求：

- 修改后状态保存在前端 state。
- 点击保存才写入 `.asset-manager/material_lab.json`。
- 页面切换前如有未保存修改，应提示。

### ExportPanel

显示：

- Slang 状态
- HLSL 是否生成
- Unity Shader 是否生成
- material.json 是否生成
- 导入脚本是否生成
- 最近导出时间
- 错误日志

---

## 十五、前端 API 封装

新增：

```text
client/src/material-lab/materialLabApi.ts
```

函数：

```ts
export async function fetchMaterialLabState(projectId: string): Promise<MaterialLabStateResponse>;

export async function saveMaterialLabState(
  projectId: string,
  state: MaterialLabState
): Promise<SaveMaterialLabResponse>;

export async function compileSlang(projectId: string): Promise<CompileSlangResponse>;

export async function exportUnityMaterialPackage(projectId: string): Promise<ExportUnityResponse>;

export async function checkUnityTextureStandard(projectId: string): Promise<MaterialCheckResponse>;
```

新增类型文件：

```text
client/src/material-lab/materialLabTypes.ts
```

所有响应都必须包含：

```ts
ok: boolean;
message?: string;
error?: string;
```

---

## 十六、材质检查规则

新增：

```text
server/services/materialChecker.ts
```

检查当前生产项目：

### 必须检查

- `textures/` 是否存在
- `.asset-manager/blender_texture_tags.json` 是否存在
- BaseColor 是否存在
- Normal 是否存在
- 是否存在 `T_<项目名>_BaseColor`
- 是否存在 `T_<项目名>_Normal`
- `textures/source/` 是否存在
- 是否误把 `textures/source/` 下的贴图作为最终贴图
- 是否存在 Roughness 与 Metallic 但没有 MetallicSmoothness
- BaseColor / Normal 是否超过 4096
- BaseColor / Normal 是否低于 512

### 检查结果级别

```ts
type CheckLevel = "ok" | "info" | "warning" | "error";
```

### 检查结果结构

```ts
interface MaterialCheckItem {
  level: CheckLevel;
  code: string;
  message: string;
  file?: string;
  suggestion?: string;
}
```

---

## 十七、阶段拆分

> **落地状态见文首「零、实现状态」**。下表为原始规划；阶段 A 与部分 C **已完成**，阶段 B / D **未做**。

### 阶段 A：无 Slang 的 Material Lab MVP — **已完成（2026-06-16）**

目标：

- UI 能打开
- 能读当前项目贴图标记
- 能显示贴图槽
- 能预览 FBX + BaseColor
- 能调 Toon 参数
- 能保存 `.asset-manager/material_lab.json`
- 能导出 `unity/materials/M_<项目名>.material.json`
- 能生成静态 `ToonURP.shader` 模板

额外已实现（原 A 未写）：Metallic+Roughness 合并、贴图规范检查、完整 `unity/` 导出包。

不要求（仍不要求）：

- Slang 编译
- WGSL / GLSL 交叉编译
- 完整 Unity 阴影
- Outline Pass

### 阶段 B：加入 Slang HLSL 编译 — **未实现（后续）**

目标：

- 后端找到 `slangc`
- 编译 `ToonCore.slang`
- 输出 `ToonCore.generated.hlsl`
- Unity Shader include 生成文件
- 编译失败前端能显示错误

不要求：

- 浏览器端运行 Slang
- WGSL 输出
- 热编译预览

### 阶段 C：导出体验完善 — **部分已完成**

已完成：

- 一键生成完整 `unity/` 目录
- Unity 导入说明 README
- Unity Editor 导入脚本模板
- 检查结果面板
- 打开导出目录 API

未做 / 随阶段 B 补齐：

- Slang 编译状态与 HLSL 生成时间戳联动

### 阶段 D：网页预览接近 Unity — **未实现（后续）**

目标：

- Three.js shader 与 Slang 核心逻辑参数对齐
- 支持 Rim / Matcap / Outline 视觉近似
- 可选导出 WGSL / GLSL
- WebGPU 预览作为实验功能

当前：Rim + Toon 已有近似预览；**Normal Map 光照、Outline Pass、Matcap 视觉** 仍属本阶段待办。

---

## 十八、验收标准

### 功能验收

打开任意已有生产项目，页面出现“材质实验室”按钮。

点击后可进入 `MaterialLabPage`。

页面能读取该项目的 `blender_texture_tags.json`，并自动填入贴图槽。

没有 `material_lab.json` 时能自动生成默认状态。

修改参数后点击保存，项目目录出现：

```text
.asset-manager/material_lab.json
```

点击“检查 Unity 贴图规范”，能返回清晰的 ok / warning / error 结果。

点击“导出 Unity 材质包”，项目目录出现：

```text
unity/shaders/ToonURP.shader
unity/shaders/Generated/ToonCore.generated.hlsl
unity/materials/M_<项目名>.material.json
unity/importer/AssetManagerMaterialImporter.cs
unity/README_UnityImport.md
```

如果没有 Slang 编译器，导出不应完全失败，应使用 fallback HLSL 或返回可理解提示。

### 代码验收

新增模块应集中在：

```text
server/routes/materialLab.ts
server/services/materialLabService.ts
server/services/slangCompiler.ts
server/services/unityShaderExporter.ts
server/services/materialChecker.ts
client/src/material-lab/
```

不要把大量 Material Lab 逻辑塞进已有大组件。

不要删除或重命名现有 API。

不要破坏 `npm run setup`、`npm run dev`、`start.bat`、`start.ps1`。

TypeScript 类型应清晰，避免大面积 `any`。

所有文件路径必须经过安全校验，不能允许前端传入任意绝对路径后读写系统文件。

### Unity 验收

在 Unity URP 项目中手动复制 `unity/` 导出内容后：

- Shader 文件能被 Unity 识别。
- Shader 名称为 `AssetManagerTools/ToonURP`。
- 创建材质时能选择该 Shader。
- BaseColor 参数能生效。
- RampSteps / ShadowStrength / Rim 参数能影响画面。
- 如果 Slang 生成 HLSL 存在，Shader include 路径正确。

---

## 十九、AI Coding 执行提示

请按增量开发方式执行：

```text
读取现有仓库结构
↓
定位 server 入口与 client 路由/页面结构
↓
新增 Material Lab 后端路由
↓
新增 Material Lab 前端页面
↓
先实现 JSON 状态读写
↓
再实现贴图槽自动匹配
↓
再实现 Three.js 预览
↓
再实现 Unity 导出
↓
最后接入 Slang 编译
```

不得直接提出“大规模重构”。

不得把 Material Lab 写成独立仓库。

不得删除当前已有功能。

每完成一个阶段都应保持项目可启动。

---

## 二十、建议提交顺序

```text
commit 1: add material lab data model and backend state API
commit 2: add material lab frontend page and route entry
commit 3: add texture slot auto mapping from blender_texture_tags.json
commit 4: add basic Three.js toon preview
commit 5: add material_lab.json save/load
commit 6: add Unity shader/material JSON exporter
commit 7: add material checker service and UI panel
commit 8: add Slang compiler service and generated HLSL output
commit 9: add Unity importer template and README export
commit 10: polish error handling and path safety
```

---

## 二十一、后续可扩展方向

稳定后再考虑：

- Outline Pass
- ShadowCaster Pass
- DepthOnly Pass
- Normal Map 正式参与 Toon 光照
- MetallicSmoothness 参与高光控制
- Matcap 贴图槽
- WebGPU / WGSL 预览
- Slang 多 target 输出
- UnityPackage 导出
- 一键复制到 Unity 项目
- 从 Blender 材质节点反向读取 Toon 参数
- 自动生成 `references/Toon_Shader_<项目名>.md`
- 项目质量评分面板
- 批量检查所有角色资产

---

## 二十二、判断标准

本功能的目标不是替代 Unity Editor。

本功能的目标是把角色资产进 Unity 前的材质检查、风格化参数试验、URP Shader 导出前置到 AssetManagerTools 中，减少频繁打开 Unity、切换项目、手动调材质的成本。

只要能做到：

```text
网页中预览 70% 效果
导出 Unity 后可继续精调
参数可追溯
贴图规范可检查
Shader 文件可复用
```

第一版就是成功的。
