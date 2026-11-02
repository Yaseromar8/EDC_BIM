# 69 · Tableros: auditoría final frente a ACC (Forma Board)

31-oct-2026, tras publicar `fbd7f799`. El cierre del plan (doc 57 §4): cada pieza del tablero de ACC frente a la
nuestra.

**Fuentes de ACC:**
- lo medido en su tablero el 30-oct (docs 53 y 54 §1, §7 y §8: barra de abajo, formas, paleta izquierda, tarjetas,
  configuración del motor tldraw);
- las capturas de la cabecera que mandó el dueño el 31-oct (doc 65).

No se volvió a recorrer su tablero: lo medido es de hace un día.

**Leyenda:**
- ✅ lo tenemos;
- 🟡 parcial;
- ❌ falta;
- ⛔ no aplica o decisión del dueño.

## 1 · Barra de abajo (ACC: 17 herramientas)

| ACC | Nosotros | |
|---|---|---|
| Seleccionar, mano | Seleccionar (V), mano (H) | ✅ |
| Nota (N) | Nota con taco de colores; se escala | ✅ |
| Lápiz / plumilla (P) | Lápiz (P) | ✅ |
| **Resaltador** | — (se puede imitar con un trazo grueso de poca opacidad, pero no hay herramienta) | ❌ |
| **Borrador** | — (se borra eligiendo y Supr) | ❌ |
| Texto (T) | Texto (T); doble clic en el vacío | ✅ |
| Flecha | Flecha (A), con puntas y 45° | ✅ |
| Línea | La flecha «sin puntas» | 🟡 |
| Formas (20) | 15, nube de revisión primero | 🟡 Faltan 5 (casilla con ✓, corazón, flechas arriba y abajo, óvalo/romboide de su lista) |
| Marco ▾ (16:9, 4:3, 1:1, A4…) | Sección ▾ con los mismos tamaños | ✅ |
| **Sticker de voto «+1»** (I) | — | ❌ |
| **Kanban vacío** (K) | Solo de incidencias | 🟡 |
| Comentario | Comentario (C), con hilos, resolver y panel | ✅ |
| **Puntero láser** | — (necesita tiempo real; tenemos sondeo cada 10 s) | ❌ |
| Zoom | Píldora de zoom y menú | ✅ |

## 2 · Paleta izquierda

| ACC | Nosotros | |
|---|---|---|
| Data Management (recientes + selector) | Documentos: «Visualizados recientemente» que se jalan + selector propio, en español, con multiselección | ✅ Mejor: su selector está en inglés |
| Incidencias (tarjetas o kanban, crear) | Igual, con nuestras observaciones | ✅ |
| **Imagen** (subir desde el equipo) | — (sí se pueden poner imágenes que ya están en Docs) | 🟡 |
| Buscar (solo texto; no lee tarjetas) | Buscar lee notas, secciones, documentos, incidencias, comentarios y gráficas | ✅ Mejor |
| Deshacer / rehacer | Igual | ✅ |
| Site Design (propuestas de Autodesk Forma) | — | ⛔ Es de Forma |

## 3 · Cabecera

| ACC | Nosotros | |
|---|---|---|
| Título | Título editable | ✅ |
| Avatares + Miembros del panel (rol, invitar, quién puede unirse, salir) | Avatares (presencia) + Miembros del tablero (responsable/editor/lector, invitar, toda la obra o solo invitados, salir) | ✅ |
| Mostrar comentarios | Igual, panel a la derecha | ✅ |
| Editar presentación (marcos, «Seleccionar marcos») | Presentar por secciones en orden de lectura; **sin elegir ni reordenar** | 🟡 |
| IA | — | ⛔ NADA de IA (decisión del dueño) |
| **Ajustes** (rejilla y demás) | — (la rejilla siempre se ve) | ❌ |
| Hable con nosotros | — | ⛔ Es de Autodesk |
| Compartir | Compartir: enlace del tablero + invitar | ✅ |

## 4 · Tarjetas

| ACC | Nosotros | |
|---|---|---|
| PDF (`docs-pdf`), imagen, AutoCAD (`docs-autocad`) con versión ▾, páginas ◀ ▶, pantalla completa | Igual: versión fija, páginas y presentaciones de CAD, extraer hojas, lector de Archivos encima | ✅ |
| «Extraer modelo 3D» y RVT 3D (`docs-viewer`, `docs-rvt`) | — | ⛔ El dueño: «lo del 3D ya lo solucionamos» |
| Láminas de RVT (`docs-rvt-sheet`) | — | ❌ (va con lo del 3D) |
| **Comparar** versiones en la tarjeta | — | ❌ |
| Revisión (`docs-review`) | — | ❌ |
| Incidencia y kanban | Igual | ✅ |
| **Enlace web** (`forma-link-widget`, `iframe`) | — | ❌ |
| Análisis de Forma (sol, viento…) | — | ⛔ Es de Forma |
| Gráficas de datos | **Gráficas enviadas desde View** (doc 68) | ✅ ACC no tiene |

## 5 · Comportamiento

| ACC | Nosotros | |
|---|---|---|
| Rueda ×1,10, pasos de zoom, espacio / clic derecho con inercia, imanes a 8 px, arrastre a 4 px | Igual (medido y replicado, docs 54 y 55) | ✅ |
| **El enlace guarda el encuadre** (`board.x/y/w/h`) | El enlace lleva tablero y vista; el encuadre se recuerda por persona, no en el enlace | 🟡 |
| **Varias páginas** (hasta 40) | Una página | ❌ |
| Más de 500 objetos: dibujo ligero al hacer zoom | Sin medir con tableros grandes | 🟡 Por medir |
| Táctil (pulsación larga, asas grandes) | Sin trabajar | ❌ |
| Guardado | Con versión y **fusión campo a campo**: nadie pisa a nadie | ✅ |

## 6 · Lo que tenemos y ACC no

- Búsqueda que lee las tarjetas, no solo el texto.
- Vistas publicadas de consulta, con enlace, PNG y PDF.
- Gráficas del modelo enviadas desde View.
- Tableros «solo invitados» y un rol de lector que el servidor hace cumplir.
- Todo en español.

## 7 · Veredicto y orden recomendado

El tablero cubre lo que se usa en ACC para trabajar una obra:
- documentos, incidencias, notas, formas y nube, flecha y lápiz;
- comentarios, presencia, miembros, compartir y presentar.

Lo que queda son piezas pequeñas de pizarra y algunas grandes.

**Rápidas** (cada una en una vuelta corta, sin migración):
1. **Resaltador y borrador** en la barra de abajo.
2. **Sticker de voto «+1»** (con quién votó).
3. **Las 5 formas que faltan.**
4. **Ajustes:** rejilla y imanes on/off.
5. **El encuadre en el enlace,** como ACC.
6. **Presentar: elegir y ordenar** las secciones.
7. **Kanban vacío** (K), con columnas propias.
8. **Tarjeta de enlace web.**

**Medianas o grandes** (decidir antes):
- **Subir una imagen desde el equipo:** ¿dónde se guarda? (¿una carpeta de Docs?)
- **Comparar versiones** de un documento en su tarjeta.
- **Tarjeta de revisión** (Revisiones de Docs).
- **Varias páginas** por tablero.
- **Puntero láser:** necesita tiempo real, y hoy sondeamos cada 10 s.
- **Tableros grandes:** medir con 500+ objetos.
- **Táctil.**
