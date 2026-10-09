import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base relativa: la app funciona desde cualquier carpeta o subruta (GitHub Pages, Netlify, servidor propio…)
export default defineConfig({
  base: './',
  plugins: [react()],
});
