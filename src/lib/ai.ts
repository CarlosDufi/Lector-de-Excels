import Anthropic from '@anthropic-ai/sdk';
import { findCountry, normalize } from './countries';
import { countBy } from './filters';
import { formatCell, percent, toNumber, valueKey } from './format';
import { aggregate, makeGrouper, type Measure } from './pivot';
import type { ColumnInfo, Filters, Row } from './types';
import { TYPE_LABEL } from './columns';

const MODEL = 'claude-opus-5-5';
const MAX_TOOL_ROUNDS = 8;

export interface AiContext {
  fileName: string;
  sheetName: string;
  rows: Row[]; // filas visibles con los filtros actuales
  totalRows: number;
  columnInfo: ColumnInfo[];
  filters: Filters;
  search: string;
}

// ---------- Herramientas (se ejecutan en el navegador sobre las filas visibles) ----------

type ToolFilter = { columna: string; valores: string[] };

const filterSchema = {
  type: ['array', 'null'],
  description: 'Filtros adicionales (todas las condiciones se cumplen a la vez). Valores exactos tal como aparecen en los datos; para países vale el nombre en español o inglés.',
  items: {
    type: 'object',
    properties: {
      columna: { type: 'string', description: 'Nombre exacto de la columna.' },
      valores: { type: 'array', items: { type: 'string' }, description: 'Valores aceptados (cualquiera de ellos).' },
    },
    required: ['columna', 'valores'],
    additionalProperties: false,
  },
};

export const TOOLS: Anthropic.Beta.BetaTool[] = [
  {
    name: 'agrupar_datos',
    description:
      'Cuenta o agrega las filas visibles agrupando por una columna (y opcionalmente por una segunda). Úsala para cualquier recuento, porcentaje, ranking, media, mediana o suma: es exacta. Las fechas se agrupan por mes y los números con muchos valores por tramos.',
    strict: true,
    eager_input_streaming: true,
    input_schema: {
      type: 'object',
      properties: {
        agrupar_por: { type: 'string', description: 'Columna por la que agrupar.' },
        segunda_columna: { type: ['string', 'null'], description: 'Segunda columna para una tabla cruzada, o null.' },
        medida: { type: 'string', enum: ['recuento', 'suma', 'media', 'mediana'] },
        columna_numerica: { type: ['string', 'null'], description: 'Columna numérica para suma/media/mediana; null para recuento.' },
        filtros: filterSchema,
        limite: { type: ['integer', 'null'], description: 'Máximo de grupos a devolver (por defecto 50).' },
      },
      required: ['agrupar_por', 'segunda_columna', 'medida', 'columna_numerica', 'filtros', 'limite'],
      additionalProperties: false,
    },
  },
  {
    name: 'buscar_filas',
    description:
      'Devuelve filas concretas de los datos visibles (máximo 50) y el total de coincidencias. Úsala para ver ejemplos, notas o detalles de registros concretos.',
    strict: true,
    eager_input_streaming: true,
    input_schema: {
      type: 'object',
      properties: {
        filtros: filterSchema,
        texto: { type: ['string', 'null'], description: 'Texto a buscar en cualquier columna, o null.' },
        columnas: { type: ['array', 'null'], items: { type: 'string' }, description: 'Columnas a devolver; null para todas.' },
        limite: { type: ['integer', 'null'], description: 'Máximo de filas (por defecto 20, tope 50).' },
      },
      required: ['filtros', 'texto', 'columnas', 'limite'],
      additionalProperties: false,
    },
  },
];

function findColumn(ctx: AiContext, name: string): ColumnInfo {
  const exact = ctx.columnInfo.find((c) => c.name === name);
  const loose = exact ?? ctx.columnInfo.find((c) => normalize(c.name) === normalize(name));
  if (!loose) throw new Error(`La columna «${name}» no existe. Columnas: ${ctx.columnInfo.map((c) => c.name).join(', ')}`);
  return loose;
}

function applyToolFilters(ctx: AiContext, rows: Row[], filtros: ToolFilter[] | null): Row[] {
  if (!filtros?.length) return rows;
  const checks = filtros.map((f) => {
    const col = findColumn(ctx, f.columna);
    const wanted = new Set(f.valores.map((v) => normalize(v)));
    const countries = col.type === 'country' ? new Set(f.valores.map((v) => findCountry(v)?.a2).filter(Boolean)) : null;
    return (r: Row) => {
      if (wanted.has(normalize(valueKey(r[col.name])))) return true;
      return !!countries && countries.has(findCountry(r[col.name])?.a2);
    };
  });
  return rows.filter((r) => checks.every((c) => c(r)));
}

function runGroup(ctx: AiContext, input: Record<string, unknown>) {
  const rowsIn = applyToolFilters(ctx, ctx.rows, input.filtros as ToolFilter[] | null);
  const g1 = findColumn(ctx, String(input.agrupar_por));
  const g2 = input.segunda_columna ? findColumn(ctx, String(input.segunda_columna)) : null;
  const medida = String(input.medida);
  let measure: Measure = { kind: 'count' };
  if (medida !== 'recuento') {
    if (!input.columna_numerica) throw new Error('Falta columna_numerica para suma/media/mediana.');
    const num = findColumn(ctx, String(input.columna_numerica));
    measure = { kind: medida === 'suma' ? 'sum' : medida === 'media' ? 'avg' : 'median', col: num.name };
  }
  const limit = Math.min(Number(input.limite) || 50, 200);
  const grouper1 = makeGrouper(ctx.rows, g1);
  const grouper2 = g2 ? makeGrouper(ctx.rows, g2) : null;
  const buckets = new Map<string, { grupo: string; subgrupo?: string; count: number; values: number[] }>();
  for (const r of rowsIn) {
    const a = grouper1.of(r);
    const b = grouper2?.of(r);
    const key = b ? `${a.label}\u0000${b.label}` : a.label;
    const bucket = buckets.get(key) ?? { grupo: a.label, subgrupo: b?.label, count: 0, values: [] };
    bucket.count++;
    if (measure.kind !== 'count') {
      const n = toNumber(r[measure.col]);
      if (n !== null) bucket.values.push(n);
    }
    buckets.set(key, bucket);
  }
  const results = [...buckets.values()]
    .map((b) => ({ grupo: b.grupo, ...(b.subgrupo !== undefined ? { subgrupo: b.subgrupo } : {}), filas: b.count, valor: aggregate(b.values, measure, b.count) }))
    .sort((x, y) => y.valor - x.valor);
  const additive = measure.kind === 'count' || measure.kind === 'sum';
  const total = additive ? results.reduce((s, x) => s + x.valor, 0) : null;
  return {
    filas_analizadas: rowsIn.length,
    medida: medida + (measure.kind !== 'count' ? ` de ${measure.col}` : ''),
    total,
    grupos_totales: results.length,
    grupos: results.slice(0, limit).map((x) => ({ ...x, porcentaje: total ? percent(x.valor, total) : undefined })),
  };
}

function runSearch(ctx: AiContext, input: Record<string, unknown>) {
  let rowsIn = applyToolFilters(ctx, ctx.rows, input.filtros as ToolFilter[] | null);
  const text = input.texto ? normalize(String(input.texto)) : '';
  if (text) rowsIn = rowsIn.filter((r) => ctx.columnInfo.some((c) => normalize(valueKey(r[c.name])).includes(text)));
  const cols = (input.columnas as string[] | null)?.map((c) => findColumn(ctx, c).name) ?? ctx.columnInfo.map((c) => c.name);
  const limit = Math.min(Number(input.limite) || 20, 50);
  return {
    coincidencias: rowsIn.length,
    filas: rowsIn.slice(0, limit).map((r) => Object.fromEntries(cols.map((c) => [c, formatCell(r[c])]))),
  };
}

function isValidInput(name: string, input: unknown): input is Record<string, unknown> {
  if (!input || typeof input !== 'object') return false;
  const required = (TOOLS.find((t) => t.name === name)?.input_schema.required ?? []) as string[];
  return required.every((k) => k in (input as object));
}

function runTool(ctx: AiContext, block: Anthropic.Beta.BetaToolUseBlock): Anthropic.Beta.BetaToolResultBlockParam {
  try {
    // Con eager_input_streaming la entrada puede llegar incompleta: se valida antes de ejecutar.
    if (!isValidInput(block.name, block.input)) throw new Error('Entrada de la herramienta incompleta o no válida.');
    const out = block.name === 'agrupar_datos' ? runGroup(ctx, block.input)
      : block.name === 'buscar_filas' ? runSearch(ctx, block.input)
        : (() => { throw new Error(`Herramienta desconocida: ${block.name}`); })();
    return { type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(out) };
  } catch (e) {
    return { type: 'tool_result', tool_use_id: block.id, content: (e as Error).message, is_error: true };
  }
}

// ---------- Contexto para el modelo ----------

function describeFilters(ctx: AiContext): string {
  const parts = Object.entries(ctx.filters).map(([col, f]) => {
    if (f.kind === 'values') return `${col} ∈ {${f.included.slice(0, 30).join(', ')}${f.included.length > 30 ? ', …' : ''}}`;
    if (f.kind === 'range') return `${col} entre ${f.min ?? '−∞'} y ${f.max ?? '∞'}`;
    return `${col} desde ${f.from ?? '…'} hasta ${f.to ?? '…'}`;
  });
  if (ctx.search) parts.push(`búsqueda de texto «${ctx.search}»`);
  return parts.length ? parts.join('; ') : 'ninguno (se ven todas las filas)';
}

function columnProfile(ctx: AiContext): string {
  return ctx.columnInfo.map((c) => {
    const base = `- «${c.name}» (${TYPE_LABEL[c.type]}, ${c.unique} valores distintos)`;
    if (c.type === 'number') {
      const nums = ctx.rows.map((r) => toNumber(r[c.name])).filter((n): n is number => n !== null);
      if (!nums.length) return base;
      return `${base}: mín ${Math.min(...nums.slice(0, 50000))}, máx ${Math.max(...nums.slice(0, 50000))}`;
    }
    const top = [...countBy(ctx.rows, c.name).entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
    return `${base}: ${top.map(([k, n]) => `${k} (${n})`).join(', ')}${c.unique > 12 ? ', …' : ''}`;
  }).join('\n');
}

const INSTRUCTIONS = `Eres el asistente de datos de Prestige Properties (inmobiliaria de lujo en Ibiza: ventas, alquileres y concierge). Respondes preguntas sobre la hoja de cálculo que el usuario tiene abierta en la aplicación «Data Explorer».

Cómo trabajar:
- Responde siempre basándote en los datos visibles (las filas que quedan con los filtros activos). Si la pregunta depende de datos que no están visibles, dilo.
- Para cualquier cifra (recuentos, porcentajes, rankings, medias, medianas, sumas) usa la herramienta agrupar_datos: no estimes a ojo. Para ver registros concretos usa buscar_filas.
- Usa los nombres exactos de las columnas. Los valores de ejemplo del perfil te indican cómo están escritos.
- Responde en el idioma del usuario, de forma breve y clara, con las cifras clave. Usa listas o una tabla en Markdown cuando ayuden.
- Si algo es ambiguo (por ejemplo, qué columna es «el agente»), elige la interpretación más razonable y menciónala en una frase.
- No inventes datos ni columnas.`;

function systemPrompt(ctx: AiContext): Anthropic.Beta.BetaTextBlockParam[] {
  return [
    { type: 'text', text: INSTRUCTIONS, cache_control: { type: 'ephemeral' } },
    {
      type: 'text',
      text: `Archivo: ${ctx.fileName} · Hoja: ${ctx.sheetName}
Filas visibles: ${ctx.rows.length} de ${ctx.totalRows}
Filtros activos en la aplicación: ${describeFilters(ctx)}

Columnas (tipo, valores más frecuentes en las filas visibles):
${columnProfile(ctx)}`,
    },
  ];
}

// ---------- Conversación ----------

export type ChatMessage = Anthropic.Beta.BetaMessageParam;

export interface AskCallbacks {
  onText: (text: string) => void;
  onTool: (name: string) => void;
}

export function createClient(apiKey: string) {
  // La clave la introduce cada usuario y solo se usa desde su navegador.
  return new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
}

/**
 * Envía la conversación y ejecuta las herramientas hasta obtener la respuesta final.
 * Devuelve el historial ampliado (se añade siempre el contenido completo de cada respuesta).
 */
export async function ask(client: Anthropic, history: ChatMessage[], ctx: AiContext, cb: AskCallbacks, signal?: AbortSignal): Promise<ChatMessage[]> {
  const messages = history.slice();
  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const stream = client.beta.messages.stream(
      {
        model: MODEL,
        max_tokens: 16000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort: 'medium' },
        system: systemPrompt(ctx),
        tools: TOOLS,
        messages,
      },
      { signal },
    );
    stream.on('text', (delta) => cb.onText(delta));
    const msg = await stream.finalMessage();
    messages.push({ role: 'assistant', content: msg.content });

    if (msg.stop_reason === 'refusal') {
      cb.onText('\n\n_No puedo responder a esta pregunta._');
      return messages;
    }
    if (msg.stop_reason === 'max_tokens') {
      cb.onText('\n\n_(Respuesta cortada por longitud.)_');
      return messages;
    }
    if (msg.stop_reason !== 'tool_use') return messages;

    const uses = msg.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use');
    uses.forEach((u) => cb.onTool(u.name));
    // Todos los resultados en un único mensaje de usuario.
    messages.push({ role: 'user', content: uses.map((u) => runTool(ctx, u)) });
  }
  cb.onText('\n\n_He alcanzado el límite de consultas para esta pregunta._');
  return messages;
}

export function describeError(e: unknown): string {
  if (e instanceof Anthropic.AuthenticationError) return 'La API key no es válida. Revísala en ⚙.';
  if (e instanceof Anthropic.PermissionDeniedError) return 'Esta API key no tiene permiso para usar el modelo.';
  if (e instanceof Anthropic.RateLimitError) return 'Demasiadas peticiones seguidas. Espera un momento y vuelve a intentarlo.';
  if (e instanceof Anthropic.BadRequestError) return `Petición no válida: ${e.message}`;
  if (e instanceof Anthropic.APIConnectionError) return 'No se pudo conectar con el servicio de IA. Comprueba tu conexión.';
  if (e instanceof Anthropic.APIError) return `Error del servicio de IA (${e.status}). Inténtalo de nuevo.`;
  return (e as Error)?.message || 'Error desconocido.';
}
