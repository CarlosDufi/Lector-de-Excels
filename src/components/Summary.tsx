import { useMemo, useState } from 'react';
import { countBy } from '../lib/filters';
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
  const chartable = columnInfo.filter((c) => (c.type === 'category' || c.type === 'boolean') && c.unique <= 60);

  const [charts, setCharts] = useState<string[]>(() => chartable.slice(0, 6).map((c) => c.name));
  const [dateCol, setDateCol] = useState(dateCols[0]?.name);
  const { agg, selected } = useGeo(rows, allRows, countryCol, COUNT_METRIC, undefined, filters);

  const kpis = useMemo(() => {
    return numberCols.slice(0, 3).map((c) => {
      let sum = 0;
      let n = 0;
      for (const r of rows) {
        const v = toNumber(r[c.name]);
        if (v !== null) { sum += v; n++; }
      }
      return { name: c.name, sum, avg: n ? sum / n : 0 };
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
          <div className="kpi" key={k.name}>
            <span className="kpi-label" title={k.name}>{k.name}</span>
            <span className="kpi-value">{formatCompact(k.sum)}</span>
            <span className="kpi-sub">media {formatCompact(k.avg)}</span>
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
              mode="zona"
              selected={selected}
              onCountry={(a2) => { const a = agg.byCountry.get(a2); if (a) onToggle(countryCol, [...a.rawValues]); }}
              compact
            />
          </div>
          <div className="card">
            <h3 className="card-title">Por zona del mundo</h3>
            <BarList items={regionItems} />
            <h3 className="card-title spaced">Top países</h3>
            <BarList
              items={[...agg.byCountry.values()].map((a) => ({ key: a.country.a2, label: a.country.es, value: a.count, color: REGION_COLORS[a.country.region] })).sort((a, b) => b.value - a.value)}
              selected={selected}
              onClick={(a2) => { const a = agg.byCountry.get(a2); if (a) onToggle(countryCol, [...a.rawValues]); }}
              limit={6}
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
              const items = [...countBy(rows, c.name).entries()].map(([key, value]) => ({ key, value })).sort((a, b) => b.value - a.value);
              return (
                <div className="card" key={c.name}>
                  <h3 className="card-title">{c.name}</h3>
                  <BarList
                    items={items}
                    selected={selectedValues(c.name)}
                    onClick={(v) => onToggle(c.name, v)}
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
