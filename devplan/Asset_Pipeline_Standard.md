# 角色资产标准化生产流程 (Asset Pipeline Standard)

基于 `stonemork` 和 `Punchgob` 两个角色项目的实际生产流程总结，作为后续所有角色资产的标准模板。
本文档同时作为后续"资产管理工具"的字段/规则参考依据。

---

## 1. 项目目录结构

每个角色项目位于 `projects/<ProjectName>/`，结构固定如下：

```
projects/<ProjectName>/
├── <ProjectName>.blend            # 主工作文件
├── animations/
│   └── mixamo/                    # Mixamo "With Skin" 导出的动画FBX源文件（小写命名）
│       ├── T-Pose.fbx
│       ├── idle.fbx
│       ├── walk.fbx
│       ├── run.fbx
│       ├── attack.fbx
│       ├── defend.fbx
│       ├── hit.fbx
│       ├── magic.fbx
│       ├── combatidle.fbx
│       └── death.fbx
├── backups/                       # 阶段性 .blend 备份
├── exports/                       # 最终交付文件
│   ├── SM_<ProjectName>.fbx       # 带骨骼+全部动作，精简版（无描边）
│   └── SM_<ProjectName>_Low.fbx   # 纯网格（上传Mixamo用，临时产物）
├── references/                    # 参考资料 / Shader文档
│   └── Toon_Shader_<ProjectName>.md
├── renders/                       # 截图 / 预览渲染
└── textures/
    ├── T_<ProjectName>_BaseColor.png
    ├── T_<ProjectName>_Normal.png
    ├── T_<ProjectName>_MetallicSmoothness.png
    └── source/                    # 原始未优化贴图源文件（不被材质引用，仅供重新烘焙）
```

---

## 2. 命名规范

### 2.1 对象命名 (Objects)

| 类型 | 命名规则 | 示例 |
|---|---|---|
| 骨骼(Armature) | `RIG_<Name>` | `RIG_Punchgob` |
| 低模(导出/游戏用) | `SM_<Name>_Low` | `SM_Punchgob_Low` |
| 高模(参考/烘焙源，可隐藏) | `SM_<Name>_High` | `SM_Punchgob_High` |

### 2.2 材质命名 (Materials)

| 类型 | 命名规则 | 示例 |
|---|---|---|
| 主材质 | `M_<Name>` | `M_Punchgob` |
| 描边材质(可选，纯黑Emission+背面剔除) | `M_<Name>_Outline` | `M_Punchgob_Outline` |

### 2.3 贴图命名 (Textures) — `T_<Name>_<Type>`

| 贴图类型 | 文件名 | 推荐分辨率 | 色彩空间 | 说明 |
|---|---|---|---|---|
| 基础色 | `T_<Name>_BaseColor.png` | 2048 | sRGB | **AO 烘焙进去**（ColorRamp对比拉伸0.25→0.35灰/0.85→白 + Multiply Fac=0.6） |
| 法线 | `T_<Name>_Normal.png` | 2048 | Non-Color | **Height细节烘焙进去**（RNM混合，Strength≈0.3） |
| 金属度+光滑度 | `T_<Name>_MetallicSmoothness.png` | 1024 | Non-Color | R=Metallic, A=Smoothness(=1-Roughness)，符合Unity Standard/Lit的MetallicMap通道约定 |
| (可选)自发光 | `T_<Name>_Emission.png` | 按需 | sRGB | 按需追加 |

> 原始/未处理贴图统一放入 `textures/source/`，沿用其原始命名即可，不强制规范，仅作为以后重新烘焙的源文件。

### 2.4 动作 (Action) 命名

| 用途 | 命名 | 备注 |
|---|---|---|
| 绑定姿势 | `A_00_BindPose` | 1帧，T-Pose对应的静止姿态，identity变换 |
| 待机 | `A_Idle` | |
| 走路 | `A_Walk` | 需检查根骨骼是否原地循环 |
| 奔跑 | `A_Run` | 需检查根骨骼是否原地循环 |
| 攻击 | `A_Attack` | |
| 防御 | `A_Defend` | |
| 受击 | `A_Hit` | |
| 技能/魔法 | `A_Magic` | |
| 战斗待机 | `A_CombatIdle` | |
| 死亡 | `A_Death` | |

> Action数量按角色实际需求可增减，但已存在的命名前缀 `A_` + 驼峰命名为固定规则。

### 2.5 导出文件命名

| 文件 | 路径 | 用途 |
|---|---|---|
| 纯网格(Mixamo上传用) | `exports/SM_<Name>_Low.fbx` | mesh-only，无修改器，无骨骼 |
| 最终交付(带骨骼+动画) | `exports/SM_<Name>.fbx` | 全部Action，关闭描边Solidify修改器 |

### 2.6 概念工作区命名 (ConceptWorkspace)

概念阶段文件放在 `<ConceptRoot>/<项目名>/`（与 Blender 侧 `projects/<Name>/` 逻辑关联）。**资产管理器**在概念侧提供一键标记并重命名，规则如下（`<Name>` 为项目 displayName）：

| 标记 | 适用 | 命名规则 | 数量 |
|---|---|---|---|
| 立绘 | 图片 | `<Name>_KeyArt.{ext}` | 每项目 1 个 |
| 多视图 | 图片 | `<Name>_MultiView_01.{ext}`、`_02`… | 可多个 |
| 高模 | 3D 模型 (FBX 等) | `<Name>_High.{ext}` | 每项目 1 个 |
| 低模 | 3D 模型 (FBX 等) | `<Name>_Low.{ext}` | 每项目 1 个 |

标记元数据写入 `<概念项目>/.asset-manager/concept_tags.json`。工具启动或保存时会扫描磁盘，按上述文件名自动补全标签。

> 概念侧高/低模文件名与 Blender 侧 `SM_<Name>_High` / `SM_<Name>_Low` **对象名**不同，但语义对应；进入生产流程后应使用第 2.1 / 2.5 节规范。

---

## 3. 动画准备规范 (Mixamo 流程)

1. 用 `exports/SM_<Name>_Low.fbx`（mesh-only，`axis_forward='-Z'`, `axis_up='Y'`, `embed_textures=True`）上传 Mixamo。
2. 在 Mixamo 中选择 **"With Skin"** 下载所有需要的动作，统一放入 `animations/mixamo/`，文件名**小写**：
   - `T-Pose.fbx`（必须，作为骨骼绑定基准和BindPose来源）
   - 其余动作按第2.4节命名对应（小写、去掉`A_`前缀）：`idle.fbx`、`walk.fbx`、`run.fbx`、`attack.fbx`、`defend.fbx`、`hit.fbx`、`magic.fbx`、`combatidle.fbx`、`death.fbx`
3. Mixamo标准骨架：25个骨骼（`mixamorig:Hips` ~ `*_Toe_End`），其中22个参与蒙皮（3个末端骨骼`HeadTop_End`/`LeftToe_End`/`RightToe_End`不参与蒙皮）。
4. 导入与适配流程：
   - 先导入 `T-Pose.fbx`，作为 `RIG_<Name>` 和 `SM_<Name>_Low` 的基准（重命名对象、配置材质槎/修改器/顶点组）。
   - 逐个导入其余动画FBX：
     - 对比rest pose（每根骨骼的local rotation差异角度应为 **0°**），确认骨架完全兼容。
     - 用 **direct fcurve copy** 方式将动作迁移到主Rig（不重新蒙皮），新建Action并设置 `slots[0].identifier = "OBArmature|mixamo.com|Layer0"`，确保FBX导出时正确烘焙。
   - 创建 `A_00_BindPose`：基于T-Pose生成的1帧、所有骨骼为identity变换的Action。
5. 校验：
   - **根运动检查**：对 `A_Walk` / `A_Run`，比较 `Hips` 骨骼在动作首尾帧的世界坐标，`delta ≈ 0` 表示原地循环；若需要位移版本，再额外制作InPlace变体。
   - **整体姿态检查**：将Rig切到 `A_Idle` 第1帧，截图确认蒙皮变形正常。
6. 清理：
   - 删除Mixamo导入产生的临时Armature对象。
   - 清理 `bpy.data.actions` 中以 `Armature` 开头且 `users == 0` 的残留Action（如T-Pose的1~2帧静态Action）。
   - Purge所有 `users == 0` 的孤立 mesh/armature/material/image数据块。

---

## 4. 材质 / 贴图规范

### 4.1 PBR基础贴图优化（必做）

- **AO** → 烘焙进 BaseColor：ColorRamp对比拉伸（0.25→0.35灰, 0.85→白，Linear）+ `Lerp(BaseColor, BaseColor*AO_remap, 0.6)`
- **Height** → 烘焙进 Normal：用 Reoriented Normal Mapping (RNM) 按 Bump Strength（约0.3）混合
- **Roughness + Metallic** → 打包为单张 `T_<Name>_MetallicSmoothness.png`（R=Metallic, A=1-Roughness）
- 最终交付贴图精简至 **2~3张**：BaseColor / Normal /（MetallicSmoothness，如不需要PBR可省略）
- 分辨率：BaseColor/Normal默认 **2048**，MetallicSmoothness默认 **1024**（角色顶点数较低、风格化渲染会posterize细节，4096通常没有必要）
- 原始4096源贴图归档至 `textures/source/`

### 4.2 卡通风格化Shader标准节点链（可选，风格化角色使用）

适用于需要 toon/cel-shading 渲染风格的角色，节点链固定为：

```
T_<Name>_BaseColor ──▶ HueSaturation(Sat×1.35, Val×1.05) ──▶ BrightContrast(Contrast+0.15)
                                                                      │
                                                              StylizedBaseColor
                                                                      │
        ┌─────────────────────────────────────────────────────────┘
        │
        ▼
  Multiply × CelShading(ColorRamp Constant: 0.00→0.35 / 0.45→0.70 / 0.80→1.00, 输入=ShaderToRGB→RGBToBW)
        │
        ▼
   Emission(主体颜色)
        │
  ┌─────┴─────────────────────────────┐
  │  Fresnel(IOR=1.3) → ColorRamp(0.55→黑/0.85→白) → Mix Shader Fac
  │  RimEmission(暖色，强度2.5) ───────────────────┘
  ▼
最终输出
```

描边（可选）：`Solidify`修改器（`Thickness`≈模型整体高度的1%~1.5%，`Offset=-1`，`Flip Normals=True`，`Material Offset=1`指向纯黑+背面剔除的 `M_<Name>_Outline` 材质）。

> 每个风格化项目需在 `references/Toon_Shader_<Name>.md` 中记录该角色的具体参数值（ColorRamp位置/颜色、Fresnel IOR、描边厚度等），供Unity端复刻。

---

## 5. FBX 导出参数标准

### 5.1 纯网格导出（上传Mixamo用）

```python
bpy.ops.export_scene.fbx(
    filepath=export_path,
    use_selection=True,
    object_types={'MESH'},
    use_mesh_modifiers=False,   # 排除Solidify描边等附加修改器
    mesh_smooth_type='FACE',
    path_mode='COPY',
    embed_textures=True,
    axis_forward='-Z',
    axis_up='Y',
)
```

### 5.2 最终带骨骼动画导出

```python
bpy.ops.export_scene.fbx(
    filepath=export_path,
    use_selection=True,
    object_types={'ARMATURE', 'MESH'},
    use_mesh_modifiers=True,
    mesh_smooth_type='FACE',
    add_leaf_bones=False,
    bake_anim=True,
    bake_anim_use_all_bones=True,
    bake_anim_use_all_actions=True,
    bake_anim_use_nla_strips=False,
    bake_anim_force_startend_keying=True,
    bake_anim_simplify_factor=1.0,
    use_armature_deform_only=True,
    armature_nodetype='NULL',
    primary_bone_axis='Y',
    secondary_bone_axis='X',
    path_mode='COPY',
    embed_textures=True,
    axis_forward='-Z',
    axis_up='Y',
)
```

- 导出前临时关闭描边 `Solidify` 修改器（`show_viewport=False`, `show_render=False`），导出后恢复。

### 5.3 导出验证（必做）

重新导入导出的FBX并核对：
- 顶点数 / 面数 / 材质槎数 / 顶点组数量与原模型一致
- 所有Action的帧范围(`frame_range`)与fcurve数量与原始一致
- 抽样关键帧数值（`fcurve.evaluate(frame)`）与原始Action一致

验证完成后清理所有临时导入的对象、Action、网格、骨架、材质、图像数据块（`users == 0`即可purge）。

---

## 6. 工作流检查清单 (Checklist)

- [ ] 项目目录结构已创建（`animations/mixamo`, `backups`, `exports`, `references`, `renders`, `textures/source`）
- [ ] 模型对象 / 材质已按2.1~2.2命名规范重命名
- [ ] 贴图已relink到本地 `textures/`，命名规范化（2.3）
- [ ] PBR贴图已优化（AO/Height烘焙、MetallicSmoothness打包，4.1）
- [ ] （如需要）卡通Shader已搭建并写入 `references/Toon_Shader_<Name>.md`
- [ ] `SM_<Name>_Low.fbx` 已导出用于上传Mixamo
- [ ] Mixamo "With Skin" 动作已下载并放入 `animations/mixamo/`
- [ ] 骨骼/动作已导入适配，rest pose校验通过（diff=0°）
- [ ] `A_00_BindPose` 已创建
- [ ] `A_Walk` / `A_Run` 根运动已检查
- [ ] `SM_<Name>.fbx` 已最终导出并通过重导入验证
- [ ] `.blend` 已保存

---

## 7. 资产管理工具 — 建议元数据字段

每个项目建议维护一份元数据（后续可做成 `project_meta.json` 或数据库记录），字段建议：

```jsonc
{
  "project_name": "Punchgob",
  "blend_path": "projects/Punchgob/Punchgob.blend",
  "rig": {
    "name": "RIG_Punchgob",
    "bone_count": 25,
    "deform_bone_count": 22
  },
  "meshes": [
    {
      "name": "SM_Punchgob_Low",
      "verts": 1865,
      "polys": 2154,
      "vertex_groups": 22,
      "modifiers": ["Armature", "Outline"],
      "materials": ["M_Punchgob", "M_Punchgob_Outline"]
    }
  ],
  "materials": [
    {
      "name": "M_Punchgob",
      "type": "toon",
      "doc": "references/Toon_Shader_Punchgob.md",
      "textures": ["T_Punchgob_BaseColor", "T_Punchgob_Normal", "T_Punchgob_MetallicSmoothness"]
    }
  ],
  "textures": [
    { "name": "T_Punchgob_BaseColor", "path": "textures/T_Punchgob_BaseColor.png", "resolution": 2048, "colorspace": "sRGB", "baked": ["AO"] },
    { "name": "T_Punchgob_Normal", "path": "textures/T_Punchgob_Normal.png", "resolution": 2048, "colorspace": "Non-Color", "baked": ["Height"] },
    { "name": "T_Punchgob_MetallicSmoothness", "path": "textures/T_Punchgob_MetallicSmoothness.png", "resolution": 1024, "colorspace": "Non-Color", "packed_from": ["Metallic", "Roughness"] }
  ],
  "actions": [
    { "name": "A_00_BindPose", "frame_range": [1, 1], "root_motion": false },
    { "name": "A_Idle", "frame_range": [1, 264], "root_motion": false },
    { "name": "A_Walk", "frame_range": [1, 43], "root_motion": false },
    { "name": "A_Run", "frame_range": [1, 24], "root_motion": false },
    { "name": "A_Attack", "frame_range": [1, 37], "root_motion": false },
    { "name": "A_Defend", "frame_range": [1, 38], "root_motion": false },
    { "name": "A_Hit", "frame_range": [1, 36], "root_motion": false },
    { "name": "A_Magic", "frame_range": [1, 66], "root_motion": false },
    { "name": "A_CombatIdle", "frame_range": [1, 110], "root_motion": false },
    { "name": "A_Death", "frame_range": [1, 53], "root_motion": false }
  ],
  "exports": [
    { "path": "exports/SM_Punchgob_Low.fbx", "type": "mesh_only", "verified": true },
    { "path": "exports/SM_Punchgob.fbx", "type": "rigged", "verified": true }
  ],
  "checklist": {
    "folder_structure": true,
    "naming": true,
    "texture_optimized": true,
    "toon_shader_documented": true,
    "low_exported": true,
    "mixamo_imported": true,
    "rest_pose_verified": true,
    "bind_pose_created": true,
    "root_motion_checked": true,
    "final_export_verified": true,
    "blend_saved": true
  }
}
```

> 该结构可直接驱动资产管理工具：扫描 `projects/*/` 目录、读取每个项目的元数据文件，展示命名规范是否合规、贴图是否优化、Checklist完成度等。

---

## 7. 资产管理工具对照

本地工具 **Asset ManagerTools**（见同仓库 `README.md`）已实现与本规范衔接的能力：

| 规范章节 | 工具能力 |
|---|---|
| 2.6 概念工作区命名 | 画廊「立绘 / 多视图 / 高模 / 低模」按钮，标记 + 自动重命名 |
| 2.3 贴图命名 `T_<Name>_<Type>` | 生产画廊纹理类型按钮（BaseColor、Normal 等 12 类），标记 + 自动重命名 |
| 2.3 `textures/source/` | 新建 Blender 项目自动创建；原始贴图放此目录后可在工具内标记规范化 |
| 1 生产目录结构 | Blender 侧文件树浏览；打开工作区时自动关联概念/生产项目 |
| 3 Mixamo 动画 FBX | FBX 预览，按文件名匹配动画 clip 并自动播放 |
| 4 贴图 | 生产侧预览 + 256~4096 尺寸转换；概念侧镜像、图片分割导出 |
| 2.5 导出 FBX | 生产侧 `exports/*.fbx` 预览 |

**数据文件：**

- `data/workspace.json` — 工作区与项目关联
- `<概念项目>/.asset-manager/concept_tags.json` — 概念标记
- `<生产项目>/.asset-manager/blender_texture_tags.json` — 纹理类型标记
- `data/shortcuts.json` — 快捷键

工具内「保存」或每 5 分钟自动保存会刷盘上述 JSON。
