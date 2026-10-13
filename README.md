# Prestige Data Explorer

Aplicación web para subir o conectar una hoja de Excel y explorar sus datos de forma interactiva,
con la identidad visual de Prestige Properties (paleta 2026, Neue Haas Unica, Garamond y Gloss and Bloom).

## Qué hace

- **Carga de datos**: arrastra un `.xlsx`, `.xls`, `.xlsm`, `.ods` o `.csv`, o conecta una hoja online
  (Google Sheets compartida/publicada, o un enlace directo a un `.xlsx`/`.csv`). Con una hoja conectada aparece
  el botón **Actualizar** para recargarla. Lee **todas las hojas, todas las columnas y todas las filas**; si el
  archivo tiene varias hojas se puede cambiar entre ellas. Detecta la fila de cabecera aunque haya títulos encima.
- **Detección automática de columnas**: número, fecha, país, categoría, email, texto… (se puede corregir en
  la sección *Columnas*). Reconoce países en español, inglés, idioma local y códigos ISO (`ES`, `ESP`, `UK`, `Holanda`…).
- **Filtros seleccionando / deseleccionando**: panel lateral con casillas para cada valor (con recuentos que
  se actualizan según el resto de filtros), «solo este valor», búsqueda, rangos para números y fechas, y
  búsqueda global. Hacer clic en una barra de un gráfico o en un país del mapa también filtra.
- **Secciones**:
  - **Resumen**: indicadores clave, mapa, reparto por zona del mundo, evolución mensual y desglose por columnas.
  - **Mapa**: mapa del mundo con zoom, coloreado por **zona del mundo**, por **cantidad** (número de filas, suma o
    media de una columna numérica) o por el valor de **cualquier columna** (p. ej. Venta/Alquiler); ranking de países
    y lista de valores no reconocidos.
  - **Datos**: tabla con todas las columnas, ordenación, columnas visibles, paginación, **edición de celdas**
    (doble clic) y **exportación a Excel** de lo filtrado.
  - **Columnas**: ficha de cada columna (tipo, % relleno, valores distintos, valores más frecuentes, mín/máx/media).
  - **Detalle de fila**: clic en una fila para ver y editar todos sus campos.
- **Preguntar a los datos** (botón abajo a la derecha): preguntas en lenguaje natural, sin IA y sin coste. Entiende
  los nombres de columna y los valores del archivo cargado (también países escritos de otra forma, meses y cifras
  como «2 millones»): «¿cuántas peticiones de Alemania en marzo?», «ranking de países», «porcentaje por idioma»,
  «mediana del presupuesto por país», «compara New y Comeback», «presupuesto más alto». Muestra lo que ha entendido,
  permite aplicar esos filtros a la app y abre la tabla dinámica para cruces de dos columnas.
- **Lectura robusta de cualquier Excel/CSV**: detecta la cabecera aunque haya títulos encima o esté en dos filas,
  rellena celdas combinadas, descarta filas de totales y cabeceras repetidas, incorpora los comentarios de celda,
  lee hojas ocultas, CSV con «;» o «,» en UTF-8 o Windows-1252, y números/fechas escritos como texto
  («1.200.000», «15/03/2025»). La sección *Columnas* resume cómo se ha leído cada archivo.
- Los datos se guardan **solo en el navegador** (IndexedDB) para que sigan ahí al volver; no se envían a ningún servidor.

## Uso

```bash
npm install
npm run dev      # desarrollo en http://localhost:5173
npm run build    # genera la versión publicable en dist/
```

La carpeta `dist/` es una web estática: se puede publicar en GitHub Pages, Netlify, Vercel o cualquier servidor.

## Notas

- **Google Sheets**: la hoja debe estar compartida como «Cualquier persona con el enlace» o publicada en la web
  (*Archivo → Compartir → Publicar en la web*). Los enlaces de OneDrive/SharePoint suelen bloquear la descarga
  desde otras webs; en ese caso, descarga el archivo y súbelo.
- **Fuentes**: Neue Haas Unica y Gloss and Bloom son fuentes con licencia de la empresa y **no se suben al
  repositorio** (es público). Copia estos archivos en `src/assets/fonts/` antes de `npm run dev` / `npm run build`:
  `NeueHaasUnica-Light.ttf`, `NeueHaasUnica-Regular.ttf`, `NeueHaasUnica-Bold.ttf` y `GlossAndBloom.ttf`.
  Si faltan, la app funciona igual con fuentes de reserva (Helvetica/Arial). Adobe Garamond Pro se usa si está
  instalada; si no, EB Garamond (Google Fonts).
- **Datos de países**: `src/data/countries.json` se genera con `node scripts/build-countries.mjs` a partir de
  `world-countries`. El mapa usa `world-atlas` (Natural Earth 1:50m).
- Lectura de Excel con SheetJS (`xlsx` 0.18.5, la última versión publicada en npm). Para la versión más reciente,
  instálala desde `https://cdn.sheetjs.com/`.
