// Motor de preguntas sin IA: interpreta preguntas en español/inglés usando los nombres de
// columna y los valores reales del archivo cargado, y calcula la respuesta en el navegador.
import { findCountry, normalize, type Country } from './countries';
import { isMoneyColumn } from './columns';
import { formatCell, isoDate, percent, toNumber, valueKey } from './format';
import { aggregate, makeGrouper, type Measure } from './pivot';
import type { ColumnInfo, Filter, Filters, Row } from './types';

// ---------- Vocabulario ----------

const STOP = new Set(('de del la las el los lo y e o u en por para con sin que cual cuales cuanto cuantos cuanta cuantas como ' +
  'hay es son ser un una unos unas al a se mi me mas menos muy total totales numero numeros peticion peticiones lead leads ' +
  'registro registros fila filas dato datos cliente clientes solicitud solicitudes consulta consultas tenemos tengo hemos tiene ' +
  'dame dime muestra muestrame ver quiero saber cada entre desde hasta sobre todo todos todas este esta estos estas ese esa ' +
  'the of and or in on by for with what which how many much is are a an to from per all show me list ' +
  'mes meses ano anos year years month months dia dias semana top ranking principales mejores porcentaje media mediana suma promedio').split(' '));

/** Palabras en español → palabras habituales en cabeceras (también en inglés). */
const SYNONYMS: Record<string, string[]> = {
  pais: ['country', 'pais', 'nacionalidad', 'nationality', 'prefix', 'prefijo'],
  paises: ['country', 'pais'],
  nacionalidad: ['nationality', 'country', 'pais'],
  agente: ['agent', 'agente', 'comercial', 'sales', 'asesor'],
  agentes: ['agent', 'agente'],
  comercial: ['agent', 'sales', 'comercial'],
  idioma: ['language', 'idioma', 'lang'],
  idiomas: ['language', 'idioma'],
  fuente: ['source', 'fuente', 'origen', 'canal'],
  origen: ['source', 'origen', 'origin'],
  canal: ['source', 'channel', 'canal'],
  estado: ['status', 'estado', 'state'],
  presupuesto: ['budget', 'presupuesto', 'price', 'precio', 'importe'],
  precio: ['price', 'precio', 'budget', 'importe'],
  importe: ['amount', 'importe', 'price', 'budget'],
  fecha: ['date', 'fecha', 'created', 'alta'],
  tipo: ['type', 'tipo', 'kind'],
  grupo: ['group', 'grupo'],
  dispositivo: ['device', 'dispositivo'],
  nota: ['notes', 'nota', 'notas', 'comment'],
  notas: ['notes', 'notas', 'comment'],
  zona: ['zone', 'zona', 'area', 'region', 'location', 'ubicacion'],
  ciudad: ['city', 'ciudad', 'town'],
  dormitorios: ['bedrooms', 'dormitorios', 'habitaciones', 'rooms', 'beds'],
  habitaciones: ['bedrooms', 'rooms', 'habitaciones'],
  referencia: ['ref', 'reference', 'referencia'],
  nombre: ['name', 'nombre', 'client'],
  telefono: ['phone', 'telefono', 'tel', 'mobile'],
  correo: ['email', 'correo', 'mail'],
  propiedad: ['property', 'propiedad', 'inmueble'],
  registrado: ['registered', 'registrado'],
  asignado: ['assigned', 'asignado'],
  anterior: ['prior', 'previous', 'anterior'],
  conocimiento: ['awareness'],
  campana: ['campaign', 'campana'],
};

const MONTHS: [string[], number][] = [
  [['enero', 'ene', 'january', 'jan'], 0], [['febrero', 'feb', 'february'], 1], [['marzo', 'mar', 'march'], 2],
  [['abril', 'abr', 'april', 'apr'], 3], [['mayo', 'may'], 4], [['junio', 'jun', 'june'], 5], [['julio', 'jul', 'july'], 6],
  [['agosto', 'ago', 'august', 'aug'], 7], [['septiembre', 'setiembre', 'sep', 'sept', 'september'], 8],
  [['octubre', 'oct', 'october'], 9], [['noviembre', 'nov', 'november'], 10], [['diciembre', 'dic', 'december', 'dec'], 11],
];
const MONTH_OF = new Map<string, number>(MONTHS.flatMap(([names, i]) => names.map((n) => [n, i] as [string, number])));
const MONTH_NAME = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

// ---------- Resultado ----------

export interface Understood { label: string; value: string }

export type Answer =
  | { kind: 'number'; title: string; value: string; detail?: string; understood: Understood[]; filters: Filters; scope: number }
  | { kind: 'table'; title: string; columns: string[]; rows: { label: string; value: number; display: string; pct?: string }[]; more: number; understood: Understood[]; filters: Filters; scope: number; note?: string; pivot?: { rows: string; cols: string } }
  | { kind: 'rows'; title: string; columns: string[]; rows: Record<string, string>[]; total: number; understood: Understood[]; filters: Filters; scope: number }
  | { kind: 'unknown'; title: string; hints: string[] };

export interface QueryContext {
  rows: Row[]; // filas visibles (con los filtros de la app)
  allRows: Row[];
  columnInfo: ColumnInfo[];
}

// ---------- Índices ----------

interface ValueHit { col: string; raw: string[]; label: string; country?: Country }

const FILTER_TYPES = new Set(['category', 'country', 'boolean', 'text', 'id', 'email']);

/** Índice valor-normalizado → (columna, valores originales) construido con los datos. Se cachea por conjunto de filas. */
const indexCache = new WeakMap<Row[], Map<string, ValueHit[]>>();
function valueIndex(ctx: QueryContext): Map<string, ValueHit[]> {
  const cached = indexCache.get(ctx.allRows);
  if (cached) return cached;
  const idx = new Map<string, ValueHit[]>();
  const add = (key: string, col: string, raw: string, label: string) => {
    if (!key || key.length < 2 || STOP.has(key)) return;
    const list = idx.get(key) ?? [];
    const hit = list.find((h) => h.col === col);
    if (hit) { if (!hit.raw.includes(raw)) hit.raw.push(raw); } else list.push({ col, raw: [raw], label });
    idx.set(key, list);
  };
  for (const c of ctx.columnInfo) {
    if (!FILTER_TYPES.has(c.type) || c.unique > 3000) continue;
    const seen = new Set<string>();
    for (const r of ctx.allRows) {
      const raw = valueKey(r[c.name]);
      if (seen.has(raw) || raw === '(vacío)') continue;
      seen.add(raw);
      const key = normalize(raw);
      if (key.split(' ').length > 6) continue; // textos largos (notas) no sirven como valor
      add(key, c.name, raw, raw);
      // Plural sencillo: «ventas» encuentra «venta».
      add(`${key}s`, c.name, raw, raw);
      if (/[^aeiou]$/.test(key)) add(`${key}es`, c.name, raw, raw);
      // Meses escritos de otra forma («marzo» ↔ «Mar» ↔ «March»).
      const m = MONTH_OF.get(key);
      if (m !== undefined) for (const [names, i] of MONTHS) if (i === m) names.forEach((n) => add(n, c.name, raw, raw));
    }
  }
  indexCache.set(ctx.allRows, idx);
  return idx;
}

function columnTokens(name: string): string[] {
  return normalize(name).split(' ').filter((t) => t && !STOP.has(t));
}

/** Busca la columna a la que se refiere una frase («agente», «país», «presupuesto»…). */
function matchColumn(phrase: string[], cols: ColumnInfo[], filter?: (c: ColumnInfo) => boolean): ColumnInfo | undefined {
  const words = phrase.filter((t) => !STOP.has(t) || t === 'mes');
  if (!words.length) return undefined;
  const forms = (w: string) => [...new Set([w, w.replace(/s$/, ''), w.replace(/es$/, '')])];
  const expanded = new Set(words.flatMap((w) => forms(w).flatMap((f) => [f, ...(SYNONYMS[f] ?? [])])));
  let best: ColumnInfo | undefined;
  let bestScore = 0;
  for (const c of cols) {
    if (filter && !filter(c)) continue;
    const toks = columnTokens(c.name);
    if (!toks.length) continue;
    const hits = toks.filter((t) => expanded.has(t) || [...expanded].some((e) => e.length >= 4 && (t.startsWith(e) || e.startsWith(t)))).length;
    if (!hits) continue;
    const score = hits / toks.length + hits * 0.1 - (c.type === 'empty' ? 1 : 0);
    if (score > bestScore) { bestScore = score; best = c; }
  }
  return best;
}

function parseAmount(s: string): number | null {
  const m = s.trim().match(/^([\d.,]+)\s*(millones|millon|mill|mm|mil|m|k)?$/);
  if (!m) return null;
  const n = toNumber(m[1]);
  if (n === null) return null;
  const mult = !m[2] ? 1 : m[2] === 'k' || m[2] === 'mil' ? 1e3 : 1e6;
  return n * mult;
}

// ---------- Intérprete ----------

export function answer(question: string, ctx: QueryContext): Answer {
  // Quita signos (¿?¡!…) sin romper números como 1.000.000 o 2,5
  const cleaned = question.replace(/%/g, ' porcentaje ').replace(/[¿?¡!;:()"«»]/g, ' ').replace(/([^\d])[.,]|[.,](?!\d)/g, '$1 ');
  const q = normalize(cleaned);
  const tokens = q.split(' ').filter(Boolean);
  const cols = ctx.columnInfo;
  const understood: Understood[] = [];
  if (!tokens.length) return { kind: 'unknown', title: 'Escribe una pregunta.', hints: suggestions(ctx) };

  const has = (...words: string[]) => words.some((w) => (w.includes(' ') ? q.includes(w) : tokens.includes(w)));
  const hasPrefix = (...pre: string[]) => tokens.some((t) => pre.some((p) => t.startsWith(p)));

  // Intención
  const wantsAvg = has('media', 'medio', 'medios', 'medias', 'promedio', 'average', 'mean');
  const wantsMedian = has('mediana', 'median', 'tipico', 'habitual');
  const wantsSum = has('suma', 'sum', 'volumen', 'importe total', 'total de presupuesto', 'total del presupuesto');
  const wantsMax = has('maximo', 'max', 'mas caro', 'mas alto', 'mayor presupuesto', 'highest', 'maximum');
  const wantsMin = has('minimo', 'min', 'mas barato', 'mas bajo', 'menor presupuesto', 'lowest', 'minimum');
  const wantsList = has('lista', 'listado', 'quienes', 'quien', 'muestra', 'muestrame', 'ensena', 'enseñame', 'list', 'show', 'cuales son', 'detalle');
  const wantsDistinct = has('distintos', 'distintas', 'diferentes', 'unicos', 'unicas', 'distinct');
  const wantsTrend = has('evolucion', 'tendencia', 'por mes', 'cada mes', 'mensual', 'mes a mes', 'trend', 'monthly', 'por meses');
  const ascending = has('menos', 'menor', 'peores', 'least', 'fewest') && !wantsMin;
  const wantsRank = has('ranking', 'top', 'mas', 'principales', 'mejores', 'mayor', 'mayores', 'most', 'peores', 'menos') || ascending;
  const topN = (() => { const m = q.match(/\b(?:top|primeros|primeras|los|las|first)\s+(\d{1,3})\b/); return m ? Number(m[1]) : null; })();

  const covered = new Set<number>();
  const cover = (from: number, len: number) => { for (let k = from; k < from + len; k++) covered.add(k); };

  // Agrupar por: «por X», «según X», «by X», «de cada X», «qué X…», «ranking de X»
  let groupCol: ColumnInfo | undefined;
  let groupIdx = -1;
  const GROUP_WORDS = ['por', 'segun', 'by', 'cada', 'desglose', 'reparto', 'distribucion', 'ranking', 'top', 'que', 'cual', 'cuales', 'which', 'what'];
  for (let i = 0; i < tokens.length && !groupCol; i++) {
    if (!GROUP_WORDS.includes(tokens[i])) continue;
    let j = i + 1;
    while (j < tokens.length && ['de', 'del', 'los', 'las', 'el', 'la', 'cada', 'pais', 'paises'].includes(tokens[j]) && !(tokens[j] === 'pais' || tokens[j] === 'paises')) j++;
    for (let len = Math.min(4, tokens.length - j); len >= 1; len--) {
      const c = matchColumn(tokens.slice(j, j + len), cols, (x) => x.type !== 'empty');
      if (c) { groupCol = c; groupIdx = i; cover(i, j - i + len); break; }
    }
  }
  if (!groupCol && wantsTrend) {
    groupCol = cols.find((c) => c.type === 'date');
  }

  // Columna numérica (para media/mediana/suma/máx/mín y rangos)
  const numericCols = cols.filter((c) => c.type === 'number');
  let numCol: ColumnInfo | undefined;
  for (let i = 0; i < tokens.length && !numCol; i++) {
    for (let len = Math.min(3, tokens.length - i); len >= 1 && !numCol; len--) {
      const c = matchColumn(tokens.slice(i, i + len), numericCols);
      if (c) { numCol = c; cover(i, len); }
    }
  }
  if (!numCol && (wantsAvg || wantsMedian || wantsSum || wantsMax || wantsMin || hasPrefix('presupuest', 'precio', 'importe', 'budget', 'price', 'caro', 'barat'))) {
    numCol = numericCols.find((c) => isMoneyColumn(c.name)) ?? numericCols[0];
  }

  const filters: Filters = {};
  const filtered = { rows: ctx.rows };
  const applyFilter = (col: string, f: Filter, label: string, value: string) => {
    filters[col] = f;
    understood.push({ label, value });
  };

  // Rangos numéricos: «más de 1M», «menos de 500k», «entre 1 y 2 millones»
  const amount = '([\\d.,]+(?:\\s*(?:millones|millon|mill|mm|mil|m|k)\\b)?)';
  const between = q.match(new RegExp(`entre\\s+${amount}\\s+y\\s+${amount}`));
  const over = q.match(new RegExp(`(?:mas de|mayor(?:es)? (?:de|que|a)|superior(?:es)? a|por encima de|over|above|more than|>)\\s*${amount}`));
  const under = q.match(new RegExp(`(?:menos de|menor(?:es)? (?:de|que|a)|inferior(?:es)? a|por debajo de|under|below|less than|<)\\s*${amount}`));
  const rangeCol = numCol ?? numericCols.find((c) => isMoneyColumn(c.name)) ?? numericCols[0];
  if (rangeCol && (between || over || under)) {
    let min: number | null = null;
    let max: number | null = null;
    if (between) {
      min = parseAmount(between[1]);
      max = parseAmount(between[2]);
      // «entre 1 y 2 millones»: la unidad del segundo número vale para los dos.
      if (min !== null && max !== null && /^[\d.,]+$/.test(between[1].trim()) && max / (toNumber(between[2]) || 1) > 1) min *= max / (toNumber(between[2].replace(/[^\d.,]/g, '')) || 1);
      if (min !== null && max !== null && min > max) [min, max] = [max, min];
    }
    if (over) min = parseAmount(over[1]);
    if (under) max = parseAmount(under[1]);
    if (min !== null || max !== null) {
      applyFilter(rangeCol.name, { kind: 'range', min, max }, rangeCol.name,
        min !== null && max !== null ? `${formatCell(min)} – ${formatCell(max)}` : min !== null ? `> ${formatCell(min)}` : `< ${formatCell(max)}`);
      // los números del rango no deben tomarse como valores
      tokens.forEach((t, k) => { if (/^[\d.,]+$/.test(t) || ['k', 'mil', 'm', 'millones', 'millon'].includes(t)) covered.add(k); });
    }
  }

  // Fechas: años, meses, «este año», «último mes», «últimos N días/meses»
  const dateCol = (groupCol?.type === 'date' ? groupCol : undefined) ?? cols.find((c) => c.type === 'date');
  if (dateCol) {
    const dates = ctx.allRows.map((r) => r[dateCol.name]).filter((d): d is Date => d instanceof Date);
    const years = new Set(dates.map((d) => d.getFullYear()));
    let from: string | null = null;
    let to: string | null = null;
    let label = '';
    const today = new Date();
    const yearTok = tokens.findIndex((t) => /^(19|20)\d{2}$/.test(t) && years.has(Number(t)));
    const monthTok = tokens.findIndex((t, k) => MONTH_OF.has(t) && t.length >= 3 && !(t === 'mar' && tokens[k - 1] === 'el') && !valueIndexHasMonthColumn(ctx, t));
    const lastN = q.match(/ultim[oa]s\s+(\d{1,3})\s+(dias|semanas|meses|days|weeks|months)/);
    if (lastN) {
      const n = Number(lastN[1]);
      const d = new Date(today);
      if (/dia|day/.test(lastN[2])) d.setDate(d.getDate() - n);
      else if (/semana|week/.test(lastN[2])) d.setDate(d.getDate() - n * 7);
      else d.setMonth(d.getMonth() - n);
      from = isoDate(d); to = isoDate(today); label = `últimos ${n} ${lastN[2]}`;
    } else if (has('este ano', 'this year')) {
      from = `${today.getFullYear()}-01-01`; to = `${today.getFullYear()}-12-31`; label = String(today.getFullYear());
    } else if (has('este mes', 'this month')) {
      const y = today.getFullYear(); const m = today.getMonth();
      from = isoDate(new Date(y, m, 1)); to = isoDate(new Date(y, m + 1, 0)); label = `${MONTH_NAME[m]} ${y}`;
    } else if (has('mes pasado', 'ultimo mes', 'last month')) {
      const y = today.getFullYear(); const m = today.getMonth() - 1;
      from = isoDate(new Date(y, m, 1)); to = isoDate(new Date(y, m + 1, 0)); label = `${MONTH_NAME[(m + 12) % 12]}`;
    } else if (monthTok >= 0) {
      const m = MONTH_OF.get(tokens[monthTok])!;
      let y = yearTok >= 0 ? Number(tokens[yearTok]) : null;
      if (y === null) {
        // Sin año: el más reciente en el que hay datos de ese mes.
        const ys = dates.filter((d) => d.getMonth() === m).map((d) => d.getFullYear());
        y = ys.length ? Math.max(...ys) : today.getFullYear();
      }
      from = isoDate(new Date(y, m, 1)); to = isoDate(new Date(y, m + 1, 0)); label = `${MONTH_NAME[m]} ${y}`;
      covered.add(monthTok); if (yearTok >= 0) covered.add(yearTok);
    } else if (yearTok >= 0) {
      const y = Number(tokens[yearTok]);
      from = `${y}-01-01`; to = `${y}-12-31`; label = String(y); covered.add(yearTok);
    }
    if (from || to) applyFilter(dateCol.name, { kind: 'dates', from, to }, dateCol.name, label);
  }

  // Valores mencionados («Alemania», «Comeback», «Marta», «Venta»…)
  const idx = valueIndex(ctx);
  const countryCols = cols.filter((c) => c.type === 'country');
  const hitsByCol = new Map<string, { raw: Set<string>; labels: string[] }>();
  const original = cleaned.split(/\s+/).filter(Boolean);
  for (let len = 4; len >= 1; len--) {
    for (let i = 0; i + len <= tokens.length; i++) {
      if ([...Array(len).keys()].some((k) => covered.has(i + k))) continue;
      const phrase = tokens.slice(i, i + len).join(' ');
      if (len === 1 && STOP.has(phrase)) continue;
      let hits = idx.get(phrase);
      // Países escritos de otra forma (UK, Germany, Holanda…)
      if (!hits && countryCols.length && (phrase.length >= 3 || /^[A-Z]{2,3}$/.test(original[i] ?? ''))) {
        const c = findCountry(phrase);
        if (c) {
          const col = countryCols[0].name;
          const raw = [...new Set(ctx.allRows.map((r) => valueKey(r[col])).filter((v) => findCountry(v)?.a2 === c.a2))];
          hits = [{ col, raw: raw.length ? raw : [c.es], label: c.es, country: c }];
        }
      }
      if (!hits?.length) continue;
      // Varias columnas con el mismo valor: la mencionada en la pregunta, o la de menos valores distintos.
      const preferred = hits.find((h) => matchColumn(tokens, cols, (c) => c.name === h.col))
        ?? hits.slice().sort((a, b) => (cols.find((c) => c.name === a.col)?.unique ?? 0) - (cols.find((c) => c.name === b.col)?.unique ?? 0))[0];
      const entry = hitsByCol.get(preferred.col) ?? { raw: new Set<string>(), labels: [] };
      preferred.raw.forEach((v) => entry.raw.add(v));
      entry.labels.push(preferred.label);
      hitsByCol.set(preferred.col, entry);
      cover(i, len);
    }
  }
  // «estado por agente»: columna nombrada antes de «por» → se ofrece la tabla dinámica cruzada.
  let crossCol: ColumnInfo | undefined;
  if (groupCol && groupIdx > 0) {
    for (let i = 0; i < groupIdx && !crossCol; i++) {
      for (let len = Math.min(3, groupIdx - i); len >= 1; len--) {
        if ([...Array(len).keys()].some((k) => covered.has(i + k))) continue;
        const c = matchColumn(tokens.slice(i, i + len), cols, (x) => x.name !== groupCol!.name && x.type !== 'number' && x.type !== 'empty' && x.unique <= 60);
        if (c) { crossCol = c; break; }
      }
    }
  }
  // «Compara A y B» o «A vs B» en la misma columna sin otra agrupación → agrupar por esa columna.
  let compareCol: string | undefined;
  for (const [col, e] of hitsByCol) {
    if (e.labels.length >= 2 && !groupCol) { compareCol = col; groupCol = cols.find((c) => c.name === col); }
    applyFilter(col, { kind: 'values', included: [...e.raw] }, col, e.labels.join(' o '));
  }

  // Aplicar filtros de la pregunta sobre las filas visibles
  filtered.rows = ctx.rows.filter((r) => Object.entries(filters).every(([col, f]) => {
    const v = r[col];
    if (f.kind === 'values') return f.included.includes(valueKey(v));
    if (f.kind === 'range') { const n = toNumber(v); return n !== null && (f.min === null || n >= f.min) && (f.max === null || n <= f.max); }
    if (!(v instanceof Date)) return false;
    const d = isoDate(v);
    return (!f.from || d >= f.from) && (!f.to || d <= f.to);
  }));
  const n = filtered.rows.length;
  const scope = ctx.rows.length;

  // Medida
  let measure: Measure = { kind: 'count' };
  if (numCol && wantsMedian) measure = { kind: 'median', col: numCol.name };
  else if (numCol && wantsAvg) measure = { kind: 'avg', col: numCol.name };
  else if (numCol && wantsSum) measure = { kind: 'sum', col: numCol.name };
  const money = numCol ? isMoneyColumn(numCol.name) : false;
  const fmt = (v: number) => (measure.kind === 'count' ? formatCell(v) : money ? `${formatCell(Math.round(v))} €` : formatCell(v));
  const measureLabel = measure.kind === 'count' ? 'peticiones' : `${{ sum: 'suma', avg: 'media', median: 'mediana' }[measure.kind]} de ${measure.col}`;
  if (measure.kind !== 'count') understood.push({ label: 'Cálculo', value: measureLabel });

  const nothingUnderstood = !groupCol && !Object.keys(filters).length && measure.kind === 'count' && !wantsMax && !wantsMin && !wantsList && !wantsDistinct;
  if (nothingUnderstood) {
    return { kind: 'unknown', title: 'No he entendido la pregunta con las columnas de este archivo.', hints: suggestions(ctx) };
  }

  // Valores distintos: «cuántos países distintos…»
  if (wantsDistinct && (groupCol || matchColumn(tokens, cols))) {
    const c = groupCol ?? matchColumn(tokens, cols)!;
    const g = makeGrouper(ctx.allRows, c);
    const distinct = new Set(filtered.rows.map((r) => g.of(r).key).filter((k) => k !== '(vacío)'));
    understood.push({ label: 'Valores distintos de', value: c.name });
    return { kind: 'number', title: `Valores distintos de ${c.name}`, value: formatCell(distinct.size), detail: `en ${formatCell(n)} filas`, understood, filters, scope };
  }

  // Máximo / mínimo: devuelve las filas extremas
  if ((wantsMax || wantsMin) && numCol && !groupCol) {
    const withVal = filtered.rows.filter((r) => toNumber(r[numCol.name]) !== null)
      .sort((a, b) => (toNumber(b[numCol.name])! - toNumber(a[numCol.name])!) * (wantsMin ? -1 : 1));
    understood.push({ label: wantsMin ? 'Mínimo de' : 'Máximo de', value: numCol.name });
    const top = withVal.slice(0, topN ?? 5);
    const show = [numCol.name, ...cols.filter((c) => c.name !== numCol.name && c.type !== 'empty').slice(0, 5).map((c) => c.name)];
    return {
      kind: 'rows', title: `${wantsMin ? 'Menor' : 'Mayor'} ${numCol.name}: ${top[0] ? fmtNum(toNumber(top[0][numCol.name])!, money) : '—'}`,
      columns: show, rows: top.map((r) => Object.fromEntries(show.map((c) => [c, formatCell(r[c])]))), total: withVal.length, understood, filters, scope,
    };
  }

  // Listado de filas
  if (wantsList && !groupCol) {
    const show = cols.filter((c) => c.type !== 'empty').slice(0, 7).map((c) => c.name);
    return { kind: 'rows', title: `${formatCell(n)} filas encontradas`, columns: show, rows: filtered.rows.slice(0, topN ?? 20).map((r) => Object.fromEntries(show.map((c) => [c, formatCell(r[c])]))), total: n, understood, filters, scope };
  }

  // Agrupado (ranking, desglose, comparación, evolución)
  if (groupCol) {
    understood.unshift({ label: 'Agrupado por', value: groupCol.name + (groupCol.type === 'date' ? ' (por mes)' : '') });
    const g = makeGrouper(ctx.allRows, groupCol);
    const buckets = new Map<string, { label: string; order?: number; count: number; values: number[] }>();
    // En una comparación se agrupa sin el filtro de esa misma columna (ya limita los valores).
    for (const r of filtered.rows) {
      const k = g.of(r);
      const b = buckets.get(k.key) ?? { label: k.label, order: k.order, count: 0, values: [] };
      b.count++;
      if (measure.kind !== 'count') { const v = toNumber(r[measure.col]); if (v !== null) b.values.push(v); }
      buckets.set(k.key, b);
    }
    const list = [...buckets.values()].map((b) => ({ label: b.label, order: b.order, value: aggregate(b.values, measure, b.count) }));
    const natural = groupCol.type === 'date' || (groupCol.type === 'number' && groupCol.unique > 15);
    if (natural && !wantsRank) list.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    else list.sort((a, b) => (ascending ? a.value - b.value : b.value - a.value));
    const additive = measure.kind === 'count' || measure.kind === 'sum';
    const total = list.reduce((s, x) => s + x.value, 0);
    const limit = topN ?? (natural ? 60 : wantsRank ? 10 : 25);
    const title = compareCol ? `Comparación de ${measureLabel} por ${groupCol.name}`
      : `${wantsRank ? (ascending ? 'Menos' : 'Más') + ' ' : ''}${measureLabel} por ${groupCol.name}`;
    return {
      kind: 'table', title: title.charAt(0).toUpperCase() + title.slice(1),
      columns: [groupCol.name, measure.kind === 'count' ? 'Peticiones' : measureLabel, ...(additive ? ['%'] : [])],
      rows: list.slice(0, limit).map((x) => ({ label: x.label, value: x.value, display: fmt(x.value), pct: additive ? percent(x.value, total) : undefined })),
      more: Math.max(0, list.length - limit), understood, filters, scope,
      note: crossCol
        ? `Para ver ${groupCol.name} cruzado con ${crossCol.name}, ábrelo en la tabla dinámica.`
        : n !== scope ? `Sobre ${formatCell(n)} de ${formatCell(scope)} filas visibles` : undefined,
      pivot: crossCol ? { rows: groupCol.name, cols: crossCol.name } : undefined,
    };
  }

  // Un único número
  if (measure.kind !== 'count') {
    const vals = filtered.rows.map((r) => toNumber(r[measure.col])).filter((v): v is number => v !== null);
    return { kind: 'number', title: measureLabel.charAt(0).toUpperCase() + measureLabel.slice(1), value: vals.length ? fmt(aggregate(vals, measure, vals.length)) : '—', detail: `calculado con ${formatCell(vals.length)} filas con valor`, understood, filters, scope };
  }
  return {
    kind: 'number', title: 'Peticiones', value: formatCell(n),
    detail: `${percent(n, scope)} de las ${formatCell(scope)} filas visibles`, understood, filters, scope,
  };
}

function fmtNum(v: number, money: boolean) { return money ? `${formatCell(Math.round(v))} €` : formatCell(v); }

/** Si una columna de categorías ya contiene meses («Jan», «Marzo»), el mes se trata como valor de esa columna. */
function valueIndexHasMonthColumn(ctx: QueryContext, token: string): boolean {
  const hits = valueIndex(ctx).get(token);
  return !!hits?.some((h) => ctx.columnInfo.find((c) => c.name === h.col)?.type !== 'date');
}

// ---------- Sugerencias adaptadas al archivo ----------

export function suggestions(ctx: QueryContext): string[] {
  const cols = ctx.columnInfo;
  const country = cols.find((c) => c.type === 'country');
  const cats = cols.filter((c) => (c.type === 'category' || c.type === 'boolean') && c.unique >= 2 && c.unique <= 40);
  const num = cols.find((c) => c.type === 'number' && isMoneyColumn(c.name)) ?? cols.find((c) => c.type === 'number');
  const date = cols.find((c) => c.type === 'date');
  const topValue = (col: string) => {
    const m = new Map<string, number>();
    for (const r of ctx.allRows) { const k = valueKey(r[col]); if (k !== '(vacío)') m.set(k, (m.get(k) ?? 0) + 1); }
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
  };
  const out: string[] = [];
  if (country) {
    const top = topValue(country.name);
    out.push(`Ranking de ${country.name.toLowerCase()}`);
    if (top[0]) out.push(`¿Cuántas peticiones de ${findCountry(top[0])?.es ?? top[0]}?`);
  }
  if (cats[0]) out.push(`Porcentaje por ${cats[0].name.toLowerCase()}`);
  if (cats[1] && country) {
    const v = topValue(cats[1].name);
    if (v[0]) out.push(`${v[0]} por ${country.name.toLowerCase()}`);
  } else if (cats[1]) out.push(`¿Qué ${cats[1].name.toLowerCase()} tiene más peticiones?`);
  if (num) out.push(country ? `Mediana de ${num.name.toLowerCase()} por ${country.name.toLowerCase()}` : `Media de ${num.name.toLowerCase()}`);
  if (date) out.push('Evolución por mes');
  if (cats[0]) {
    const v = topValue(cats[0].name);
    if (v[1]) out.push(`Compara ${v[0]} y ${v[1]}`);
  }
  if (num) out.push(`Peticiones con ${num.name.toLowerCase()} de más de ${formatCell(roundNice(medianOf(ctx.allRows, num.name)))}`);
  return out.slice(0, 8);
}

function medianOf(rows: Row[], col: string) {
  const v = rows.map((r) => toNumber(r[col])).filter((n): n is number => n !== null).sort((a, b) => a - b);
  return v.length ? v[Math.floor(v.length / 2)] : 0;
}
function roundNice(n: number) {
  if (!n) return 0;
  const p = 10 ** Math.floor(Math.log10(Math.abs(n)));
  return Math.round(n / p) * p;
}
