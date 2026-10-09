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

export type ColorMode = 'zona' | 'cantidad' | 'columna';

interface Props {
  agg: GeoAgg;
  metric: Metric;
  metricLabel: string;
  /** Total de la métrica (para el % de cada país). */
  total: number;
  mode: ColorMode;
  categoryColors?: Map<string, string>;
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

export function WorldMap({ agg, metric, metricLabel, total, mode, categoryColors, colorColLabel, selected, onCountry, compact }: Props) {
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
    () => features?.map((f) => ({ id: String(f.id ?? ''), name: f.properties.name, d: path(f) ?? '', country: countryByNumericId(f.id as string) })) ?? [],
    [features, path],
  );

  const max = useMemo(() => {
    let m = 0;
    for (const a of agg.byCountry.values()) m = Math.max(m, metricValue(a, metric));
    return m;
  }, [agg, metric]);

  const fillFor = (a2: string | undefined, region: string | undefined): { fill: string; opacity: number } => {
    const a = a2 ? agg.byCountry.get(a2) : undefined;
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
