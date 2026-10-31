# 64 · Tableros: presencia y comentarios

31-oct-2026. Fase 5 del plan (doc 57 §4): «Presencia (avatares) y comentarios». Hecha **sin migración**: la presencia
usa la tabla `tableros_abiertos` que ya existe, y los comentarios son elementos del tablero.

## 1 · Presencia: quién está dentro

- **Qué se ve:** arriba a la derecha, los avatares de quien tiene el tablero abierto ahora: hasta cuatro y «+n». Con el
  ratón, el nombre; uno mismo lleva «(tú)».
- **Cómo funciona:** el tablero ya preguntaba su versión cada 10 s (para traer lo que guardan los demás). Ahora lo hace
  con `latido=1`:
  - el servidor anota en `tableros_abiertos` que esa persona sigue ahí;
  - y devuelve quién latió en los últimos **25 s**.
- **Al irse** (cerrar, salir del tablero, ocultar la pestaña), deja de latir y desaparece en menos de 35 s. Medido en el
  banco: **29,6 s y 29,8 s** en dos ejecuciones.
- **Al volver a la pestaña** se mira al momento (quién está y si alguien guardó), sin esperar el siguiente turno de 10 s.
- **Efecto en la lista:** «Abierto por última vez por usted» pasa a ser la última vez que esa persona *estuvo* dentro.

## 2 · Comentarios

- **La herramienta:** «Comentario» (**C**) al final de la barra de abajo, como el bocadillo de Forma Board.
- **Comentar:** un clic clava un **alfiler** (su punta en el clic) y abre «Nuevo comentario» con el cursor en el texto.
  - **Intro** publica; Mayús + Intro hace otra línea.
  - Uno nuevo que se cierra sin escribir desaparece.
- **El alfiler:**
  - un bocadillo con las iniciales de quien lo abrió, del mismo tamaño en pantalla con cualquier zoom;
  - un contador cuando hay respuestas;
  - gris con una marca cuando está resuelto;
  - un clic abre el hilo (sin marco ni barra de selección); arrastrarlo lo mueve.
- **El hilo,** a la derecha:
  - cada mensaje con quién y cuándo;
  - **Responder**;
  - **Resolver / Reabrir** (con «Resuelto por …»);
  - borrar **tu** respuesta;
  - **Eliminar comentario** (el hilo entero), solo para quien lo abrió o un administrador de la obra;
  - Escape cierra.
- **«Comentarios»** en la paleta izquierda: **Abiertos (n) / Resueltos (n)**, el más reciente arriba. Un clic lleva la
  cámara al alfiler y abre su hilo.
- **Buscar** lee el texto de los comentarios.

**Un comentario es un acto, no un dibujo:**
- **Ctrl+Z** no quita el alfiler ni un mensaje: se crean y se escriben sin paso de deshacer.
- **Supr y Cortar** no lo borran: el hilo se elimina desde el hilo, y solo quien puede.
- **Copiar, Duplicar y Pegar** no lo copian: nadie pega mensajes de otro.
- **Las vistas publicadas y la miniatura** no lo llevan: es conversación.

**Dos personas a la vez** (`design/lienzo/fusion.js`). Si las dos cambian el mismo hilo, no se decide entero:
- los **mensajes** se fusionan uno a uno, a tres bandas, y quedan en orden de fecha: dos respuestas a la vez se quedan
  las dos;
- los demás **campos**, uno a uno: si yo respondo y la otra persona lo resuelve, quedan mi respuesta y el resuelto.

## 3 · Piezas

| Pieza | Qué |
|---|---|
| `backend/routes/tableros.py` | `GET …?solo_version=1&latido=1` → anota y devuelve `presentes` (`PRESENTE_SEGUNDOS = 25`). Misma guardia que el resto |
| `design/lienzo/Lienzo.jsx` | Herramientas propias en la barra de abajo (`herramientasExtra`, con `sinDeshacer`). Tipos `protegido`, `copiable: false` y `sinMarco`. Órdenes `ajustar`, `quitar` y `enfocar`, sin paso de deshacer |
| `design/lienzo/fusion.js` | Mensajes y campos de un hilo, a tres bandas |
| `PiezasLienzo.jsx`, `Icono.jsx` | La herramienta en la barra; el icono `comentario` |
| `frontend-docs/.../tableros/comentarios.js` | Puro: alfiler, mensaje, quién puede borrar qué, `sinComentarios`, iniciales, fechas |
| `PinComentario.jsx`, `tipoComentario.js` | El alfiler y su registro en el lienzo |
| `HiloComentario.jsx`, `PanelComentarios.jsx` | El hilo y la lista |
| `TablerosModule.jsx` | Latido y avatares; la herramienta, el hilo, el panel; los comentarios fuera de las vistas y de la miniatura |

## 4 · Encontrado al probar y corregido

**Producto:**
- **Crear el alfiler era un paso de deshacer:** Ctrl+Z, justo después de comentar, se habría llevado el comentario con
  su mensaje. Ahora se crea como un acto (`sinDeshacer`).
- **Resolver mientras otra persona responde:** la fusión elegía el hilo entero de quien guardaba y el «Resuelto» se
  perdía. Ahora decide campo a campo (lo destapó la prueba pura al escribirla).
- **Al volver a la pestaña** el tablero esperaba el siguiente turno de 10 s para ver quién estaba. Ahora mira al momento.
- **El alfiler elegido llevaba marco, asas y barra,** que tapaban el contador. Ahora no (`sinMarco`).

**Prueba:**
- En el banco las dos personas son dos pestañas, y Chrome oculta la de atrás (el tablero no sondea oculto, a propósito).
  Se trae al frente la pestaña de quien mira.
- Un primer recuento de 409 en el registro dio 0 porque la línea lleva códigos de color. Sí hubo un 409 seguido del
  reintento fusionado: el caso «a la vez» se ejercitó de verdad.

## 5 · Pruebas

**Banco** (`prueba_comentarios.py`): **33/33**. Ana y Luis a la vez en el mismo tablero, con ratón y teclado reales,
contra las rutas reales de Tableros y la base desechable. Cubre:
- presencia de uno, de los dos, y al irse uno;
- C, clic y escribir; la punta en el clic; Intro;
- guardado en la base; Escape;
- Ctrl+Z, Supr y Ctrl+D no lo tocan; uno vacío desaparece;
- Luis lo ve y no puede eliminarlo;
- **los dos responden a la vez: tres mensajes guardados y a la vista de los dos, en orden** (con un 409 y su fusión);
- Luis borra su respuesta y lo resuelve; Ana lo ve resuelto;
- el panel con Abiertos y Resueltos; Ana lo elimina y Luis deja de verlo.

**Pruebas puras:** `comentariosTablero.prueba.mjs` **13/13**: alfiler, permisos, `sinComentarios`, iniciales, fechas
y fusión de mensajes y campos.

**Servidor:** `test_tableros.py` **42/42**, con el latido y su guardia.
