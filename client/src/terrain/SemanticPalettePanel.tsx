import type { SemanticPalette, SemanticPaletteColor } from "./terrainTypes";
import { isAnchorColor } from "./semanticColor";

interface SemanticPalettePanelProps {
  palette: SemanticPalette;
  selectedId: string;
  onSelect: (color: SemanticPaletteColor) => void;
}

export function SemanticPalettePanel({ palette, selectedId, onSelect }: SemanticPalettePanelProps) {
  const regions = palette.colors.filter((c) => !isAnchorColor(c));
  const anchors = palette.colors.filter((c) => isAnchorColor(c));

  return (
    <div className="material-lab-panel semantic-palette-panel">
      <h4>语义调色板</h4>
      <section className="semantic-palette-group">
        <h5>区域语义</h5>
        <ul className="semantic-palette-list">
          {regions.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                className={`semantic-palette-swatch${selectedId === c.id ? " active" : ""}`}
                onClick={() => onSelect(c)}
                title={c.description ?? c.label}
              >
                <span className="semantic-swatch-color" style={{ background: c.hex }} />
                <span className="semantic-swatch-label">{c.label}</span>
                <code className="semantic-swatch-hex">{c.hex}</code>
              </button>
            </li>
          ))}
        </ul>
      </section>
      <section className="semantic-palette-group">
        <h5>道具锚点</h5>
        <ul className="semantic-palette-list">
          {anchors.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                className={`semantic-palette-swatch anchor${selectedId === c.id ? " active" : ""}`}
                onClick={() => onSelect(c)}
                title={c.description ?? c.label}
              >
                <span className="semantic-swatch-color" style={{ background: c.hex }} />
                <span className="semantic-swatch-label">{c.label}</span>
                <code className="semantic-swatch-hex">{c.hex}</code>
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
