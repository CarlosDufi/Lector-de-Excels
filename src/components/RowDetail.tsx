import { useEffect } from 'react';
import { findCountry } from '../lib/countries';
import { formatCell } from '../lib/format';
import { TYPE_LABEL } from '../lib/columns';
import type { Cell, ColumnInfo, Row } from '../lib/types';
import { editValue, inputType, parseEdit } from './cellEdit';

interface Props {
  row: Row;
  rows: Row[];
  columnInfo: ColumnInfo[];
  onNavigate: (r: Row) => void;
  onClose: () => void;
  onEdit: (row: Row, col: string, value: Cell) => void;
}

export function RowDetail({ row, rows, columnInfo, onNavigate, onClose, onEdit }: Props) {
  const idx = rows.indexOf(row);
  const prev = idx > 0 ? rows[idx - 1] : null;
  const next = idx >= 0 && idx < rows.length - 1 ? rows[idx + 1] : null;
  const title = formatCell(row[columnInfo.find((c) => c.type === 'text')?.name ?? columnInfo[0].name]) || 'Detalle';

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return;
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowDown' && next) onNavigate(next);
      if (e.key === 'ArrowUp' && prev) onNavigate(prev);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [next, prev, onClose, onNavigate]);

  return (
    <>
      <div className="scrim scrim-always" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-label="Detalle de la fila">
        <div className="drawer-head">
          <div>
            <p className="eyebrow">Fila {idx >= 0 ? idx + 1 : '—'} de {rows.length}</p>
            <h2 className="drawer-title">{title}</h2>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Cerrar">×</button>
        </div>
        <dl className="fields">
          {columnInfo.map((c) => {
            const v = row[c.name];
            const country = c.type === 'country' ? findCountry(v) : undefined;
            return (
              <div className="field-row" key={c.name}>
                <dt>{c.name} <span className="badge">{TYPE_LABEL[c.type]}</span></dt>
                <dd>
                  <input
                    key={`${c.name}-${editValue(v, c.type)}`}
                    className="input input-sm"
                    type={inputType(c.type)}
                    defaultValue={editValue(v, c.type)}
                    onBlur={(e) => {
                      const nv = parseEdit(e.target.value, c.type);
                      if (editValue(nv, c.type) !== editValue(v, c.type)) onEdit(row, c.name, nv);
                    }}
                    onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                  />
                  {country && <span className="muted small">{country.es} · {country.region}</span>}
                  {c.type === 'email' && typeof v === 'string' && <a className="link small" href={`mailto:${v}`}>Enviar email</a>}
                </dd>
              </div>
            );
          })}
        </dl>
        <div className="drawer-foot">
          <button className="btn btn-outline" disabled={!prev} onClick={() => prev && onNavigate(prev)}>‹ Anterior</button>
          <button className="btn btn-outline" disabled={!next} onClick={() => next && onNavigate(next)}>Siguiente ›</button>
        </div>
      </aside>
    </>
  );
}
