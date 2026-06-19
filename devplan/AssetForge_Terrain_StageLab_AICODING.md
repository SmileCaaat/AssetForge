# AssetManagerTools Terrain：地形语义 / Semantic Control Map Editor 开发说明

仓库地址：<https://github.com/SmileCaaat/AssetManagerTools>

本文件用于指导 AI Coding 工具在现有 `AssetManagerTools` 仓库中进行增量开发。目标是在 **既有「地形」资产大类（`domain: terrain`）** 下维护 **地形语义** 子模块，用于风格化 2.5D 场景的语义控制图生产。

```text
地形语义 / Semantic Control Map Editor
```

> **与仓库现状对齐（2026-06）**  
> - 侧边栏 **地形** Tab 已存在（`AssetDomain = terrain`），与 **场景**（`scene`，灰色预留）分离。  
> - 当前地形 **逻辑项目** = `ConceptWorkspace` + `BlenderWorkspace/projects/<Name>_Terrain` 双轨目录，面向 **单块地形 FBX 网格**（无 mixamo）。  
> - UI 名称已改为 **地形语义**，因为它实际用于地形语义控制图，而不是舞台编辑器。代码、API、历史文件中仍保留 `Stage` / `StageLab` 命名以兼容已创建数据。
> - **地形语义** 是地形大类下的 **第二条工作流**，面向 **可配置比例语义场景**（默认 16:9）；**当前 UI 聚焦 SemanticControl + BaseColor**，Height/Normal/AO/Mask 由外部工具或磁盘文件承载，见下方「当前实现状态」。
> - 实现方式参考 **Material Lab**：生产视图工具栏入口 → 全屏 Modal，不重构 `App.tsx` 主骨架。
> - 后续优化可改 UI 文案和交互，但不要一次性重命名内部 `Stage*` 类型、文件名和 API，避免破坏已有 `TerrainWorkspace/stages/*` 数据。

---

## 当前实现状态（2026-06 · UI 精简深度 A + schema 收敛深度 B + 中文化）

用户工作流：**画/生成语义图 → 出 BaseColor（语义约束）提示词 → Image2 → TextureWiz Wizard → Blender**。Height/Normal/AO **不经 Stage Lab UI**，磁盘上旧贴图可保留为 orphan 文件。

当前 UI 入口、标题和主要按钮均已中文化为 **地形语义**；工具内部仍可用 `StageLabModal`、`stage.json`、`TerrainWorkspace/stages` 命名。

### UI 已精简（客户端 · 深度 A）

| 模块 | 精简前 | 精简后 | 文件 |
|------|--------|--------|------|
| 提示词种类 | 6 种 | **1 种**：`semantic_to_basecolor` | `client/src/terrain/stagePrompts.ts` |
| 建议操作 | 14 项（含阶段 D/E 占位） | **4 项** | `client/src/terrain/stageActions.ts` |
| 贴图槽 UI | 8 槽 | **2 槽**：SemanticControl、BaseColor | `client/src/terrain/StageTexturePanel.tsx` |
| 核心状态行 | 含 PropAnchor 等 | **仅** SemanticControl + BaseColor | `client/src/terrain/StageStatusPanel.tsx` |

**保留的 4 个建议操作：** `gen_basecolor_prompt` · `open_semantic_editor` · `upload_semantic` · `upload_basecolor`

**已移除的 UI（无实现或工作流不用）：** Normal / AO / WalkableMask / DecorationMask / PropAnchor 识别；Height 派生提示词；反向 Semantic 标注提示词；布局参考提示词；`upload_height` 入口；新建 Stage 的 `workflowMode` 四入口。

### schema 已收敛（服务端 + 类型 · 深度 B）

| 项目 | 精简前 | 精简后 |
|------|--------|--------|
| `stage.json` version | `1`（胖模型） | **`2`**（仅 SemanticControl + BaseColor） |
| `textures` | 8 槽 | **2 槽**：`semanticControl`、`baseColor` |
| 已删字段 | — | `generation`、`workflowMode`、`propAnchors`、height/normal/ao/mask 路径 |
| 提示词 API | 6 种 `StagePromptKind` | **仅** `semantic_to_basecolor` |
| 上传槽位 | 多槽 | `STAGE_UPLOAD_SLOTS` 仅 2 槽 |
| v1 迁移 | — | `migrateStageJson()`：list/load 时自动写回 v2，**不删磁盘**上已有 Height 等文件 |

**关键文件：** `server/stageTypes.ts` · `server/services/stageProjectService.ts` · `server/services/stagePromptService.ts` · `server/routes/terrainStage.ts` · `client/src/terrain/terrainTypes.ts`

**仍完整保留：** 语义程序化生成（区域随机 + 融合修饰 + 进度条）→ `devplan/StageLab_SemanticProcedural_AICODING.md`；SemanticMapEditor **BaseColor 参考叠加层**。

### 舞台比例与像素层级（2026-06）

新建 Stage 时按 **宽:高 比例** + **像素层级** 自动换算分辨率与世界尺寸（**不需手填像素**）。

| 比例预设 | 说明 |
|----------|------|
| `16:9` | 默认宽屏舞台 |
| `1:1` / `2:1` / `3:1` / `4:1` | 方形与横向长条舞台 |
| **自定义** | 输入宽、高两个比例数（如 5:3） |

| 像素层级 | 横向基准像素 | 16:9 示例分辨率 |
|----------|--------------|-----------------|
| S | 2048 | 2048×1152 |
| M | 3072 | 3072×1728 |
| L | 4096 | 4096×2304 |

换算规则：`resolution.height = round(baseWidth × 高比例 / 宽比例)`；`worldSize = resolution / 64`（Unity 单位）。

**关键文件：** `server/stageSizing.ts` · `client/src/terrain/stageSizing.ts` · `client/src/terrain/StageLabPanels.tsx`（新建表单）

`stage.json` 的 `aspect` 字段现为字符串（如 `"16:9"`、`"3:1"`），迁移时从 `resolution` 反推。

**刻意不做：** Mask 派生（walkable/decoration/propAnchor）— 未验证，仅概念；TextureWiz 产出由 Blender 消费，不进 `stage.json`。

---

## 零、地形板块双轨（纳入方式）

```text
地形 Tab（domain: terrain）
├── 轨道 A — 地形模型（已实现）
│   ├── 新建逻辑项目 → <Name>_Terrain
│   ├── Concept + Blender projects/ 轻量目录
│   ├── 文件树 / 画廊 / FBX 预览
│   └── Material Lab（地形 Toon + UnityAssets 包 · 已实现，见 MaterialLab devplan §阶段 E）
│
└── 轨道 B — 地形语义（本文件，已上线）
    ├── 入口：地形项目生产视图 →「地形语义」按钮
    ├── 数据根：TerrainWorkspace/stages/<StageName>/
    ├── 核心：Semantic Control Map 编辑 + Mask 派生 + 提示词
    └── 与轨道 A 共用同一 terrain 大类，但目录与 API 独立
```

**不要** 把 Stage 舞台与 `_Terrain` 网格混成同一种 `ProjectLink` 目录结构。推荐：

| 维度 | 轨道 A 地形模型 | 轨道 B Stage Lab |
|------|----------------|------------------|
| 用途 | 单块可导入 Unity 的地形 mesh | 2.5D 固定比例舞台语义生产 |
| 根目录 | `BlenderWorkspace/projects/` | `TerrainWorkspace/stages/` |
| 核心资产 | `SM_*_Terrain.fbx` + 贴图 | BaseColor / Height / SemanticControl + 派生 Mask |
| 元数据 | `blender_texture_tags.json` | `.asset-manager/stage.json` |
| 工具入口 | Material Lab | 地形语义 |

未来可在地形 Tab 侧边栏用 **子筛选**（全部 / 模型 / Stage）或 Stage 独立列表组件展示；v0.1 可先 **工具栏按钮 + Stage 列表 Modal**。

---

## 〇点五、工作区扩展（计划）

在 `MasterWorkspace` 增加可选字段（与 `conceptRoot` / `blenderRoot` 并列）：

```typescript
terrainRoot?: string;  // 默认 <rootPath>/TerrainWorkspace
```

服务端新增：

```text
server/workspacePaths.ts → getTerrainRoot(workspace)
server/types.ts          → TERRAIN_WORKSPACE_FOLDER = "TerrainWorkspace"
```

`collectWorkspaceRoots` 需纳入 `TerrainWorkspace`，供文件 API 与 Stage 路由鉴权。

---


核心思想：

```text
人工只绘制：
1. BaseColor
2. Height
3. Semantic Control Map / 语义控制图

程序自动派生：
1. Normal
2. AO
3. WalkableMask
4. DecorationMask
5. PropAnchorMask / stage.json
```

本工具不是传统写实地形生成器，不做开放世界地形，不做侵蚀地貌，不做真实山脉地形。它面向固定 16:9 的 2.5D / 回合制 / 城邦访问 / 遗迹战斗场景。

---

## 一、项目定位

当前 `AssetManagerTools` 已经具备：

```text
ConceptWorkspace
BlenderWorkspace
Material Lab
角色贴图槽识别
Unity ToonURP 导出
本地网页资产管理
React + Vite + Three.js 前端
Node / Express 后端
```

本次开发在 **地形大类** 下新增：

```text
Terrain 板块（已有 Tab）
└── Stage Lab（新增子模块，v0.1）
    ├── 语义控制图绘制
    ├── 标准化提示词生成
    ├── BaseColor / Height / SemanticControl 贴图槽
    ├── 从 SemanticControl 自动派生 WalkableMask
    ├── 从 SemanticControl + Height 自动派生 DecorationMask
    ├── 从 SemanticControl 识别 Prop Anchors
    ├── 生成 stage.json
    └── 后续扩展 Unity Stage 包导出
```

当前阶段先不做复杂 3D 场景生成。  
第一版重点是 **语义控制图编辑 + 规则派生 Mask + 提示词标准化**。

---

## 二、核心工作流

最终用户工作流应为：

```text
进入 AssetManagerTools
↓
切换到「地形」Tab
↓
【轨道 A】新建地形模型项目 <Name>_Terrain → Blender 雕刻 → Material Lab
或
【轨道 B】打开 Stage Lab → 新建 Stage
↓
选择场景比例：16:9
↓
设置场景尺寸：32 × 18 / 48 × 27 等
↓
绘制 Semantic Control Map
↓
生成标准化 AI 提示词
↓
导入或生成 BaseColor
↓
导入或生成 Height
↓
由工具派生 WalkableMask / DecorationMask / PropAnchor
↓
保存 stage.json
↓
后续导出 Unity Stage 包
```

其中：

```text
Semantic Control Map 是整个流程的核心。
```

它不是渲染贴图，而是机器识别用的纯色语义分区图。

---

## 三、不要做的事

本次不要做：

```text
1. 不要做写实地形生成器
2. 不要做 Gaea / World Creator 类开放世界地形
3. 不要做完整 Unity 地形系统
4. 不要一开始生成大量 3D 道具
5. 不要把树、柱子、断墙、NPC 直接画进 BaseColor
6. 不要让 BaseColor 承担 Walkable / Prop / Decoration 逻辑
7. 不要重构 AssetManagerTools 现有架构
8. 不要破坏 Material Lab
9. 不要把 SemanticControl 和 BaseColor 混成同一张图
```

本次只做：

```text
Terrain 板块下的 Stage Lab v0.1。
```

---

## 四、推荐新增目录结构

请在现有仓库中增量新增：

```text
AssetManagerTools/
├── server/
│   ├── routes/
│   │   └── terrainStage.ts
│   ├── services/
│   │   ├── stageProjectService.ts
│   │   ├── semanticMaskService.ts
│   │   ├── stagePromptService.ts
│   │   └── stageExportService.ts
│   └── templates/
│       └── terrain/
│           ├── semantic_palette.json
│           ├── prompt_templates.json
│           └── stage_defaults.json
│
├── client/
│   └── src/
│       ├── terrain/
│       │   ├── TerrainPage.tsx
│       │   ├── StageLabPage.tsx
│       │   ├── StageProjectList.tsx
│       │   ├── SemanticMapEditor.tsx
│       │   ├── SemanticPalettePanel.tsx
│       │   ├── StagePromptPanel.tsx
│       │   ├── DerivedMaskPanel.tsx
│       │   ├── StageTextureSlotPanel.tsx
│       │   ├── StagePreviewPanel.tsx
│       │   ├── StageSettingsPanel.tsx
│       │   ├── terrainTypes.ts
│       │   └── terrainApi.ts
│       └── shared/
│           └── imageCanvas/
│               ├── CanvasLayer.tsx
│               ├── BrushTool.ts
│               ├── FloodFillTool.ts
│               └── ColorPickTool.ts
│
└── docs/
    └── terrain/
        ├── STAGE_LAB_SPEC.md
        ├── SEMANTIC_CONTROL_MAP_SPEC.md
        └── PROMPT_STANDARD_SPEC.md
```

如果当前项目没有 TypeScript，按现有技术栈命名为 `.js/.jsx` 即可，但模块边界保持一致。

---

## 五、Terrain 工作区结构

在用户工作区中新增：

```text
TerrainWorkspace/
├── stages/
│   └── <StageName>/
│       ├── .asset-manager/
│       │   ├── stage.json
│       │   ├── semantic_palette.json
│       │   └── prompt_history.json
│       ├── textures/
│       │   ├── T_<StageName>_BaseColor.png
│       │   ├── T_<StageName>_Height.png
│       │   ├── T_<StageName>_SemanticControl.png
│       │   ├── T_<StageName>_Normal.png
│       │   ├── T_<StageName>_AO.png
│       │   ├── T_<StageName>_WalkableMask.png
│       │   ├── T_<StageName>_DecorationMask.png
│       │   └── T_<StageName>_PropAnchorMask.png
│       ├── prompts/
│       │   ├── basecolor_prompt.md
│       │   ├── height_prompt.md
│       │   └── semantic_prompt.md
│       ├── exports/
│       └── preview/
│           └── preview.png
└── docs/
```

如果已有工作区模型不方便新增 `TerrainWorkspace`，也可以先在当前 Workspace 根目录下新建：

```text
Terrain/
└── stages/
```

但推荐正式命名为 `TerrainWorkspace`，与 `ConceptWorkspace`、`BlenderWorkspace` 并列。

---

## 六、Stage 项目数据结构

核心文件：

```text
TerrainWorkspace/stages/<StageName>/.asset-manager/stage.json
```

推荐结构（**v2 · 当前实现**）：

```json
{
  "version": 2,
  "stageName": "RuinRoad_01",
  "displayName": "遗迹道路测试场景 01",
  "stageType": "ruin_road",
  "aspect": "16:9",
  "worldSize": {
    "width": 32,
    "height": 18,
    "unit": "unity"
  },
  "actualGroundSize": {
    "width": 36,
    "height": 20.25,
    "unit": "unity"
  },
  "resolution": {
    "width": 2048,
    "height": 1152
  },
  "textures": {
    "baseColor": "textures/T_RuinRoad_01_BaseColor.png",
    "semanticControl": "textures/T_RuinRoad_01_SemanticControl.png"
  },
  "palette": "semantic_palette.json",
  "promptProfile": {
    "style": "lowpoly_toon_ruins",
    "camera": "top_down_orthographic",
    "outputType": "basecolor_only"
  },
  "updatedAt": ""
}
```

> **v1 迁移：** 打开已有 Stage 时 `migrateStageJson()` 保留 baseColor/semanticControl 路径，丢弃 `generation` / `workflowMode` / `propAnchors` 及多余纹理槽引用；首次 list/load 自动写回 v2。磁盘上 `T_*_Height.png` 等可保留，不再出现在 `stage.json`。

**历史 v1 胖模型（仅供对照，勿新建）：**

```json
{
  "version": 1,
  "stageName": "RuinRoad_01",
  "workflowMode": "semantic_first",
  "textures": {
    "baseColor": "textures/T_RuinRoad_01_BaseColor.png",
    "height": "textures/T_RuinRoad_01_Height.png",
    "semanticControl": "textures/T_RuinRoad_01_SemanticControl.png",
    "normal": "textures/T_RuinRoad_01_Normal.png",
    "ao": "textures/T_RuinRoad_01_AO.png",
    "walkableMask": "textures/T_RuinRoad_01_WalkableMask.png"
  },
  "generation": { "heightScale": 0.45 },
  "propAnchors": []
}
```

---

## 七、Semantic Control Map 颜色规范

请新增默认语义调色板：

```text
server/templates/terrain/semantic_palette.json
```

推荐内容：

```json
{
  "version": 1,
  "colors": [
    {
      "id": "grass",
      "label": "普通草地",
      "hex": "#3FA34D",
      "walkable": true,
      "decoratable": true,
      "description": "普通可行走草地区"
    },
    {
      "id": "dirt",
      "label": "泥地",
      "hex": "#7A5A36",
      "walkable": true,
      "decoratable": true,
      "description": "土路、裸露泥地、草地过渡"
    },
    {
      "id": "stone_road",
      "label": "石质通道",
      "hex": "#6E6A62",
      "walkable": true,
      "decoratable": false,
      "description": "主要道路和可行走石板"
    },
    {
      "id": "stone_platform",
      "label": "石质台地",
      "hex": "#D5CFC0",
      "walkable": true,
      "decoratable": false,
      "description": "遗迹平台、战斗站位平台"
    },
    {
      "id": "boundary_grass",
      "label": "边界深草",
      "hex": "#1F5E36",
      "walkable": false,
      "decoratable": true,
      "description": "用于自然封边的深草区"
    },
    {
      "id": "water_or_pit",
      "label": "水体/深坑",
      "hex": "#2D4F73",
      "walkable": false,
      "decoratable": false,
      "description": "不可行走的水体、裂谷、深坑"
    },
    {
      "id": "clear_zone",
      "label": "战斗/交互净区",
      "hex": "#FFFFFF",
      "walkable": true,
      "decoratable": false,
      "description": "保持干净，不自动生成草和碎石"
    },
    {
      "id": "ruin_anchor",
      "label": "遗迹锚点",
      "hex": "#FF0000",
      "walkable": false,
      "decoratable": false,
      "anchorType": "ruin",
      "description": "柱子、断墙、拱门、石碑等遗迹道具摆放点"
    },
    {
      "id": "nature_anchor",
      "label": "自然锚点",
      "hex": "#00FF00",
      "walkable": false,
      "decoratable": false,
      "anchorType": "nature",
      "description": "树、树桩、大蘑菇、巨石等自然道具摆放点"
    },
    {
      "id": "interact_anchor",
      "label": "交互锚点",
      "hex": "#FFFF00",
      "walkable": false,
      "decoratable": false,
      "anchorType": "interact",
      "description": "箱子、采集点、机关、可交互物摆放点"
    },
    {
      "id": "npc_anchor",
      "label": "NPC锚点",
      "hex": "#FF00FF",
      "walkable": false,
      "decoratable": false,
      "anchorType": "npc",
      "description": "NPC、功能点、任务点摆放点"
    },
    {
      "id": "special_anchor",
      "label": "特殊锚点",
      "hex": "#00FFFF",
      "walkable": false,
      "decoratable": false,
      "anchorType": "special",
      "description": "水晶、传送门、祭坛、特殊地标摆放点"
    }
  ]
}
```

颜色必须严格匹配，工具应提供吸附/修正能力，避免出现抗锯齿导致的颜色识别失败。

---

## 八、SemanticMapEditor 功能要求

新增组件：

```text
client/src/terrain/SemanticMapEditor.tsx
```

核心功能：

```text
1. 新建 16:9 语义控制图
2. 加载已有 SemanticControl.png
3. 使用固定调色板绘制区域
4. 支持画笔
5. 支持橡皮
6. 支持油漆桶填充
7. 支持直线 / 矩形 / 圆形基础形状
8. 支持点状 Anchor 绘制
9. 支持网格显示
10. 支持撤销 / 重做
11. 支持导出 PNG
12. 支持颜色合法性检查
```

第一版不需要做复杂图层系统，但建议内部至少支持：

```text
Base Layer：区域语义
Anchor Layer：点位锚点
```

如果时间有限，可以先合成输出一张 PNG，但数据模型中保留未来图层扩展能力。

---

## 九、画布交互设计

推荐 UI：

```text
┌────────────────────────────────────────────────────────────┐
│ Terrain / Stage Lab / 当前Stage名                         │
├───────────────┬──────────────────────────┬─────────────────┤
│ Stage贴图槽    │ Semantic Control Editor  │ 语义调色板/参数   │
│ BaseColor      │ 16:9 Canvas              │ Grass            │
│ Height         │                          │ Dirt             │
│ Semantic       │                          │ Stone Road       │
│ Walkable       │                          │ Anchors          │
│ Decoration     │                          │ Prompt Panel     │
└───────────────┴──────────────────────────┴─────────────────┘
```

工具栏：

```text
画笔
橡皮
填充
拾色
矩形
圆形
锚点
撤销
重做
导出
生成Mask
生成提示词
```

---

## 十、Mask 派生规则

新增服务：

```text
server/services/semanticMaskService.ts
```

也可以前端先实现，后端保存。  
但推荐后端实现，保证规则统一。

### WalkableMask

输入：

```text
SemanticControl.png
Height.png，可选
stage.json 参数
```

输出：

```text
T_<StageName>_WalkableMask.png
```

规则：

```text
Walkable = grass + dirt + stone_road + stone_platform + clear_zone
Walkable -= boundary_grass
Walkable -= water_or_pit
Walkable -= all anchor pixels
Walkable -= steep slope from Height
Walkable = erode(Walkable, agentRadius/walkableErodePx)
```

输出标准：

```text
白色 #FFFFFF = 可走
黑色 #000000 = 不可走
灰色可暂不使用
```

### DecorationMask

输入：

```text
SemanticControl.png
WalkableMask.png
Height.png，可选
```

输出：

```text
T_<StageName>_DecorationMask.png
```

规则：

```text
Decoration = grass + boundary_grass
Decoration += roadEdge
Decoration += ruinEdge
Decoration -= clear_zone
Decoration -= stone_road center
Decoration -= stone_platform center
Decoration -= anchor occupied area
Decoration *= noise modulation
```

其中：

```text
roadEdge = dilate(stone_road, roadEdgeWidthPx) - stone_road
ruinEdge = dilate(stone_platform, roadEdgeWidthPx) - stone_platform
```

输出标准：

```text
白色 = 高密度装饰
灰色 = 中低密度装饰
黑色 = 不装饰
```

### PropAnchorMask / stage.json

输入：

```text
SemanticControl.png
semantic_palette.json
```

输出：

```text
T_<StageName>_PropAnchorMask.png
stage.json 中的 propAnchors
```

识别颜色：

```text
#FF0000 ruin_anchor
#00FF00 nature_anchor
#FFFF00 interact_anchor
#FF00FF npc_anchor
#00FFFF special_anchor
```

识别逻辑：

```text
1. 按 anchor 颜色查找连通区域
2. 对每个连通区域计算中心点
3. 将像素坐标转换为 Unity 世界坐标
4. 写入 stage.json 的 propAnchors
```

坐标转换：

```text
pixelX / textureWidth → worldX
pixelY / textureHeight → worldZ

worldX = (pixelX / width - 0.5) * worldSize.width
worldZ = (0.5 - pixelY / height) * worldSize.height
worldY = heightMap 采样值 * heightScale，可选
```

示例输出：

```json
{
  "propAnchors": [
    {
      "id": "anchor_001",
      "typeGroup": "ruin",
      "semanticId": "ruin_anchor",
      "position": [4.2, 0, -2.1],
      "rotation": 0,
      "scale": 1.0,
      "sourcePixel": [1230, 552]
    },
    {
      "id": "anchor_002",
      "typeGroup": "npc",
      "semanticId": "npc_anchor",
      "position": [-6.5, 0, 3.7],
      "rotation": 180,
      "scale": 1.0,
      "sourcePixel": [310, 330]
    }
  ]
}
```

---

## 十一、提示词标准化工具

新增：

```text
client/src/terrain/StagePromptPanel.tsx
server/services/stagePromptService.ts
server/templates/terrain/prompt_templates.json
```

目标：  
根据 Stage 类型、语义图结构和用户选择，生成标准化 AI 提示词，用于生成：

```text
BaseColor
Height
SemanticControl
```

第一版重点生成 BaseColor 和 Height 提示词。

---

## 十二、BaseColor 提示词规范

BaseColor 目标：

```text
地面颜色图
不是完整场景插画
不是道具图
不是写实地形
```

BaseColor 必须包含：

```text
草地颜色
泥地颜色
石质通道颜色
石质台地颜色
地表磨损
石缝
苔藓
低矮碎石痕迹
区域过渡
```

BaseColor 不应包含：

```text
树
柱子
断墙
建筑
灯柱
箱子
NPC
角色
UI
强阴影
AO烘焙
透视
明显光照方向
```

模板：

```text
Create a 16:9 top-down orthographic BASECOLOR / ALBEDO map for a stylized lowpoly toon 2.5D game stage.

This is a ground texture only, not a finished scene illustration.

Scene type: {stageType}.
World style: lowpoly toon fantasy ruins, hand-painted but clean, game-production readable.

The map should contain only ground-level surface information:
- grass color zones
- dirt paths
- broken stone road surfaces
- stone platform ground
- moss patches
- cracks and worn stone surface color
- subtle small ground pebbles painted as surface detail
- clear transitions between road, dirt, grass, and platform

Do not include independent 3D objects:
- no trees
- no pillars
- no walls
- no arches
- no buildings
- no boxes
- no NPC markers
- no characters
- no UI
- no text
- no cast shadows
- no perspective
- no strong AO

Keep the center gameplay area visually clean.
Keep boundary areas darker and denser only through ground color transitions, not through painted 3D objects.
Use a restrained palette: moss green, muted earth brown, warm gray stone, slightly desaturated fantasy colors.
Output should be flat top-down diffuse color only, suitable for later Height, Normal, AO, WalkableMask and DecorationMask generation.
```

---

## 十三、Height 提示词规范

Height 目标：

```text
黑白结构图
控制置换
不是法线图
不是光照图
不是 AO 图
```

Height 必须包含：

```text
道路高度
石板高度
平台高度
泥地低洼
草地轻微起伏
裂缝
石板缝
地表破损
边缘地形过渡
```

Height 不应包含：

```text
树高度
柱子高度
墙高度
建筑高度
箱子高度
NPC
纹理颜色
阴影
光照
```

模板：

```text
Create a 16:9 top-down orthographic HEIGHT MAP for a stylized 2.5D lowpoly toon game stage.

Output must be grayscale only.

This height map controls ground displacement only. It should describe ground structure, not vertical props.

Use clear height levels:
- black / very dark: low pits, deep cracks, non-walkable low areas
- dark gray: dirt and low ground
- mid gray: grass and normal ground
- light gray: stone road slabs
- brighter gray: raised stone platforms
- white: only small ground-level raised details, not tall props

Include:
- stone road slab height separation
- platform edges
- shallow depressions
- cracks and stone gaps
- low ground undulation
- readable large shapes
- clean stage layout

Do not include:
- trees
- walls
- pillars
- buildings
- arches
- boxes
- NPCs
- shadows
- AO
- lighting
- color
- perspective

Style should be clean, readable, with large blocky forms suitable for stylized lowpoly displacement.
Avoid noisy realistic terrain erosion.
Avoid excessive micro-detail.
```

---

## 十四、Semantic Control 提示词规范

这类图最好由工具绘制，不建议 AI 直接生成。  
但可提供辅助提示词，用于参考布局。

SemanticControl 必须是纯色，不允许渐变。

模板：

```text
Create a 16:9 top-down SEMANTIC CONTROL MAP for a stylized 2.5D game stage.

Use only flat solid colors from the following palette:
#3FA34D grass
#7A5A36 dirt
#6E6A62 stone_road
#D5CFC0 stone_platform
#1F5E36 boundary_grass
#2D4F73 water_or_pit
#FFFFFF clear_zone
#FF0000 ruin_anchor
#00FF00 nature_anchor
#FFFF00 interact_anchor
#FF00FF npc_anchor
#00FFFF special_anchor

No gradients.
No anti-aliasing.
No texture details.
No lighting.
No shadows.
No characters.
No text.

Design a readable stage layout:
- central clean battle / interaction zone
- main stone road
- grass and dirt transition
- outer boundary zone
- a few colored anchor dots for props
```

注意：AI 生成的 SemanticControl 可能有抗锯齿和颜色漂移，所以工具必须提供颜色归一化功能：

```text
Normalize Colors
将接近标准色的像素吸附到最近标准语义色。
```

---

## 十五、前端功能列表

`StageLabPage.tsx` 第一版功能：

```text
1. 新建 Stage
2. 选择 Stage 类型
3. 选择尺寸：S / M / L / 自定义
4. 上传 BaseColor
5. 上传 Height
6. 新建 / 编辑 SemanticControl
7. 保存 SemanticControl
8. 生成标准化提示词
9. 生成 WalkableMask
10. 生成 DecorationMask
11. 识别 PropAnchors
12. 保存 stage.json
13. 预览所有贴图
```

暂时不做：

```text
1. 不做完整 3D Unity Stage 导出
2. 不做自动生成 FBX
3. 不做复杂 3D 预览
4. 不做道具模型自动实例化
```

---

## 十六、后端 API 设计

新增路由：

```text
server/routes/terrainStage.ts
```

建议 API：

### 创建 Stage

```http
POST /api/terrain/stages
```

请求：

```json
{
  "stageName": "RuinRoad_01",
  "displayName": "遗迹道路测试场景 01",
  "stageType": "ruin_road",
  "worldSize": { "width": 32, "height": 18 },
  "resolution": { "width": 2048, "height": 1152 }
}
```

返回：

```json
{
  "ok": true,
  "stage": {}
}
```

### 读取 Stage

```http
GET /api/terrain/stages/:stageName
```

### 保存 Stage

```http
PUT /api/terrain/stages/:stageName
```

### 上传贴图

```http
POST /api/terrain/stages/:stageName/textures/:slot
```

slot：

```text
baseColor
height
semanticControl
normal
ao
walkableMask
decorationMask
propAnchorMask
```

### 保存 SemanticControl

```http
POST /api/terrain/stages/:stageName/semantic
```

### 生成派生 Mask

```http
POST /api/terrain/stages/:stageName/generate-masks
```

请求：

```json
{
  "generateWalkable": true,
  "generateDecoration": true,
  "detectAnchors": true
}
```

### 生成提示词

```http
POST /api/terrain/stages/:stageName/generate-prompt
```

请求：

```json
{
  "type": "basecolor",
  "stageType": "ruin_road",
  "style": "lowpoly_toon_fantasy_ruins"
}
```

返回：

```json
{
  "ok": true,
  "prompt": "..."
}
```

---

## 十七、颜色识别与归一化

必须实现颜色归一化函数：

```text
normalizeSemanticColors(image, palette, tolerance)
```

逻辑：

```text
1. 遍历像素
2. 计算该像素与所有标准色的 RGB 距离
3. 如果距离小于 tolerance，替换为最近标准色
4. 如果距离过大，标记为 illegal color
5. 输出修正图和非法像素统计
```

默认：

```text
tolerance = 24
```

UI 显示：

```text
非法颜色数
已吸附颜色数
未识别颜色预览
一键修复
```

这对 AI 生成的 SemanticControl 特别重要。

---

## 十八、图像处理建议

后端可用现有图像处理库。当前项目如果已经使用 `sharp`，优先继续使用 `sharp`。

需要实现：

```text
1. 读取 PNG 像素
2. 颜色分类
3. 二值 Mask 输出
4. 膨胀 / 腐蚀
5. 简单噪声调制
6. 连通区域检测
```

如果第一版不想实现复杂形态学，可以先实现简化版本：

```text
dilate/erode 使用方形核
connected components 使用 BFS / DFS
noise 使用简单随机或 value noise
```

---

## 十九、MVP 开发阶段

### 阶段 A：Stage Lab 壳层 + Stage 项目

完成：

```text
getTerrainRoot + TerrainWorkspace 目录约定
server/routes/terrainStage.ts 挂载
地形生产视图「Stage Lab」入口（仿 Material Lab Modal）
Stage 列表 + 新建 Stage
stage.json 读写
贴图槽上传与显示（BaseColor / Height / SemanticControl）
```

**不在阶段 A 做：** 完整 SemanticMapEditor 画笔系统（留给阶段 B）。

### 阶段 B：Semantic Control Map Editor

完成：

```text
16:9 画布
调色板
画笔
橡皮
填充
锚点绘制
保存 SemanticControl.png
颜色归一化
```

### 阶段 C：Prompt 标准化

**部分完成（2026-06）：**

```text
多入口提示词模板（BaseColor / Height / Semantic 标注 / Semantic 布局参考）
生成后写入 prompts/*.md
追加 prompt_history.json
复制到剪贴板
```

待做：

```text
提示词在 UI 内预览/编辑后再保存
```

### 阶段 D：Mask 派生

**暂缓 / 实验性。** 设计注意：

```text
Mask 派生需考虑语义笔刷透明度（软边/半透明区域如何映射可走/装饰区）
WalkableMask / DecorationMask / PropAnchor 识别
```

锚点工具：**钢笔式单点放置**（非拖拽笔刷），见 SemanticMapEditor「锚点（钢笔）」。

### 阶段 B 余量

```text
语义层 / BaseColor 参考层透明度调节（预览用，保存仍为不透明语义色）
```

### 阶段 E：预览与导出

完成：

```text
Mask 预览
贴图对比
导出 Stage 包
基础 README
```

---

## 二十、验收标准

第一版验收：

```text
1. 地形 Tab 下可从生产视图打开 Stage Lab
2. Stage Lab 下可以新建 Stage
3. Stage 默认比例为 16:9
4. 可以上传 BaseColor / Height
5. 可以绘制 SemanticControl
6. 调色板颜色固定且可视化
7. 可以保存 SemanticControl.png
8. 可以生成 BaseColor 标准提示词
9. 可以生成 Height 标准提示词
10. 可以从 SemanticControl 生成 WalkableMask
11. 可以从 SemanticControl 生成 DecorationMask
12. 可以识别 PropAnchor 点并写入 stage.json
13. 所有输出文件按命名规范保存
14. 不影响现有 Material Lab 与地形模型（_Terrain）项目
```

---

## 二十四、前端挂载点（实现参考）

```text
client/src/App.tsx
  activeDomain === "terrain" && side === "blender"
    → FileToolbar.showStageLab = true
    → onOpenStageLab → <StageLabModal />

client/src/terrain/          # 新增，与 material-lab/ 平级
server/routes/terrainStage.ts
server/index.ts              → app.use("/api/terrain", terrainStageRouter)
```

Stage 项目 **不写入** `workspace.json` 的 `projects[]`（v0.1）；仅扫描 `TerrainWorkspace/stages/*/`.asset-manager/stage.json`。  
若日后需要与逻辑项目关联，可增加 `ProjectLink.stageLabPath` 或 `projectKind: "mesh" | "stage"`。

---

## 二十五、与 Material Lab 边界

| 工具 | 适用轨道 | 输入 | 输出 |
|------|----------|------|------|
| Material Lab | 地形模型 / 角色 | FBX + 角色向贴图槽 | Unity Toon 包 |
| Stage Lab | Stage 舞台 | 语义图 + Height + BaseColor | Mask + stage.json +（后续 Unity Stage 包） |

二者 **不共用** `material_lab.json`；Stage 使用 `stage.json`。

---


## 二十一、命名规范

Stage 名称：

```text
RuinRoad_01
TownGate_01
GrassBattle_01
StoneSquare_01
CampSite_01
```

贴图命名：

```text
T_<StageName>_BaseColor.png
T_<StageName>_Height.png
T_<StageName>_SemanticControl.png
T_<StageName>_Normal.png
T_<StageName>_AO.png
T_<StageName>_WalkableMask.png
T_<StageName>_DecorationMask.png
T_<StageName>_PropAnchorMask.png
```

目录命名：

```text
TerrainWorkspace/stages/<StageName>/
```

---

## 二十二、产品定义

Stage Lab 是 **多入口、语义归一** 的风格化 2.5D 场景生产工具。

更完整表述：

```text
Stage Lab 支持从 SemanticControl、BaseColor、Height 或已有混合素材进入场景生产流程，并最终统一整理为标准 Stage 数据结构。SemanticControl 是推荐的结构语义层，用于稳定派生 WalkableMask、DecorationMask 和 PropAnchor，但不强制作为唯一创作起点。
```

工作流模式（`stage.json.workflowMode`）仅记录主要创作入口，不限制功能：

```text
semantic_first | basecolor_first | height_first | hybrid
```

核心原则：**工具不强迫创作顺序；根据已有素材提供下一步建议（缺什么补什么）。**

---

## 二十三、最终目标

该模块服务于用户当前的游戏结构：

```text
骑砍式大陆移动
+
2.5D 城邦访问
+
回合制战斗视角
```

Stage Lab 生产的不是开放大世界地形，而是：

```text
16:9 可控舞台场景
```

适用场景：

```text
野外遭遇
遗迹入口
城邦广场
草地战斗场
营地
任务节点
Boss 场景
```

核心原则：

```text
BaseColor 负责视觉地表
Height 负责地表结构
SemanticControl 负责机器语义
Derived Masks 由程序生成
柱子、断墙、树、建筑、NPC 等作为独立资产处理
```

本次开发请以 Stage Lab v0.1 为目标，优先保证工具可用、流程清晰、命名规范稳定。
