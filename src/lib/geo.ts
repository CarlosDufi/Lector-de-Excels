import { findCountry, type Country } from './countries';
import { toNumber, valueKey } from './format';
import type { Row } from './types';

export type Metric = { kind: 'count' } | { kind: 'sum' | 'avg'; col: string };

export interface CountryAgg {
  country: Country;
  count: number;
  sum: number;
  numeric: number;
  rawValues: Set<string>;
  categories: Map<string, number>;
}

export interface GeoAgg {
  byCountry: Map<string, CountryAgg>; // clave: alpha-2
  unmatched: Map<string, number>;
}

export function aggregateByCountry(rows: Row[], countryCol: string, metric: Metric, colorCol?: string): GeoAgg {
  const byCountry = new Map<string, CountryAgg>();
  const unmatched = new Map<string, number>();
  const cache = new Map<string, Country | undefined>();
  for (const r of rows) {
    const raw = valueKey(r[countryCol]);
    if (!cache.has(raw)) cache.set(raw, findCountry(r[countryCol]));
    const c = cache.get(raw);
    if (!c) {
      unmatched.set(raw, (unmatched.get(raw) ?? 0) + 1);
      continue;
    }
    let agg = byCountry.get(c.a2);
    if (!agg) {
      agg = { country: c, count: 0, sum: 0, numeric: 0, rawValues: new Set(), categories: new Map() };
      byCountry.set(c.a2, agg);
    }
    agg.count++;
    agg.rawValues.add(raw);
    if (metric.kind !== 'count') {
      const n = toNumber(r[metric.col]);
      if (n !== null) {
        agg.sum += n;
        agg.numeric++;
      }
    }
    if (colorCol) {
      const k = valueKey(r[colorCol]);
      agg.categories.set(k, (agg.categories.get(k) ?? 0) + 1);
    }
  }
  return { byCountry, unmatched };
}

export function metricValue(a: CountryAgg, m: Metric): number {
  if (m.kind === 'count') return a.count;
  if (m.kind === 'sum') return a.sum;
  return a.numeric ? a.sum / a.numeric : 0;
}

export function dominant(map: Map<string, number>): string | undefined {
  let best: string | undefined;
  let bestN = -1;
  for (const [k, n] of map) if (n > bestN) [best, bestN] = [k, n];
  return best;
}
