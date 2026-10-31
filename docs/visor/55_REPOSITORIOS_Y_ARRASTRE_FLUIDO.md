# 55 · Qué se copió de los repositorios y el arrastre fluido

30-oct-2026. El dueño pasó cuatro repositorios: tldraw, Excalidraw, sanidhyy/miro-clone y jatin1510/miro-clone. Pidió «lee esos repositorios y ve qué podemos copiar; la idea es ser fluidos como ACC y no toscos».

## 1 · Los repositorios

| Repositorio | Qué es | Licencia | Qué se toma |
|---|---|---|---|
| **tldraw/tldraw** | El SDK de lienzo infinito en React; es el motor de los Tableros de ACC (Forma Board, docs/visor/54) | **tldraw license**: libre en desarrollo, **en producción exige clave de licencia** | Nada de código. Su comportamiento ya está medido (doc 54) y se replica |
| **excalidraw/excalidraw** | Pizarra en React (`@excalidraw/excalidraw`) | **MIT** | **Los imanes**: `packages/excalidraw/snapping.ts` (1.414 líneas) y su dibujo en `renderer/renderSnaps.ts`, leídos enteros |
| **sanidhyy/miro-clone** | Clon de Miro: Next.js 16, React 19, Liveblocks (tiempo real), Convex (datos), Clerk (usuarios), perfect-freehand | MIT | Nada por ahora: aporta colaboración en vivo, no fluidez ni imanes |
| **jatin1510/miro-clone** | Otro clon con el mismo stack: Ctrl+D, flechas, marco que solo coge lo que queda dentro, exportar PNG | No declarada | Nada (ya lo teníamos o no se puede usar sin licencia) |

## 2 · Por qué nuestro arrastre era «tosco»

1. **Saltaba de 16 en 16 px:** cada movimiento redondeaba la posición a la rejilla (`snap`). ACC mueve al píxel y solo se pega cuando está cerca de otro elemento.
2. **Cada movimiento redibujaba todas las tarjetas:** `setCharts` por cada `pointermove` hacía repintar todo el tablero a React. A la cámara ya se le había quitado eso (doc 54 §5), pero al mover no.

## 3 · Lo que se hizo

**`imanes.js`**: porte de los imanes de Excalidraw (MIT, con la atribución en la cabecera), simplificado a rectángulos sin giro.
- **Umbral de 8 px de pantalla** (`SNAP_DISTANCE`), dividido por el zoom: se siente igual a cualquier escala. Coincide con el `snapThreshold` de 8 medido en Forma Board.
- **Puntos:** las esquinas y el centro de la caja movida contra las esquinas y centros de los elementos **visibles que no se mueven**.
- **Huecos:**
  - centrar la selección en un hueco mayor que ella;
  - o dejarla a la **misma distancia** que dos vecinos (por la derecha, izquierda, arriba o abajo).
- Gana el candidato más cercano en cada eje. Las **líneas guía se recalculan desde la posición ya imantada**, para que coincidan exactas, como en Excalidraw.
- **Rendimiento:** referencias, puntos y huecos se calculan **una vez al empezar a arrastrar** (el `SnapCache` de Excalidraw).
- **Dibujo** como `renderSnaps`: líneas de 1 px de pantalla, cruces en los puntos alineados y marcas en los extremos de los huecos. El color es rojo coral, como el suyo.

**Arrastre en el DOM** (`DashboardWorkspace.arrastrar`):
- Las tarjetas, secciones y notas en movimiento llevan un `transform` (con `will-change`), igual que el recuadro de la selección, y las guías se escriben en un SVG. **React no interviene mientras se arrastra.**
- Al soltar se confirma **una vez** con `flushSync` y el `transform` se quita en el mismo cuadro: no hay parpadeo.
- **Sin rejilla al mover:** al píxel; **Ctrl** apaga los imanes mientras se arrastra.
- Las flechas empujan 1 px, 10 con Mayús (como tldraw).
- Lo seleccionado se mueve junto: las secciones llevan sus tarjetas y notas. Un arrastre es un paso de deshacer.

**Foco al abrir:** el tablero toma el foco al abrirse. Antes, los atajos (Mayús+1, Ctrl+Z…) no funcionaban hasta hacer clic dentro; lo destapó la prueba.

## 4 · Medido

**Banco de imanes** (`node frontend-react/pruebas/imanes.prueba.mjs`): **5/5**.
- Pega un borde a 4 px.
- No pega a 12 px.
- A zoom 0,5, 12 px del mundo son 6 de pantalla, y pega.
- Centra en el hueco.
- Repite la distancia del hueco.

**Arrastre real** (Chrome sin ventana, sesión del dueño, Frente Canal, tablero real, guardados bloqueados): la cabecera de una tarjeta, 40 pasos en 0,65 s, a zoom 59 %:

| Medida | Resultado |
|---|---|
| Fotogramas durante el arrastre | 254; **6,9 ms de media, máximo 17, ninguno lento, ninguna tarea larga** |
| Guías durante el arrastre | Dibujadas (SVG de 4.983 caracteres) |
| Imán | El desplazamiento vertical crudo era de 211 px del mundo y quedó en 224: alineado con otra tarjeta a 7,8 px de pantalla |
| Al soltar | Posición confirmada (912, 1232), sin `transform` sobrante y sin guías |
| Ctrl+Z | Vuelve a (736, 1008) |
