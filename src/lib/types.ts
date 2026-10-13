export type Cell = string | number | boolean | Date | null;
export type Row = Record<string, Cell>;

export type ColumnType = 'number' | 'date' | 'boolean' | 'country' | 'category' | 'text' | 'email' | 'id' | 'empty';

export interface ColumnInfo {
  name: string;
  type: ColumnType;
  filled: number;
  unique: number;
}

/** Qué se ha hecho al leer la hoja (se muestra al usuario para que pueda comprobarlo). */
export interface SheetInfo {
  hidden: boolean;
  headerRow: number; // fila de Excel (1 = primera)
  headerRows: number; // 1 o 2 si la cabecera ocupa dos filas
  titleLines: string[]; // textos encima de la cabecera
  mergedFilled: number; // celdas rellenadas a partir de celdas combinadas
  droppedTotals: number; // filas de totales descartadas
  droppedHeaders: number; // cabeceras repetidas descartadas
  droppedEmpty: number; // filas vacías ignoradas
  comments: number; // comentarios de celda incorporados
  formulasWithoutValue: number; // fórmulas sin valor calculado guardado
}

export interface Sheet {
  name: string;
  columns: string[];
  rows: Row[];
  info?: SheetInfo;
}

export interface Dataset {
  fileName: string;
  source: 'file' | 'url' | 'sample';
  url?: string;
  loadedAt: number;
  sheets: Sheet[];
}

export type Filter =
  | { kind: 'values'; included: string[] }
  | { kind: 'range'; min: number | null; max: number | null }
  | { kind: 'dates'; from: string | null; to: string | null };

export type Filters = Record<string, Filter>;
