import { findCountry } from './countries';
import { isEmpty, toNumber } from './format';
import type { ColumnInfo, ColumnType, Row } from './types';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_STR = /^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}.*)?$|^\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}$/;
const BOOL = new Set(['si', 'sí', 'no', 'yes', 'true', 'false', 'verdadero', 'falso', 'x']);
const COUNTRY_HINT = /pa[ií]s|country|nacionalidad|nationality|origen|origin|land|pays/i;

export function inferColumn(name: string, rows: Row[]): ColumnInfo {
  const values = rows.map((r) => r[name]).filter((v) => !isEmpty(v));
  const filled = values.length;
  const unique = new Set(values.map((v) => (v instanceof Date ? v.getTime() : String(v).toLowerCase()))).size;
  let type: ColumnType = 'text';
  if (!filled) type = 'empty';
  else {
    const sample = values.length > 2000 ? values.filter((_, i) => i % Math.ceil(values.length / 2000) === 0) : values;
    const share = (pred: (v: unknown) => boolean) => sample.filter(pred).length / sample.length;
    const countryShare = share((v) => typeof v === 'string' && !!findCountry(v));
    if (share((v) => v instanceof Date || (typeof v === 'string' && DATE_STR.test(v))) > 0.9) type = 'date';
    else if (share((v) => typeof v === 'boolean') > 0.9) type = 'boolean';
    else if (share((v) => toNumber(v as never) !== null) > 0.9 && unique > 2) type = 'number';
    else if (unique <= 3 && share((v) => BOOL.has(String(v).toLowerCase())) > 0.9) type = 'category';
    else if (countryShare > 0.7 || (COUNTRY_HINT.test(name) && countryShare > 0.4)) type = 'country';
    else if (share((v) => typeof v === 'string' && EMAIL.test(v)) > 0.8) type = 'email';
    else if (unique <= 60 || unique / filled < 0.3) type = 'category';
  }
  return { name, type, filled, unique };
}

export function inferColumns(columns: string[], rows: Row[]): ColumnInfo[] {
  return columns.map((c) => inferColumn(c, rows));
}

export const TYPE_LABEL: Record<ColumnType, string> = {
  number: 'Número', date: 'Fecha', boolean: 'Sí/No', country: 'País', category: 'Categoría',
  text: 'Texto', email: 'Email', empty: 'Vacía',
};

/** Convierte strings de fecha a Date para que ordenar/filtrar funcione. */
export function coerceDates(rows: Row[], cols: ColumnInfo[]): Row[] {
  const dateCols = cols.filter((c) => c.type === 'date').map((c) => c.name);
  if (!dateCols.length) return rows;
  return rows.map((r) => {
    const out = { ...r };
    for (const c of dateCols) {
      const v = out[c];
      if (typeof v === 'string') {
        const m = v.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
        const d = m ? new Date(Number(m[3].length === 2 ? `20${m[3]}` : m[3]), Number(m[2]) - 1, Number(m[1])) : new Date(v);
        if (!Number.isNaN(d.getTime())) out[c] = d;
      }
    }
    return out;
  });
}
