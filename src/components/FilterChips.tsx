import { formatNumber } from '../lib/format';
import type { Filter, Filters } from '../lib/types';

interface Props {
  filters: Filters;
  search: string;
  onFilter: (col: string, f: Filter | null) => void;
  onSearch: (s: string) => void;
  onClear: () => void;
}

function describe(f: Filter): string {
  if (f.kind === 'values') {
    if (!f.included.length) return 'ninguno';
    return f.included.length <= 3 ? f.included.join(', ') : `${f.included.slice(0, 2).join(', ')} +${f.included.length - 2}`;
  }
  if (f.kind === 'range') {
    if (f.min !== null && f.max !== null) return `${formatNumber(f.min)} – ${formatNumber(f.max)}`;
    return f.min !== null ? `≥ ${formatNumber(f.min)}` : `≤ ${formatNumber(f.max ?? 0)}`;
  }
  if (f.from && f.to) return `${f.from} → ${f.to}`;
  return f.from ? `desde ${f.from}` : `hasta ${f.to}`;
}

export function FilterChips({ filters, search, onFilter, onSearch, onClear }: Props) {
  const entries = Object.entries(filters);
  if (!entries.length && !search) return null;
  return (
    <div className="chips" aria-label="Filtros activos">
      {search && (
        <span className="chip">Búsqueda: <strong>{search}</strong><button onClick={() => onSearch('')} aria-label="Quitar búsqueda">×</button></span>
      )}
      {entries.map(([col, f]) => (
        <span className="chip" key={col}>
          {col}: <strong>{describe(f)}</strong>
          <button onClick={() => onFilter(col, null)} aria-label={`Quitar filtro ${col}`}>×</button>
        </span>
      ))}
      <button className="link small" onClick={onClear}>Limpiar todo</button>
    </div>
  );
}
