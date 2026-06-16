#if UNITY_EDITOR
using System.IO;
using UnityEditor;
using UnityEngine;

public static class AssetManagerMaterialImporter
{
    private const string MenuRoot = "Asset Manager/";
    private const string DefaultShaderName = "{{SHADER_NAME}}";

    [MenuItem(MenuRoot + "Import Material From JSON...", false, 1)]
    public static void ImportFromSelectedJson()
    {
        var jsonPath = EditorUtility.OpenFilePanel(
            "Select .material.json",
            Application.dataPath,
            "json");

        if (string.IsNullOrEmpty(jsonPath)) return;
        ImportMaterial(jsonPath);
    }

    [MenuItem(MenuRoot + "Import All Materials In Folder...", false, 2)]
    public static void ImportAllFromFolderDialog()
    {
        var folder = EditorUtility.OpenFolderPanel(
            "Select Unity asset bundle folder (e.g. Mushpig or UnityAssets)",
            Application.dataPath,
            "");

        if (string.IsNullOrEmpty(folder)) return;
        ImportAllMaterialsInDirectory(folder);
    }

    [MenuItem("Assets/Asset Manager/Import Materials In Selected Folder", false, 2000)]
    public static void ImportAllInSelectedProjectFolder()
    {
        var folderAssetPath = AssetDatabase.GetAssetPath(Selection.activeObject);
        if (string.IsNullOrEmpty(folderAssetPath) || !AssetDatabase.IsValidFolder(folderAssetPath))
        {
            EditorUtility.DisplayDialog("Asset Manager", "请在 Project 窗口中选中一个文件夹。", "OK");
            return;
        }

        var fullPath = Path.GetFullPath(folderAssetPath);
        ImportAllMaterialsInDirectory(fullPath);
    }

    [MenuItem("Assets/Asset Manager/Import Materials In Selected Folder", true)]
    public static bool ValidateImportAllInSelectedProjectFolder()
    {
        if (Selection.activeObject == null) return false;
        var path = AssetDatabase.GetAssetPath(Selection.activeObject);
        return !string.IsNullOrEmpty(path) && AssetDatabase.IsValidFolder(path);
    }

    public static void ImportAllMaterialsInDirectory(string directoryFullPath)
    {
        if (!Directory.Exists(directoryFullPath))
        {
            Debug.LogError("[AssetManager] Folder not found: " + directoryFullPath);
            return;
        }

        var jsonFiles = Directory.GetFiles(directoryFullPath, "*.material.json", SearchOption.AllDirectories);
        if (jsonFiles.Length == 0)
        {
            EditorUtility.DisplayDialog(
                "Asset Manager",
                "未找到任何 .material.json 文件。\n请选择 UnityAssets 下的角色文件夹，或整个 UnityAssets 目录。",
                "OK");
            return;
        }

        var created = 0;
        foreach (var jsonPath in jsonFiles)
        {
            if (ImportMaterial(jsonPath, quiet: true)) created++;
        }

        AssetDatabase.SaveAssets();
        AssetDatabase.Refresh();
        Debug.Log($"[AssetManager] Batch import finished. Created/updated {created} material(s) from {jsonFiles.Length} JSON file(s).");
    }

    public static bool ImportMaterial(string jsonPath, bool quiet = false)
    {
        if (!File.Exists(jsonPath))
        {
            if (!quiet) Debug.LogError("[AssetManager] JSON not found: " + jsonPath);
            return false;
        }

        var json = File.ReadAllText(jsonPath);
        var data = JsonUtility.FromJson<MaterialJsonRoot>(json);
        if (data == null || string.IsNullOrEmpty(data.name))
        {
            if (!quiet) Debug.LogError("[AssetManager] Failed to parse material JSON: " + jsonPath);
            return false;
        }

        var shaderName = string.IsNullOrEmpty(data.shader) ? DefaultShaderName : data.shader;
        var shader = Shader.Find(shaderName);
        if (shader == null)
        {
            if (!quiet)
            {
                Debug.LogError(
                    "[AssetManager] Shader not found: " + shaderName +
                    ". Ensure the bundle Shaders/ folder is under Assets and compiled.");
            }
            return false;
        }

        var bundleRoot = ResolveBundleRoot(jsonPath);
        var mat = new Material(shader) { name = data.name };

        ApplyTextures(mat, bundleRoot, data, quiet);
        ApplyColors(mat, data);
        ApplyFloats(mat, data);

        var assetPath = BuildMaterialAssetPath(jsonPath, mat.name);
        var existing = AssetDatabase.LoadAssetAtPath<Material>(assetPath);
        if (existing != null)
        {
            EditorUtility.CopySerialized(mat, existing);
            EditorUtility.SetDirty(existing);
            Object.DestroyImmediate(mat);
            if (!quiet) Debug.Log("[AssetManager] Material updated: " + assetPath);
            return true;
        }

        EnsureAssetFolder(Path.GetDirectoryName(assetPath));
        AssetDatabase.CreateAsset(mat, assetPath);
        if (!quiet) Debug.Log("[AssetManager] Material created: " + assetPath);
        return true;
    }

    private static void ApplyTextures(Material mat, string bundleRoot, MaterialJsonRoot data, bool quiet)
    {
        if (data.textures == null) return;

        foreach (var entry in data.textures)
        {
            if (entry == null || string.IsNullOrEmpty(entry.key) || string.IsNullOrEmpty(entry.path)) continue;

            var texFullPath = Path.GetFullPath(Path.Combine(bundleRoot, entry.path.Replace("/", Path.DirectorySeparatorChar.ToString())));
            if (!File.Exists(texFullPath))
            {
                if (!quiet) Debug.LogWarning("[AssetManager] Texture file not found: " + entry.path);
                continue;
            }

            var texAssetPath = ToAssetsRelative(texFullPath);
            var tex = AssetDatabase.LoadAssetAtPath<Texture2D>(texAssetPath);
            if (tex == null)
            {
                if (!quiet) Debug.LogWarning("[AssetManager] Import texture into Assets first: " + entry.path);
                continue;
            }

            mat.SetTexture(entry.key, tex);
        }
    }

    private static void ApplyColors(Material mat, MaterialJsonRoot data)
    {
        if (data.colors == null) return;
        foreach (var c in data.colors)
        {
            if (c == null || c.value == null || c.value.Length < 3) continue;
            var a = c.value.Length > 3 ? c.value[3] : 1f;
            mat.SetColor(c.key, new Color(c.value[0], c.value[1], c.value[2], a));
        }
    }

    private static void ApplyFloats(Material mat, MaterialJsonRoot data)
    {
        if (data.floats == null) return;
        foreach (var f in data.floats)
        {
            if (f == null || string.IsNullOrEmpty(f.key)) continue;
            mat.SetFloat(f.key, f.value);
        }
    }

    private static string ResolveBundleRoot(string jsonPath)
    {
        var dir = Path.GetDirectoryName(jsonPath);
        if (dir == null) return jsonPath;

        if (string.Equals(Path.GetFileName(dir), "Materials", System.StringComparison.OrdinalIgnoreCase))
            return Directory.GetParent(dir)?.FullName ?? dir;

        return dir;
    }

    private static string BuildMaterialAssetPath(string jsonPath, string materialName)
    {
        var jsonAssetPath = ToAssetsRelative(jsonPath);
        if (jsonAssetPath.StartsWith("Assets/"))
        {
            var dir = Path.GetDirectoryName(jsonAssetPath)?.Replace("\\", "/");
            return $"{dir}/{materialName}.mat";
        }

        var fallbackDir = "Assets/Materials";
        EnsureAssetFolder(fallbackDir);
        return $"{fallbackDir}/{materialName}.mat";
    }

    private static void EnsureAssetFolder(string assetFolder)
    {
        assetFolder = assetFolder.Replace("\\", "/");
        if (AssetDatabase.IsValidFolder(assetFolder)) return;

        var parts = assetFolder.Split('/');
        var current = parts[0];
        for (var i = 1; i < parts.Length; i++)
        {
            var next = current + "/" + parts[i];
            if (!AssetDatabase.IsValidFolder(next))
                AssetDatabase.CreateFolder(current, parts[i]);
            current = next;
        }
    }

    private static string ToAssetsRelative(string fullPath)
    {
        fullPath = Path.GetFullPath(fullPath).Replace("\\", "/");
        var dataPath = Path.GetFullPath(Application.dataPath).Replace("\\", "/");
        if (fullPath.StartsWith(dataPath))
            return "Assets" + fullPath.Substring(dataPath.Length);
        return fullPath;
    }

    [System.Serializable]
    private class MaterialJsonRoot
    {
        public int version;
        public string name;
        public string shader;
        public string bundleName;
        public string displayName;
        public string model;
        public TextureEntry[] textures;
        public ColorEntry[] colors;
        public FloatEntry[] floats;
    }

    [System.Serializable]
    private class TextureEntry
    {
        public string key;
        public string path;
    }

    [System.Serializable]
    private class ColorEntry
    {
        public string key;
        public float[] value;
    }

    [System.Serializable]
    private class FloatEntry
    {
        public string key;
        public float value;
    }
}
#endif
