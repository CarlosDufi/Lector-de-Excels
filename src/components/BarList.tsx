import { useState } from 'react';
import { formatCompact, formatNumber, percent } from '../lib/format';

export interface BarItem {
  key: string;
  label?: string;
  value: number;
  color?: string;
}

interface Props {
  items: BarItem[];
  selected?: Set<string>;
  onClick?: (key: string) => void;
  limit?: number;
  /** Base para el porcentaje (por defecto, la suma de los valores). */
  total?: number;
  /** Oculta el porcentaje (p. ej. cuando el valor es una media). */
  hidePercent?: boolean;
}

export function BarList({ items, selected, onClick, limit = 8, total, hidePercent }: Props) {
  const [expanded, setExpanded] = useState(false);
  const max = items.reduce((m, i) => Math.max(m, i.value), 0);
  const sum = total ?? items.reduce((s, i) => s + i.value, 0);
  const shown = expanded ? items : items.slice(0, limit);
  const rest = items.slice(limit);
  const restValue = rest.reduce((s, i) => s + i.value, 0);
  const anySelected = !!selected && selected.size > 0;

  return (
    <ul className="bars">
      {shown.map((i) => {
        const isSel = selected?.has(i.key);
        return (
          <li key={i.key}>
            <button
              className={`bar ${isSel ? 'is-selected' : ''} ${anySelected && !isSel ? 'is-dim' : ''}`}
              onClick={() => onClick?.(i.key)}
              disabled={!onClick}
              title={`${i.label ?? i.key}: ${formatNumber(i.value)}${hidePercent ? '' : ` (${percent(i.value, sum)})`}${onClick ? ' · clic para filtrar' : ''}`}
            >
              <span className="bar-label">
                {i.color && <span className="swatch" style={{ background: i.color }} />}
                {i.label ?? i.key}
              </span>
              <span className="bar-value">
                {formatCompact(i.value)}
                {!hidePercent && <span className="bar-pct">{percent(i.value, sum)}</span>}
              </span>
              <span className="bar-track">
                <span className="bar-fill" style={{ width: `${max ? (i.value / max) * 100 : 0}%`, background: i.color }} />
              </span>
            </button>
          </li>
        );
      })}
      {rest.length > 0 && (
        <li>
          <button className="link small bars-rest" onClick={() => setExpanded((e) => !e)}>
            {expanded
              ? 'Ver menos'
              : `+ ${rest.length} más · ${formatCompact(restValue)}${hidePercent ? '' : ` (${percent(restValue, sum)})`} — ver todos`}
          </button>
        </li>
      )}
    </ul>
  );
}
