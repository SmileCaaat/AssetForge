# 资产管理器

本地网页工具，管理 **ConceptWorkspace**（概念设计）与 **BlenderWorkspace**（Blender 生产）双根目录，支持项目关联、文件浏览、资产标记、预览与批量操作。

> 生产流程与命名规范详见 [Asset_Pipeline_Standard.md](./Asset_Pipeline_Standard.md)。

## 一键启动

双击项目根目录的 **`start.bat`** 即可启动（**首次运行会自动安装后端 + 前端全部依赖**，并打开浏览器）。

PowerShell 用户也可运行：

```powershell
.\start.ps1
```

或手动启动：

```bash
npm run setup   # 首次运行：安装后端 + 前端全部依赖
npm run dev
```

- 前端: http://localhost:5173
- 后端 API: http://localhost:3456

生产构建：

```bash
npm run build
npm start
```

关闭运行 `start.bat` / `start.ps1` 的终端窗口即可停止服务。

---

## 功能概览 (v0.4)

### 工作区

- **多总工作区**：下拉切换、打开已有工作区、新建空白工作区
- **自动关联项目**：打开 / 切换 / 刷新工作区时，按名称自动匹配概念与生产目录并写入 `workspace.json`
- **路径自愈**：项目登记名与磁盘文件夹不一致时（如 `Punchgob庞哥布` ↔ `Punchgob`）自动纠正
- **路径选择**：浏览器目录选择器 + 系统文件夹对话框（无需手输路径）
- **打开文件夹**：顶部菜单可打开根目录 / ConceptWorkspace / BlenderWorkspace
- **保存 / 刷新**：顶部「保存」刷盘全部 JSON；「刷新」重新扫描当前项目；每 5 分钟自动保存
- **在线资源**：顶部「在线资源」一键跳转 TextureWiz、混元 3D、Mixamo 等站点

### 项目与文件

- **逻辑项目**：概念侧与生产侧目录关联，支持概念 / 生产视图切换
- **文件树 + 画廊**：浏览、选中、预览可识别资产（图片、FBX、Blend）
- **文件操作**：新建文件夹、重命名、复制、剪切、粘贴、删除
- **导入**：工具栏或拖入外部文件到当前目录
- **右键菜单**：复制路径 / 复制当前目录路径
- **文本复制**：页面内选中文字可用 Ctrl+C 正常复制；文件快捷键仅在选中文件时生效

### 概念资产标记（概念侧）

在「可预览资产」标题栏使用按钮标记，**自动重命名**并写入标签：

| 按钮 | 适用类型 | 命名规则 |
|------|----------|----------|
| 立绘 | 图片 | `{项目名}_KeyArt.{ext}` |
| 多视图 | 图片 | `{项目名}_MultiView_01.{ext}`（可多张） |
| 高模 | FBX 等模型 | `{项目名}_High.{ext}` |
| 低模 | FBX 等模型 | `{项目名}_Low.{ext}` |

标签数据保存在各概念项目 `.asset-manager/concept_tags.json`。

### 纹理贴图标记（生产侧）

生产视图画廊提供纹理类型按钮，**一键重命名**为 `T_{项目名}_{类型}.{ext}`：

`BaseColor` · `Roughness` · `Metallic` · `Normal` · `AO` · `Height` · `Edge` · `Detection` · `Alpha` · `Bump` · `Curvature` · `Emission`

原始贴图建议放在 `textures/source/`；标记元数据写入 `.asset-manager/blender_texture_tags.json`。

### 预览

- **图片**（概念侧）：内嵌预览；**水平/垂直镜像**预览与保存；**图片分割**导出宫格
- **图片**（生产侧）：内嵌预览；**纹理尺寸**一键转换为 256 / 512 / 1024 / 2048 / 4096
- **FBX**：Three.js 预览，默认正视图；自动播放内嵌动画；**多动画 FBX 可在工具栏切换 clip 播放**
- **Blend**：提示在 `renders/` 查看渲染图

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
    ├── projects/
    │   └── <项目名>/
    │       ├── textures/
    │       │   └── source/      # 原始贴图（新建项目自动创建）
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

「保存」会刷盘以上全部 JSON，并对各项目同步标签与磁盘文件名。

---

## 默认快捷键

| 操作 | 快捷键 |
|------|--------|
| 重命名 | F2 |
| 复制 | Ctrl + C |
| 剪切 | Ctrl + X |
| 粘贴 | Ctrl + V |
| 删除 | Delete |
| 新建文件夹 | Ctrl + Shift + N |
| 刷新 | F5 |

可通过 API `PUT /api/shortcuts` 修改；界面「快捷键」面板可查看当前配置。

---

## API 摘要

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/workspace` | 获取工作区与未关联信息 |
| POST | `/api/workspaces` | 新建总工作区 |
| POST | `/api/workspaces/open` | 打开已有工作区 |
| PUT | `/api/workspaces/active` | 切换活动工作区 |
| POST | `/api/save-all` | 保存全部 JSON |
| GET/PUT | `/api/projects/:id/...` | 项目 CRUD、文件树、资产列表 |
| GET/POST | `/api/projects/:id/concept-tags` | 读取 / 标记概念资产 |
| GET/POST | `/api/projects/:id/texture-tags` | 读取 / 标记生产纹理 |
| POST | `/api/images/resize` | 纹理尺寸转换 |
| POST | `/api/images/mirror` | 概念图片镜像保存 |
| POST | `/api/fs/*` | 重命名、删除、复制、移动、导入、图片分割等 |
| GET | `/api/files?path=` | 静态文件（预览用） |

---

## 项目结构

```
Asset ManagerTools/
├── start.bat / start.ps1    # 一键启动（自动生成 AssetManager.lnk 带图标快捷方式）
├── create-launcher.bat      # 手动创建带图标的启动快捷方式
├── assets/                  # 应用图标 (app-icon.ico / .png)
├── server/                  # Express API (tsx / dist)
├── client/                  # React + Vite + Three.js 前端
│   └── public/              # favicon、manifest
├── data/                    # 运行时 JSON 配置
├── Asset_Pipeline_Standard.md
└── README.md
```

---

## 技术栈

- **后端**：Node.js、Express、sharp（图片分割 / 缩放 / 镜像）、multer（文件导入）
- **前端**：React 18、Vite、@react-three/fiber、@react-three/drei
