import { useMemo, useState } from 'react';
import { formatNumber } from '../lib/format';
import { metricValue, type Metric } from '../lib/geo';
import { CATEGORICAL, OTHER, REGION_COLORS, SEQUENTIAL } from '../lib/palette';
import { REGIONS } from '../lib/countries';
import type { ColumnInfo, Filters, Row } from '../lib/types';
import { BarList } from './BarList';
import { countryColumns, useGeo } from './useGeo';
import { WorldMap, type ColorMode } from './WorldMap';

interface Props {
  rows: Row[];
  allRows: Row[];
  columnInfo: ColumnInfo[];
  filters: Filters;
  onToggle: (col: string, value: string | string[]) => void;
}

export function MapView({ rows, allRows, columnInfo, filters, onToggle }: Props) {
  const countryCols = countryColumns(columnInfo);
  const numberCols = columnInfo.filter((c) => c.type === 'number');
  const catCols = columnInfo.filter((c) => c.type === 'category' || c.type === 'boolean');

  const [countryCol, setCountryCol] = useState(countryCols[0]?.name);
  const [mode, setMode] = useState<ColorMode>('zona');
  const [metricKey, setMetricKey] = useState('count');
  const [colorCol, setColorCol] = useState(catCols[0]?.name);

  const metric: Metric = useMemo(() => {
    if (metricKey === 'count') return { kind: 'count' };
    const [kind, ...rest] = metricKey.split(':');
    return { kind: kind as 'sum' | 'avg', col: rest.join(':') };
  }, [metricKey]);
  const metricLabel = metric.kind === 'count' ? 'Filas' : `${metric.kind === 'sum' ? 'Suma' : 'Media'} de ${metric.col}`;

  const activeCountryCol = countryCols.find((c) => c.name === countryCol)?.name ?? countryCols[0]?.name;
  const { agg, categoryColors, selected } = useGeo(rows, allRows, activeCountryCol, metric, mode === 'columna' ? colorCol : undefined, filters);

  if (!activeCountryCol || !agg) {
    return (
      <div className="empty-state">
        <h2 className="section-title">No se ha detectado ninguna columna de países</h2>
        <p>Para ver el mapa, tu hoja necesita una columna con nombres de países (en español o inglés) o códigos ISO (ES, ESP…).
          Si existe pero no se ha reconocido, cambia su tipo a «País» en la sección <strong>Columnas</strong>.</p>
      </div>
    );
  }

  const ranking = [...agg.byCountry.values()]
    .map((a) => ({
      key: a.country.a2,
      label: a.country.es,
      value: metricValue(a, metric),
      color: mode === 'zona' ? REGION_COLORS[a.country.region] : undefined,
    }))
    .sort((a, b) => b.value - a.value);

  const regionTotals = new Map<string, number>();
  for (const a of agg.byCountry.values()) regionTotals.set(a.country.region, (regionTotals.get(a.country.region) ?? 0) + metricValue(a, metric));

  const toggleCountry = (a2: string) => {
    const a = agg.byCountry.get(a2);
    if (a) onToggle(activeCountryCol, [...a.rawValues]);
  };

  const max = ranking[0]?.value ?? 0;

  return (
    <div className="map-view">
      <div className="toolbar">
        {countryCols.length > 1 && (
          <label className="field">Columna de país
            <select className="select" value={activeCountryCol} onChange={(e) => setCountryCol(e.target.value)}>
              {countryCols.map((c) => <option key={c.name}>{c.name}</option>)}
            </select>
          </label>
        )}
        <div className="field">Colorear por
          <div className="segmented" role="radiogroup">
            {([['zona', 'Zona del mundo'], ['cantidad', 'Cantidad'], ['columna', 'Columna']] as const).map(([id, label]) => (
              <button key={id} role="radio" aria-checked={mode === id} className={mode === id ? 'is-active' : ''} onClick={() => setMode(id)} disabled={id === 'columna' && !catCols.length}>
                {label}
              </button>
            ))}
          </div>
        </div>
        {mode === 'columna' && (
          <label className="field">Columna
            <select className="select" value={colorCol} onChange={(e) => setColorCol(e.target.value)}>
              {catCols.map((c) => <option key={c.name}>{c.name}</option>)}
            </select>
          </label>
        )}
        <label className="field">Métrica
          <select className="select" value={metricKey} onChange={(e) => setMetricKey(e.target.value)}>
            <option value="count">Número de filas</option>
            {numberCols.map((c) => <option key={`s${c.name}`} value={`sum:${c.name}`}>Suma de {c.name}</option>)}
            {numberCols.map((c) => <option key={`a${c.name}`} value={`avg:${c.name}`}>Media de {c.name}</option>)}
          </select>
        </label>
      </div>

      <div className="map-grid">
        <div className="card map-card">
          <WorldMap
            agg={agg}
            metric={metric}
            metricLabel={metricLabel}
            mode={mode}
            categoryColors={categoryColors}
            colorColLabel={colorCol}
            selected={selected}
            onCountry={toggleCountry}
          />
          <div className="legend">
            {mode === 'zona' && REGIONS.filter((r) => r !== 'Antártida').map((r) => (
              <span key={r} className="legend-item">
                <span className="swatch" style={{ background: REGION_COLORS[r] }} />{r}
                <span className="muted">{formatNumber(regionTotals.get(r) ?? 0)}</span>
              </span>
            ))}
            {mode === 'cantidad' && (
              <span className="legend-ramp">
                <span className="muted">0</span>
                <span className="ramp">{SEQUENTIAL.map((c) => <span key={c} style={{ background: c }} />)}</span>
                <span className="muted">{formatNumber(max)}</span>
                <span className="muted">· {metricLabel}</span>
              </span>
            )}
            {mode === 'columna' && [...categoryColors.entries()].slice(0, CATEGORICAL.length).map(([k, c]) => (
              <span key={k} className="legend-item"><span className="swatch" style={{ background: c }} />{k}</span>
            ))}
            {mode === 'columna' && categoryColors.size > CATEGORICAL.length && (
              <span className="legend-item"><span className="swatch" style={{ background: OTHER }} />Otros</span>
            )}
            {mode === 'columna' && <span className="muted">Color = valor más frecuente en cada país</span>}
          </div>
          <p className="hint">Rueda del ratón o botones para hacer zoom · arrastra para moverte · clic en un país para filtrar.</p>
        </div>

        <div className="card">
          <h3 className="card-title">Ranking por país <span className="muted">· {metricLabel}</span></h3>
          <BarList
            items={ranking}
            selected={selected}
            onClick={toggleCountry}
            limit={15}
          />
          {agg.unmatched.size > 0 && (
            <details className="unmatched">
              <summary>{[...agg.unmatched.values()].reduce((a, b) => a + b, 0)} filas sin país reconocido</summary>
              <ul>
                {[...agg.unmatched.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30).map(([k, n]) => (
                  <li key={k}><span>{k}</span><span className="muted">{n}</span></li>
                ))}
              </ul>
            </details>
          )}
        </div>
      </div>
    </div>
  );
}
