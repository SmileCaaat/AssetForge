# 2026-06-19 工作更新：骨骼实验室、地形语义、文件树 UI

本文档用于交接给 Cursor / Codex 后续继续优化。当前重点是：骨骼功能已经纳入 Asset ManagerTools 平台工作流，后续只做优化，不要回退到 ComfyUI 编排。

## 1. 骨骼实验室

已完成：

- 新增角色生产侧 **骨骼实验室**，入口位于生产视图工具栏
- 后端新增原生 rigging API、任务状态、运行时执行器
- 运行路径改为当前角色生产项目：
  - 输入：`<Project>/Rigging/input/`
  - 输出：`<Project>/Rigging/output/`
  - 状态：`<Project>/Rigging/rigging_lab.json`
- 绑定执行链路：
  - `server/routes/rigging.ts`
  - `server/services/riggingService.ts`
  - `server/services/skintokensCliExecutor.ts`
  - `server/scripts/skintokens_runner.py`
- 前端新增：
  - `client/src/rigging/RiggingLabModal.tsx`
  - `client/src/rigging/RigPreviewViewer.tsx`
  - `client/src/rigging/riggingApi.ts`
  - `client/src/rigging/riggingTypes.ts`
- 结果预览支持骨架、关节、骨骼名称、透视显示
- 关节球点击选择已经可用
- 自动绑定运行中不再提前加载结果 FBX，避免 404 导致界面消失
- 增加预览错误边界，FBX 加载失败时不让整个 Modal 崩溃
- 增加清理缓存功能，只清状态和预览缓存，不删除输出 FBX

重要架构约束：

- UI 和业务路径不要出现 ComfyUI 依赖
- README 只保留 SkinTokens 来源说明
- `runtime/rigging/` 是本机运行时，不入 git
- 本机 runtime 需要 Python、Blender、SkinTokens、模型权重和 Qwen 本地模型

## 2. 低模到 Rigging/input 的流程

已调整方向：

- 骨骼不作为独立项目大类，而是角色生产项目下的子流程
- 新建角色生产目录时自动包含 `Rigging/`
- 概念侧标记为 **低模** 的模型应复制一份到生产项目 `Rigging/input/`
- 复制后的低模标记需要保留，便于骨骼实验室默认选择输入模型

后续可继续优化：

- 更明确的“同步低模到骨骼输入”按钮状态
- 当概念低模更新时提示是否覆盖 `Rigging/input`
- 绑定结果确认后，一键整理为 `exports/SM_<Name>.fbx`

## 3. 生产资产标记扩展

生产侧标记已经从单纯贴图类型扩展为更多生产角色：

- 低模
- 骨骼
- SM 模型
- 纹理类型

相关文件：

- `server/productionAssetTags.ts`
- `client/src/lib/productionAssetMarking.ts`
- `server/scanner.ts`
- `server/types.ts`
- `client/src/types.ts`
- `client/src/components/AssetGallery.tsx`
- `client/src/components/AssetGalleryPanel.tsx`

## 4. 地形语义

用户确认：原 `Stage Lab` 在 UI 中叫 **地形语义** 更准确。

已完成：

- 工具栏入口改为 `地形语义`
- Modal 标题和主要文案中文化
- 新建 / 列表 / 语义控制图 / 工作流动作文案中文化
- 内部 `Stage`、`StageLab`、`TerrainWorkspace/stages` 暂时保留，避免破坏已有数据

相关文件：

- `client/src/components/FileToolbar.tsx`
- `client/src/terrain/StageLabModal.tsx`
- `client/src/terrain/StageLabPanels.tsx`
- `client/src/terrain/SemanticMapEditor.tsx`
- `client/src/terrain/StageStatusPanel.tsx`
- `client/src/terrain/StageTexturePanel.tsx`
- `client/src/terrain/stageActions.ts`
- `client/src/terrain/stageWorkflow.ts`
- `client/src/terrain/terrainTypes.ts`
- `client/src/terrain/semanticProcedural.ts`

## 5. 文件树样式

用户不喜欢 `DIR / FILE / IMG / 3D` 文字标签，已改回更直观的图标式样：

- 文件夹：CSS 文件夹图标
- 图片：图片图标
- 3D 模型：立方体图标
- 文档 / 其他文件：纸张图标
- 展开按钮：`▾` / `▸`
- 长文件名做省略处理

相关文件：

- `client/src/components/FileTree.tsx`
- `client/src/styles.css`

注意：后续优化可以继续美化图标，但不要再退回 `DIR / FILE / IMG / 3D` 这类文字标签。

## 6. 中文与 UTF-8

新增：

- `scripts/read-utf8.mjs`

用途：

```bash
node scripts/read-utf8.mjs README.md
node scripts/read-utf8.mjs devplan/Asset_Pipeline_Standard.md
```

原因：

- Windows 终端代码页可能导致中文和树形字符显示乱码
- 文档本身按 UTF-8 存储
- 后续代理读取中文文档时应优先使用该脚本，避免把正常 UTF-8 内容误判为乱码后错误修改

## 7. 本次文档更新

已更新：

- `README.md`
  - 修正生产规范链接
  - 新增骨骼实验室说明
  - Stage Lab UI 名称改为地形语义
  - 新增 UTF-8 读取备注
  - 保留 SkinTokens 来源说明
- `devplan/RIGGING_PLATFORM_RUNTIME.md`
  - 重写为当前原生运行时架构
  - 记录 runtime 路径、环境变量、本机补丁、缓存规则
- `devplan/Asset_Pipeline_Standard.md`
  - 新增 `Rigging/input`、`Rigging/output`、`rigging_lab.json`
  - 新增骨骼实验室输出命名
  - 新增生产资产标记扩展
- `devplan/AssetManagerTools_Terrain_StageLab_AICODING.md`
  - 补充“地形语义”当前 UI 命名与内部 Stage 兼容规则

## 8. 给后续代理的注意事项

- 不要删除或重命名用户本地 `runtime/`，它包含大模型和本机补丁
- 不要把骨骼输出重新写回 `D:\AI-RigLab\ComfyUI\output`
- 不要把骨骼功能改成独立项目目录，它属于角色生产项目
- 不要一次性重命名所有 `Stage*` 内部符号，UI 叫地形语义即可
- 修改中文文档前先用 `scripts/read-utf8.mjs` 确认内容
