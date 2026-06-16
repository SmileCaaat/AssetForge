#if UNITY_EDITOR
using System.IO;
using UnityEditor;
using UnityEngine;

public static class AssetManagerMaterialImporter
{
    private const string MenuPath = "Asset Manager/Import Material From JSON";

    [MenuItem(MenuPath)]
    public static void ImportFromSelectedJson()
    {
        var jsonPath = EditorUtility.OpenFilePanel(
            "Select material JSON",
            Application.dataPath,
            "json");

        if (string.IsNullOrEmpty(jsonPath)) return;
        ImportMaterial(jsonPath);
    }

    public static void ImportMaterial(string jsonPath)
    {
        if (!File.Exists(jsonPath))
        {
            Debug.LogError("[AssetManager] JSON not found: " + jsonPath);
            return;
        }

        var json = File.ReadAllText(jsonPath);
        var data = JsonUtility.FromJson<MaterialJsonRoot>(WrapForUnityJson(json));
        if (data == null)
        {
            Debug.LogError("[AssetManager] Failed to parse material JSON.");
            return;
        }

        var shader = Shader.Find("{{SHADER_NAME}}");
        if (shader == null)
        {
            Debug.LogError("[AssetManager] Shader not found: {{SHADER_NAME}}. Copy unity/shaders/ into Assets first.");
            return;
        }

        var mat = new Material(shader) { name = data.name ?? "{{MATERIAL_NAME}}" };

        ApplyTextures(mat, jsonPath, data);
        ApplyColors(mat, data);
        ApplyFloats(mat, data);

        var outDir = Path.Combine("Assets", "Materials");
        if (!Directory.Exists(outDir)) Directory.CreateDirectory(outDir);
        var assetPath = Path.Combine(outDir, mat.name + ".mat").Replace("\\", "/");
        AssetDatabase.CreateAsset(mat, assetPath);
        AssetDatabase.SaveAssets();
        Debug.Log("[AssetManager] Material created: " + assetPath);
    }

    private static void ApplyTextures(Material mat, string jsonPath, MaterialJsonRoot data)
    {
        if (data.textures == null) return;
        var jsonDir = Path.GetDirectoryName(jsonPath);
        var projectRoot = Directory.GetParent(jsonDir)?.Parent?.FullName;

        foreach (var entry in data.textures)
        {
            if (string.IsNullOrEmpty(entry.path)) continue;
            var texPath = ResolveTexturePath(projectRoot, entry.path);
            if (string.IsNullOrEmpty(texPath) || !File.Exists(texPath))
            {
                Debug.LogWarning("[AssetManager] Texture not found: " + entry.path);
                continue;
            }

            var tex = AssetDatabase.LoadAssetAtPath<Texture2D>(ToAssetsRelative(texPath));
            if (tex == null)
            {
                Debug.LogWarning("[AssetManager] Assign manually in Unity: " + entry.path);
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
            if (c.value == null || c.value.Length < 3) continue;
            var a = c.value.Length > 3 ? c.value[3] : 1f;
            mat.SetColor(c.key, new Color(c.value[0], c.value[1], c.value[2], a));
        }
    }

    private static void ApplyFloats(Material mat, MaterialJsonRoot data)
    {
        if (data.floats == null) return;
        foreach (var f in data.floats)
            mat.SetFloat(f.key, f.value);
    }

    private static string ResolveTexturePath(string projectRoot, string relative)
    {
        if (string.IsNullOrEmpty(projectRoot)) return null;
        return Path.GetFullPath(Path.Combine(projectRoot, relative.Replace("/", Path.DirectorySeparatorChar.ToString())));
    }

    private static string ToAssetsRelative(string fullPath)
    {
        fullPath = fullPath.Replace("\\", "/");
        var idx = fullPath.IndexOf("Assets/");
        return idx >= 0 ? fullPath.Substring(idx) : fullPath;
    }

    // Unity JsonUtility cannot parse arbitrary dictionaries; wrapper types below are best-effort.
    // For production, consider Newtonsoft.Json or manual parsing.
    private static string WrapForUnityJson(string raw)
    {
        return raw;
    }

    [System.Serializable]
    private class MaterialJsonRoot
    {
        public string name;
        public string shader;
        public TextureEntry[] textures;
        public ColorEntry[] colors;
        public FloatEntry[] floats;
    }

    [System.Serializable]
    private class TextureEntry { public string key; public string path; }
    [System.Serializable]
    private class ColorEntry { public string key; public float[] value; }
    [System.Serializable]
    private class FloatEntry { public string key; public float value; }
}
#endif
