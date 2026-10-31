# 58 · Tableros de Docs, fase 1 sin huecos: lo que tiene ACC y lo que tenemos

31-oct-2026. El dueño: «ya que estamos construyendo desde la fase 1, debemos hacerlo bien; no se nos puede
escapar nada; tan profesional como si fuese de ACC, pero nuestro».

La fase 1 es **la lista de tableros y el tablero con notas, texto y secciones** (doc 57). Aquí va, punto por punto,
lo que hace Forma Board (los Tableros de ACC, sobre tldraw) **en ese alcance**, medido en el doc 54 (en su tablero
real y en tldraw.com, el mismo motor), frente a lo nuestro. Documentos, incidencias, publicar, presencia y
comentarios tienen su fase (57 §4) y no entran aquí salvo para decir dónde van.

Estado: ✅ ya está · 🔨 se hace ahora en la fase 1 · ⏭ va en otra fase · ✖ no aplica (y por qué).

## 1 · La lista de tableros

| ACC | Nosotros |
|---|---|
| Lista por proyecto: nombre, abierto por última vez por usted, creado por | ✅ |
| Crear, abrir, renombrar, archivar, archivados | ✅ |
| **Miniatura** del tablero en cada fila | ✅ SVG pequeño generado al guardar, columna `miniatura` en la migración 43 (aún sin aplicar) |
| Ordenar por columna | ✅ Nombre, abierto por mí, creado por (clic en la cabecera; otra vez, al revés) |
| Buscar por nombre | ✅ |

## 2 · Navegar

| ACC | Nosotros |
|---|---|
| Rueda ×1,10 anclada al cursor; Ctrl + rueda continuo; 1–400 % | ✅ |
| Espacio, clic derecho o botón central para mover, con inercia | ✅ (el clic derecho **sin mover** abrirá el menú contextual, como en ACC) |
| Menú de zoom: 100 %, ajustar, a la selección (⇧0 ⇧1 ⇧2), Ctrl ± por escalones | ✅ |
| **Al arrastrar cerca del borde, el lienzo se desplaza solo** | ✅ Franja de 32 px, hasta 16 px por fotograma; también con el marco de selección |
| Cámara de cada persona, recordada | ✅ |
| Dibujo ligero con más de 500 objetos | ⏭ Cuando un tablero real lo pida; hoy se mide a 7 ms por fotograma |

## 3 · Seleccionar y editar

| ACC | Nosotros |
|---|---|
| Clic selecciona, Mayús+clic suma, marco de selección; contorno fino y asas | ✅ |
| Arrastrar el marco **no** selecciona texto | ✅ (arreglado el 30-oct) |
| Doble clic edita; doble clic en el vacío crea texto; Escape sale | ✅ |
| Barra contextual: bloquear, color, letra, tamaño, alineación, ⋮ | ✅ |
| **Menú contextual (clic derecho)**: Cortar · Copiar · Pegar · Duplicar · Eliminar, Reordenar ▸, Bloquear (⇧L), Seleccionar todo; con dos o más, **Organizar ▸** (alinear, distribuir, apilar) y **Enmarcar selección** | ✅ Clic derecho sin mover abre el menú (con submenús); arrastrando, mueve el lienzo |
| **Copiar y pegar con el portapapeles del sistema** (de un tablero a otro, de una pestaña a otra) y pegar un texto copiado de fuera como texto | ✅ Entre tableros y pestañas (eventos nativos de copiar/cortar/pegar; el menú usa el portapapeles asíncrono y, si no hay permiso, el interno) |
| Cortar (Ctrl+X) | ✅ |
| Bloquear con ⇧L (tldraw) | ✅ ⇧L |
| Secciones: cambiar tamaño **desde cualquier esquina** | ✅ Las cuatro esquinas |
| La nota **crece hacia abajo** cuando el texto no cabe | ✅ Crece y vuelve; la letra automática se calcula sobre el ancho para que no crezca con ella |
| Punto lateral: nota al lado, lista para escribir | ✅ (aparece al pasar el ratón por la nota elegida) |
| Imanes a 8 px con guías | ✅ |
| Rejilla de 10 px a voluntad | ✖ Los imanes entre objetos ya alinean; la rejilla fija se quitó por tosca (doc 54 §3). Se reconsidera si alguien la pide |
| Agrupar (Ctrl+G) | ⏭ Junto con documentos (fase 2), donde agrupar plano + notas tiene sentido; hoy las secciones cumplen ese papel |
| Girar | ✖ Para notas y secciones de obra no aporta; ACC lo tiene porque lo hereda de tldraw |
| Escalar un texto arrastrando su esquina | ✖ Se cubre con el tamaño de la barra contextual (cinco tamaños, como ACC) |

## 4 · Buscar y ayuda

| ACC | Nosotros |
|---|---|
| **Buscar** en la paleta izquierda (solo texto del tablero) | ✅ Notas, textos y títulos de sección, sin distinguir tildes (también Ctrl+F); al elegir un resultado, la cámara va a él. Cuando haya tarjetas de documentos, también en ellas (ACC no lo hace) |
| Atajos de teclado a la vista | ✅ Ventana «Atajos de teclado» (tecla ?, menú de zoom y clic derecho en el vacío) |
| Ayudas al pasar el ratón | ✅ |

## 5 · Guardar y trabajar entre varios

| ACC | Nosotros |
|---|---|
| Nadie pisa a nadie | ✅ Versión + 409 + fusión por elemento (doc 57 §5) |
| **Ver lo que guardan los demás sin tener que guardar uno** | ✅ Cada 10 s, con la pestaña visible, se pregunta solo la versión (`?solo_version=1`, sin anotar la apertura); si hay otra y no hay nada pendiente ni a medio gesto, se trae (`?sin_apertura=1`) y se pone, con el aviso «Al día con los cambios de otra persona»; si hay algo pendiente, se guarda ya y el 409 lo fusiona |
| Sin conexión: se avisa y se guarda al volver | ✅ «Sin conexión · se guardará al volver» |
| Cursores y avatares en vivo; comentarios | ⏭ Fase 5 |
| Exportar como imagen o PDF | ⏭ Fase 4 (Publicar vista) |

## 6 · Orden de trabajo

1. Menú contextual (con Organizar, Reordenar, Enmarcar), ⇧L y Ctrl+X.
2. Portapapeles del sistema.
3. Secciones desde cualquier esquina y notas que crecen.
4. Desplazamiento automático en el borde.
5. Buscar y «Atajos de teclado».
6. Ver lo que guardan los demás y sin conexión.
7. Miniatura y ordenar la lista (toca la migración 43, aún sin aplicar).

Cada punto se prueba en el banco con ratón y teclado reales antes del siguiente, y al final se repiten todas las
pruebas de la fase 1.

## 7 · Hecho (31-oct-2026), en local

Los siete puntos. Además, por el camino:

- **Cada acción es su propio paso de deshacer** (crear, borrar, pegar, alinear, estilo, bloquear, orden), como en
  ACC; solo lo que se escribe se agrupa. Antes, dos acciones en menos de 350 ms quedaban en un solo paso y Ctrl+Z
  devolvía la sección pero no la nota creada dentro justo antes.
- Borrar una sección borra lo que tiene dentro, y copiarla o duplicarla lo lleva consigo (como un marco de ACC).
- La barra contextual nunca se sale de la pantalla: se corre hacia dentro y, si arriba no cabe, pasa debajo.
- Lo pegado desde el portapapeles se valida campo a campo (solo formas, colores y tamaños que el lienzo conoce).
- La miniatura es un SVG solo de rectángulos; el servidor rechaza cualquier otra cosa (guiones, manejadores
  `on…=`, enlaces, `foreignObject`, `image`, `use`, `animate`, `url(…)`) y la lista la enseña como `<img>`.

**Fallo de las pruebas, encontrado y corregido.** La comprobación del estado de la cabecera del banco estaba mal
escrita (`texto || ''.startsWith(…)`, sin paréntesis) y daba siempre verdadero: las verificaciones de «Guardado» y
«Sin conexión» en el navegador **no comprobaban nada** desde el 30-oct. Las de la base de datos sí eran reales (por
eso la prueba de dos personas del 30-oct sigue valiendo: miraba versión y notas en PostgreSQL). Corregida, se
repitieron todas las pruebas de navegador.

**Evidencia** (Chrome sin ventana, ratón y teclado reales, rutas reales, PostgreSQL desechable):

| Prueba | Resultado |
|---|---|
| Dos personas en un tablero, con fusión (la del 30-oct, con la comprobación corregida) | 18/18 |
| Barra contextual | 18/18 |
| Menú contextual, Organizar (alinear, distribuir) y deshacer · clic derecho en el vacío · clic derecho arrastrando (con inercia) · Ctrl+C en un tablero → Ctrl+V en **otro, en otra pestaña** · texto de fuera pegado como texto · Ctrl+X / Ctrl+V · sección por la esquina de arriba a la izquierda · nota que crece sin recortar · borde automático · Ctrl+F e Intro · ? y Escape · ⇧L · borrar una sección con su nota y Ctrl+Z | 26/26 |
| Docs: Luis ve la nota nueva de Ana **sin guardar nada** (8,6 s) y con el aviso · sin red «Sin conexión», al volver se guarda solo y está en la base · miniaturas en la lista · ordenar por «Creado por» A→Z y Z→A | 10/10 |
| Selección: el marco no selecciona texto; un clic no edita; doble clic sí; Escape sale | sí |
| Ensayo en PostgreSQL (migración 43 con `miniatura`, rutas como `ecd_app`): miniatura guardada y listada, la peligrosa rechazada sin tocar nada, guardar sin miniatura no la borra, `solo_version` y `sin_apertura` no anotan la apertura | 45/45 |
| `backend/tests/test_tableros.py` con el resto de pruebas de seguridad | 68/68 |
| `node` · imanes / fusión / miniatura | 5/5 · 10/10 · 6/6 |
| Lint de `design/lienzo` y del módulo de Docs | limpio |
| Build de Docs y de View | compilan |
