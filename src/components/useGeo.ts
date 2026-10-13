import { useMemo } from 'react';
import { findCountry } from '../lib/countries';
import { countBy } from '../lib/filters';
import { aggregateByCountry, type Metric } from '../lib/geo';
import { CATEGORICAL, OTHER, distinctColors } from '../lib/palette';
import type { ColumnInfo, Filters, Row } from '../lib/types';

export function categoryColorMap(rows: Row[], col: string | undefined): Map<string, string> {
  const m = new Map<string, string>();
  if (!col) return m;
  const sorted = [...countBy(rows, col).entries()].sort((a, b) => b[1] - a[1]);
  sorted.forEach(([k], i) => m.set(k, CATEGORICAL[i] ?? OTHER));
  return m;
}

export function useGeo(rows: Row[], allRows: Row[] | undefined, countryCol: string | undefined, metric: Metric, colorCol: string | undefined, filters: Filters) {
  const agg = useMemo(
    () => (countryCol ? aggregateByCountry(rows, countryCol, metric, colorCol) : null),
    [rows, countryCol, metric, colorCol],
  );
  // Los colores se asignan sobre todos los datos para que no cambien al filtrar.
  const categoryColors = useMemo(() => categoryColorMap(allRows ?? rows, colorCol), [allRows, rows, colorCol]);
  // Un color por país, asignado por volumen sobre todos los datos para que no cambie al filtrar.
  const countryColors = useMemo(() => {
    const m = new Map<string, string>();
    if (!countryCol) return m;
    const all = aggregateByCountry(allRows ?? rows, countryCol, { kind: 'count' });
    const ranked = [...all.byCountry.values()].sort((a, b) => b.count - a.count);
    const colors = distinctColors(ranked.length);
    ranked.forEach((a, i) => m.set(a.country.a2, colors[i]));
    return m;
  }, [allRows, rows, countryCol]);
  const selected = useMemo(() => {
    const f = countryCol ? filters[countryCol] : undefined;
    const s = new Set<string>();
    if (f?.kind === 'values') for (const v of f.included) {
      const c = findCountry(v);
      if (c) s.add(c.a2);
    }
    return s;
  }, [filters, countryCol]);
  return { agg, categoryColors, countryColors, selected };
}

export function countryColumns(info: ColumnInfo[]) {
  return info.filter((c) => c.type === 'country');
}
