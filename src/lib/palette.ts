// Paleta Prestige 2026 adaptada para datos (validada para daltonismo).
export const BRAND = {
  turquoise: '#33a6a6',
  highNet: '#284744',
  deepTeal: '#004b4b',
  goldDark: '#b2996a',
  goldLight: '#d2c09e',
  purple: '#cac5d9',
  rentalGold: '#98794e',
  ink: '#313131',
  bgSales: '#f7f6f0',
  bgRentals: '#f3eee7',
};

/** Orden fijo de colores categóricos (nunca se recicla: el resto va a "Otros"). */
export const CATEGORICAL = ['#1fa0a0', '#b8873a', '#7a68c2', '#007a7a', '#c79a4a', '#3f86c4'];
export const OTHER = '#b9b4a8';
export const NO_DATA = '#e6e2d8';

/** Rampa secuencial turquesa (claro → oscuro). */
export const SEQUENTIAL = ['#d7eeee', '#a9dada', '#73c2c2', '#33a6a6', '#1f8585', '#0d6464', '#004b4b'];

export function sequentialColor(t: number): string {
  const i = Math.min(SEQUENTIAL.length - 1, Math.max(0, Math.floor(t * SEQUENTIAL.length)));
  return SEQUENTIAL[i];
}

export const REGION_COLORS: Record<string, string> = {
  'Europa': CATEGORICAL[0],
  'América': CATEGORICAL[1],
  'Asia': CATEGORICAL[2],
  'África': CATEGORICAL[3],
  'Oceanía': CATEGORICAL[4],
  'Antártida': OTHER,
};
