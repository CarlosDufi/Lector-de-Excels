import { useRef, useState } from 'react';
import { parseFile, parseUrl } from '../lib/parse';
import { sampleDataset } from '../lib/sample';
import type { Dataset } from '../lib/types';

export function Uploader({ onLoad }: { onLoad: (d: Dataset) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (fn: () => Promise<Dataset>) => {
    setBusy(true);
    setError(null);
    try {
      onLoad(await fn());
    } catch (e) {
      setError((e as Error).message || 'No se pudo leer el archivo.');
    } finally {
      setBusy(false);
    }
  };

  const onFiles = (files: FileList | null) => {
    const f = files?.[0];
    if (f) run(() => parseFile(f));
  };

  return (
    <section className="welcome">
      <p className="eyebrow">Explora tus datos</p>
      <h1 className="welcome-title">Sube o conecta tu hoja de Excel</h1>
      <p className="welcome-lead">
        Leemos todas las hojas, columnas y filas. Después podrás filtrar seleccionando y deseleccionando valores,
        ver los países en el mapa del mundo y editar o exportar la información.
      </p>

      <div
        className={`dropzone ${drag ? 'is-drag' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); onFiles(e.dataTransfer.files); }}
        onClick={() => input.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && input.current?.click()}
        aria-busy={busy}
      >
        <svg viewBox="0 0 48 48" width="44" height="44" aria-hidden="true">
          <path d="M14 6h14l10 10v26H14z" fill="none" stroke="currentColor" strokeWidth="2" />
          <path d="M28 6v10h10" fill="none" stroke="currentColor" strokeWidth="2" />
          <path d="M20 26h12M20 31h12M20 36h8" stroke="#33a6a6" strokeWidth="2" />
        </svg>
        <strong>{busy ? 'Leyendo…' : 'Arrastra aquí tu archivo o haz clic para elegirlo'}</strong>
        <span className="muted">.xlsx · .xls · .csv · .ods</span>
        <input
          ref={input}
          type="file"
          accept=".xlsx,.xls,.xlsm,.csv,.ods,.tsv"
          hidden
          onChange={(e) => { onFiles(e.target.files); e.target.value = ''; }}
        />
      </div>

      <form
        className="connect"
        onSubmit={(e) => { e.preventDefault(); if (url.trim()) run(() => parseUrl(url)); }}
      >
        <label htmlFor="sheet-url">O conecta una hoja online (Google Sheets, enlace directo a .xlsx o .csv)</label>
        <div className="connect-row">
          <input
            id="sheet-url"
            className="input"
            type="url"
            placeholder="https://docs.google.com/spreadsheets/d/…"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          <button className="btn btn-primary" disabled={busy || !url.trim()}>Conectar</button>
        </div>
        <p className="hint">
          En Google Sheets: <em>Compartir → Cualquier persona con el enlace</em>, o <em>Archivo → Compartir → Publicar en la web</em>.
          Con una hoja conectada aparece el botón «Actualizar» para recargar los datos.
        </p>
      </form>

      {error && <div className="alert" role="alert">{error}</div>}

      <button className="link" onClick={() => run(async () => sampleDataset())}>Probar con datos de ejemplo</button>
    </section>
  );
}
