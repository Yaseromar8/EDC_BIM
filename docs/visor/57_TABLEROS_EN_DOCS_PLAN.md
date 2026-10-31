# 57 · Tableros en ALEPHIA Docs: plan

30-oct-2026. **Decisión del dueño:** «Sí, en Docs; es más profesional. Lo conectaremos a View mediante esa forma de publicar que te dije, y armaremos un puente en View más adelante».

**Referencia:** ACC → Data Management → **Tableros** («Paneles»), en su obra PQT8 · DRENAJE PLUVIAL TALARA.
- **La lista:**
  - título «Paneles», botón «+ Crear un nuevo panel» y enlaces a «Paneles archivados» y «Configuración de permisos»;
  - columnas Nombre (con miniatura), «Abierto por última vez por usted» (↓) y «Creado por»;
  - un menú ⋮ por panel con **Archivar** y **Salir**.
- **El panel por dentro:** Forma Board, estudiado en docs/visor/53, 54 y 55.

## 1 · Dónde vive cada cosa

| Pieza | Dónde |
|---|---|
| Módulo «Tableros» (lista y tablero) | **Docs** (`frontend-docs`): una entrada más en `BarraLateral.jsx`, cargada en `FilesPage.jsx` como Revisiones o Incidencias |
| El lienzo (cámara, selección, imanes, notas, texto, secciones, barras flotantes, teclado, deshacer) | **Pieza común**, sacada de `frontend-react/src/components/dashboard/` (DashboardWorkspace, PiezasLienzo, imanes, notas) a una carpeta que usen **Docs y View**, para no mantenerla dos veces |
| Servidor | Un **blueprint nuevo** (`/api/tableros`) registrado **también en el perfil portal**. El de hoy (`/api/dashboards`) solo existe en el visor. Hay que ampliar su techo de rutas (`test_perfil_portal`) |
| Datos | Tabla nueva **`tableros`** (por obra; nombre, configuración, creado por, archivado, **versión**) y **`tableros_abiertos`** (quién lo abrió por última vez y cuándo). **Migración** que aplica el dueño como `ecd_migrator` |
| Permisos | Los de la obra en Docs. Más adelante, por tablero, como la «Configuración de permisos» de ACC |
| Puente con View | «**Publicar vista**» desde el tablero de Docs, que se abre a pantalla completa como consulta; el puente en View, después |

## 2 · Qué podrá tener un tablero de Docs

1. **Notas, texto y secciones** (con tamaños 16:9, A4…): lo ya hecho.
2. **Documentos de Docs:**
   - recientes y un selector propio en español, con selección múltiple;
   - tarjeta con la **vista previa por versión** (`/api/docs/vista-previa/url`, `/api/docs/mosaico`), versión ▾ y páginas ◀ ▶;
   - doble clic abre el **lector de PDF** o el **visor CAD** de Docs.
3. **Incidencias y observaciones** (`doc_issues`): tabla con buscador y filtro, que se añaden **como tarjetas o como kanban**.
4. **Una búsqueda que lea todo**: notas, títulos, documentos, incidencias. La de ACC no lee sus tarjetas (doc 54 §8).
5. **Más adelante:** vistas 3D y gráficas del modelo (el puente con View).

## 3 · Colaboración desde el principio

El tablero nuevo nace con lo de doc 56 §3:
- **versión en cada guardado**: el servidor rechaza una versión vieja (409) y el cliente **fusiona por elemento** y reintenta; nadie pisa a nadie;
- **quién está** (avatares, por sondeo);
- **comentarios**.

## 4 · Fases

Cada fase se prueba en el banco antes de pasar a la siguiente; nada se publica sin el visto bueno del dueño.

| Fase | Entrega | Necesita |
|---|---|---|
| **1 · Lista y tablero vacío** | «Tableros» en la barra de Docs; la lista como ACC (crear, abrir, renombrar, archivar, archivados, abierto por última vez, creado por); el tablero con el lienzo común (notas, texto, secciones, deshacer…); **guardado con versión** | Migración nueva; blueprint `/api/tableros` en portal y visor; sacar el lienzo a pieza común |
| **2 · Documentos** | Botón «Documentos» (recientes y selector); tarjeta con vista previa, versión y páginas; abrir en el lector o visor | Solo código, sobre lo que ya existe en Docs |
| **3 · Incidencias** | Tarjetas y kanban de observaciones | Solo código |
| **4 · Publicar vista** | Seleccionar → «Publicar vista» → pantalla completa de consulta + enlace (PNG/PDF como en doc 52) | Solo código |
| **5 · Colaboración** | Presencia (avatares) y comentarios | Puede necesitar una migración pequeña |
| **6 · Puente con View** | Gráficas del modelo y vistas 3D en el tablero de Docs; o abrir el tablero desde View | Por decidir |

## 5 · Fase 1 · hecha en local (30-oct-2026)

Sin publicar: commiteada en la rama local `publicar-30oct`, sin push. Publicar es, en este orden y solo cuando
el dueño lo diga: **migración 43** (él, como `ecd_migrator`) → backend → portal de Docs.

**Qué hay**

- **Base** · `backend/sql/43_tableros.sql` (+ `_rollback`): `tableros` (obra, nombre, `config` JSONB, `version`,
  archivado, autor, fechas) y `tableros_abiertos` (quién abrió qué y cuándo). Aditiva; la vuelta atrás se niega si
  hay tableros.
- **Rutas** · `backend/routes/tableros.py`, familia `/api/docs/tableros` (perfil portal, techo 300 → 302):
  listar (por obra; los abiertos por mí primero), crear, abrir (anota la apertura), **guardar con versión**
  (`UPDATE … WHERE version = %s`; si no casa, 409 con la versión y el contenido actuales), renombrar (cualquiera
  de la obra) y archivar / recuperar (autor o administrador de la obra). La obra sale siempre de la fila del
  tablero; `guardia_de_recurso('tableros', id)` + pertenencia, como Grupos. Tope de 4 MB por tablero.
- **Lienzo común** · `design/lienzo/` (lo usan View y Docs): `Lienzo.jsx` (cámara, selección, arrastre con imanes,
  notas, texto, secciones, teclado, deshacer, barras), `fusion.js` (fusión a tres bandas por elemento),
  `PiezasLienzo.jsx`, `imanes.js`, `notas.js`, `Icono.jsx`, `tema.js`. El Tablero de View importa de aquí las
  piezas y sigue con su propio motor por ahora (migrarlo a `Lienzo.jsx` es un paso aparte).
- **Docs** · entrada «Tableros» en la barra (grupo Documentos, tras Conjuntos; icono nuevo `tableros` en
  `design/iconos/iconos-obra.json`, mismo trazo que el resto); `TablerosModule.jsx`: lista como «Paneles» de ACC
  (Tableros / Archivados, Crear tablero, buscar por nombre, Nombre · Abierto por última vez por usted · Creado
  por · ⋮ Abrir / Renombrar / Archivar) y el tablero a pantalla completa con su cabecera (volver, nombre editable,
  estado «Guardado / Cambios sin guardar / Guardando… / No se pudo guardar», Reintentar, Recuperar si está
  archivado).

**Cómo guarda** · 800 ms después del último cambio; al volver a la lista, al ocultar la pestaña y con aviso al
cerrar la ventana si queda algo sin guardar. Si otra persona guardó antes (409) se fusiona **por elemento** con lo
suyo, se le avisa («se juntaron sus cambios con los tuyos») y se vuelve a guardar. Reglas de la fusión en
`fusion.js`: lo que solo cambió uno, se queda el de ese; lo que cambiaron los dos, el de quien guarda ahora; lo
borrado por uno y cambiado por el otro, se queda. Después de fusionar, el historial de deshacer empieza de nuevo
(Ctrl+Z no se lleva lo de otra persona). La cámara es de cada uno (en su navegador), no viaja en el tablero.

**Evidencia**

| Prueba | Resultado |
|---|---|
| `python -m pytest -q backend/tests/test_tableros.py` | 26/26 |
| Suite entera del backend | 2451 pasan; 1 falla, la conocida `test_reconstruccion_desde_cero` (el manifiesto del esquema se regenera midiendo una reconstrucción real; ahora lista también `tableros` y `tableros_abiertos`, junto a las que ya listaba) |
| Ensayo en PostgreSQL real desechable (scratchpad `ensayo_tableros.py`, clúster :55432, rutas como `ecd_app`, migración como `ecd_migrator`) | **38/38**: sin la 43 las rutas no sirven (por eso va antes); la 43 se aplica y se repite; dueño `ecd_migrator`, `ecd_app` lee y escribe; crear / listar / abrir / guardar / 409 con lo del otro / **carrera real de dos guardados a la vez ×10: siempre un 200 y un 409**; renombrar; archivar autor sí, otro no; guardar archivado 409; 413 por encima de 4 MB; 401 / 404; la vuelta atrás se niega con datos y, sin ellos, vuelve y la 43 se repite |
| `node frontend-react/pruebas/fusionTablero.prueba.mjs` | 10/10 |
| `node frontend-react/pruebas/imanes.prueba.mjs` (ya desde `design/lienzo`) | 5/5 |
| Navegador: dos personas a la vez en el mismo tablero (Chrome sin ventana, ratón y teclado reales, módulo real contra rutas reales y la base desechable) | **18/18**: Ana crea y pone una nota (v2); Luis lo ve «Nunca» abierto, lo abre, ve la de Ana y pone la suya (v3); Ana, aún en v2, pone otra: 409 → fusión → v4 con las tres, aviso en pantalla; Luis al reabrir ve las tres; Ctrl+Z de Ana tras fusionar no borra la de Luis |
| Build de Docs y del banco de View | compilan; el módulo va en su propio trozo (51 kB) |

**Defecto encontrado y corregido en el banco**: el lienzo ignoraba las teclas nacidas dentro de un
`[role="dialog"]` (pensado para los diálogos del visor) y en Docs el tablero vive dentro de uno, así que N, T, F,
Supr, Ctrl+Z… no hacían nada. Ahora solo se ignoran los diálogos que no contienen al propio lienzo.

**Lo que el banco no ve** (lista corta para el dueño, en su local): la entrada «Tableros» en la barra real de Docs
con su sesión y su obra; que «Archivar» solo aparezca a quien puede; el tablero con muchas notas en su pantalla.
