# AGENTS.md — contrato de trabajo para agentes en este repositorio

Para cualquier agente (Claude, Codex u otro) que abra `EDC_BIM`. Es **corto a
propósito**: aquí van las reglas permanentes, no la historia. El estado de hoy
vive en [`docs/AI_WORKSTATE.md`](docs/AI_WORKSTATE.md) y las decisiones cerradas
en [`docs/AI_DECISIONS.md`](docs/AI_DECISIONS.md).

---

## 1 · Qué es ALEPHIA View

Entorno Común de Datos (CDE) para obra pública peruana, de ALEPHIA. Dos
productos sobre un backend:

- **ALEPHIA Docs** — el portal documental (`frontend-docs`), en `alephia.com.pe`.
- **ALEPHIA View** — el visor 3D/BIM (`frontend-react`), en `visor.alephia.com.pe`.
  Es una SPA React 19 + Vite 7, **sin router**, sobre el **Autodesk Viewer (LMV) 7.x**
  cargado por CDN. Federa varios modelos APS a la vez. Aquí viven Saved Views,
  Inventory, filtros, temas de color, 4D/5D (LOB), Predict y AR.

Un modelo APS tiene **URN** (identifica una *versión*) y **linaje** (identifica el
*documento*, estable entre versiones). Esa distinción gobierna casi todo lo
persistido — ver `docs/AI_DECISIONS.md`.

## 2 · Arquitectura, lo justo para orientarse

| Pieza | Dónde | Qué es |
|---|---|---|
| Backend | `backend/` | Flask + Gunicorn, PostgreSQL (Cloud SQL). Blueprints en `backend/routes/`. |
| Esquema | `backend/bootstrap_esquema.py` **+** `backend/sql/NN_*.sql` | El esquema es **código MÁS migraciones**. Ninguna mitad basta sola. |
| Visor | `frontend-react/` | Ver `frontend-react/ARQUITECTURA.md` (98 módulos, 89 endpoints, bus de ~80 eventos). **Léelo antes de tocar el visor.** |
| Portal | `frontend-docs/` | React + Vite, estático. |
| Despliegue | `deploy/render.yaml` (registro, **no** Blueprint aplicado) y `deploy/RECUPERACION.md` | Tres servicios en Render, todos desde `main`, **Auto-Deploy OFF en los tres**. |
| Identidades DB | `backend/ARRANQUE.md` | `ecd_migrator` hace DDL; `ecd_app` sólo datos. No se mezclan. |

## 3 · Comandos

```bash
# Backend — suite oficial, sin base de datos (fail-closed vía backend/tests/conftest.py)
python -m pytest -q
```

```bash
# Visor — bancos de pruebas: son scripts node, uno por módulo
node frontend-react/pruebas/capturarVistaV2.prueba.mjs
node frontend-react/pruebas/restaurarVistaV2.prueba.mjs
node frontend-react/pruebas/savedViewV2.prueba.mjs
node frontend-react/pruebas/inventoryConfig.prueba.mjs
node frontend-react/pruebas/frenteDeVistas.prueba.mjs
```

```bash
# Build del visor
cd frontend-react && npm run build
```

```bash
# Lint del visor — NO es una puerta hoy, ver AI_WORKSTATE
cd frontend-react && npx eslint src
```

`pytest` a secas ya apunta sólo a `backend/tests`. Los guiones
`backend/herramientas/ensayo_*.py` son **ensayos contra base real desechable**,
no pytest: no los lances contra producción.

> ⚠️ En la raíz hay ~28 ficheros `test_*.py` que **no son pruebas**: son guiones
> de diagnóstico que escriben en la base real al importarse. `pytest.ini` y
> `conftest.py` los mantienen fuera. No los ejecutes ni relajes esa protección.

## 4 · Reglas que no se negocian

### 4.1 · Nada sale de esta máquina sin autorización

**NO `git push`. NO deploy. NO Manual Deploy en Render. NO tocar producción.**
Cada uno de esos actos requiere autorización **explícita y por acto** del
propietario. Una autorización pasada no cubre la siguiente.

### 4.2 · Producción

- Se verifica, no se supone: `GET /api/health` dice el commit vivo, la rama y
  cuántos puntos de la postura de seguridad faltan. Es la única fuente fiable.
- Auto-Deploy está **OFF** en los tres servicios: un push **no publica nada**.
- Cloudflare cachea `index.html` ~5 min: no juzgues un cambio de frontend antes.
- Nunca leas, escribas, pidas ni registres contraseñas del propietario. Las
  credenciales las introduce él, en su navegador, personalmente.
- Secretos: en el repositorio sólo van **nombres**, jamás valores.

### 4.3 · Migraciones

- Viven en `backend/sql/NN_*.sql`, se numeran de forma correlativa y **se aplican
  a mano** como `ecd_migrator`, antes de desplegar el código que las necesita.
- **Aditivas por defecto**: columnas nuevas con `DEFAULT`, nunca un `DROP` de algo
  que tenga datos.
- Cada migración lleva su `NN_*_rollback.sql`, pero **el rollback normal de un
  despliegue es revertir el código, no la migración**.
- No hay tabla de migraciones aplicadas: se verifica por forma del catálogo.
- No uses `postgres` por comodidad. DDL sólo como `ecd_migrator`.

### 4.4 · Trabajo CLOSED

Lo marcado **CLOSED** en `docs/AI_WORKSTATE.md` no se reabre, no se «mejora» y no
se refactoriza de paso. Sólo se reabre por **regresión reproducible**, requisito
nuevo autorizado por el propietario, o evidencia que invalide la premisa
original. Las mismas tres puertas que `docs/AI_DECISIONS.md`.

### 4.5 · Honestidad de resultados

Si una prueba falla, **repórtala**. No adaptes los datos, el umbral ni el caso
para que pase. Si una medición real no aparece en una ejecución, di los tiempos
que sí mediste — no fabriques el resultado.

## 5 · El worktree está sucio, y es lo normal

Este repositorio **siempre** tiene ficheros modificados y untracked que **no son
del trabajo en curso**: cambios 4D/LOB en vuelo del propietario, respaldos
`.bak.*`, ficheros de obra (XLSX/XML/PDF), guiones sueltos y módulos que son
**trabajo ajeno al task actual**. La lista exacta y esperada está en
`docs/AI_WORKSTATE.md → EXPECTED WORKTREE`.

Por lo tanto:

- **Nunca** `git add -A`, `git add .`, `git commit -a`, `git clean`,
  `git checkout -- .` ni `git reset --hard`. Se commitea **por lista explícita de
  ficheros**.
- **Nunca `git stash`.** En este repositorio convirtió ficheros de LF a CRLF y
  hubo que repararlos a mano. Si necesitas aislar cambios, usa otra vía.
- Si aparece algo que **no está** en EXPECTED WORKTREE: no lo borres, no lo
  añadas, no lo commitees. Anótalo y pregunta.
- Finales de línea: `core.autocrlf = true` y **no hay `.gitattributes`**. En el
  disco los ficheros de texto son CRLF; en git se guardan **LF**. Lo que no debe
  ocurrir nunca es que un CR entre en el objeto de git: se nota porque
  `git diff --stat` muestra un fichero **reescrito entero**. Si lo ves, para.

## 6 · Ficheros protegidos — no tocar sin autorización explícita

| Fichero / ruta | Motivo |
|---|---|
| `frontend-react/src/aps/extensions/LOB4DExtension.js` | trabajo 4D en vuelo del propietario |
| `frontend-react/src/components/ViewerLabelsBar.jsx` | ídem |
| `frontend-react/src/lib/predictBim.js` | ídem |
| `frontend-react/src/components/lob4d/*` | ídem |
| `frontend-react/src/aps/viewer/` (`ViewerFacade.js`, `README.md`) | **trabajo ajeno al task actual / protegido**: no añadir, no borrar, no modificar, no incluir en ningún commit |
| `frontend-react/pruebas/viewerFacade.prueba.mjs` | banco del anterior; mismas condiciones |
| `.env*` (incluido `frontend-react/.env.local`) | secretos: ni leer ni commitear |
| `D:/copias-ecd/**` | copias y claves; nunca imprimir su contenido |
| Los 33 *Red Lines* históricos y las 7 Saved Views V1 de producción | datos reales de obra: congelados |

`frontend-react/src/components/Viewer.jsx` **sí es editable**, pero hoy contiene
cambios ajenos sin commitear — lee EXPECTED WORKTREE antes de tocarlo.

## 7 · Commits

- Formato `tipo(ámbito): asunto`, en imperativo, minúscula, sin punto final.
  Tipos observados: `feat`, `fix`, `perf`, `docs`, `chore`, `refactor`, `build`.
- El **cuerpo importa más que el asunto**: qué problema resuelve, por qué así, y
  la **evidencia medida** (casos de prueba, tiempos, conteos). Los commits de este
  repositorio explican; no son changelogs de una línea.
- **Autoría: no se fabrica.** Este repositorio lo trabajan varios agentes.
  - **No** añadas un `Co-Authored-By:` fijo ni ningún *trailer* de atribución
    por defecto.
  - Atribuir al agente real **sólo** si existe una política explícita del
    propietario que lo diga, y con el formato que esa política indique.
  - Si no la hay: **ninguna atribución automática**. El autor del commit es
    quien configure git.
- Lista explícita de ficheros. Nunca arrastres nada de la sección 6.
- **Commitear no es desplegar.** Ver 4.1.

## 8 · Formato obligatorio de traspaso: `[WIP HANDOFF]`

Todo cierre de sesión sin trabajo terminado se escribe con este bloque, en
`docs/AI_WORKSTATE.md`, íntegro y sin campos vacíos:

```
[WIP HANDOFF]
TAREA:                qué se estaba haciendo, en una línea
IMPLEMENTADO:         lo que YA funciona y está probado
PENDIENTE:            lo que falta, en orden
ARCHIVOS MODIFICADOS: rutas exactas, separando las mías de las ajenas
TESTS EJECUTADOS:     comando + resultado real (n/n)
TESTS PENDIENTES:     los que no se corrieron, y por qué
FALLO CONOCIDO:       el que existe hoy; «ninguno» sólo si se comprobó
NEXT EXACT ACTION:    una acción concreta, ejecutable, sin ambigüedad
DO NOT TOUCH:         lo que el siguiente agente no debe rozar
COMMIT/HEAD REF:      git rev-parse HEAD en el momento de escribirlo
```

Y las tres equivalencias que nadie debe confundir:

> **WIP ≠ GREEN.**  **GREEN ≠ COMMITTED.**  **COMMITTED ≠ DEPLOYED.**

## 9 · TAKEOVER — protocolo de toma de relevo (obligatorio)

El estado **no** se verifica comparando el HEAD actual con un hash escrito en un
fichero: ese hash sería autorreferencial —el fichero vive dentro del commit que
nombraría— y además todo commit documental daría falsa divergencia. Lo que se
verifica es **ascendencia** del baseline funcional.

**A · Leer**

1. Este `AGENTS.md`.
2. `docs/AI_WORKSTATE.md`, y de él **`CODE BASELINE HEAD`** (el último commit
   funcional desplegado).
3. Sólo los documentos que AI_WORKSTATE enlace. Nada más.

**B · Ejecutar**

```bash
git status --short
git rev-parse HEAD
git log --oneline -10
git merge-base --is-ancestor <CODE_BASELINE> HEAD   # salida 0 = es ancestro
```

**C · Verificar las cuatro cosas**

1. El **baseline es ancestro** del HEAD actual.
2. **Todo commit posterior al baseline es compatible con lo declarado** en
   AI_WORKSTATE (hoy: sólo commits documentales de infraestructura de handoff).
3. El **worktree coincide con `EXPECTED WORKTREE`**.
4. **`CURRENT TASK` / `[WIP HANDOFF]` coincide** con lo que se encuentra.

**Si las cuatro se cumplen → `STATE MATCH`.** Continuar por `EXACT NEXT ACTION`.

**Si aparece cualquiera de estas → `STATE DIVERGENCE` y STOP:**

- un **commit funcional no documentado** por encima del baseline;
- un **fichero modificado que no está previsto** en EXPECTED WORKTREE;
- la **rama es otra** distinta de la esperada;
- el **baseline no es ancestro** del HEAD (rebase, reset, force-push, otra rama).

STOP significa: no escribas, no commitees, no despliegues. Informa al propietario
de la diferencia **exacta** —qué commit, qué fichero, qué rama— y espera
instrucción.

Antes de terminar una sesión: cerrar la unidad mínima segura, pasar las pruebas,
commitear GREEN o dejar un `[WIP HANDOFF]` explícito, **actualizar
`docs/AI_WORKSTATE.md`**, escribir `EXACT NEXT ACTION`, y parar.
