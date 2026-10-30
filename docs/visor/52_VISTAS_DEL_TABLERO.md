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

## 6 · Descargas fiables, borde como en Miro y cabecera de herramientas (30-oct, tarde)

El dueño, en el banco:
- «no se puede descargar imagen o PDF»;
- «cuando quiero anchear o reducir el tablero, tiembla»;
- los botones de la cabecera, «que no parezcan botones».

**Descargas.** Hubo dos causas:
- **El banco se había parado:** la app apagó el servidor de `localhost:5181`, y la imagen y el PDF cargan html2canvas y jsPDF al primer uso.
- **Chrome bloquea en silencio** una descarga cuyo clic ya no es reciente (unos 5 s), y la captura puede tardar más.

Ahora la vista devuelve el archivo (`{ nombre, blob }`):
- si `navigator.userActivation.isActive`, se baja solo;
- si no, la barra muestra «PDF listo · **Guardar**», y ese clic nuevo lo baja.

**Borde.** Cada movimiento:
- pasaba por React y repintaba la App entera;
- reiniciaba la transición de 0,22 s del margen del 3D;
- esa transición redimensionaba el visor una docena de veces.

Ahora, como en Miro (el lienzo no cambia de tamaño y los paneles flotan):
- mientras se arrastra solo cambia, en el DOM y una vez por fotograma, el ancho del panel;
- el encuadre del lienzo se corre lo mismo que el borde, así que las tarjetas se quedan quietas en pantalla;
- el 3D no se toca: al ensanchar, el panel lo tapa; al estrechar, la franja se cubre con el fondo del 3D;
- al soltar, el 3D se ajusta una vez y sin transición, y React se pone al día en el fotograma siguiente;
- no se selecciona texto;
- las gráficas de auditoría (ECharts y Plotly) se redibujan una vez, cuando el tamaño se asienta.

Referencias consultadas: Allotment (la vista dividida de VS Code), react-resizable-panels y el ejemplo forge-rcdb de Autodesk, que solo llama a `viewer.resize()` si el contenedor cambió de tamaño.

**Cabecera.** `Herramienta.jsx`: icono y texto, sin caja, con fondo suave al pasar el ratón, en tres grupos (añadir · organizar · crear). «Nuevo gráfico» es la única en oscuro. Por debajo de 1.000 px, el CSS deja solo el icono (`data-compacta`, que el borde cambia en vivo).

**Medido** con un Chrome aparte controlado por CDP, con la sesión del dueño, en el Frente Canal, el tablero real (19.889 elementos) y los guardados bloqueados en la pestaña:

| Prueba | Resultado |
|---|---|
| Ensanchar 450 px, ratón real, 50 pasos en 1,2 s | La tarjeta queda en la misma x en los 469 fotogramas; texto seleccionado 0; cabecera cortada en 0 fotogramas; el 3D se redimensiona 1 vez (al soltar); 8 ms de media por fotograma |
| Estrechar 450 px | Igual |
| Tirón al soltar | Queda uno, de 133–138 ms: el 3D redibujando el modelo a su tamaño nuevo. Antes eran unos 13 redimensionados por movimiento |
| Descargar PDF / imagen desde «⋯» | Bajan: PDF de 149 KB y PNG de 248 KB |
| Clic caducado (forzado sin gesto) | Sale «PDF listo · Guardar»; al pulsar Guardar, el PDF baja (149 KB) y el aviso se retira |
