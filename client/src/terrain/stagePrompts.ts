import type { StageJson } from "./terrainTypes";

/**
 * Stage Lab 现在只产出一种提示词：BaseColor（语义约束）。
 * 工作流：语义图 + 本提示词 → Image2 生成 BaseColor；后续 Height 等由外部 TextureWiz 处理，不在此生成。
 */
export type StagePromptKind = "semantic_to_basecolor";

function stageHeader(stage: StageJson): string {
  return `Stage: ${stage.displayName} (${stage.stageName})
Aspect: ${stage.aspect}
Resolution: ${stage.resolution.width}×${stage.resolution.height}
World: ${stage.worldSize.width}×${stage.worldSize.height} ${stage.worldSize.unit}`;
}

export function buildStagePrompt(_kind: StagePromptKind, stage: StageJson): string {
  const header = stageHeader(stage);
  return `${header}

Task: Generate a ground-only BaseColor texture for a stylized low-poly 2.5D terrain stage.

Input constraint:
- Strictly follow the Semantic Control Map layout and region boundaries.
- Semantic colors represent ground surface types only (grass, dirt, stone road, stone platform, boundary, water/pit, clear zone).
- Stone road (stone_road / 石质通道 #6E6A62): connecting paved paths between platforms, slightly lower.
- Stone platform (stone_platform / 石质台地 #D5CFC0): raised block platforms, ruins yards, battle stands.
- Do NOT generate independent 3D props.
- Do NOT generate trees, pillars, broken walls, buildings, NPCs, or standalone objects.
- Output ground BaseColor only.

Style:
- ${stage.promptProfile.style}
- Camera: ${stage.promptProfile.camera}
- Restrained palette: moss green, muted earth brown, warm gray stone, slightly desaturated fantasy colors.
- Clean readable ground surfaces suitable for top-down gameplay.

Output:
- Single ${stage.aspect} BaseColor map matching stage resolution (${stage.resolution.width}×${stage.resolution.height}).
- File: ${stage.textures.baseColor}`;
}

export const PROMPT_KIND_FOR_ACTION: Partial<Record<string, StagePromptKind>> = {
  gen_basecolor_prompt: "semantic_to_basecolor",
};
