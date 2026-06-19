import type { StageJson, StageTextureSlot, StageTextureStatus } from "./terrainTypes";

export type StageActionId =
  | "gen_basecolor_prompt"
  | "open_semantic_editor"
  | "upload_basecolor"
  | "upload_semantic";

export interface StageSuggestedAction {
  id: StageActionId;
  label: string;
  hint?: string;
  disabled?: boolean;
  disabledReason?: string;
}

const CORE_SLOTS: { slot: StageTextureSlot; label: string; missing: string; present: string }[] = [
  { slot: "semanticControl", label: "语义控制图", missing: "缺失", present: "已有" },
  { slot: "baseColor", label: "BaseColor（参考）", missing: "缺失", present: "已有" },
];

export function emptyTextureStatus(): StageTextureStatus {
  return {
    baseColor: false,
    semanticControl: false,
  };
}

export function getCoreSlotRows(status: StageTextureStatus) {
  return CORE_SLOTS.map((row) => ({
    ...row,
    has: status[row.slot],
    statusLabel: status[row.slot] ? row.present : row.missing,
  }));
}

export function getSuggestedActions(
  status: StageTextureStatus,
  _stage: StageJson,
): StageSuggestedAction[] {
  const actions: StageSuggestedAction[] = [];

  if (status.semanticControl) {
    actions.push({ id: "gen_basecolor_prompt", label: "生成 BaseColor 提示词" });
  } else {
    actions.push({ id: "open_semantic_editor", label: "在画布上绘制语义控制图" });
    actions.push({ id: "upload_semantic", label: "上传语义控制图" });
  }

  if (!status.baseColor) {
    actions.push({ id: "upload_basecolor", label: "上传 BaseColor 参考" });
  }

  const seen = new Set<StageActionId>();
  return actions.filter((a) => {
    if (seen.has(a.id)) return false;
    seen.add(a.id);
    return true;
  });
}
