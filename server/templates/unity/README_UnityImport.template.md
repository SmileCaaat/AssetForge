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
│   ├── Materials/
│   │   └── M_Mushpig.material.json
│   ├── bundle.manifest.json
│   └── README.md
├── StoneMork/
└── Punchgob/
```

## 导入 Unity

### 首次

1. 复制 `UnityAssets/Editor/` 到 Unity 的 `Assets/`（任意位置，例如 `Assets/AssetManagerTools/Editor/`）。
2. 等待 Unity 编译，菜单出现 **Asset Manager**。

### 每个角色

1. 复制 `UnityAssets/<角色名>/` 到 Unity，例如 `Assets/Characters/Mushpig/`。
2. 任选一种导入材质：
   - **Asset Manager → Import Material From JSON…** — 选 `Materials/M_<角色>.material.json`
   - **Asset Manager → Import All Materials In Folder…** — 选 `Mushpig` 或整个 `UnityAssets`
   - Project 窗口右键文件夹 → **Asset Manager → Import Materials In Selected Folder**

生成的 `.mat` 会出现在对应 `Materials/` 目录下。

### 批量（多个角色）

将所有角色文件夹复制到 `Assets/` 后，对父目录执行 **Import All Materials In Folder** 即可遍历所有 `.material.json`。

## 贴图设置

- Normal → Import Settings → **Normal Map**
- MetallicSmoothness → R=Metallic，A=Smoothness
