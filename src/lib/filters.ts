import { isoDate, toNumber, valueKey } from './format';
import type { Filter, Filters, Row } from './types';

export function matchFilter(row: Row, col: string, f: Filter): boolean {
  const v = row[col];
  if (f.kind === 'values') return f.included.includes(valueKey(v));
  if (f.kind === 'range') {
    const n = toNumber(v);
    if (n === null) return f.min === null && f.max === null;
    return (f.min === null || n >= f.min) && (f.max === null || n <= f.max);
  }
  if (!(v instanceof Date)) return !f.from && !f.to;
  const d = isoDate(v);
  return (!f.from || d >= f.from) && (!f.to || d <= f.to);
}

export function matchSearch(row: Row, columns: string[], q: string): boolean {
  if (!q) return true;
  const needle = q.toLowerCase();
  return columns.some((c) => valueKey(row[c]).toLowerCase().includes(needle));
}

export function applyFilters(rows: Row[], filters: Filters, columns: string[], search: string, except?: string): Row[] {
  const entries = Object.entries(filters).filter(([c]) => c !== except);
  return rows.filter((r) => entries.every(([c, f]) => matchFilter(r, c, f)) && matchSearch(r, columns, search));
}

export function countBy(rows: Row[], col: string): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) {
    const k = valueKey(r[col]);
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return m;
}

export function activeFilterCount(filters: Filters): number {
  return Object.keys(filters).length;
}
