import type { Cell } from './types';

export const EMPTY_LABEL = '(vacío)';

const numberFmt = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 });
const compactFmt = new Intl.NumberFormat('es-ES', { notation: 'compact', maximumFractionDigits: 1 });
const dateFmt = new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });

export function isEmpty(v: Cell): boolean {
  return v === null || v === undefined || (typeof v === 'string' && v.trim() === '');
}

/** Clave de agrupación/filtrado de un valor. */
export function valueKey(v: Cell): string {
  if (isEmpty(v)) return EMPTY_LABEL;
  if (v instanceof Date) return isoDate(v);
  if (typeof v === 'boolean') return v ? 'Sí' : 'No';
  return String(v).trim();
}

export function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function formatCell(v: Cell): string {
  if (isEmpty(v)) return '';
  if (v instanceof Date) return dateFmt.format(v);
  if (typeof v === 'number') return numberFmt.format(v);
  if (typeof v === 'boolean') return v ? 'Sí' : 'No';
  return String(v);
}

export const formatNumber = (n: number) => numberFmt.format(n);
export const formatCompact = (n: number) => (Math.abs(n) >= 10000 ? compactFmt.format(n) : numberFmt.format(n));

export function toNumber(v: Cell): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string') {
    const s = v.replace(/[€$£\s%]/g, '');
    if (!s) return null;
    // 1.234,56 (es) o 1,234.56 (en)
    let norm = s;
    if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) norm = s.replace(/\./g, '').replace(',', '.');
    else if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) norm = s.replace(/,/g, '');
    else if (/^-?\d+,\d+$/.test(s)) norm = s.replace(',', '.');
    const n = Number(norm);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

const pctFmt = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 });

export function percent(value: number, total: number): string {
  return total ? `${pctFmt.format((value / total) * 100)}%` : '0%';
}
