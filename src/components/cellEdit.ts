import { isoDate, toNumber } from '../lib/format';
import type { Cell, ColumnType } from '../lib/types';

export function editValue(v: Cell, type: ColumnType): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return isoDate(v);
  if (type === 'number' && typeof v === 'number') return String(v);
  return String(v);
}

export function parseEdit(s: string, type: ColumnType): Cell {
  const t = s.trim();
  if (!t) return null;
  if (type === 'number') return toNumber(t) ?? t;
  if (type === 'date') {
    const [y, m, d] = t.split('-').map(Number);
    const date = new Date(y, (m ?? 1) - 1, d ?? 1);
    return Number.isNaN(date.getTime()) ? t : date;
  }
  return t;
}

export function inputType(type: ColumnType): string {
  return type === 'number' ? 'text' : type === 'date' ? 'date' : type === 'email' ? 'email' : 'text';
}
