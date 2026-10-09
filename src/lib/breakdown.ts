import { countBy } from './filters';
import { EMPTY_LABEL, formatNumber, toNumber } from './format';
import type { ColumnInfo, Row } from './types';

export interface BreakdownItem {
  key: string;
  label?: string;
  value: number;
  /** Valores originales que agrupa (para filtrar al hacer clic). */
  filterValues?: string[];
}

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** Recuento por valor de cualquier columna. Fechas por mes; números con muchos valores, por tramos. */
export function breakdown(rows: Row[], info: ColumnInfo): { items: BreakdownItem[]; filterable: boolean } {
  if (info.type === 'date') {
    const m = new Map<string, number>();
    for (const r of rows) {
      const d = r[info.name];
      const k = d instanceof Date ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` : EMPTY_LABEL;
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    const items = [...m.entries()]
      .sort((a, b) => (a[0] === EMPTY_LABEL ? 1 : b[0] === EMPTY_LABEL ? -1 : b[0].localeCompare(a[0])))
      .map(([key, value]) => {
        const [y, mo] = key.split('-');
        return { key, value, label: key === EMPTY_LABEL ? key : `${MONTHS[Number(mo) - 1]} ${y}` };
      });
    return { items, filterable: false };
  }

  if (info.type === 'number' && info.unique > 15) {
    const nums = rows.map((r) => toNumber(r[info.name]));
    const valid = nums.filter((n): n is number => n !== null);
    if (valid.length) {
      const lo = valid.reduce((a, b) => Math.min(a, b));
      const hi = valid.reduce((a, b) => Math.max(a, b));
      const bins = 8;
      const step = (hi - lo) / bins || 1;
      const counts = new Array(bins).fill(0);
      for (const n of valid) counts[Math.min(bins - 1, Math.floor((n - lo) / step))]++;
      const items: BreakdownItem[] = counts.map((value, i) => ({
        key: String(i),
        label: `${formatNumber(lo + step * i)} – ${formatNumber(i === bins - 1 ? hi : lo + step * (i + 1))}`,
        value,
      }));
      const empty = nums.length - valid.length;
      if (empty) items.push({ key: EMPTY_LABEL, value: empty });
      return { items: items.filter((i) => i.value > 0), filterable: false };
    }
  }

  const items = [...countBy(rows, info.name).entries()]
    .map(([key, value]) => ({ key, value }))
    .sort((a, b) => b.value - a.value || a.key.localeCompare(b.key, 'es'));
  return { items, filterable: true };
}
