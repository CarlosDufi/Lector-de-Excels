import type { Dataset, Row } from './types';

// Generador determinista para que los datos de ejemplo sean siempre iguales.
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

const FIRST = ['Sophie', 'James', 'Lukas', 'Anna', 'Marco', 'Elena', 'Oliver', 'Charlotte', 'Lars', 'Isabel', 'Pierre', 'Mia', 'Ahmed', 'Laura', 'Henrik', 'Giulia', 'Thomas', 'Emma', 'Carlos', 'Nina', 'David', 'Sara', 'Jan', 'Chloé'];
const LAST = ['Müller', 'Smith', 'Rossi', 'Johansson', 'García', 'Dubois', 'Van Dijk', 'Novak', 'Andersen', 'Brown', 'Schmidt', 'Moreau', 'Ferrari', 'Larsen', 'Martín', 'Al Mansouri', 'Keller', 'Wilson', 'Nieminen', 'Costa'];
const COUNTRIES: [string, number][] = [
  ['Reino Unido', 18], ['Alemania', 16], ['España', 10], ['Países Bajos', 8], ['Francia', 7], ['Italia', 6],
  ['Suiza', 6], ['Suecia', 5], ['Bélgica', 4], ['Noruega', 3], ['Dinamarca', 3], ['Estados Unidos', 6],
  ['Emiratos Árabes Unidos', 3], ['Irlanda', 2], ['Austria', 2], ['Canadá', 2], ['Australia', 1],
  ['México', 1], ['Brasil', 1], ['Argentina', 1], ['Sudáfrica', 1], ['Israel', 1], ['Singapur', 1], ['Japón', 1],
];
const AREAS = ['Ibiza Town', 'San José', 'Santa Eulalia', 'San Antonio', 'San Juan', 'Formentera'];
const STATUS = ['Nuevo', 'Contactado', 'Visita', 'Negociación', 'Cerrado', 'Perdido'];
const SOURCES = ['Web', 'Idealista', 'Referido', 'Rightmove', 'Instagram', 'Newsletter', 'Feria'];
const AGENTS = ['Marta', 'Toni', 'Claire', 'Javier', 'Ingrid'];
const PROPERTY = ['Villa', 'Finca', 'Apartamento', 'Ático', 'Casa', 'Terreno'];

function pickWeighted<T>(r: () => number, items: [T, number][]): T {
  const total = items.reduce((s, [, w]) => s + w, 0);
  let x = r() * total;
  for (const [v, w] of items) if ((x -= w) <= 0) return v;
  return items[items.length - 1][0];
}

export function sampleDataset(): Dataset {
  const r = rng(1983);
  const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)];
  const rows: Row[] = [];
  for (let i = 0; i < 420; i++) {
    const first = pick(FIRST);
    const last = pick(LAST);
    const tipo = r() < 0.55 ? 'Venta' : 'Alquiler';
    const created = new Date(2024, 0, 1 + Math.floor(r() * 640));
    const lastContact = new Date(created.getTime() + Math.floor(r() * 200) * 86400000);
    const budget = tipo === 'Venta'
      ? Math.round((800000 + r() ** 2 * 9000000) / 50000) * 50000
      : Math.round((6000 + r() ** 2 * 40000) / 500) * 500;
    rows.push({
      'ID Lead': `L-${String(1000 + i)}`,
      Nombre: `${first} ${last}`,
      Email: `${first}.${last}`.toLowerCase().normalize('NFD').replace(/[^a-z.]/g, '') + '@mail.com',
      País: pickWeighted(r, COUNTRIES),
      Tipo: tipo,
      'Tipo de propiedad': pick(PROPERTY),
      Zona: pick(AREAS),
      Estado: pick(STATUS),
      'Presupuesto (€)': budget,
      Dormitorios: 2 + Math.floor(r() * 6),
      Fuente: pick(SOURCES),
      Agente: pick(AGENTS),
      'Fecha alta': created,
      'Último contacto': lastContact,
      Newsletter: r() < 0.6 ? 'Sí' : 'No',
      Notas: r() < 0.3 ? pick(['Quiere vistas al mar', 'Busca cerca de la playa', 'Prefiere zona tranquila', 'Necesita licencia turística', 'Interesado en reforma']) : null,
    });
  }
  return {
    fileName: 'Leads de ejemplo.xlsx',
    source: 'sample',
    loadedAt: Date.now(),
    sheets: [{ name: 'Leads', columns: Object.keys(rows[0]), rows }],
  };
}
