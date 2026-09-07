# AI_WORKSTATE.md — dónde estamos ahora

> Fotografía del estado **real**, leída del repositorio y de producción el
> **6-sep-2026**. No es memoria de conversación: cada dato de aquí se midió con
> un comando y el comando se indica. Si el repositorio contradice este fichero,
> **manda el repositorio** y el protocolo es STOP / STATE DIVERGENCE
> (`../AGENTS.md § 9`).
>
> Reglas de trabajo → [`../AGENTS.md`](../AGENTS.md) ·
> Decisiones congeladas → [`AI_DECISIONS.md`](AI_DECISIONS.md)

---

## PROJECT

**ALEPHIA View** (visor 3D/BIM, `frontend-react`) dentro del CDE de ALEPHIA,
junto a **ALEPHIA Docs** (`frontend-docs`) y el backend Flask (`backend`).
Repositorio `Yaseromar8/EDC_BIM`.

## BRANCH / HEAD

| | |
|---|---|
| Rama | `main` |
| HEAD | `3e413cd880fa1093afc4b4759422044e4642c2d6` (`3e413cd`, 6-sep-2026 15:09 -05) |
| `origin/main` | `3e413cd880fa1093afc4b4759422044e4642c2d6` |
| Divergencia | **0 adelante / 0 atrás** — local y remoto idénticos |

```
3e413cd feat(saved-views/e-7): make the v2 pipeline the default path
e3290ec feat(saved-views/e-6): capture and save canonical v2 views
0fc4a4a feat(saved-views/e-5): add deterministic v2 restore pipeline
87d149b fix(saved-views/e-4d): make shared capability route unambiguous
0a32cdf feat(saved-views/e-4d): separate shared view identity from public capability
f756c58 feat(saved-views/e-4c): enforce project scope and view ownership
c685992 feat(saved-views/e-4b): add validated v2 write contract
34ef8f7 feat(saved-views/e-4a): split saved view list and detail contracts
cabcfd2 feat(saved-views/e-3): signal models only when identity is ready
02efa47 feat(saved-views/e-2): el contrato v2, entero y sin acercarse al visor
56fd35e feat(saved-views/e-1): la configuracion del inventario deja de vivir en el panel
ae364dd feat(saved-views/e-0): seis columnas para v2, y ni una fila tocada
```

## PRODUCTION

Medido con `curl` y `psql` el 6-sep-2026. Los tres servicios tienen
**Auto-Deploy OFF**: un push no publica nada.

| Servicio | Estado medido |
|---|---|
| Backend `visor-ecd-backend` | `GET /api/health` → `status ok`, `rama main`, **`version 3e413cd880fa`**, `configuracion.completa true`, `puntos 7`, `faltan 0` |
| Visor `visor.alephia.com.pe` | HTTP 200, sirviendo `assets/index-QbvxFLR_.js`. **Verificado por contenido**, no por el panel: el paquete servido contiene `SAVED_VIEWS_V2_RESTORE` (E-7), `saved-view-request-capture`, `globalOffsetAtSave`, `hiddenModelLineages` (E-6), `viewer-ready`, `inventory-ready` y `restaurandoVistaV2` (E-5). Es decir, corre el código de `3e413cd` |
| Portal `alephia.com.pe` | HTTP 200, `assets/index-TqLeehpb.js`. **No se tocó** en este ciclo |

**Migraciones aplicadas** (no hay tabla de registro; se verifica por forma del
catálogo, como `ecd_migrator` con `default_transaction_read_only=on`):

- **`29_saved_views_v2.sql`** — seis columnas en `saved_views`, las seis
  presentes: `schema_version`, `state`, `updated_at`, `created_by`,
  `thumbnail`, `description`.
- **`30_saved_views_share_token.sql`** — cuatro columnas, las cuatro presentes:
  `share_token`, `legacy_enlace`, `legacy_accesos`, `legacy_ultimo_acceso`; más
  el **índice UNIQUE parcial `ux_saved_views_share_token`**
  (`ON saved_views (share_token) WHERE share_token IS NOT NULL`), presente.

Las diez columnas y el índice se leyeron del catálogo de producción. Ninguna
columna de la 30 pertenece a la 29.

**Datos de `saved_views` en producción:**

```
total = 7   ·   schema_version 1 = 7   ·   schema_version 2 = 0
legacy_enlace = TRUE en las 7   ·   share_token = NULL en las 7
```

Las 7 vistas históricas conservan **id y md5 idénticos** a la huella tomada
**antes** de migrar (`md5(viewer_state ‖ filter_state ‖ config)`):

| id | nombre | md5 |
|---|---|---|
| `0RA5vWbQiA6qsntpKULDgRRJby-sqWUt` | VISTA INTERFERENCIAS | `a1ce19f0bb84d3b585ebcdc74be0020c` |
| `1772810849105` | 03_AVANCE_MARZO01 | `117a82615dabbae5d78016e08fd1d1c3` |
| `1772810997605` | 01_AVANCE_SEMANAL_MARZO | `4c2e926303875b2d64c565eb2e03d47c` |
| `1772811167363` | 01_AVANCE_MARZO_DU | `36a7a2fd78e82ea5922bae29a2529e7f` |
| `1U9irfuzspSArzPSxnFVLrTMza3S1NO1` | DRENAJE_URBANO | `a37974069caf9e3a1d9ca3fd597e2e43` |
| `K_fYpWc6bxAwndkSOrEIlsXrMB0c9d8l` | CANAL_JESUS_MARIA | `acc639d21ed6d89d2ba4cbb175849c28` |
| `O01yez4jOkPGEfOf4i1CjsH_BsVV0Oao` | ALCANCE | `08e158338e7ebd3b06303caac74d15a9` |

## CURRENT STATUS

**Saved Views 2.0 = CLOSED / PRODUCTION GREEN.**

## LAST COMPLETED

Saved Views 2.0, de E-0 a E-7:

- **E-0…E-7 cerrados**: columnas, contrato V2, señal de modelos, contratos de
  lectura/escritura/alcance/compartir, restaurador determinista, capturador
  canónico y V2 como camino por defecto.
- **Migraciones 29 y 30** aplicadas a mano como `ecd_migrator`, aditivas.
- **Backend y frontend desplegados** en `3e413cd` (Manual Deploy; el portal no
  se tocó).
- **Smoke P7 verde**: las dos vistas V2 de prueba (`zz_P7_produccion`,
  `zz_P7_saveas`) se crearon, se verificaron y **se borraron** dentro de una
  transacción con guarda de reversión.
- **Las 7 V1 históricas, intactas**: mismos ids, mismos md5, las 7 siguen
  `legacy_enlace = TRUE`.
- **`ENLACES_LEGACY_HASTA=abierto`** en Render, confirmado indirectamente por
  `/api/health` (`ENLACES_LEGACY_DECIDIDA` es el 7.º punto de la postura y
  `faltan = 0`).

## EXPECTED WORKTREE

El worktree **está sucio a propósito**. Nada de lo que sigue pertenece al
trabajo cerrado, y **nada de esto se limpia, se añade ni se commitea**.

### Modificados (`M`) — 4 ficheros, +566 / −116

| Fichero | Qué es | Trato |
|---|---|---|
| `frontend-react/src/aps/extensions/LOB4DExtension.js` | 4D/LOB en vuelo del propietario | **PROTEGIDO** |
| `frontend-react/src/components/ViewerLabelsBar.jsx` | ídem | **PROTEGIDO** |
| `frontend-react/src/lib/predictBim.js` | ídem | **PROTEGIDO** |
| `frontend-react/src/components/Viewer.jsx` | **+48 líneas que NO son de Saved Views**: cablean `registerViewerFacade` desde `../aps/viewer/ViewerFacade` (fichero **untracked**), más tres guardas `facadeVisibilityRef`. Lo de Saved Views que hay en este fichero (`viewer-ready`, `__visorListo`, `__restaurandoVistaV2`, `viewer-request-models`) **ya está commiteado** en `3e413cd` | **NO commitear tal cual** — ver DIVERGENCIA 1 |

### Untracked — 31 entradas (28 previas + los 3 ficheros de handoff)

- **Trabajo ajeno al task actual / protegido:**
  `frontend-react/src/aps/viewer/` (`ViewerFacade.js`, `README.md`),
  `frontend-react/pruebas/viewerFacade.prueba.mjs`,
  `frontend-react/src/assistant/`
- **Respaldos históricos del 4D (no borrar):**
  `…/LOB4DExtension.js.bak.20260813_antescolor`,
  `…/LOB4DExtension.js.bak.20260813_predict`,
  `…/LOB4DExtension.js.roto.20260813_mapa`,
  `…/ViewerLabelsBar.jsx.bak.20260810_campo`,
  `…/ViewerLabelsBar.jsx.bak.20260813_costos`,
  `…/ViewerLabelsBar.jsx.bak.20260813_legible`
- **Ficheros de obra y hojas de cálculo:**
  `4D LOB Progress - Standalone.html`, `500125-PQ08-LB00_R00_SEM26-1.xml`,
  `DURACIONES LB00_R00.xlsm`,
  `Metrados RIBA 5 - Paquete 8_SINOHYDRO_V03.xlsx`, `PDF/`, `excel_dump.json`
- **Guiones sueltos de la raíz:** `build_schedule.py`, `check_json.py`,
  `fix_newlines.py`, `read_excel.py`, `safe_fix.py`, `verify_json.py`
- **Banco de primitivas / build alterno:**
  `frontend-docs/probar-primitivas.html`,
  `frontend-docs/src/probar-primitivas.jsx`,
  `frontend-react/probar-primitivas.html`,
  `frontend-react/src/probar-primitivas.jsx`,
  `frontend-react/vite.banco.config.js`, `frontend-react/dist-banco/`
- **Evidencia del ensayo de restauración del 6-sep:**
  `docs/entidad/evidencias/ensayo-restauracion-20260906-1804.json`
- **Esta infraestructura de handoff, recién creada y SIN COMMITEAR:**
  `AGENTS.md`, `docs/AI_DECISIONS.md`, `docs/AI_WORKSTATE.md`

`frontend-react/.env.local` existe y **está ignorado por git**. Contiene
configuración local. **No leer, no copiar, no commitear.**

## FROZEN / DO NOT REOPEN

- **Saved Views 2.0 está cerrado.** No se reabre la arquitectura salvo
  regresión demostrada.
- Las decisiones congeladas están en [`AI_DECISIONS.md`](AI_DECISIONS.md)
  (D-01 … D-23) — **por referencia, no duplicadas aquí**. Las que más
  probablemente tiente reabrir: D-01/D-02 (linaje vs URN), D-07 (nunca
  `isolate([])`), D-09/D-10 (V1 no se reescribe), D-14 (señales, no
  temporizadores) y D-11 (V2 por defecto con el V1 todavía presente).
- Los **33 Red Lines históricos** y las **7 Saved Views V1** de producción son
  datos reales de obra: congelados.

## KNOWN BACKLOG — NON BLOCKING

Observaciones reales, ya conocidas y aceptadas. Ninguna bloquea nada.

1. **`test_capacidades_con_puerta` falla desde el 29-ago-2026.**
   `/api/docs/miniaturas/preparar` existe en el backend y ningún cliente lo
   llama: el botón «Preparar las que falten» se retiró a petición del
   propietario en `a78c267`, y la ruta se quedó. Se arregla borrando la ruta o
   declarándola en `SIN_PANTALLA` con su motivo. **Anterior a Saved Views 2.0**
   (`a78c267` es ancestro de `ae364dd`).
2. **Civil 3D auto-oculto.** `Viewer.jsx:915` oculta por palabra clave
   `['vista de secciones', 'section view', '02.09']` en cada
   `GEOMETRY_LOADED_EVENT`. Es un heurístico por nombre de capa, no una regla
   del modelo: puede ocultar de más en un modelo que use esos nombres para otra
   cosa.
3. **Retiro futuro de los enlaces legacy.** Hoy `ENLACES_LEGACY_HASTA=abierto`.
   Cerrarlo es una decisión de producto, no técnica: hay enlaces por `id` en
   correos y documentos de obra. Al cerrarse devolverán **410**.
4. **DR de copias anteriores a E-4D.** Restaurar una de esas copias deja
   `legacy_enlace` en su DEFAULT y las 7 vistas históricas dejan de ser legacy
   (D-23). Sin receta escrita todavía.
5. **`eslint` no es hoy una puerta usable.** `eslint.config.js` sólo ignora
   `dist`, así que `npx eslint .` lintea también `dist_old/`, `dist_apk/`,
   `dist_field/`, `dist-banco/` y `android/**` — bundles minificados. De ahí que
   dé **17.078 problemas** frente a **422** de `npx eslint src`.
6. **`npm run build` en sitio falla en esta máquina** con `EPERM` sobre
   `frontend-react/dist/assets` (build local viejo, del 29-jul, con un handle
   retenido por Windows). Es un problema **de esta máquina, no del código**: el
   build sí completa apuntando a otro `--outDir`. Render compila en un checkout
   limpio y no lo ve.

## CURRENT TASK

**NONE.**

## EXACT NEXT ACTION

**Esperar a que el propietario defina la siguiente funcionalidad.**

Hay una única cosa pendiente de su decisión, y no es desarrollo: los tres
ficheros de handoff (`AGENTS.md`, `docs/AI_DECISIONS.md`, `docs/AI_WORKSTATE.md`)
están **creados y sin commitear**, por instrucción expresa. Si autoriza el
commit, va **sólo** con esos tres ficheros y sin arrastrar nada de
EXPECTED WORKTREE.

## TEST / BUILD BASELINE

Todo medido el **6-sep-2026 sobre este mismo worktree**.

| Qué | Comando | Resultado real |
|---|---|---|
| Suite backend | `python -m pytest -q` | **1701 passed, 1 failed** en 120,9 s — el fallo es el del backlog nº 1, preexistente y ajeno a Saved Views |
| Capturador V2 | `node frontend-react/pruebas/capturarVistaV2.prueba.mjs` | **63 / 63** |
| Restaurador V2 | `node frontend-react/pruebas/restaurarVistaV2.prueba.mjs` | **150 / 150** |
| Contrato V2 | `node frontend-react/pruebas/savedViewV2.prueba.mjs` | **111 / 111** |
| Inventory config | `node frontend-react/pruebas/inventoryConfig.prueba.mjs` | **20 / 20** |
| Frente de vistas | `node frontend-react/pruebas/frenteDeVistas.prueba.mjs` | **20 / 20** |
| *(ajeno)* ViewerFacade | `node frontend-react/pruebas/viewerFacade.prueba.mjs` | **28 / 28** — banco untracked, trabajo ajeno al task actual: se anota, no se adopta |
| Ensayo HTTP de vistas V2 | `backend/herramientas/ensayo_de_vistas_v2.py` (base desechable) | **201 / 201** en su última ejecución, 6-sep |
| Build del visor | `npx vite build --outDir <fuera del repo> --emptyOutDir` | **✓ en 12,63 s.** Los *chunks* compartidos salen con el mismo hash que sirve producción (`vendor-BzrpNAyj`, `pdf-DNJrdseb`, `xlsx-BmGrHcps`); `index-*` difiere, y difiere **porque el worktree lleva los cambios sin commitear** |
| Lint del visor | `npx eslint src` | 422 problemas (381 errores, 41 avisos). **No es una puerta**, ver backlog nº 5 |

## PRODUCTION OPERATIONS

- **`ENLACES_LEGACY_HASTA = abierto`** en el servicio backend de Render. Se
  mantiene así por ahora. Cambiarlo es decisión del propietario.
- **`AUTH_POLICY_MODE = estricto`** en producción (en local se usa `sombra`).
- **Rollback**: se revierte el **código**, no las migraciones 29/30 (D-22). Las
  columnas nuevas son aditivas y no estorban al código anterior. Vía rápida sin
  desplegar: poner `VITE_SAVED_VIEWS_V2_RESTORE=false` y reconstruir el visor
  (D-11).
- **Copia verificada existente**: `D:/copias-ecd/produccion/ecd_20260906_230009`
  (`.copia.gz` + `.manifiesto.json`, formato `csv-por-tabla-v1`, tomada
  6-sep-2026 23:00 UTC). **Restaurada de verdad** en un clúster aislado →
  `RESTAURABLE`, 118 tablas, 86.284 filas, las 7 `saved_views` idénticas.
  Evidencia en `docs/entidad/evidencias/ensayo-restauracion-20260906-1804.json`.
  Anterior conservada: `ecd_20260904_214510`.
- **Despliegue**: Auto-Deploy **OFF** en los tres servicios. Publicar exige
  Manual Deploy en Render, y eso exige autorización explícita por acto.
- **Verificación obligatoria tras desplegar**: `GET /api/health` (dice el commit
  vivo). El frontend, además, por contenido del bundle servido — el panel de
  Render no es prueba suficiente.
- **Residuo local pendiente de instrucción**: el clúster desechable **detenido**
  del ensayo de restauración, en `scratchpad/verif/datos`
  (base `ecd_ensayo_20260906_180418`). No estorba; se borra cuando el
  propietario lo diga.
- **Nunca** se piden, leen ni escriben las contraseñas del propietario. DDL sólo
  como `ecd_migrator`, con el fichero de clave que jamás se imprime.

## HANDOFF RULE

Antes de terminar **cualquier** sesión:

1. Cerrar la **unidad mínima segura** — no dejar media refactorización.
2. **Pasar las pruebas** que toquen a lo cambiado, y anotar el resultado real.
3. **Commit GREEN**, o dejar un bloque `[WIP HANDOFF]` explícito (formato
   obligatorio en `../AGENTS.md § 8`) en este mismo fichero.
4. **Actualizar este fichero** con el estado nuevo.
5. Escribir **`EXACT NEXT ACTION`**: una acción concreta y ejecutable.
6. **STOP.**

> **WIP ≠ GREEN.**  **GREEN ≠ COMMITTED.**  **COMMITTED ≠ DEPLOYED.**

---

## DIVERGENCIAS ENCONTRADAS EL 6-SEP-2026

Diferencias reales entre repositorio, producción y lo que se daba por supuesto.
Se registran; **no se han tocado**.

### DIVERGENCIA 1 · El build local no es reproducible desde git

`frontend-react/src/components/Viewer.jsx` está modificado con
`import { registerViewerFacade } from '../aps/viewer/ViewerFacade'`, y ese
módulo **no existe en git**: `frontend-react/src/aps/viewer/` es untracked.

Consecuencias, medidas:

- `npm run build` en esta máquina compila **sólo porque el fichero untracked
  está en el disco**. Un checkout limpio de `3e413cd` produce un bundle
  distinto — y es ese, precisamente, el que sirve producción.
- Commitear `Viewer.jsx` tal como está **rompería el build de Render**: módulo
  no encontrado. Cualquier commit futuro que toque `Viewer.jsx` tiene que
  excluir esas 48 líneas, o esperar a que el propietario decida qué hacer con
  `ViewerFacade`.
- Producción **no está afectada**: `3e413cd` no menciona `ViewerFacade` (0
  coincidencias), y las marcas de Saved Views sí están.

### DIVERGENCIA 2 · La suite backend no está en verde absoluto

Se creía «todo verde». Son **1701 passed y 1 failed**. El fallo
(`test_capacidades_con_puerta`) es real, es del 29-ago-2026 y **no** lo
introdujo Saved Views. Backlog nº 1.

### DIVERGENCIA 3 · El lint no mide lo que parece

`npx eslint .` da 17.078 problemas y eso invita a concluir que el código está
podrido. No es cierto: ~12.400 vienen de bundles minificados en directorios de
build que la configuración no ignora. El código fuente da **422**. Backlog nº 5.

### DIVERGENCIA 4 · `npm run build` falla en sitio en esta máquina

`EPERM` sobre `frontend-react/dist/assets`, un build viejo del 29-jul-2026 con
un handle retenido. Es entorno local, no código. Backlog nº 6.
