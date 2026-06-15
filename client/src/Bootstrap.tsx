import { useEffect, useState } from "react";
import type { WorkspaceResponse } from "./types";
import { fetchWorkspace } from "./api";
import App from "./App";
import { useDisableBrowserContextMenu } from "./hooks/useDisableBrowserContextMenu";

export function useWorkspace() {
  const [data, setData] = useState<WorkspaceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchWorkspace();
      setData(result);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
  }, []);

  return { data, loading, error, reload };
}

export default function Bootstrap() {
  useDisableBrowserContextMenu();
  const workspace = useWorkspace();

  if (workspace.loading) {
    return <div className="loading-screen">正在加载 Workspace...</div>;
  }

  if (workspace.error || !workspace.data) {
    return (
      <div className="loading-screen error">
        <p>加载失败：{workspace.error}</p>
        <button onClick={() => void workspace.reload()}>重试</button>
      </div>
    );
  }

  return <App workspace={workspace.data} onRefresh={workspace.reload} />;
}
