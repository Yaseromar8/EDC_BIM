# Comparador de modelos · parpadeo, «el otro lado desaparece» y el error con drenaje

18-sep-2026. El propietario, tras usar «Comparar» en el visor: «cuando hago comparar los modelos empiezan a
parpadear; cuando me acerco en uno, el otro desaparece, tengo que hacer jugadas; y cuando intento comparar
modelos de drenaje urbano sale error». **Medido en producción con su Chrome, arreglado en `28c2f49`, desplegado
por él (backend y visor) y verificado en producción.**

> **CORRECCIÓN (18-sep-2026, tarde).** La primera versión de este informe —y el mensaje del commit `28c2f49`—
> decían que el visor principal seguía dibujando debajo del comparador («tres visores a la vez») y que el rebote
> de la sincronía «no es un bucle infinito». **Las dos cosas eran falsas.** La primera medida se tomó ANTES de
> abrir el comparador, no durante; la segunda, en una pestaña oculta, donde Chrome no dibuja. Medido otra vez con
> la pestaña visible (§2.1): el visor principal está destruido mientras se compara, y la sincronía antigua SÍ era
> un bucle infinito: **esa era la causa del parpadeo**. El arreglo de la sincronía (ya desplegado) lo quita; la
> «pausa» no hacía ni hace nada.

## 1 · En corto

| Síntoma | Causa medida | Arreglo |
|---|---|---|
| Parpadeo y el otro lado que «desaparece» | **Pimpón de cámaras.** Al mover un lado, el otro copiaba su cámara; LMV marca la cámara como cambiada aunque reciba los mismos números, así que el segundo avisaba al primero, que copiaba otra vez… sin fin. Medido: **los dos visores se redibujaban desde cero ~29 veces por segundo, sin parar**, tras cualquier movimiento. Con el dibujo progresivo y modelos pesados eso es la hoja que parpadea y el lado que nunca termina de pintarse. | Copiar la cámara solo cuando de verdad cambió (`28c2f49`). Medido después: un redibujado por lado y quietos. |
| Error al comparar versiones de drenaje | `409 SOURCE_SCOPE_AMBIGUOUS`: los modelos HD de drenaje están vinculados en **dos obras** (`1_DRENAJE` de PQT8_TALARA y el frente de interferencias). La extracción temporal de una versión histórica exige una obra única y no sabía desde cuál se comparaba. El mensaje además se perdía («No se pudo iniciar la extracción»). | El comparador manda el **frente desde el que compara**; el servidor lo usa solo para elegir entre las obras que ya tiene registradas para ese documento. Y el motivo real se enseña. |

El `404` que salía en su consola (`/api/civil/…?scope_urn=1_DRENAJE`) es otra cosa: el frente de drenaje no tiene
datos civiles (ejes/movimiento de tierras). No tiene que ver con el comparador y no se toca.

## 2 · Medido en producción (18-sep-2026)

Chrome del propietario, pestaña nueva, comparador real; sondas de solo lectura sobre los visores (contadores de
eventos de LMV y del DOM). Detalle numérico en `docs/visor/evidencias/comparador_medicion_2026-09-18.json`.

### 2.1 · La causa del parpadeo (pestaña visible, código ya desplegado)

Mismo modelo en los dos lados (`…DR-ST-011242@011244` v41). Se mueve la cámara de A un metro por código y se
cuentan, por segundo y por lado, los eventos de cámara, los redibujados desde cero (`BeginScene.clear`) y los ticks
del bucle de LMV. En el tramo 3 se añade, por encima, la sincronía ANTIGUA tal cual estaba (copia sin comparar):

| Tramo (3 s cada uno) | Cámara A / B | Redibujados desde cero A / B | Ticks A / B |
|---|---|---|---|
| 1 · en reposo, código nuevo | 0 / 0 | 0 / 0 | 122 / 122 |
| 2 · tras mover A, código nuevo | 0,3 / 0,3 (uno) | 0,3 / 0,3 (uno) | 101 / 101 |
| 3 · tras mover A, **con la sincronía antigua** | **27,7 / 27,7** | **27,7 / 27,7** | 28 / 28 |
| 4 · sigue la antigua, sin tocar nada | **29,3 / 29,3** | **29,3 / 29,3** | 29 / 29 |
| 5 · quitada la antigua | 0,3 / 0 | 0,3 / 0 | 102 / 102 |

Con la sincronía antigua, un solo movimiento deja a los dos visores redibujándose desde cero unas 29 veces por
segundo **indefinidamente** (cada tick es un redibujado entero, por eso los ticks caen de ~100 a ~29). Es un bucle:
`Navigation.setView` pone `camera.dirty = true` sin comparar, el evento de cámara sale en el **siguiente tick** del
visor que la recibe, y la bandera `syncing` no lo corta porque el rebote llega después. Quitada la antigua, el
código nuevo hace un redibujado por lado y se para.

**El visor principal, con el comparador abierto:** destruido (`__mainViewer.impl` = `null`). App lo desmonta
mientras se compara (`{!compareMode && <Viewer/>}`, desde `666f21a`, 12-jun) y lo vuelve a crear al salir, con
todos sus modelos. Así que nunca hubo tres visores: la «pausa» del comparador —`viewer.stop()`, que además no
existe en LMV 7.x— no tenía nada que pausar, y la de `28c2f49` (`viewer.impl.stop()`) tampoco lo tiene. Es inocua.

### 2.2 · Lo que se midió antes, y por qué no valía

La primera medida (pestaña que pasó a segundo plano) dio «0 eventos en reposo» y una cámara que se quedaba
«sucia»: con la pestaña oculta Chrome para el bucle de dibujo, así que el pimpón no podía avanzar. Y el
`_renderLoopOn = true` del visor principal se leyó con la pantalla normal, antes de abrir el comparador; durante la
comparación la sonda devolvía «sin valor», que es lo que da un visor destruido, y no se miró. De ahí las dos
conclusiones falsas de la primera versión.

### 2.3 · El 409 (frente `1_DRENAJE`)

| Comparación | Resultado |
|---|---|
| `…DR-ST-011242@011244` v40 → v41 | extrae la v40 en menos de 10 s (506 elementos), diff y 3D correctos |
| `…DR-HD-011259@011263` v23 → v24 | `POST /api/inventory/extract` → **409 `SOURCE_SCOPE_AMBIGUOUS`** y el comparador se para con «No se pudo iniciar la extracción de lado A · vínculo 1» |

Causa en `backend/routes/inventory.py::_extraction_source_context`: para el destino temporal `__cmp__` recorre
`model_config`, junta las obras donde está vinculado ese linaje y exige exactamente una. El manifiesto de P0
(`docs/filters/P0_PRECHECK.md` §3) ya enseñaba los dos frentes de drenaje: `1_DRENAJE` (3 modelos) y
`b.proj_pqt8_interferencias_…_DRENAJE_URBANO_INTERFERENCIAS` (4). El ST solo está en el primero; los HD en los dos.

## 3 · Arreglo (`28c2f49`, desplegado)

`frontend-react/src/components/CompareView.jsx`:
- **La sincronía compara posición, objetivo y vertical antes de copiar** (tolerancia relativa 1e-9, la escena va
  en milímetros): si el otro lado ya está ahí, no se toca nada. Es lo que quita el parpadeo (§2.1).
- La extracción temporal manda `scope` (el frente desde el que se compara) y, si el servidor no la arranca,
  el estado dice el motivo real con su código.
- La pausa del visor principal pasó a `viewer.impl.stop()`/`run()`. Hoy no hace nada (el visor principal ya está
  destruido cuando se abre el comparador); se deja por si algún día se mantiene montado, con el comentario
  corregido.

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
preexistente y documentada en el estado de trabajo). Frontend: ESLint de `CompareView.jsx` 4 (HEAD 6); banco
`probar-comparar` construido y recorrido: selección → Comparar → «Listo», y con la palanca: el cuerpo enviado lleva
`scope: 'PQT8'`, un 409 `SOURCE_SCOPE_AMBIGUOUS` se enseña en palabras con su código, y un 202 sigue hasta «Listo».

**Verificado en producción tras el despliegue** (18-sep): `/api/health` → `28c2f49b5c91`; el paquete del visor
contiene el código nuevo; el pimpón no se produce (§2.1, tramos 1, 2 y 5).

## 4 · Lo que queda

- **El parpadeo, a la vista del propietario**, con los modelos de drenaje. La causa está medida y quitada; que ya
  no se vea lo tiene que decir él.
- **El 409 de drenaje en producción:** comparar `…DR-HD-011259@011263` v23 → v24 desde `1_DRENAJE` tras el
  despliegue. No se ha repetido: crearía una extracción temporal en su base, y eso lo lanza él.
- Al salir del comparador, el visor principal se vuelve a crear y recarga todos sus modelos (por cómo lo monta
  App desde junio). No es un fallo nuevo; se anota porque cuesta una espera al volver.
- `LOB4DWorkspace.jsx` (4D) pausa el visor principal con el mismo `stop?.()` que no existe. Es fichero protegido y
  no se ha tocado.
