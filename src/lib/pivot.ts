import { findCountry } from './countries';
import { EMPTY_LABEL, formatNumber, toNumber, valueKey } from './format';
import type { ColumnInfo, Row } from './types';

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

export interface Group {
  key: string;
  label: string;
  /** Orden natural (fechas y tramos); si no hay, se ordena por total. */
  order?: number;
}

export interface Grouper {
  of: (row: Row) => Group;
  /** Si se puede filtrar por el grupo (los tramos de números y los meses no). */
  filterable: boolean;
}

/** Cómo agrupar una columna: países unificados, fechas por mes, números con muchos valores por tramos. */
export function makeGrouper(rows: Row[], info: ColumnInfo): Grouper {
  const col = info.name;
  if (info.type === 'date') {
    return {
      filterable: false,
      of: (r) => {
        const d = r[col];
        if (!(d instanceof Date)) return { key: EMPTY_LABEL, label: EMPTY_LABEL, order: Infinity };
        const k = d.getFullYear() * 12 + d.getMonth();
        return { key: String(k), label: `${MONTHS[d.getMonth()]} ${d.getFullYear()}`, order: k };
      },
    };
  }
  if (info.type === 'number' && info.unique > 15) {
    const nums = rows.map((r) => toNumber(r[col])).filter((n): n is number => n !== null);
    const lo = nums.length ? nums.reduce((a, b) => Math.min(a, b)) : 0;
    const hi = nums.length ? nums.reduce((a, b) => Math.max(a, b)) : 0;
    const bins = 8;
    const step = (hi - lo) / bins || 1;
    return {
      filterable: false,
      of: (r) => {
        const n = toNumber(r[col]);
        if (n === null) return { key: EMPTY_LABEL, label: EMPTY_LABEL, order: Infinity };
        const i = Math.min(bins - 1, Math.floor((n - lo) / step));
        return { key: String(i), label: `${formatNumber(lo + step * i)} – ${formatNumber(i === bins - 1 ? hi : lo + step * (i + 1))}`, order: i };
      },
    };
  }
  if (info.type === 'country') {
    return {
      filterable: true,
      of: (r) => {
        const raw = valueKey(r[col]);
        const c = findCountry(r[col]);
        return c ? { key: c.a2, label: c.es } : { key: `?${raw}`, label: raw };
      },
    };
  }
  return {
    filterable: true,
    of: (r) => {
      const k = valueKey(r[col]);
      return { key: k, label: k };
    },
  };
}

export type Measure = { kind: 'count' } | { kind: 'sum' | 'avg' | 'median'; col: string };

export function aggregate(values: number[], m: Measure, count: number): number {
  if (m.kind === 'count') return count;
  if (!values.length) return 0;
  if (m.kind === 'sum') return values.reduce((a, b) => a + b, 0);
  if (m.kind === 'avg') return values.reduce((a, b) => a + b, 0) / values.length;
  const v = values.slice().sort((a, b) => a - b);
  const n = v.length;
  return n % 2 ? v[(n - 1) / 2] : (v[n / 2 - 1] + v[n / 2]) / 2;
}
