import type { StageJson, StageTextureStatus } from "./terrainTypes";
import {
  getCoreSlotRows,
  getSuggestedActions,
  type StageActionId,
} from "./stageActions";
import { SEMANTIC_CONTROL_HINT } from "./stageWorkflow";

interface StageStatusPanelProps {
  stage: StageJson;
  textureStatus: StageTextureStatus;
  onAction: (actionId: StageActionId) => void;
}

export function StageStatusPanel({ stage, textureStatus, onAction }: StageStatusPanelProps) {
  const rows = getCoreSlotRows(textureStatus);
  const actions = getSuggestedActions(textureStatus, stage);

  return (
    <div className="material-lab-panel stage-status-panel">
      <h4>核心输入状态</h4>
      <p className="muted stage-workflow-tag">
        工作流：SemanticControl → BaseColor 提示词 → Image2 → TextureWiz（外部）
      </p>

      <ul className="stage-status-list">
        {rows.map((row) => (
          <li key={row.slot} className={`stage-status-row${row.has ? " present" : " missing"}`}>
            <span className="stage-status-label">{row.label}</span>
            <span className={`stage-status-badge${row.has ? " ok" : ""}`}>{row.statusLabel}</span>
          </li>
        ))}
      </ul>

      {!textureStatus.semanticControl && (
        <p className="stage-semantic-hint muted">{SEMANTIC_CONTROL_HINT}</p>
      )}

      <h5 className="stage-actions-title">建议操作</h5>
      {actions.length === 0 ? (
        <p className="muted">上传或绘制贴图后，将在此显示可执行操作。</p>
      ) : (
        <ul className="stage-action-list">
          {actions.map((action) => (
            <li key={action.id}>
              <button
                type="button"
                className="stage-action-btn"
                disabled={action.disabled}
                title={action.disabledReason ?? action.hint}
                onClick={() => onAction(action.id)}
              >
                {action.label}
              </button>
              {action.disabled && action.disabledReason && (
                <span className="stage-action-reason muted">{action.disabledReason}</span>
              )}
              {!action.disabled && action.hint && (
                <span className="stage-action-hint muted">{action.hint}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
