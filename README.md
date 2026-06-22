<div align="center">

# 🔨 AssetForge · 资产锻造坊

**AI-assisted Stylized Game Asset Pipeline**

本地优先的风格化游戏资产生产平台，把 **概念设计 → Blender 生产 → Unity 交付** 串成一条流水线。
管理 **ConceptWorkspace**（概念）与 **BlenderWorkspace**（生产）双根目录，支持项目关联、文件浏览、资产标记、预览与批量操作。

![status](https://img.shields.io/badge/version-v0.7-blue) ![stack](https://img.shields.io/badge/stack-Node%20%2B%20React%20%2B%20Three.js-3c8) ![platform](https://img.shields.io/badge/platform-Windows-lightgrey)

</div>

> 📐 生产流程与命名规范详见 [Asset_Pipeline_Standard.md](./devplan/Asset_Pipeline_Standard.md)。

---

## 目录

- [快速开始](#快速开始)
- [更新与推送](#更新与推送)
- [功能概览](#功能概览-v07)
- [目录结构](#总工作区目录结构)
- [配置文件](#配置文件)
- [快捷键](#默认快捷键)
- [API 摘要](#api-摘要)
- [技术栈](#技术栈)
- [开发者备注](#开发者备注)

---

## 快速开始

### ▶️ 启动

双击根目录的 **`start.bat`** 即可（**首次运行自动安装后端 + 前端全部依赖**并打开浏览器）。

PowerShell 用户：

```powershell
.\start.ps1
```

或手动启动：

```bash
npm run setup   # 首次运行：安装后端 + 前端全部依赖
npm run dev
```

| 服务 | 地址 |
|------|------|
| 🖥️ 前端 | http://localhost:5173 |
| 🔌 后端 API | http://localhost:3456 |

### ⏹️ 停止

关闭运行 `start` 的终端窗口即可停止。

如果服务被 AI 编码工具留在**后台**、找不到窗口关闭，用中止脚本一键清理（按端口 3456 / 5173 精确查杀，不误伤其它 Node 进程）：

```powershell
.\stop.ps1                       # 停止默认端口
.\stop.ps1 -Ports 3456,5173,4000 # 自定义端口
.\stop.ps1 -Quiet                # 无交互，直接退出
```

也可双击 **`stop.bat`**。

### 🏗️ 生产构建

```bash
npm run build
npm start
```

### 🐞 调试模式

排查项目切换、工作区加载等问题时启用 DEBUG 日志：

```powershell
.\start.ps1 -Debug
```

或 `start.bat debug`（等价于设置 `DEBUG=1` 与 `VITE_DEBUG=1`）。

- **服务端**：终端输出 `[DEBUG:project.*]`、`[DEBUG:config]` 等
- **浏览器**：DevTools 控制台输出 `[AMT DEBUG:*]`

---

## 更新与推送

### 拉取更新

```powershell
.\update.ps1   # 或双击 update.bat
```

从 GitHub 拉取当前分支更新；`package-lock.json` 变更时自动 `npm install`。完成后再运行 `start.bat`。

默认经代理 `http://127.0.0.1:7897` 访问 GitHub；可设置 `HTTP_PROXY` / `HTTPS_PROXY`，或 `.\update.ps1 -SkipProxy` 跳过。

### 推送（本机有未提交改动时先 commit）

```powershell
$proxy = if ($env:HTTPS_PROXY) { $env:HTTPS_PROXY } elseif ($env:HTTP_PROXY) { $env:HTTP_PROXY } else { "http://127.0.0.1:7897" }
git -c "http.proxy=$proxy" -c "https.proxy=$proxy" push origin main
```

---

## 功能概览 (v0.7)

> 🧪 Material Lab 进度见 [AssetForge_MaterialLab_AICODING.md](./devplan/AssetForge_MaterialLab_AICODING.md) **「零、实现状态」**。Unity 实机 Toon 已验收；**Slang 阶段 B 已搁置**。

### 🗂️ 工作区

- **首次使用**：无内置默认工作区；启动后需 **打开已有工作区** 或 **新建空白工作区**（`data/workspace.json` 仅存本机配置，不随仓库分发）
- **多总工作区**：下拉切换、打开已有工作区、新建空白工作区
- **自动关联项目**：打开 / 切换 / 刷新工作区时，按名称自动匹配概念与生产目录并写入 `workspace.json`
- **路径自愈**：项目登记名与磁盘文件夹不一致时（如 `Punchgob庞哥布` ↔ `Punchgob`）自动纠正
- **配置稳定性**：`workspace.json` 读写加锁 + 原子写入，避免并发请求清空活动工作区
- **会话记忆**：刷新页面后恢复当前工作区、资产大类与选中项目（`sessionStorage`）
- **路径选择**：浏览器目录选择器 + 系统文件夹对话框（无需手输路径）
- **打开文件夹**：顶部菜单可打开根目录 / ConceptWorkspace / BlenderWorkspace
- **保存 / 刷新**：顶部「保存」刷盘全部 JSON；「刷新」重新扫描当前项目；每 5 分钟自动保存
- **在线资源**：顶部「在线资源」一键跳转 TextureWiz、混元 3D、Mixamo 等站点

### 📁 项目与文件

- **资产大类**：侧边栏按 **角色 / 地形 / 场景 / 道具 / UI / VFX** 分组；每个大类下保留 **概念 / 生产** 双视图（当前 **角色、地形** 已开放；**场景** 与道具 / UI / VFX 为灰色预留）。项目 `domain` 字段写入 `workspace.json`；旧 `domain: scene` 的地形项目会自动迁移为 `terrain`
- **逻辑项目**：概念侧与生产侧目录关联，支持概念 / 生产视图切换；切换项目时带加载遮罩，避免显示上一项目残留目录
- **文件树 + 画廊**：浏览、选中、预览可识别资产（图片、FBX、Blend）
- **文件操作**：新建文件夹、重命名、复制、剪切、粘贴、删除
- **导入**：工具栏或拖入外部文件到当前目录
- **右键菜单**：复制路径 / 复制当前目录路径
- **文本复制**：页面内选中文字可用 Ctrl+C 正常复制；文件快捷键仅在选中文件时生效

### 🏷️ 概念资产标记（概念侧）

在「可预览资产」标题栏使用按钮标记，**自动重命名**并写入标签：

| 按钮 | 适用类型 | 命名规则 |
|------|----------|----------|
| 立绘 | 图片 | `{项目名}_KeyArt.{ext}` |
| 多视图 | 图片 | `{项目名}_MultiView_01.{ext}`（可多张） |
| 高模 | FBX 等模型 | `{项目名}_High.{ext}` |
| 低模 | FBX 等模型 | `{项目名}_Low.{ext}` |

标签数据保存在各概念项目 `.asset-manager/concept_tags.json`。

### 🎨 纹理贴图标记（生产侧）

生产视图画廊提供纹理类型按钮，**一键重命名**为 `T_{项目名}_{类型}.{ext}`：

`BaseColor` · `Roughness` · `Metallic` · `Normal` · `AO` · `Height` · `Edge` · `Detection` · `Alpha` · `Bump` · `Curvature` · `Emission` · `MetallicSmoothness`（**MetSmth**，合并 Metallic+Roughness 后自动标记）

原始贴图建议放在 `textures/source/`；标记元数据写入 `.asset-manager/blender_texture_tags.json`。

### 🏭 生产资产标记（生产侧）

画廊标题栏提供生产资产类型按钮，**一键重命名**并写入 `.asset-manager/production_asset_tags.json`：

| 按钮 | 命名规则 | 说明 |
|------|----------|------|
| 低模 | `{项目名}_Low.{ext}` | 每项目唯一 |
| 骨骼 | `{项目名}_Skeleton.{ext}` | 每项目唯一 |
| SM模型 | `SM_{项目名}.{ext}` | 每项目唯一 |
| 工程 | `{项目名}.blend` | 每项目唯一 |
| 状态机动画 ▼ | `{项目名}_{clip}.{ext}` | 可多文件 |

**状态机动画工作流**：点击「状态机动画 ▼」展开 10 个 clip 选择按钮（attack · combatidle · death · defend · hit · idle · magic · run · T-Pose · walk），点击任一 clip 即标记并重命名为 `{项目名}_{clip}.fbx`。已标记的 clip 显示橙色 ✓；标题栏下方实时提示哪些 clip 尚未标记，全部完成后提醒消失。

### 👁️ 预览

- **图片（概念侧）**：内嵌预览；**水平 / 垂直镜像**预览与保存；**图片分割** —— 宫格分割（可拖动分割线、**点选格子选择导出**）+ **自由画框**（在图上任意拖框，支持移动 / 缩放 / 删除，按序导出）；**高清化** —— 本地 AI 超分（Real-ESRGAN ncnn-vulkan，2x / 3x / 4x，前后对比，另存 `_HD.png`，不上传不覆盖）
- **图片（生产侧）**：内嵌预览；**纹理尺寸**一键转换为 256 / 512 / 1024 / 2048 / 4096
- **FBX**：Three.js 预览，默认正视图；自动播放内嵌动画；**多动画 FBX 可在工具栏切换 clip 播放**
- **Blend**：提示在 `renders/` 查看渲染图

### 🦴 骨骼实验室（角色生产侧）

角色生产视图工具栏点击 **「骨骼实验室」** 打开原生绑定工作流：

- 直接读取当前角色生产项目，不再依赖 ComfyUI 编排；执行入口在 AssetForge 后端
- 概念侧标记为 **低模** 的模型可同步到生产项目 `Rigging/input/`
- 绑定结果写入 `Rigging/output/`，任务状态写入 `Rigging/rigging_lab.json`
- 结果预览支持 **骨架 / 关节 / 名称 / 透视** 显示，并可点击关节查看骨骼信息
- 「清理缓存」只清理任务状态与前端预览缓存，不删除已生成 FBX
- 运行时说明：[devplan/RIGGING_PLATFORM_RUNTIME.md](./devplan/RIGGING_PLATFORM_RUNTIME.md)

> 绑定能力基于 SkinTokens 项目与其开放工作流整合改造，详见文末来源说明。仓库只保存平台集成代码；Python 环境、Blender、模型权重位于本机 `runtime/rigging/`，不随 git 分发。

### 🗺️ 地形板块（`domain: terrain`）

**轨道 A — 地形模型（已上线）**

- 新建项目自动 `首字母大写` + `_Terrain` 后缀；Blender 轻量目录（无 `animations/mixamo`）
- 生产侧可走 **Material Lab** 导出 Unity 包（与角色相同 Toon 管线）

**轨道 B — 地形语义（已上线 v1）**

- 可变比例 2.5D 舞台（16:9 / 1:1 / 2:1 / 3:1 / 4:1 / 自定义宽:高）+ S/M/L 像素层级自动换算
- Semantic Control Map → BaseColor 提示词 → Image2 → TextureWiz（外部）
- 开发说明：[devplan/AssetForge_Terrain_StageLab_AICODING.md](./devplan/AssetForge_Terrain_StageLab_AICODING.md)
- 数据目录：`TerrainWorkspace/stages/<StageName>/`

> UI 已改名为 **地形语义**；代码和历史数据中仍保留 `Stage` / `StageLab` 命名以兼容已创建项目。

### 🧪 材质实验室（Material Lab，生产侧）

在生产视图工具栏点击 **「材质实验室」** 打开全屏 Modal：

- 自动读取 `blender_texture_tags.json` 填充贴图槽
- Toon 参数实时预览 + **8 组材质参数预设**
- **预览定向光**：方位 / 仰角、颜色、强度、环境光 + **6 组光照预设**（角色 / 地形共用，仅预览不写 Unity 包）
- 保存 `.asset-manager/material_lab.json`
- **合并 Metallic + Roughness** → `T_<Name>_MetallicSmoothness.png`（R=Metallic, A=Smoothness）
- **检查 Unity 贴图规范**
- **导出 Unity 包** → `BlenderWorkspace/UnityAssets/<项目名>/`（Models、Textures、Shaders、Materials 一键整理）
- Unity：**Asset Manager** 菜单支持单个 / 批量导入 `.material.json` 生成 `.mat`（自动配置 Normal / 线性贴图类型）
- **ToonURP** 支持 URP 主光方向、颜色、片元阴影采样、`SampleSH` 环境光、**ShadowCaster** 投影；Outline 带远景宽度 LOD
- **ToonTerrainURP**（地形 Material Lab）：软 Toon 光照 + **接收角色投射阴影**（`AMTLightingCommon.hlsl` + `_ShadowReceiveStrength`）
- **Slang 编译（阶段 B）已搁置** —— 使用内置 fallback HLSL

### 🧩 纹理投影工具（生产侧，实验性）

在生产视图工具栏点击 **「纹理投影」** 打开全屏 Modal，基于 Three.js 正交相机将已有贴图从 6 个方向投影烘焙到 UV 空间：

- **6 方向正交渲染**：每个方向可单独点「渲染」生成 1024×1024 正射参考图（与烘焙相机完全对齐），也可「全部方向渲染（正交）」一键生成
- **深度遮挡**：渲染精度与烘焙分辨率一致（默认 2048），避免 z-fighting
- **AI 精修**（需本地 ComfyUI）：上传参考图后，填写正向 / 反向提示词、降噪强度（持久化到 `localStorage`），调用 ComfyUI img2img 精修贴图
- **投影 → UV 烘焙**：精修结果通过正交相机投影到模型 UV，支持对已有贴图做增量 BaseColor 覆写

> ⚠️ **局限性**：此功能不适合作为人物模型贴图制作，是否适合规则多边形道具（建筑、武器、载具等）使用还有待测试。人物模型头发 / 睫毛的深度复杂度会导致面部 UV 覆盖率为零。

---

## 总工作区目录结构

```
<你选择的根目录>/
├── workspace.meta.json          # （可选）工作区元数据
├── ConceptWorkspace/            # 概念设计
│   └── <项目名>/
│       ├── .asset-manager/
│       │   └── concept_tags.json
│       └── …
└── BlenderWorkspace/            # Blender 生产
    ├── UnityAssets/             # Material Lab 导出的 Unity 就绪资产包
    │   ├── Editor/
    │   └── <项目名>/
    ├── TerrainWorkspace/        # 地形语义项目（内部仍沿用 stages）
    │   └── stages/
    │       └── <StageName>/
    │           ├── .asset-manager/stage.json
    │           └── textures/
    ├── projects/
    │   └── <项目名>/
    │       ├── textures/
    │       │   └── source/      # 原始贴图（新建项目自动创建）
    │       ├── Rigging/
    │       │   ├── input/       # 骨骼实验室输入模型
    │       │   ├── output/      # 绑定结果 FBX
    │       │   └── rigging_lab.json
    │       └── …
    ├── assets/
    ├── docs/
    └── tools/
```

也支持**分散路径**工作区（概念根与 Blender 根分别配置，无统一 rootPath）。

---

## 配置文件

| 文件 | 说明 |
|------|------|
| `data/workspace.json` | 工作区列表、活动工作区、项目关联 |
| `data/shortcuts.json` | 快捷键配置 |
| `<概念项目>/.asset-manager/concept_tags.json` | 概念资产标记 |
| `<生产项目>/.asset-manager/blender_texture_tags.json` | 纹理贴图类型标记 |
| `<生产项目>/.asset-manager/material_lab.json` | Material Lab 状态（生产侧） |
| `<生产项目>/Rigging/rigging_lab.json` | 骨骼实验室任务状态与最近结果 |

「保存」会刷盘以上全部 JSON，并对各项目同步标签与磁盘文件名。

---

## 默认快捷键

| 操作 | 快捷键 | 操作 | 快捷键 |
|------|--------|------|--------|
| 重命名 | `F2` | 删除 | `Delete` |
| 复制 | `Ctrl + C` | 新建文件夹 | `Ctrl + Shift + N` |
| 剪切 | `Ctrl + X` | 刷新 | `F5` |
| 粘贴 | `Ctrl + V` | | |

可通过 API `PUT /api/shortcuts` 修改；界面「快捷键」面板可查看当前配置。

---

## API 摘要

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/workspace` | 获取工作区与未关联信息 |
| `POST` | `/api/workspaces` | 新建总工作区 |
| `POST` | `/api/workspaces/open` | 打开已有工作区 |
| `PUT` | `/api/workspaces/active` | 切换活动工作区 |
| `POST` | `/api/save-all` | 保存全部 JSON |
| `GET/PUT` | `/api/projects/:id/...` | 项目 CRUD、文件树、资产列表 |
| `GET/POST` | `/api/projects/:id/concept-tags` | 读取 / 标记概念资产 |
| `GET/POST` | `/api/projects/:id/texture-tags` | 读取 / 标记生产纹理 |
| `GET/PUT` | `/api/projects/:id/material-lab` | Material Lab 状态读写 |
| `POST` | `/api/projects/:id/material-lab/merge-metallic-smoothness` | 合并 Metallic + Roughness |
| `POST` | `/api/projects/:id/material-lab/check` | Unity 贴图规范检查 |
| `POST` | `/api/projects/:id/material-lab/export-unity` | 导出 Unity 包（整资产） |
| `GET/POST` | `/api/projects/:id/production-asset-tags` | 读取 / 标记生产资产（含状态机动画 clip） |
| `GET/POST` | `/api/projects/:id/rigging/*` | 骨骼实验室：选择输入、检查服务、自动绑定、清理缓存 |
| `GET` | `/api/comfyui/status` | 检查本地 ComfyUI 是否在线 |
| `POST` | `/api/comfyui/refine` | ComfyUI img2img 精修（纹理投影 AI 精修） |
| `POST` | `/api/images/resize` | 纹理尺寸转换 |
| `POST` | `/api/images/mirror` | 概念图片镜像保存 |
| `POST` | `/api/fs/split-image` | 宫格分割（可选导出指定格子） |
| `POST` | `/api/fs/split-regions` | 自由画框区域裁切 |
| `POST` | `/api/fs/*` | 重命名、删除、复制、移动、导入等 |
| `GET` | `/api/files?path=` | 静态文件（预览用） |

---

## 项目结构

```
AssetForge/  (folder: Asset ManagerTools)
├── start.bat / start.ps1    # 一键启动
├── stop.bat  / stop.ps1     # 中止后台服务（按端口查杀）
├── update.bat / update.ps1  # Git 拉取更新 + 依赖安装
├── create-launcher.bat      # 带图标启动快捷方式
├── assets/
├── server/                  # Node + Express 后端
├── client/                  # React + Vite 前端
├── data/                    # 运行时 JSON（gitignore，各机器本地）
├── runtime/                 # 本机运行时（gitignore）：SkinTokens / Python / 模型权重
├── devplan/                 # 设计与开发文档
└── README.md
```

---

## 技术栈

- **后端**：Node.js · Express · sharp（图片分割 / 缩放 / 镜像）· multer（文件导入）
- **前端**：React 18 · Vite · @react-three/fiber · @react-three/drei

---

## 开发者备注

- 中文文档建议通过 `node scripts/read-utf8.mjs <file>` 读取，避免终端代码页导致中文树形图或说明文字乱码。
- 文件树视觉已从 `DIR/FILE/IMG/3D` 文本标签改回图标式表达；后续优化应保持这种更直观的图标风格。

---

## Rigging Attribution

The character rigging module is integrated into AssetForge as a native platform workflow.

The rig generation capability is based on and adapted from the **SkinTokens** project and its open rigging workflow. AssetForge reorganizes that capability into its own character production pipeline, including project-local input/output folders, production asset tags, job state, and skeleton-aware result preview.
