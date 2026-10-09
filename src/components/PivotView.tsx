import { useMemo, useState } from 'react';
import { isMoneyColumn, TYPE_LABEL } from '../lib/columns';
import { formatCompact, formatNumber, percent, toNumber, valueKey } from '../lib/format';
import { exportTable } from '../lib/parse';
import { aggregate, makeGrouper, type Measure } from '../lib/pivot';
import type { ColumnInfo, Filter, Filters, Row } from '../lib/types';

interface Props {
  rows: Row[];
  allRows: Row[];
  columnInfo: ColumnInfo[];
  filters: Filters;
  onFilter: (col: string, f: Filter | null) => void;
  fileName: string;
}

type PctMode = 'none' | 'total' | 'row' | 'col';
type Bucket = { count: number; values: number[] };
const MAX_COLS = 12;
const OTHERS = '__otros__';

const bucket = (): Bucket => ({ count: 0, values: [] });

export function PivotView({ rows, allRows, columnInfo, filters, onFilter, fileName }: Props) {
  const groupable = columnInfo.filter((c) => c.type !== 'empty');
  const numberCols = columnInfo.filter((c) => c.type === 'number');
  const defaultRow = (columnInfo.find((c) => c.type === 'country') ?? columnInfo.find((c) => c.type === 'category') ?? groupable[0])?.name ?? '';
  const defaultCol = columnInfo.find((c) => c.type === 'category' && c.name !== defaultRow && c.unique <= MAX_COLS)?.name ?? '';

  const [rowCol, setRowCol] = useState(defaultRow);
  const [colCol, setColCol] = useState(defaultCol);
  const [measureKey, setMeasureKey] = useState('count');
  const [pct, setPct] = useState<PctMode>('none');
  const [sortAZ, setSortAZ] = useState(false);
  const [rowLimit, setRowLimit] = useState(50);

  const rowInfo = groupable.find((c) => c.name === rowCol) ?? groupable[0];
  const colInfo = groupable.find((c) => c.name === colCol);

  const measure: Measure = useMemo(() => {
    if (measureKey === 'count') return { kind: 'count' };
    const [kind, ...rest] = measureKey.split(':');
    return { kind: kind as 'sum' | 'avg' | 'median', col: rest.join(':') };
  }, [measureKey]);
  const additive = measure.kind === 'count' || measure.kind === 'sum';
  const money = measure.kind !== 'count' && isMoneyColumn(measure.col);
  const fmt = (v: number) => (measure.kind === 'count' ? formatNumber(v) : money ? `${formatCompact(v)} €` : formatCompact(v));

  const table = useMemo(() => {
    if (!rowInfo) return null;
    const rg = makeGrouper(allRows, rowInfo);
    const cg = colInfo ? makeGrouper(allRows, colInfo) : null;
    const rowsMeta = new Map<string, { label: string; order?: number; raw: Set<string> }>();
    const colsMeta = new Map<string, { label: string; order?: number; raw: Set<string> }>();
    const cells = new Map<string, Bucket>();
    const rowTot = new Map<string, Bucket>();
    const colTot = new Map<string, Bucket>();
    const grand = bucket();

    const add = (b: Bucket, v: number | null) => { b.count++; if (v !== null) b.values.push(v); };
    for (const r of rows) {
      const g = rg.of(r);
      const rm = rowsMeta.get(g.key) ?? { label: g.label, order: g.order, raw: new Set<string>() };
      rm.raw.add(valueKey(r[rowInfo.name]));
      rowsMeta.set(g.key, rm);
      const v = measure.kind === 'count' ? null : toNumber(r[measure.col]);
      add(grand, v);
      add(rowTot.get(g.key) ?? rowTot.set(g.key, bucket()).get(g.key)!, v);
      if (cg && colInfo) {
        const h = cg.of(r);
        const cm = colsMeta.get(h.key) ?? { label: h.label, order: h.order, raw: new Set<string>() };
        cm.raw.add(valueKey(r[colInfo.name]));
        colsMeta.set(h.key, cm);
        add(colTot.get(h.key) ?? colTot.set(h.key, bucket()).get(h.key)!, v);
        const ck = `${g.key}\u0000${h.key}`;
        add(cells.get(ck) ?? cells.set(ck, bucket()).get(ck)!, v);
      }
    }

    const val = (b: Bucket | undefined) => (b ? aggregate(b.values, measure, b.count) : 0);
    const byNatural = (a: { order?: number; label: string }, b: { order?: number; label: string }) => (a.order ?? 0) - (b.order ?? 0) || a.label.localeCompare(b.label, 'es');
    const hasOrder = (m: Map<string, { order?: number }>) => [...m.values()].some((x) => x.order !== undefined);

    let rowKeys = [...rowsMeta.keys()];
    if (hasOrder(rowsMeta)) rowKeys.sort((a, b) => byNatural(rowsMeta.get(a)!, rowsMeta.get(b)!));
    else if (sortAZ) rowKeys.sort((a, b) => rowsMeta.get(a)!.label.localeCompare(rowsMeta.get(b)!.label, 'es', { numeric: true }));
    else rowKeys.sort((a, b) => val(rowTot.get(b)) - val(rowTot.get(a)));

    let colKeys = [...colsMeta.keys()];
    if (hasOrder(colsMeta)) colKeys.sort((a, b) => byNatural(colsMeta.get(a)!, colsMeta.get(b)!));
    else colKeys.sort((a, b) => (colTot.get(b)?.count ?? 0) - (colTot.get(a)?.count ?? 0));
    // Demasiadas columnas: las menos frecuentes se agrupan en «Otros».
    let othersKeys: string[] = [];
    if (colKeys.length > MAX_COLS) {
      othersKeys = colKeys.slice(MAX_COLS - 1);
      colKeys = colKeys.slice(0, MAX_COLS - 1);
      const merged = (pick: (k: string) => Bucket | undefined) => {
        const b = bucket();
        for (const k of othersKeys) { const x = pick(k); if (x) { b.count += x.count; b.values.push(...x.values); } }
        return b;
      };
      colTot.set(OTHERS, merged((k) => colTot.get(k)));
      for (const rk of rowKeys) cells.set(`${rk}\u0000${OTHERS}`, merged((k) => cells.get(`${rk}\u0000${k}`)));
      colsMeta.set(OTHERS, { label: `Otros (${othersKeys.length})`, raw: new Set() });
      colKeys.push(OTHERS);
    }
    rowKeys = rowKeys.slice();

    let max = 0;
    for (const rk of rowKeys) for (const ck of colKeys) max = Math.max(max, val(cells.get(`${rk}\u0000${ck}`)));
    if (!cg) for (const rk of rowKeys) max = Math.max(max, val(rowTot.get(rk)));

    return { rg, cg, rowsMeta, colsMeta, rowKeys, colKeys, cells, rowTot, colTot, grand, val, max };
  }, [rows, allRows, rowInfo, colInfo, measure, sortAZ]);

  if (!table || !rowInfo) return <p className="muted">No hay columnas para agrupar.</p>;
  const { rowsMeta, colsMeta, rowKeys, colKeys, cells, rowTot, colTot, grand, val, max } = table;
  const grandVal = val(grand);

  const pctOf = (v: number, rk: string, ck: string | null) => {
    if (!additive || pct === 'none') return null;
    // rk === '' es la fila de totales: en «por fila» se compara con el total general.
    const base = pct === 'total' ? grandVal : pct === 'row' ? (rk ? val(rowTot.get(rk)) : grandVal) : ck ? val(colTot.get(ck)) : grandVal;
    return percent(v, base);
  };

  const rawOf = (meta: Map<string, { raw: Set<string> }>, k: string) => [...(meta.get(k)?.raw ?? [])];
  const isOnly = (col: string, values: string[]) => {
    const f = filters[col];
    return f?.kind === 'values' && f.included.length === values.length && values.every((v) => f.included.includes(v));
  };
  const filterRow = (rk: string) => {
    if (!table.rg.filterable) return;
    const v = rawOf(rowsMeta, rk);
    onFilter(rowInfo.name, isOnly(rowInfo.name, v) ? null : { kind: 'values', included: v });
  };
  const filterCol = (ck: string) => {
    if (!colInfo || !table.cg?.filterable || ck === OTHERS) return;
    const v = rawOf(colsMeta, ck);
    onFilter(colInfo.name, isOnly(colInfo.name, v) ? null : { kind: 'values', included: v });
  };
  const filterCell = (rk: string, ck: string) => {
    filterRow(rk);
    filterCol(ck);
  };

  const heat = (v: number) => (max ? { background: `rgba(51, 166, 166, ${(0.06 + 0.5 * (v / max)).toFixed(3)})` } : undefined);
  const shownRows = rowKeys.slice(0, rowLimit);
  const measureLabel = measure.kind === 'count' ? 'Peticiones' : `${{ sum: 'Suma', avg: 'Media', median: 'Mediana' }[measure.kind]} de ${measure.col}`;

  const doExport = () => {
    const header = [rowInfo.name, ...(colInfo ? colKeys.map((k) => colsMeta.get(k)!.label) : []), 'Total'];
    const body = rowKeys.map((rk) => [
      rowsMeta.get(rk)!.label,
      ...(colInfo ? colKeys.map((ck) => val(cells.get(`${rk}\u0000${ck}`))) : []),
      val(rowTot.get(rk)),
    ]);
    const foot = ['Total', ...(colInfo ? colKeys.map((ck) => val(colTot.get(ck))) : []), grandVal];
    const base = fileName.replace(/\.[^.]+$/, '');
    exportTable([[`${measureLabel}${colInfo ? ` por ${rowInfo.name} y ${colInfo.name}` : ` por ${rowInfo.name}`}`], [], header, ...body, foot], `${base} - tabla dinámica.xlsx`);
  };

  const cell = (v: number, rk: string, ck: string | null, total?: boolean) => {
    const p = pctOf(v, rk, ck);
    return (
      <>
        <span className={total ? '' : 'pv-val'}>{v || total ? fmt(v) : '·'}</span>
        {p && v > 0 && <span className="pv-pct">{p}</span>}
      </>
    );
  };

  return (
    <div className="pivot">
      <div className="toolbar">
        <label className="field">Filas
          <select className="select" value={rowInfo.name} onChange={(e) => { setRowCol(e.target.value); setRowLimit(50); }}>
            {groupable.map((c) => <option key={c.name} value={c.name}>{c.name} · {TYPE_LABEL[c.type]}</option>)}
          </select>
        </label>
        <button className="icon-btn swap" title="Intercambiar filas y columnas" aria-label="Intercambiar filas y columnas"
          disabled={!colInfo} onClick={() => { setRowCol(colCol); setColCol(rowInfo.name); }}>⇄</button>
        <label className="field">Columnas
          <select className="select" value={colInfo?.name ?? ''} onChange={(e) => setColCol(e.target.value)}>
            <option value="">— Ninguna —</option>
            {groupable.filter((c) => c.name !== rowInfo.name).map((c) => <option key={c.name} value={c.name}>{c.name} · {TYPE_LABEL[c.type]}</option>)}
          </select>
        </label>
        <label className="field">Valor
          <select className="select" value={measureKey} onChange={(e) => setMeasureKey(e.target.value)}>
            <option value="count">Número de peticiones</option>
            {numberCols.map((c) => <option key={`m${c.name}`} value={`median:${c.name}`}>Mediana de {c.name}</option>)}
            {numberCols.map((c) => <option key={`a${c.name}`} value={`avg:${c.name}`}>Media de {c.name}</option>)}
            {numberCols.map((c) => <option key={`s${c.name}`} value={`sum:${c.name}`}>Suma de {c.name}</option>)}
          </select>
        </label>
        {additive && (
          <div className="field">Porcentaje
            <div className="segmented" role="radiogroup">
              {([['none', 'No'], ['total', 'Del total'], ['row', 'Por fila'], ['col', 'Por columna']] as const)
                .filter(([id]) => colInfo || (id !== 'row' && id !== 'col'))
                .map(([id, label]) => (
                  <button key={id} role="radio" aria-checked={pct === id} className={pct === id ? 'is-active' : ''} onClick={() => setPct(id)}>{label}</button>
                ))}
            </div>
          </div>
        )}
        <button className="btn btn-primary push-right" onClick={doExport}>Exportar a Excel</button>
      </div>

      <p className="hint pv-hint">
        {measureLabel} · {formatNumber(rows.length)} filas con los filtros actuales
        {(table.rg.filterable || table.cg?.filterable) && ' · clic en una fila, columna o celda para filtrar toda la app'}
      </p>

      <div className="table-wrap pv-wrap">
        <table className="table pv-table">
          <thead>
            <tr>
              <th className="pv-corner">
                <button onClick={() => setSortAZ((s) => !s)} title="Cambiar orden">
                  {rowInfo.name}{colInfo ? ` \\ ${colInfo.name}` : ''}
                  <span className="sort">{sortAZ ? 'A–Z' : '↓'}</span>
                </button>
              </th>
              {colInfo && colKeys.map((ck) => (
                <th key={ck} className={`num ${isOnly(colInfo.name, rawOf(colsMeta, ck)) ? 'is-selected' : ''}`}>
                  <button onClick={() => filterCol(ck)} disabled={!table.cg?.filterable || ck === OTHERS} title={colsMeta.get(ck)!.label}>
                    {colsMeta.get(ck)!.label}
                  </button>
                </th>
              ))}
              <th className="num pv-total"><button disabled>Total</button></th>
            </tr>
          </thead>
          <tbody>
            {shownRows.map((rk) => {
              const sel = isOnly(rowInfo.name, rawOf(rowsMeta, rk));
              return (
                <tr key={rk} className={sel ? 'is-selected' : ''}>
                  <th scope="row" className="pv-rowhead">
                    <button onClick={() => filterRow(rk)} disabled={!table.rg.filterable} title={rowsMeta.get(rk)!.label}>
                      {rowsMeta.get(rk)!.label}
                    </button>
                  </th>
                  {colInfo && colKeys.map((ck) => {
                    const v = val(cells.get(`${rk}\u0000${ck}`));
                    return (
                      <td key={ck} className="num pv-cell" style={v ? heat(v) : undefined} onClick={() => v && filterCell(rk, ck)}>
                        {cell(v, rk, ck)}
                      </td>
                    );
                  })}
                  <td className="num pv-total" style={!colInfo ? heat(val(rowTot.get(rk))) : undefined} onClick={() => filterRow(rk)}>
                    {cell(val(rowTot.get(rk)), rk, null, true)}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" className="pv-rowhead"><button disabled>Total</button></th>
              {colInfo && colKeys.map((ck) => (
                <td key={ck} className="num">
                  {cell(val(colTot.get(ck)), "", ck, true)}
                </td>
              ))}
              <td className="num pv-total">{fmt(grandVal)}{additive && pct !== 'none' && <span className="pv-pct">100%</span>}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      {rowKeys.length > rowLimit && (
        <button className="link small pv-more" onClick={() => setRowLimit((l) => l + 100)}>
          Ver más filas ({rowKeys.length - rowLimit} restantes)
        </button>
      )}
    </div>
  );
}
