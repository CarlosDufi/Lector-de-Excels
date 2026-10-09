import * as XLSX from 'xlsx';
import type { Cell, Dataset, Row, Sheet } from './types';

function cleanHeader(v: unknown, i: number): string {
  const s = v === null || v === undefined ? '' : String(v).replace(/\s+/g, ' ').trim();
  return s || `Columna ${i + 1}`;
}

function sheetToTable(ws: XLSX.WorkSheet, name: string): Sheet {
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: null, blankrows: false });
  // La cabecera es la primera fila con al menos 2 celdas rellenas (o la primera no vacía).
  let headerIdx = matrix.findIndex((r) => r.filter((c) => c !== null && String(c).trim() !== '').length >= 2);
  if (headerIdx < 0) headerIdx = matrix.findIndex((r) => r.some((c) => c !== null && String(c).trim() !== ''));
  if (headerIdx < 0) return { name, columns: [], rows: [] };

  const width = Math.max(...matrix.slice(headerIdx).map((r) => r.length));
  const seen = new Map<string, number>();
  const columns = Array.from({ length: width }, (_, i) => {
    const base = cleanHeader(matrix[headerIdx][i], i);
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return n ? `${base} (${n + 1})` : base;
  });

  const rows: Row[] = [];
  for (const r of matrix.slice(headerIdx + 1)) {
    if (!r.some((c) => c !== null && String(c).trim() !== '')) continue;
    const row: Row = {};
    columns.forEach((col, i) => {
      let v = (r[i] ?? null) as Cell;
      if (typeof v === 'string') v = v.trim() === '' ? null : v.trim();
      row[col] = v;
    });
    rows.push(row);
  }
  // Descarta columnas totalmente vacías sin cabecera.
  const keep = columns.filter((c, i) => matrix[headerIdx][i] !== null || rows.some((r) => r[c] !== null));
  if (keep.length !== columns.length) {
    for (const row of rows) for (const c of columns) if (!keep.includes(c)) delete row[c];
  }
  return { name, columns: keep, rows };
}

export function parseWorkbook(data: ArrayBuffer | string, fileName: string, source: Dataset['source'], url?: string): Dataset {
  const wb = typeof data === 'string'
    ? XLSX.read(data, { type: 'string', cellDates: true })
    : XLSX.read(data, { type: 'array', cellDates: true });
  const sheets = wb.SheetNames.map((n) => sheetToTable(wb.Sheets[n], n)).filter((s) => s.columns.length > 0);
  if (!sheets.length) throw new Error('No se encontraron datos en el archivo.');
  return { fileName, source, url, loadedAt: Date.now(), sheets };
}

export async function parseFile(file: File): Promise<Dataset> {
  const buf = await file.arrayBuffer();
  return parseWorkbook(buf, file.name, 'file');
}

/** Convierte enlaces de Google Sheets a su URL de exportación directa. */
export function toDownloadUrl(url: string): string {
  const m = url.match(/docs\.google\.com\/spreadsheets\/d\/(e\/)?([a-zA-Z0-9_-]+)/);
  if (m) {
    if (m[1]) return url.includes('output=') ? url : `https://docs.google.com/spreadsheets/d/e/${m[2]}/pub?output=xlsx`;
    return `https://docs.google.com/spreadsheets/d/${m[2]}/export?format=xlsx`;
  }
  // Dropbox: forzar descarga directa.
  if (url.includes('dropbox.com')) return url.replace(/([?&])dl=0/, '$1dl=1');
  return url;
}

export async function parseUrl(url: string): Promise<Dataset> {
  const target = toDownloadUrl(url.trim());
  let res: Response;
  try {
    res = await fetch(target);
  } catch {
    throw new Error('No se pudo acceder al enlace. Comprueba que la hoja es pública (o publicada en la web) y permite descargas.');
  }
  if (!res.ok) throw new Error(`El servidor respondió ${res.status}. ¿La hoja está compartida públicamente?`);
  const type = res.headers.get('content-type') ?? '';
  const name = decodeURIComponent(target.split('/').pop()?.split('?')[0] || 'hoja-conectada');
  if (type.includes('text/csv') || type.includes('text/plain') || target.includes('output=csv') || target.includes('format=csv')) {
    return parseWorkbook(await res.text(), name, 'url', url);
  }
  if (type.includes('text/html')) {
    throw new Error('El enlace devolvió una página web en lugar de una hoja. Usa un enlace público o "Publicar en la web".');
  }
  return parseWorkbook(await res.arrayBuffer(), name, 'url', url);
}

export function exportRows(rows: Row[], columns: string[], fileName: string) {
  const data = rows.map((r) => Object.fromEntries(columns.map((c) => [c, r[c] ?? null])));
  const ws = XLSX.utils.json_to_sheet(data, { header: columns, cellDates: true });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Datos');
  XLSX.writeFile(wb, fileName);
}

export function exportTable(aoa: (string | number | null)[][], fileName: string, sheetName = 'Tabla') {
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, fileName);
}
