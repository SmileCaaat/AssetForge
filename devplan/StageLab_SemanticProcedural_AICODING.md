# Stage Lab · 语义程序化生成（Semantic Procedural）— AI 优化交接说明

> 本文档供外部 AI（如 Claude）读取后，对 **Stage Lab 语义图随机/融合生成** 模块进行优化、调参或扩展。  
> 仓库：`Asset ManagerTools`（本地桌面路径因用户而异，以 git 根目录为准）

---

## 〇、用户实际生产管线（外部工具 · 必读）

Stage Lab **不负责** Height / Normal / AO 等贴图的最终 AI 生成；用户当前工作流如下。

### 0.1 总览

```
Stage Lab（本仓库）
  ├─ SemanticControl.png   ← 手绘 / 程序化随机 / 融合修饰
  ├─ 标准提示词            ← stagePrompts.ts，复制到剪贴板
  └─（可选）概念侧镜像      ← ConceptWorkspace/.../stage-lab/<Stage>/textures/

        ↓ 语义图 +「BaseColor（语义约束）」提示词

Image2（外部）
  └─ 生成 BaseColor 地面贴图（严格跟随语义布局）

        ↓ 上传 BaseColor

TextureWiz Wizard（外部）
  https://wizard.texturewiz.com/
  └─ 由 BaseColor 派生其余 PBR 纹理（Height、Normal、AO 等）

        ↓ 回传 Stage Lab / TerrainWorkspace

TerrainWorkspace/stages/<Stage>/textures/
  T_<Stage>_BaseColor.png
  T_<Stage>_Height.png
  T_<Stage>_Normal.png
  T_<Stage>_AO.png
  …
```

### 0.2 各阶段职责边界

| 阶段 | 工具 | 输入 | 输出 | 本仓库是否实现 |
|------|------|------|------|----------------|
| 语义布局 | **Stage Lab** | 手绘 / 程序化生成 | `SemanticControl.png` | ✅ |
| 提示词 | **Stage Lab** | `stage.json` + 语义状态 | `prompts/*.md`、剪贴板 | ✅（阶段 C） |
| BaseColor | **Image2**（外部） | 语义图 + 提示词 | BaseColor PNG | ❌ 不在此生成 |
| Height/Normal/AO 等 | **[TextureWiz Wizard](https://wizard.texturewiz.com/)**（外部） | BaseColor（+ 可选语义参考） | 其余贴图 | ❌ 不在此生成 |
| Mask 派生 | Stage Lab（规划） | SemanticControl | WalkableMask 等 | ⏳ 阶段 D 暂缓 |

### 0.3 对语义图 / 程序化生成的含义（优化时请遵守）

1. **SemanticControl 是 Image2 的结构约束图**，不是最终美术图。区域边界清晰、色块大块、少碎噪，比「好看的颜色」更重要。
2. **边界深草不能做成工整相框** — Image2 会把它当成画面边框（用户已踩坑）。
3. **石质通道要够宽、够连续** — 否则 Image2 BaseColor 里道路会断成细线或消失。
4. **战斗净区 `clear_zone` 手动画** — 白区表示「无地表装饰 / 战斗站位」，Image2 提示词要求地面 only；净区由人定，程序不自动生成。
5. **提示词与调色板 hex 必须一致** — 见 `client/src/terrain/stagePrompts.ts`（如 `semantic_to_basecolor`）；改调色板须同步提示词。
6. **TextureWiz 阶段不再改语义** — 优化语义生成器时，优先考虑「Image2 能否读懂布局」和「TextureWiz 吃 BaseColor 是否稳定」，而非在 Semantic 图上追求写实细节。

### 0.4 相关仓库文件（提示词链路）

| 路径 | 说明 |
|------|------|
| `client/src/terrain/stagePrompts.ts` | **UI 仅一种**提示词：`semantic_to_basecolor` |
| `client/src/terrain/stageActions.ts` | 建议操作（4 项）与核心槽状态 |
| `client/src/terrain/stagePromptService.ts` | 客户端生成并保存提示词 |
| `client/src/terrain/StagePromptHistoryPanel.tsx` | 历史提示词 UI |
| `server/services/stagePromptService.ts` | 服务端写入；**仅** `semantic_to_basecolor` |
| `server/services/stageConceptMirror.ts` | SemanticControl / BaseColor 同步概念目录 |

### 0.4b Stage Lab UI 精简（2026-06 · 深度 A）

| 项目 | 现状 |
|------|------|
| 贴图槽 UI | 仅 `semanticControl` + `baseColor` |
| 提示词 | 仅 `semantic_to_basecolor` |
| 建议操作 | 4 项 |
| 程序化生成 | 完整保留 |
| BaseColor 参考叠加 | 保留 |

### 0.4c stage.json 收敛（2026-06 · 深度 B · 已完成）

| 项目 | 现状 |
|------|------|
| `stage.json` version | **2** |
| `textures` | 仅 `semanticControl` + `baseColor` |
| 已删 | `generation`、`workflowMode`、`propAnchors`、mask/height/normal/ao 路径 |
| 迁移 | `migrateStageJson()` — list/load 时 v1→v2 自动写回 |
| Mask 派生 | **不做**（概念未验证） |
| TextureWiz 产出 | Blender 消费，不进 `stage.json` |

### 0.5 用户完整操作顺序（推荐）

1. Stage Lab：随机布局 / 手修 → **保存 SemanticControl**
2. Stage Lab：生成 **「BaseColor（语义约束）」** 提示词 → 复制
3. **Image2**：上传 SemanticControl + 粘贴提示词 → 生成 BaseColor → 下载
4. Stage Lab：**上传 BaseColor** 到当前 Stage
5. 打开 **https://wizard.texturewiz.com/** → 用 BaseColor 生成 Height / Normal / AO 等
6. 将 TextureWiz 产出导入 **Blender**（不经 Stage Lab 贴图槽）

---

## 一、必读文件路径（按优先级）

| 优先级 | 路径 | 职责 |
|--------|------|------|
| **P0** | `client/src/terrain/semanticProcedural.ts` | **核心算子**：区域随机生成、融合修饰、噪声、形态学、MST 通道、异步进度 |
| **P0** | `client/src/terrain/SemanticMapEditor.tsx` | **UI 挂载**：生成面板、尺度预设、进度条、调用 `applySemanticProceduralAsync` |
| **P1** | `client/src/terrain/semanticColor.ts` | 调色板解析、`snapImageDataToPalette`、旧色迁移、洪水填充 |
| **P1** | `client/src/terrain/terrainTypes.ts` | `SemanticPalette`、`StageJson`（v2，2 槽）等类型 |
| **P1** | `client/src/styles.css` | 搜索 `.semantic-procedural`、`.semantic-proc-progress` |
| **P2** | `client/src/terrain/StageLabModal.tsx` | Stage Lab 壳层，嵌入 `SemanticMapEditor` |
| **P2** | `server/templates/terrain/semantic_palette.json` | 服务端调色板模板（新建 Stage 时复制） |
| **P2** | `devplan/AssetForge_Terrain_StageLab_AICODING.md` | Stage Lab 整体产品/阶段规划（§十八 图像处理、阶段 D Mask） |

**不要改动的边界（除非用户明确要求）：**

- `client/src/material-lab/` — Material Lab 独立轨道
- 地形模型 `_Terrain` 项目逻辑
- 已有手绘 SemanticControl 的调色板 id（`stone_road` / `stone_platform` 等 id 不变，只调 hex）

---

## 二、产品定位（用户已确认）

### 2.1 不是什么

- **不是大陆级噪声贴图**：用户反馈早期版本像「整图碎斑 + 细线网」，不符合 2.5D **单舞台** 手绘尺度。
- **不自动生成战斗/交互净区**：`clear_zone`（`#FFFFFF` 战斗/交互净区）必须 **手动画**；程序化生成不得覆盖已有净区与道具锚点色。

### 2.2 是什么

两类能力，UI 上分两行面板：

1. **区域随机生成** — 整块语义区域（台地、通道、边界、泥地）
2. **融合修饰** — 在已有语义交界做描边、间隙、撒点、过渡

用户手绘参考尺度：**少量大团块 + 宽通道 + 不规则边界深草**（非工整矩形画框）。

### 2.3 典型工作流（Stage Lab 内）

```
选尺度「紧凑（手绘）」→ 随机舞台布局 → 改种子迭代
→ 手修局部 / 手画战斗净区
→ 融合修饰（草缘、通道↔台地草隙等）
→ 保存 SemanticControl.png
→ 生成「BaseColor（语义约束）」提示词 → Image2 出 BaseColor
→ TextureWiz Wizard 出 Height / Normal / AO 等 → Blender
```

完整外部管线见 **§〇**。

---

## 三、语义调色板（固定离散色）

权威定义：`server/templates/terrain/semantic_palette.json`  
客户端默认：`client/src/terrain/semanticColor.ts` → `DEFAULT_SEMANTIC_PALETTE`

| id | 中文 | hex | 程序化中的角色 |
|----|------|-----|----------------|
| `grass` | 普通草地 | `#3FA34D` | 默认底图 |
| `dirt` | 泥地 | `#7A5A36` | 可选低频泥斑（紧凑尺度布局默认不铺） |
| `stone_road` | 石质通道 | `#6E6A62` | MST 连接主台地，需 **足够宽** |
| `stone_platform` | 石质台地 | `#D5CFC0` | fBm 大团块 |
| `boundary_grass` | 边界深草 | `#1F5E36` | 有机边缘带，**不能像 PNG 边框** |
| `water_or_pit` | 水体/深坑 | `#2D4F73` | 当前生成器未自动铺（可扩展） |
| `clear_zone` | 战斗/交互净区 | `#FFFFFF` | **保护，不生成** |
| `*_anchor` | 道具锚点 | 红/绿/黄等 | **保护，不覆盖** |

保存时所有像素经 `snapImageDataToPalette` 归一化到上表。

---

## 四、核心 API（`semanticProcedural.ts`）

### 4.1 类型

```ts
SemanticLayoutScale = "compact" | "standard" | "expansive"
SemanticRegionRecipe  // 区域随机
SemanticFusionRecipe  // 融合修饰
SemanticProceduralRecipe = Region | Fusion

ProceduralOptions {
  seed?, layoutScale?, platformCount?, roadWidth?, boundaryMargin?,
  featureScale?, scatterDensity?, scatterScale?,
  fringeWidth?, gapWidth?, gapBreak?, transitionWidth?
}

ProceduralProgress { phase: string; percent: number }
```

### 4.2 入口函数

```ts
// 同步（融合修饰等轻量操作仍可用）
applySemanticProcedural(data, palette, recipe, options?): number

// 异步 + 进度（编辑器主路径）
applySemanticProceduralAsync(data, palette, recipe, options?, onProgress?): Promise<number>
```

返回值：**修改的像素数**（近似统计）。

### 4.3 区域随机 Recipe

| id | 说明 |
|----|------|
| `random_stage_layout` | 全流程：草地 → 有机边界 → 台地 → 通道 →（可选）泥地；覆盖画布但保护锚点+净区 |
| `random_platforms` | 仅在草地上叠加噪声台地团块 |
| `random_road_network` | 仅对已有 `stone_platform` 做 MST 通道 |
| `random_boundary` | 仅铺有机 `boundary_grass` |
| `random_dirt_fields` | 仅铺低频泥地区域 |

### 4.4 融合修饰 Recipe

| id | 说明 |
|----|------|
| `road_edge_grass` | 石道外缘草带，噪声宽度 + 随机断开 |
| `road_platform_gap` | 石道与台地膨胀重叠区填草隙 |
| `grass_dirt_scatter` | 草地内细颗粒泥斑（value noise） |
| `platform_edge_dirt` | 台地外缘泥过渡环 |

### 4.5 尺度预设 `SCALE_PRESETS`（2026-06 当前值）

| 字段 | compact | standard | expansive |
|------|---------|----------|-----------|
| platformCount | 4 | 5 | 6 |
| featureScale | 0.01 | 0.017 | 0.024 |
| roadWidth | 20 | 16 | 12 |
| boundaryMargin | 0.048 | 0.048 | 0.04 |
| fbmOctaves | 2 | 3 | 4 |
| smoothRadius | 7 | 4 | 2 |
| minAreaRatio | 0.014 | 0.006 | 0.0025 |
| dirtInLayout | false | true | true |

`resolveOpts()` 合并：DEFAULT → SCALE_PRESETS[layoutScale] → 用户 options。

---

## 五、关键算法（实现要点）

### 5.1 台地 `generatePlatformMask` / `generatePlatformMaskAsync`

1. 对排除区（边界深草等）外的像素做 **fBm** 阈值分割  
2. **形态学**：dilate → erode → dilate（`smoothRadius` 控制）  
3. 连通域过滤：`area >= width*height*minAreaRatio`  
4. 保留面积最大的前 `platformCount` 个团块  

**已知问题/优化方向：**

- 高分辨率（如 1920×1080）下 `featureScale` 与 `minAreaRatio` 的联动仍需按分辨率归一化验证  
- 用户希望团块更「手绘大块」，少碎屑

### 5.2 通道 `buildRoadNetworkMask`

1. 对台地 mask 取连通域，过滤小面积，**按面积排序取前 `platformCount` 个**  
2. 质心之间 **最小生成树（MST）** 连线  
3. `drawThickLine` + `stampDisk`，半径 `resolveRoadRadius(width, height, roadWidth)`  
4. 减去台地后 **dilate 2px** 再加宽  

**已知问题/优化方向：**

- 通道仍可能偏直、偏「路网感」；可考虑曲线路径或沿噪声脊线  
- MST 只连主台地是对的，不要连回碎屑

### 5.3 边界深草 `buildOrganicBoundaryMask`

替代旧版矩形 `buildBoundaryMask`：

1. 算到画布边缘距离 `distEdge`  
2. fBm 调制边缘深度 `edgeDepth = baseMargin + wave`  
3. 多层随机缺口，内缘更多草地透出  
4. dilate/erode 平滑  

**已知问题/优化方向：**

- 用户曾反馈 AI 把边界当成「图片边框」；需保持 **参差 + 缺口**，避免四边等宽实心框  
- 可考虑仅在某些边生成深草，或角部加重

### 5.4 保护像素 `snapshotProtectedPixels`

保护：

- 所有 `isAnchorColor` 的锚点色  
- `clear_zone` 战斗/交互净区  

`random_stage_layout` 先 `fillColor(grass)` 再 `restoreProtectedPixels`。

### 5.5 异步进度 `applySemanticProceduralAsync`

- `random_stage_layout`：分阶段 `reportProgress` + `yieldUi()`（`setTimeout(0)`）  
- 边界、台地生成按 **行块** 让出主线程，驱动进度条  
- 融合修饰：短进度 0→100%

---

## 六、UI 集成（`SemanticMapEditor.tsx` + Stage Lab 壳层）

### 6.0 Stage Lab 三栏结构（精简后）

```
StageLabModal.tsx
├── 左栏：StageListPanel + NewStageForm + StageStatusPanel + StagePromptHistoryPanel
├── 中栏：SemanticMapEditor（画笔 + 区域随机 + 融合修饰 + BaseColor 参考叠加）
└── 右栏：StageTexturePanel（仅 SemanticControl / BaseColor）+ SemanticPalettePanel
```

`StageStatusPanel` 建议操作仅 4 项，见 `stageActions.ts`。不再显示 Normal/AO/Mask/Height 相关占位按钮。

### 6.1 状态

```ts
procSeed, procLayoutScale, procPlatformCount, procRoadWidth, procDensity
procFringe, procGap  // 融合用
procRunning, procProgress
```

### 6.2 面板结构

1. **区域随机生成**：尺度三按钮 + 种子/台地/通道/泥地滑块 + 5 个 region 按钮  
2. **融合修饰**：草缘/草隙滑块 + 4 个 fusion 按钮  
3. **进度条**：`procRunning && procProgress` 时显示  

### 6.3 调用链

```
onClick → applyProcedural(recipe)
  → confirm（仅 random_stage_layout）
  → pushUndo()
  → getImageData
  → applySemanticProceduralAsync(..., setProcProgress)
  → snapImageDataToPalette
  → putImageData + blitToDisplay
```

---

## 七、Stage 数据与文件落盘

```
TerrainWorkspace/stages/<StageName>/
  textures/T_<StageName>_SemanticControl.png   # 权威语义图
  .asset-manager/semantic_palette.json
  .asset-manager/stage.json

概念镜像（可选）:
ConceptWorkspace/<conceptPath>/stage-lab/<StageName>/textures/...
```

典型 Stage 分辨率：**16:9**（如 1920×1080，以 `stage.json` → `resolution` 为准）。

---

## 八、用户已反馈的问题与优化清单（优先级）

### P0 — 已做，可继续打磨

- [x] 区域随机 vs 融合分离  
- [x] 三种尺度预设（默认 compact）  
- [x] 不生成、不覆盖 `clear_zone`  
- [x] 通道加宽 + 只连主台地  
- [x] 有机边界（非矩形框）  
- [x] 异步进度条  

### P1 — 建议 Claude 重点优化

1. **分辨率自适应**：`featureScale`、`roadWidth`、`minAreaRatio` 应统一基于 `min(width,height)` 归一化，避免 4K 与 720p 观感不一致  
2. **手绘尺度台地**：参考用户手绘（少量大绿块/台地 + 宽灰通道），减少全局碎噪  
3. **通道形态**：直线 MST → 可选贝塞尔/噪声偏移，减少「电路板」感  
4. **边界深草**：进一步降低「相框」概率；角部/边部分布可不对称  
5. **泥地**：紧凑布局默认关闭；开启时用 **大块** 低频 fBm，禁止满图麻点  
6. **性能**：1920×1080 全图 fBm 多遍仍可能卡顿；可考虑 Web Worker 或 OffscreenCanvas  

### P2 — 扩展（未做）

- 水体/深坑 `water_or_pit` 区域生成  
- 矩形/套索选区限定生成范围  
- 多步配方：`布局 → 自动草缘 → 自动草隙` 一键流水线  
- 与阶段 D `WalkableMask` 共用形态学（`server/` 侧 Mask 派生）  
- 旧图色迁移工具（`#9D9A8C` → `#6E6A62` 批量重映射）

---

## 九、开发与验证

```bash
# 仓库根目录
npm run dev          # 同时起 client + server
npm run build        # 必须通过

# 入口
地形项目 → Blender 侧 → Stage Lab → 打开某 Stage → Semantic Control Map 编辑器
```

**验收检查表：**

1. 「紧凑（手绘）」+「随机舞台布局」→ 少量大台地，非满图碎斑  
2. 石质通道目视明显宽于 1–2px 细线  
3. 边界深草不规则，不像 PNG 透明边  
4. 已有白色战斗净区、锚点色在布局后仍存在  
5. 生成时进度条阶段文本连续更新  
6. Ctrl+Z 可撤销生成结果  
7. 保存后 PNG 颜色全部落在调色板 hex 上  

---

## 十、代码风格约束

- 与现有 `client/src/terrain/` 风格一致：少抽象、少新依赖  
- 像素操作优先纯 TS + `ImageData`，不引入 Canvas 以外的图像库（前端无 sharp）  
- 新 recipe 需同步：`REGION_RECIPE_LABELS` / `FUSION_RECIPE_LABELS` + UI 按钮 + `applySemanticProceduralAsync` switch  
- 中文 UI 标签与 `stagePrompts.ts` 语义描述保持一致  
- 不要 commit，除非用户明确要求  

---

## 十一、给 Claude 的推荐任务描述（可直接复制）

```
请阅读并优化 Asset ManagerTools 的 Stage Lab 语义程序化生成模块。

必读：
- devplan/StageLab_SemanticProcedural_AICODING.md（含 §〇 生产管线、§0.4b UI 精简状态）
- devplan/AssetForge_Terrain_StageLab_AICODING.md（§当前实现状态）
- client/src/terrain/semanticProcedural.ts
- client/src/terrain/SemanticMapEditor.tsx
- client/src/terrain/stagePrompts.ts（UI 仅 semantic_to_basecolor 一种）

用户实际生产管线（人工，勿在仓库集成 Image2/TextureWiz API）：
1. Stage Lab：SemanticControl（手绘/程序化）+ BaseColor（语义约束）提示词
2. Image2：语义图 + 提示词 → BaseColor
3. https://wizard.texturewiz.com/ ：BaseColor → Height / Normal / AO 等 → Blender

Stage Lab 已收敛（深度 A+B）：UI 仅 SemanticControl+BaseColor；`stage.json` v2 仅 2 纹理槽；提示词/API 仅 `semantic_to_basecolor`。Mask 派生与 Height 等槽位**不要恢复**。TextureWiz 产出进 Blender，不进 stage.json。

优化目标：
1. 「紧凑（手绘）」random_stage_layout：大团块、宽石道、有机边界，利于 Image2 读布局
2. 保护 clear_zone 与锚点色
3. 异步进度条；npm run build 通过
4. 与 stagePrompts.ts 调色板描述一致

不要：Material Lab、Image2/TextureWiz 集成、恢复臃肿占位 UI、未经要求的 git commit
```

---

*文档版本：2026-06 · 语义程序化生成 + Stage Lab 收敛（深度 A+B）*
