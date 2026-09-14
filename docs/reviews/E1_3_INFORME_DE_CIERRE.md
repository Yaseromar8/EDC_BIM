# Revisiones · E1.3 · flujos creados que se pueden usar · informe de cierre

14-sep-2026. Base: `41d7dda`, en producción. Pedido: «Si hago ya el arreglo de flujos creados y empiezo el contrato de volver atrás / devolver al iniciador». Diagnóstico previo: `E1_3_FLUJOS_CREADOS_Y_RECHAZO.md`. El contrato va aparte: `E3_CONTRATO_RONDAS.md`.

**Estado:** probado en local y commiteado con tu autorización («HAZLO»). **Falta el push y el despliegue**, cada uno con su autorización (§7).

## En corto

- **Un flujo con un paso por función y varias personas ya se puede usar:** en «Enviar a revisión» eliges a quién.
- **Los flujos que no pueden abrir una revisión en esta obra salen marcados, con el motivo,** y no se pueden elegir.
- **Al elegir un flujo se hacen ya todas las comprobaciones** de «Iniciar revisión». Si algo no vale, lo dice en ese momento.
- **El editor de flujos ya no guarda** un plazo de 0 días, ni una persona que no es de la obra al editar.
- **Ningún fallo sale como error técnico.**

## 1 · Las siete causas

| # | Antes | Ahora |
|---|---|---|
| 1 | Un paso por **función** con varias personas daba «elige quién…», y la pantalla no tenía dónde elegir | Debajo del flujo aparece «Paso 1 · Supervisión · función SUPERVISION» con un desplegable de personas y su empresa. Hasta elegir: «Elige quién hace el paso 1». Al elegir, se comprueba el flujo entero con esa persona y salen los pasos |
| 2 | Una función que nadie tiene en la obra fallaba al iniciar | El flujo sale **deshabilitado**. Motivo: «El paso 1 pide la función CONTRATISTA y en esta obra no hay nadie con esa función…» |
| 3 | Un flujo antiguo cuyo último paso solo revisa se ofrecía como cualquier otro | Deshabilitado, con el motivo: «El último paso de este flujo sólo revisa…» |
| 4 | El editor guardaba un plazo de **0 días** y el alta lo rechazaba | El editor no lo guarda: «Paso 1: El plazo tiene que ser un número entero de días, de 1 en adelante, o quedar vacío…». Los flujos que ya lo tienen salen deshabilitados, con ese motivo. Un plazo 0 guardado se ve como 0, no vacío |
| 5 | Una persona que dejó la obra, o con la cuenta desactivada, fallaba al iniciar | Deshabilitado y con el nombre: «E13 Ex, del paso 1, ya no es participante de esta obra. Añádelo en Administración → Participantes o edita el flujo.». Al editar un flujo tampoco se puede poner a alguien de fuera; antes solo lo impedía el alta del flujo |
| 6 | La vista previa solo resolvía personas | La vista previa es **el alta misma, parada antes de guardar**: independencia, acceso de cada persona a los documentos, plazos, cierre del flujo y versiones. Solo quedan para «Iniciar revisión» el título y la idoneidad, que se rellenan en la misma ventana |
| 7 | Fallos de la pantalla | Una respuesta que llega tarde (cambiaste de flujo rápido) ya no pisa la última. Si no cargan los flujos, se dice en vez de esconder el selector. Una misma persona en dos pasos ya no mezcla sus controles. Un error del servidor sale en palabras. «Ya existe un flujo con ese nombre» solo se dice cuando es eso |

**Dónde se ve lo que no se puede usar:**
- **En «Enviar a revisión»:** el flujo aparece apagado, con «· no se puede usar aquí», y un desplegable «Un flujo no se puede usar aquí» con el motivo de cada uno.
- **En «Flujos de revisión»:** la etiqueta **NO SE PUEDE USAR** y la línea «No se puede usar en esta obra: …».

## 2 · Qué no cambia

- **Las reglas del servidor para crear una revisión son las mismas**, en el mismo orden y con los mismos mensajes. Hay dos excepciones:
  - un fallo interno ya no enseña el texto técnico;
  - el mensaje del plazo lleva tildes.
- **`/act` y la sustitución del revisor:** sin tocar.
- **Las revisiones ya abiertas** siguen con su copia de los pasos.
- **Los flujos antiguos no se reescriben:** solo se marcan.
- **La vista previa antigua sigue respondiendo igual.** Es la que usa el portal que está desplegado.
- **Sin migraciones.**

## 3 · Por dentro

- **`POST /api/reviews/previsualizar`:** ejecuta la **misma función** que el alta, con `solo_comprobar`, y sale justo antes de la primera escritura. La vista previa y el alta no pueden discrepar, porque no son dos copias.
- **Listado de flujos:** añade `utilizable` y `motivo_no_utilizable`. Se calculan con las mismas reglas del alta, `validar_pasos` y `resolver`, contra los participantes de esta obra, y cada flujo se comprueba aparte para que uno roto no tumbe el listado. Tener que elegir persona no marca un flujo como inutilizable. La independencia y el acceso a los documentos dependen de quién crea y de qué documentos: eso lo dice la vista previa.
- **`resolver`:**
  - devuelve las personas posibles de cada paso por función, estén elegidas o no;
  - una elección que no es un número, o que no es de esa función, da `ELECCION_INVALIDA`.

## 4 · Pruebas en local

| Prueba | Resultado |
|---|---|
| Batería completa del servidor, sin `.env` | 1864 correctas y 1 fallo que ya existía (`test_capacidades_con_puerta`). 23 pruebas nuevas |
| Ensayo nuevo contra PostgreSQL, con el control por obra encendido (`ensayo_de_flujos_creados.py`) | 36 de 36 |
| Regresiones de Revisiones | gemelas 24/24 · versión y visibilidad 67/67 · detalle 25/25 · ciclo de revisión 50/50 · administrador participante 16/16 |
| Pruebas del portal | 6 bancos en verde; `altaDeRevision` 15/15, con 7 nuevas |
| ESLint de los ficheros tocados | Ningún problema nuevo. Los 2 que salen ya estaban en HEAD |
| Construcción del portal sin `.env` | Correcta |

**Qué comprueba el ensayo** (usuarios ficticios, datos que no se borran):
- **Listado:** marca el flujo que acaba en «revisa», el de plazo 0, el de la persona que salió de la obra y el de la función sin nadie. **No** marca el que pide elegir persona, ni el que depende de quién inicie. Un participante que no administra ve las mismas marcas.
- **Editor:** no guarda plazo 0. Al editar no deja poner a alguien de fuera, y la versión no sube. Un nombre repetido se dice como tal.
- **Vista previa:**
  - pide elegir entre Ana y Beto;
  - con Ana salen los pasos y siguen las dos opciones;
  - rechaza elegir un texto o a alguien sin la función;
  - con Beto sobre un documento que no puede ver, lo dice;
  - con el iniciador como único revisor, lo dice, y el mismo flujo iniciado por otra persona sí vale;
  - con los flujos viejos, dice lo de cada uno.
- **Nada escrito:** tras todas las vistas previas, ni una revisión, ni un encargo, ni un registro nuevos (contados en la base).
- **Alta:**
  - con la persona elegida nace con ella en el paso 1, con su procedencia, y le llega la tarea (a Beto no);
  - sin elegir, sin título o sin idoneidad al publicar, se sigue negando.
- **Bordes:**
  - un identificador de flujo que no es un número da «Esa plantilla no existe.» (404), no un error 500;
  - quien no es de la obra recibe 403;
  - la vista previa antigua responde como antes.

**En pantalla, en el banco de Revisiones**, con el alta real y un servidor simulado:
- el flujo viejo sale apagado, con su motivo;
- al elegir el flujo por función aparece el selector;
- elegir a Eva, que no puede ver los documentos, da el aviso en rojo;
- elegir a Ana muestra los pasos;
- «Iniciar revisión» manda el flujo y la persona elegida, sin pasos;
- con un flujo lento y otro elegido enseguida, gana el último;
- un flujo que no se puede aplicar devuelve lo que había.

## 5 · No probado

- **La app real del banco:** Archivos → «Enviar a revisión» contra el servidor del banco. La pestaña del banco cerró su sesión al cargar sin servidor, y no fabrico sesiones en el navegador. El alta real está probada por el servidor (ensayo) y la pantalla real del alta, en el banco de Revisiones.
- **La etiqueta «NO SE PUEDE USAR» del editor de flujos, en pantalla.** Lo probado es el dato del listado y el código de la pantalla.
- **En producción, un paso por función:** depende de que la obra tenga empresas con función. Es el paso H6 de la guía, opcional.

## 6 · Encontrado de paso

En la batería del servidor, `tests/test_capa16_tool_activation.py` deja encendido el control por obra para las pruebas que vienen detrás. Lo hace sin restaurarlo. No afecta a producción, pero hizo fallar mis pruebas nuevas de la ruta real según el orden. Mis pruebas lo declaran; el arreglo de esa prueba lo dejé propuesto como tarea aparte.

## 7 · Para ponerlo en producción (autorización tuya en cada paso)

1. **Commit: hecho**, sin trailer, con tu «HAZLO». Entraron también:
   - el contrato `E3_CONTRATO_RONDAS.md`, para que lo revises (sin código);
   - la guía con el bloque H;
   - lo pendiente del despliegue de A y B: `AI_WORKSTATE.md` y el informe `02_PLANOS_CAD_Y_EDITAR_EN_CARPETA.md`.
2. **Push normal**, tras releer Auto-Deploy «Off» en los 4 servicios.
3. **Manual Deploy del backend** `visor-ecd-backend-va`. Luego, `/api/health` y «Booting worker» en el log. El portal de ahora sigue funcionando con él, porque la vista previa antigua no cambia.
4. **Manual Deploy del portal** `visor-ecd-portal`, verificado por contenido: la ruta `/api/reviews/previsualizar` y «Comprobando el flujo».

**El backend va primero:** el portal nuevo llama a una ruta nueva.

## 8 · Ficheros

- **Servidor:**
  - `plantillas_de_revision.py`, `routes/plantillas_revision.py` y `routes/reviews.py`;
  - nuevos: `tests/test_e13_flujos_creados.py` y `herramientas/ensayo_de_flujos_creados.py`.
- **Portal:**
  - `utils/altaDeRevision.js`, `components/ReviewsModule.jsx`, `components/FlujosDeRevisionModule.jsx` y `pruebas/altaDeRevision.prueba.mjs`;
  - `src/probar-revisiones.jsx`, el banco, que no entra en la construcción de producción.
- **Documentos:** este informe, `E3_CONTRATO_RONDAS.md`, la guía (bloque H) y una nota de estado en `E1_3_FLUJOS_CREADOS_Y_RECHAZO.md`.
- **`FilesPage.jsx` y el resto del WIP ajeno:** sin tocar.

## Cierre

```
CORRECCIONES PREVIAS = E1.3 en local, sin commit: los flujos creados se pueden usar (elegir persona en
  pasos por función; flujos no utilizables marcados con su motivo en el alta y en el editor; vista previa
  con todas las comprobaciones del alta; plazo 0 y personas de fuera ya no se guardan; errores legibles;
  respuesta tardía descartada).
FUNCIONES NUEVAS YA UTILIZABLES = ninguna en producción todavía: lo anterior lo será tras el push y los
  dos Manual Deploy.
FUNCIONES DEL OBJETIVO TODAVÍA PENDIENTES = contrato RONDAS (escrito, espera tus respuestas R1–R14 para
  congelarlo); E2 anular y archivar (sin autorizar); E3 y E4 rondas, volver al paso anterior, devolver al
  iniciador, decisión por archivo y cierre separado de la emisión; E5 exportación.
```

No es «Reviews terminado»: falta tu recorrido.
