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

## 功能概览 (v0.3)

### 工作区

- **多总工作区**：下拉切换、打开已有工作区、新建空白工作区
- **路径选择**：浏览器目录选择器 + 外部文件夹拖入导入（无需手输路径）
- **未关联检测**：自动发现 Concept / Blender 中未关联的目录，并提供一键关联建议
- **打开文件夹**：顶部菜单可打开根目录 / ConceptWorkspace / BlenderWorkspace（系统资源管理器）
- **保存**：顶部「保存」按钮写入全部 JSON；每 5 分钟自动保存

### 项目与文件

- **逻辑项目**：概念侧与生产侧目录关联，支持概念 / 生产视图切换
- **文件树 + 画廊**：浏览、选中、预览可识别资产（图片、FBX、Blend）
- **文件操作**：新建文件夹、重命名、复制、剪切、粘贴、删除
- **导入**：工具栏或拖入外部文件到当前目录
- **右键菜单**：复制路径 / 复制当前目录路径
- **图片分割**（概念侧）：宫格分割、拖动分割线、导出到 `{原名}_split/1.png…`

### 概念资产标记（概念侧）

在「可预览资产」标题栏使用按钮标记，**自动重命名**并写入标签：

| 按钮 | 适用类型 | 命名规则 |
|------|----------|----------|
| 立绘 | 图片 | `{项目名}_KeyArt.{ext}` |
| 多视图 | 图片 | `{项目名}_MultiView_01.{ext}`（可多张） |
| 高模 | FBX 等模型 | `{项目名}_High.{ext}` |
| 低模 | FBX 等模型 | `{项目名}_Low.{ext}` |

标签数据保存在各概念项目 `.asset-manager/concept_tags.json`。

### 预览

- **图片**：内嵌预览
- **FBX**：Three.js 预览，默认正视图，支持 OrbitControls 旋转；**自动播放**模型内嵌动画（静态网格无动画则不动）
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

「保存」会刷盘以上全部 JSON，并对各概念项目同步标签与磁盘文件名。

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
| POST | `/api/fs/*` | 重命名、删除、复制、移动、导入、图片分割等 |
| GET | `/api/files?path=` | 静态文件（预览用） |

---

## 项目结构

```
Asset ManagerTools/
├── start.bat / start.ps1    # 一键启动
├── server/                  # Express API (tsx / dist)
├── client/                  # React + Vite + Three.js 前端
├── data/                    # 运行时 JSON 配置
├── Asset_Pipeline_Standard.md
└── README.md
```

---

## 技术栈

- **后端**：Node.js、Express、sharp（图片分割）、multer（文件导入）
- **前端**：React 18、Vite、@react-three/fiber、@react-three/drei
