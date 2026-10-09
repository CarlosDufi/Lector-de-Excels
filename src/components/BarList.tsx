import { formatCompact, formatNumber } from '../lib/format';

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
  total?: number;
}

export function BarList({ items, selected, onClick, limit = 8, total }: Props) {
  const max = items.reduce((m, i) => Math.max(m, i.value), 0);
  const sum = total ?? items.reduce((s, i) => s + i.value, 0);
  const shown = items.slice(0, limit);
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
              title={`${i.label ?? i.key}: ${formatNumber(i.value)} (${sum ? Math.round((i.value / sum) * 100) : 0}%)${onClick ? ' · clic para filtrar' : ''}`}
            >
              <span className="bar-label">
                {i.color && <span className="swatch" style={{ background: i.color }} />}
                {i.label ?? i.key}
              </span>
              <span className="bar-value">{formatCompact(i.value)}</span>
              <span className="bar-track">
                <span className="bar-fill" style={{ width: `${max ? (i.value / max) * 100 : 0}%`, background: i.color }} />
              </span>
            </button>
          </li>
        );
      })}
      {rest.length > 0 && (
        <li className="bars-rest muted">+ {rest.length} más · {formatCompact(restValue)}</li>
      )}
    </ul>
  );
}
