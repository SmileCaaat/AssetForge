# Unity 导入说明 — {{DISPLAY_NAME}} ({{PROJECT_NAME}})

由 AssetManagerTools Material Lab 自动生成。

## 文件清单

- `shaders/ToonURP.shader` — URP Toon Shader（{{SHADER_NAME}}）
- `shaders/Generated/ToonCore.generated.hlsl` — Toon 核心 HLSL
- `materials/{{MATERIAL_NAME}}.material.json` — 材质参数
- `importer/AssetManagerMaterialImporter.cs` — Unity Editor 导入脚本

## 导入步骤

1. 将整个 `unity/` 文件夹复制到 Unity 项目的 `Assets/` 下（或与本项目 `textures/`、`exports/` 保持相对路径一致）。
2. 将 `importer/AssetManagerMaterialImporter.cs` 放入 `Assets/Editor/`。
3. 在 Unity 菜单选择 **Asset Manager → Import Material From JSON**。
4. 选择 `materials/{{MATERIAL_NAME}}.material.json`。
5. 在 Scene 中创建材质并指定贴图；Normal 贴图请在 Import Settings 中设为 **Normal Map**。
6. 在 Unity 中人工验收 Shader 编译与画面效果。

## 贴图路径

JSON 中的贴图路径相对于 Blender 生产项目根目录。若 Unity 项目结构不同，请在导入后手动重新指定贴图。

## 验收建议

- Shader 能否编译无报错
- BaseColor / RampSteps / ShadowStrength / Rim 参数是否生效
- MetallicSmoothness 通道是否正确（R=Metallic, A=Smoothness）
