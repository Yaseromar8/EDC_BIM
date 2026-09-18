# Comparador de modelos · parpadeo, «el otro lado desaparece» y el error con drenaje

18-sep-2026. El propietario, tras usar «Comparar» en el visor: «cuando hago comparar los modelos empiezan a
parpadear; cuando me acerco en uno, el otro desaparece, tengo que hacer jugadas; y cuando intento comparar
modelos de drenaje urbano sale error». **Medido en producción con su Chrome (pestaña nueva, sin cambiar nada)
y arreglado; commit y push autorizados por él («SI HAZLO»); falta desplegar backend y visor.**

## 1 · En corto

| Síntoma | Causa medida | Arreglo |
|---|---|---|
| Parpadeo y geometría que desaparece al mover | **El visor principal nunca se pausó**: `viewer.stop()` no existe en LMV 7.x, así que la pausa que puso el commit de junio (`0e6d18d`) no hacía nada y **tres visores dibujaban a la vez** sobre la misma GPU. Además la sincronía de cámaras dejaba al lado que se movió con la cámara «sucia»: en su siguiente tick redibujaba la hoja desde cero y volvía a avisar al otro lado. | Pausar de verdad (`viewer.impl.stop()` / `run()`), y copiar la cámara solo cuando de verdad cambió. |
| Error al comparar versiones de drenaje | `409 SOURCE_SCOPE_AMBIGUOUS`: los modelos HD de drenaje están vinculados en **dos obras** (`1_DRENAJE` de PQT8_TALARA y el frente de interferencias). La extracción temporal de una versión histórica exige una obra única y no sabía desde cuál se comparaba. El mensaje además se perdía («No se pudo iniciar la extracción»). | El comparador manda el **frente desde el que compara**; el servidor lo usa solo para elegir entre las obras que ya tiene registradas para ese documento. Y el motivo real se enseña. |

El `404` que salía en su consola (`/api/civil/…?scope_urn=1_DRENAJE`) es otra cosa: el frente de drenaje no tiene
datos civiles (ejes/movimiento de tierras). No tiene que ver con el comparador y no se toca.

## 2 · Medido en producción (18-sep-2026)

Chrome del propietario, pestaña nueva, comparador real; sondas de solo lectura sobre los visores (contadores de
eventos de LMV y del DOM). Detalle numérico en `docs/visor/evidencias/comparador_medicion_2026-09-18.json`.

**Visor principal, con el comparador abierto** (frente `1_CANAL`, 6 modelos): `typeof viewer.stop` = `undefined`,
`typeof viewer.impl.stop` = `function`, `viewer.impl._renderLoopOn` = `true`. Es decir: la pausa no existía y el
visor de fondo seguía en el bucle de dibujo con sus seis modelos, debajo de los dos del comparador.

**Sincronía de cámaras** (modelo `…DR-ST-004120` en los dos lados):

| Gesto en A | Eventos de cámara A / B | Redibujados desde cero A / B | A queda «sucia» |
|---|---|---|---|
| rueda ×5 | 12 / 12 | — | sí |
| rueda ×5 + 6 movimientos | 7 / 7 | — | sí |
| arrastre (órbita) | 5 / 5 | 5 / 5 | sí |
| en reposo, 5 s | 0 / 0 | 0 / 0 | sigue sucia |

Leído en el código de LMV 7.x: `Navigation.setView` pone `camera.dirty = true` sin comparar, el evento de cámara
sale en el **siguiente tick** del visor que la recibe (`BeginScene.signalCameraChanged`), y cada cámara sucia
fuerza `BeginScene.clear` (redibujar la hoja entera desde cero). No es un bucle infinito: el rebote se queda
esperando al próximo tick de A (pasar el ratón por un elemento, seleccionar…), y ahí A redibuja entera y vuelve a
avisar a B. Con láminas ligeras no se ve; con los modelos pesados de drenaje, con aristas, cada redibujado de más
es un parpadeo.

**El 409** (frente `1_DRENAJE`):

| Comparación | Resultado |
|---|---|
| `…DR-ST-011242@011244` v40 → v41 | extrae la v40 en menos de 10 s (506 elementos), diff y 3D correctos |
| `…DR-HD-011259@011263` v23 → v24 | `POST /api/inventory/extract` → **409 `SOURCE_SCOPE_AMBIGUOUS`** y el comparador se para con «No se pudo iniciar la extracción de lado A · vínculo 1» |

Causa en `backend/routes/inventory.py::_extraction_source_context`: para el destino temporal `__cmp__` recorre
`model_config`, junta las obras donde está vinculado ese linaje y exige exactamente una. El manifiesto de P0
(`docs/filters/P0_PRECHECK.md` §3) ya enseñaba los dos frentes de drenaje: `1_DRENAJE` (3 modelos) y
`b.proj_pqt8_interferencias_…_DRENAJE_URBANO_INTERFERENCIAS` (4). El ST solo está en el primero; los HD en los dos.

## 3 · Arreglo

`frontend-react/src/components/CompareView.jsx`:
- La pausa usa `viewer.impl.stop()` al entrar y `viewer.impl.run()` al salir, sobre `__mainViewer` y `NOP_VIEWER`
  (por si el segundo apunta al visor de láminas), y solo sobre el que está corriendo: `impl.stop()` en un visor ya
  parado quita del bucle a OTRO (LMV hace `splice(indexOf, 1)` con `-1`).
- La sincronía compara posición, objetivo y vertical antes de copiar (tolerancia relativa 1e-9, la escena va en
  milímetros): si el otro lado ya está ahí, no se toca nada y no queda ninguna cámara sucia.
- La extracción temporal manda `scope` (el frente desde el que se compara) y, si el servidor no la arranca,
  el estado dice el motivo real con su código.

`backend/routes/inventory.py`:
- `_extraction_source_context(…, scope_hint=None)`: con el documento en más de una obra, el frente declarado elige
  entre las obras **que el registro ya conoce para ese linaje**; un frente no registrado para el documento no
  cambia nada (sigue el 409) y sin frente tampoco. Solo se exige autorización en la obra elegida.
- `start_extraction` lee `scope` únicamente cuando el destino es `__cmp__` y lo pasa al hilo; en una extracción
  normal el destino sigue siendo el que autoriza la ruta.

`frontend-react/src/probar-comparar.jsx` (banco): palanca `window.__extraccion` para simular la respuesta del
servidor a la extracción temporal y ver qué frente manda el comparador y qué mensaje enseña.

**Pruebas:** backend, `tests/test_comparador_documento_en_dos_obras.py` (10 casos: ambigüedad sin frente igual que
antes; frente de cada obra; frente no registrado —`1_CANAL`, inventado, vacío, `None`, número— no desambigua;
documento de una sola obra igual con o sin frente; la ruta lleva el frente al hilo y autoriza solo esa obra; sin
frente 409; en una extracción normal `scope` no se lee) y suite completa: 1989 pasan, 1 falla (`test_capacidades_con_puerta`,
preexistente y documentada en el estado de trabajo). Frontend:
ESLint de `CompareView.jsx` 4 (HEAD 6: la pausa nueva quita dos `catch (e)` sin usar); banco `probar-comparar`
construido y recorrido: selección → Comparar → «Listo», y con la palanca: el cuerpo enviado lleva `scope: 'PQT8'`,
un 409 `SOURCE_SCOPE_AMBIGUOUS` se enseña en palabras con su código, y un 202 sigue hasta «Listo».

## 4 · Lo que NO se ha medido y lo que queda

- **El parpadeo en sí no se ha visto desaparecer.** La medición fue con entradas sintéticas (rueda y arrastre de
  la extensión) y en una pestaña que quedó oculta buena parte del tiempo, donde Chrome frena el dibujo. Lo que está
  probado es la causa (tres visores y cámaras sucias) y que el arreglo la quita. Quien tiene que decir si ya no
  parpadea es el propietario, con los modelos de drenaje, después de desplegar.
- Si con eso no basta, lo siguiente en la lista sería aligerar los dos visores del comparador mientras se mueven
  (`setOptimizeNavigation`, calidad más baja al navegar, aristas): no está hecho ni autorizado.
- `LOB4DWorkspace.jsx` (4D) pausa el visor principal con el mismo `stop?.()` que no existe. Es fichero protegido y
  no se ha tocado; si se quiere, es el mismo cambio.
- Desplegar: **backend** (`visor-ecd-backend-va`, Virginia) y **visor** (`visor-ecd-frontend`), los dos con
  Manual Deploy. El portal no cambia.
