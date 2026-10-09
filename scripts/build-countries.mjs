// Genera src/data/countries.json (versión reducida de world-countries) con
// nombres en español/inglés, códigos ISO y zona geográfica en español.
// Uso: node scripts/build-countries.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const countries = JSON.parse(readFileSync(require.resolve('world-countries/countries.json'), 'utf8'));

const REGION_ES = {
  Europe: 'Europa', Americas: 'América', Asia: 'Asia', Africa: 'África',
  Oceania: 'Oceanía', Antarctic: 'Antártida',
};
const SUBREGION_ES = {
  'Caribbean': 'Caribe', 'Southern Asia': 'Asia del Sur', 'Middle Africa': 'África Central',
  'Northern Europe': 'Europa del Norte', 'Southeast Europe': 'Europa del Sureste',
  'Southern Europe': 'Europa del Sur', 'Western Asia': 'Oriente Medio',
  'South America': 'Sudamérica', 'Polynesia': 'Polinesia', '': 'Antártida',
  'Australia and New Zealand': 'Australia y Nueva Zelanda', 'Central Europe': 'Europa Central',
  'Eastern Africa': 'África Oriental', 'Western Europe': 'Europa Occidental',
  'Western Africa': 'África Occidental', 'Eastern Europe': 'Europa del Este',
  'Central America': 'Centroamérica', 'North America': 'Norteamérica',
  'South-Eastern Asia': 'Sudeste Asiático', 'Southern Africa': 'África del Sur',
  'Eastern Asia': 'Asia Oriental', 'Northern Africa': 'Norte de África',
  'Melanesia': 'Melanesia', 'Micronesia': 'Micronesia', 'Central Asia': 'Asia Central',
};

// Alias habituales que no vienen en el dataset.
const EXTRA_ALIASES = {
  GB: ['UK', 'Reino Unido', 'Inglaterra', 'England', 'Scotland', 'Escocia', 'Wales', 'Gales', 'Great Britain', 'Gran Bretaña', 'Britain'],
  US: ['USA', 'EEUU', 'EE.UU.', 'EE UU', 'Estados Unidos', 'United States of America'],
  NL: ['Holanda', 'Holland', 'Países Bajos', 'The Netherlands'],
  AE: ['UAE', 'EAU', 'Emiratos', 'Emiratos Árabes', 'Dubai', 'Dubái', 'Abu Dhabi'],
  RU: ['Rusia', 'Russian Federation'],
  KR: ['Corea del Sur', 'South Korea', 'Korea'],
  KP: ['Corea del Norte', 'North Korea'],
  CZ: ['Chequia', 'República Checa', 'Czech Republic'],
  CH: ['Suiza', 'Schweiz', 'Suisse'],
  DE: ['Alemania', 'Deutschland'],
  CN: ['China', 'PRC'],
  HK: ['Hong Kong'],
  TR: ['Turquía', 'Türkiye', 'Turkey'],
  IE: ['Irlanda', 'Eire'],
  BE: ['Bélgica', 'Belgie', 'Belgique'],
  SE: ['Suecia', 'Sverige'],
  NO: ['Noruega', 'Norge'],
  DK: ['Dinamarca', 'Danmark'],
  FI: ['Finlandia', 'Suomi'],
  IT: ['Italia'],
  FR: ['Francia'],
  PT: ['Portugal'],
  AT: ['Austria', 'Österreich'],
  ES: ['España', 'Spain', 'Ibiza', 'Eivissa', 'Baleares', 'Mallorca'],
};

const out = countries
  .filter((c) => c.ccn3 || c.cca2)
  .map((c) => {
    const names = new Set([
      c.name.common, c.name.official,
      c.translations?.spa?.common, c.translations?.spa?.official,
      ...Object.values(c.name.native ?? {}).flatMap((n) => [n.common, n.official]),
      ...(c.altSpellings ?? []),
      c.cca2, c.cca3, c.cioc,
      ...(EXTRA_ALIASES[c.cca2] ?? []),
    ].filter(Boolean));
    return {
      id: c.ccn3 || null,
      a2: c.cca2,
      a3: c.cca3,
      es: c.translations?.spa?.common ?? c.name.common,
      en: c.name.common,
      region: REGION_ES[c.region] ?? c.region,
      subregion: SUBREGION_ES[c.subregion] ?? c.subregion,
      aliases: [...names],
    };
  });

writeFileSync(new URL('../src/data/countries.json', import.meta.url), JSON.stringify(out));
console.log(`countries.json: ${out.length} países`);
