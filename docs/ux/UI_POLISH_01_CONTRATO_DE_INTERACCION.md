# ALEPHIA · UI polish · contrato de interacción frente a ACC

16-sep-2026. **Solo análisis: no se ha implementado nada.** Alcance pedido: interacción y
presentación de lo que ya existe en el portal (Docs), sin funciones nuevas, sin tocar backend
ni reglas de negocio. Áreas: Archivos, Revisiones, Mi Trabajo, navegación principal, menús y
paneles.

Secuencia de referencia: `DEFAULT → HOVER → ACTIVE → SELECTED → ACTION → LOADING → SUCCESS / ERROR`.
Clasificación: `OK` · `INCONSISTENT` · `WEAK` · `MISSING STATE` · `NEEDS POLISH`.

## En corto

- **ACC no gana por tener menos valores, sino por tener un valor canónico por estado y usarlo
  en todas partes.** De sus 2.120 reglas CSS: hover de fondo `#F6F6F6` en 19 reglas, halo de
  hover de 2 px en 22, halo de pulsado de 4 px en 21, anillo de foco azul de 2 px en 18.
  ALEPHIA tiene 37 fondos de hover distintos y ninguno dominante.
- **Los estados que faltan en ALEPHIA son el pulsado y el foco.** Reglas `:active`: ACC 145,
  ALEPHIA 4. Reglas de foco: ACC 176, ALEPHIA 24. En el código hay 62 `outline: none`.
- **La base ya existe y no se usa.** ALEPHIA tiene tokens de estado, escala tipográfica de 8
  roles, 10 capas de z-index y cinco primitivas (`design/ui/`, UX-08) con hover, pulsado, foco,
  deshabilitado y carga. **Ningún fichero del portal importa esas primitivas**, y los tokens de
  hover, seleccionado, foco, movimiento y sombra no se usan directamente ni una vez.
- **El hover no puede existir en lo que se pinta en línea.** 246 elementos clicables llevan el
  cursor de mano en `style={{…}}`, y un estilo en línea no tiene `:hover`. Así están la lista
  de Revisiones, Mi Trabajo y la barra lateral de navegación.
- **Quick win número uno de rapidez percibida:** cada fila de Archivos lleva en línea
  `transition: 'all 0.4s ease'` (`MatrixTable.jsx:346`). El hover tarda 0,4 s (en ACC es
  instantáneo), y al reordenar o insertar, el fondo de selección, la opacidad y el filtro de
  «procesando» se arrastran 400 ms detrás del dato. *(Corregido en F0: la posición de las filas
  NO se animaba; la lista identifica filas por índice. Ver `UI_POLISH_02_F0_RESULTADOS.md` §3.1.)*
- **Un defecto del propio canon:** `--a-state-hover` y `--a-action-secondary` resuelven al mismo
  hex en los dos temas, así que el hover del botón secundario no se ve (lo documenta la propia
  primitiva `design/ui/Button.css`).
- **Recomendación:** no crear un sistema paralelo. Corregir ese token, completar los tokens de
  estado que faltan, aplicar siete quick wins (casi todos de CSS) y luego adoptar las primitivas
  por superficie, en el orden del §8.

## 1 · Cómo se midió

- **ACC** (Archivos y Revisiones de PQT8): se leyeron en vivo las 2.120 reglas CSS de 46 hojas
  y se contaron los valores por estado. Se midieron con puntero real (CDP) la fila de tabla, los
  botones, la casilla, el menú ⋮, la selección y el hover de las opciones del menú. La carga se
  observó con un `MutationObserver` al cambiar de pestaña (Revisiones → archivadas).
- **ALEPHIA:** 856 reglas CSS en vivo, medidas igual, más un censo del código de
  `frontend-docs/src` sin los bancos (`probar-*`). En vivo: fila, menú contextual y selección.
- **No se tocó ningún dato.** Incidencia: al calibrar las coordenadas en ACC, dos clics cayeron
  donde no debían y **reordenaron la tabla y marcaron filas**. Se deshizo y se comprobó que el
  orden y la selección quedaron como al principio.
- **Límites** en el §9.

## 2 · El contrato de ACC — lo que hay que extraer, no copiar

| Estado | ACC, medido |
|---|---|
| DEFAULT | Controles de **36 px**, radio **2 px**, texto `#3C3C3C` 14 px/600 (Artifakt Element). Filas de **48 px**, 14 px/500. |
| HOVER | Filas y opciones de menú: fondo `#F6F6F6`, **instantáneo**. Botones y casillas: halo `0 0 0 2px rgba(128,128,128,.15)`. |
| ACTIVE (pulsado) | Halo que crece a `0 0 0 4px rgba(128,128,128,.25)` y borde `#999`; en el primario, además, fondo más oscuro. |
| FOCUS | Anillo `0 0 0 2px rgba(6,150,215,.35)`; `outline: none` solo cuando hay anillo. |
| SELECTED | Fila: el mismo gris del hover y borde inferior `#EEE` interior; casilla rellena de azul. En otros componentes, tinte azul claro `rgba(205,234,247,.35)`. |
| ACTION | Al seleccionar, **«Compartir» y un ⋮ aparecen en la misma barra**, junto a «Cargar», y un contador «2 de 6 seleccionados» en el pie. |
| LOADING | **Anillo de progreso de 64 px a los 140 ms**, barra fina de 4 px a los 775 ms; la cabecera y la barra no se mueven. En lo observado, sin esqueletos. |
| DISABLED | `opacity: var(--opacity-disabled)` y texto `#999`: un único token. |

Menú ⋮ de fila: 300 px, radio 4 px, sombra doble con tinte azul marino
(`0 4px 14px rgba(12,44,84,.15), 0 0 2px rgba(12,44,84,.25)`), sin borde, **opciones de 36 px**,
14 px/500, hover `#F6F6F6`, sin separadores. **ACC tampoco declara roles ARIA** en ese menú.

### Los principios que valen para ALEPHIA

1. **Un valor canónico por estado**, aplicado por componentes y no a mano.
2. **Todo lo clicable responde al hover**, filas y opciones de menú incluidas.
3. **Pulsar se nota.**
4. **El foco de teclado se ve siempre**; nunca `outline: none` sin reemplazo.
5. **El hover de las filas es instantáneo.** Las transiciones, solo en halos y bordes (200–300 ms).
6. **Una altura por tipo de control:** controles (36), filas (48), opciones de menú (36).
7. **Seleccionar no cambia de pantalla:** acciones en la misma barra y un contador.
8. **Un solo indicador de carga**, que aparece enseguida y sin mover lo que ya está pintado.

Lo que **no** se copia: la tipografía Artifakt, el azul `#0696D7` y el radio de 2 px son de ACC.
ALEPHIA conserva Inter, su paleta Navy/Signal y su propio mecanismo de estados. Lo que se copia
es que ese mecanismo **exista para todos los estados y se aplique igual en todas partes**.

## 3 · Inventario de ALEPHIA por área

### 3.1 Archivos

| Patrón | ALEPHIA hoy (medido) | ACC | Clase |
|---|---|---|---|
| Hover de fila | `.data-row` definido **dos veces** (`#f5f5f5` en `index.css:792`, `var(--bg-hover)` en `:1202`) y `transition: all .4s` en línea | `#F6F6F6` instantáneo | `NEEDS POLISH` · `INCONSISTENT` |
| Fila seleccionada | Azul claro `#EDF3F8`, con `!important` en dos reglas distintas (`:796` y `:1206`) | Gris del hover + casilla azul | `INCONSISTENT` (el color vale; la doble definición, no) |
| Casilla | Marcada en **`#2563EB`** (azul de Tailwind, fuera de la paleta); sin hover ni foco diseñados | Halo, anillo y relleno de marca | `INCONSISTENT` · `MISSING STATE` |
| ⋮ de fila | **Fuera de la vista**: la tabla mide 2167 px en una ventana de 2048. `.td-frozen-right` existe en CSS (`:806–824`) y la celda de acciones no lo usa | Siempre visible | `WEAK` |
| Menú contextual | `.row-context-menu` definido **dos veces** (sombra .15 frente a .2, z-index 10002 frente a 10000, 13,5 frente a 13 px) y un `.row-action-menu` distinto. Medido: 220 px, opciones de **40 px y una de 59**, hover `#F3F3F3`, sin roles, **no cierra con Escape**, el foco no entra | 36 px regulares, hover canónico | `INCONSISTENT` · `MISSING STATE` |
| Árbol de carpetas | `.folder-tree-item` definido **dos veces** (35 px/14 px frente a `8px 16px`/13 px; hover `rgba(95,127,163,.08)` frente a `#f5f5f5`) | Fila gris con ⋮ en la seleccionada | `INCONSISTENT` |
| Barra de acciones | Acciones de la selección en la misma barra: **bien**. Pero conviven alturas de 32, 34, 30 y 24 px y radios de 0, 4 y 5 | 36 px y 2 px en todo | `OK` en patrón · `INCONSISTENT` en medidas |
| Botones | 17 clases de botón (`btn-primary`, `btn-main-blue`, `acc-btn-primary-2`, `toolbar-btn`…). Hover del primario `#4d6a8f`, fuera de la identidad. Sin pulsado. En la pantalla, 31 de 39 botones llevan estilo en línea | Un contrato | `INCONSISTENT` · `MISSING STATE` |
| Cambio de nombre en línea | Borde de acento fijo, radio 2 px, botones de 24 px, hover del «aceptar» `#4d6a8f` | — | `NEEDS POLISH` |
| Carga en fila | `.adsk-spinner` **negro** (`#000`), reducido a 14 px en línea | Anillo de marca | `WEAK` |
| Avisos | react-hot-toast abajo a la derecha con estilos por defecto (312 llamadas en el portal) | — | `NEEDS POLISH` |

### 3.2 Revisiones

| Patrón | ALEPHIA hoy | ACC | Clase |
|---|---|---|---|
| Lista | Tarjetas `<button>` con estilo en línea (radio 8, borde `#e8e8e8`, `ReviewsModule.jsx:550`): **sin hover, sin pulsado y sin foco diseñado** | Tabla de 48 px con hover | `MISSING STATE` |
| Chips de estado | Radio 12, 11 px/700, colores literales (`#e0ecff`/`#1a56a8`, `TONO_DE_LISTA`) | Texto de estado en mayúsculas | `INCONSISTENT` (fuera de los tokens `--a-status-*`) |
| Modal «Crear» | Botones en línea; mientras guarda, solo `opacity: .6`, sin indicador dentro del botón | — | `WEAK` (la primitiva `Button` ya trae `cargando`) |
| Cerrar «×» | En línea, `#999`, sin `aria-label` y sin hover | — | `WEAK` |
| Carga | Texto «Cargando» | Anillo único | `WEAK` |
| Dispersión | 77 estilos en línea, 87 colores literales, 42 tamaños de letra y 21 radios en `ReviewsModule.jsx` | — | `INCONSISTENT` |

### 3.3 Mi Trabajo

| Patrón | ALEPHIA hoy | Clase |
|---|---|---|
| Filas y botón «Abrir» | Objeto de estilos en línea (`S.fila`, `S.boton`…): sin hover, foco ni pulsado | `MISSING STATE` |
| Vacío, error y carga | Existen los tres y el texto es claro («No tienes nada pendiente.»), pero son solo texto con `opacity: .55` | `OK` en contenido · `WEAK` en forma |
| Contador | Presente | `OK` |

ACC no tiene un «Mi Trabajo» equivalente que se haya medido: ver el §9.

### 3.4 Navegación principal

| Patrón | ALEPHIA hoy | Clase |
|---|---|---|
| Barra lateral | Botones en línea (`FilesPage.jsx`, alrededor de la línea 745). Activo: `#eef2f7`, acento y 500. Inactivo: **`#5f6368`**, un gris de Google fuera de los tokens. Radio `0 20px 20px 0`. **Sin hover ni foco** | `MISSING STATE` · `INCONSISTENT` |
| Tooltips | `title` nativo en 110 sitios: retardo del navegador, sin estilo y sin aparecer con el foco de teclado | `WEAK` |
| Cabecera | `.header-nav-item` con hover y `transition: all .15s` | `NEEDS POLISH` |
| Hub | Hover resuelto con `onMouseEnter`/`onMouseLeave` (5 manejadores en `HubPage.jsx`) | `NEEDS POLISH` |

`FilesPage.jsx` tiene **trabajo sin commitear del propietario** (los tres bloques de la barra de
iconos): cualquier cambio en la barra lateral hay que coordinarlo antes.

### 3.5 Menús y paneles

| Patrón | ALEPHIA hoy | Clase |
|---|---|---|
| Superposiciones | Baseline congelado de UX-05: 98 sitios de código, 94 superposiciones lógicas. En el censo de UX-08, 7 usaban portal, 26 cerraban con Escape y **ninguna atrapaba el foco ni bloqueaba el desplazamiento** | `MISSING STATE` (contrato UX-05 congelado) |
| Capas | 30 z-index distintos (1000, 9999, 10000, 10001, 10002, 11000, 20000, 30000…) frente a las 10 capas `--a-layer-*` | `INCONSISTENT` |
| Sombras | 66 sombras distintas en el código frente a 3 tokens | `INCONSISTENT` |
| Teclado en menús | `ContextMenu.jsx` no maneja teclas ni roles | `MISSING STATE` (código funcional: ver el §5) |

## 4 · Comparación de estados (reglas CSS en vivo)

| | ACC | ALEPHIA |
|---|---|---|
| Reglas totales | 2.120 | 856 |
| Reglas `:hover` | 276 | 104 |
| Reglas de foco | 176 | 24 |
| Reglas `:active` (pulsado) | **145** | **4** |
| Reglas `:disabled` | 34 | 19 |
| Fondo de hover | `#F6F6F6` en 19 reglas | 37 valores sin dominante (`#F5F5F5` 5, `#F4F6F9` 4, `#F0F0F0` 3, `#EEE` 3…) |
| Opacidad de deshabilitado | Un token | 7 valores (.3, .32, .42, .45, .5…) |
| Transiciones distintas | 15 | 37 en CSS; 51 contando el código |
| Radios distintos | 21 (2 px en 28 reglas) | 27 en CSS; 33 en el código |
| Tamaños de letra distintos | 17 (14 px domina) | 34 en CSS; 52 en el código |

Las cifras de ALEPHIA «en CSS» **no incluyen los estilos en línea**, que son la mayoría en
Revisiones, Mi Trabajo y la navegación. Las del «código» salen del censo de `frontend-docs/src`.

## 5 · Quick wins (presentación, sin lógica nueva)

| # | Qué | Dónde | Impacto | Riesgo |
|---|---|---|---|---|
| QW1 | Fila sin transición: hover instantáneo y nada arrastrado al reordenar o insertar (en F0 se aplicó `transition: 'none'`; la posición no se animaba, ver F0 §3.1) | `MatrixTable.jsx:346` | Alto: rapidez percibida en la pantalla más usada | Bajo |
| QW2 | Una sola definición por componente: `.data-row` (`index.css` 741/792/796 frente a 1202/1206), `.folder-tree-item` (374–401 frente a 2186–2204) y `.row-context-menu` (855–899 frente a 2996–3054), con el hover canónico | `index.css` | Alto: consistencia | Bajo; comparar antes y después con capturas |
| QW3 | Foco visible global: `:focus-visible { box-shadow: var(--a-focus-ring) }` para `button`, `a`, `[role=button]`, `input` y `summary`, y retirar los `outline: none` sin reemplazo | `index.css` y 62 sitios | Alto: precisión y accesibilidad | Bajo; solo cambia al usar el teclado |
| QW4 | Pulsado global para los botones con clase, con el mecanismo que ya usa la primitiva (`translateY(1px)`) | `index.css` | Medio | Bajo; no llega a los botones en línea |
| QW5 | Casilla con la paleta: marcado con `--a-action-primary`, hover y anillo de foco | `index.css` | Medio: quita el azul ajeno | Bajo |
| QW6 | Columna de acciones **congelada a la derecha** (`td-frozen-right`, ya existe) para que el ⋮ se vea siempre | `MatrixTable.jsx`, `index.css` | Medio | Medio: probar anchos y desplazamiento en el banco de la tabla |
| QW7 | Spinner de fila en el color del texto o de un token, no `#000` | `index.css:2413` | Bajo | Nulo |

Quedan **fuera de este frente** porque son código funcional nuevo:

- navegación con flechas, Escape y Enter dentro de los menús, y gestión del foco al abrir y cerrar;
- atrapar el foco y bloquear el desplazamiento en las superposiciones (ya está en el contrato UX-05);
- esqueletos de carga que dependan de estados que hoy no existen.

## 6 · Primitivas reutilizables

**Ya existen (UX-08): adoptarlas, no reescribirlas.** `Button` (rango, tamaño, hover, pulsado,
foco, deshabilitado, cargando), `Field`, `Modal`, `Overlay` y `Panel`. Hoy tienen **0 usos** en
el portal.

**Faltan, y son solo presentación:**

| Primitiva | Contrato mínimo | Sustituye a |
|---|---|---|
| `IconButton` | 24/32 px, hover, pulsado, foco, `aria-label` obligatorio, tooltip | Iconos en línea y `row-menu-btn` |
| `Tooltip` | Aparece también con el foco; capa `--a-layer-tooltip`; retardo único | 110 `title` nativos en iconos |
| `Checkbox` | 16 px, hover, foco, marcado e indeterminado con la paleta | `input` con el azul de Tailwind |
| `Menu` / `MenuItem` | Opción de 36 px, icono de 16, separador, variante de peligro, `--a-shadow-md`, roles | Dos `row-context-menu` y `row-action-menu` |
| `Row` (clase de contrato) | `data-state` para hover, seleccionado, foco, deshabilitado y ocupado; 48 px; transición solo de opacidad | Las filas de Archivos, la lista de Revisiones y Mi Trabajo |
| `NavItem` | Hover, activo, foco y colapsado; colores de token | Botones en línea de la barra lateral |
| `StatusChip` | Tonos desde `--a-status-*` / `--a-estado-*` | Chips con colores literales |
| `Spinner` | Uno solo, con tamaño por token | `.adsk-spinner` negro y variantes |

`Toolbar` sigue **aplazado** en el programa UX y no se reabre aquí.

## 7 · Tokens y estados a estandarizar

**Ya existen:** `--a-state-hover`, `--a-state-selected`, `--a-focus-ring`, `--a-motion-fast/base/slow`,
`--a-ease`, `--a-radius-*`, `--a-shadow-sm/md/lg`, `--a-space-*`, `--a-type-*` y `--a-layer-*`.

**Corregir:**

- **T1:** separar `--a-state-hover` de `--a-action-secondary`, que hoy son el mismo hex. Es un
  cambio del canon: necesita autorización y pasar los tripwires (`design/tripwires.py`).

**Añadir:**

| Token | Motivo |
|---|---|
| `--a-state-pressed` (o una regla única de pulsado) | Hoy 4 reglas de pulsado en todo el portal |
| `--a-state-selected-hover` | Seleccionado y hover a la vez, hoy sin definir |
| `--a-opacity-disabled` | Hoy 7 opacidades distintas |
| `--a-control-h-sm/md/lg` | En una misma barra conviven 24, 30, 32 y 34 px; tomar los de la primitiva (26/32/40) |
| `--a-row-h` (48) y `--a-menu-item-h` (36) | Filas ya en 48; opciones de menú hoy en 40 y 59 |

**Reglas de uso** (vigilables con los tripwires):

- ninguna `transition: all`; solo duraciones de `--a-motion-*`;
- z-index solo desde `--a-layer-*`;
- elevación: menú con `--a-shadow-md`, modal con `--a-shadow-lg`;
- ningún `outline: none` sin `--a-focus-ring`.

**Decisión abierta para el propietario:** cómo se ve el pulsado. La primitiva ya eligió un
desplazamiento de 1 px, sin color, que funciona igual en los cuatro rangos, incluido el de
peligro, que no tiene margen de color. ACC usa un halo que crece. Recomiendo **mantener el de
ALEPHIA**, que es coherente con su identidad, y aplicarlo en todas partes.

## 8 · Orden de implementación por impacto

| Fase | Contenido | Por qué en este orden |
|---|---|---|
| **F0** | QW1, QW3, QW4, QW5 y QW7: un commit de CSS más una línea de JSX | Se nota en todo el producto desde el primer día y no toca lógica |
| **F1 · Archivos** | QW2 (quitar reglas duplicadas), un solo menú contextual con opciones de 36 px, alturas de la barra con token y QW6 (⋮ siempre visible) | Es la pantalla más usada y la de más defectos medidos |
| **F2 · Tokens** | T1 y los tokens nuevos del §7, con los tripwires ampliados | Pone el suelo común antes de migrar pantallas enteras |
| **F3 · Revisiones** | Lista con estados por clase en vez de en línea, `StatusChip`, modal con `Button` (cargando) y `IconButton` para cerrar | 77 estilos en línea y 0 estados diseñados |
| **F4 · Mi Trabajo y navegación** | `Row` en Mi Trabajo y `NavItem` en la barra lateral, coordinando con el WIP de `FilesPage.jsx` | Visibles en cada sesión |
| **F5 · Menús y paneles** | Continuar UX-05 desde L0 (contrato congelado); `Tooltip` en lugar de los `title` de los iconos | UX-05 ya decidió la arquitectura |
| **F6 · Carga** | Un solo `Spinner`; esqueleto de fila solo donde la lista ya conoce su estado de carga | Rapidez percibida en listas |

Cada fase, como siempre: **banco con el componente real antes de subir**, capturas antes y
después, y lint comparado con HEAD.

## 9 · Lo que no se midió o no es concluyente

- **Tooltips de ACC:** en el botón de vista (solo icono) no apareció ninguno en 2 s. Una sola
  muestra no basta para concluir.
- **Teclado dentro de los menús:** con teclas enviadas por CDP, ni en ACC ni en ALEPHIA
  respondieron las flechas ni Escape. En ALEPHIA el código lo confirma (`ContextMenu.jsx` no
  maneja teclas). En ACC no se puede afirmar con teclas sintéticas.
- **Paneles laterales, desplegables, modales de ACC y cambio de nombre en línea de ACC:** no
  medidos en vivo.
- **«Mi Trabajo»:** no se buscó ni se midió su equivalente en ACC.
- **Visor 3D (`frontend-react`):** fuera de este análisis, que cubre el portal.

## Anexo · Método reproducible

- Censo del código: `scratchpad/ui_polish/censo_interaccion.py` (hover, foco, pulsado,
  transiciones, radios, sombras, tamaños de letra, z-index, `title`, spinners, toasts) y
  `censo_por_area.json` por fichero de cada área. Los ficheros del scratchpad no persisten;
  el método sí: patrones sobre `frontend-docs/src` excluyendo `probar-*`, `.bak` y `.roto`.
- Lenguaje de estados en vivo: recorrer `document.styleSheets` (incluidas las reglas anidadas),
  clasificar cada regla por pseudoclase (`:hover`, `:active`, `:focus`, `:focus-visible`,
  `:disabled` y selectores de seleccionado) y contar fondo, sombra, contorno, color, opacidad y
  borde; más las transiciones, radios, tamaños de letra y sombras de todas las reglas.
- Coordenadas con la ventana en segundo plano: calibrar **por pestaña** con un escuchador de
  `pointerdown`/`pointermove` antes de pulsar. En ACC, los clics iban a escala 0,766 y las
  capturas a 0,572; en ALEPHIA, a 1:1. Verificar siempre con `elementFromPoint` que el punto cae
  en el elemento buscado.
