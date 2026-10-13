import { useCallback, useEffect, useMemo, useState } from 'react';
import { coerceDates, inferColumns } from './lib/columns';
import { applyFilters } from './lib/filters';
import { exportRows, parseUrl } from './lib/parse';
import { loadDataset, saveDataset } from './lib/storage';
import type { Cell, ColumnInfo, ColumnType, Dataset, Filter, Filters, Row } from './lib/types';
import { Uploader } from './components/Uploader';
import { FilterPanel } from './components/FilterPanel';
import { FilterChips } from './components/FilterChips';
import { Summary } from './components/Summary';
import { MapView } from './components/MapView';
import { DataTable } from './components/DataTable';
import { ColumnsView } from './components/ColumnsView';
import { PivotView } from './components/PivotView';
import { AskAI } from './components/AskAI';
import { RowDetail } from './components/RowDetail';

type Tab = 'resumen' | 'mapa' | 'tabla' | 'datos' | 'columnas';
const TABS: { id: Tab; label: string }[] = [
  { id: 'resumen', label: 'Resumen' },
  { id: 'mapa', label: 'Mapa' },
  { id: 'tabla', label: 'Tabla dinámica' },
  { id: 'datos', label: 'Datos' },
  { id: 'columnas', label: 'Columnas' },
];

function prepare(d: Dataset): Dataset {
  return {
    ...d,
    sheets: d.sheets.map((s) => ({ ...s, rows: coerceDates(s.rows, inferColumns(s.columns, s.rows)) })),
  };
}

export default function App() {
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [booting, setBooting] = useState(true);
  const [sheetIdx, setSheetIdx] = useState(0);
  const [filters, setFilters] = useState<Filters>({});
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<Tab>('resumen');
  const [typeOverrides, setTypeOverrides] = useState<Record<string, ColumnType>>({});
  const [detail, setDetail] = useState<Row | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadDataset().then((d) => {
      if (d) setDataset(d);
      setBooting(false);
    });
  }, []);

  const load = useCallback((d: Dataset) => {
    const prepared = prepare(d);
    setDataset(prepared);
    setSheetIdx(0);
    setFilters({});
    setSearch('');
    setTypeOverrides({});
    setDetail(null);
    setTab('resumen');
    saveDataset(prepared);
  }, []);

  const sheet = dataset?.sheets[Math.min(sheetIdx, dataset.sheets.length - 1)];
  const rows = useMemo(() => sheet?.rows ?? [], [sheet]);
  const columns = useMemo(() => sheet?.columns ?? [], [sheet]);

  const columnInfo: ColumnInfo[] = useMemo(
    () => inferColumns(columns, rows).map((c) => (typeOverrides[c.name] ? { ...c, type: typeOverrides[c.name] } : c)),
    // La inferencia depende solo de columnas/filas originales; las ediciones no cambian los tipos.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [columns, sheet?.name, dataset?.loadedAt, typeOverrides],
  );

  // El mapa solo tiene sentido si hay alguna columna de países.
  const hasMap = columnInfo.some((c) => c.type === 'country');
  const tabs = TABS.filter((t) => t.id !== 'mapa' || hasMap);
  const activeTab: Tab = tab === 'mapa' && !hasMap ? 'resumen' : tab;

  const filtered = useMemo(() => applyFilters(rows, filters, columns, search), [rows, filters, columns, search]);

  const setFilter = useCallback((col: string, f: Filter | null) => {
    setFilters((prev) => {
      const next = { ...prev };
      if (f === null) delete next[col];
      else next[col] = f;
      return next;
    });
  }, []);

  /** Clic en barra/país: añade/quita ese valor del filtro; si era el único, quita el filtro. */
  const toggleOnly = useCallback((col: string, value: string | string[]) => {
    const values = Array.isArray(value) ? value : [value];
    setFilters((prev) => {
      const cur = prev[col];
      const next = { ...prev };
      if (cur?.kind !== 'values') next[col] = { kind: 'values', included: values };
      else if (values.every((v) => cur.included.includes(v))) {
        const rest = cur.included.filter((v) => !values.includes(v));
        if (rest.length) next[col] = { kind: 'values', included: rest };
        else delete next[col];
      } else next[col] = { kind: 'values', included: [...new Set([...cur.included, ...values])] };
      return next;
    });
  }, []);

  const editCell = useCallback((row: Row, col: string, value: Cell) => {
    const updated = { ...row, [col]: value };
    setDetail((d) => (d === row ? updated : d));
    setDataset((prev) => {
      if (!prev) return prev;
      const sheets = prev.sheets.map((s, i) => {
        if (i !== sheetIdx) return s;
        const idx = s.rows.indexOf(row);
        if (idx < 0) return s;
        const nextRows = s.rows.slice();
        nextRows[idx] = updated;
        return { ...s, rows: nextRows };
      });
      const next = { ...prev, sheets };
      saveDataset(next);
      return next;
    });
  }, [sheetIdx]);

  const refresh = async () => {
    if (!dataset?.url) return;
    setRefreshing(true);
    setError(null);
    try {
      const d = prepare(await parseUrl(dataset.url));
      setDataset(d);
      saveDataset(d);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRefreshing(false);
    }
  };

  const close = () => {
    setDataset(null);
    saveDataset(null);
    setFilters({});
    setSearch('');
  };

  const doExport = (cols: string[]) => {
    const base = (dataset?.fileName ?? 'datos').replace(/\.[^.]+$/, '');
    exportRows(filtered, cols, `${base} - filtrado.xlsx`);
  };

  if (booting) return <div className="boot" aria-busy="true" />;

  if (!dataset || !sheet) {
    return (
      <div className="app">
        <Header />
        <Uploader onLoad={load} />
      </div>
    );
  }

  return (
    <div className="app">
      <Header>
        <div className="file-meta">
          <span className="file-name" title={dataset.fileName}>{dataset.fileName}</span>
          {dataset.sheets.length > 1 && (
            <select
              className="select select-dark"
              value={sheetIdx}
              onChange={(e) => { setSheetIdx(Number(e.target.value)); setFilters({}); setTypeOverrides({}); }}
              aria-label="Hoja"
            >
              {dataset.sheets.map((s, i) => <option key={s.name} value={i}>{s.name} ({s.rows.length})</option>)}
            </select>
          )}
          {dataset.url && (
            <button className="btn btn-ghost-dark" onClick={refresh} disabled={refreshing}>
              {refreshing ? 'Actualizando…' : 'Actualizar'}
            </button>
          )}
          <button className="btn btn-ghost-dark" onClick={close}>Cambiar archivo</button>
        </div>
      </Header>

      {error && <div className="alert" role="alert">{error} <button className="link" onClick={() => setError(null)}>Cerrar</button></div>}

      <nav className="tabs" aria-label="Secciones">
        <button className="btn btn-outline filters-toggle" onClick={() => setPanelOpen((o) => !o)}>
          Filtros{Object.keys(filters).length ? ` (${Object.keys(filters).length})` : ''}
        </button>
        {tabs.map((t) => (
          <button key={t.id} className={`tab ${activeTab === t.id ? 'is-active' : ''}`} onClick={() => setTab(t.id)} aria-current={activeTab === t.id}>
            {t.label}
          </button>
        ))}
        <span className="tabs-count">
          <strong>{filtered.length.toLocaleString('es-ES')}</strong> de {rows.length.toLocaleString('es-ES')} filas
        </span>
      </nav>

      <div className="layout">
        <FilterPanel
          open={panelOpen}
          onClose={() => setPanelOpen(false)}
          rows={rows}
          columns={columns}
          columnInfo={columnInfo}
          filters={filters}
          search={search}
          onSearch={setSearch}
          onFilter={setFilter}
          onClear={() => { setFilters({}); setSearch(''); }}
        />
        <main className="content">
          <FilterChips filters={filters} search={search} onFilter={setFilter} onSearch={setSearch} onClear={() => { setFilters({}); setSearch(''); }} />
          {activeTab === 'resumen' && (
            <Summary rows={filtered} allRows={rows} columnInfo={columnInfo} filters={filters} onToggle={toggleOnly} onGoMap={() => setTab('mapa')} />
          )}
          {activeTab === 'mapa' && <MapView rows={filtered} allRows={rows} columnInfo={columnInfo} filters={filters} onToggle={toggleOnly} />}
          {activeTab === 'tabla' && (
            <PivotView
              key={`${dataset.loadedAt}-${sheetIdx}`}
              rows={filtered}
              allRows={rows}
              columnInfo={columnInfo}
              filters={filters}
              onFilter={setFilter}
              fileName={dataset.fileName}
            />
          )}
          {activeTab === 'datos' && (
            <DataTable
              key={`${dataset.loadedAt}-${sheetIdx}`}
              rows={filtered}
              columnInfo={columnInfo}
              onOpen={setDetail}
              onEdit={editCell}
              onExport={doExport}
            />
          )}
          {activeTab === 'columnas' && (
            <ColumnsView
              rows={filtered}
              columnInfo={columnInfo}
              onType={(col, t) => setTypeOverrides((p) => ({ ...p, [col]: t }))}
            />
          )}
        </main>
      </div>

      <AskAI
        context={{
          fileName: dataset.fileName,
          sheetName: sheet.name,
          rows: filtered,
          totalRows: rows.length,
          columnInfo,
          filters,
          search,
        }}
      />

      {detail && (
        <RowDetail
          row={detail}
          rows={filtered}
          columnInfo={columnInfo}
          onNavigate={setDetail}
          onClose={() => setDetail(null)}
          onEdit={editCell}
        />
      )}
    </div>
  );
}

function Header({ children }: { children?: React.ReactNode }) {
  return (
    <header className="header">
      <div className="brand">
        <svg className="brand-mark" viewBox="0 0 40 48" aria-hidden="true">
          <path d="M6 46V14a14 14 0 0 1 28 0v4a14 14 0 0 1-14 14h-6" fill="none" stroke="currentColor" strokeWidth="3" />
          <path d="M14 32V18a6 6 0 0 1 12 0v0a8 8 0 0 1-8 8h-4z" fill="#33a6a6" />
        </svg>
        <div>
          <div className="brand-name">PRESTIGE PROPERTIES</div>
          <div className="brand-sub"><span className="script">Data</span> Explorer</div>
        </div>
      </div>
      {children}
    </header>
  );
}
