export type Cell = string | number | boolean | Date | null;
export type Row = Record<string, Cell>;

export type ColumnType = 'number' | 'date' | 'boolean' | 'country' | 'category' | 'text' | 'email' | 'empty';

export interface ColumnInfo {
  name: string;
  type: ColumnType;
  filled: number;
  unique: number;
}

export interface Sheet {
  name: string;
  columns: string[];
  rows: Row[];
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
