import { useEffect, useRef, useState } from 'react';
// El SDK de IA se carga solo al usarlo, para no ralentizar la carga inicial.
import type { AiContext, ChatMessage } from '../lib/ai';
import { Markdown } from './Markdown';

const KEY_STORAGE = 'prestige-anthropic-key';

function readKey(): string {
  try { return localStorage.getItem(KEY_STORAGE) ?? ''; } catch { return ''; }
}
function writeKey(k: string | null) {
  try { if (k) localStorage.setItem(KEY_STORAGE, k); else localStorage.removeItem(KEY_STORAGE); } catch { /* sin almacenamiento */ }
}

interface Turn { role: 'user' | 'assistant'; text: string; tools?: number; error?: boolean }

const SUGGESTIONS = [
  'Resume en 5 puntos lo más importante de estos datos',
  '¿De qué países vienen más peticiones y qué porcentaje suponen?',
  '¿Cómo se reparten las peticiones por agente?',
  '¿Qué ha cambiado en los últimos meses?',
];

export function AskAI({ context }: { context: AiContext }) {
  const [open, setOpen] = useState(false);
  const [apiKey, setApiKey] = useState(readKey);
  const [sessionKey, setSessionKey] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [draftKey, setDraftKey] = useState('');
  const [remember, setRemember] = useState(true);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [toolNote, setToolNote] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const key = apiKey || sessionKey;

  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [turns, toolNote]);

  const saveKey = (e: React.FormEvent) => {
    e.preventDefault();
    const k = draftKey.trim();
    if (!k) return;
    if (remember) { writeKey(k); setApiKey(k); setSessionKey(''); } else { writeKey(null); setApiKey(''); setSessionKey(k); }
    setDraftKey('');
    setShowSettings(false);
  };

  const forgetKey = () => { writeKey(null); setApiKey(''); setSessionKey(''); setShowSettings(false); };

  const send = async (question: string) => {
    const q = question.trim();
    if (!q || !key || busy) return;
    setInput('');
    setBusy(true);
    setToolNote('');
    const nextHistory: ChatMessage[] = [...history, { role: 'user', content: q }];
    setTurns((t) => [...t, { role: 'user', text: q }, { role: 'assistant', text: '', tools: 0 }]);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const patchLast = (fn: (t: Turn) => Turn) => setTurns((ts) => [...ts.slice(0, -1), fn(ts[ts.length - 1])]);
    const ai = await import('../lib/ai');
    try {
      const updated = await ai.ask(ai.createClient(key), nextHistory, context, {
        onText: (d) => { setToolNote(''); patchLast((t) => ({ ...t, text: t.text + d })); },
        onTool: () => { setToolNote('Consultando los datos…'); patchLast((t) => ({ ...t, tools: (t.tools ?? 0) + 1, text: t.text ? `${t.text}\n\n` : t.text })); },
      }, ctrl.signal);
      setHistory(updated);
    } catch (e) {
      if (ctrl.signal.aborted) patchLast((t) => ({ ...t, text: `${t.text}\n\n_(Cancelado)_` }));
      else patchLast((t) => ({ ...t, text: ai.describeError(e), error: true }));
      // El historial de la API no cambia: la pregunta fallida no se envía en la siguiente.
    } finally {
      setBusy(false);
      setToolNote('');
      abortRef.current = null;
    }
  };

  const reset = () => { abortRef.current?.abort(); setTurns([]); setHistory([]); };
  const nFilters = Object.keys(context.filters).length + (context.search ? 1 : 0);

  return (
    <>
      {!open && (
        <button className="ai-fab" onClick={() => setOpen(true)} aria-label="Preguntar a la IA">
          <span aria-hidden="true">✦</span> Preguntar a la IA
        </button>
      )}
      {open && (
        <aside className="ai-panel" aria-label="Asistente IA">
          <header className="ai-head">
            <div>
              <div className="ai-title"><span className="ai-spark" aria-hidden="true">✦</span> Asistente IA</div>
              <div className="ai-scope">
                Responde sobre <strong>{context.rows.length.toLocaleString('es-ES')}</strong> filas visibles
                {nFilters ? ` · ${nFilters} filtro${nFilters > 1 ? 's' : ''} activo${nFilters > 1 ? 's' : ''}` : ''}
              </div>
            </div>
            <div className="ai-head-actions">
              {turns.length > 0 && <button className="link small" onClick={reset}>Nueva conversación</button>}
              {key && <button className="icon-btn" onClick={() => setShowSettings((s) => !s)} aria-label="Ajustes de la IA" title="Ajustes">⚙</button>}
              <button className="icon-btn" onClick={() => setOpen(false)} aria-label="Cerrar">×</button>
            </div>
          </header>

          {(!key || showSettings) ? (
            <form className="ai-setup" onSubmit={saveKey}>
              <p className="ai-setup-title">Conecta tu cuenta de Anthropic</p>
              <p className="muted small">
                El asistente usa Claude, de Anthropic. Necesitas una API key (empieza por <code>sk-ant-</code>), que puedes crear en{' '}
                <a className="link" href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer">console.anthropic.com</a>.
                El uso se factura en esa cuenta.
              </p>
              <input
                className="input"
                type="password"
                autoComplete="off"
                placeholder="sk-ant-…"
                value={draftKey}
                onChange={(e) => setDraftKey(e.target.value)}
                aria-label="API key de Anthropic"
              />
              <label className="check">
                <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
                <span className="check-label">Recordar en este navegador</span>
              </label>
              <div className="ai-setup-actions">
                <button className="btn btn-primary" disabled={!draftKey.trim()}>Guardar</button>
                {key && <button type="button" className="btn btn-outline" onClick={() => setShowSettings(false)}>Cancelar</button>}
                {key && <button type="button" className="link small push-right" onClick={forgetKey}>Olvidar la clave</button>}
              </div>
              <p className="ai-privacy">
                <strong>Privacidad:</strong> al preguntar, tu pregunta, la estructura de las columnas y los resultados de los cálculos
                sobre las filas visibles se envían a Anthropic para generar la respuesta. La clave solo se guarda en este navegador.
              </p>
            </form>
          ) : (
            <>
              <div className="ai-messages">
                {turns.length === 0 && (
                  <div className="ai-empty">
                    <p className="muted">Pregunta lo que quieras sobre los datos que estás viendo. La IA tiene en cuenta los filtros activos.</p>
                    <div className="ai-suggestions">
                      {SUGGESTIONS.map((s) => <button key={s} className="toggle" onClick={() => send(s)}>{s}</button>)}
                    </div>
                  </div>
                )}
                {turns.map((t, i) => (
                  <div key={i} className={`ai-msg ai-${t.role} ${t.error ? 'ai-error' : ''}`}>
                    {t.role === 'user' ? t.text : (
                      <>
                        {t.text ? <Markdown text={t.text} /> : (busy && i === turns.length - 1 ? <span className="ai-typing" aria-label="Pensando"><i /><i /><i /></span> : null)}
                        {!!t.tools && <div className="ai-meta">Calculado con {t.tools} consulta{t.tools > 1 ? 's' : ''} sobre los datos</div>}
                      </>
                    )}
                  </div>
                ))}
                {toolNote && <div className="ai-tool">{toolNote}</div>}
                <div ref={endRef} />
              </div>
              <form className="ai-input" onSubmit={(e) => { e.preventDefault(); send(input); }}>
                <textarea
                  className="input"
                  rows={2}
                  placeholder="Escribe tu pregunta…"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); } }}
                  aria-label="Pregunta para la IA"
                />
                {busy
                  ? <button type="button" className="btn btn-outline" onClick={() => abortRef.current?.abort()}>Detener</button>
                  : <button className="btn btn-primary" disabled={!input.trim()}>Enviar</button>}
              </form>
              <p className="ai-foot">Las respuestas las genera una IA y pueden contener errores. Se envían a Anthropic la pregunta y cálculos sobre las filas visibles.</p>
            </>
          )}
        </aside>
      )}
    </>
  );
}
