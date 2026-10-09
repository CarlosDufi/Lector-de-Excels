import { useMemo, useState } from 'react';
import { applyFilters, countBy } from '../lib/filters';
import { EMPTY_LABEL, isoDate, toNumber } from '../lib/format';
import { TYPE_LABEL } from '../lib/columns';
import type { ColumnInfo, Filter, Filters, Row } from '../lib/types';

interface Props {
  open: boolean;
  onClose: () => void;
  rows: Row[];
  columns: string[];
  columnInfo: ColumnInfo[];
  filters: Filters;
  search: string;
  onSearch: (s: string) => void;
  onFilter: (col: string, f: Filter | null) => void;
  onClear: () => void;
}

const FILTERABLE = new Set(['category', 'country', 'boolean', 'number', 'date']);

export function FilterPanel(p: Props) {
  const ORDER = ['country', 'category', 'boolean', 'date', 'number', 'text', 'id'];
  const cols = p.columnInfo
    .filter((c) => FILTERABLE.has(c.type) || ((c.type === 'text' || c.type === 'id') && c.unique <= 300))
    .sort((a, b) => ORDER.indexOf(a.type) - ORDER.indexOf(b.type));
  const [query, setQuery] = useState('');
  const shown = cols.filter((c) => c.name.toLowerCase().includes(query.toLowerCase()));

  return (
    <>
      {p.open && <div className="scrim" onClick={p.onClose} />}
      <aside className={`panel ${p.open ? 'is-open' : ''}`} aria-label="Filtros">
        <div className="panel-head">
          <h2 className="panel-title">Filtros</h2>
          <button className="link" onClick={p.onClear} disabled={!Object.keys(p.filters).length && !p.search}>Limpiar todo</button>
          <button className="icon-btn panel-close" onClick={p.onClose} aria-label="Cerrar filtros">×</button>
        </div>
        <input
          className="input"
          type="search"
          placeholder="Buscar en todas las columnas…"
          value={p.search}
          onChange={(e) => p.onSearch(e.target.value)}
        />
        {cols.length > 8 && (
          <input
            className="input input-sm"
            type="search"
            placeholder="Buscar columna…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        )}
        <div className="panel-body">
          {shown.map((c, i) => (
            <FilterSection key={c.name} info={c} defaultOpen={i < 4 || !!p.filters[c.name]} {...p} />
          ))}
          {!cols.length && <p className="muted">No hay columnas filtrables.</p>}
        </div>
      </aside>
    </>
  );
}

function FilterSection({ info, defaultOpen, ...p }: Props & { info: ColumnInfo; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const active = !!p.filters[info.name];
  return (
    <section className={`fsec ${active ? 'is-active' : ''}`}>
      <button className="fsec-head" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="chev" data-open={open}>›</span>
        <span className="fsec-name" title={info.name}>{info.name}</span>
        <span className="badge">{TYPE_LABEL[info.type]}</span>
        {active && <span className="dot" aria-label="Filtro activo" />}
      </button>
      {open && (
        <div className="fsec-body">
          {info.type === 'number' ? <RangeFilter {...p} col={info.name} />
            : info.type === 'date' ? <DateFilter {...p} col={info.name} />
              : <ValuesFilter {...p} col={info.name} />}
          {active && <button className="link small" onClick={() => p.onFilter(info.name, null)}>Quitar filtro</button>}
        </div>
      )}
    </section>
  );
}

function ValuesFilter({ rows, columns, filters, search, onFilter, col }: Props & { col: string }) {
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState(10);
  // Recuentos "facetados": aplican el resto de filtros pero no el de esta columna.
  const all = useMemo(() => [...countBy(rows, col).keys()], [rows, col]);
  const counts = useMemo(() => countBy(applyFilters(rows, filters, columns, search, col), col), [rows, filters, columns, search, col]);
  const f = filters[col];
  const included = f?.kind === 'values' ? new Set(f.included) : null;
  const sorted = useMemo(
    () => all.slice().sort((a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0) || (a === EMPTY_LABEL ? 1 : b === EMPTY_LABEL ? -1 : a.localeCompare(b, 'es'))),
    [all, counts],
  );
  const list = sorted.filter((v) => v.toLowerCase().includes(q.toLowerCase()));
  const isOn = (v: string) => !included || included.has(v);

  const toggle = (v: string) => {
    const cur = included ?? new Set(all);
    const next = new Set(cur);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    onFilter(col, next.size === all.length ? null : { kind: 'values', included: [...next] });
  };
  const only = (v: string) => onFilter(col, { kind: 'values', included: [v] });

  return (
    <>
      {all.length > 8 && (
        <input className="input input-sm" type="search" placeholder="Buscar valor…" value={q} onChange={(e) => setQ(e.target.value)} />
      )}
      <div className="fsec-actions">
        <button className="link small" onClick={() => onFilter(col, null)}>Todos</button>
        <button className="link small" onClick={() => onFilter(col, { kind: 'values', included: [] })}>Ninguno</button>
        {q && <button className="link small" onClick={() => onFilter(col, { kind: 'values', included: list })}>Solo coincidencias</button>}
      </div>
      <ul className="checks">
        {list.slice(0, limit).map((v) => (
          <li key={v}>
            <label className={`check ${(counts.get(v) ?? 0) === 0 ? 'is-zero' : ''}`}>
              <input type="checkbox" checked={isOn(v)} onChange={() => toggle(v)} />
              <span className="check-label" title={v}>{v}</span>
              <span className="check-count">{counts.get(v) ?? 0}</span>
            </label>
            <button className="only" onClick={() => only(v)} title={`Solo ${v}`}>solo</button>
          </li>
        ))}
      </ul>
      {list.length > limit && (
        <button className="link small" onClick={() => setLimit((l) => l + 50)}>Ver más ({list.length - limit})</button>
      )}
    </>
  );
}

function RangeFilter({ rows, filters, onFilter, col }: Props & { col: string }) {
  const nums = useMemo(() => rows.map((r) => toNumber(r[col])).filter((n): n is number => n !== null), [rows, col]);
  const lo = nums.reduce((a, b) => Math.min(a, b), nums[0] ?? 0);
  const hi = nums.reduce((a, b) => Math.max(a, b), nums[0] ?? 0);
  const f = filters[col]?.kind === 'range' ? (filters[col] as Extract<Filter, { kind: 'range' }>) : null;
  const set = (min: number | null, max: number | null) =>
    onFilter(col, min === null && max === null ? null : { kind: 'range', min, max });
  const parse = (s: string) => (s === '' ? null : Number(s));
  return (
    <div className="range">
      <label>Mín<input className="input input-sm" type="number" placeholder={String(lo)} value={f?.min ?? ''} onChange={(e) => set(parse(e.target.value), f?.max ?? null)} /></label>
      <label>Máx<input className="input input-sm" type="number" placeholder={String(hi)} value={f?.max ?? ''} onChange={(e) => set(f?.min ?? null, parse(e.target.value))} /></label>
    </div>
  );
}

function DateFilter({ rows, filters, onFilter, col }: Props & { col: string }) {
  const dates = useMemo(() => rows.map((r) => r[col]).filter((d): d is Date => d instanceof Date).map(isoDate).sort(), [rows, col]);
  const f = filters[col]?.kind === 'dates' ? (filters[col] as Extract<Filter, { kind: 'dates' }>) : null;
  const set = (from: string | null, to: string | null) => onFilter(col, !from && !to ? null : { kind: 'dates', from, to });
  return (
    <div className="range">
      <label>Desde<input className="input input-sm" type="date" min={dates[0]} max={dates[dates.length - 1]} value={f?.from ?? ''} onChange={(e) => set(e.target.value || null, f?.to ?? null)} /></label>
      <label>Hasta<input className="input input-sm" type="date" min={dates[0]} max={dates[dates.length - 1]} value={f?.to ?? ''} onChange={(e) => set(f?.from ?? null, e.target.value || null)} /></label>
    </div>
  );
}
