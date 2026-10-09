import { useMemo, useState } from 'react';
import { breakdown } from '../lib/breakdown';
import { isMoneyColumn } from '../lib/columns';
import { formatCompact, formatNumber, isoDate, toNumber } from '../lib/format';
import { metricValue } from '../lib/geo';
import { REGION_COLORS } from '../lib/palette';
import { REGIONS } from '../lib/countries';
import type { ColumnInfo, Filters, Row } from '../lib/types';
import { BarList } from './BarList';
import { countryColumns, useGeo } from './useGeo';
import { WorldMap } from './WorldMap';
import { Timeline } from './Timeline';

interface Props {
  rows: Row[];
  allRows: Row[];
  columnInfo: ColumnInfo[];
  filters: Filters;
  onToggle: (col: string, value: string | string[]) => void;
  onGoMap: () => void;
}

const COUNT_METRIC = { kind: 'count' } as const;

export function Summary({ rows, allRows, columnInfo, filters, onToggle, onGoMap }: Props) {
  const countryCol = countryColumns(columnInfo)[0]?.name;
  const numberCols = columnInfo.filter((c) => c.type === 'number');
  const dateCols = columnInfo.filter((c) => c.type === 'date');
  // Todas las columnas con datos pueden mostrarse en el desglose.
  const chartable = columnInfo.filter((c) => c.type !== 'empty');

  const [charts, setCharts] = useState<string[]>(() => {
    const preferred = chartable.filter((c) => c.type === 'category' || c.type === 'boolean' || c.type === 'country');
    return (preferred.length ? preferred : chartable).slice(0, 6).map((c) => c.name);
  });
  const [dateCol, setDateCol] = useState(dateCols[0]?.name);
  const { agg, selected } = useGeo(rows, allRows, countryCol, COUNT_METRIC, undefined, filters);

  // Para importes y cantidades lo útil es el valor típico (mediana), no la suma de todas las filas.
  const kpis = useMemo(() => {
    return numberCols.slice(0, 3).map((c) => {
      const vals = rows.map((r) => toNumber(r[c.name])).filter((v): v is number => v !== null).sort((a, b) => a - b);
      const n = vals.length;
      const median = n ? (n % 2 ? vals[(n - 1) / 2] : (vals[n / 2 - 1] + vals[n / 2]) / 2) : 0;
      const avg = n ? vals.reduce((a, b) => a + b, 0) / n : 0;
      const money = isMoneyColumn(c.name);
      const fmt = (v: number) => (money ? `${formatCompact(v)} €` : formatCompact(v));
      return { name: c.name, n, median, avg, min: vals[0] ?? 0, max: vals[n - 1] ?? 0, fmt };
    });
  }, [rows, numberCols]);

  const dateRange = useMemo(() => {
    if (!dateCol) return null;
    let min: Date | null = null;
    let max: Date | null = null;
    for (const r of rows) {
      const d = r[dateCol];
      if (d instanceof Date) {
        if (!min || d < min) min = d;
        if (!max || d > max) max = d;
      }
    }
    return min && max ? { min, max } : null;
  }, [rows, dateCol]);

  const regionItems = useMemo(() => {
    if (!agg) return [];
    const m = new Map<string, number>();
    for (const a of agg.byCountry.values()) m.set(a.country.region, (m.get(a.country.region) ?? 0) + metricValue(a, COUNT_METRIC));
    return REGIONS.filter((r) => m.has(r)).map((r) => ({ key: r, value: m.get(r)!, color: REGION_COLORS[r] })).sort((a, b) => b.value - a.value);
  }, [agg]);

  const selectedValues = (col: string) => {
    const f = filters[col];
    return new Set(f?.kind === 'values' ? f.included : []);
  };

  return (
    <div className="summary">
      <div className="kpis">
        <div className="kpi">
          <span className="kpi-label">Filas</span>
          <span className="kpi-value">{formatNumber(rows.length)}</span>
          <span className="kpi-sub">de {formatNumber(allRows.length)} · {allRows.length ? Math.round((rows.length / allRows.length) * 100) : 0}%</span>
        </div>
        {agg && (
          <div className="kpi">
            <span className="kpi-label">Países</span>
            <span className="kpi-value">{agg.byCountry.size}</span>
            <span className="kpi-sub">{regionItems.length} zonas del mundo</span>
          </div>
        )}
        {kpis.map((k) => (
          <div
            className="kpi"
            key={k.name}
            title={`Mediana: la mitad de las filas está por debajo de ${k.fmt(k.median)} y la otra mitad por encima (${formatNumber(k.n)} filas con valor).`}
          >
            <span className="kpi-label kpi-label-wrap">{k.name} · mediana</span>
            <span className="kpi-value">{k.fmt(k.median)}</span>
            <span className="kpi-sub">media {k.fmt(k.avg)} · de {k.fmt(k.min)} a {k.fmt(k.max)}</span>
          </div>
        ))}
        {dateRange && (
          <div className="kpi">
            <span className="kpi-label" title={dateCol}>{dateCol}</span>
            <span className="kpi-value kpi-value-sm">{isoDate(dateRange.min).split('-').reverse().join('/')}</span>
            <span className="kpi-sub">hasta {isoDate(dateRange.max).split('-').reverse().join('/')}</span>
          </div>
        )}
      </div>

      {agg && countryCol && (
        <div className="map-grid">
          <div className="card map-card">
            <div className="card-head">
              <h3 className="card-title">Distribución mundial <span className="muted">· {countryCol}</span></h3>
              <button className="link" onClick={onGoMap}>Abrir mapa completo →</button>
            </div>
            <WorldMap
              agg={agg}
              metric={COUNT_METRIC}
              metricLabel="Filas"
              total={rows.length}
              mode="zona"
              selected={selected}
              onCountry={(a2) => { const a = agg.byCountry.get(a2); if (a) onToggle(countryCol, [...a.rawValues]); }}
              compact
            />
          </div>
          <div className="card">
            <h3 className="card-title">Por zona del mundo</h3>
            <BarList items={regionItems} total={rows.length} />
            <h3 className="card-title spaced">Top países</h3>
            <BarList
              items={[...agg.byCountry.values()].map((a) => ({ key: a.country.a2, label: a.country.es, value: a.count, color: REGION_COLORS[a.country.region] })).sort((a, b) => b.value - a.value)}
              selected={selected}
              onClick={(a2) => { const a = agg.byCountry.get(a2); if (a) onToggle(countryCol, [...a.rawValues]); }}
              limit={6}
              total={rows.length}
            />
          </div>
        </div>
      )}

      {dateCol && (
        <div className="card">
          <div className="card-head">
            <h3 className="card-title">Evolución mensual</h3>
            {dateCols.length > 1 && (
              <select className="select" value={dateCol} onChange={(e) => setDateCol(e.target.value)} aria-label="Columna de fecha">
                {dateCols.map((c) => <option key={c.name}>{c.name}</option>)}
              </select>
            )}
          </div>
          <Timeline rows={rows} col={dateCol} />
        </div>
      )}

      {chartable.length > 0 && (
        <>
          <div className="section-head">
            <h2 className="section-title">Desglose por columnas</h2>
            <div className="chip-toggles" aria-label="Elegir gráficos">
              <button className="link small" onClick={() => setCharts(chartable.map((c) => c.name))}>Todas ({chartable.length})</button>
              <button className="link small" onClick={() => setCharts([])}>Ninguna</button>
              {chartable.map((c) => {
                const on = charts.includes(c.name);
                return (
                  <button
                    key={c.name}
                    className={`toggle ${on ? 'is-on' : ''}`}
                    aria-pressed={on}
                    onClick={() => setCharts((p) => (on ? p.filter((x) => x !== c.name) : [...p, c.name]))}
                  >
                    {c.name}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="breakdown">
            {chartable.filter((c) => charts.includes(c.name)).map((c) => {
              const { items, filterable } = breakdown(rows, c);
              return (
                <div className="card" key={c.name}>
                  <h3 className="card-title" title={c.name}>{c.name} <span className="muted">· {items.length} valores</span></h3>
                  <BarList
                    items={items}
                    selected={filterable ? selectedValues(c.name) : undefined}
                    onClick={filterable ? (v) => onToggle(c.name, v) : undefined}
                    total={rows.length}
                  />
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
