import * as XLSX from 'xlsx';
import type { Cell, Dataset, Row, Sheet, SheetInfo } from './types';

function cleanHeader(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toLocaleDateString('es-ES');
  return String(v).replace(/\s+/g, ' ').trim();
}

const isFilled = (c: unknown) => c !== null && c !== undefined && String(c).trim() !== '';
const isTextCell = (c: unknown) => typeof c === 'string' && c.trim() !== '' && !/^[-+]?[\d.,\s€$%]+$/.test(c.trim());
const TOTAL_RE = /^(total(es)?|subtotal|suma|sum|grand total|total general|totals?)\b/i;

function sheetToTable(ws: XLSX.WorkSheet, name: string, hidden: boolean): Sheet {
  const info: SheetInfo = {
    hidden, headerRow: 1, headerRows: 1, titleLines: [], mergedFilled: 0,
    droppedTotals: 0, droppedHeaders: 0, droppedEmpty: 0, comments: 0, formulasWithoutValue: 0,
  };
  if (!ws['!ref']) return { name, columns: [], rows: [], info };
  const range = XLSX.utils.decode_range(ws['!ref']);
  // blankrows: true mantiene la correspondencia fila de la matriz ↔ fila de Excel.
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: null, blankrows: true });
  const r0 = range.s.r;
  const c0 = range.s.c;

  // 1) Celdas combinadas: el valor se copia a todas las celdas del bloque.
  const hMerged = new Set<number>(); // filas con alguna combinación horizontal
  for (const m of ws['!merges'] ?? []) {
    const v = matrix[m.s.r - r0]?.[m.s.c - c0] ?? null;
    if (m.e.c > m.s.c) for (let r = m.s.r; r <= m.e.r; r++) hMerged.add(r - r0);
    if (!isFilled(v)) continue;
    for (let r = m.s.r; r <= m.e.r; r++) {
      const row = (matrix[r - r0] ??= []);
      for (let c = m.s.c; c <= m.e.c; c++) {
        if (r === m.s.r && c === m.s.c) continue;
        if (!isFilled(row[c - c0])) { row[c - c0] = v; info.mergedFilled++; }
      }
    }
  }

  // Fórmulas sin valor guardado (el archivo no se recalculó al guardarse).
  for (const addr of Object.keys(ws)) {
    if (addr[0] === '!') continue;
    const cell = ws[addr] as XLSX.CellObject;
    if (cell.f && (cell.v === undefined || cell.v === null)) info.formulasWithoutValue++;
  }

  // 2) Cabecera: primera fila (de las 30 primeras) con suficientes textos distintos.
  const scan = matrix.slice(0, 30);
  const maxFilled = Math.max(1, ...matrix.slice(0, 200).map((r) => (r ?? []).filter(isFilled).length));
  const distinctText = (r: unknown[] | undefined) => new Set((r ?? []).filter(isTextCell).map((c) => String(c).trim().toLowerCase())).size;
  const need = maxFilled === 1 ? 1 : Math.max(2, Math.ceil(maxFilled * 0.5));
  let h = scan.findIndex((r) => distinctText(r) >= need);
  if (h < 0) h = matrix.findIndex((r) => (r ?? []).some(isFilled));
  if (h < 0) return { name, columns: [], rows: [], info };

  // Cabecera en dos filas: la de arriba agrupa columnas con celdas combinadas.
  let headerCells = (matrix[h] ?? []).map(cleanHeader);
  let firstData = h + 1;
  const next = matrix[h + 1];
  if (hMerged.has(h) && next && distinctText(next) >= need && (next ?? []).filter(isFilled).every((c) => typeof c === 'string' && !/^[-+]?[\d.,\s]+$/.test(c.trim()))) {
    const width = Math.max(headerCells.length, next.length);
    headerCells = Array.from({ length: width }, (_, i) => {
      const top = cleanHeader(matrix[h]?.[i]);
      const bottom = cleanHeader(next[i]);
      return top && bottom && top.toLowerCase() !== bottom.toLowerCase() ? `${top} · ${bottom}` : bottom || top;
    });
    firstData = h + 2;
    info.headerRows = 2;
  }
  info.headerRow = r0 + h + 1;
  info.titleLines = matrix.slice(0, h)
    .map((r) => [...new Set((r ?? []).filter(isFilled).map(cleanHeader))].join(' · '))
    .filter(Boolean);

  const width = Math.max(headerCells.length, ...matrix.slice(firstData).map((r) => (r ?? []).length));
  const seen = new Map<string, number>();
  const columns = Array.from({ length: width }, (_, i) => {
    const base = headerCells[i] || `Columna ${i + 1}`;
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return n ? `${base} (${n + 1})` : base;
  });
  // Para detectar cabeceras repetidas se compara con la última fila de cabecera tal como está en el archivo.
  const headerKey = (matrix[firstData - 1] ?? []).map((c) => cleanHeader(c).toLowerCase());

  // 3) Comentarios/notas de celda, indexados por fila de la matriz.
  const notes = new Map<number, string[]>();
  for (const addr of Object.keys(ws)) {
    if (addr[0] === '!') continue;
    const cell = ws[addr] as XLSX.CellObject;
    if (!cell.c?.length) continue;
    const { r, c } = XLSX.utils.decode_cell(addr);
    const text = cell.c.map((x) => (x.t ?? '').trim()).filter(Boolean).join(' / ');
    if (!text) continue;
    const list = notes.get(r - r0) ?? [];
    list.push(`${columns[c - c0] ?? addr}: ${text}`);
    notes.set(r - r0, list);
  }

  // 4) Filas de datos.
  const rows: Row[] = [];
  const usedNotes = new Set<number>();
  for (let i = firstData; i < matrix.length; i++) {
    const r = matrix[i] ?? [];
    if (!r.some(isFilled)) { info.droppedEmpty++; continue; }
    const cellsText = r.map((c) => cleanHeader(c).toLowerCase());
    const same = headerKey.filter((k, j) => k && k === cellsText[j]).length;
    if (same >= Math.max(2, Math.ceil(headerKey.filter(Boolean).length * 0.8))) { info.droppedHeaders++; continue; }
    const firstText = r.slice(0, 3).find(isFilled);
    if (typeof firstText === 'string' && TOTAL_RE.test(firstText.trim())) { info.droppedTotals++; continue; }
    const row: Row = {};
    columns.forEach((col, j) => {
      let v = (r[j] ?? null) as Cell;
      if (typeof v === 'string') v = v.trim() === '' ? null : v.trim();
      row[col] = v;
    });
    if (notes.has(i)) { row[NOTES_COL] = notes.get(i)!.join(' | '); usedNotes.add(i); }
    rows.push(row);
  }
  info.comments = usedNotes.size;
  if (usedNotes.size) columns.push(NOTES_COL);

  // Columnas totalmente vacías y sin cabecera: fuera.
  const keep = columns.filter((c, j) => headerCells[j] || c === NOTES_COL || rows.some((r) => isFilled(r[c])));
  if (keep.length !== columns.length) {
    for (const row of rows) for (const c of columns) if (!keep.includes(c)) delete row[c];
  }
  return { name, columns: keep, rows, info };
}

export const NOTES_COL = 'Comentarios de celdas';

export function parseWorkbook(data: ArrayBuffer | string, fileName: string, source: Dataset['source'], url?: string): Dataset {
  // En texto (CSV) no se interpretan los valores: «900.000» es 900 mil, no 900; la app los convierte después.
  const wb = typeof data === 'string'
    ? XLSX.read(data, { type: 'string', cellDates: true, raw: true })
    : XLSX.read(data, { type: 'array', cellDates: true, cellNF: false });
  const hiddenFlags = wb.Workbook?.Sheets?.map((s) => !!s.Hidden) ?? [];
  const sheets = wb.SheetNames
    .map((n, i) => sheetToTable(wb.Sheets[n], n, hiddenFlags[i] ?? false))
    .filter((s) => s.columns.length > 0 && s.rows.length > 0);
  if (!sheets.length) throw new Error('No se encontraron datos en el archivo.');
  // Las hojas visibles primero.
  sheets.sort((a, b) => Number(a.info?.hidden) - Number(b.info?.hidden));
  return { fileName, source, url, loadedAt: Date.now(), sheets };
}

/** Texto de un CSV: UTF-8 si es válido; si no, Windows-1252 (exportaciones de Excel en español). */
export function decodeText(buf: ArrayBuffer): string {
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    text = new TextDecoder('windows-1252').decode(buf);
  }
  return text.replace(/^\uFEFF/, '');
}

const TEXT_EXT = /\.(csv|tsv|txt)$/i;

export async function parseFile(file: File): Promise<Dataset> {
  const buf = await file.arrayBuffer();
  return TEXT_EXT.test(file.name) ? parseWorkbook(decodeText(buf), file.name, 'file') : parseWorkbook(buf, file.name, 'file');
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
    return parseWorkbook(decodeText(await res.arrayBuffer()), name, 'url', url);
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
