import type { PromptHistoryEntry } from "./terrainTypes";

interface StagePromptHistoryPanelProps {
  entries: PromptHistoryEntry[];
  loading?: boolean;
}

export function StagePromptHistoryPanel({ entries, loading }: StagePromptHistoryPanelProps) {
  return (
    <div className="material-lab-panel stage-prompt-history-panel">
      <h4>提示词历史</h4>
      <p className="muted">生成提示词时自动写入 <code>prompts/</code> 与 <code>prompt_history.json</code></p>
      {loading ? (
        <p className="muted">加载中…</p>
      ) : entries.length === 0 ? (
        <p className="muted">暂无记录，请从「建议操作」生成提示词。</p>
      ) : (
        <ul className="stage-prompt-history-list">
          {entries.slice(0, 8).map((e) => (
            <li key={e.id} className="stage-prompt-history-item">
              <div className="stage-prompt-history-head">
                <strong>{e.label}</strong>
                <time className="muted">{new Date(e.createdAt).toLocaleString()}</time>
              </div>
              <code className="stage-prompt-history-file">{e.file}</code>
              <p className="stage-prompt-history-preview muted">{e.preview}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
