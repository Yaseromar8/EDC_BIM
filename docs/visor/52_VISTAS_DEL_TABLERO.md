# 52 · Vistas del Tablero: elegir gráficas, fijarlas con un botón y compartirlas

30-oct-2026. Lo pidió el dueño, mirando la vista de prueba de la auditoría, que encajaba las gráficas en el panel:

> Puedo tener 20 gráficas y luego decido que quiero mostrar 5: las selecciono y debe haber una opción de fijar, crear un botón… y también sería interesante poder compartir.

Para compartir eligió **A** (enlace para la gente de la obra) y **B** (imagen o PDF). La **C**, un enlace público solo de la gráfica, queda para después; ver §4.

## 1 · Cómo se usa

1. En el lienzo, pulsar **«+ Nueva vista»**. Cada tarjeta muestra una casilla, y un clic la marca o la desmarca.
2. Escribir el título (por ejemplo «Auditoría Canal – reunión») y pulsar **«Fijar como vista»**.
3. Arriba aparece una **pestaña con ese nombre**, junto a «Lienzo» (la activa va subrayada). Al pulsarla:
   - las tarjetas elegidas se ven **encajadas en el panel**, sin zoom ni arrastre, y el panel se ensancha al 62 % de la ventana;
   - las filas son de tres columnas, en el orden elegido. La última tarjeta de cada fila se estira hasta el borde y el alto se reparte para que todo quepa.
4. En la vista, a la derecha de la barra: cuántas gráficas tiene y el menú **«⋯»**, con dos grupos:
   - **Compartir**: **Copiar enlace** (A); **Descargar imagen (PNG)** y **Descargar PDF** (B, A4 apaisado con el título, la obra, el frente, el tablero y la fecha).
   - **Vista**: **Renombrar** (también con doble clic en la pestaña) y **Quitar vista**, en rojo y con confirmación: las gráficas siguen en el lienzo.
   - Para volver al lienzo, su pestaña. El menú se cierra con un clic fuera, con el mismo «⋯» o con Escape.
   - Así lo pidió el dueño al ver la primera versión, que tenía cinco botones sueltos sobre la vista: «más ordenado e intuitivo, en tres puntitos».
5. **Son las mismas tarjetas, vivas:**
   - un clic sigue aislando en el 3D;
   - lo que se cambia en el lienzo se ve en la vista;
   - borrar una tarjeta la quita también de sus vistas;
   - la ✕ de una tarjeta dentro de la vista solo la saca de la vista.

## 2 · Dónde se guarda

En la configuración del tablero (`/api/dashboards`, `config.vistas: [{id, titulo, cards: [ids]}]`), con el mismo autoguardado que las tarjetas. No hace falta servidor nuevo ni migración.

## 3 · El enlace (A)

- Forma: `…/?project=<obra>&frente=<FRENTE>&fn=<nombre>&tablero=<id del tablero>.<id de la vista>`. Usa la entrada por enlace que el visor ya tenía (`project` y `frente`).
- `App.jsx`: si llega `tablero`, abre el Tablero y se lo pasa al lienzo, que abre la vista si es de ese tablero. El efecto que cierra el Tablero al cambiar de frente respeta **solo la primera** apertura, la del propio enlace. La dirección se limpia como las demás.
- Quien abre el enlace entra con **su** usuario: rigen los permisos de la obra.

## 4 · Lo que falta: C · enlace público solo de la gráfica

Necesita servidor:
- un enlace con código que sirva una **foto congelada** de esa gráfica (sus datos ya calculados), sin sesión y de solo lectura;
- sin acceso al resto de la obra;
- revocable;
- con caducidad opcional.

Va aparte, con su revisión de seguridad.

## 5 · Probado (banco del visor, Chrome con la sesión del dueño, Frente Canal)

Guardado bloqueado en la pestaña; el itemizado por frente, simulado.

| Prueba | Resultado |
|---|---|
| Plantilla y vista | Se crea la plantilla, se eligen 5 tarjetas y se fija «Auditoría Canal – reunión»: aparece el botón y se ven las 5 encajadas, sin desplazarse |
| Guardado | Lo que iba a guardarse lleva `vistas: [«Auditoría Canal – reunión» (5)]` |
| Aislar en el 3D | Clic en la dona desde la vista: aísla los 893 elementos de esa clase |
| Copiar enlace | `project=1`, `frente=CANAL`, `fn`, `tablero=<tablero>.<vista>` |
| Imagen | PNG de 794 KB |
| PDF | 400 KB, una página. La primera versión pesaba 17 MB por llevar la captura en PNG; ahora va en JPEG. Los botones de las tarjetas y el recuadro de ayuda del ratón no salen en la captura |
| Abrir el enlace en una pestaña nueva | Entra en el Frente Canal, abre el Tablero en «Auditoría Canal – reunión» con sus 5 gráficas y deja la dirección limpia. En esa prueba las cifras salieron con el itemizado general de la obra (Drenaje), porque la simulación del itemizado llegó tarde; el pie de cada tarjeta lo dice |
| Barra con el menú «⋯» (segunda versión) | Una barra: pestañas Lienzo / vista / «+ Nueva vista» y, a la derecha, «5 gráficas» y «⋯». Desde el menú: copiar enlace (`project`, `frente`, `fn`, `tablero`), PNG 580 KB, PDF 388 KB; renombrar con doble clic y desde el menú; Escape cancela el renombrado; Quitar pide confirmación y, aceptada, deja solo el lienzo (el guardado, bloqueado en la pestaña). El menú cierra con clic fuera, con «⋯» y con Escape |

Escape no llegaba a la barra: `Viewer.jsx` lo corta en la ventana (fase de captura) para que LMV no muestre lo oculto. La barra lleva `data-escape-propio`, la misma salida que ya usa la Planilla.
