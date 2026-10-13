import { useMemo } from 'react';
import { countBy } from '../lib/filters';
import { EMPTY_LABEL, formatCell, formatNumber, toNumber } from '../lib/format';
import { TYPE_LABEL } from '../lib/columns';
import type { ColumnInfo, ColumnType, Row, Sheet } from '../lib/types';
import { BarList } from './BarList';

interface Props {
  rows: Row[];
  columnInfo: ColumnInfo[];
  onType: (col: string, t: ColumnType) => void;
  sheet: Sheet;
  sheetCount: number;
  hiddenSheets: number;
}

const TYPES: ColumnType[] = ['category', 'text', 'number', 'date', 'country', 'email', 'boolean', 'id'];

export function ColumnsView({ rows, columnInfo, onType, sheet, sheetCount, hiddenSheets }: Props) {
  return (
    <div>
      <ReadingSummary sheet={sheet} sheetCount={sheetCount} hiddenSheets={hiddenSheets} columns={columnInfo.length} />
      <div className="section-head">
        <h2 className="section-title">{columnInfo.length} columnas detectadas</h2>
        <p className="muted">Si una columna no se ha reconocido bien, cambia su tipo: se actualizan filtros, gráficos y mapa.</p>
      </div>
      <div className="columns-grid">
        {columnInfo.map((c) => <ColumnCard key={c.name} info={c} rows={rows} onType={onType} />)}
      </div>
    </div>
  );
}

function ColumnCard({ info, rows, onType }: { info: ColumnInfo; rows: Row[]; onType: Props['onType'] }) {
  const stats = useMemo(() => {
    const counts = countBy(rows, info.name);
    const empty = counts.get(EMPTY_LABEL) ?? 0;
    counts.delete(EMPTY_LABEL);
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([key, value]) => ({ key, value }));
    let nums: number[] = [];
    if (info.type === 'number') nums = rows.map((r) => toNumber(r[info.name])).filter((n): n is number => n !== null);
    const dates = info.type === 'date' ? rows.map((r) => r[info.name]).filter((d): d is Date => d instanceof Date) : [];
    return {
      empty,
      distinct: counts.size,
      top,
      min: nums.length ? nums.reduce((a, b) => Math.min(a, b)) : null,
      max: nums.length ? nums.reduce((a, b) => Math.max(a, b)) : null,
      avg: nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null,
      dmin: dates.length ? dates.reduce((a, b) => (a < b ? a : b)) : null,
      dmax: dates.length ? dates.reduce((a, b) => (a > b ? a : b)) : null,
    };
  }, [rows, info]);
  const filledPct = rows.length ? Math.round(((rows.length - stats.empty) / rows.length) * 100) : 0;

  return (
    <div className="card column-card">
      <div className="card-head">
        <h3 className="card-title" title={info.name}>{info.name}</h3>
        <select className="select select-sm" value={info.type} onChange={(e) => onType(info.name, e.target.value as ColumnType)} aria-label={`Tipo de ${info.name}`}>
          {TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
        </select>
      </div>
      <div className="mini-stats">
        <div><span className="muted">Rellenas</span><strong>{filledPct}%</strong></div>
        <div><span className="muted">Valores distintos</span><strong>{formatNumber(stats.distinct)}</strong></div>
        <div><span className="muted">Vacías</span><strong>{formatNumber(stats.empty)}</strong></div>
      </div>
      <div className="fill-meter" aria-hidden="true"><span style={{ width: `${filledPct}%` }} /></div>
      {info.type === 'number' && stats.min !== null && (
        <div className="mini-stats">
          <div><span className="muted">Mín</span><strong>{formatNumber(stats.min)}</strong></div>
          <div><span className="muted">Media</span><strong>{formatNumber(stats.avg ?? 0)}</strong></div>
          <div><span className="muted">Máx</span><strong>{formatNumber(stats.max ?? 0)}</strong></div>
        </div>
      )}
      {info.type === 'date' && stats.dmin && (
        <div className="mini-stats">
          <div><span className="muted">Desde</span><strong>{formatCell(stats.dmin)}</strong></div>
          <div><span className="muted">Hasta</span><strong>{formatCell(stats.dmax)}</strong></div>
        </div>
      )}
      {info.type !== 'number' && info.type !== 'date' && stats.top.length > 0 && (
        <BarList items={stats.top} limit={5} total={rows.length} />
      )}
    </div>
  );
}

function ReadingSummary({ sheet, sheetCount, hiddenSheets, columns }: { sheet: Sheet; sheetCount: number; hiddenSheets: number; columns: number }) {
  const i = sheet.info;
  const items: { text: string; warn?: boolean }[] = [];
  items.push({ text: `${formatNumber(sheet.rows.length)} filas y ${columns} columnas leídas de la hoja «${sheet.name}»${i?.hidden ? ' (hoja oculta en el Excel)' : ''}.` });
  if (sheetCount > 1) items.push({ text: `El archivo tiene ${sheetCount} hojas con datos${hiddenSheets ? `, ${hiddenSheets} de ellas ocultas` : ''}; cámbialas con el selector de la cabecera.` });
  if (i) {
    items.push({ text: `Cabecera en la fila ${i.headerRow}${i.headerRows === 2 ? ` y ${i.headerRow + 1} (dos filas combinadas: «grupo · columna»)` : ''}.` });
    if (i.titleLines.length) items.push({ text: `Texto encima de la tabla (no son datos): ${i.titleLines.slice(0, 3).map((t) => `«${t}»`).join(', ')}.` });
    if (i.mergedFilled) items.push({ text: `${formatNumber(i.mergedFilled)} celdas combinadas: su valor se ha copiado a cada fila/columna que abarcan.` });
    if (i.droppedTotals) items.push({ text: `${i.droppedTotals} fila${i.droppedTotals > 1 ? 's' : ''} de totales descartada${i.droppedTotals > 1 ? 's' : ''} para no contarlas como datos.` });
    if (i.droppedHeaders) items.push({ text: `${i.droppedHeaders} cabecera${i.droppedHeaders > 1 ? 's' : ''} repetida${i.droppedHeaders > 1 ? 's' : ''} dentro de la tabla descartada${i.droppedHeaders > 1 ? 's' : ''}.` });
    if (i.comments) items.push({ text: `${i.comments} fila${i.comments > 1 ? 's' : ''} con comentarios de celda: están en la columna «Comentarios de celdas».` });
    if (i.formulasWithoutValue) items.push({ text: `${i.formulasWithoutValue} fórmulas sin resultado guardado: ábrelo y guárdalo de nuevo en Excel para que se lean sus valores.`, warn: true });
  }
  return (
    <div className="card reading">
      <h3 className="card-title">Cómo se ha leído el archivo</h3>
      <ul>{items.map((it, k) => <li key={k} className={it.warn ? 'warn' : ''}>{it.text}</li>)}</ul>
    </div>
  );
}
