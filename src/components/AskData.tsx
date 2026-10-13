import { useEffect, useMemo, useRef, useState } from 'react';
import { answer, suggestions, type Answer, type QueryContext } from '../lib/query';
import type { Filters } from '../lib/types';

interface Props {
  context: QueryContext;
  onApplyFilters: (f: Filters) => void;
  onOpenPivot: (rows: string, cols: string) => void;
}

interface Turn { question: string; answer: Answer }

export function AskData({ context, onApplyFilters, onOpenPivot }: Props) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [turns, setTurns] = useState<Turn[]>([]);
  const endRef = useRef<HTMLDivElement>(null);
  const hints = useMemo(() => suggestions(context), [context]);

  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [turns]);
  // Al cambiar de archivo u hoja, la conversación anterior deja de tener sentido.
  useEffect(() => { setTurns([]); }, [context.allRows]);

  const ask = (q: string) => {
    const text = q.trim();
    if (!text) return;
    setTurns((t) => [...t, { question: text, answer: answer(text, context) }]);
    setInput('');
  };

  return (
    <>
      {!open && (
        <button className="qa-fab" onClick={() => setOpen(true)}>
          <span aria-hidden="true">?</span> Preguntar a los datos
        </button>
      )}
      {open && (
        <aside className="qa-panel" aria-label="Preguntar a los datos">
          <header className="qa-head">
            <div>
              <div className="qa-title">Preguntar a los datos</div>
              <div className="qa-scope">Sobre <strong>{context.rows.length.toLocaleString('es-ES')}</strong> filas visibles · sin IA, gratis y privado</div>
            </div>
            <div className="qa-head-actions">
              {turns.length > 0 && <button className="link small" onClick={() => setTurns([])}>Borrar</button>}
              <button className="icon-btn" onClick={() => setOpen(false)} aria-label="Cerrar">×</button>
            </div>
          </header>

          <div className="qa-messages">
            {turns.length === 0 && (
              <div className="qa-empty">
                <p className="muted">
                  Escribe una pregunta usando los nombres de tus columnas o sus valores: «¿cuántas…?», «ranking de…»,
                  «porcentaje por…», «media / mediana de…», «compara A y B», «… en marzo», «más de 1 millón».
                </p>
                <p className="qa-sub">Ejemplos con tus datos</p>
                <div className="qa-suggestions">
                  {hints.map((s) => <button key={s} className="toggle" onClick={() => ask(s)}>{s}</button>)}
                </div>
              </div>
            )}
            {turns.map((t, i) => (
              <div key={i} className="qa-turn">
                <div className="qa-q">{t.question}</div>
                <AnswerCard a={t.answer} onAsk={ask} onApplyFilters={onApplyFilters} onOpenPivot={onOpenPivot} />
              </div>
            ))}
            <div ref={endRef} />
          </div>

          <form className="qa-input" onSubmit={(e) => { e.preventDefault(); ask(input); }}>
            <input
              className="input"
              placeholder="Ej.: ¿cuántas peticiones de Alemania en marzo?"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              aria-label="Pregunta"
              autoFocus
            />
            <button className="btn btn-primary" disabled={!input.trim()}>Preguntar</button>
          </form>
        </aside>
      )}
    </>
  );
}

function AnswerCard({ a, onAsk, onApplyFilters, onOpenPivot }: { a: Answer; onAsk: (q: string) => void } & Pick<Props, 'onApplyFilters' | 'onOpenPivot'>) {
  if (a.kind === 'unknown') {
    return (
      <div className="qa-a qa-unknown">
        <p>{a.title}</p>
        <p className="muted small">Prueba a nombrar una columna o un valor que aparezca en los datos. Por ejemplo:</p>
        <div className="qa-suggestions">{a.hints.slice(0, 5).map((h) => <button key={h} className="toggle" onClick={() => onAsk(h)}>{h}</button>)}</div>
      </div>
    );
  }
  const hasFilters = Object.keys(a.filters).length > 0;
  const max = a.kind === 'table' ? Math.max(...a.rows.map((r) => r.value), 0) : 0;
  return (
    <div className="qa-a">
      {a.understood.length > 0 && (
        <div className="qa-understood" aria-label="Lo que he entendido">
          {a.understood.map((u, i) => <span key={i} className="qa-chip"><span className="muted">{u.label}:</span> {u.value}</span>)}
        </div>
      )}
      {a.kind === 'number' && (
        <div className="qa-number">
          <span className="qa-number-label">{a.title}</span>
          <span className="qa-number-value">{a.value}</span>
          {a.detail && <span className="muted small">{a.detail}</span>}
        </div>
      )}
      {a.kind === 'table' && (
        <>
          <p className="qa-table-title">{a.title}</p>
          <table className="qa-table">
            <thead><tr>{a.columns.map((c, i) => <th key={c} className={i ? 'num' : ''}>{c}</th>)}</tr></thead>
            <tbody>
              {a.rows.map((r) => (
                <tr key={r.label}>
                  <td>
                    <span className="qa-bar" style={{ width: `${max ? (r.value / max) * 100 : 0}%` }} aria-hidden="true" />
                    <span className="qa-label">{r.label}</span>
                  </td>
                  <td className="num">{r.display}</td>
                  {r.pct !== undefined && <td className="num muted">{r.pct}</td>}
                </tr>
              ))}
            </tbody>
          </table>
          {a.more > 0 && <p className="muted small">… y {a.more} más</p>}
          {a.note && <p className="muted small">{a.note}</p>}
        </>
      )}
      {a.kind === 'rows' && (
        <>
          <p className="qa-table-title">{a.title}</p>
          <div className="qa-rows">
            <table className="qa-table">
              <thead><tr>{a.columns.map((c) => <th key={c}>{c}</th>)}</tr></thead>
              <tbody>{a.rows.map((r, i) => <tr key={i}>{a.columns.map((c) => <td key={c}>{r[c]}</td>)}</tr>)}</tbody>
            </table>
          </div>
          {a.total > a.rows.length && <p className="muted small">Mostrando {a.rows.length} de {a.total.toLocaleString('es-ES')}. Aplica los filtros para verlas todas en «Datos».</p>}
        </>
      )}
      {(hasFilters || (a.kind === 'table' && a.pivot)) && (
        <div className="qa-actions">
          {hasFilters && <button className="btn btn-outline" onClick={() => onApplyFilters(a.filters)}>Aplicar estos filtros a la app</button>}
          {a.kind === 'table' && a.pivot && (
            <button className="btn btn-outline" onClick={() => onOpenPivot(a.pivot!.rows, a.pivot!.cols)}>Abrir en tabla dinámica</button>
          )}
        </div>
      )}
    </div>
  );
}
