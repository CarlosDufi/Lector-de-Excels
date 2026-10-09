import { useEffect, useMemo, useRef, useState } from 'react';
import { formatCell, toNumber } from '../lib/format';
import { TYPE_LABEL } from '../lib/columns';
import type { Cell, ColumnInfo, Row } from '../lib/types';
import { editValue, inputType, parseEdit } from './cellEdit';

interface Props {
  rows: Row[];
  columnInfo: ColumnInfo[];
  onOpen: (row: Row) => void;
  onEdit: (row: Row, col: string, value: Cell) => void;
  onExport: (columns: string[]) => void;
}

type Sort = { col: string; dir: 1 | -1 } | null;

function compare(a: Cell, b: Cell): number {
  if (a === null || a === undefined || a === '') return b === null || b === undefined || b === '' ? 0 : 1;
  if (b === null || b === undefined || b === '') return -1;
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
  const na = toNumber(a);
  const nb = toNumber(b);
  if (na !== null && nb !== null) return na - nb;
  return String(a).localeCompare(String(b), 'es', { numeric: true, sensitivity: 'base' });
}

export function DataTable({ rows, columnInfo, onOpen, onEdit, onExport }: Props) {
  const [sort, setSort] = useState<Sort>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  const [editing, setEditing] = useState<{ row: Row; col: string } | null>(null);
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => { if (!menuRef.current?.contains(e.target as Node)) setMenu(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menu]);

  const visible = columnInfo.filter((c) => !hidden.has(c.name));
  const sorted = useMemo(() => {
    if (!sort) return rows;
    return rows.slice().sort((a, b) => {
      const c = compare(a[sort.col], b[sort.col]);
      // Los vacíos siempre al final, independientemente del sentido.
      const emptyA = a[sort.col] === null || a[sort.col] === '';
      const emptyB = b[sort.col] === null || b[sort.col] === '';
      return emptyA || emptyB ? c : c * sort.dir;
    });
  }, [rows, sort]);

  const pages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const current = Math.min(page, pages - 1);
  const slice = sorted.slice(current * pageSize, current * pageSize + pageSize);

  const toggleSort = (col: string) =>
    setSort((s) => (!s || s.col !== col ? { col, dir: 1 } : s.dir === 1 ? { col, dir: -1 } : null));

  return (
    <div className="table-view">
      <div className="toolbar">
        <div className="col-menu" ref={menuRef}>
          <button className="btn btn-outline" onClick={() => setMenu((m) => !m)} aria-expanded={menu}>
            Columnas visibles ({visible.length}/{columnInfo.length})
          </button>
          {menu && (
            <div className="menu">
              <div className="menu-actions">
                <button className="link small" onClick={() => setHidden(new Set())}>Mostrar todas</button>
                <button className="link small" onClick={() => setHidden(new Set(columnInfo.slice(1).map((c) => c.name)))}>Ocultar todas</button>
              </div>
              {columnInfo.map((c) => (
                <label key={c.name} className="check">
                  <input
                    type="checkbox"
                    checked={!hidden.has(c.name)}
                    onChange={() => setHidden((h) => {
                      const n = new Set(h);
                      if (n.has(c.name)) n.delete(c.name);
                      else n.add(c.name);
                      return n;
                    })}
                  />
                  <span className="check-label">{c.name}</span>
                  <span className="badge">{TYPE_LABEL[c.type]}</span>
                </label>
              ))}
            </div>
          )}
        </div>
        <span className="muted hide-sm">Doble clic en una celda para editarla · clic en la fila para ver el detalle</span>
        <button className="btn btn-primary push-right" onClick={() => onExport(visible.map((c) => c.name))}>Exportar a Excel</button>
      </div>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th className="rownum">#</th>
              {visible.map((c) => (
                <th key={c.name} className={c.type === 'number' ? 'num' : ''}>
                  <button onClick={() => toggleSort(c.name)} title={`Ordenar por ${c.name}`}>
                    {c.name}
                    <span className="sort">{sort?.col === c.name ? (sort.dir === 1 ? '▲' : '▼') : ''}</span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {slice.map((r, i) => (
              <tr key={current * pageSize + i} onClick={() => onOpen(r)}>
                <td className="rownum">{current * pageSize + i + 1}</td>
                {visible.map((c) => {
                  const isEdit = editing?.row === r && editing.col === c.name;
                  return (
                    <td
                      key={c.name}
                      className={c.type === 'number' ? 'num' : ''}
                      onDoubleClick={(e) => { e.stopPropagation(); setEditing({ row: r, col: c.name }); }}
                      onClick={(e) => isEdit && e.stopPropagation()}
                    >
                      {isEdit ? (
                        <input
                          autoFocus
                          className="cell-input"
                          type={inputType(c.type)}
                          defaultValue={editValue(r[c.name], c.type)}
                          onBlur={(e) => { onEdit(r, c.name, parseEdit(e.target.value, c.type)); setEditing(null); }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                            if (e.key === 'Escape') setEditing(null);
                          }}
                        />
                      ) : (
                        <span className="cell" title={formatCell(r[c.name])}>{formatCell(r[c.name])}</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
            {!slice.length && (
              <tr><td colSpan={visible.length + 1} className="muted empty-row">No hay filas con los filtros actuales.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="pager">
        <span className="muted">
          {sorted.length ? `${current * pageSize + 1}–${Math.min(sorted.length, (current + 1) * pageSize)} de ${sorted.length.toLocaleString('es-ES')}` : '0 filas'}
        </span>
        <select className="select" value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(0); }} aria-label="Filas por página">
          {[25, 50, 100, 250, 500].map((n) => <option key={n} value={n}>{n} por página</option>)}
        </select>
        <button className="btn btn-outline" disabled={current === 0} onClick={() => setPage(current - 1)}>‹ Anterior</button>
        <span>{current + 1} / {pages}</span>
        <button className="btn btn-outline" disabled={current >= pages - 1} onClick={() => setPage(current + 1)}>Siguiente ›</button>
      </div>
    </div>
  );
}
