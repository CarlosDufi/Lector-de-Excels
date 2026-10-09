import raw from '../data/countries.json';

export interface Country {
  id: string | null;
  a2: string;
  a3: string;
  es: string;
  en: string;
  region: string;
  subregion: string;
  aliases: string[];
}

export const COUNTRIES = raw as Country[];

export function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[.’']/g, '')
    .replace(/[^a-z0-9\u0080-￿]+/g, ' ')
    .trim();
}

const index = new Map<string, Country>();
// Los nombres oficiales/comunes tienen prioridad sobre los alias cortos.
for (const c of COUNTRIES) {
  for (const alias of c.aliases) {
    const key = normalize(alias);
    if (key && !index.has(key)) index.set(key, c);
  }
}
for (const c of COUNTRIES) {
  for (const name of [c.es, c.en]) index.set(normalize(name), c);
}

const byNumeric = new Map(COUNTRIES.filter((c) => c.id).map((c) => [c.id as string, c]));

export function findCountry(value: unknown): Country | undefined {
  if (value === null || value === undefined) return undefined;
  const key = normalize(String(value));
  if (!key) return undefined;
  return index.get(key);
}

export function countryByNumericId(id: string | number | undefined): Country | undefined {
  if (id === undefined) return undefined;
  return byNumeric.get(String(id).padStart(3, '0'));
}

export const REGIONS = ['Europa', 'América', 'Asia', 'África', 'Oceanía', 'Antártida'];
