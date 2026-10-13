import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';

// El asistente IA se retiró: borra la API key que hubiera quedado guardada en este navegador.
try {
  localStorage.removeItem('prestige-anthropic-key');
} catch {
  /* almacenamiento no disponible */
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
