# Unity 导入说明 — AssetManagerTools Material Lab

工作区共享 Editor 脚本 + 各角色独立资产包。

## 目录结构

```text
BlenderWorkspace/UnityAssets/
├── Editor/
│   └── AssetManagerMaterialImporter.cs    ← 首次复制到 Unity Assets（只需一次）
├── Mushpig/
│   ├── Models/
│   ├── Textures/
│   ├── Shaders/
│   │   ├── ToonURP.shader
│   │   └── Generated/
│   │       ├── ToonCore.generated.hlsl      ← 角色 Toon 核心
│   │       └── AMTLightingCommon.hlsl       ← 阴影采样公共模块（角色+地形共用）
│   ├── Materials/
│   │   └── M_Mushpig.material.json
│   ├── bundle.manifest.json
│   └── README.md
├── Overview_Terrain/                        ← 地形包结构相同
└── …
```

## 导入 Unity

### 首次

1. 复制 `UnityAssets/Editor/` 到 Unity 的 `Assets/`（任意位置，例如 `Assets/AssetManagerTools/Editor/`）。
2. 等待 Unity 编译，菜单出现 **Asset Manager**。

### 每个角色 / 地形

1. 复制 `UnityAssets/<项目名>/` 到 Unity，例如 `Assets/Characters/Mushpig/` 或 `Assets/Terrain/Overview_Terrain/`。
2. 任选一种导入材质：
   - **Asset Manager → Import Material From JSON…** — 选 `Materials/M_<项目>.material.json`
   - **Asset Manager → Import All Materials In Folder…** — 选项目文件夹或整个 `UnityAssets`
   - Project 窗口右键文件夹 → **Asset Manager → Import Materials In Selected Folder**

生成的 `.mat` 会出现在对应 `Materials/` 目录下。

### 批量（多个角色 / 地形）

将所有文件夹复制到 `Assets/` 后，对父目录执行 **Import All Materials In Folder** 即可遍历所有 `.material.json`。

## 贴图设置

导入器会在赋材质时自动配置（无需手改 Import Settings）：

| Unity 属性 | 自动设置 |
|------------|----------|
| `_BumpMap` / `_NormalMap` | Texture Type = **Normal Map**，sRGB 关闭 |
| `_MetallicGlossMap` / `_OcclusionMap` | sRGB 关闭 |
| `_BaseMap` / `_EmissionMap` | 保持默认 sRGB |

## URP 光照与阴影

### Shader

| 用途 | Shader 名 | 说明 |
|------|-----------|------|
| 角色 | `AssetManagerTools/ToonURP` | Outline + Toon Ramp + Rim + ShadowCaster |
| 地形 | `AssetManagerTools/ToonTerrainURP` | 软 Toon + Albedo 保留 + **接收投射阴影** |

### URP Asset 与场景（必查）

1. **Edit → Project Settings → Graphics** → 点选 **Scriptable Render Pipeline Settings** 里的 URP Asset
2. URP Asset Inspector：
   - **Lighting → Main Light**：Per Pixel，**Cast Shadows** ✓
   - **Shadows → Max Distance**：建议 **≥ 80**
3. 场景 **Directional Light**：Shadow Type = Soft / Hard（不要 No Shadows）
4. **Mesh Renderer**：
   - 角色：**Cast Shadows = On**
   - 地形 / 地面：**Receive Shadows = On**

### 阴影实现（技术说明）

- 公共模块：`Shaders/Generated/AMTLightingCommon.hlsl`
- **主光方向/颜色**：`GetMainLight()`（无 shadowCoord 参数）
- **阴影贴图采样**：片元内 `GetShadowCoord()` → `MainLightRealtimeShadow()`（兼容 Cascade / Screen Space）
- **角色**：ShadowCaster 使用 URP 内置 `ShadowCasterPass.hlsl`
- **地形接收投影**：`(1 - shadowAtten) * _ShadowReceiveStrength` 向 `_CelShadowColor` 混合（非整面乘暗）
- Shader 关键字：`_MAIN_LIGHT_SHADOWS` / `_MAIN_LIGHT_SHADOWS_CASCADE` / `_MAIN_LIGHT_SHADOWS_SCREEN`

### 推荐参数

- 角色：`ShadowReceiveStrength` 0.7、`AmbientStrength` 0.25、`RimLightInfluence` 0.2
- 地形：`ShadowReceiveStrength` **0.7–0.9**（0 = 不接收投影；1 = 投影最深）
- Outline 远景：`Outline Width` 0.01、`Far Width Scale` 0.01、`Fade Start` -20、`Fade End` 25、`Min Width` 0.001

### 阴影排查

| 现象 | 处理 |
|------|------|
| 整面均匀变暗/变亮，无局部投影 | 重新导出并覆盖 `AMTLightingCommon.hlsl` + `ToonTerrainURP.shader`，Project 里 **Reimport Shaders** |
| 完全无阴影 | 查 URP Asset Main Light Shadows、定向光 Cast Shadows、角色 Cast / 地形 Receive |
| 角色有阴影、地形没有 | 确认地形材质 Shader 为 `ToonTerrainURP`，`_ShadowReceiveStrength` > 0 |
| Frame Debugger | 应有 **MainLightShadow** → **Draw Shadow Casters**（含角色网格） |

> **重要**：更新 Shader 时必须同时更新 `Generated/AMTLightingCommon.hlsl`，仅替换 `.shader` 文件不够。
