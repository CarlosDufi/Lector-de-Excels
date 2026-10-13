import { useEffect, useMemo, useRef, useState } from 'react';
import { geoNaturalEarth1, geoPath } from 'd3-geo';
import { feature } from 'topojson-client';
import type { Feature, FeatureCollection, Geometry } from 'geojson';
import type { Topology } from 'topojson-specification';
import worldUrl from 'world-atlas/countries-50m.json?url';
import { countryByNumericId } from '../lib/countries';
import { formatNumber, percent } from '../lib/format';
import { dominant, metricValue, type GeoAgg, type Metric } from '../lib/geo';
import { NO_DATA, OTHER, REGION_COLORS, sequentialColor } from '../lib/palette';

export type ColorMode = 'pais' | 'zona' | 'cantidad' | 'columna';

interface Props {
  agg: GeoAgg;
  metric: Metric;
  metricLabel: string;
  /** Total de la métrica (para el % de cada país). */
  total: number;
  mode: ColorMode;
  categoryColors?: Map<string, string>;
  /** Color de cada país (alpha-2) para el modo «pais». */
  countryColors?: Map<string, string>;
  /** Muestra nombre, peticiones y % sobre los países con datos. */
  showLabels?: boolean;
  colorColLabel?: string;
  selected: Set<string>; // alpha-2 seleccionados por filtro
  onCountry: (a2: string) => void;
  compact?: boolean;
}

const W = 960;
const H = 480;
let geoCache: Promise<Feature<Geometry, { name: string }>[]> | null = null;

function loadGeo() {
  geoCache ??= fetch(worldUrl).then((r) => r.json()).then((topo: Topology) => {
    const fc = feature(topo, topo.objects.countries) as unknown as FeatureCollection<Geometry, { name: string }>;
    return fc.features.filter((f) => f.id !== '010'); // sin Antártida
  }).catch((e) => {
    geoCache = null;
    throw e;
  });
  return geoCache;
}

export function WorldMap({ agg, metric, metricLabel, total, mode, categoryColors, countryColors, showLabels = true, colorColLabel, selected, onCountry, compact }: Props) {
  const [features, setFeatures] = useState<Feature<Geometry, { name: string }>[] | null>(null);
  const [view, setView] = useState({ k: 1, x: 0, y: 0 });
  const [hover, setHover] = useState<{ id: string; x: number; y: number } | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<{ x: number; y: number; vx: number; vy: number; moved: boolean } | null>(null);

  useEffect(() => {
    let alive = true;
    loadGeo().then((f) => alive && setFeatures(f)).catch(() => alive && setFeatures([]));
    return () => { alive = false; };
  }, []);

  const path = useMemo(() => {
    const projection = geoNaturalEarth1().fitExtent([[8, 8], [W - 8, H - 8]], { type: 'Sphere' });
    return geoPath(projection);
  }, []);

  const shapes = useMemo(
    () => features?.map((f) => ({
      id: String(f.id ?? ''),
      name: f.properties.name,
      d: path(f) ?? '',
      country: countryByNumericId(f.id as string),
      anchor: labelAnchor(f, path),
    })) ?? [],
    [features, path],
  );

  // Ancho real del mapa en pantalla, para que las etiquetas tengan siempre el mismo tamaño.
  const [pxPerUnit, setPxPerUnit] = useState(0.75);
  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setPxPerUnit(el.getBoundingClientRect().width / W || 0.75));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Etiquetas: de más a menos peticiones, se omiten las que se solaparían (aparecen al hacer zoom).
  const labels = useMemo(() => {
    if (!showLabels) return [];
    const fs = (compact ? 10 : 11.5) / (pxPerUnit * view.k);
    const placed: { x0: number; y0: number; x1: number; y1: number }[] = [];
    const out: { a2: string; x: number; y: number; name: string; stat: string; fs: number }[] = [];
    const byA2 = new Map(shapes.filter((s) => s.country).map((s) => [s.country!.a2, s]));
    const ranked = [...agg.byCountry.values()].sort((a, b) => b.count - a.count);
    for (const a of ranked) {
      const shape = byA2.get(a.country.a2);
      if (!shape?.anchor) continue;
      const [x, y] = shape.anchor;
      const name = a.country.es;
      const stat = `${formatNumber(a.count)} · ${percent(a.count, total)}`;
      const w = Math.max(name.length, stat.length) * fs * 0.58 + fs * 0.6;
      const h = fs * 2.5;
      const box = { x0: x - w / 2, y0: y - h / 2, x1: x + w / 2, y1: y + h / 2 };
      if (placed.some((p) => box.x0 < p.x1 && box.x1 > p.x0 && box.y0 < p.y1 && box.y1 > p.y0)) continue;
      placed.push(box);
      out.push({ a2: a.country.a2, x, y, name, stat, fs });
    }
    return out;
  }, [showLabels, shapes, agg, total, pxPerUnit, view.k, compact]);

  const max = useMemo(() => {
    let m = 0;
    for (const a of agg.byCountry.values()) m = Math.max(m, metricValue(a, metric));
    return m;
  }, [agg, metric]);

  const fillFor = (a2: string | undefined, region: string | undefined): { fill: string; opacity: number } => {
    const a = a2 ? agg.byCountry.get(a2) : undefined;
    if (mode === 'pais') {
      return a ? { fill: (a2 && countryColors?.get(a2)) || OTHER, opacity: 1 } : { fill: NO_DATA, opacity: 1 };
    }
    if (mode === 'zona') {
      const base = REGION_COLORS[region ?? ''] ?? OTHER;
      return a ? { fill: base, opacity: 1 } : { fill: base, opacity: 0.18 };
    }
    if (!a) return { fill: NO_DATA, opacity: 1 };
    if (mode === 'cantidad') {
      const v = metricValue(a, metric);
      // escala raíz: distribuye mejor valores muy desiguales
      return { fill: sequentialColor(max ? Math.sqrt(v / max) * 0.999 : 0), opacity: 1 };
    }
    const k = dominant(a.categories);
    return { fill: (k && categoryColors?.get(k)) || OTHER, opacity: 1 };
  };

  const toLocal = (e: { clientX: number; clientY: number }) => {
    const r = svg.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  };

  const zoomAt = (factor: number, cx = W / 2, cy = H / 2) => {
    setView((v) => {
      const k = Math.min(12, Math.max(1, v.k * factor));
      const f = k / v.k;
      const x = cx - (cx - v.x) * f;
      const y = cy - (cy - v.y) * f;
      return clamp({ k, x, y });
    });
  };

  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (compact && !e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const p = toLocal(e);
      zoomAt(e.deltaY < 0 ? 1.25 : 0.8, p.x, p.y);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  });

  const hovered = hover ? shapes.find((s) => s.id === hover.id) : undefined;
  const hoveredAgg = hovered?.country ? agg.byCountry.get(hovered.country.a2) : undefined;
  const wrapRect = wrap.current?.getBoundingClientRect();

  return (
    <div className={`map ${compact ? 'map-compact' : ''}`} ref={wrap}>
      {!features && <div className="map-loading">Cargando mapa…</div>}
      <svg
        ref={svg}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="Mapa del mundo con los datos por país"
        onPointerDown={(e) => {
          drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, moved: false };
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (d && view.k > 1) {
            const r = svg.current!.getBoundingClientRect();
            const dx = ((e.clientX - d.x) / r.width) * W;
            const dy = ((e.clientY - d.y) / r.height) * H;
            if (Math.abs(dx) + Math.abs(dy) > 3) {
              d.moved = true;
              svg.current!.setPointerCapture(e.pointerId);
            }
            setView((v) => clamp({ ...v, x: d.vx + dx, y: d.vy + dy }));
          }
        }}
        onPointerUp={() => { setTimeout(() => { drag.current = null; }, 0); }}
        onPointerLeave={() => setHover(null)}
        style={{ cursor: view.k > 1 ? 'grab' : 'default' }}
      >
        <rect width={W} height={H} className="map-sea" />
        <g transform={`translate(${view.x},${view.y}) scale(${view.k})`}>
          {shapes.map((s) => {
            const a2 = s.country?.a2;
            const { fill, opacity } = fillFor(a2, s.country?.region);
            const has = !!(a2 && agg.byCountry.has(a2));
            const isSel = !!(a2 && selected.has(a2));
            return (
              <path
                key={s.id + s.name}
                d={s.d}
                fill={fill}
                fillOpacity={opacity}
                className={`country ${has ? 'has-data' : ''} ${isSel ? 'is-selected' : ''} ${hover?.id === s.id ? 'is-hover' : ''}`}
                vectorEffect="non-scaling-stroke"
                onPointerMove={(e) => {
                  if (!wrap.current) return;
                  const r = wrap.current.getBoundingClientRect();
                  setHover({ id: s.id, x: e.clientX - r.left, y: e.clientY - r.top });
                }}
                onClick={() => {
                  if (drag.current?.moved) return;
                  if (has && a2) onCountry(a2);
                }}
              />
            );
          })}
          {labels.map((l) => (
            <text key={l.a2} x={l.x} y={l.y} className="map-label" style={{ fontSize: l.fs }} textAnchor="middle">
              <tspan x={l.x} dy={-l.fs * 0.15} className="map-label-name">{l.name}</tspan>
              <tspan x={l.x} dy={l.fs * 1.15}>{l.stat}</tspan>
            </text>
          ))}
        </g>
      </svg>

      <div className="map-zoom">
        <button className="icon-btn" onClick={() => zoomAt(1.5)} aria-label="Acercar">+</button>
        <button className="icon-btn" onClick={() => zoomAt(1 / 1.5)} aria-label="Alejar">−</button>
        {view.k > 1 && <button className="icon-btn" onClick={() => setView({ k: 1, x: 0, y: 0 })} aria-label="Restablecer">⟲</button>}
      </div>

      {hovered && hover && (
        <div
          className="tooltip"
          style={{
            left: Math.min(hover.x + 14, (wrapRect?.width ?? 600) - 220),
            top: Math.max(hover.y - 10, 0),
          }}
        >
          <div className="tooltip-title">{hovered.country?.es ?? hovered.name}</div>
          {hovered.country && <div className="tooltip-sub">{hovered.country.region} · {hovered.country.subregion}</div>}
          {hoveredAgg ? (
            <>
              <div className="tooltip-row"><span>Peticiones</span><strong>{formatNumber(hoveredAgg.count)}</strong></div>
              {metric.kind === 'count' && (
                <div className="tooltip-row"><span>% del total</span><strong>{percent(hoveredAgg.count, total)}</strong></div>
              )}
              {metric.kind !== 'count' && (
                <div className="tooltip-row"><span>{metricLabel}</span><strong>{formatNumber(metricValue(hoveredAgg, metric))}</strong></div>
              )}
              {metric.kind === 'sum' && (
                <div className="tooltip-row"><span>% del total</span><strong>{percent(metricValue(hoveredAgg, metric), total)}</strong></div>
              )}
              {mode === 'columna' && colorColLabel && (
                <div className="tooltip-row"><span>{colorColLabel}</span><strong>{dominant(hoveredAgg.categories)}</strong></div>
              )}
              <div className="tooltip-hint">Clic para filtrar</div>
            </>
          ) : (
            <div className="tooltip-sub">Sin datos</div>
          )}
        </div>
      )}
    </div>
  );
}

function clamp(v: { k: number; x: number; y: number }) {
  const minX = W - W * v.k;
  const minY = H - H * v.k;
  return { k: v.k, x: Math.min(0, Math.max(minX, v.x)), y: Math.min(0, Math.max(minY, v.y)) };
}

/** Punto de la etiqueta: centro del polígono más grande (evita que territorios lejanos lo desplacen). */
function labelAnchor(f: Feature<Geometry, { name: string }>, path: ReturnType<typeof geoPath>): [number, number] | null {
  const g = f.geometry;
  if (!g) return null;
  if (g.type === 'MultiPolygon') {
    let best: [number, number] | null = null;
    let bestArea = -1;
    for (const coords of g.coordinates) {
      const poly = { type: 'Polygon' as const, coordinates: coords };
      const area = path.area(poly);
      if (area > bestArea) {
        bestArea = area;
        best = path.centroid(poly) as [number, number];
      }
    }
    return best && Number.isFinite(best[0]) ? best : null;
  }
  const c = path.centroid(f) as [number, number];
  return Number.isFinite(c[0]) ? c : null;
}
