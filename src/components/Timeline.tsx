import { useMemo, useState } from 'react';
import { formatNumber } from '../lib/format';
import type { Row } from '../lib/types';

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

export function Timeline({ rows, col }: { rows: Row[]; col: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const buckets = useMemo(() => {
    const m = new Map<number, number>();
    let min = Infinity;
    let max = -Infinity;
    for (const r of rows) {
      const d = r[col];
      if (!(d instanceof Date)) continue;
      const k = d.getFullYear() * 12 + d.getMonth();
      m.set(k, (m.get(k) ?? 0) + 1);
      min = Math.min(min, k);
      max = Math.max(max, k);
    }
    if (!m.size) return [];
    // Limita a los últimos 60 meses para que sea legible.
    const start = Math.max(min, max - 59);
    return Array.from({ length: max - start + 1 }, (_, i) => ({ k: start + i, n: m.get(start + i) ?? 0 }));
  }, [rows, col]);

  if (!buckets.length) return <p className="muted">Sin fechas en los datos filtrados.</p>;
  const top = Math.max(...buckets.map((b) => b.n));
  const H = 140;
  const label = (k: number) => `${MONTHS[k % 12]} ${Math.floor(k / 12)}`;
  const every = Math.ceil(buckets.length / 12);

  return (
    <div className="timeline">
      <div className="timeline-bars" style={{ height: H }}>
        {buckets.map((b, i) => (
          <div
            key={b.k}
            className={`tbar ${hover === i ? 'is-hover' : ''}`}
            onPointerEnter={() => setHover(i)}
            onPointerLeave={() => setHover(null)}
          >
            <span className="tbar-fill" style={{ height: `${top ? (b.n / top) * 100 : 0}%` }} />
            {hover === i && <span className="tbar-tip">{label(b.k)} · <strong>{formatNumber(b.n)}</strong></span>}
          </div>
        ))}
      </div>
      <div className="timeline-axis">
        {buckets.map((b, i) => <span key={b.k}>{i % every === 0 ? label(b.k) : ''}</span>)}
      </div>
    </div>
  );
}
