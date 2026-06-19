# Rigging Platform Runtime

本文件记录 Asset ManagerTools 当前的 **骨骼实验室** 集成方式，供 Cursor / Codex 后续继续开发时对齐架构。

## 当前结论

骨骼实验室已经从 ComfyUI 编排中剥离，作为角色生产侧的原生平台工作流运行：

```txt
Asset ManagerTools
  -> server/routes/rigging.ts
  -> server/services/riggingService.ts
  -> server/services/skintokensCliExecutor.ts
  -> server/scripts/skintokens_runner.py
  -> runtime/rigging/SkinTokens/demo.py
  -> Blender / bpy
  -> <角色生产项目>/Rigging/output/
```

仓库内不再依赖 ComfyUI 的 prompt、output 目录或端口。README 中保留 SkinTokens 来源说明即可，不要在 UI 或业务路径中重新引入 ComfyUI。

## 平台项目路径

骨骼是角色生产流程的一部分，不是新的项目大类。每个角色生产项目自动包含：

```txt
BlenderWorkspace/projects/<ProjectName>/
  Rigging/
    input/              # 待绑定 FBX
    output/             # 绑定完成 FBX
    rigging_lab.json    # 最近任务状态、输入、输出、错误信息
```

概念侧标记为 **低模** 的模型可复制到 `Rigging/input/`。复制后的生产资产标记需要保留低模语义，便于后续自动绑定和标准命名。

## 本机运行时路径

默认运行时根目录：

```txt
C:\Users\JamLew\Desktop\Asset ManagerTools\runtime\rigging\
```

期望结构：

```txt
runtime/
  rigging/
    python/
      python.exe
    SkinTokens/
      demo.py
      src/
      bpy_server.py
    models/
      skintoken/
        experiments/
          articulation_xl_quantization_256_token_4/
            grpo_1400.ckpt
        skin_vae_2_10_32768/
          last.ckpt
      Qwen3-0.6B/
        config.json
    logs/
```

`runtime/` 被 `.gitignore` 忽略，因为它包含 Python 包、Blender 运行时补丁和模型权重。

## 关键环境变量

默认值由后端自动推导；需要排查环境时可手动覆盖：

```txt
AMT_PLATFORM_ROOT=C:\Users\JamLew\Desktop\Asset ManagerTools
AMT_RIGGING_RUNTIME_ROOT=C:\Users\JamLew\Desktop\Asset ManagerTools\runtime\rigging
AMT_SKINTOKENS_ROOT=C:\Users\JamLew\Desktop\Asset ManagerTools\runtime\rigging\SkinTokens
AMT_SKINTOKENS_PYTHON=C:\Users\JamLew\Desktop\Asset ManagerTools\runtime\rigging\python\python.exe
AMT_SKINTOKENS_MODEL_ROOT=C:\Users\JamLew\Desktop\Asset ManagerTools\runtime\rigging\models\skintoken
AMT_SKINTOKENS_QWEN_ROOT=C:\Users\JamLew\Desktop\Asset ManagerTools\runtime\rigging\models\Qwen3-0.6B
AMT_SKINTOKENS_BPY_MODE=headless
AMT_SKINTOKENS_BPY_URL=http://127.0.0.1:18176
AMT_BLENDER_EXE=<本机 Blender 可执行文件路径>
```

当前默认是 `headless`，由平台负责启动 / 调用 Blender 侧能力。端口使用 `18176`，避免与旧 ComfyUI 迁移阶段端口混淆。

## 本机 runtime 必要补丁

这些改动在 `runtime/` 下，不会随 git 推送。换机器或重建 runtime 时需要复核：

- `runtime/rigging/SkinTokens/src/model/tokenrig.py`：Qwen 本地加载应读取 `AMT_SKINTOKENS_QWEN_ROOT`
- `runtime/rigging/SkinTokens/demo.py`：Blender 路径应读取 `AMT_BLENDER_EXE`
- `runtime/rigging/SkinTokens/src/server/spec.py`：默认 bpy 服务端口应为 `18176`

## 前端能力

`client/src/rigging/` 负责骨骼实验室 UI 和预览：

- `RiggingLabModal.tsx`：输入选择、服务检查、自动绑定、复制结果、清理缓存
- `RigPreviewViewer.tsx`：FBX + 骨架预览，支持骨架线、关节球、骨骼名、透视、关节点选中
- 结果预览只在任务完成后加载，运行中不请求未生成的 FBX，避免 404 导致 WebGL 视图崩溃
- `RigPreviewErrorBoundary` 兜底 FBX 加载错误，避免整个骨骼实验室界面消失

## 缓存规则

`POST /api/projects/:id/rigging/clear` 用于清理骨骼实验室状态：

- 清理最近任务、前端结果路径、错误状态
- 不删除 `Rigging/output/` 下已生成的 FBX
- 后端读取状态时会自动修剪已经不存在的完成结果，防止旧路径继续显示骨架预览

## 后续建议

1. 将 SkinTokens runtime 初始化做成显式诊断面板，逐项检查 Python、Blender、权重、Qwen、端口。
2. 增加绑定结果校验脚本，统计 mesh / armature / bone / skinned mesh 数量并写入 `rigging_lab.json`。
3. 为四足、非标准体型添加预设提示或失败诊断，但不要改变项目目录结构。
4. 保持 UI 中文化；内部类型名可继续使用 `Rigging`、`Stage` 等英文兼容旧代码。

## 来源说明

绑定能力基于 SkinTokens 项目与其开放 rigging workflow 整合改造。Asset ManagerTools 负责项目路径、任务状态、生产资产标记、结果预览和平台内工作流封装。
