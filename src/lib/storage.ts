import { del, get, set } from 'idb-keyval';
import type { Dataset } from './types';

const KEY = 'prestige-dataset-v1';

export async function saveDataset(d: Dataset | null) {
  try {
    if (d) await set(KEY, d);
    else await del(KEY);
  } catch {
    /* almacenamiento no disponible (modo privado) */
  }
}

export async function loadDataset(): Promise<Dataset | null> {
  try {
    return ((await get(KEY)) as Dataset | undefined) ?? null;
  } catch {
    return null;
  }
}
