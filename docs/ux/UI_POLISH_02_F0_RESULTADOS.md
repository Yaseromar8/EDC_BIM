# ALEPHIA · UI polish · F0 — resultados

16-sep-2026. Autorización del propietario: «ALEPHIA · UI POLISH — AUTORIZACIÓN F0». Alcance: QW1, QW3,
QW4, QW5, QW7 y T1. Antes del commit, «ALEPHIA · UI POLISH F0 — T2 AUTORIZADO ANTES DEL COMMIT»: corregir
el token canónico de foco, que el propio ensayo de F0 midió en 1,52:1 (§3.3 y §4). Revisada la evidencia,
el propietario dictaminó el 17-sep-2026 `F0 + T2 = CODE/TEST GREEN · PASS PARA COMMIT` y autorizó un único
commit. **Sin push, despliegue ni F1.** Diagnóstico de partida: `UI_POLISH_01_CONTRATO_DE_INTERACCION.md`.

Estado canónico de cierre:

```
F0                              = CODE/TEST GREEN
TOKEN T1                        = PASS
TOKEN T2 / FOCUS CONTRAST       = PASS
FOCUS WITH KEYBOARD             = PASS
PRESSED                         = PASS
ROW HOVER INSTANT               = PASS
ROW STATE TRANSITION LAG        = REMOVED
POSITION ANIMATION              = NOT PRESENT
FOCUS INSTANTANEITY .btn-*      = OBSERVED / DEFER TO F1
TRIPWIRES                       = 9 PASS · T7b PREEXISTING FAIL 3.903
WIP AJENO                       = INTACTO
```

Qué cubre cada línea y qué no:

- **FOCUS WITH KEYBOARD** se midió con Tab real. En casillas, primitivas `Button` y cuadros de edición, el
  anillo está entero en el primer fotograma.
- **FOCUS INSTANTANEITY .btn-\* = OBSERVED / DEFER TO F1**, por decisión del propietario. En
  `.btn-primary` y `.btn-secondary` el anillo llega a 3:1 a los 43–71 ms y se completa a los 147–157 ms,
  porque `.btn` tiene `transition: all 0.15s`, que no se cambia todavía. Antes de F0, esos botones
  mostraban el contorno del navegador, entero en la primera lectura. No bloquea el commit: supera 3:1 en
  43–71 ms, T2 pasa 30/30 y el problema está caracterizado y pertenece a F1 (§4.4).
- **TOKEN T2 / FOCUS CONTRAST:** 30 de 30 medidas ≥ 3:1 en píxeles y en los cuatro lados, sobre blanco,
  Mist, Navy, tema oscuro y la tabla de Archivos. Con el token anterior, 0 de 30 (§4.3). Sobre Navy el
  contraste lo da la banda de separación (12,31:1); la banda Signal sola da allí 2,28:1.
- **POSITION ANIMATION = NOT PRESENT:** la posición de las filas no se animaba ni antes de F0 (§3.1). Lo que
  F0 quita es el retraso de 400 ms del estado de la fila (fondo, selección, «procesando»): **ROW STATE
  TRANSITION LAG = REMOVED**.

## 1 · Qué cambió

| Fichero | Cambio |
|---|---|
| `frontend-docs/src/MatrixTable.jsx` | Fila: `transition: 'all 0.4s ease'` → `transition: 'none'` (QW1). |
| `frontend-docs/src/index.css` | `.adsk-spinner` con `--a-action-primary` en vez de `#000` (QW7). Bloque nuevo al final, «INTERACCIÓN CANÓNICA · UI POLISH F0»: foco visible canónico (QW3), pulsado de las familias de botón (QW4) y casilla con la paleta (QW5). |
| `design/alephia.tokens.css` | T1: `--a-state-hover` claro `neutral-100 → neutral-200`, oscuro `ink-700 → ink-500`. **T2:** `--a-focus-ring` en los dos temas → `0 0 0 2px var(--a-surface-base), 0 0 0 4px var(--a-action-text)` (§4). |
| `design/ui/Button.css` | Pulsado de la primitiva: `transform: translateY(1px)` → `translate: 0 1px` (mismo mecanismo que el portal); comentarios de hover puestos al día tras T1. |

**No se tocó:** `FilesPage.jsx` ni la barra lateral, navegación, menús, Reviews, Mi Trabajo, backend, el
visor 3D ni ningún fichero con WIP ajeno. Tampoco el hover fuera de identidad de `.btn-primary`
(`#4d6a8f`) ni los estados deshabilitados: quedan fuera de F0. **T2 cambia solo el valor del token:**
ninguna regla por componente, y siguen intactos `transition: all` de `.btn-*`, deshabilitado, menús,
navegación, Reviews, Mi Trabajo, el Tailwind por CDN y el backend. F1 no se ha empezado.

### Cómo se cumplieron las reglas

- **Pulsado sin pisar transforms:** propiedad CSS `translate`, independiente de `transform`, que se compone
  con él. Nadie usaba `translate` en el portal ni en `design/ui`, y el spinner gira con `transform`, así
  que no hay conflicto posible. Solo en las familias de **botón** (`.btn`, `.btn-icon`, `.toolbar-btn`,
  `.row-menu-btn`, `.adsk-btn`, `.btn-main-blue`…, `.modal-actions button`, `.inline-edit-box button`), con
  `:not(:disabled):not([aria-disabled="true"])`. Navegación, pestañas, árbol y opciones de menú, fuera.
- **Ningún `outline: none` sin reemplazo:** la regla de foco usa `:where(…):focus-visible` con
  `box-shadow: var(--a-focus-ring) !important`. El `!important` hace falta porque 45 de los 62
  `outline: none` van en línea en el JSX. El contorno queda transparente y no `none`, así sigue visible en
  el alto contraste de Windows. El cambio de nombre en línea lleva el anillo en el cuadro
  (`:focus-within`), no sobre el campo.
- **Un único anillo canónico:** todo el foco sale de `--a-focus-ring`; T2 lo corrige en el token, no en los
  componentes.
- **Sin hex nuevos:** todo con tokens. Tripwire T7b: 3.903 literales antes de F0, 3.903 después de F0 y
  3.903 después de T2. En un paso intermedio de F0 subió a 3.906 porque tres comentarios citaban colores en
  hex; se reescribieron.
- **Identidad ALEPHIA:** Navy (`--a-action-primary`), Signal (`--a-action-text`), `--a-state-hover`,
  `--a-focus-ring`, `--a-text-muted/secondary`, `--a-radius-sm`. Nada de ACC.

## 2 · Medición antes y después

Banco con los componentes **reales** (`MatrixTable` con react-window, `.btn-primary`/`.btn-secondary` del
portal, primitiva `Button`, casilla y `.adsk-spinner`) y **Tailwind por CDN igual que en producción**. Dos
construcciones del mismo banco: ANTES (árbol sin F0) y DESPUÉS. La entrada es real por CDP: ratón pulsado
sin soltar para `:active`, Tab de teclado para `:focus-visible` y puntero real para `:hover`.

La columna DESPUÉS es el árbol final, **con T2**. El mismo banco F0 repetido sobre él
(`F0_medicion_con_T2.json`) solo cambia en el anillo de foco: hover, pulsado, T1, casilla, spinner y filas
dan exactamente lo mismo que sin T2.

| Comprobación | ANTES | DESPUÉS |
|---|---|---|
| Hover de fila (fondo a 0 / 100 / 500 ms) | blanco / `rgb(251,252,253)` / final, con transición `background-color` de **400 ms** en curso | **final a los 0 ms**, sin animaciones (`getAnimations()` vacío) |
| Pulsado real `.btn-primary` | **0 px** (`:active` sí, sin regla) | **1 px** (`translate: 0 1px`, `transform: none`) |
| Pulsado real `.btn-secondary` | **0 px** | **1 px** |
| Pulsado real primitiva primary | 1 px (`transform`) | 1 px (`translate`) |
| Foco con Tab · `.btn-*` | contorno por defecto del navegador, entero en la primera lectura | anillo canónico de dos bandas: 3:1 a los 43–71 ms, entero a los 147–157 ms (§4.4) |
| Foco con Tab · casillas | anillo azul de Tailwind | anillo canónico, entero en el primer fotograma |
| Foco con Tab · primitivas | anillo canónico anterior (1,52:1) | anillo canónico de dos bandas, entero en el primer fotograma |
| T1 · hover real de la primitiva secundaria | fondo `#F3F6F8 → #F3F6F8` (**no cambia**) | fondo `#F3F6F8 → #E3E6EA` y borde `→ #CBD2D9` |
| Casilla marcada | azul de Tailwind | **Navy** `rgb(21,55,84)` |
| Casilla sin marcar · borde | gris de Tailwind (4,83:1) | `--a-text-muted` (4,95:1) |
| Casilla · hover real | sin cambio | fondo `--a-state-hover` y borde `--a-text-secondary` |
| Spinner | `#000` | Navy |
| Reordenar las filas | 0 posiciones intermedias; `background-color` 400 ms | 0 posiciones intermedias; **ninguna transición** |
| Insertar una fila | 0 posiciones intermedias; `filter`, `opacity` y `background-color` 400 ms | 0 posiciones intermedias; **ninguna transición** |
| Errores de página | 0 | 0 |

Evidencias en `docs/ux/evidencias/F0/`:

- `F0_galeria_antes_despues.png`: DEFAULT → HOVER → ACTIVE → FOCUS → DISABLED de los mismos componentes.
  HOVER, ACTIVE y FOCUS **forzados** clonando las reglas de estado a clases: la forma estándar de pintar
  una galería.
- `F0_estados_reales_antes_despues.png`: recortes con entrada **real** de pulsado, foco con Tab, hover de
  T1 y hover de fila.
- Las dos imágenes se tomaron **antes de T2**: el anillo que muestran en DESPUÉS es el token anterior. El
  anillo final está en `T2_foco_teclado_antes_despues.png`.
- `F0_medicion_antes.json` y `F0_medicion_despues.json`: los números de esta tabla, sin T2.
  `F0_medicion_con_T2.json`: el mismo banco sobre el árbol final.
- `T2_foco_teclado_antes_despues.png` y `T2_medicion.json`: T2, §4.

## 3 · Hallazgos durante F0

### 3.1 · La «animación de posición» del informe 01 no existía

`MatrixTable` usa `FixedSizeList` **sin `itemKey`**: cada fila se identifica por su índice y no se mueve al
reordenar o insertar, solo cambia de contenido. Medido: 0 filas con posición intermedia, antes y después.
Lo que sí se arrastraba 400 ms detrás del dato era **el fondo de selección, la opacidad y el filtro de
«procesando»**, y eso es lo que F0 elimina. `transition: 'none'` además garantiza que la fila no podrá
animar su posición si algún día la lista cambia de clave. El informe 01 queda corregido en ese punto.
Por eso el estado se da como `POSITION ANIMATION = NOT PRESENT` y `ROW STATE TRANSITION LAG = REMOVED`, y
no como una animación de posición retirada.

### 3.2 · La casilla casi desaparecía con el primer borde elegido

La primera versión usó `--a-border-strong`: **1,53:1** sobre blanco, por debajo del 3:1 que pide
WCAG 1.4.11 para el contorno de un control. Se vio en la galería. Corregido con `--a-text-muted`: 4,95:1
sobre blanco, 3,96:1 sobre el hover y 4,43:1 sobre una fila seleccionada. **Al canon le falta un «borde de
control» de 3:1**, el mismo hueco abierto que el botón secundario (hallazgo 1 del programa UX).

### 3.3 · Riesgo AA en el anillo de foco canónico: corregido con T2

| Indicador | Contraste sobre blanco |
|---|---|
| Contorno por defecto de Chrome (antes, en `.btn-*`) | 17,4:1 |
| Anillo de Tailwind (antes, en casillas) | 5,17:1 |
| `--a-focus-ring` anterior (Signal al 30 %) | **1,52:1** |
| **`--a-focus-ring` con T2** (dos bandas) | **5,40:1** |

F0 hizo el foco **coherente**, pero con un token que **no llegaba al 3:1 de WCAG 1.4.11**, que también se
aplica a los indicadores de estado. El propietario autorizó T2 antes del commit de F0; está aplicado y
medido en §4.

### 3.4 · El anillo tarda unos 150 ms en completarse en `.btn-*`

`.btn { transition: all 0.15s }` también anima la sombra. Con T2 el anillo llega a 3:1 a los 43–71 ms y se
completa a los 147–157 ms (§4.4). En las primitivas, las casillas y los cuadros de edición aparece entero al
instante. `transition: all` de `.btn-*` no se toca en F0 ni en T2 por orden expresa. Cambiar `all` por una
lista explícita sin `box-shadow` es de F1, y haría el anillo inmediato también ahí. Queda registrado como
`FOCUS INSTANTANEITY .btn-* = OBSERVED / DEFER TO F1`.

### 3.5 · Deshabilitado: sigue sin estado en `.btn-*` y en la casilla

En la galería, DISABLED se ve igual que DEFAULT en `.btn-primary`, `.btn-secondary` y la casilla. Las
primitivas sí lo tienen. Queda para F2 con el token `--a-opacity-disabled`: hoy hay 7 opacidades distintas.

### 3.6 · Tailwind Play CDN en producción

`frontend-docs/index.html:18` carga `https://cdn.tailwindcss.com?plugins=forms,container-queries`. Ese
script **compila en el navegador**, vigila el DOM y reinyecta sus estilos, que se colocan **después** de los
del portal. Tailwind no lo recomienda para producción. Es la fuente del azul de las casillas y obliga a
ganar por especificidad. Retirarlo o compilarlo en el build es un frente aparte, con su propia medición de
rendimiento.

## 4 · T2 · anillo de foco con contraste suficiente

Orden del propietario: corregir el token canónico para que el indicador sea claramente visible y cumpla
≥ 3:1 en las superficies relevantes, con un único anillo canónico, sin soluciones por componente, y
verificarlo con Tab real.

### 4.1 · El cambio

| Tema | Antes | Después |
|---|---|---|
| Claro | `0 0 0 3px rgb(var(--a-blue-600-rgb) / .30)` | `0 0 0 2px var(--a-surface-base), 0 0 0 4px var(--a-action-text)` |
| Oscuro | `0 0 0 3px rgb(var(--a-blue-400-rgb) / .45)` | la misma expresión: resuelve a ink-900 por dentro y blue-400 por fuera |

Dos bandas de 2 px: por dentro, el color de la superficie base; por fuera, `--a-action-text` (Signal en
claro). Sobre superficies claras contrasta la de fuera; sobre Navy, la de dentro. El control queda dentro de
las dos, así que el anillo no depende de su color: botón Navy, secundario blanco o casilla marcada dan la
misma cifra. Es un valor por tema y ningún componente tiene regla propia.

Quién usa el token: el foco canónico del portal (`index.css`, `:where(…):focus-visible`), el cuadro de
edición en línea (`.inline-edit-box:focus-within`) y las primitivas de `design/ui` (Button, Field, Modal y
Overlay), que hoy no importan ni el portal ni el visor.

### 4.2 · Cómo se midió

- El banco de F0, construido con el token anterior (ANTES) y con T2 (DESPUÉS), con los componentes reales y
  Tailwind por CDN.
- Cuatro paneles: blanco (`--a-surface-base`), Mist (`--a-neutral-100`), Navy (`--a-action-primary`) y tema
  oscuro. En cada uno, `.btn-primary`, `.btn-secondary`, casilla, casilla marcada y la primitiva `Button`
  primary y secondary.
- La tabla de Archivos real (`MatrixTable`): casilla de la cabecera, de una fila, de una fila con el puntero
  encima y de la fila seleccionada, más los cuadros de renombrar y de descripción, que van dentro de celdas
  con `overflow: hidden`.
- **Entrada real:** Tab por CDP desde un clic en zona vacía, con `:focus-visible` comprobado en cada medida.
  Los cuadros de edición se abren con clic real en el lápiz y en la celda, como en el producto.
- **Contraste en píxeles** de la captura, no en el CSS. En el punto medio de los **cuatro lados** se toman
  los píxeles a 1–4 px del borde y la superficie más allá. Puerta en cada lado: ≥ 3:1 contra la superficie
  y, si hay dos bandas, ≥ 3:1 entre ellas. Un lado que falle con los otros bien delataría un anillo
  recortado.
- **Inmediatez:** el `box-shadow` calculado en cada fotograma durante 260 ms desde el foco, convertido a
  contraste efectivo sobre la superficie medida.

### 4.3 · Resultado

| Superficie | Medidas | ANTES (token anterior) | DESPUÉS (T2) |
|---|---|---|---|
| Blanco | 6 componentes | 1,53:1 · 0/6 | **5,40:1 · 6/6** |
| Mist | 6 componentes | 1,50:1 · 0/6 | **4,98:1 · 6/6** |
| Navy | 6 componentes | 1,27:1 · 0/6 | **12,31:1 · 6/6** (la banda Signal sola, 2,28:1) |
| Tema oscuro | 6 componentes | 2,32:1 · 0/6 | **7,10:1 · 6/6** |
| Tabla · cabecera | casilla | 1,50:1 | **4,95:1** |
| Tabla · fila | casilla | 1,53:1 | **5,40:1** |
| Tabla · fila con el puntero encima | casilla | 1,50:1 | **4,98:1** |
| Tabla · fila seleccionada | casilla marcada | 1,49:1 | **4,81:1** |
| Tabla · renombrar | cuadro de edición | 1,46:1 | **4,85:1** |
| Tabla · descripción | cuadro de edición | 1,33:1 | **4,40:1** |
| **Total** | **30** | **0/30** | **30/30**, ningún lado recortado, 0 errores de página |

La cifra es el mínimo de los cuatro lados. Entre las dos bandas: 5,40:1 en claro y 7,10:1 en oscuro.

### 4.4 · Inmediatez

| Componente | ≥ 3:1 | Anillo entero |
|---|---|---|
| Casillas, primitivas `Button`, cuadros de edición | primer fotograma (0–3 ms) | primer fotograma |
| `.btn-primary`, `.btn-secondary` | 43–71 ms | 147–157 ms |

`.btn-*` en dos pasadas limpias (ms hasta 3:1, pasada 1 / pasada 2):

| Superficie | `.btn-primary` | `.btn-secondary` |
|---|---|---|
| Blanco | 66 / 66 | 64 / 64 |
| Mist | 67 / 70 | 71 / 67 |
| Navy | 50 / 43 | 51 / 51 |
| Tema oscuro | 56 / 52 | 57 / 57 |

Hubo una pasada anterior en la que un parón de render de Chrome sin ventana dejó una medida con solo 2
fotogramas. Por eso se repitió dos veces; ninguna de las dos tuvo parones.

La causa es `.btn { transition: all 0.15s }`, que la orden de T2 excluye. Antes de F0, estos dos botones
mostraban el contorno del navegador (17,4:1) entero en la primera lectura tras el Tab. Con F0 y T2 el
anillo es el canónico, pero en ellos crece con la transición.

**Decisión del propietario (17-sep-2026):** `transition: all 0.15s` no se cambia todavía. El retraso queda
registrado como `FOCUS INSTANTANEITY .btn-* = OBSERVED / DEFER TO F1` y no bloquea el commit de F0: el
anillo supera 3:1 en 43–71 ms, T2 pasa 30/30 y el problema está caracterizado. El arreglo previsto para F1
es cambiar `all` por una lista sin `box-shadow`.

### 4.5 · Lo que T2 no resuelve

- La inmediatez en `.btn-*` (§4.4).
- T9 sigue avisando, desde antes de F0 y fuera de su enmienda, de que el borde del botón secundario da
  1,25:1 en claro y 1,35–1,61:1 en oscuro. Es el mismo hueco del «borde de control» de §3.2, para F2.

## 5 · Pruebas ejecutadas

| Prueba | Resultado |
|---|---|
| `python design/tripwires.py` antes de F0 | 9 PASA · T7b FALLA 3.903 (base 3.801, deuda previa) |
| `python design/tripwires.py` después de F0 | **idéntico**: 9 PASA · T7b FALLA 3.903 |
| `python design/tripwires.py` después de T2 | **idéntico**: 9 PASA, entre ellos T4a-1, T4a-2 y T9 · T7b FALLA 3.903 |
| `python design/tripwires.py --autoprueba` | 5/5 violaciones provocadas detectadas y fuente restaurada, después de F0 y después de T2 |
| ESLint `MatrixTable.jsx` frente a HEAD | 1 mensaje antes, 1 después, ninguno nuevo (T2 no toca JS) |
| `npm test` (frontend-docs) | 10 bancos en verde, después de F0 y después de T2 |
| Banco F0 (tabla real + botones + casilla + spinner), antes y después | tabla del §2, 0 errores de página |
| Banco F0 repetido sobre el árbol con T2 | idéntico salvo el anillo de foco; 0 errores de página |
| Banco T2 (Tab y clic reales, píxeles, cuatro lados), token anterior y T2 | 0/30 → 30/30; `.btn-*` en tres pasadas; 0 errores de página |
| WIP ajeno (`sha256sum -c`) | 7/7 OK después de F0 y después de T2 |

## 6 · Pendiente

- **Push y despliegue:** no autorizados. Lo autorizado el 17-sep-2026 es un único commit de F0 con T2.
- **F1** no está autorizado ni empezado. Candidatos: `transition: all` en `.btn`
  (`FOCUS INSTANTANEITY .btn-* = OBSERVED / DEFER TO F1`: sin `box-shadow` en la lista, el anillo sería
  inmediato también en `.btn-*`), el hover de `.btn-primary` fuera de identidad y una sola definición de
  fila, árbol y menú contextual.
- **F2:** `--a-opacity-disabled` y un «borde de control» de 3:1 en el canon.
- **Frente aparte:** Tailwind Play CDN.
