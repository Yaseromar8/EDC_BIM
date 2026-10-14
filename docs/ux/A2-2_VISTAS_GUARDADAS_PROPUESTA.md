# A2-2 · Vistas guardadas en Archivos — propuesta de diseño (14-oct-2026)

> **Estado: FASE 1 CONSTRUIDA EN LOCAL, SIN COMMIT** (14-oct-2026, noche). El propietario: «sí, vamos con todo
> lo que vimos en Procore». Lo hecho está en §9. Las fases 2 (vistas de la obra en el servidor) y 3 (empresa)
> siguen pendientes.
>
> Punto 1 del orden acordado en `PROCORE_VS_ALEPHIA_NUCLEO_DOCUMENTAL.md` §7.5. Parte de lo que ya hay en local
> sin commit: columnas propias, A1 (código leído del nombre), B1 (entrega del plan en `/api/docs/list`) y A2
> (filtros como fichas, `components/FiltrosDeArchivos.jsx`).

## 1 · Qué es, en una frase

Un bloque **«Vistas»** encima del árbol de carpetas. Cada vista es una pregunta que se hace a **toda la obra**,
no a la carpeta abierta: «¿qué tiene el plazo del plan vencido?», «¿qué me toca revisar?». Al pulsarla, la tabla
de siempre (las mismas columnas, el orden, el panel de consulta y las fichas) se llena con la respuesta.

El patrón es el estándar (Procore y ACC: panel de vistas a la izquierda y niveles personal, proyecto y empresa).
Lo nuestro es **qué preguntas trae de serie**: las entiende ISO 19650 y el plan de entregas, y nadie tiene que
configurarlas.

## 2 · Cómo se ve

```
┌ Archivos ────────────────────────────────────────────────────────────────┐
│ Carpetas · Cuarentena · Papelera                                         │
├──────────────────────┬───────────────────────────────────────────────────┤
│ VISTAS            ▾  │ Vista: Plazo del plan vencido · 3 en toda la obra │
│  De ALEPHIA          │                                  ✕ Salir de la vista│
│   Me toca revisar  2 │ [Buscar en esta vista] [Estado ▾] [Añadir filtro ▾]│
│   Plazo vencido    3 │ Disciplina: ES ✕                                  │
│   Vence en 7 días  1 │ ┌───────────────────────────────────────────────┐ │
│   Publicados sin   4 │ │ Nombre · Ubicación · Tipo · Disciplina · Rev. │ │
│     entrega          │ │ Estado ISO · Entrega · Actualizado · …        │ │
│   En revisión     12 │ └───────────────────────────────────────────────┘ │
│   Publicados      40 │                                                   │
│  De la obra (fase 2) │                                                   │
│  Mías                │                                                   │
│   Estructuras ES     │                                                   │
│ ──────────────────── │                                                   │
│ ▸ Archivos de proyecto (árbol de siempre)                                │
└──────────────────────┴───────────────────────────────────────────────────┘
```

- Texto y una cifra a la derecha. Sin iconos de colores, sin píldoras ni brillos (paleta cerrada D-24). La vista
  activa lleva la raya Orange de lo activo, como la barra lateral.
- El bloque se pliega y recuerda si estaba plegado (solo comodidad, en el navegador).
- Las cifras salen de **una sola** petición al entrar en Archivos (ver §5).

## 3 · Los tres niveles

| Nivel | Quién la crea | Quién la ve | Dónde se guarda | Fase |
|---|---|---|---|---|
| **De ALEPHIA** (de serie) | Nadie: vienen con el producto | Todos los de la obra | En el código. No se guardan | **1** |
| **Mías** (personal) | Cada persona | Solo ella | **Fase 1:** en su navegador, por obra y por usuario. **Fase 2:** en el servidor | **1** |
| **De la obra** (proyecto) | Administrador de la obra | Todos los de la obra | Servidor (tabla nueva) | **2** |
| **De la empresa** | Administrador de la entidad | Todas sus obras | Servidor, con el catálogo por entidad (§7.4) | 3 |

**Por qué la fase 1 guarda las personales en el navegador:** el portal está en su tope de rutas. Lo he medido
hoy: **285 rutas** propias y la prueba exige `< 286` (`test_perfil_portal`), así que **no cabe ni una ruta más**.
Guardar en el servidor pide además una tabla nueva, y por tanto una migración que se aplica a mano. Las vistas de
serie, que son lo que nos distingue, **no necesitan guardarse**. Con eso la fase 1 sale **sin rutas nuevas y sin
migración**.

El límite es claro: una vista personal hecha en el portátil no aparece en el móvil. Se dice en la propia
pantalla («Guardada en este navegador»).

**Fase 2 (decisión suya):** migración aditiva `backend/sql/NN_vistas_guardadas.sql` (+ `_rollback`) con una
tabla `vistas_guardadas` (obra, nivel, propietario, nombre, definición en JSON, creada por y cuándo) y **una
ruta** `/api/docs/vistas` (GET para listar, POST para guardar y DELETE para borrar). Eso exige **subir el techo de
286 a 287**, igual que se hizo con `/api/docs/mosaico`. La alternativa sin subir el techo es colgar esos métodos
de `/api/docs/search`, que ya tiene GET y POST, pero mezcla buscar con guardar y no la recomiendo. Al entrar en la
fase 2, las vistas personales del navegador se suben solas la primera vez.

## 4 · Las vistas de serie

Solo afirman lo que el sistema **sabe con certeza**. Se respeta el matiz de `plan_de_entrega.py`: que un
compromiso no tenga documento vinculado no significa que no se entregó, sino que nadie lo ha cotejado.

| Vista | Qué documentos trae | De dónde sale |
|---|---|---|
| **Me toca revisar** | Los documentos de las revisiones cuyo paso actual me espera a mí | Encargos `REVIEW` abiertos para mí en esta obra (los mismos de «Mi trabajo») → `doc_reviews.items` |
| **Plazo del plan vencido** | Documentos **vinculados** a un compromiso cuya fecha ya pasó y que **siguen sin publicar** | `plan_entregas` + estado del documento |
| **Vence en 7 días** | Lo mismo, con la fecha comprometida entre hoy y dentro de 7 días | Ídem |
| **Publicados sin entrega** | Publicados que no están atados a ningún compromiso. Solo aparece si la obra tiene plan | `plan_entregas` vacío para ese documento |
| **En revisión** | Estado ISO **Compartido** | `file_nodes.status = SHARED` |
| **Publicados** | Estado ISO **Publicado** | `file_nodes.status = PUBLISHED` |

**«Vencidos del plan», tal cual, no puede salir en Archivos.** Un compromiso con plazo vencido y **sin**
documento no es un archivo: no tiene fila que mostrar. Por eso la vista «Plazo del plan vencido» trae los
documentos que existen y van tarde. Debajo de la cabecera añade una línea: «Además, N compromisos con plazo
vencido no tienen documento cotejado → Plan de entregas», que lleva a la pantalla del plan. Así no se calla
nada ni se acusa a nadie de algo que no consta.

Se quedan fuera a propósito:
- «Fuera de convención», porque ya tiene su pantalla, «Nombres fuera de convención».
- «Superados», porque las versiones viejas no son filas de Archivos.

## 5 · Cómo funciona por dentro, sin rutas nuevas

**Servidor: se amplía `GET /api/docs/search`**, la ruta que ya usa el buscador. Es la misma ruta con un
parámetro más, así que el techo no se mueve:

- `?vista=<clave>&model_urn=…` devuelve los documentos de esa vista en **toda la obra**. Cada fila tiene la
  **misma forma que una fila de `/api/docs/list`**: estado, revisión, idoneidad, `entrega`, autor, fecha y
  tamaño. Lleva además `path` (la carpeta), así que la tabla de siempre la pinta sin cambios.
- `?vista=recuentos` devuelve las cifras de todas las vistas en una sola consulta.
- Sin `vista`, la búsqueda por texto **no cambia** (el mismo `q` y el mismo límite de 50).
- Tope de 500 filas por vista. Si se pasa, lo dice («Mostrando 500 de 812: afina con los filtros»).

**Permisos: la vista solo trae lo que esa persona puede ver.** Cada fila pasa por `permiso_efectivo` (mínimo
`viewer`), con la caché de `contexto_de_permisos`. Si se enciende `STRICT_ISO_VISIBILITY`, también por la misma
regla ISO que `list_contents`.

> ⚠️ **Hallazgo de la lectura (no lo he tocado).** La búsqueda por texto de hoy (`GET /api/docs/search`,
> `routes/documents.py:2110`) **solo comprueba que la persona sea de la obra**. No mira el permiso de carpeta:
> quien no puede ver una carpeta sí ve, al buscar, los nombres de lo que hay dentro. El listado (`list_contents`)
> sí los oculta. Corregirlo cambia lo que algunas personas ven hoy al buscar, así que **lo decide usted**:
> (a) corregirlo en este mismo lote, ya que la vista necesita ese filtro de todas formas, o (b) dejarlo como
> hallazgo aparte.

**Pantalla:**
- `useFileExplorer` gana un estado `vistaActiva` (null = carpetas, como hoy).
- Con una vista activa, la tabla recibe las filas de la vista en lugar de las de la carpeta. Se usan el mismo
  `MatrixTable` y el mismo `PanelConsulta`; la única columna nueva es **«Ubicación»**, y solo en modo vista.
- Pulsar una carpeta del árbol o «✕ Salir de la vista» vuelve a la carpeta, igual que hoy se sale de la búsqueda.
- Abrir un documento de la vista lo abre donde está, con el mismo camino que la búsqueda global.
- En modo vista **no hay selección ni acciones en lote** (desplazar, suprimir). Esos permisos se deciden por
  carpeta, y una vista mezcla carpetas. La edición masiva es el punto 4 del orden.

## 6 · Cómo encaja con lo que ya existe (sin distorsionarlo)

| Pieza | Sin vista activa | Con vista activa |
|---|---|---|
| **Buscador** | **Igual que hoy**: búsqueda por nombre en toda la obra | Dice «Buscar en esta vista» y filtra las filas de la vista por nombre, sin ir al servidor |
| **Desplegable de estado** | Igual que hoy | Se suma a la vista, igual que hoy se suma a la carpeta |
| **Filtros A2 (fichas)** | Igual que hoy: valores de la carpeta | Los valores y recuentos salen de la vista, o sea de toda la obra. Se quitan con ✕, como ahora |
| **Pie «Mostrando N de M»** | Igual | M = filas de la vista |
| **Enlaces y Atrás/F5** | Igual | Fase 1: la vista **no** va en la dirección, para no tocar la lógica de enlaces de Archivos (14-sep), que es delicada. Si la quiere en la dirección, va en otro paso |
| **Papelera y cuarentena** | Igual | El bloque «Vistas» no aparece |
| **Cuadrícula** | Igual | Funciona igual, sin la columna «Ubicación» |

**Guardar una vista propia:** cuando hay algún filtro activo (texto, estado o fichas), junto a «Quitar todos»
aparece **«Guardar como vista…»**. Pide un nombre y un alcance:
- **Toda la obra** (por defecto): guarda los filtros y los aplica a todos los documentos visibles.
- **Esta carpeta**: guarda los filtros y el id de la carpeta.

Tipo y disciplina se siguen leyendo con `codigoDelNombre`, la misma regla de A1, en un solo sitio. Una vista
propia se renombra o se borra desde su menú ⋯.

## 7 · Pruebas previstas

- **Backend:** `tests/test_vistas_de_obra.py`, sin base, al estilo de la suite. Comprueba:
  - cada vista de serie trae lo que dice y nada más;
  - el permiso de carpeta oculta filas, y los recuentos lo respetan;
  - el plazo vencido no cuenta lo publicado;
  - «Publicados sin entrega» no sale si la obra no tiene plan;
  - sin `vista`, la búsqueda de siempre devuelve lo mismo que antes.
- **Docs:** banco puro `pruebas/vistasDeArchivos.prueba.mjs` (catálogo, guardar y leer en el navegador, el filtro
  sobre las filas y los fallos del navegador sin almacenamiento) y clics reales en el banco de 5174.
- **Suite:** `python -m pytest -q` contra la línea base (2144 passed, 2 failed previos) y los bancos de Docs, hoy
  20/20.
- **Techo:** se comprueba que sigue en 285 rutas y que `SIN_PANTALLA` no cambia.

## 8 · Lo que necesito que decida

1. **¿Visto bueno a la fase 1** (vistas de serie + personales en el navegador, sin rutas ni migración)?
2. **El hallazgo del buscador (§5):** ¿se corrige en este lote o se deja aparte?
3. **¿Las seis vistas de serie** de §4, con «Plazo del plan vencido» en lugar de «Vencidos del plan»?
4. **Fase 2:** cuando toque, ¿subir el techo a 287 por `/api/docs/vistas` o colgarlo de `/api/docs/search`?

## 9 · Hecho en local (14-oct-2026, noche, sin commit)

**Servidor** (sin rutas nuevas, sin migración; el perfil portal sigue en 285 rutas):
- `backend/vistas_de_obra.py` (nuevo):
  - una sola consulta trae los documentos vivos de la obra con su carpeta y su compromiso del plan;
  - `vistas_de` decide en qué vistas cae cada uno;
  - `filtrar_visibles` aplica el permiso de carpeta (`permiso_documental`, una pregunta por carpeta, con
    `contexto_de_permisos`) y la regla ISO estricta.
- `GET /api/docs/search` (`routes/documents.py`) acepta tres usos nuevos:
  - `?vista=recuentos` → las cifras del panel;
  - `?vista=<clave>` → una vista de serie;
  - `?vista=todos&q=&estado=&tipo=&disciplina=&entrega=` → una vista propia de toda la obra. Los filtros se
    aplican en el servidor con la misma regla de código que el portal (`piezas_del_codigo` ≡ `codigoDelNombre`).

  Sin `vista`, la búsqueda responde con la misma forma de siempre.
- **El hallazgo de §5 queda corregido:** la búsqueda por texto pasa ahora por `filtrar_visibles`. Un resultado
  sale solo si la persona puede ver la carpeta que lo contiene, que es la regla del listado.
- `tests/test_vistas_de_obra.py`: 15 pruebas, sin base.

**Portal:**
- `utils/vistasDeArchivos.js`: catálogo de serie, filtros, almacén de las vistas propias y descripción.
- `hooks/useVistasDeArchivos.js`: estado y peticiones.
- `components/PanelDeVistas.jsx`: el panel y «Guardar como vista…».
- Estilos al final de `index.css` (lista cerrada D-24).
- `FilesPage.jsx`:
  - el panel encima del árbol;
  - la cabecera de la vista en lugar de las migas;
  - la tabla con las filas de la vista;
  - en modo vista se ocultan «Cargar archivos», «Nueva carpeta», «Vincular ACC» y el cambio a cuadrícula.
- `MatrixTable.jsx`: `soloLectura` (sin casillas ni ⋮) y la carpeta bajo el nombre cuando la fila trae
  `ubicacion`.

**Cambios respecto a la propuesta:**
- **En modo vista, solo lista.** La cuadrícula tiene casillas y menú, y una vista mezcla carpetas.
- **El buscador.** En la pantalla de hoy filtra la carpeta, no busca en toda la obra (`ALCANCE_BUSQUEDA =
  'carpeta'`). Sin vista sigue igual, y dentro de una vista filtra sus filas.
- **«Guardar como vista…»** no se ofrece dentro de una vista: guardaría solo una parte de lo que se ve.
- **«Solo en esta carpeta».** Al abrir una vista así, se va a esa carpeta con sus filtros puestos.

**Pruebas:**
- `python -m pytest -q`: ver AI_WORKSTATE.
- Bancos de Docs: 21/21, con el nuevo `vistasDeArchivos`, que tiene 15 comprobaciones.
- Build sin errores, construido fuera de `dist/` porque `dist/assets` estaba bloqueado por otro proceso.

**Clics reales en el banco** (`localhost:5174/probar-busqueda.html`, con las respuestas de las vistas
añadidas a `src/probar-busqueda.jsx`):
- cifras del panel 2·2·1·2·2·3;
- «Plazo del plan vencido» con el aviso de los 5 compromisos sin documento;
- «Publicados» y la ficha «Disciplina: GE», que deja 1 de 3;
- el panel de consulta desde una fila de la vista;
- abrir un documento desde la vista;
- salir pulsando una carpeta del árbol, que vuelve a las migas y a «Cargar archivos»;
- guardar «Publicados de la obra» (estado Publicado), que pide `vista=todos` y trae los 3;
- borrarla.

La consola, sin errores.

**No probado:** contra la base real. La consulta SQL nueva no se ha ejecutado contra PostgreSQL: las pruebas
usan un doble. Falta que el propietario abra las vistas en 5174 con su sesión, contra el backend local.

## 10 · Correcciones tras ver los vídeos de Procore (14-oct-2026, noche, sin commit)

Punto 1 de `PROCORE_REVISION_PROPIA_14-oct-2026.md` §7. El propietario: «hazlo, con cuidado».

- **Colecciones.** Las vistas de serie se agrupan como en Procore:
  - **En revisión:** Todos en revisión · Me toca revisar · Asignados a mi empresa (nueva).
  - **Publicados:** Todos los publicados · Publicados sin entrega.
  - **Plan de entregas:** Plazo vencido · Vence en 7 días.
  - Después, «Mías».
- **«Asignados a mi empresa»** (`vistas_de_obra.documentos_de_mi_empresa`): revisiones de la obra en curso cuyo
  encargo abierto espera a mi empresa, por cualquiera de las tres vías: dirigido a la empresa, a una persona de
  ella o a la función contractual que la empresa tiene en la obra. Sin empresa, la vista sale vacía.
- **Cada consulta auxiliar va en su SAVEPOINT** (me toca, mi empresa). En PostgreSQL un fallo aborta la
  transacción, y sin esto una revisión rara habría dejado sin datos todas las vistas. Defecto de la primera
  versión, encontrado al revisarla.
- **Fichas de criterio y migas.** Al abrir una vista, la cabecera dice «colección › vista» (por ejemplo «Plan de
  entregas › Plazo vencido» o «Mías › Compartidos recientes») y muestra sus criterios como fichas («Entrega:
  vinculado · Plazo: vencido · Estado ISO: sin publicar»).
  - Las fichas de criterio no tienen ✕: definen la vista.
  - Los filtros que se añaden encima siguen saliendo debajo, con su ✕.
- **El orden de la tabla viaja con la vista propia.**
  - La tabla guarda el orden desde fuera (`MatrixTable`: `orden` y `onOrdenar`, opcionales; sin ellos ordena
    como antes).
  - Al guardar una vista se guarda el orden; al abrirla, vuelve.
  - **Qué no hace:** elegir qué columnas se ven, porque hoy no existe, ni guardar anchos por vista, porque el
    ancho es una preferencia de cada persona para todas las tablas.
- **Vencido en rojo:**
  - **Lista de RFI y Red Line:** la fecha límite sale en rojo si pasó y el elemento sigue sin responder (ni
    «Respondido» ni «Cerrado»). Se compara por día de Lima.
  - **Entrega en Archivos:** si el documento está «Vinculado», sin publicar y con la fecha comprometida ya pasada,
    la ficha sale en rojo. La etiqueta sigue siendo la del plan; el título explica «plazo vencido y sin publicar».

**Pruebas:**
- `test_vistas_de_obra` 18/18, con mi empresa, sin empresa y el fallo aislado.
- Bancos de Docs 23/23; `vistasDeArchivos` 18/18, con colecciones, criterios y orden.
- Build sin errores.
- Clics en el banco:
  - las colecciones con sus cifras;
  - «Plazo vencido» con migas, tres fichas de criterio y dos entregas en rojo;
  - una vista propia que guarda «Actualizado ↓» y lo recupera tras ordenar por nombre;
  - consola sin errores.
- **No probado con clics:** el rojo de la lista de RFI. Su banco tendría que simular `/api/rfis`, y esa cadena en
  el código del portal hace saltar `test_perfil_portal`. Está revisado en el código.

## 11 · Ensayo contra PostgreSQL real (14-oct-2026, noche)

El propietario: «¿estás haciendo solo el cascarón o estás conectando la lógica? No queremos errores». Hasta
entonces, la SQL nueva solo se había probado con un doble de la base. Ahora ha corrido de verdad.

**El ensayo:** `backend/herramientas/ensayo_de_vistas_y_ficha.py`.
- Se niega a correr si la base no se llama «ensayo…» o no es local, y no lee `.env`.
- Base desechable en esta máquina: PostgreSQL 18, puerto 55432, en la carpeta temporal de la sesión. Con
  autorización del propietario; se paró y se borró al terminar.
- Esquema completo: `bootstrap_esquema.py` (95 de 95 tablas, 0 fallos) más las migraciones 03, 04 y 06 a 33.
  Las de roles y propiedad (00, 01, 02, 05) no aplican a una base de un solo usuario.
- Por las rutas y el middleware reales; solo se sustituye la sesión.

**Resultado: 30 de 30 comprobaciones en verde.**
- Cifras de las siete vistas para dos personas: un residente y la administradora de la obra.
- Cada vista trae exactamente sus documentos, con ubicación y entrega del plan.
- «Asignados a mi empresa» funciona por persona de la empresa y por función contractual (la supervisión).
- Una vista propia filtra en el servidor.
- El permiso de carpeta se cumple en vistas, cifras, búsqueda y trazabilidad (403).
- La ficha trae revisiones, envíos con acuse, RFI, plan, marcas y huella.
- La portada lee plan, revisiones en curso y «Mi trabajo» con la forma que espera.

**Lo que destapó el ensayo:**
- La primera pasada (sin migraciones) falló en `/api/reviews` por la columna `plantilla_id`. No era un defecto
  del código: confirma que el esquema es «código más migraciones», como dice AGENTS.md.
- Los datos de prueba necesitaron `contrato = 'AUTORIDAD_TERMINAL'` en `doc_reviews`, que es lo que escribe la
  aplicación desde la migración 28.

**Cómo repetirlo:** crear la base de ensayo, construir el esquema, aplicar las migraciones y ejecutar:

    DB_HOST=127.0.0.1 DB_PORT=55432 DB_USER=ecd_migrator DB_PASS=x DB_NAME=ensayo_vistas \
      python herramientas/ensayo_de_vistas_y_ficha.py
