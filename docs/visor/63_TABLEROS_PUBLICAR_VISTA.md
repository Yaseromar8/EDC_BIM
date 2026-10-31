# 63 · Tableros: publicar una vista

31-oct-2026. Fase 4 del plan (doc 57 §4): «Seleccionar → Publicar vista → pantalla completa de consulta + enlace
(PNG/PDF como en doc 52)». Es la forma de publicar que el dueño pidió para conectar el tablero de Docs con View más
adelante; aquí queda hecha dentro de Docs.

## 1 · Cómo se usa

1. En el tablero, elegir lo que se quiere enseñar (clic, Mayús + clic o un recuadro). Elegir una **sección** publica
   todo lo que tiene dentro.
2. En el **⋮** de su barra, o con **clic derecho**: **«Publicar vista…»**. Pide el nombre (propone «Vista N») y
   explica qué se publica.
3. Se abre la **vista de consulta**, a pantalla completa:
   - solo lo elegido, encajado en la pantalla; la rueda acerca y aleja, arrastrar mueve, **Ajustar** vuelve a encajar;
   - no se edita nada (Supr, Ctrl+Z o Ctrl+V no llegan al tablero de debajo);
   - doble clic en un documento abre el lector, y en una incidencia su detalle, como en el tablero;
   - **Escape** o «‹ nombre del tablero» vuelven al tablero.
4. El **⋯** de la vista, como el de View (doc 52):
   - **Compartir**: **Copiar enlace**, **Descargar imagen (PNG)** y **Descargar PDF** (A4 apaisado con el título,
     la obra, el tablero y la fecha);
   - **Vista**: **Renombrar** (también con doble clic en el nombre) y **Quitar vista**, con confirmación: lo que
     enseña sigue en el tablero.
5. En la cabecera del tablero, **«Vistas (n)»** las lista, con quién la publicó y cuándo.

**Son los mismos elementos, vivos.** La vista guarda referencias, no copias: lo que cambie en el tablero se ve en la
vista y lo que se borre deja de verse. Si ya no queda nada, la vista lo dice.

## 2 · Dónde se guarda

En la configuración del tablero: `config.vistas = [{ id, titulo, ids, creadaPor, creadaEn }]`.
- Se guarda con el resto del tablero: misma versión y mismo autoguardado.
- Si dos personas guardan a la vez, **se fusiona por vista** como las notas: `fusion.js` añade `vistas` a sus listas.
- Lo que llega del servidor se valida (`limpiarVistas`).
- **Sin migración** y **sin rutas nuevas**.

## 3 · El enlace

`/?obra=<obra>&tablero=<tablero>&vistaTablero=<vista>`
- La obra la abre la app como cualquier enlace de Archivos.
- `useFileExplorer` entra en **Tableros** si la dirección trae `tablero`.
- `TablerosModule` abre ese tablero y esa vista. Si la vista ya no existe, avisa y se queda en el tablero.
- La dirección dice siempre lo que se ve: el tablero abierto, la vista abierta, y nada al volver a la lista o salir de
  Tableros.
- Quien abre el enlace entra con **su** usuario: rigen los permisos de la obra.

**`vistaTablero` y no `vista`:** `vista` ya es del circuito de la planilla, y el lector de Archivos la borra al
abrirse (`utils/sustento.js`). Lo destapó la prueba: tras abrir un documento desde la vista, el enlace había perdido
la vista.

## 4 · Piezas

| Pieza | Qué |
|---|---|
| `design/lienzo/vista.js` | Puro: qué enseña una vista (una sección arrastra lo que tiene dentro), su caja, el encuadre, `limpiarVistas`, nombre de archivo |
| `design/lienzo/VistaLienzo.jsx` | La vista de solo lectura con las **mismas piezas** del lienzo (notas, formas, flechas, trazos, tarjetas propias) |
| `design/lienzo/Lienzo.jsx` | Prop `accionesSeleccion`: acciones de quien usa el lienzo en el ⋮ y el clic derecho de lo elegido |
| `frontend-docs/.../tableros/VistaPublicada.jsx` | La pantalla de consulta, su ⋯, PNG y PDF (`html2canvas` + jsPDF, como View) |
| `frontend-docs/.../tableros/enlaceDeTablero.js` | Leer y escribir el tablero y la vista en la dirección |
| `TablerosModule.jsx` | Las vistas en el guardado y la fusión, «Publicar vista…», «Vistas (n)», el enlace |
| `frontend-docs/package.json` | `html2canvas` 1.4.1 (la de View). Ya estaba en el lock como dependencia opcional de jsPDF: el lock solo deja de marcarla opcional |

## 5 · Encontrado al probar y corregido

**Producto:**
- **Teclas sin dueño.** Al cerrarse el menú o el renombrado, el foco caía al `body`. El tablero de debajo atiende
  desde `window` lo que llega así: Supr habría borrado lo elegido allí y Ctrl+V habría pegado.
  - Ahora, mientras la vista está abierta, esas teclas son suyas y recupera el foco.
  - Las de una ventana encima (el lector) siguen siendo de esa ventana.
- **El parámetro `vista`** del enlace chocaba con el del lector (§3).

**Prueba:**
- la base se leía con los acentos mal decodificados (la consola de Windows): se compara el md5 del título;
- el banco lleva `?quien=1` en la dirección;
- tras el recuadro seguían elegidos los tres elementos, y Supr los borraba todos, que es lo que hace el tablero;
- se pulsaba la pestaña «Tableros» de la lista en vez del botón de volver.

## 6 · Pruebas

**Banco** (`prueba_vistas.py`): **37/37**, con ratón y teclado reales contra las rutas reales de Tableros, la base
desechable y los documentos simulados. Cubre:
- publicar desde el ⋮, con su nombre y el foco;
- solo lo elegido, encajado, con la lámina;
- la dirección; lo guardado en la base;
- la rueda y Ajustar; Supr que no llega al tablero;
- copiar enlace; el PNG (155 KB) y el PDF con el título;
- renombrar y guardar; Escape;
- «Vistas (1)» con quién;
- borrar en el tablero se ve en la vista;
- doble clic en la lámina abre el lector, y Escape cierra solo el lector;
- abrir el enlace lleva directo a la vista;
- quitarla; un enlace a una vista quitada; volver a la lista.

**Pruebas puras:**
- `vistaTablero.prueba.mjs` **16/16**: elementos, sección con su contenido, caja, encuadre, limpiar, fusión de vistas
  y nombre de archivo;
- `enlaceDeTablero.prueba.mjs` **9/9**.
