# AI_WORKSTATE.md — estado y antecedentes

## ESTADO OPERATIVO ACTUAL — 14-oct-2026 (tarde-noche) · CAÍDAS POR MEMORIA + PUBLICACIÓN DE LO DE PROCORE

Render reinició `visor-ecd-backend-va` tres veces (15:15, 15:20 y 15:21, hora de Lima; «Ran out of memory, used over
2GB») con seis personas consultando láminas. Diagnóstico y arreglo en `docs/INTEGRACION_PENDIENTE_14-oct-2026.md` §5.
El propietario autorizó el push («hagamos push también con lo otro»); los Manual Deploy los hace él.

```
[WIP HANDOFF]
TAREA:                frenar las caídas por memoria y publicar lo de Procore (vistas, ficha, portada, trazabilidad, D-24 de Docs)
IMPLEMENTADO:         EMPUJADO a main: 2e093d0 (abrir una lámina no dibuja en el servidor; un dibujo de PDF a la vez; la
                      subida por la cola de un hilo; un PDF sin miniatura ya no va entero a memoria) y 4291682 (vista previa y
                      mosaico para no administradores: RUTAS_POR_CUERPO). Encima, rama local procore-14oct: d61347e (backend:
                      vistas de obra, ficha, B1, cadena sellada, admin de obra en el listado), b66d8b4 (portal) y el commit de
                      documentación. Se empujan juntos con autorización del propietario
PENDIENTE:            1) Manual Deploy de visor-ecd-backend-va con el HEAD de main y comprobar /api/health + «Booting worker»;
                      2) DESPUÉS, Manual Deploy de visor-ecd-portal (el portal llama a ?vista= y a la ficha nueva: no antes del
                      backend); 3) vigilar la memoria en Metrics; 4) preparar de noche las vistas previas y mosaicos de los
                      planos antiguos (ampliar /api/docs/miniaturas/preparar, sin ruta nueva); 5) llevar la preparación a un
                      servicio aparte (Cloud Run), como Autodesk; 6) commits del resto del disco (visor 3D, CAD review ampliada,
                      ortofoto local, acceso de desarrollo del backend): NO publicados, decisión del propietario
ARCHIVOS MODIFICADOS: publicados: ver los cuatro commits. En el disco siguen sin commit, a propósito: frontend-react entero
                      (D-24 de View, 4D/LOB protegidos, Avance, PREDICT), backend/server.py + auth_middleware.py +
                      tests/test_auth.py (acceso de desarrollo), routes/cad_review.py + CadReviewOverlay.* (revisión del
                      7-oct §6.2), routes/orthophoto.py + orthophoto_local_store.py, frontend-docs/vite.config.js y package.json
TESTS EJECUTADOS:     sobre 03095cb + parche: pytest 2092 passed, 2 failed (históricos); sobre el árbol de procore-14oct: pytest
                      2142 passed, 2 failed (los mismos), bancos de Docs 22/22, build de Docs sin errores; ensayo PostgreSQL
                      real desechable de vistas y ficha 30/30 (antes de la integración); 145/145 blobs = árbol probado
TESTS PENDIENTES:     prueba del propietario en producción tras los dos deploys; memoria bajo uso real (no medible en local)
FALLO CONOCIDO:       los 2 fallos históricos de la suite; test_inventory_identity_core no colecciona fuera de este disco (importa
                      backend/prototypes, sin seguimiento); los planos subidos antes del 17-sep abren sin vista previa hasta el paso 4
NEXT EXACT ACTION:    tras el deploy del backend, GET https://visor-ecd-backend-va.onrender.com/api/health y comprobar el commit
DO NOT TOUCH:         DELETE /api/docs/permanent-delete; techo de test_perfil_portal; protegidos de AGENTS.md §6; no volver a
                      encender ALEPHIA_DIBUJAR_AL_ABRIR sin el paso 5
COMMIT/HEAD REF:      main local sigue en b03d0fb (no se cambió de rama); origin/main = 4291682 + lo que se empuje de procore-14oct
```

## ESTADO OPERATIVO ACTUAL — 14-oct-2026 (noche, 5) · VÍDEOS DE PROCORE VISTOS Y PUNTO 1 CORREGIDO (en local, sin commit)

```
[WIP HANDOFF]
TAREA:                tras ver los 90 vídeos de Procore, punto 1 de PROCORE_REVISION_PROPIA §7: colecciones en las vistas,
                      «Asignados a mi empresa», fichas de criterio y migas, orden de tabla en vistas propias, vencido en rojo
IMPLEMENTADO:         TODO EN LOCAL, SIN COMMIT. Detalle en docs/ux/A2-2_VISTAS_GUARDADAS_PROPUESTA.md §10. Notas de los vídeos:
                      docs/ux/PROCORE_VIDEOS_NOTAS_14-oct-2026.md
PENDIENTE:            §7 del informe, en orden: 2) carga con requisitos por tipo (pestaña «Cargas», errores por celda, envío en
                      bloque, comentario de versión); 3) decidir desde el lector + respuesta oficial de RFI; 4) QR de vigencia;
                      5) cajetín al cargar planos; 6) correspondencia por tipos con plazo legal. Y la prueba del propietario en 5174
ARCHIVOS MODIFICADOS: míos (esta tanda): backend/vistas_de_obra.py, backend/tests/test_vistas_de_obra.py;
                      frontend-docs/src/{utils/vistasDeArchivos.js, components/PanelDeVistas.jsx, hooks/useVistasDeArchivos.js,
                      pages/FilesPage.jsx, MatrixTable.jsx, components/IssueModule.jsx, index.css, probar-busqueda.jsx},
                      pruebas/vistasDeArchivos.prueba.mjs; docs/ux/*.md. Más los de las tandas anteriores (bloques siguientes)
TESTS EJECUTADOS:     python -m pytest -q → 2166 passed, 2 failed (los 2 previos); test_vistas_de_obra 18/18; bancos de Docs 23/23; build sin
                      errores; clics en el banco (colecciones, migas, criterios, entrega en rojo, orden guardado y recuperado)
TESTS PENDIENTES:     rojo de la lista de RFI sin clic (su banco necesitaría simular /api/rfis, que hace saltar test_perfil_portal).
                      HECHO después: ensayo contra PostgreSQL REAL desechable (herramientas/ensayo_de_vistas_y_ficha.py,
                      esquema + migraciones 03,04,06–33) → 30/30 en verde; base parada y borrada (A2-2 §11)
FALLO CONOCIDO:       los 2 fallos previos de la suite
NEXT EXACT ACTION:    OJO: Docs 5174 arrancado con `npm run dev` habla con el backend de RENDER (commit 03095cb), no con :3000;
                      para probar lo de hoy hay que arrancar Docs con `npm run dev:ensayo` (backend local, reiniciado 14:42).
                      Después: el propietario revisa Archivos → Vistas; con su visto bueno, punto 2 (carga con requisitos por tipo)
DO NOT TOUCH:         lo de los bloques siguientes
COMMIT/HEAD REF:      b03d0fb2e4be (sin commits nuevos)
```

## ESTADO ANTERIOR — 14-oct-2026 (noche, 4) · FICHA CON PESTAÑAS Y PORTADA POR PLAZOS (en local, sin commit)

El propietario: «sí, hazlo sin parar» (ficha con pestañas + portada por plazos), mientras almorzaba.

```
[WIP HANDOFF]
TAREA:                orden §7.5 de PROCORE_VS_ALEPHIA: 2) ficha con pestañas y 4-portada por plazos (tras las vistas A2-2)
IMPLEMENTADO:         TODO EN LOCAL, SIN COMMIT. Ficha: components/FichaDocumento.jsx + .css, utils/fichaDocumento.js
                      (línea de tiempo única, accesos, comprobar huella; los ayudantes del panel se mudaron aquí),
                      PanelConsulta.jsx («Ficha completa»), FilesPage.jsx (la ficha encima del árbol y la tabla).
                      Servidor: backend/ficha_documento.py (relacionados por ID, cada bloque en su SAVEPOINT) y
                      /api/docs/trazabilidad con `relacionados` y el PERMISO DE CARPETA (antes solo pertenencia a la
                      obra). Portada: components/PortadaObra.jsx + .css, utils/portadaObra.js, entrada «Portada» en
                      Documentos; useVistasDeArchivos acepta `conCifras`. Detalle: PROPUESTA_CONSULTA_Y_TRAZABILIDAD §11
                      y PROCORE_VS_ALEPHIA §8
PENDIENTE:            0) NUEVO ORDEN tras ver los 90 vídeos de Procore: docs/ux/PROCORE_REVISION_PROPIA_14-oct-2026.md §7 (notas: PROCORE_VIDEOS_NOTAS_14-oct-2026.md)
                      (B2 carga con requisitos → colecciones en vistas → QR de vigencia → paquetes por hito → archivo
                      del proyecto); 1) prueba del propietario con su sesión en 5174 (la SQL nueva de vistas y de relacionados NO se ha
                      ejecutado contra PostgreSQL); 2) QR de vigencia; 3) edición masiva; 4) vistas de la obra en el
                      servidor (migración + techo 287, decisión suya); 5) constancia PDF y motivo al publicar (pasos 5–6)
ARCHIVOS MODIFICADOS: míos (esta tanda): backend/ficha_documento.py, backend/tests/test_ficha_documento.py (nuevos),
                      backend/routes/documents.py (trazabilidad), backend/tests/test_trazabilidad_sellada.py (arnés + 1 prueba);
                      frontend-docs/src/components/{FichaDocumento.jsx,.css, PortadaObra.jsx,.css}, utils/{fichaDocumento.js,
                      portadaObra.js}, pruebas/{fichaDocumento,portadaObra}.prueba.mjs (nuevos), components/PanelConsulta.jsx,
                      pages/FilesPage.jsx, hooks/useVistasDeArchivos.js, src/probar-busqueda.jsx (banco); docs/ux/*.md.
                      Más los de la tanda A2-2 (bloque siguiente). Ajenos: el resto del worktree
TESTS EJECUTADOS:     python -m pytest -q → 2163 passed, 2 failed (los 2 previos); test_ficha_documento 3/3; test_trazabilidad_sellada 11/11; bancos de Docs
                      23/23; build de Docs sin errores (fuera de dist/, bloqueado); clics en localhost:5174/probar-busqueda.html:
                      ficha (5 pestañas, filtro, ‹ ›, volver con filas), comprobar archivo (vigente/anterior/alterado),
                      portada (cifras correctas, excluye pendientes de otra obra, abre la vista desde una cifra)
TESTS PENDIENTES:     ensayo contra base desechable; capturas de pantalla (la ventana estaba minimizada)
FALLO CONOCIDO:       los 2 fallos previos de la suite. Hallazgos SIN tocar: /api/activity (pantalla «Actividad») no
                      filtra por permiso de carpeta; la pantalla RFI de Docs llama a `api/rfis` (sin barra: test_perfil_portal
                      no la ve) y el perfil portal NO sirve /api/rfis. Por eso la portada no tiene fila de RFI
NEXT EXACT ACTION:    el propietario abre en 5174 una obra → Herramienta → Portada; luego Archivos → pulsa una fila →
                      «Ficha completa»
DO NOT TOUCH:         lo del bloque siguiente
COMMIT/HEAD REF:      b03d0fb2e4be (sin commits nuevos)
```

## ESTADO ANTERIOR — 14-oct-2026 (noche, 3) · A2-2 VISTAS: FASE 1 CONSTRUIDA EN LOCAL, SIN COMMIT

El propietario aprobó con «sí, vamos con todo lo que vimos en Procore». Detalle en
`docs/ux/A2-2_VISTAS_GUARDADAS_PROPUESTA.md` §9.

```
[WIP HANDOFF]
TAREA:                A2-2 vistas guardadas en Archivos (fase 1: de serie + propias en el navegador) y permiso de
                      carpeta en GET /api/docs/search
IMPLEMENTADO:         TODO EN LOCAL, SIN COMMIT. backend/vistas_de_obra.py (nuevo); GET /api/docs/search acepta
                      ?vista=recuentos|<clave>|todos (sin ruta nueva: el perfil portal sigue en 285) y la búsqueda por
                      texto filtra por permiso de carpeta (hallazgo corregido). Portal: utils/vistasDeArchivos.js,
                      hooks/useVistasDeArchivos.js, components/PanelDeVistas.jsx (nuevos), FilesPage.jsx (panel, cabecera,
                      tabla en modo vista), MatrixTable.jsx (soloLectura y carpeta bajo el nombre), index.css (estilos D-24)
PENDIENTE:            1) prueba del propietario en 5174 con su sesión contra el backend local (la SQL nueva NO se ha
                      ejecutado contra PostgreSQL: las pruebas usan un doble); 2) fase 2: vistas de la obra en el servidor
                      (migración NN_vistas_guardadas + /api/docs/vistas, exige subir el techo a 287: decisión suya);
                      3) siguiente del orden §7.5: paso 3 ficha con pestañas; 4) QR de vigencia; 5) edición masiva y portada
ARCHIVOS MODIFICADOS: míos (este paso): backend/vistas_de_obra.py, backend/tests/test_vistas_de_obra.py (nuevos),
                      backend/routes/documents.py (search_documents; el fichero ya traía WIP previo: separar al commitear);
                      frontend-docs/src/{utils/vistasDeArchivos.js, hooks/useVistasDeArchivos.js, components/PanelDeVistas.jsx,
                      pruebas/../vistasDeArchivos.prueba.mjs} (nuevos), src/pages/FilesPage.jsx, src/MatrixTable.jsx,
                      src/index.css, src/probar-busqueda.jsx (banco), docs/ux/A2-2_VISTAS_GUARDADAS_PROPUESTA.md.
                      Ajenos: el resto del worktree (ver bloques siguientes y EXPECTED WORKTREE)
TESTS EJECUTADOS:     test_vistas_de_obra 15/15; test_perfil_portal en verde (techo intacto); test_capacidades_con_puerta
                      sigue con su fallo previo (/api/docs/miniaturas/preparar); python -m pytest -q → 2159 passed,
                      2 failed (los 2 previos: test_capacidades_con_puerta y test_reconstruccion_desde_cero; 2144 + 15 nuevas);
                      bancos de Docs 21/21 (nuevo vistasDeArchivos 15/15); build de Docs sin errores (a otra carpeta:
                      frontend-docs/dist/assets estaba bloqueado, EPERM); clics reales en localhost:5174/probar-busqueda.html
                      (cifras, vistas de serie, ficha dentro de la vista, consulta, abrir, salir por el árbol, guardar y
                      borrar una vista propia), consola sin errores
TESTS PENDIENTES:     ensayo contra base desechable de la consulta nueva (no se toca base real sin autorización)
FALLO CONOCIDO:       los 2 fallos previos de la suite; en el banco, el lector abierto sin PDF no tiene botón de cerrar
                      (es del banco, no de este cambio)
NEXT EXACT ACTION:    el propietario abre http://localhost:5174 (Archivos de una obra con plan) y pulsa cada vista; si
                      algo sale «No se pudo calcular la vista», leer el log del backend :3000 ([Search] vista …)
DO NOT TOUCH:         DELETE /api/docs/permanent-delete; techo de test_perfil_portal y SIN_PANTALLA; protegidos de AGENTS.md
                      §6; la expresión `!fe.isTrashMode && puedeVincularAcc && fe.currentNodeId && fe.selected.size === 0`
                      (la vigila el banco accBridgeTemporal)
COMMIT/HEAD REF:      b03d0fb2e4be (sin commits nuevos)
```

## ESTADO ANTERIOR — 14-oct-2026 (noche, 2) · A2-2 VISTAS GUARDADAS: PROPUESTA ESCRITA

```
[WIP HANDOFF]
TAREA:                A2-2 vistas guardadas en Archivos (frontend-docs) — fase de diseño
IMPLEMENTADO:         solo la propuesta: docs/ux/A2-2_VISTAS_GUARDADAS_PROPUESTA.md (niveles, 6 vistas de serie, ampliar
                      GET /api/docs/search con ?vista= sin ruta nueva, personales en el navegador en fase 1, tabla + ruta
                      /api/docs/vistas en fase 2). Medido: el perfil portal sirve 285 rutas propias (techo < 286): no cabe
                      ninguna ruta nueva. Hallazgo SIN tocar: GET /api/docs/search no aplica el permiso de carpeta
PENDIENTE:            1) visto bueno del propietario a §8 de la propuesta (fase 1, hallazgo del buscador, vistas de serie,
                      fase 2); 2) construir fase 1; 3) pruebas (§7)
ARCHIVOS MODIFICADOS: míos: docs/ux/A2-2_VISTAS_GUARDADAS_PROPUESTA.md (nuevo), este bloque. Nada de código. Ajenos: todo lo
                      demás del worktree (ver el bloque siguiente y EXPECTED WORKTREE)
TESTS EJECUTADOS:     ninguno (no se cambió código); conteo de rutas del perfil portal con test_perfil_portal._rutas_del_perfil_portal → 285
TESTS PENDIENTES:     python -m pytest -q y bancos de Docs, al construir
FALLO CONOCIDO:       los 2 fallos previos de la suite (test_reconstruccion_desde_cero, test_capacidades_con_puerta)
NEXT EXACT ACTION:    esperar la respuesta del propietario a §8 de docs/ux/A2-2_VISTAS_GUARDADAS_PROPUESTA.md; con su sí,
                      ampliar GET /api/docs/search (routes/documents.py:2110) con ?vista= y su test sin base
DO NOT TOUCH:         lo del bloque siguiente (DELETE permanent-delete, techo 286, SIN_PANTALLA, protegidos §6); no corregir el
                      buscador sin su decisión
COMMIT/HEAD REF:      b03d0fb2e4be (sin commits nuevos)
```

## ESTADO ANTERIOR — 14-oct-2026 (noche) · PROCORE REVISADO, SIGUE A2-2 VISTAS GUARDADAS (en local)

```
[WIP HANDOFF]
TAREA:                construir lo nuestro y estandarizado tras revisar Procore; siguiente: A2-2 vistas guardadas en Archivos
IMPLEMENTADO:         TODO EN LOCAL, SIN COMMIT. Identidad D-24 (Docs y View claros, barra Dark 12, iconos de obra en Docs);
                      trazabilidad pasos 0b/0c + paso 1 (PanelConsulta al pulsar una fila); columnas propias de Archivos
                      (Nombre·Descripción·Tipo·Disciplina·Revisión·Estado ISO·Entrega·Actualizado·Por·Tamaño); A1 código
                      leído del nombre (utils/codigoDelNombre.js); B1 vínculo automático al plan de entregas al subir
                      (plan_de_entrega.vincular_al_subir, solo nombre = código y compromiso único) + «entrega» en
                      /api/docs/list + coincidencias en PlanEntregaModule; A2 filtros por metadato como fichas
                      (components/FiltrosDeArchivos.jsx, hooks/useFileExplorer.js). Revisión de ~60 vídeos de Procore
                      escrita en docs/ux/PROCORE_VS_ALEPHIA_NUCLEO_DOCUMENTAL.md §7 (estándar del sector + lo nuestro)
PENDIENTE:            en este orden (§7.5 del informe): 1) A2-2 vistas guardadas en tres niveles (personal, proyecto y,
                      después, empresa) con vistas que entienden ISO 19650 y el plan («Vencidos del plan», «Publicados sin
                      entrega», «Me toca revisar»), sobre toda la obra (/api/docs/search), no solo la carpeta; 2) paso 3 ficha
                      con pestañas (General · Recorrido · Descargas · Relacionados · Integridad) con datos que ya existen;
                      3) QR de vigencia (dice si la hoja impresa es la vigente, con huella y cadena); 4) edición masiva y
                      portada por plazos. Opción aparte: catálogo de códigos por entidad (§7.4). Iconos en View sin aplicar
ARCHIVOS MODIFICADOS: míos: ver los dos [WIP HANDOFF] de abajo (backend de trazabilidad/plan, frontend-docs: MatrixTable.jsx,
                      FilesPage.jsx, PanelConsulta.*, FiltrosDeArchivos.jsx, useFileExplorer.js, PlanEntregaModule.jsx,
                      anchosColumnas.js, codigoDelNombre.js, index.css, tema-claude.css, BarraSuperior.*, IconoModulo.jsx;
                      frontend-react: tema-claude.css, TopBar.css, ~60 ficheros de la pasada clara, Viewer.jsx 2 líneas);
                      docs/ux/PROCORE_*.md, PROPUESTA_CONSULTA_Y_TRAZABILIDAD.md. Ajenos: el resto del worktree sucio
                      (EXPECTED WORKTREE + WIP previo en file_system_db.py, routes/documents.py y Viewer.jsx): separar al commitear
TESTS EJECUTADOS:     python -m pytest -q → 2144 passed, 2 failed (los 2 previos: test_reconstruccion_desde_cero y
                      test_capacidades_con_puerta por /api/docs/miniaturas/preparar); bancos de Docs 20/20; bancos de View
                      364/364; builds de Docs y View sin errores; clics reales en el banco (panel, orden, filtros, coincidencias)
TESTS PENDIENTES:     prueba del propietario en sus servidores; ensayo contra base desechable de las vías selladas (no se toca
                      base real sin autorización)
FALLO CONOCIDO:       solo los 2 fallos previos de la suite
NEXT EXACT ACTION:    leer docs/ux/PROCORE_VS_ALEPHIA_NUCLEO_DOCUMENTAL.md §6–§7 y frontend-docs/src/components/FiltrosDeArchivos.jsx
                      + hooks/useFileExplorer.js; proponer al propietario en .md el diseño de A2-2 (dónde se guardan, niveles,
                      vistas de serie) y construirlo tras su visto bueno, SIN rutas nuevas si se puede (techo 286 de
                      test_perfil_portal)
DO NOT TOUCH:         DELETE /api/docs/permanent-delete (decisión del propietario); techo de test_perfil_portal y lista
                      SIN_PANTALLA; protegidos de AGENTS.md §6. Trabajar en D:\VISOR_APS_TL (NO worktree: lo de hoy no está
                      commiteado) con los servidores de Visual Studio: Docs 5174 (--mode ensayo → backend local), View 5173,
                      backend 3000 con autorrecarga (no reiniciarlo ni crear servidores extra). Nada de commit/push/deploy
                      sin autorización explícita; sin trailer Co-Authored-By
COMMIT/HEAD REF:      b03d0fb2e4be (sin commits nuevos)
```

## ESTADO ANTERIOR — 14-oct-2026 (tarde) · TRAZABILIDAD, PASOS 0b–0c (en local)

```
[WIP HANDOFF]
TAREA:                consulta del documento y trazabilidad (docs/ux/PROPUESTA_CONSULTA_Y_TRAZABILIDAD.md, maqueta v8)
IMPLEMENTADO:         backend, pasos 0b y 0c (§8 de la propuesta): las 4 escrituras de activity_log que saltaban la
                      cadena ahora sellan; verificar() marca «sin huella» tras la primera fila sellada; sellar_pendientes
                      se niega con filas intercaladas; sellado en SAVEPOINT (db.registrar_actividad); el acceso guarda la
                      versión; /api/docs/trazabilidad devuelve huellas, emisiones, sellado, cadena y relanza huellas
                      pendientes. Sin rutas nuevas (las vigías test_capacidades_con_puerta y test_perfil_portal las frenaron)
PENDIENTE:            1) reiniciar el backend local (:3000) para que corra este código; 2) paso 1: panel al pulsar una
                      fila en Docs; 3) ficha con línea de tiempo; 4) comprobar un archivo contra todas las versiones;
                      5) motivo al publicar fuera de revisión y cobertura; 6) constancia PDF. El borrado definitivo (H) NO
                      se toca: decisión del propietario
ARCHIVOS MODIFICADOS: míos (este paso): backend/db.py, bloqueo_de_edicion.py, file_system_db.py, registro_de_descargas.py,
                      auditoria_encadenada.py, integridad.py, routes/documents.py, tests/test_trazabilidad_sellada.py (nuevo),
                      tests/test_auditoria_encadenada.py, test_registro_de_descargas.py, test_bloqueo_de_edicion.py,
                      test_promocionar_version.py; docs/ux/PROPUESTA_CONSULTA_Y_TRAZABILIDAD.md, MAQUETA_V6_TRAZABILIDAD_REVISION.md,
                      maquetas/consulta_documento_v8.html; frontend-docs/src/components/IconoModulo.jsx (iconos de obra).
                      Ajenos: file_system_db.py y routes/documents.py ya traían WIP previo: separar al commitear
TESTS EJECUTADOS:     python -m pytest -q → 2135 passed, 2 failed (los 2 previos: test_reconstruccion_desde_cero y
                      test_capacidades_con_puerta por /api/docs/miniaturas/preparar); test_trazabilidad_sellada 10/10
TESTS PENDIENTES:     ensayo contra base real desechable (herramientas/ensayo_*) de las 4 vías selladas y de la ruta;
                      no se corrió: no se toca base real sin autorización
FALLO CONOCIDO:       los 2 fallos previos de la suite; en producción los eventos de las 4 vías anteriores a hoy saldrán
                      «sin sellar» y su tramo «no íntegro» (es la verdad, no un fallo)
NEXT EXACT ACTION:    backend local reiniciado; PASO 1 HECHO (PanelConsulta, §9 de la propuesta): que el propietario lo
                      pruebe en http://localhost:5183 (docs-ensayo → backend local) y apruebe el paso 3 (ficha completa)
                      14-oct (noche): columnas propias de Archivos (§10), A1 Tipo/Disciplina y B1 plan de entregas
                      automático (docs/ux/PROCORE_VS_ALEPHIA_NUCLEO_DOCUMENTAL.md §4); siguiente: seguir revisando vídeos de
                      Procore (pedido del propietario) y luego A2 (filtros por metadato y vistas guardadas)
DO NOT TOUCH:         DELETE /api/docs/permanent-delete (decisión del propietario); techo de test_perfil_portal y lista
                      SIN_PANTALLA (no subirlos para hacer pasar rutas); protegidos de AGENTS.md §6
COMMIT/HEAD REF:      b03d0fb (sin commits nuevos)
```

## ESTADO ANTERIOR — 14-oct-2026 · IDENTIDAD VISUAL CERRADA (en local)

El propietario: «excelente, esa va a ser nuestra identidad desde ahora; de un momento mejoramos más».
Decisión **D-24** (`docs/AI_DECISIONS.md`, sección H). Fuente de verdad:
[`ux/PALETA_OFICIAL_CLAUDE_DEFINICION.md`](ux/PALETA_OFICIAL_CLAUDE_DEFINICION.md), §1–§12.

```
[WIP HANDOFF]
TAREA:                identidad visual de ALEPHIA (paleta oficial de Claude) en Docs y en View, más los iconos de obra
IMPLEMENTADO:         Docs: tema-claude.css + lista cerrada (27 colores), barra Dark 12 con una sola marca, pulido
                      (títulos 400, raya Orange en lo activo, esquinas de 8 px, sin píldoras, tablas en tarjeta).
                      View: claro con barra Dark 12 (tema-claude.css, barrido de neutros y azules, inversión por
                      propiedad, light-theme de Autodesk y lienzo Light 50). Iconos: design/iconos/iconos-obra.json
                      (60, aprobados, aún sin sustituir al estilo B). Verificado con capturas en los bancos.
PENDIENTE:            1) el propietario revisa View con un modelo y su sesión (localhost:5173 + backend :3000);
                      2) aplicar los iconos de obra en la barra lateral de Docs y en View cuando lo pida;
                      3) decidir si ViewerLabelsBar (protegida, 4D) pasa a claro;
                      4) commit por lista explícita y despliegue, solo con su autorización por acto
ARCHIVOS MODIFICADOS: míos: frontend-docs/src/tema-claude.css, index.css, ~75 ficheros de frontend-docs/src
                      (barridos de color, esquinas, pesos), components/BarraSuperior.*, pages/entradaGris.css,
                      HubPage, SecureProjectsPage, FilesPage, MiTrabajo, public/brand/ALEPHIA_*_Light.svg (Docs y
                      View), frontend-react/src/tema-claude.css, index.css, ~60 ficheros de frontend-react/src
                      (barrido e inversión), components/Viewer.jsx (2 líneas: setTheme y fondo), probar-panel.jsx,
                      design/iconos/iconos-obra.json, docs/ux/* (definición, láminas), docs/AI_DECISIONS.md.
                      Ajenos: el resto del árbol sucio descrito más abajo; Viewer.jsx y otros llevan WIP previo
                      del propietario (hay que separar al commitear)
TESTS EJECUTADOS:     node frontend-react/pruebas/{capturarVistaV2 63/63, restaurarVistaV2 150/150,
                      savedViewV2 111/111, inventoryConfig 20/20, frenteDeVistas 20/20}; builds de Docs y View sin
                      errores; segundas pasadas de los barridos = 0 cambios reales
TESTS PENDIENTES:     espacio de trabajo de View con un modelo cargado (necesita la sesión del propietario);
                      python -m pytest no se corrió (no se tocó el backend)
FALLO CONOCIDO:       ninguno comprobado; sin ver con modelo cargado el riel lateral ni los paneles de Autodesk
NEXT EXACT ACTION:    esperar la revisión del propietario en localhost:5173 y corregir lo que señale
DO NOT TOUCH:         ViewerLabelsBar.jsx, LOB4DExtension.js, predictBim.js, components/lob4d/*, aps/viewer/;
                      el color que es dato (paletas, 4D, filtros, gráficos, marcas PDF/CAD)
COMMIT/HEAD REF:      b03d0fb (sin commits nuevos; local 11 por detrás de origin/main, ver 7-oct)
```

**Respaldos** (directorio temporal de la sesión, `respaldo/`):
`frontend-docs-src-antes-de-la-lista-cerrada.tar`, `frontend-react-src-antes-de-la-paleta.tar`,
`frontend-react-src-antes-de-view-claro.tar`.

## ESTADO OPERATIVO ANTERIOR — 7-oct-2026

Revisión de estado pedida por el propietario («se estuvo haciendo algunos cambios con otra IA, revisa
qué podemos conservar y mejorar»). **Solo lectura**: sin fetch, commit, push, despliegue ni base de
datos. Informe completo: [`REVISION_DEL_ESTADO_07-oct-2026.md`](REVISION_DEL_ESTADO_07-oct-2026.md).

| Campo | Comprobado hoy |
|---|---|
| Rama / HEAD local | `main` / `b03d0fb`; **0 commits propios, 11 por detrás** de `origin/main` |
| Punta del remoto | `git ls-remote origin main` → `03095cb`, igual que la referencia local: no hay nada más arriba |
| Backend público | `/api/health` → `status=ok`, `rama=main`, `version=03095cb87b2d`, configuración completa (7/0). **El despliegue que el traspaso del 28-sep daba por pendiente ya se hizo.** |
| Portal público | sirve puente ACC («Vincular ACC»), revisión CAD («Nueva observación» en `CadViewer-*.js`), pantallas grises (`entrada-gris`) y la casilla de 30 días |
| Visor público | sirve la ortofoto (`ortofoto`/`Ortofoto` en su principal) |
| Árbol de trabajo | 53 ficheros idénticos a `origin/main`, **38 con cambios locales encima**, ~75 ficheros nuevos de código y documentación, y ~1.700 de ruido (465 MB en `.build-*-check`) |
| Suite backend | `python -m pytest -q` → **2119 aprobadas, 2 fallidas** (90 s) |

**Corrección a un traspaso anterior:** el handoff del 28-sep dice que el bootstrap «no construye» las
tablas de revisión CAD. No es exacto: `bootstrap_esquema.py:111` registra `ensure_cad_review_tables`.
Lo que está desactualizado es `backend/esquema_manifiesto.txt`, que se genera midiendo una
reconstrucción real y no se volvió a medir tras añadir esas tablas.

**Hallazgo con efecto en producción:** en `backend/file_system_db.py` del remoto, `es_admin_de_obra()`
se invoca antes de que exista el `cursor`; el `NameError` lo traga el `except` y `is_admin` queda
siempre en falso, así que **hoy ningún administrador de obra se reconoce como tal en el listado
documental** (ve de menos, nunca de más). El árbol local ya lo corrige y trae prueba nueva
(`backend/tests/test_docs_local_list_admin.py`), sin commitear.

**NEXT EXACT ACTION:** que el propietario decida el orden del §5.2 del informe y autorice, por acto,
la reconciliación de `main` local con `origin/main` antes de commitear nada desde este árbol.

## ESTADO OPERATIVO ANTERIOR — 28-sep-2026

Esta sección prevalece sobre las fotografías históricas de abajo. Se verificó
con `git status --short`, `git rev-parse HEAD`, `git log`,
`git merge-base --is-ancestor` y `GET /api/health`; no se hizo fetch, push ni
deploy.

| Campo | Estado comprobado |
|---|---|
| Rama / HEAD local | `main` / `b03d0fb2e4be4013c460c746cb4415da9619e0f6` |
| **CODE BASELINE HEAD (baseline local registrado)** | `cdf7837545747b3d39cd93ff070af30dd7aa7b9c`; es ancestro del HEAD local. El 26-sep `/api/health` de Virginia informó `802ff0de5393`; aún no se verificó su relación con este checkout. |
| Backend público verificado 28-sep | `/api/health` informó `dad8851727b2`; la ruta de revisión CAD está activa, pero el editor recibió 403 en la consulta del vínculo ACC. El arreglo posterior sigue sólo local. |
| Frontend desplegado | El propietario desplegó `visor-ecd-portal` desde `7aba9ad798821b99b07841b84d0ea1cf8bd18007` y confirmó en la web pública que el puente ACC funciona. La comprobación sin sesión vio el asset con «Vincular ACC». |
| Historial posterior al baseline | `git log cdf783754574..HEAD` incluye commits **funcionales**, no sólo documentales. Las afirmaciones antiguas de que sólo había handoffs por encima de `3e413cd` ya no describen el checkout. |
| Remoto local | `origin/main` figura 8 commits por delante de `main` en la referencia local; no se actualizó con fetch. No integrar automáticamente sobre el worktree sucio. |

**LAST COMPLETED TASK:** cerrado localmente el rebote al login de Docs en
`localhost:5174`, conectado a Virginia por autorización expresa. En la pestaña
de ensayo que conservaba `DEMO_TOKEN`, dos rutas del proyecto respondieron
`401` y devolvían al login; ahora ese token de ensayo se descarta antes de
renderizar Docs con backend real. Vite DEV ya no registra el service worker
que podía cachear módulos `/src/*` sin hash; el publicado conserva su SW.
El propietario ingresó con su cuenta real en Chrome. Se comprobó allí
PQT8_TALARA, las cinco carpetas principales, la carpeta
`01_WIP_Trabajo_En_Curso/Componente 11.2` con dos elementos y, después de
dos recargas F5, la misma sesión y los mismos dos elementos. No hubo nuevos
`401` de sesión en esa pestaña. Se retiró la instrumentación temporal.
`npm test` → 14 bancos verdes; ESLint focalizado → 0 errores; build a carpeta
temporal → 467 módulos. `5182` y `dist-local` no se alteraron. `5174` usa
datos reales: toda escritura allí afectaría Virginia. Sin commit, push ni deploy.

**27-sep · ESTADO EXTERNO CONFIRMADO EN ESTE HILO:** el propietario desplegó
manualmente backend Virginia y portal Docs desde `7aba9ad`; `/api/health`
respondió `status=ok`, `rama=main`, `version=7aba9ad79882`, y el portal público
sirvió un asset que contiene «Vincular ACC». El propietario probó el puente en
la web y confirmó que funciona. Esto actualiza el estado operativo externo;
las entradas anteriores que dicen «aún no desplegado» son historia, no tareas
pendientes. No se hizo un acto Git ni de Render en esta actualización.

**CURRENT TASK (28-sep):** la revisión CAD ya fue migrada y desplegada por actos
separados; el propietario abrió el mismo plano como administrador y editor y
reportó que el editor recibe 403 `PROJECT_UNRESOLVED`. Pidió también ver fotos
y documentos referenciados en una ventana flotante, con iconos simples. La
corrección se envió a GitHub en `03095cb`, pero aún no se desplegó; ver último handoff.

**28-sep · DECISIÓN DEL PROPIETARIO SOBRE LA PRUEBA:** no usar más el backend
de ensayo `3000` ni una base desechable para revisión CAD. Conservar `3000`
intacto; su limpieza se decidirá más adelante. Trabajar primero en el código
local oficial (`5174`, que consulta Virginia) y, cuando el cambio esté listo,
habilitarlo y probarlo en la web real mediante las autorizaciones específicas
de migración, commit, push y despliegue. No fingir persistencia local mientras
Virginia carece de la API; la UI debe desactivar esas herramientas con una
explicación discreta.

**28-sep · COMMIT Y PUSH CAD SELECTIVOS:** tras autorización expresa del
propietario y su decisión informada de permitir el push con la verificación de
esquema pendiente, se creó `dad8851727b278d4b310ca7e13f14d28b8fc129a`
sobre el `main` remoto `7aba9ad` y se empujó con avance normal. Sólo 15 rutas
de revisión CAD; en `backend/server.py` sólo los dos hunks de registro. El
`main` local `b03d0fb` y su índice normal siguen intactos. `/api/health` de
Virginia siguió en `7aba9ad` después del push: NO hay migración, deploy ni
función activa en la web. Suite backend 2115 aprobadas/2 fallidas (manifiesto
CAD nuevo y miniaturas histórica); se documentó en el cuerpo del commit.

**28-sep · MIGRACIÓN CAD APLICADA EN VIRGINIA:** el propietario autorizó por
acto aplicar `backend/sql/33_revision_cad.sql` en la cuenta Cloud SQL real.
Cloud SQL Studio confirmó proyecto `correos-gmail-425301`, instancia
`pqt-08-talara`, base `postgres` y `current_user=ecd_migrator`. Antes de la
ejecución ambas tablas CAD no existían. Se comprobó que el SQL local coincide
byte a byte, tras normalización Git, con el blob del commit `dad8851`
(`37bc2695b197f73ca304b540256a799a4600176d`). La transacción terminó
sin error; el catálogo pasó de 120 a 122 tablas. Verificación posterior de
solo lectura: ambas tablas, tres índices, dos columnas de borrado y permisos
SELECT/INSERT/UPDATE de `ecd_app` en ambas tablas = true. No se desplegó
backend ni portal, ni se tocó ACC/GCS o datos de documentos. Se mantiene la
necesidad de autorización separada para cada Manual Deploy y de UAT real.

**TAREA ANTERIOR (27-sep, actualización histórica):** conservar en el mismo local el puente
temporal ALEPHIA Docs→ACC **sólo para formatos Autodesk** y el vínculo manual
persistente por carpeta hasta cambiarlo o desactivarlo; no crear ni borrar
carpetas/archivos ACC automáticamente. El propietario confirmó la UAT de la
primera versión. Detectó que al subir V2 ACC vuelve a mostrar «Procesando»
pero ALEPHIA no: `MatrixTable` basaba el sondeo sólo en el ID estable del
documento. Se corrigió la identidad del sondeo para incluir versión y GCS URN;
hay cambios locales de robustez de subida y remapeo documentados al final.
El selector ACC tiene un botón en la barra de la carpeta actual sólo para el
administrador global y sin archivos seleccionados, además del menú contextual;
la barra indica el proyecto/carpeta ACC ya vinculados. En el lector de un
archivo servido por ese puente se ocultan el rótulo y el cambio de vista ACC;
el vínculo manual de otros archivos se conserva. El propietario confirmó en
`5174`: «okey ahora si. asi quisiera que quede». El backend vuelve a comprobar
el rol al guardar.
La UAT del propietario fue en `PQT8 TALARA (PRUEBAS)`, no en el expediente
real. Es el mismo árbol de código local, pero datos aislados. Sólo la carpeta
de ensayo tenía el puente activo en la última comprobación. El 27-sep, tras
confirmar que no había subidas en curso, se devolvió el mismo Vite `5174` de
`dev:ensayo` al modo `dev` habitual; ahora `/api/health` en `5174` informa la
versión Virginia `802ff0de5393`. El backend de ensayo `3000` quedó intacto.
El botón ACC estuvo temporalmente deshabilitado en modo habitual porque
Virginia aún no tiene las rutas nuevas. Por petición expresa del propietario,
el 27-sep se retiró ese bloqueo y el rótulo «Vista local · sin guardar» del
frontend local: el botón ahora abre el selector en el mismo `5174`, pero
guardar contra Virginia sigue sin estar soportado hasta actualizar allí el
backend. No se realizó vínculo ni subida de prueba. La UAT de V2 sigue
pendiente. No se leyó ni editó `.env*`, ni hubo commit, push o despliegue.

**27-sep · PREPARACIÓN DE RELEASE, SÓLO LOCAL:** el propietario pidió aislar
esta mejora sin alterar el resto. Docs pasó 19/19 bancos y el build 470
módulos; las pruebas focalizadas del puente pasaron 40/40. La suite backend
completa quedó en 2104 aprobadas y 2 fallidas (miniaturas sin puerta y techo
de rutas del perfil portal); no se proclama GREEN. Hay además un posible
agotamiento del pool de conexiones al confirmar ocho cargas a la vez, aún no
medido. Ver el último `[WIP HANDOFF]` para el próximo paso exacto. No hubo
commit, push ni deploy.

**27-sep · REVERIFICACIÓN DE PUBLICABILIDAD, SÓLO LECTURA:** repetidos los
bancos del puente (40/40), Docs (19/19) y build temporal (470 módulos); todos
pasaron. Repetida la suite backend oficial: 2104 aprobadas y 2 fallidas.
`/api/docs/miniaturas/preparar` ya existe en HEAD y explica el fallo de
capacidad huérfana, ajeno al puente. El puente añade cuatro rutas ACC nuevas
en `docs_cad.py`; el perfil portal cuenta 289 frente al techo `<286` y
requiere una decisión explícita sobre ese perímetro, no subir el umbral a
ciegas. Revisión estática de concurrencia: un worker Gunicorn tiene 8 threads,
el pool admite 15 conexiones y cada confirmación mantiene una conexión de
lock mientras toma al menos otra; 8 × 2 = 16 en el peor caso. El riesgo aún
no se ensayó con un banco simulado. No se alteró código funcional, procesos,
DB, ACC, GCS, Git remoto ni Render.

**27-sep · PREPARACIÓN PUNTUAL DEL BACKEND DEL PUENTE, SÓLO LOCAL:** se añadió
un banco sin DB/GCS/ACC reales que reproduce ocho confirmaciones de subida
contra un pool de quince conexiones: antes del arreglo, una respondió 500 por
agotamiento. `uploads.py` ahora limita a cinco las confirmaciones simultáneas
por proceso, reservando cinco conexiones para otros usos; el banco pasó y
las pruebas focalizadas quedaron 41/41. La suite backend oficial se repitió:
2105 aprobadas, los mismos 2 fallos (miniaturas preexistente y presupuesto de
rutas portal). No se cambió ningún umbral de prueba. Se delimitó el backend:
`acc_emergency_bridge.py`, `enlaces_firmados.py`, `routes/docs_cad.py`,
`routes/documents.py`, `routes/uploads.py`, más sólo el callback del puente
en `file_system_db.py` y bancos asociados; el cambio de permisos ajeno en
ese último archivo NO pertenece al paquete. Sin staging, commit, push,
despliegue, reinicio ni escrituras reales.

**27-sep · CIERRE DE LA ALARMA ACC, SÓLO LOCAL:** `test_perfil_portal.py`
ahora exige exactamente las cuatro rutas ACC del puente y mantiene el techo
histórico `<286` para todas las otras rutas; no se aumentó ese umbral. El
banco portal + puente pasó 47/47. La suite backend oficial pasó 2106 y falló
únicamente en la ruta preexistente y ajena `/api/docs/miniaturas/preparar`,
sin pantalla; no se ocultó ni modificó esa falla histórica. El paquete backend
puede separarse por hunks: `backend/file_system_db.py` sólo aportaría el
argumento/callback `on_version_created` (dos hunks), NO el cambio previo de
permisos de listado. El `main` local está ocho commits detrás de la referencia
local `origin/main`, sin solapamiento de rutas de puente observado; no se hizo
fetch ni integración, y no se debe hacer push directo desde ese `main`.

**27-sep · PAQUETE SELECTIVO COMPROBADO, SIN COMMIT:** con un índice Git
temporal fuera del repositorio se preparó el árbol candidato de sólo nueve
rutas: `backend/acc_emergency_bridge.py`, `backend/enlaces_firmados.py`,
`backend/file_system_db.py`, `backend/routes/docs_cad.py`,
`backend/routes/documents.py`, `backend/routes/uploads.py`,
`backend/tests/test_acc_emergency_bridge.py`,
`backend/tests/test_docs_acc_link.py` y `backend/tests/test_perfil_portal.py`.
En `file_system_db.py` se rechazaron los dos hunks del arreglo de permisos
ajeno y se admitieron sólo los dos de `on_version_created`. El diff candidato
tuvo 9 archivos, 1910 inserciones y 37 eliminaciones, sin errores de
`git diff --cached --check`; su diff de `file_system_db.py` mostró únicamente
7 adiciones y 1 eliminación del callback. El índice normal del propietario
permaneció vacío. El índice temporal exacto se eliminó tras verificarlo;
no hubo commit, push, despliegue, fetch ni cambio de datos reales.

**27-sep · BASE REMOTA Y SERVICIO VIVO COMPROBADOS, SÓLO LECTURA:**
`git ls-remote origin refs/heads/main` devolvió
`89fe030c59844db225d9717ae473a99b1c970b93`, igual a la referencia
local `origin/main`; no se hizo fetch. `GET /api/health` de Virginia devolvió
`status=ok`, `rama=main`, `version=802ff0de5393`. Ese commit es ancestro
de `89fe030`; los tres commits posteriores no cambiaron `backend/` ni
`frontend-docs/`. Entre el HEAD local viejo `b03d0fb` y el remoto actual no
cambió ninguno de los nueve archivos seleccionados del puente. Por tanto el
paquete aislado puede prepararse sobre `89fe030` sin arrastrar versiones
antiguas de esos archivos, pero NO se debe avanzar o empujar el `main` local
viejo. Revalidar remotos y health inmediatamente antes de cualquier acto Git
o Render autorizado por separado. No hubo commit, push, deploy ni escrituras.

**27-sep · COMMIT Y PUSH SELECTIVOS DEL PUENTE ACC:** por autorización
explícita del propietario se creó el commit
`7aba9ad798821b99b07841b84d0ea1cf8bd18007` sobre el entonces `main`
remoto `89fe030c59844db225d9717ae473a99b1c970b93` y se empujó con
avance normal a `origin/main`. Su diff contra el padre contiene sólo 24 rutas
de la integración Docs/ACC: nueve de backend (en `file_system_db.py` sólo
los dos hunks `on_version_created`), catorce de frontend Docs y la defensa
JSON de `apiFetch.js`; no arrastra Viewer/LOB, ortofoto, permisos ajenos,
ficheros de obra, secretos ni este documento. El mismo checkout principal
sigue en `main`/`b03d0fb` con su worktree e índice normal intactos: se usó
un índice Git temporal para no mezclar WIP ni mover el HEAD sucio. En el
paquete aislado pasaron 31/31 pruebas backend ACC, 17/17 bancos Docs y build
Docs de 469 módulos; en el worktree pasaron 47/47 pruebas focalizadas.
La suite backend completa del paquete aislado no se pudo recolectar porque
`test_inventory_identity_core.py` importa `backend/prototypes`, que no está
versionado en `origin/main`; no se incorporó ese prototipo al commit. La
suite completa del worktree tenía 2106 aprobadas y un fallo histórico ajeno
de miniaturas. `git ls-remote` confirmó el nuevo hash en GitHub; Virginia
continuó en `802ff0de5393` por `/api/health`. No hubo deploy, activación de
flags ni modificación de datos reales. El push NO significa que el puente
esté activo en producción.

**27-sep · RELEVO DE TERMINAL 5174:** el propietario quiere ejecutar Vite
desde su propia terminal de VS Code. Se comprobó que el proceso en `::1:5174`
era exactamente el Vite iniciado por este agente (PID 26564), se detuvo sólo
ese proceso y se verificó que el puerto quedó libre. El propietario puede
ejecutar `npm run dev` desde `frontend-docs`; el backend 3000 no se tocó.

**27-sep, 14:08 · REINTENTO DE UAT:** el propietario intentó `canal.dwg` y
`/api/uploads/init` devolvió 500 antes de crear una sesión: la carga de `.env`
introdujo la ruta deliberadamente inexistente de credenciales GCS en el
proceso. Se comprobó 0 sesiones pendientes y se reinició sólo el backend
local 3000 con `GOOGLE_APPLICATION_CREDENTIALS` vacío en el entorno del
proceso, de modo que `load_dotenv(override=False)` no reponga la ruta y use
ADC; no se leyó ni editó `.env*`. ADC accede al bucket de ensayo y Docs lista
8 archivos; `/api/health` de 5174 responde `ok`. ADC de usuario no puede
firmar URLs GCS para descargas originales, limitación que debe observarse en
la UAT y no confundirse con la carga. El propietario debe reintentar la carga
desde la misma carpeta; en ese momento el ensayo paralelo/CORS seguía sin
resultado real.

**27-sep, 14:15 · UAT `canal.dwg`:** el reintento creó la fila local
`230e9ced-82ea-4f8a-b2c5-039b4f62d496` de 711376 bytes a las 14:15:03.
La versión registra `direct_upload=true`, `uploaded_at=14:15:05`,
`ready_at=14:15:51`, `attempts=1`, sin error, y tiene item ACC. El propietario
confirma que ya lo ve en ACC. `/api/uploads/pending` devolvió 0 y
`POST /api/docs/cad/estados` devolvió `success` para esa fila; el listado Docs
la incluye como noveno archivo. **El envío directo funcionó**: no se ejecutó
la segunda copia GCS→ACC para esta versión. Estas marcas no miden el tiempo
desde la selección del archivo, pues la fila se crea tras terminar las dos
transferencias. El propietario aclaró que ACC estaba listo y ALEPHIA tardó
~10 s más en dejarlo entrar, no que la subida seguía realmente activa. El
lector consulta el vínculo cada 10 s, la lista cada 15 s y el backend limita
consultas del manifiesto ACC a cada 15 s; esas cadencias explican un retraso
visual de segundos que no crece con el tamaño del DWG. Se añadió sólo en local
un refresco del lector al volver a la pestaña, coalesciendo foco/visibilidad,
sin subir la frecuencia periódica ni tocar la traducción normal. Docs 19 bancos,
build 470 módulos y ESLint focalizado 0 errores; falta UAT del refresco con
otro archivo pendiente. No pedir otra subida sólo para probarlo sin acordarlo.

**27-sep, 14:52 · SEGUNDA UAT `CANAL_SANTARITA.dwg`:** el propietario subió
otro DWG de 8217313 bytes en la misma carpeta. La fila local
`c6baa78a-f130-4991-b8e8-1a1ad2c36fbc` se creó a las 14:51:59;
`direct_upload=true`, `started_at=14:52:00`, `uploaded_at=14:52:02`,
`checked_at=14:52:40` y `ready_at=14:53:04`, un intento, sin error. El
propietario vio ACC listo mientras ALEPHIA aún decía «Procesando», pero
confirmó que terminó aproximadamente un minuto después. GET ACC link ya
devuelve vínculo, POST `/api/docs/cad/estados` devuelve `success` y no hay
subidas pendientes. La espera registrada entre la subida ACC y la vista lista
es de 62 s; no es una segunda transferencia GCS→ACC. La hora exacta en que
ACC mostró «listo» al propietario no fue medida, por lo que no se atribuye
todo ese minuto al sondeo de ALEPHIA. No aumentar consultas APS por inferencia.

**27-sep, 15:05 · TERCERA UAT y desfase reconocido:** el propietario insistió,
correctamente, en que midió ~1 min entre «ACC listo» y «ALEPHIA dejó de decir
Procesando» en el caso de 8 MB. Es una medición de pantalla válida; las marcas
del backend no la invalidan. En la nueva carga de 73718446 bytes,
`500125-CSSP001-780-XX-DR-HD-011246.dwg`, `/api/uploads/init` respondió a
las 14:58:12 y la fila local se creó a las 15:04:24; ACC directo registró
`uploaded_at=15:04:26`, `checked_at=15:04:58` y `ready_at=15:05:15`, sin
error. Durante la carga GCS la sesión mostró 40 MiB/56,9 %; después quedaron
0 sesiones pendientes. No se reinició ningún servicio. Se observó que la
lista Docs sólo consulta CAD cada 15 s mientras haya estado pendiente y no
tenía consulta al recuperar foco; Chrome puede demorar timers de una pestaña
oculta. Se añadió en local una única consulta de estados al volver a la
pestaña, coalesciendo `focus`/`visibilitychange` y conservando el sondeo
periódico. Esto ataca un retraso claro de UI, pero no se afirma que explique
por sí solo todo el minuto sin una UAT de foco medido. Docs `npm test` 19/19,
build 470 módulos, ESLint focalizado 0 errores tras retirar una variable
desestructurada sin uso en la misma tabla. El usuario fue invitado a decir
cuándo vio ACC listo para comparar con ALEPHIA, sin subir otra copia.

**ACLARACIÓN DEL PROPIETARIO:** para `CANAL_SANTARITA.dwg` (~7,8 MiB),
ACC **ya había traducido y procesado el archivo** y ALEPHIA mantuvo
«Procesando» aproximadamente **un minuto más**. No pedirle que vuelva a medir
ni usar `ready_at` del backend para refutarlo: son relojes de eventos distintos.
Tratar ese minuto adicional como problema real de actualización en ALEPHIA.
El refresco al volver a la pestaña está implementado en local, pero no se ha
comprobado que elimine el minuto completo; no declarar resuelto.

**26-sep · ENSAYO LOCAL DOCS→ACC SOBRE EL ARCHIVO EXISTENTE:** el dueño aclaró
que `ALINEAMIENTOS.dwg` ya está en ALEPHIA Docs y en ACC; no se requiere
duplicarlo ni cargar una ficha CAD de ensayo. El mismo Vite `5174` conserva su
proxy a Virginia y, al entrar con `?acc_preview=1`, activa un recorrido local
de sólo lectura: enumera ACC por los GET que View ya utiliza, selecciona una
versión preparada y muestra su URN directamente con `CadViewer`, sin `POST
/job`, sin escritura de vínculo en Virginia ni en ACC. La elección se guarda
en `sessionStorage` de esa pestaña, ligada al documento, versión y GCS URN, y
debe sobrevivir a F5 sólo allí. `?acc_preview=0` desactiva el modo tras
recargar. Sin el parámetro/estado de ensayo, el comportamiento normal de
`5174` no se altera; la ruta persistente nueva sigue pendiente de publicación
autorizada y no se confunde con esta prueba. Pruebas automáticas: 16 bancos
frontend verdes, lint focalizado 0 errores, build temporal 468 módulos. El
navegador de la app estaba en login durante la primera revisión. Después el
propietario eligió `ALINEAMIENTOS.dwg` V1 en ACC y mostró la vista 2D en Docs.
Se recargó la misma pestaña local: volvió el distintivo «Prueba local · V1»,
el panel «2D View · Espacio modelo» y el dibujo visible. **UAT local de
selección, visualización y F5: comprobada.** Esto no demuestra aún el vínculo
persistente entre navegadores. No se tocó 5174, el hash de Vite sigue idéntico
y `GET /api/health` de 5174 continúa en Virginia `802ff0de5393`.

**26-sep · CURRENT TASK — PUENTE TEMPORAL POR CARPETA, SÓLO CÓDIGO LOCAL:**
por petición expresa del propietario se implementó un opt-in de una carpeta
ALEPHIA Docs exacta hacia una carpeta ACC existente para CAD nuevos. El
cortacircuito global `ACC_EMERGENCY_BRIDGE_ENABLED` queda apagado por defecto;
sin él, la traducción habitual sigue. El trabajo por versión se guarda en
metadata, sin migración ni copia del proyecto. Al activarlo en el futuro, el
backend copiaría el original de GCS a ACC sin llamar a Model Derivative
`POST /job` y sólo ofrecería la vista cuando ACC confirme el manifiesto.
La configuración es de administrador; en Vite DEV el menú requiere además
`?acc_bridge=1`, porque el 5174 actual sigue apuntando a Virginia, cuyo backend
no incluye estas rutas. No se configuró carpeta, no se activó el interruptor,
no se ejecutó copia ACC real, no se cambió 5174 ni se publicó. Si el nombre ya
existe en ACC sin vínculo persistente previo, el primer `POST items` falla
cerrado: no se sobrescribe un documento ajeno por coincidencia de nombre.
Estado WIP: pruebas simuladas y build verdes, pero falta ensayo integral con
un CAD de prueba y autorización expresa para esa única escritura remota.

**26-sep · UAT LOCAL DE SELECTOR, RESTAURADO:** por autorización expresa se
reinició el backend local `3000` para cargar las rutas ya escritas y se cambió
temporalmente el MISMO Vite `5174` a `dev:ensayo`; no se editó su configuración.
En el proyecto aislado `PQT8 TALARA (PRUEBAS)`, la cuenta demo administradora
vio «Puente temporal ACC» en el menú de una carpeta y el selector navegó por
el hub del propietario hasta `PQT8 - DRENAJE PLUVIAL TALARA / Project Files /
ARCHIVOS_AYUDA_VALO`. El cortacircuito global permaneció apagado; no se pulsó
«Guardar pareja», no se subió el DWG y el GET de configuración confirmó
`bridge=null`, `service_enabled=false`. Tras la prueba se cerró la pestaña
temporal de Chrome y `5174` volvió a modo normal: `/api/health` informa
`802ff0de5393`, hash SHA-256 de `frontend-docs/vite.config.js` idéntico
`0D326D0EF884A00CC7947EB7DB1B218D27846D6E0C03BB33910AFAA6EB36E388`.
La pestaña Chrome del propietario seguía abierta con su proyecto real; la
pestaña interna ensayada quedó en login al regresar al backend real, sin
manipular credenciales. La vinculación persistente y el envío del DWG siguen
PENDIENTES y necesitan autorización separada.

**EXPECTED WORKTREE (25-sep, superpuesto al inventario histórico):** checkout
intencionadamente sucio. Cambios de este trabajo: `backend/routes/orthophoto.py`,
`backend/orthophoto_local_store.py`, `backend/tests/test_ortofoto_semanal.py`,
`backend/tests/test_ortofoto_local_store.py`, `docs/visor/05_ORTOFOTO_CANAL.md`,
este fichero y los archivos de integración identificados por ruta exacta en
los handoffs. La entrada local de Docs añade `frontend-docs/src/LoginScreen.jsx`,
`frontend-docs/src/utils/accesoLocal.js`,
`frontend-docs/pruebas/accesoLocal.prueba.mjs`,
`frontend-docs/vite.config.js`, `frontend-docs/package.json`,
`frontend-docs/src/App_Refactor.jsx`, `frontend-docs/src/hooks/useUser.js` y
`frontend-docs/pruebas/origenDocsDev.prueba.mjs`. El diagnóstico del rebote
añade `frontend-docs/src/main.jsx`, `frontend-docs/public/sw-campo.js` y
`frontend-docs/src/utils/apiFetch.js`. La integración ACC añade exclusivamente `backend/routes/docs_cad.py`,
`backend/tests/test_docs_acc_link.py`, `frontend-docs/src/components/AccLinkPicker.jsx`,
`frontend-docs/src/components/DocumentViewer.jsx` y `frontend-docs/src/pages/FilesPage.jsx`.
Permanecen ajenos/protegidos, entre otros,
`frontend-react/src/aps/viewer/`, `frontend-react/pruebas/viewerFacade.prueba.mjs`,
los cambios LOB/4D y los archivos de obra/PDF listados en `git status --short`.
`frontend-react/src/components/AvancePorAgrupacion.jsx` ya era WIP ajeno
untracked; esta unidad cambió sólo tres líneas de su umbral/leyenda/comentario.
La prueba Docs→ACC añade `frontend-docs/pruebas/accLinkRespuesta.prueba.mjs`
y cambios focalizados en `frontend-docs/src/utils/apiFetch.js`,
`frontend-docs/src/components/DocumentViewer.jsx` y el selector untracked
`frontend-docs/src/components/AccLinkPicker.jsx`.
El ensayo local opcional añade `frontend-docs/src/utils/accPreviewLocal.js` y
`frontend-docs/pruebas/accPreviewLocal.prueba.mjs` (ambos nuevos), y hunks
focalizados en `DocumentViewer.jsx` y `AccLinkPicker.jsx`; no altera
`vite.config.js`, el backend ni datos remotos.
El puente temporal añade `backend/acc_emergency_bridge.py`,
`backend/tests/test_acc_emergency_bridge.py`,
`backend/enlaces_firmados.py` (propósito de ticket ACC),
`frontend-docs/src/components/AccFolderBridge.jsx`,
`frontend-docs/pruebas/accBridgeTemporal.prueba.mjs`, y hunks focalizados en
`backend/file_system_db.py`, `backend/routes/docs_cad.py`,
`backend/routes/documents.py`, `backend/routes/uploads.py`,
`frontend-docs/src/components/ContextMenu.jsx`,
`frontend-docs/src/components/DocumentViewer.jsx` y
`frontend-docs/src/pages/FilesPage.jsx`. El prototipo paralelo añade
`frontend-docs/src/utils/accParallelUpload.js` y
`frontend-docs/pruebas/accParallelUpload.prueba.mjs`, y un hunk focalizado en
`frontend-docs/src/hooks/useChunkedUpload.js`. El build de comprobación local generó
`.build-acc-bridge-check/` (salida compilada untracked, no proyecto ni datos);
no se incluye en ninguna operación de Git.
No se consideran parte de esta tarea ni se añaden por patrón. Para una operación
de Git, cotejar siempre el `git status --short` completo y detenerse ante una
ruta nueva no registrada. **No hay un build de checkout limpio demostrado:**
`Viewer.jsx` importa `ViewerFacade` untracked y `App.jsx` también contiene
imports de WIP ajeno. No publicar el worktree entero ni un commit que arrastre
esos imports sin resolver la frontera de autoría.

**Auditoría read-only de la frontera de release (25-sep):** en `App.jsx`, la
integración de ortofoto, `removeLinkedModel`, diagnóstico de extracción,
`reextractModel` y `scopeId` convive con imports, estados, botones y render de
`Visor4D`/`AvancePorAgrupacion` ajenos. En `Viewer.jsx`, el scroll por frente y
la clasificación de hojas conviven con el import y los guards de
`ViewerFacade` protegido. Hay hunks contiguos en los imports: no se pueden
añadir estos archivos enteros ni asumir que un build del worktree representa
un checkout limpio. Sólo se inspeccionó `git diff`; no hubo staging ni commit.

Las secciones de 6-sep (`BRANCH / HEAD`, `PRODUCTION`, `EXPECTED WORKTREE`,
`CURRENT TASK` y `STATUS`) se conservan como evidencia histórica, **no** como
instrucciones operativas actuales.

---

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

| Campo | Valor |
|---|---|
| Rama esperada | `main` |
| **CODE BASELINE HEAD** | **`3e413cd`** (`3e413cd880fa1093afc4b4759422044e4642c2d6`, 6-sep-2026 15:09 -05) |
| Current HEAD | **consultar en vivo con `git rev-parse HEAD`. No se incrusta aquí.** |
| Production code baseline | `3e413cd` — backend y frontend desplegados corresponden a este commit |
| Handoff protocol introduced after baseline | **Sí** |

### Qué es `CODE BASELINE HEAD` y por qué no se escribe el HEAD actual

- Es el **último commit funcional desplegado**: el último que cambia código de
  producto. `3e413cd` cierra Saved Views 2.0 (E-7).
- **Producción corresponde a ese baseline**, backend y frontend
  (`/api/health` → `version 3e413cd880fa`; el bundle servido lleva las marcas de
  E-5/E-6/E-7).
- Por encima del baseline **pueden existir commits exclusivamente de
  documentación / handoff**. No mueven producción y **no** son una divergencia:
  el baseline sigue siendo ancestro del HEAD.
- **`CURRENT HEAD` se obtiene siempre en vivo** con `git rev-parse HEAD` y
  **no se incrusta como requisito autorreferencial**. Escribir aquí el hash del
  commit que contiene este fichero es circular: cambiarlo cambia el commit, y
  cambiar el commit cambia el hash. Por eso lo que se verifica es
  **ascendencia**, no igualdad —
  `git merge-base --is-ancestor 3e413cd HEAD` — según `../AGENTS.md § 9`.
- `origin/main` iba en `3e413cd` cuando se midió, y **se queda ahí hasta que el
  propietario autorice el push**. Que el local vaya por delante en commits
  documentales es lo esperado, no una anomalía.


Commits posteriores al baseline compatibles con el estado declarado: tres
commits documentales (`8f58a4b`, `cf7a845`, `336e09c`), dos de identidad
protegida (`be114a1`, `06f9a9a`), integración/cutover B1 (`5113e67`,
`89cdc79`) y B2 (`e3218e6`, `8495ad7`). El nuevo commit documental de
sincronización no cambia el baseline funcional desplegado. La referencia
local observada `origin/main` es `cf7a845`; no se hizo fetch ni push.

Historia funcional hasta el baseline:

Posteriores declarados adicionales: `0cf10a5` (handoff), `b7014be` (bloqueo),
`71d23c7` (corrección B2 autorizada) y el commit funcional de checkpoint B3 descrito
en STATUS. Ninguno se desplegó ni cambia el CODE BASELINE de producción.
El handoff documental posterior `docs(filters): prepare b3 independent review checkpoint`
sólo fija el estado de revisión; no duplica ni modifica el commit funcional B3.

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

**FILTERS CORE — B1 = CODE/TEST GREEN.** Identidad
`(scope_id, source_lineage, external_id)` integrada extremo a extremo: migración
**31** numerada y aplicada en desechable, `inventory_identity.py` como única
autoridad, rutas Inventory reales (lectura, PATCH, bulk, extracción), payload
cualificado y frontend que conserva la identidad. Ensayo integrado **23/23**,
identidad 4D/5D **7/7**, suite backend **1721 passed / 1 failed** (el fallo
documentado del backlog nº 1). Los KNOWN FAIL de B2 siguen visibles y **ninguno
desapareció**. Baseline de navegador: **NOT EXECUTED / ENVIRONMENT**.
B1 GREEN no significa Filters terminado. B2 posterior se documenta en LAST COMPLETED; misión vigente en CURRENT TASK.

**Revisión adversarial de la integración: PASS**, con dos defectos encontrados y
corregidos. El cutover es **fail-closed demostrado por código**, no por
documentación: `db.py` fija `search_path` a la proyección canónica y **falla al
arrancar** si falta la migración 31, sin caer nunca a `public.inventory_assets`;
la 31 revoca la escritura legacy a `ecd_app`; y la lectura devuelve **409** en
vez de un 200 incompleto —`INVENTORY_REEXTRACTION_REQUIRED` para lo nativo y
`LEGACY_USER_DATA_PENDING` para la metadata humana—. Ensayo integrado **24/24**.

## LAST COMPLETED

**B5 · CODE/TEST GREEN / COMMITTED, 8-sep-2026. FILTERS CORE HOST READY.**
Checkpoint funcional `e1a16016c192bb8674fb576294771138e29d2df6`.
Build limpio y ensayo backend/frontend desde ese mismo SHA verificados:
516 módulos/15,24 s, PG18 25/25. WIP ajeno intacto, ViewerFacade 0 líneas
incluidas. [Resultados B5](filters/B5_RESULTADOS.md) y
[campaña HOST/release](filters/B5_HOST_RELEASE.md).
Este cierre documental posterior no cambia producto ni el baseline desplegado.
HOST real: NOT EXECUTED / ENVIRONMENT; no confundir HOST READY con HOST GREEN.

**B3 · revisión adversarial independiente, 8-sep-2026: PASS.** Un defecto real
encontrado y corregido, más dos mediciones que se hacían a través de un paso de
limpieza.

- **L2 — el color de Filters sobrevivía a `dispose()`.** El driver restauraba
  los ganchos y vaciaba `painted` sin retirar el tinte: el driver siguiente
  arranca con `painted` vacío, así que nadie podía volver a quitarlo. Sobrevivía
  al OFF, a la revisión nueva y al remount. `dispose()` retira ahora lo que
  Filters pintó, y sólo eso: si otra herramienta tomó el color, `painted` ya
  estaba vacío. Mutante dirigido `dispose-leaves-orphan-color`: sin el arreglo
  quedan 3 modelos tintados.
- **L1 — dos casos medían `painted` después de `dispose()`.** Con el driver
  anterior daba igual, porque `dispose` no tocaba el color; el arreglo lo
  destapó. Se mide antes, sin cambiar ningún valor esperado: lo que afirman es
  que el trabajo de color completa —o que apagarlo no deja cola—, no lo que
  queda tras el desmontaje.
- **L1 — el docstring de `preflightFiltros` describía la regla anterior a B2**
  (`propId.split('::')[1]`, R-08 abierto). Ese módulo importa hoy la identidad
  de propiedad compartida; dejar escrito que la copia es exactamente lo que
  volvería a divergir.

Ataques sin defecto: A tarde tras B y A→B→A, no-filter frente a zero-result,
propiedad de la máscara visual sobre un objectSet ajeno, color OFF con lotes
pendientes y dueño externo, ciclo de vida con remount, scope/readiness, live
edit sin `detail`, popout con el mismo dbId en dos Sources, y búsqueda mecánica
de una segunda autoridad: el motor se llama desde un solo sitio y los globals
legacy se escriben desde uno solo.

Banco nuevo `filtersCore.b3Adversarial` (7 casos). Mutantes 4/4 muertos. Los dos
KNOWN FAIL de B4 —búsqueda y DnD— siguen intactos.



**B2 · representación canónica y cache por revisión, 7-sep-2026.** Diez de los
once P0 de B2 pasan porque el producto se corrigió, no porque se debilitara el
oráculo:

- **Un solo normalizador.** Precarga y refresco llamaban a dos algoritmos que,
  con el mismo dato, producían `Height` y `Group_Height`. Ahora comparten
  `normalizarInventario`, y las filas salen **cualificadas** (`Grupo::Propiedad`
  además del nombre suelto): dos grupos homónimos dejan de pisarse.
- **La cache exige una revisión explícita.** La referencia del array no era una
  revisión: la rejilla edita en sitio y el índice devolvía el valor anterior
  indefinidamente. `markInventoryRevision()` la declara donde se escribe o se
  edita; sin revisión el motor no cachea.
- **La huella de la rosetta mira el contenido**, no la cardinalidad: un remapeo
  que conserva el número de claves ya no reutiliza dbIds viejos.
- **Los valores del modelo dejan de ser claves peligrosas**: `Map` en vez de
  objeto, así que `constructor`, `toString` y `__proto__` son datos ordinarios.
- **Un elemento cuenta una vez**, por `(documento, externalId)`.
- **El respaldo global por externalId se sustituye por linaje**: ya no se cae al
  primer modelo cargado que tenga ese identificador.

Rendimiento medido contra B1 sobre 40.000 filas y cinco modelos: primera pasada
255,7 → **183,3 ms**; repetida 74,8 → **34,1 ms**. Sin regresión.

**B2 CODE/TEST GREEN.** Cero KNOWN FAIL de B2, cero UNEXPECTED FAIL y cero
UNEXPECTED PASS. Los KNOWN FAIL de B3/B4 siguen intactos en sus propios
bancos: 6 en `interacciones` y 6 en `interaccionesIntegradas`.



**B1 · cierre de la identidad en los consumidores protegidos, 7-sep-2026: GREEN.**
Tres seams más, del mismo tipo y con la misma regla:

- `buildParamPhaseIndex` construía un `Map externalId → valor` global —la última
  fila leída ganaba— y luego lo consultaba en TODOS los modelos, así que la fase
  de una Source pintaba elementos de otra. Ahora los valores se agrupan por
  Source y cada grupo se resuelve contra su propio documento.
- `buildSubZoneLabels` tenía exactamente el mismo patrón con las zonas: mapa
  global por `row.dbId` aplicado a todos los modelos.
- `buildZoneHoverIndex` ya resolvía bien el camino principal, pero conservaba el
  respaldo prohibido: cuando el URN de la fila no era el de ningún modelo
  cargado —lo que ocurre siempre al versionar— recorría los modelos y se quedaba
  con el primero que tuviera ese externalId.

Los tres comparten ahora `indiceDeDocumentos`, `claveDeSource` y `urnDeFila`:
URN exacto → mismo linaje → nada. No hay rama de «el primero que lo tenga».


**B1 · identidad cualificada en los consumidores 4D/5D, 7-sep-2026: GREEN.**
Tres seams, ninguna fórmula ni algoritmo tocado:

- `LOB4DExtension.setElementLinks` caía al **primer** modelo que tuviera el
  externalId cuando el `source_urn` del enlace no coincidía —lo que pasa
  **siempre** al versionar, porque el URN lleva la versión pegada—. Ahora
  resuelve por linaje: URN exacto → mismo documento → nada. Dos versiones del
  mismo documento cargadas a la vez es ambigüedad, y no se elige ninguna.
- `compare.py`: la identidad de cada lado pasa a ser `(source_urn, external_id)`.
  Con la clave vieja un scope `sources` fundía dos elementos y el metrado de uno
  **sustituía** al del otro —pérdida, no mezcla—. `LIMIT 1` sin orden en el
  detalle → resolución sólo si la identidad es una. `byElement` conserva su forma
  y omite el ext ambiguo en vez de publicarlo como si fuera de un solo documento.
  **El algoritmo de diff no se tocó.**
- `lob4d._derive_locations_from_model`: `GROUP BY (source_urn, external_id)`.
  Latente hoy —el `UNIQUE(model_urn, external_id)` impide la colisión dentro de
  un frente—, y con el frente actual los grupos y los rangos son idénticos.

Además, defecto L1 ajeno al alcance corregido: `test_gap11core_issues` hacía
`io.open` sobre los subdirectorios de `backend/sql/` y desde que existe
`sql/candidates/` fallaba con `PermissionError` — **dejaba de comprobar nada**.
Filtrado a `.sql`, que es lo que aplica `aplicar_migraciones.py`.

**7-sep-2026 — frontera comprobada antes de integrar: B1 BLOCKED.**
Método real protegido LOB4DExtension.buildParamPhaseIndex, extraído sin cambios
y ejecutado en memoria con mapas LMV simulados: control IDs distintos PASS;
mismo externalId, orden invertido y dato humano sólo en A producen tres
mezclas. Sin DB/Viewer ni producto modificado. No repite censo/colisión backend.
La base endurecida aprobada 29/29 sí está presente. 14/14 mutantes es evidencia
de Claude, no una ejecución nueva. Ver [informe](filters/B1_INTEGRATION_PROTECTED_STOP.md).
La nueva autorización permite commits locales GREEN, pero este checkpoint
BLOCKED se deja sin commit. Los candidatos aprobados no se sobrescriben.

**Puerta backend de B1, 6-sep-2026: BACKEND IDENTITY READY (sólo auditoría).**
Identidad elegida: (frente exacto, linaje APS, externalId original), con
snapshots separados. Copia aislada: 20.361 assets / 12 configs / 7 user data;
cero duplicados supervivientes dentro de frente NO descarta pérdida histórica.
2.146 externalIds en dos frentes; siete user data sin identidad demostrable,
propuestos para conservar sin asignar/revisión, no modificados. T1–T10 y
15 controles adicionales PASS; seis tablas shadow, SQL candidato sin número
y servicio desconectado. Censo y prototipo en clústeres nuevos detenidos.
Ver [informe canónico](filters/B1_BACKEND_IDENTITY_RESULTADOS.md),
[contrato](filters/B1_BACKEND_IDENTITY_CONTRACT.md),
[mapa](filters/B1_IDENTITY_USAGE_MAP.md) y
[rollout/rollback NO ejecutado](filters/B1_IDENTITY_ROLLOUT.md).
Doce archivos nuevos sin commit; los nueve B1 previos y cuatro M ajenos
conservan hashes 13/13. No repetir censo/investigación ni seguir optimizando.

**Investigación Filters, 6-sep-2026: FILTERS BENCHMARK READY, aprobado por el propietario.**
Informe definitivo: [Tandem vs ALEPHIA / contrato y plan](filters/FILTERS_BENCHMARK.md).
Takeover STATE MATCH en `main`; baseline `3e413cd`, HEAD observado
`cf7a845b8512260c746e316b36f07ddad88c7e40`. Investigación de código y fuentes
oficiales, reproducciones puras en memoria y mediciones sintéticas. El cierre
aprobado incorpora tres decisiones: resultado explícito (predicados/estado/
revisión/matches); color cancelable y determinista sin aprobar exclusividad;
puerta B1 de colisión source/externalId en BD desechable con tres salidas.
**Sólo documentación commiteada; ningún cambio de código, ejecución de B1,
push, deploy ni acceso a DB real.** READY no significa Filters corregido.
Saved Views sigue CLOSED. No repetir la investigación Tandem.

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

### Actualización del worktree aislado (24-sep-2026, posterior al checkpoint de ortofoto)

La rama `codex/ortofoto-canal` añadió dos commits funcionales locales para el
reporte del propietario sobre Frente Canal: `91b0f889969294306585aa154d8843de512ceb72`
(sentido de rueda al cargar/restaurar modelos) y
`84509d58a34fea5aaa4bf5097b739deca94e0324` (reimportación de la misma
versión desde snapshot inmutable y retirada confirmada por servidor). El índice
y worktree aislados quedaron vacíos tras esos commits. El checkout principal y
todo su WIP ajeno siguen fuera de ambos commits. Esta nota prevalece sobre la
descripción histórica de `8c5ce9c` inmediatamente debajo.

### Worktree aislado `codex/ortofoto-canal` (24-sep-2026)

El trabajo funcional de ortofoto está commiteado sólo en
`C:/Users/ASUS/.codex/worktrees/ortofoto-canal/VISOR_APS_TL`, rama
`codex/ortofoto-canal`, commit `8c5ce9cbcdbdf2e7e1b9073577bde377b9c84f70`
basado en `b03d0fb`. Antes del commit documental de este handoff, sólo
`docs/AI_WORKSTATE.md` permanece modificado en ese worktree.
No trasladar ni adoptar el WIP ajeno del checkout principal.

El worktree **está sucio a propósito**. Nada de lo que sigue pertenece al
trabajo cerrado, y **nada de esto se limpia, se añade ni se commitea**.

### WIP ajeno adicional confirmado por el propietario — takeover B2/B3

**UNRELATED / PROTECTED / PRESERVE**, sin adoptar ni normalizar:

- `frontend-react/src/lib/predictBim.js` completo en su estado actual
  (+55/−5 respecto de HEAD, no los +30/−0 históricos).
- `frontend-react/public/predict/` y
  `frontend-react/src/lib/predictBim.js.bak.20260907`.
- Delta actual de `docs/filters/evidencias/IDENTIDAD_4D_5D.json`
  (+5/−5, metadatos de una ejecución posterior).
- Los otros tres M históricos: LOB4DExtension.js, ViewerLabelsBar.jsx y
  únicamente los hunks históricos Viewer.jsx / ViewerFacade.
- Todos los untracked históricos y artefactos B1 ya enumerados abajo.

Hay **cinco M ajenos**, no cuatro. Las listas y conteos anteriores de B1 son
históricos; los bancos B1 ya versionados no se consideran untracked.
La divergencia administrativa fue aceptada expresamente por el propietario.
Ninguno de estos archivos forma parte del alcance adoptado de B2/B3.

### Modificados históricos (`M`) — 4 ficheros, +566 / −116

| Fichero | Qué es | Trato |
|---|---|---|
| `frontend-react/src/aps/extensions/LOB4DExtension.js` | 4D/LOB en vuelo del propietario | **PROTEGIDO** |
| `frontend-react/src/components/ViewerLabelsBar.jsx` | ídem | **PROTEGIDO** |
| `frontend-react/src/lib/predictBim.js` | ídem | **PROTEGIDO** |
| `frontend-react/src/components/Viewer.jsx` | **+48 líneas que NO son de Saved Views**: cablean `registerViewerFacade` desde `../aps/viewer/ViewerFacade` (fichero **untracked**), más tres guardas `facadeVisibilityRef`. Lo de Saved Views que hay en este fichero (`viewer-ready`, `__visorListo`, `__restaurandoVistaV2`, `viewer-request-models`) **ya está commiteado** en `3e413cd` | **NO commitear tal cual** — ver DIVERGENCIA 1 |

### Untracked — 28 entradas

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

`AGENTS.md`, `docs/AI_WORKSTATE.md` y `docs/AI_DECISIONS.md` **ya están
versionados** (commits documentales por encima del baseline). No aparecen como
untracked.

`frontend-react/.env.local` existe y **está ignorado por git**. Contiene
configuración local. **No leer, no copiar, no commitear.**

### Documentación de Filters — versionada, no suciedad esperada

`docs/filters/FILTERS_BENCHMARK.md` y este `docs/AI_WORKSTATE.md` forman la
entrega exclusivamente documental `docs(filters): freeze benchmark and target contract`.
El informe se trasladó de `docs/filters-benchmark/report-source.md`; no quedan
dos copias canónicas. El benchmark permanece versionado e intacto.
Los cuatro modificados de código y las 28 entradas untracked anteriores
permanecen ajenos, intactos y con la misma protección.

### Trabajo propio B1 — esperado SIN COMMIT, pendiente de auditoría

Además de los cuatro M y 28 entradas ajenas anteriores:

- M `docs/AI_WORKSTATE.md`: estado WIP, evidencia y próxima decisión.
- Nuevos `backend/herramientas/ensayo_filters_b1_identidad.py`,
  `docs/filters/FILTER_RESULT_B1.md`, `docs/filters/B1_RESULTADOS.md`,
  `docs/filters/evidencias/B1_BACKEND_IDENTITY.json`,
  `docs/filters/evidencias/B1_NODE_BASELINE.json`,
  `frontend-react/pruebas/filtersCore.prueba.mjs`,
  `frontend-react/pruebas/filtersCore/fixture.mjs`,
  `frontend-react/pruebas/filtersCore.interacciones.prueba.mjs`,
  `frontend-react/pruebas/filtersCore.baseline.mjs`.

Son nueve archivos nuevos de pruebas/documentación, NO implementación de
Filters. El propietario exige auditoría antes de commit. Índice vacío.
Los cuatro M ajenos mantienen los SHA256 previos, +566/-116; no incluirlos.
No tomar los untracked propios de B1 declarados aquí como divergencia nueva.

### Ampliación propia — BACKEND IDENTITY GATE, SIN COMMIT

Además de los nueve archivos anteriores, **12 nuevos** autorizados para el
prerrequisito backend (no B2), pendientes de auditoría:

- `backend/herramientas/censo_filters_b1_identidad.py`
- `backend/herramientas/ensayo_filters_b1_identidad_candidata.py`
- `backend/prototypes/inventory_identity_b1.py`
- `backend/sql/candidates/inventory_identity_b1.sql`
- `backend/sql/candidates/inventory_identity_b1_rollback.sql`
- `docs/filters/B1_BACKEND_IDENTITY_CONTRACT.md`
- `docs/filters/B1_BACKEND_IDENTITY_RESULTADOS.md`
- `docs/filters/B1_IDENTITY_USAGE_MAP.md`
- `docs/filters/B1_IDENTITY_ROLLOUT.md`
- `docs/filters/evidencias/B1_IDENTITY_CENSUS.json`
- `docs/filters/evidencias/B1_IDENTITY_CENSUS_HINTS.json`
- `docs/filters/evidencias/B1_IDENTITY_PROTOTYPE.json`

M propio sigue siendo únicamente `docs/AI_WORKSTATE.md`. Git puede agrupar
untracked por directorio; no autoriza adoptar todo prototypes/ o candidates/.
Ningún archivo funcional versionado fue modificado por esta ampliación.
Índice vacío; no numeración definitiva, ni migración sobre tablas public.

### Artefactos esperados del diagnóstico de frontera — 7-sep, SIN COMMIT

Además de los 9+12 archivos propios anteriores:

- `docs/filters/B1_INTEGRATION_PROTECTED_STOP.md`
- `docs/filters/evidencias/B1_PROTECTED_BOUNDARY_REPRO.cjs`
- `docs/filters/evidencias/B1_PROTECTED_BOUNDARY.json`

M propio: `docs/AI_WORKSTATE.md`. Ningún cambio de producto en este ciclo.
Los candidatos/evidencia previos contienen el hardening aprobado de Claude
(29/29), no se reemplazan por la versión anterior de 25/25.

### Entrega documental de revisión B2 / bloqueo B3 — 7-sep

Propios de esta revisión: `docs/AI_WORKSTATE.md` y
`docs/filters/B2_REVIEW_B3_BLOCKED.md`, destinados a commit exclusivamente
documental. No hay cambios funcionales propios. Los cinco M ajenos y los
untracked declarados permanecen UNRELATED / PROTECTED / PRESERVE.

### Unidad B3 incorporada — posterior a 71d23c7

El WIP propio anterior entra en el commit funcional B3. Archivos y fitness en
[filters/B3_RESULTADOS.md](filters/B3_RESULTADOS.md).
NO queda WIP propio B3 esperado después del commit. Se conservan exactamente
los cinco M ajenos y todos los untracked históricos de la tabla anterior.
En Viewer sólo quedan sin commit las **48 líneas ViewerFacade** ajenas.
Los dos bancos históricos se adaptaron con autorización explícita:
expected/datos originales intactos; sólo dos KNOWN_FAIL de B4.

### Unidad B4 incorporada — posterior a 6ddc5a0

Commit local `feat(filters): complete b4 search and identity-safe interactions`:
App, TandemSidebar, TandemFilterPanel, FilterConfiguratorModal,
lib/filterPresentation, bancos interacciones/interaccionesIntegradas,
filtersCore.b4/b4Mutants/b4Performance, B4_RESULTADOS y este WORKSTATE.
NO queda WIP propio B4 esperado tras el commit. Siguen exactamente los cinco
M ajenos y los untracked históricos declarados; Viewer queda +48/-0.
Los dos KNOWN_FAIL de B4 ahora son PASS, sin modificar expected históricos.

### Unidad REVIEWS incorporada — dos commits sobre a325745, PUBLICADA Y DESPLEGADA (13-sep)

> **Actualización del 13-sep-2026: el handoff de esta unidad está superado.**
> - **Auto-Deploy:** comprobado en `Off` en el panel de Render para `visor-ecd-backend-va`, `visor-ecd-portal`, `visor-ecd-frontend` y `visor-ecd-backend` (Oregón). Los cuatro siguen `Yaseromar8/EDC_BIM`, rama `main`, y no hay más servicios.
> - **Push:** lo hizo el propietario (`origin/main` = `596776013ddb01ddb23104cb41f78e9d679b7227`) y no arrancó ningún despliegue. Hashes finales, sin trailer de coautoría: A = `b913e8a`, B = `5967760`.
> - **Despliegue manual del propietario:**
>   - backend de Virginia: `/api/health` → `version 596776013ddb`;
>   - portal: sirve el lote (el chunk `ReviewsModule-*.js` contiene «sin versión válida»).
> - **Oregón:** sigue en `cdf7837`. Actualizarlo o retirarlo es una decisión de infraestructura aparte (D9) que no bloquea Reviews.

Esta tarea entra en DOS commits, en este orden, sobre
`a32574544b9c8f50fb3cda53572c4394b98fa7b7`; tras ellos no queda WIP propio de la
tarea. Al empezarla el worktree ya traía, además de los ajenos de arriba,
`.claude/launch.json` y `frontend-docs/src/pages/FilesPage.jsx` modificados:
ajenos, no tocados, y siguen igual.

A · `fix(reviews)` — seguridad de Reviews (versión fijada, visibilidad y acceso documental):
- `backend/routes/reviews.py`
- `backend/flujo_de_revision.py`
- `backend/encargos.py`
- `backend/routes/directorio.py`
- `frontend-docs/src/components/ReviewsModule.jsx`
- `backend/tests/test_r01_motor_por_contrato.py`
- `backend/tests/test_r01_contrato_de_revision.py` (el ensayo nuevo entra en `ESCRITORES`)
- `backend/herramientas/ensayo_de_revisiones.py`
- `backend/herramientas/ensayo_de_contrato_r01.py`
- `docs/AI_WORKSTATE.md` (sólo el aviso de CURRENT TASK y esta sección)
- nuevo `backend/tests/test_revision_version_y_visibilidad.py`
- nuevo `backend/tests/test_revision_acceso_documental.py`
- nuevo `backend/herramientas/ensayo_de_version_y_visibilidad.py`

B · `fix(docs)` — vista previa por versión (defecto preexistente desde b671559):
- `frontend-docs/src/hooks/useDocPreview.js`
- `frontend-docs/src/components/DocQuickView.jsx`
- `frontend-docs/src/components/BusquedaGlobalModule.jsx`
- nuevo `frontend-docs/src/utils/vistaPrevia.js`
- nuevo `frontend-docs/pruebas/vistaPrevia.prueba.mjs`

[WIP HANDOFF]
TAREA:                REVIEWS · lote correctivo (versión fijada, visibilidad, acceso documental para actuar y para asignar, confidencialidad de Mi Trabajo y avisos) y, aparte, la vista previa por versión: COMMITTED en dos commits (A y luego B), SIN DESPLEGAR.
IMPLEMENTADO:         A) alta con version_id válido del mismo documento y obra; AT sin asociación válida no aprueba; la excepción «sin version_id» del cierre sólo para PRE; GET /api/reviews filtrado por permiso_documental; `/act` exige que el actor pueda consultar todos los documentos, para aprobar y para rechazar, en cualquier paso y contrato (403 SIN_PERMISO_DOCUMENTAL antes de cualquier escritura); alta manual, alta de plantilla y sustitución rechazan a quien no puede consultarlos (400 REVISOR_SIN_ACCESO_DOCUMENTAL); perder el acceso deja la revisión PENDIENTE y BLOQUEADA (causa nueva de `estado_del_flujo`, también en la conciliación) y la sustitución de siempre la desbloquea; Mi Trabajo (global y por obra) y el cuerpo de los avisos de revisión se deciden por destinatario, con asunto neutro «Revisión RV-### · paso N · sin acceso a todos sus documentos»; una sola regla en `flujo_de_revision.puede_consultar_la_revision`. B) `useDocPreview` entrega el nombre intacto y la versión en `versionLabel`; `DocQuickView` decide el formato por el nombre.
PENDIENTE:            1) publicación: antes de cualquier push, confirmar en el panel de Render el Auto-Deploy de todos los servicios que siguen `main` — `visor-ecd-backend-va` (Virginia, creado el 12-sep) no figura en `deploy/render.yaml` y el del backend de Oregón consta como NO VERIFICADO (solo observado); con todos apagados, push normal, sin forzar; 2) planificar el despliegue manual: destino web Virginia y frontend-docs, verificando cada uno por `/api/health` y por contenido; 3) antes, confirmar si Oregón sigue activo y accesible con las rutas anteriores, y que el propietario decida expresamente entre actualizarlo o retirarlo.
ARCHIVOS MODIFICADOS: propios: ninguno pendiente, todo está en A y B. Ajenos, no tocados: .claude/launch.json, docs/filters/evidencias/IDENTIDAD_4D_5D.json, frontend-docs/src/pages/FilesPage.jsx, frontend-react/src/aps/extensions/LOB4DExtension.js, frontend-react/src/components/Viewer.jsx, frontend-react/src/components/ViewerLabelsBar.jsx, frontend-react/src/lib/predictBim.js y todos los untracked históricos.
TESTS EJECUTADOS:     `python -m pytest -q -p no:cacheprovider` desde la raíz → 1777 passed / 1 failed (test_capacidades_con_puerta, preexistente); `python herramientas/ensayo_de_version_y_visibilidad.py` contra base desechable como ecd_app → 67/67 (incluye A8: versión inexistente con quien administra asignado, y A9: independencia tras sustituir); `herramientas/ensayo_de_revisiones.py` → 50/50; `herramientas/ensayo_de_contrato_r01.py` en base nueva parada en la 26, como ecd_migrator → 59/59; `npm test` en frontend-docs → 4 bancos en verde (vistaPrevia 9/9); build de frontend-docs OK; banco de interfaz con el ReviewsView real y un usuario ficticio: el PDF válido se dibuja con nombre y versión separados, y la asociación inválida no abre nada.
TESTS PENDIENTES:     activación por teclado (Enter/Espacio) del botón de un documento válido: pendiente de UAT humana; rendimiento con volumen: no medido; validación en producción: pendiente del despliegue; medición o reparación de revisiones reales de producción: no autorizadas.
FALLO CONOCIDO:       test_capacidades_con_puerta (preexistente, /api/docs/miniaturas/preparar). La independencia al sustituir compara el correo/nombre guardado del autor con el del paso, no el user_id: A9 prueba el caso cubierto, no todos los cambios posibles de identidad. Una AT ya guardada con un version_id inexistente sólo la puede ver o actuar quien administra la obra; sustituir al revisor por esa persona permite gestionarla y rechazarla, pero NO aprobarla: la integridad de versión la sigue bloqueando (A8). Las AT mal formadas existentes no se reparan ni se rechazan automáticamente.
NEXT EXACT ACTION:    confirmar en Render el Auto-Deploy de los servicios que siguen `main` (sobre todo `visor-ecd-backend-va`); si todos están apagados, push normal de A y B, sin forzar; después, planificar con el propietario el despliegue manual.
DO NOT TOUCH:         el WIP ajeno listado; las revisiones reales de producción; la guarda de cierre por versión nueva; el contrato R01 (PRE / AUTORIDAD_TERMINAL); no desplegar Virginia, no desplegar ni reactivar Oregón, no suspender ni eliminar servicios, y no cambiar Cloud SQL, redes, APS ni frontends desplegados.
COMMIT/HEAD REF:      a32574544b9c8f50fb3cda53572c4394b98fa7b7

### Unidad REVIEWS · E1 (detalle, navegación y semántica) — DESPLEGADA (68b14b8 en Virginia y portal), 13-sep

Programa y decisiones aprobadas: `docs/reviews/00_PROGRAMA_Y_DECISIONES.md`. Contrato:
`docs/reviews/E1_CONTRATO_DE_ACEPTACION.md`. Informe: `docs/reviews/E1_INFORME_DE_CIERRE.md`.
La unidad anterior (A y B) ya está publicada: `origin/main` = `5967760`, desplegada por el
propietario en Virginia y en el portal el 13-sep.
E1 está en el commit `68b14b8` (padre `5967760`, 20 ficheros), aceptado (`E1 COMMIT = PASS`) y publicado en
`origin/main` el 13-sep con push normal. Antes del push se comprobó en el panel Auto-Deploy `Off` en los
cuatro servicios (no hay más), y el push no arrancó ningún despliegue.
El propietario lo desplegó a mano el 13-sep, primero el backend y después el portal. Verificado: Virginia
`/api/health` → `version 68b14b8c7d5a`; el portal (origen de Render y `alephia.com.pe`) sirve
`index-BmVOYVjH.js`, que contiene «Dar conformidad» y «Abriendo la revisión», textos que solo existen desde
`68b14b8`. Oregón sigue en `cdf783754574`; el visor no forma parte de E1.
Excepción menor de alcance, registrada por el propietario: `SustituirRevisor` conserva la semántica de
sustitución de `5967760`, pero se retiró su prop no usada `projectPrefix` (diferencia técnica, no funcional).
La documentación que el propietario pidió no commitear aparte (el informe corregido, la guía y los
hallazgos de la UAT) entró en el commit de E1.1. Siguen exactamente los siete M ajenos y los untracked
históricos.

[WIP HANDOFF]
TAREA:                REVIEWS · E1 (detalle, navegación y semántica) — `E1 CODE/TEST GREEN LOCAL = PASS` y `E1 COMMIT = PASS`; commit 68b14b8 en origin/main y DESPLEGADO por el propietario el 13-sep (backend de Virginia y portal), verificado por /api/health y por contenido.
IMPLEMENTADO:         GET /api/reviews/<rid> (solo lectura, puertas, `acciones` con las reglas de /act, pasos y versión vigente); GET /api/reviews con filtros y paginación por cursor (permiso antes de cortar la página, tope de 1000 filas, `obra_id`); `get_review` en RUTAS_POR_RECURSO; pantalla RevisionDetalle; lista con filtros y «Cargar más»; enlace `/?obra=&revision=` (router, persistencia tras el login, aviso si la obra no es del usuario); Mi Trabajo abre revisiones; «Dar conformidad» ≠ «Aprobar»; confirmación y mensajes.
PENDIENTE:            1) UAT del propietario en producción, con docs/reviews/E1_GUIA_DE_PRUEBA.md (enlace, Mi Trabajo, botones por paso; Enter/Espacio, pantalla ancha y lector de pantalla); 2) E2 (anular y archivar), NO autorizado todavía; Oregón, sin cambios.
ARCHIVOS MODIFICADOS: la documentación pendiente (docs/reviews/E1_INFORME_DE_CIERRE.md, docs/reviews/E1_GUIA_DE_PRUEBA.md, docs/reviews/E1_UAT_HALLAZGOS.md) entró en el commit de E1.1. Propios, los 20 en el commit 68b14b8: backend/routes/reviews.py, backend/perimetro_de_obra.py, frontend-docs/src/App_Refactor.jsx, frontend-docs/src/components/MiTrabajo.jsx, frontend-docs/src/components/ReviewsModule.jsx, frontend-docs/src/hooks/useFileExplorer.js, frontend-docs/src/pages/HubPage.jsx, frontend-docs/vite.banco.config.js, frontend-docs/pruebas/vistaPrevia.prueba.mjs, docs/AI_WORKSTATE.md; nuevos: backend/tests/test_revision_detalle_y_listado.py, backend/herramientas/ensayo_de_detalle_de_revision.py, frontend-docs/src/components/RevisionDetalle.jsx, frontend-docs/src/utils/revisiones.js, frontend-docs/pruebas/revisiones.prueba.mjs, frontend-docs/probar-revisiones.html, frontend-docs/src/probar-revisiones.jsx, docs/reviews/00_PROGRAMA_Y_DECISIONES.md, docs/reviews/E1_CONTRATO_DE_ACEPTACION.md, docs/reviews/E1_INFORME_DE_CIERRE.md. Ajenos, no tocados (sha256 iguales): .claude/launch.json, docs/filters/evidencias/IDENTIDAD_4D_5D.json, frontend-docs/src/pages/FilesPage.jsx, frontend-react/src/aps/extensions/LOB4DExtension.js, frontend-react/src/components/Viewer.jsx, frontend-react/src/components/ViewerLabelsBar.jsx, frontend-react/src/lib/predictBim.js y los untracked históricos.
TESTS EJECUTADOS:     desde backend `python -m pytest -q -p no:cacheprovider tests` → 1808 passed / 1 failed (test_capacidades_con_puerta, preexistente); `herramientas/ensayo_de_detalle_de_revision.py` en base desechable con ENFORCE → 25/25; `ensayo_de_version_y_visibilidad.py` → 67/67; `ensayo_de_revisiones.py` sin `.env` → 50/50; `npm test` en frontend-docs → 5 bancos en verde (repetido tras quitar una directiva eslint-disable sobrante); `npx eslint` desde frontend-docs sobre los 11 ficheros JS de E1 → 0 errores / 0 avisos; `npx vite build --outDir <fuera del repo>` → OK; banco `probar-revisiones` y E2E local con backend real → PASS (detalle en el informe); sha256 de los 7 M ajenos iguales a la referencia.
TESTS PENDIENTES:     UAT humana (Enter/Espacio, pantalla ancha, lector de pantalla) = PENDING; rendimiento con volumen = NOT MEASURED; validación funcional en producción por el propietario = PENDING (el despliegue ya está verificado por versión y por contenido). El E2E con backend real e identidad inyectada es evidencia válida de la sesión del 13-sep, no un arnés versionado: su servidor quedó en el scratchpad.
FALLO CONOCIDO:       test_capacidades_con_puerta (preexistente). `npm run build` en sitio falla por EPERM sobre frontend-docs/dist/assets (entorno). Con ENFORCE, una revisión inexistente responde 403 PROJECT_UNRESOLVED del middleware, no el 404 de la ruta. Hallazgos de la UAT del 13-sep, ninguno introducido por E1 (docs/reviews/E1_UAT_HALLAZGOS.md): H1 un administrador de la entidad no puede ser revisor, porque la regla de participante choca con que no se le puede añadir como participante; H2 cambiar la plantilla borra los revisores; H3 la lista de revisores ofrece a no participantes y a cuentas retiradas; H4 faltan tildes en un mensaje.
NEXT EXACT ACTION:    esperar el resultado de la UAT del propietario sobre E1 en producción y su autorización para E2; sin ella, no empezar E2 ni tocar Oregón.
DO NOT TOUCH:         el WIP ajeno listado; el contrato R01 (PRE / AUTORIDAD_TERMINAL); /act, el alta, la sustitución y las plantillas; producción y Oregón. `acciones` del detalle es información para presentación: `/act` sigue siendo la autoridad de ejecución y debe revalidar siempre.
COMMIT/HEAD REF:      68b14b8c7d5adfa32d83a10f32b33ce30707ab47 (commit de E1, igual a origin/main; su padre es 5967760)

### Unidad REVIEWS · E1.1 (alta de revisiones y participantes) — DESPLEGADA (8875f9e en Virginia y portal), 13-sep

Autorizada por el propietario: «corrige, pero con criterio, sin romper la funcionalidad». Contrato:
`docs/reviews/E1_1_CONTRATO.md`. Informe: `docs/reviews/E1_1_INFORME_DE_CIERRE.md`. Corrige H1–H4 de
la UAT de E1 (`docs/reviews/E1_UAT_HALLAZGOS.md`).

[WIP HANDOFF]
TAREA:                REVIEWS · E1.1 — corregir H1–H4 de la UAT de E1: probado en local, commit 8875f9e sobre 68b14b8 y publicado en origin/main con push normal el 13-sep (los dos autorizados por el propietario) y DESPLEGADO por el propietario el 13-sep, verificado (Virginia /api/health → 8875f9ed1428; el portal sirve index-BU0VvNh3.js con E1.1). Antes del push se releyó Auto-Deploy Off en los cuatro servicios (no hay más), y el push no arrancó ningún despliegue.
IMPLEMENTADO:         H1 el administrador de la entidad se incorpora como participante (candidatos con role, incorporar sin 409 ENTITY_ADMIN_SIN_MEMBRESIA, retirar en Participantes, sin casilla de administrar la obra); «Guardar accesos» (update_project_users) no borra su participación; H2 alta: confirmar antes de sustituir revisores puestos a mano por una plantilla, «a mano» conserva los pasos, si la plantilla falla vuelven los anteriores; H3 las listas de revisores del alta y de «Sustituir revisor…» salen de /api/projects/<obra>/miembros; H4 tildes en el mensaje de REVISOR_FUERA_DE_LA_OBRA y en el motivo de BLOQUEADA.
PENDIENTE:            1) la UAT del propietario de la noche del 13-sep (bloques C y D) dio H5–H9, en la segunda parte de docs/reviews/E1_UAT_HALLAZGOS.md: los datos NO se cruzan (ensayo local 29/29); H5 tras Adelante fuera de Revisiones la dirección conserva revision= y «Revisiones» abre esa revisión; H6 una confirmación sobrevive a Atrás y actúa sobre su revisión, que ya no se ve; H7 (diseño) la misma versión puede estar en dos revisiones en curso; H8 la guía compartía PDF; H9 created_at y paso_vence_en sin zona horaria (+5 h en Lima). Esperan la autorización de E1.2 (H5, H6, H9) y la decisión del propietario sobre H7 (A avisar / B impedir); 2) el bloque F de la guía (flujo creado), por el propietario; 3) commitear en el próximo handoff este fichero, la guía y los hallazgos.
ARCHIVOS MODIFICADOS: en el commit de E1.1: backend/routes/administracion.py, backend/routes/auth.py, backend/routes/reviews.py, backend/flujo_de_revision.py, backend/tests/test_membresia_por_obra.py, backend/tests/test_accesos_por_diferencia.py, frontend-docs/src/components/ReviewsModule.jsx, frontend-docs/src/components/RevisionDetalle.jsx, frontend-docs/src/components/ParticipantesModule.jsx, frontend-docs/src/probar-revisiones.jsx; nuevos: backend/herramientas/ensayo_de_admin_participante.py, frontend-docs/src/utils/altaDeRevision.js, frontend-docs/pruebas/altaDeRevision.prueba.mjs, docs/reviews/E1_1_CONTRATO.md, docs/reviews/E1_1_INFORME_DE_CIERRE.md. Entró también la documentación pendiente: docs/reviews/E1_INFORME_DE_CIERRE.md, docs/reviews/E1_GUIA_DE_PRUEBA.md, docs/reviews/E1_UAT_HALLAZGOS.md, docs/usuarios/00_ADMIN_UNICO_Y_ELIMINAR_USUARIOS.md y este fichero. Sin commit, para el próximo handoff: este fichero (push y despliegue) y docs/reviews/E1_GUIA_DE_PRUEBA.md (guía actualizada para E1.1). Ajenos, no tocados (sha256 iguales): los siete M de siempre y los untracked históricos.
TESTS EJECUTADOS:     desde backend `python -m pytest -q -p no:cacheprovider tests` → 1812 passed / 1 failed (test_capacidades_con_puerta, preexistente); `npm test` en frontend-docs → 6 bancos en verde (altaDeRevision 8/8); eslint sobre los ficheros JS tocados → 0; build fuera del repo → OK; `herramientas/ensayo_de_admin_participante.py` en base desechable con ENFORCE → 16/16; regresiones: ensayo_de_detalle_de_revision 25/25, ensayo_de_version_y_visibilidad 67/67, ensayo_de_revisiones 50/50; banco probar-revisiones (ReviewModal real) y app real con backend real (Participantes) → PASS.
TESTS PENDIENTES:     «Enviar a revisión» en la app real: el panel del navegador de la sesión (286×307 px) no pinta la tabla; ensayo_de_administracion.py no se ejecutó porque lee el .env; bloque F de la UAT (flujo creado). Diagnóstico del 13-sep por la noche, fuera del repo: scratchpad/e1/diagnostico_gemelas.py 29/29 contra el banco con ENFORCE, y recorrido en la app real del banco (H5 y H6 reproducidos).
FALLO CONOCIDO:       test_capacidades_con_puerta (preexistente). test_perimetro.py falla si corre justo después de test_accesos_por_diferencia.py (su fixture recarga routes.auth en modo estricto, igual que antes de E1.1); pasa solo y en la suite completa.
NEXT EXACT ACTION:    ver «Unidad REVIEWS · E1.2»; E2 sigue sin autorizar.
DO NOT TOUCH:         el WIP ajeno listado; producción; E2–E5; Usuarios U2–U5; las reglas del alta en el servidor, /act y la sustitución.
COMMIT/HEAD REF:      8875f9ed142893505e0135956ce893ede4f13e75 (commit de E1.1, igual a origin/main; su padre es 68b14b8)

### Unidad REVIEWS · E1.2 (enlace, confirmación, fechas y documentos compartidos) — DESPLEGADA (27e1a42 en Virginia y portal), 13-sep

Autorizada por el propietario con «SI, HAZLO» sobre la segunda parte de `docs/reviews/E1_UAT_HALLAZGOS.md`. Para H7
la respuesta no eligió: se aplicó A (avisar), la recomendada, y se dice en el contrato. Contrato:
`docs/reviews/E1_2_CONTRATO.md`. Informe: `docs/reviews/E1_2_INFORME_DE_CIERRE.md`.

[WIP HANDOFF]
TAREA:                REVIEWS · E1.2 — H5 dirección y pantalla, H6 confirmación retirable, H9 fechas con zona y H7-A avisos de documentos en otra revisión en curso. Implementado y probado en local; commit único sobre 8875f9e autorizado por el propietario («SI HAZLO») y publicado en origin/main con push normal («VAMOS»), tras releer Auto-Deploy Off en los cuatro servicios de Render. DESPLEGADO por el propietario el 13-sep y verificado: Virginia /api/health → 27e1a428ce3c, también por el /api del portal y de alephia.com.pe; portal index-DgYYQqZD.js con E1.2 en Render y en alephia.com.pe; Oregón cdf783754574 sin cambios. INCIDENTE: el primer arranque tras el Manual Deploy (21:11) se quedó en «Control socket listening» sin «Booting worker»; Render lo marcó Live pero no detectaba puerto, y el backend no respondió de 21:11 a 21:36. Con autorización del propietario («REINICIA») se reinició el servicio y arrancó normal (Booting worker; política aplicada a 393 endpoints). Sin migraciones.
IMPLEMENTADO:         H5 useFileExplorer escucha popstate y abre Revisiones si la dirección trae una revisión de su obra, y setSidebarView('reviews') desde otra sección quita un enlace viejo; App_Refactor abre como enlace una revisión de otra obra o traída fuera de Documentos (destinoTrasNavegar en utils/revisiones.js). H6 confirmAction acepta `signal`; RevisionDetalle la retira al desmontarse y no actúa sin la revisión en pantalla. H7-A GET /api/reviews/en-curso (solo lectura, solo revisiones visibles), items[].tambien_en (solo revisiones en curso) y estado_documento en el detalle, acciones.aprobar.ya_en_destino/todos_en_destino/retroceden, y los avisos en alta, detalle y consecuencia del cierre. H9 _COLUMNAS_DE_REVISION y la consulta de Mi Trabajo leen created_at, paso_vence_en, vence_en y creado_en con AT TIME ZONE current_setting('TimeZone').
PENDIENTE:            1) UAT del propietario: bloques F, D4 y G de docs/reviews/E1_GUIA_DE_PRUEBA.md; 2) commitear en el próximo handoff este fichero y la guía, el informe y los hallazgos actualizados tras el despliegue; 3) B (impedir) sigue fuera; 4) E2 sin autorizar.
ARCHIVOS MODIFICADOS: backend/routes/reviews.py, backend/encargos.py, backend/tests/test_revision_detalle_y_listado.py, backend/tests/test_encargos.py, frontend-docs/src/utils/revisiones.js, frontend-docs/src/hooks/useFileExplorer.js, frontend-docs/src/App_Refactor.jsx, frontend-docs/src/utils/confirm.jsx, frontend-docs/src/components/RevisionDetalle.jsx, frontend-docs/src/components/ReviewsModule.jsx, frontend-docs/pruebas/revisiones.prueba.mjs, frontend-docs/src/probar-revisiones.jsx, docs/reviews/E1_UAT_HALLAZGOS.md, docs/reviews/E1_GUIA_DE_PRUEBA.md, docs/AI_WORKSTATE.md; nuevos: backend/herramientas/ensayo_de_revisiones_gemelas.py, docs/reviews/E1_2_CONTRATO.md, docs/reviews/E1_2_INFORME_DE_CIERRE.md. Ajenos, no tocados (sha256 iguales): los siete M de siempre y los untracked históricos.
TESTS EJECUTADOS:     pytest completo → 1827 passed / 1 failed (test_capacidades_con_puerta, preexistente; 15 pruebas nuevas); npm test en frontend-docs → 6 bancos en verde (revisiones 19/19); ESLint en los ficheros tocados → sin problemas nuevos (confirm.jsx y probar-revisiones.jsx traen el mismo error react-refresh que HEAD); construcción del portal con la configuración del banco y sin .env → OK; ensayo_de_revisiones_gemelas 24/24; regresiones ensayo_de_detalle_de_revision 25/25, ensayo_de_version_y_visibilidad 67/67, ensayo_de_admin_participante 16/16, ensayo_de_revisiones 50/50 (sin .env); app real del banco: H5 (Archivos + Adelante abre T2; «Revisiones» con dirección vieja abre la lista), H6 (Atrás cierra la confirmación y no hay acto) y aviso del detalle; banco probar-revisiones: avisos del alta, del detalle y del cierre, y H6.
TESTS PENDIENTES:     «Enviar a revisión» en la app real (el panel no pinta la tabla); Atrás/Adelante hacia otra obra o desde la portada (App_Refactor) solo con reglas puras y lectura de código; UAT del propietario tras el despliegue.
FALLO CONOCIDO:       test_capacidades_con_puerta (preexistente). Error de lint react-refresh preexistente en confirm.jsx y probar-revisiones.jsx.
NEXT EXACT ACTION:    esperar el resultado de la UAT del propietario (bloques F, D4 y G). Tras cada Manual Deploy del backend: /api/health y «Booting worker» en el log, no basta con «Live».
DO NOT TOUCH:         el WIP ajeno listado; producción; E2–E5; B de H7; Usuarios U2–U5; las reglas del servidor en /act, el alta, la sustitución y las plantillas.
COMMIT/HEAD REF:      27e1a428ce3c35a215f0b7319ecf0fe399ee94df (commit de E1.2, igual a origin/main tras el push del 13-sep; su padre es 8875f9e).

### Análisis de Usuarios · administrador único y eliminar usuarios — VERSIONADO con E1.1, 13-sep

`docs/usuarios/00_ADMIN_UNICO_Y_ELIMINAR_USUARIOS.md` (solo análisis, versionado en el commit de E1.1). El propietario pidió
quedar como único Entity Admin y poder eliminar usuarios. Hallazgos:
- id 19 es el 2.º custodio decidido en el doc 76;
- quitarle el rol ya se puede desde «Usuarios del sistema»;
- la papelera desactiva, y el borrado físico (`?purgar=1`) existe pero no está en la interfaz;
- varias FK con RESTRICT impiden purgar a quien tiene huella.
Nada cambiado en código. En producción, el propietario degradó id 19 al perfil «Editar» (13-sep, desde la
interfaz): queda un solo admin. Pendiente: sus decisiones U2–U5 (U5 = unificar «Usuarios» y «Usuarios del sistema»).

### Unidad PERMISOS · A (planos CAD para todos) y B («Editar» en la carpeta) — DESPLEGADA (41d7dda en Virginia y portal), 14-sep

Pedido del propietario el 13/14-sep, con su equipo empezando a trabajar en el ECD el 14-sep. Diagnóstico previo:
`docs/usuarios/01_PERFIL_Y_PERMISO_DE_CARPETA.md`. Informe: `docs/usuarios/02_PLANOS_CAD_Y_EDITAR_EN_CARPETA.md`.
En la misma sesión, solo análisis y sin código: `docs/reviews/E1_3_FLUJOS_CREADOS_Y_RECHAZO.md` y
`docs/compartir/01_COMPARTIR_VARIOS_DOCUMENTOS.md`.

[WIP HANDOFF]
TAREA:                PERMISOS · A) el visor web de planos CAD daba 403 PROJECT_UNRESOLVED a todo el que no fuera admin de entidad (ENFORCE encendido desde el 22-ago); B) «Cargar archivos», «Nueva carpeta», soltar ficheros, añadir subcarpeta, mover y suprimir se decidían con «administra esta obra» y no con el permiso de carpeta. Implementado y probado en local; commit autorizado por el propietario («SI») y publicado con push normal («VAMOS»), tras releer Auto-Deploy Off en los cuatro servicios; el push no arrancó ningún despliegue. DESPLEGADA por el propietario el 14-sep (Manual Deploy del backend y del portal) y verificada: Virginia /api/health → 41d7dda3e662, también por alephia.com.pe, con «Booting worker» y «Listening at» en el log; el portal sirve index-BpgqB68-.js con «Subir nueva versión», `nueva_version` y `current_permission_level`, en el origen de Render y en alephia.com.pe.
IMPLEMENTADO:         A) perimetro_de_obra: `cad_status` en RUTAS_POR_QUERY; nuevo RUTAS_POR_CUERPO con `translate_cad` y `obra_por_cuerpo` (solo valores simples de primer nivel); auth_middleware._request_project_id la consulta después de la query; docs_cad `_guardia_del_plano` (guardia_del_documento + permiso_documental.guardia con minimo viewer) en translate y en status; test_cobertura_autorizacion lee también RUTAS_POR_CUERPO. B) /api/docs/list devuelve `current_permission_level` (permiso_efectivo de quien mira sobre la carpeta listada; fail-closed 'none'); move exige 'edit' también en el destino; portal: `puedeEditarEn` y las capacidades `subcarpeta` y `nueva_version` en capacidadesDeSeleccion; useFileExplorer con `nivelCarpetaActual` y `puedeEditarAqui` (cargar, crear, soltar) y `subirNuevaVersion` (sube el fichero elegido con el nombre del documento, del mismo tipo); mover y suprimir sin gate `isAdmin` (deciden capacidades y servidor); ContextMenu con «Añadir subcarpeta» por permiso y «Subir nueva versión»; MatrixTable renombrar y descripción con 'edit'; FilesPage con los botones sobre `fe.puedeEditarAqui` y un selector de fichero oculto para la nueva versión.
PENDIENTE:            1) UAT del propietario y de su equipo en producción: subir con «Editar», «Subir nueva versión» y abrir planos CAD con una cuenta que no administre; 2) su decisión sobre el paquete compartido (E1.3 y el contrato de rondas siguen en la unidad REVIEWS · E1.3); 3) C (camino hasta una carpeta anidada) y D (ordenar Rol frente a Configuración de permisos), aplazados por el propietario.
ARCHIVOS MODIFICADOS: propios: backend/perimetro_de_obra.py, backend/auth_middleware.py, backend/routes/docs_cad.py, backend/routes/documents.py, backend/tests/test_cobertura_autorizacion.py, frontend-docs/src/utils/capacidadesDeSeleccion.js, frontend-docs/pruebas/capacidadesDeSeleccion.prueba.mjs, frontend-docs/src/hooks/useFileExplorer.js, frontend-docs/src/components/ContextMenu.jsx, frontend-docs/src/MatrixTable.jsx y frontend-docs/src/pages/FilesPage.jsx (SOLO los hunks de los dos botones, del selector de «Subir nueva versión» y de la prop del menú: el fichero ya traía WIP ajeno de la barra de iconos, que no se commitea); nuevos: backend/tests/test_planos_para_todos.py, backend/tests/test_editar_en_carpeta.py, docs/usuarios/01_PERFIL_Y_PERMISO_DE_CARPETA.md, docs/usuarios/02_PLANOS_CAD_Y_EDITAR_EN_CARPETA.md, docs/reviews/E1_3_FLUJOS_CREADOS_Y_RECHAZO.md, docs/compartir/01_COMPARTIR_VARIOS_DOCUMENTOS.md; y este fichero. Pendientes del handoff anterior (E1.2): docs/reviews/E1_2_INFORME_DE_CIERRE.md, docs/reviews/E1_GUIA_DE_PRUEBA.md, docs/reviews/E1_UAT_HALLAZGOS.md. Ajenos, no tocados: los siete M de siempre (incluidos los hunks ajenos de FilesPage.jsx) y los untracked históricos.
TESTS EJECUTADOS:     pytest completo sin .env → 1841 passed / 1 failed (test_capacidades_con_puerta, preexistente; 14 pruebas nuevas); dirigido (planos, editar, cobertura, perímetro, aislamiento, documento, auth, política) → 98 passed; ensayo de banco con rutas reales y ENFORCE (scratchpad/permisos/ensayo_planos_y_editar.py) → 21/21; reproducciones previas: defecto CAD (repro_cad_perimetro.py) 9/9 en sombra y en estricto, y camino de carpetas (ensayo_perfil_vs_carpeta.py) 56/56; npm test en frontend-docs → 6 bancos en verde (capacidadesDeSeleccion 20/20); eslint de los ficheros tocados → los mismos problemas que HEAD, ninguno nuevo; build del portal sin .env → OK; app real del banco con un usuario de rol «Usar» y «Editar» en 03_Documentos → la raíz y 02_SHA_Compartido sin «Cargar archivos»; 03_Documentos con «Cargar archivos» y «Nueva carpeta»; menú de un PDF con «Subir nueva versión», «Cambiar nombre» y «Desplazar», y «Suprimir» apagado («Necesitas permiso de administración en esta carpeta»).
TESTS PENDIENTES:     subir un fichero real desde la pantalla (el banco no tiene GCS y el navegador de pruebas no elige ficheros); ver un plano CAD traducido (sin credenciales APS: se prueba que la petición pasa todas las puertas); validación en producción tras el despliegue.
FALLO CONOCIDO:       test_capacidades_con_puerta (preexistente). En el Browser pane (286×307) la tabla de Archivos no pinta filas: se usó resize_window 1280×800 y un dblclick despachado para abrir filas. Mover por ruta (`destPath` sin `destNodeId`) todavía puede crear carpetas antes de comprobar el destino (preexistente; el portal usa ids). En compartir (solo análisis): revocar no comprueba la obra del enlace, el autor sale del cuerpo y el enlace sirve la versión actual.
NEXT EXACT ACTION:    esperar la UAT del propietario en producción y su decisión sobre el paquete compartido. Revisiones: ver la unidad REVIEWS · E1.3.
DO NOT TOUCH:         el WIP ajeno (incluidos los hunks de la barra de iconos de FilesPage.jsx); producción y Oregón; Revisiones: lo que diga la unidad REVIEWS · E1.3; el significado del Rol (D, aplazado).
COMMIT/HEAD REF:      41d7dda3e662f7bc6d218ffac3e4beb0543dbfd5 (igual a origin/main tras el push del 14-sep; su padre es 27e1a42)

### Unidad REVIEWS · E1.3 (flujos creados utilizables) — DESPLEGADA (88b300f en Virginia y portal), 14-sep

Pedido del propietario el 14-sep: «si hago ya el arreglo de flujos creados y empiezo el contrato de volver atrás / devolver
al iniciador… como lo investigamos en ACC». Diagnóstico: `docs/reviews/E1_3_FLUJOS_CREADOS_Y_RECHAZO.md`. Informe:
`docs/reviews/E1_3_INFORME_DE_CIERRE.md`. En la misma entrega, solo documento y sin código, el contrato nuevo para su
aprobación: `docs/reviews/E3_CONTRATO_RONDAS.md` (fuente: el contrato de ACC medido el 12-sep y D1–D9).

[WIP HANDOFF]
TAREA:                REVIEWS · E1.3 — que los flujos de revisión creados se puedan usar (las 7 causas del diagnóstico) y escribir el contrato RONDAS (rondas, volver al paso anterior, devolver al iniciador, decisión por archivo, cierre separado de la emisión) para aprobarlo. Implementado y probado en local; commit autorizado por el propietario («HAZLO») y publicado con push normal («si»), tras releer Auto-Deploy Off en los cuatro servicios de Render; el push no arrancó ningún despliegue. SIN desplegar: cada Manual Deploy necesita su autorización.
IMPLEMENTADO:         plantillas_de_revision: validar_pasos exige plazo entero ≥1 (la regla del alta) y user_id numérico; resolver devuelve `opciones` de todo paso por función con varias personas, elegido o no, da ELECCION_INVALIDA ante elecciones mal formadas o ajenas, REVISOR_INVALIDO ante un id guardado malo y nombra a quien salió de la obra (REVISOR_NO_MIEMBRO); nuevo motivo_no_utilizable (validar_pasos + resolver; ELIGE_REVISOR no inutiliza). routes/plantillas_revision: el listado añade utilizable y motivo_no_utilizable por plantilla, cada una en un SAVEPOINT; modificar exige personas de la obra como crear (_personas_fuera_de_la_obra); solo un 23505 se anuncia como NOMBRE_REPETIDO. routes/reviews: POST /api/reviews/previsualizar = create_review(solo_comprobar=True), mismas comprobaciones en el mismo orden y salida antes de la primera escritura, sin exigir título ni idoneidad; la expansión de la plantilla va en try (PLANTILLA_NO_LEIDA) y un id o unas elecciones mal formados dan 404/400; el 500 del alta ya no devuelve str(e) (ERROR_DEL_SERVIDOR); tildes en el mensaje del plazo. Portal: altaDeRevision.js (opcionDePlantilla, pasosSinElegir, eleccionesParaEnviar, plazoValido, leerRespuesta, textoDeFallo, trasVistaPrevia); ReviewModal con la vista previa completa, contador que descarta respuestas tardías, selector por paso por función, flujos no utilizables deshabilitados con su motivo, aviso si fallan los flujos, claves con posición y envío de elecciones; FlujosDeRevisionModule comprueba el plazo antes de guardar, enseña un 0 guardado y marca «NO SE PUEDE USAR» con el motivo. La vista previa antigua GET /api/review-templates/<id>/resolver no cambia (portal desplegado).
PENDIENTE:            1) desplegada por el propietario; verificada el 14-sep por /api/health (88b300fc61d1) y por el contenido del portal (/api/reviews/previsualizar, «Comprobando el flujo»); 2) sus respuestas R1–R14 del contrato RONDAS para congelarlo antes de E3; 3) UAT de A, B y E1.3 en producción tras desplegar; 4) E2 sin autorizar.
ARCHIVOS MODIFICADOS: backend/plantillas_de_revision.py, backend/routes/plantillas_revision.py, backend/routes/reviews.py, frontend-docs/src/utils/altaDeRevision.js, frontend-docs/src/components/ReviewsModule.jsx, frontend-docs/src/components/FlujosDeRevisionModule.jsx, frontend-docs/pruebas/altaDeRevision.prueba.mjs, frontend-docs/src/probar-revisiones.jsx, docs/reviews/E1_GUIA_DE_PRUEBA.md, docs/reviews/E1_3_FLUJOS_CREADOS_Y_RECHAZO.md, docs/AI_WORKSTATE.md; nuevos: backend/tests/test_e13_flujos_creados.py, backend/herramientas/ensayo_de_flujos_creados.py, docs/reviews/E1_3_INFORME_DE_CIERRE.md, docs/reviews/E3_CONTRATO_RONDAS.md. Pendiente del handoff anterior: docs/usuarios/02_PLANOS_CAD_Y_EDITAR_EN_CARPETA.md. Ajenos, no tocados: los siete M de siempre (incluidos los hunks de la barra de iconos de FilesPage.jsx) y los untracked históricos.
TESTS EJECUTADOS:     pytest completo sin .env → 1864 passed / 1 failed (test_capacidades_con_puerta, preexistente; 23 pruebas nuevas); ensayo_de_flujos_creados contra PostgreSQL con ENFORCE → 36/36; regresiones sin .env: ensayo_de_revisiones_gemelas 24/24, ensayo_de_version_y_visibilidad 67/67, ensayo_de_detalle_de_revision 25/25, ensayo_de_revisiones 50/50, ensayo_de_admin_participante 16/16; npm test en frontend-docs → 6 bancos en verde (altaDeRevision 15/15); ESLint de los ficheros tocados → los mismos 2 problemas que HEAD; build del portal sin .env → OK; banco probar-revisiones con el alta real: flujo no utilizable deshabilitado con motivo, selector por función, bloqueo por acceso, pasos al elegir, envío con plantilla_id y elecciones, respuesta tardía descartada y recuperación ante un flujo roto.
TESTS PENDIENTES:     la app real del banco (Archivos → Enviar a revisión con el backend del banco): la pestaña cerró su sesión al cargarla sin backend y no se fabrican sesiones en el navegador; la etiqueta «NO SE PUEDE USAR» del editor en pantalla; UAT del propietario (bloque H de la guía) tras desplegar.
FALLO CONOCIDO:       test_capacidades_con_puerta (preexistente). tests/test_capa16_tool_activation.py asigna am.ENFORCE_PROJECT_AUTHZ=True y am._user_in_project sin monkeypatch y los deja así para el resto de la sesión de pytest (preexistente, propuesto como tarea aparte): las pruebas de ruta de E1.3 lo declaran con su fixture `ruta`. Errores de lint preexistentes: 'user' sin usar en FlujosDeRevisionModule.jsx y react-refresh en probar-revisiones.jsx.
NEXT EXACT ACTION:    esperar la UAT del propietario (bloque H de la guía) y sus respuestas R1–R14 del contrato RONDAS.
DO NOT TOUCH:         el WIP ajeno (incluidos los hunks de la barra de iconos de FilesPage.jsx); producción y Oregón; /act y la sustitución; E2–E5 y el contrato RONDAS en código hasta que esté congelado; C y D de permisos (aplazados).
COMMIT/HEAD REF:      88b300fc61d1dca0b21a9805bb5b0a86eeda7d43 (commit de E1.3, igual a origin/main tras el push del 14-sep; su padre es 41d7dda)

### Unidad ARCHIVOS · ENLACES por obra, carpeta y documento — DESPLEGADA (9dd13e8 y la corrección de la raíz d30762d, en Virginia y portal), 14-sep

Pedido del propietario el 14-sep: «ARCHIVOS · DEEP LINKS — CONTRATO FINAL BASADO EN ACC» (`/?obra=&carpeta=&documento=&version=`
con identificadores; la carpeta es contexto y el documento identidad; «Copiar enlace» al documento vigente; respuesta neutra;
sin tocar Compartir público, papelera, búsqueda, viewableGuid ni frontend-react; sin migraciones; WIP ajeno de FilesPage
intacto). Diagnóstico: `docs/archivos/01_ENLACES_POR_CARPETA_Y_DOCUMENTO.md`. Informe: `docs/archivos/02_ENLACES_INFORME_DE_CIERRE.md`.

[WIP HANDOFF]
TAREA:                ARCHIVOS · enlaces internos por obra, carpeta, documento y versión, como ACC. Implementado y probado en local; revisado por el propietario («DEEP LINKS ARCHIVOS CODE/TEST GREEN LOCAL = PASS»), que autorizó un único commit funcional sobre 88b300f: el que contiene este fichero. La corrección del falso error de base de datos en las negativas queda aceptada como parte de la entrega. Push normal ejecutado por el propietario desde su terminal (a Claude Code el permiso le bloqueó `git push`), tras comprobar Auto-Deploy Off en los cuatro servicios: origin/main = 9dd13e8; después, producción seguía en 88b300f (/api/health) y el portal sin la ruta nueva. SIN desplegar: cada Manual Deploy necesita su autorización.
IMPLEMENTADO:         backend/enlaces_de_archivos.py (`ubicar`: usuario → obra → recurso → permiso efectivo, y versión → documento; cadena de carpetas sin la raíz; papelera, otra obra, tipo, ciclo e ISO estricto; NoDisponible con motivo solo para registro y pruebas) y `GET /api/docs/ubicacion` en routes/documents.py (un único 404 ENLACE_NO_DISPONIBLE; la negativa se recoge dentro de la conexión para no registrarse como error de base de datos; la clave de la versión con la regla de /api/docs/versions). Portal: utils/enlacesDeArchivos.js; App_Refactor (obra en la URL con su paso, enlace pendiente en sessionStorage durante el login, Atrás/Adelante entre obras, lista y portada con marcas en history.state); useFileExplorer (push al entrar en una carpeta cuando el listado confirma su id; restauración al montar y con Atrás/Adelante, siempre validada en el servidor; el documento se abre desde el listado de su carpeta; normalización con replaceState; fuera de Carpetas, sin carpeta ni documento en la URL; anotarDocumento, cerrarDocumento, verVersion y copiarEnlace); FilesPage (solo 3 bloques propios: abrir, cerrar y versión, menú); ContextMenu «Copiar enlace».
PENDIENTE:            0) desplegada por el propietario y verificada el 14-sep (/api/health 9dd13e886c08 y el portal con el código nuevo); hallazgo del propietario en producción: tras F5 en una carpeta el árbol perdía la raíz, porque `fetchContents` tomaba el id de la raíz de la primera carpeta listada (y «Desplazar» a «Archivos de proyecto» habría ido a la carpeta del enlace); corregido y commiteado con autorización («VAMOS»), antes del commit de PERMISOS; 1) push y Manual Deploy de la corrección hechos por el propietario, verificado el 15-sep (/api/health 6e51793937a7, que la contiene, y portal `index-Cr11Kw1A.js` con «Abriendo el enlace»); 2) UAT del propietario: producción aún no validada; 3) limitaciones registradas por el propietario: la búsqueda y la ventana de subida no añaden todavía `documento` a la URL, y Atrás desde la raíz de la obra hasta la lista de obras no se recorrió en pantalla; 4) posterior: «Copiar enlace a esta versión».
ARCHIVOS MODIFICADOS: backend/routes/documents.py, frontend-docs/src/App_Refactor.jsx, frontend-docs/src/hooks/useFileExplorer.js, frontend-docs/src/components/ContextMenu.jsx, frontend-docs/src/pages/FilesPage.jsx (3 bloques propios), docs/AI_WORKSTATE.md; nuevos: backend/enlaces_de_archivos.py, backend/tests/test_enlaces_de_archivos.py, backend/herramientas/ensayo_de_enlaces_de_archivos.py, frontend-docs/src/utils/enlacesDeArchivos.js, frontend-docs/pruebas/enlacesDeArchivos.prueba.mjs, docs/archivos/01_ENLACES_POR_CARPETA_Y_DOCUMENTO.md, docs/archivos/02_ENLACES_INFORME_DE_CIERRE.md. Pendiente del handoff anterior: docs/reviews/E1_3_INFORME_DE_CIERRE.md. Ajenos, no tocados: los siete M de siempre (incluidos los 3 bloques de la barra de iconos de FilesPage.jsx) y los untracked históricos.
TESTS EJECUTADOS:     pytest completo sin .env → 1883 passed / 1 failed (test_capacidades_con_puerta, preexistente; 19 nuevas); ensayo_de_enlaces_de_archivos contra PostgreSQL con ENFORCE → 34/34, sin líneas de error en el log; regresiones de Revisiones → gemelas 24/24, versión y visibilidad 67/67, detalle 25/25, revisiones 50/50, admin participante 16/16, flujos creados 36/36; npm test → 7 bancos en verde (enlacesDeArchivos 16/16, revisiones 19/19); ESLint → ningún error nuevo (los 5 de FilesPage y ContextMenu ya están en HEAD); build del banco sin .env → OK; app real del banco: obra → carpeta A → carpeta B → documento → Atrás → Adelante → F5 → URL en otra pestaña, «Copiar enlace», documento movido, sin permiso, documento de otra obra, versión de otro documento y login intermedio.
TESTS PENDIENTES:     en pantalla, Atrás desde la raíz de la obra hasta la lista y la portada (cubierto por el banco de reglas); UAT del propietario tras desplegar.
FALLO CONOCIDO:       test_capacidades_con_puerta (preexistente). Un documento abierto desde la búsqueda o desde la ventana de subida se abre sin `documento` en la URL (la búsqueda quedó fuera del contrato).
NEXT EXACT ACTION:    UAT del propietario en producción: enlaces, F5 dentro de una carpeta y «Desplazar» a «Archivos de proyecto».
DO NOT TOUCH:         el WIP ajeno (incluidos los 3 bloques de la barra de iconos de FilesPage.jsx); Compartir público, papelera, búsqueda, viewableGuid y frontend-react; producción y Oregón.
COMMIT/HEAD REF:      9dd13e886c0838690b80b0507e7504ee07bdcf03 (igual a origin/main tras el push del 14-sep; su padre es 88b300f)

### Unidad PERMISOS · «Editar» suprime y restaura — DESPLEGADA (6e51793 en Virginia y portal, verificada el 15-sep), 14-sep

Pedido del propietario el 14-sep: «cuando en Configuración de permisos esté en Editar, ese usuario también pueda eliminar o
restaurar… después hacemos commit de ambos» (con la corrección de la raíz de ARCHIVOS · ENLACES). Informe:
`docs/usuarios/03_EDITAR_SUPRIME_Y_RESTAURA.md`.

[WIP HANDOFF]
TAREA:                PERMISOS · suprimir (a la papelera, de uno en uno y en lote) y restaurar con «Editar» en la carpeta, en vez de «Administrar». Implementado y probado en local; commit autorizado por el propietario («VAMOS») en dos commits: la corrección de la raíz de los enlaces y este cambio (`6e51793`). Push y Manual Deploy hechos por el propietario; verificado el 15-sep.
IMPLEMENTADO:         permiso_documental.subcarpetas_sin_nivel (¿hay debajo alguna carpeta con una regla que deje a la persona por debajo de «Editar»?; quien administra la obra la atraviesa; sin identidad se niega). routes/documents.py: /api/docs/delete, el DELETE de /api/docs/batch y /api/docs/restore piden 'edit' y, para carpetas, `_subarbol_protegido` (403 SUBCARPETAS_SIN_PERMISO nombrando solo la carpeta pedida; 503 SUBARBOL_SIN_COMPROBAR si no se puede mirar); /api/docs/permanent-delete sin cambios (solo administrador de la plataforma). Portal: capacidadesDeSeleccion EXIGE.suprimir = 'edit'; AddPermissionModal describe Editar y Administrar; la prueba del portal fija las reglas nuevas y el nivel del backend.
PENDIENTE:            1) UAT del propietario (desplegado y verificado el 15-sep: /api/health 6e51793937a7 y portal `index-Cr11Kw1A.js` con «suprimir y restaurar archivos»); 2) observación sin tocar: la papelera enseña a todo miembro lo suprimido, también de carpetas que no ve (restaurar sí exige permiso).
ARCHIVOS MODIFICADOS: backend/permiso_documental.py, backend/routes/documents.py, frontend-docs/src/utils/capacidadesDeSeleccion.js, frontend-docs/src/components/AddPermissionModal.jsx, frontend-docs/pruebas/capacidadesDeSeleccion.prueba.mjs, docs/usuarios/02_PLANOS_CAD_Y_EDITAR_EN_CARPETA.md (nota), docs/AI_WORKSTATE.md; nuevos: backend/tests/test_editar_suprime_y_restaura.py, backend/herramientas/ensayo_de_editar_suprime_y_restaura.py, docs/usuarios/03_EDITAR_SUPRIME_Y_RESTAURA.md.
TESTS EJECUTADOS:     pytest completo sin .env → 1896 passed / 1 failed (test_capacidades_con_puerta, preexistente; 13 nuevas); ensayo_de_editar_suprime_y_restaura contra PostgreSQL con ENFORCE → 19/19, sin errores en el log; npm test → 7 bancos en verde (capacidadesDeSeleccion 21/21); ESLint → sin problemas en lo tocado; app real del banco con perfil Editar: «Suprimir» activo en el menú, suprimir un PDF (en base is_deleted y activity_log «delete» a su nombre) y restaurarlo desde la Papelera (aviso «Restaurado», is_deleted falso y «restore»).
TESTS PENDIENTES:     UAT del propietario en producción tras desplegar.
FALLO CONOCIDO:       test_capacidades_con_puerta (preexistente).
NEXT EXACT ACTION:    UAT del propietario con una persona con «Editar»: suprimir, restaurar y una carpeta con una subcarpeta sin «Editar».
DO NOT TOUCH:         /api/docs/permanent-delete (sigue solo del administrador de la plataforma); el WIP ajeno (incluidos los 3 bloques de la barra de iconos de FilesPage.jsx); producción y Oregón.
COMMIT/HEAD REF:      6e51793 (igual a origin/main tras el push del propietario; su padre es d30762d, la corrección de la raíz de ENLACES, sobre 9dd13e8)

### Unidad ARCHIVOS · LECTOR DE PLANOS COMO ACC (rueda, doble clic y nitidez) — DESPLEGADA con el lote P1 (1810d11 bajo 27ea400, Virginia y portal), 15-sep

Pedido del propietario el 15-sep: la opción A de `docs/archivos/03_LECTOR_PDF_MANIPULACION_COMO_ACC.md` («vamos, con cuidado
y profesionalismo»): que manejar un plano en el lector de pdf.js se sienta como el lector de planos de ACC; solo la
manipulación, no los botones. Informe: `docs/archivos/04_LECTOR_PDF_COMO_ACC_INFORME.md`.

[WIP HANDOFF]
TAREA:                ARCHIVOS · lector de planos (PDFViewer): rueda, doble clic y nitidez como el lector de planos de ACC, medidos contra sus cifras del 13-sep. Implementado y probado en local. Commit autorizado por el propietario («HAGAMOS LOS DOS COMIT»): este, y después el del lote P1 de velocidad de apertura. Push y Manual Deploy del propietario el 15-sep, junto con P1.
IMPLEMENTADO:         utils/navegacionLector.js (paso de rueda ×1,10 con los eventos finos en proporción; suavizado exponencial τ 18 ms en logaritmos; límites de hoja encuadrada/3,5 a 64; el punto bajo el cursor no acumula redondeo; viaje a la hoja entera de 500 ms con punto fijo, que termina igual que fitTo; área y validez del detalle nítido con las reglas del detail view de pdf.js). PDFViewer.jsx: motor de zoom por fotogramas con la corrección medida del scroll y sin tocar el estado hasta terminar; rueda en todo el escenario, sin cambio de página ni scroll nativo; +, − y Ctrl+1 por el mismo motor; doble clic con la herramienta Mover; sin dibujado nítido a medio gesto (`escalaFijada`); marcas y resaltados que siguen a la hoja (viewBox y porcentajes), retirados solo al cambiar de página, giro o documento, en el efecto; lienzo de detalle de lo visible con presupuesto de 8 MP, sin redibujar la hoja entera cuando al tope saldría igual; el búfer de la hoja entera se suelta tras volcarlo. PDFViewer.css: holgura 100vh/100vw y el lienzo `.pdf-detalle`. PdfToolsOverlay.jsx: viewBox, clic en proporción y texto en porcentaje. Banco: probar-lector.jsx con un plano de dos páginas y marcas simuladas.
PENDIENTE:            1) DEFECTO DE ESTE COMMIT, destapado por la medición «después» de P1 en producción: al REABRIR un plano la hoja se dibuja dos veces. `fitTo` hace siempre `setEscalaFijada(n => n + 1)`; el primer aviso del ResizeObserver reencuadra sin cambiar la escala y sale un segundo dibujado «de zoom» en el búfer, sin aceleración: con 004122, 12,6 s de hilo ocupado después de verse la hoja. Lo mismo con «Ajustar página» o el doble clic con la hoja ya encuadrada. Reproducido en el banco (6e51793 dibuja 1 vez, HEAD 2). Arreglado en la unidad «LECTOR · DIBUJADO REPETIDO Y CENTRADO AL ABRIR» (commit A, sin push ni despliegue; `docs/archivos/07_P1_MEDICION_EN_PRODUCCION.md` §4). 1b) DEFECTO ANTERIOR AL LECTOR, visto en el banco al probar ese arreglo: a veces la hoja sale descentrada al abrir y se queda así. `fitTo` centra el scroll en el siguiente fotograma y, si React aún no ha dado al lienzo su tamaño, centra un lienzo de 300×150. Arreglado en la misma unidad (commit B; informe §5). 2) su prueba con ratón real; 3) opcional: «Ajustar página/ancho» siguen sin viaje; panel táctil y pellizco sin medir con un panel real.
ARCHIVOS MODIFICADOS: frontend-docs/src/components/PDFViewer.jsx, frontend-docs/src/components/PDFViewer.css, frontend-docs/src/components/PdfToolsOverlay.jsx, frontend-docs/src/probar-lector.jsx, docs/AI_WORKSTATE.md; nuevos: frontend-docs/src/utils/navegacionLector.js, frontend-docs/pruebas/navegacionLector.prueba.mjs, docs/archivos/03_LECTOR_PDF_MANIPULACION_COMO_ACC.md, docs/archivos/04_LECTOR_PDF_COMO_ACC_INFORME.md, docs/archivos/05_VELOCIDAD_DE_APERTURA_ACC_VS_ALEPHIA.md. Los planos del banco (public/_probar, incluido el nuevo plano-I de dos páginas) están en .gitignore. Ajenos, no tocados: los M de siempre (incluidos los 3 bloques de la barra de iconos de FilesPage.jsx) y los untracked históricos (probar-primitivas.*).
TESTS EJECUTADOS:     npm test → 8 bancos en verde (navegacionLector 35/35); ESLint de lo tocado → los mismos 6 errores que ya están en HEAD, ninguno nuevo; build del banco sin .env → OK; medición con Chrome sin ventana y entrada CDP (el panel de navegador del escritorio estaba oculto y ahí no corren los fotogramas), a 100 % y 125 %, del lector de 6e51793 y del nuevo: paso, curva, punto bajo el cursor, marcas, fotogramas, dibujados a medio gesto, doble clic frente a «Ajustar página», nitidez a 8/20/40/64×, memoria, cambio de página, giro y documento fotograma a fotograma.
TESTS PENDIENTES:     prueba del propietario con su ratón y su PC. En producción, la medición «después» de P1 (15-sep) destapó el defecto de PENDIENTE 1.
FALLO CONOCIDO:       el dibujado repetido al reabrir (PENDIENTE 1), que entró con este commit, y el descentrado al abrir (PENDIENTE 1b), que ya estaba en 6e51793. Observado sin tocar: tras un zoom, un cambio de página dibuja la página una o dos veces según el instante (el primer dibujado corre con el `avisoDeRender` anterior y va por el búfer); ya pasaba antes.
NEXT EXACT ACTION:    ver la unidad «LECTOR · DIBUJADO REPETIDO Y CENTRADO AL ABRIR»: push y Manual Deploy del portal, y reabrir 004122 en producción.
DO NOT TOUCH:         el WIP ajeno (incluidos los 3 bloques de la barra de iconos de FilesPage.jsx); el backend; producción y Oregón.
COMMIT/HEAD REF:      1810d11 (padre 6e51793); encima va 27ea400 (lote P1); origin/main = 27ea400, desplegado el 15-sep

### Unidad ARCHIVOS · VELOCIDAD DE APERTURA · LOTE P1 (trabajo repetido) — DESPLEGADA (27ea400 en Virginia y portal) Y MEDIDA en producción, 15-sep

Pedido del propietario el 15-sep («ALEPHIA · VELOCIDAD DE APERTURA — AUTORIZACIÓN LOTE P1»): solo trabajo redundante o
evitable, en cinco puntos, con puerta de medición antes/después y puertas de calidad. NO autorizados: motor PDF, visor CAD
precargado o reutilizado, infraestructura/workers, mosaicos de ACC, almacenamiento y migraciones. No se commitea junto con el
lector. Informe: `docs/archivos/06_P1_APERTURA_SIN_TRABAJO_REPETIDO.md`.

[WIP HANDOFF]
TAREA:                ARCHIVOS · lote P1 de velocidad de apertura: quitar el trabajo repetido al abrir PDF y CAD. Medido «antes» en producción (sin carga masiva), implementado y probado en local. Commit autorizado por el propietario («HAGAMOS LOS DOS COMIT»), en un commit propio después del del lector. Push y Manual Deploy del propietario el 15-sep (el backend dejó de responder tras arrancar y volvió con Restart); «después» medido en producción.
IMPLEMENTADO:         DocumentViewer.jsx: un CAD no pide ni espera la URL firmada de la vista (nadie la leía) y no enseña «Preparando vista segura…»; la pre-firma y el clic de «Abrir en escritorio» pasan por el almacén compartido utils/urlFirmada.js. docs_cad.py translate_cad: contesta con lo guardado solo si status es success y el URN guardado == _urn_for de esta versión y empaquetado; si no, el camino de siempre; `verificar` fuerza la comprobación. CadViewer.jsx: si el URN guardado no abre, retira el visor y pide una vez con `verificar`. documents.py urls_de_miniaturas: un listado por documento pedido (tope 20, hasta 8 a la vez); lo que no está bajo el prefijo de la obra queda pendiente; sello de caché solo de lo mirado. utils/vecinasDelLector.js + PDFViewer.jsx: se firma la ventana de siempre, solo se descargan las pegadas de tamaño conocido ≤ 5 MB y al cerrar el visor se cancela la descarga en curso. probar-cad.jsx: palancas __traduccionGuardada y __fallarDocumento.
PENDIENTE:            1) hecho: medición «después» en producción, `docs/archivos/07_P1_MEDICION_EN_PRODUCCION.md`. Pasan las seis puertas: DWG 3,52→2,39 s en frío y 2,05→1,76 s en caliente; primer trazo del PDF de 400 KB 3,36→2,82 s; el plano de 23 MB ya no baja vecinas (2 bajadas de ~23 MB → 0); URL firmada y traducción sin repetir; nada después de cerrar. 2) P2 no hace falta según la regla del propietario (primer CAD 2,39 s frente a 2,7 s de ACC); queda como opción, con los ~300 ms de Suspense. 3) Causa del cuelgue del backend tras el despliegue (18:53–19:57 UTC): faltan los registros de Render. 4) Opcional: repetir en producción versión fija, enlace directo y Reviews.
ARCHIVOS MODIFICADOS: backend/routes/docs_cad.py, backend/routes/documents.py, frontend-docs/src/components/DocumentViewer.jsx, frontend-docs/src/components/CadViewer.jsx, frontend-docs/src/components/PDFViewer.jsx (bloques de vecinas), frontend-docs/src/probar-cad.jsx, docs/AI_WORKSTATE.md; nuevos: frontend-docs/src/utils/vecinasDelLector.js, frontend-docs/pruebas/vecinasDelLector.prueba.mjs, frontend-docs/pruebas/aperturaSinRepetir.prueba.mjs, backend/tests/test_apertura_sin_trabajo_repetido.py, docs/archivos/06_P1_APERTURA_SIN_TRABAJO_REPETIDO.md. Ajenos, no tocados: los M de siempre (incluidos los 3 bloques de la barra de iconos de FilesPage.jsx) y los untracked históricos.
TESTS EJECUTADOS:     pytest completo 1919/1 (el fallo es test_capacidades_con_puerta, preexistente), con 23 nuevas; npm test 10 bancos; ESLint de lo tocado = los 6 errores de HEAD; probar-cad 7/7; banco de componentes reales construido contra HEAD y contra HEAD + P1 (P1 16/16; HEAD falla justo donde P1 cambia la conducta); app real del banco con backend y base locales 12/12 (enlace a carpeta y a documento, Atrás/Adelante, versión fija, CAD guardado y sin guardar); Revisiones reales 4/4; memoria con recolección forzada igual que HEAD; árbol HEAD + P1 sin el lector: 9 bancos, 45 pytest, lint = HEAD y banco 16/16.
TESTS PENDIENTES:     UAT del propietario; miniaturas de una carpeta grande contra el almacén real; versión fija, enlace directo y Reviews en producción (probados en el banco).
FALLO CONOCIDO:       ninguno de P1. Observado: ~300 ms de React 19 (Suspense, FALLBACK_THROTTLE_MS) en el primer CAD de cada página; ya pasaba, tapado por la espera de la URL. La medición «después» destapó un defecto del LECTOR, no de P1: ver su unidad, PENDIENTE 1.
NEXT EXACT ACTION:    nada de P1. Queda abierto pedir los registros de Render del cuelgue; los arreglos del lector están en su propia unidad.
DO NOT TOUCH:         lo no autorizado (motor PDF, visor CAD precargado o reutilizado, infraestructura/workers, mosaicos, almacenamiento, migraciones); el lector (unidad aparte); el WIP ajeno (FilesPage.jsx, .claude/launch.json, probar-primitivas.*); producción y Oregón.
COMMIT/HEAD REF:      27ea400 (padre 1810d11, el lector, sobre 6e51793); origin/main = 27ea400, desplegado el 15-sep

### Unidad ARCHIVOS · LECTOR · DIBUJADO REPETIDO Y CENTRADO AL ABRIR — DESPLEGADA (0092689 y 1324862 en el portal) Y VERIFICADA, 15-sep

Autorizado por el propietario el 15-sep («APLICA») tras `docs/archivos/07_P1_MEDICION_EN_PRODUCCION.md` §4 y §5: dos defectos
de PDFViewer.jsx vistos al medir P1, cada uno en su commit.

[WIP HANDOFF]
TAREA:                ARCHIVOS · lector: (A) la hoja se dibujaba dos veces al reabrir un plano (defecto de 1810d11; 12,6 s de hilo ocupado con 004122 en producción) y lo mismo con «Ajustar página» o el doble clic con la hoja ya encuadrada; (B) a veces salía descentrada al abrir (anterior al lector). Aplicados y probados en local; commit A y commit B autorizados («APLICA»), empujados («HAZ EL PUSH») y desplegados en el portal el 15-sep.
IMPLEMENTADO:         A: `pararZoom` devuelve si había un zoom en marcha; `fitTo` solo hace `setEscalaFijada(n => n + 1)` si cortó un zoom; `verHojaEntera` (doble clic) no viaja ni pide dibujado si la hoja entera ya se ve (a menos de 0,5 px) y no había zoom que cortar. B: `fitTo` da al lienzo su tamaño (y guarda el viewport base) antes de programar el centrado del scroll.
PENDIENTE:            hecho el push, el Manual Deploy del portal y la verificación: el portal sirve `index-7-tRY03g.js` (con los dos arreglos, comprobado por marcadores contra el paquete anterior) y en producción, al reabrir el 004122, la hoja se dibuja UNA vez (24 ms; total 1,33 s; 6 tareas largas, 0,72 s, frente a 75 y 7,4 s) y sale centrada, con desvío (0,2; 0,3) px en las cuatro aperturas medidas. Queda: más muestras de centrado en otros planos (la extensión de Chrome se desconectó a media prueba) y la UAT del propietario.
ARCHIVOS MODIFICADOS: commit A: frontend-docs/src/components/PDFViewer.jsx, docs/AI_WORKSTATE.md y docs/archivos/07_P1_MEDICION_EN_PRODUCCION.md (nuevo). Commit B: frontend-docs/src/components/PDFViewer.jsx. Ajenos, no tocados: FilesPage.jsx, .claude/launch.json, probar-primitivas.* y los untracked históricos.
TESTS EJECUTADOS:     banco con los árboles 6e51793 / HEAD / v1 / v2 (= A) / v3 (= A+B): reabrir (banco_redibujo), gestos con la hoja encuadrada (banco_gestos), centrado al abrir (banco_centrado: sin B 10 de 108 aperturas descentradas, con B 0 de 56) y las 24 escenas del lector (medir.mjs, tres pasadas por versión, 0 errores de página). El PDFViewer.jsx del repositorio es byte a byte el de v2 tras A y el de v3 tras A+B. Con A+B, el banco construido desde el repositorio: centrado al abrir 0 de 40 aperturas descentradas, frente a 7 de 40 con HEAD en la misma corrida; al reabrir, 1 dibujado en los dos casos (HEAD, 2); «Ajustar página» y doble clic con la hoja ya encuadrada, 0 dibujados (HEAD, 1); una muesca, «Ajustar página» tras el zoom o a medio zoom y zoom + doble clic + «Ajustar página», 1 dibujado y la hoja nítida; las 24 escenas del lector, tres pasadas sin errores de página e iguales a HEAD salvo lo que depende del instante (y, en una pasada, posiciones a 1–4 píxeles del dispositivo). npm test: 10 bancos en verde. ESLint de PDFViewer.jsx: los mismos 4 errores que HEAD (no-unused-vars, ya estaban), ninguno nuevo, tanto con A como con A+B.
TESTS PENDIENTES:     más muestras de centrado en producción; prueba del propietario con su ratón.
FALLO CONOCIDO:       sin arreglar, anteriores: tras un zoom, el primer dibujado de la página o documento siguiente va por el búfer (lento en planos pesados) y a veces se dibuja dos veces; el doble clic con la hoja a escala de hoja entera pero desplazada sigue pidiendo un dibujado.
NEXT EXACT ACTION:    nada bloqueante: repetir las muestras de centrado cuando vuelva la extensión de Chrome, y esperar la UAT del propietario.
DO NOT TOUCH:         el backend; P1; el WIP ajeno (FilesPage.jsx, .claude/launch.json, probar-primitivas.*); producción y Oregón.
COMMIT/HEAD REF:      commit A = el commit que contiene este fichero (padre 27ea400); commit B = el siguiente, solo PDFViewer.jsx

### Unidad ARCHIVOS · CAD · COPIA ROTA EN AUTODESK Y ESTADO DE LA PREPARACIÓN — DOS COMMITS LOCALES, SIN PUSH NI DESPLIEGUE, 16-sep

Autorizado por el propietario el 16-sep («hazlo») tras `docs/archivos/08_TRADUCCION_CAD_Y_PDF_FRENTE_A_ACC.md` §7: los puntos
1 y 2 de la lista (rehacer una copia rota y enseñar el estado en la lista) más una pasada de comparación del dibujado contra
ACC. NO autorizado ni tocado: subir a Autodesk desde el navegador, sacar la traducción del proceso web, las marcas de PDF.

[WIP HANDOFF]
TAREA:                ARCHIVOS · CAD: (A) una copia truncada en Autodesk se daba por buena para siempre, así que los cinco reintentos del propietario con el DWG de 260,3 MB no podían arreglarla; (B) durante la preparación no se veía nada en la lista —de ahí su conclusión «al subir no se traduce, solo al abrir»— y la pantalla de espera del visor CAD era gris oscura en vez de clara como la de ACC.
IMPLEMENTADO:         A: `docs_cad.py` — `_tam_en_autodesk` pregunta el tamaño real del objeto en OSS y `_esta_entero` lo compara con el del documento; y tras volver a subir se FUERZA la traducción (el URN no cambia y Autodesk devolvía el `failed` viejo sin mirar los bytes nuevos: defecto visto en producción con el primer commit ya desplegado); los dos sitios donde se decidía «ya estaba subido» ahora lo usan, y si no coincide se anota en el log cuántos bytes hay de cuántos y se vuelve a subir. Si Autodesk no contesta o el documento es un enlace a otra versión, se sube igual. B: `POST /api/docs/cad/estados` devuelve subiendo/inprogress/success/failed/atascado/sin_preparar solo para CAD, solo de obras con acceso, tope 300, leyendo lo guardado en la versión (no pregunta a Autodesk) y devolviendo vacío si la consulta falla; `pretraducir_en_fondo` marca «subiendo» al empezar (el tramo largo que no se veía: 3 min 32 s en el de 260 MB); `MatrixTable.jsx` pinta el chip junto al nombre y pregunta cada 15 s solo mientras quede algo preparándose; `CadViewer.jsx` pasa la pantalla de espera y de error de `#2b2f36` a `#f6f7f9` con texto `#1f2733`.
PENDIENTE:            1) push del propietario y **Manual Deploy del backend** (el portal se despliega solo). Si el portal entra antes que el backend no se rompe nada: la lista pide los estados, no los recibe y se pinta como siempre. 2) Punto 3 del encargo (comparar el dibujado con ACC) a medias: medido el nuestro —fondo ya blanco `#ffffff`, pero el lienzo dibuja 1045×428 para un hueco de 1115×457, o sea ×1,067 de estiramiento, porque sigue al `devicePixelRatio` 0,9375 del navegador del dueño—; falta la pestaña de ACC en el grupo del navegador para tomar los mismos números y decidir si forzar un mínimo de 1. Informe §9. 3) De la lista del §7 siguen sin hacer: marcas de PDF (columna INTEGER vs UUID, necesita dueño de tabla), conservar la `@` en los nombres, sacar la pre-traducción del proceso web que gunicorn reinicia solo, y la causa de que la subida por bloques corrompa de vez en cuando.
ARCHIVOS MODIFICADOS: backend/routes/docs_cad.py, frontend-docs/src/MatrixTable.jsx, frontend-docs/src/components/CadViewer.jsx, docs/AI_WORKSTATE.md; nuevos: backend/tests/test_copia_incompleta_en_autodesk.py, backend/tests/test_estado_de_traduccion_en_la_lista.py, docs/archivos/08_TRADUCCION_CAD_Y_PDF_FRENTE_A_ACC.md. Ajenos, no tocados: FilesPage.jsx, .claude/launch.json y los untracked históricos.
TESTS EJECUTADOS:     pytest de las dos pruebas nuevas más la de la cola → 25 passed; pytest completo → 1 failed, 1929 passed (el fallo es test_capacidades_con_puerta, preexistente); npm test → 10 bancos en verde; banco de navegador con la tabla real y un backend de mentira → 13/13 (pregunta una sola vez al pintar, no pregunta por los PDF, cada estado pinta lo suyo, insiste mientras haya algo en marcha, deja de insistir al acabar, sin errores de página); pantalla de espera comprobada en el navegador: fondo medido `rgb(246,247,249)`, texto `rgb(31,39,51)`; ESLint de MatrixTable.jsx y CadViewer.jsx = los mismos 2 errores que HEAD, ninguno nuevo.
TESTS PENDIENTES:     la prueba que de verdad cierra A solo se puede hacer en producción: volver a subir un DWG grande y comprobar que, si la copia llega corta, se rehace sola. UAT del propietario sobre el chip de la lista y la pantalla clara.
FALLO CONOCIDO:       la subida por bloques sigue corrompiendo de vez en cuando (probado el 15-sep: la misma copia falló y la segunda traduce); esto NO lo arregla, solo hace que se pueda rehacer. El porcentaje sigue en 0 % mientras Autodesk no informa y luego salta a 99 %: mide solo el último tramo.
NEXT EXACT ACTION:    Manual Deploy del propietario de LOS DOS servicios (el portal NO se desplegó solo: 13 min vigilado y seguía en el build del 15-sep); después, un «Volver a intentarlo» sobre el DWG de 260 MB y su log; y su pestaña de ACC para el punto 3.
DO NOT TOUCH:         el lector PDF; P1; el WIP ajeno (FilesPage.jsx, .claude/launch.json); producción y Oregón.
COMMIT/HEAD REF:      `0aa2cb2` (backend y pruebas), `65d5184` (frontend) y un tercero con el forzado de la traducción; origin/main tras el push

### Unidad ARCHIVOS · MARCAS DE PDF Y PORCENTAJE DE PREPARACIÓN — PORCENTAJE COMMITEADO; MIGRACIÓN 32 APARCADA POR EL DUEÑO, 16-sep

Las otras dos cosas que dijo el dueño en la auditoría de esta noche: «los pdf están medio raros» y «al abrir el
porcentaje tampoco es coherente». Informe: `docs/archivos/08_TRADUCCION_CAD_Y_PDF_FRENTE_A_ACC.md` §10.

[WIP HANDOFF]
TAREA:                ARCHIVOS: (A) las marcas y calibraciones de PDF no se leen ni se guardan nunca porque `file_node_id` es INTEGER y `file_nodes.id` es UUID —cada apertura deja un 500 en el log—; (B) el porcentaje al abrir un CAD no medía nada: `0%` fijo durante toda la subida (3 min 32 s con el DWG de 260 MB) y salto al 99%, con el visor diciendo «Traduciendo» antes de que hubiera traducción.
IMPLEMENTADO:         A: migración a mano `backend/sql/32_marcas_de_pdf_por_uuid.sql` + rollback; convierte el tipo y nada más, con guardia de `ecd_migrator` y abortando si alguna fila no convierte. NO se toca `_migrar_a_uuid`: sigue ahí y es inofensiva, pero con el esquema congelado no se ejecuta nunca —ese era el motivo real, no la propiedad de `doc_redlines`, que es otra tabla—. B: `_upload_to_oss` acepta `avisar(hechas, total)` y lo llama al empezar y tras cada bloque; `pretraducir_en_fondo` lo guarda en la versión; `_progreso_de_subida` lo convierte en porcentaje (vacío si hay un solo bloque, tope 99%); `/status` sin manifiesto devuelve `fase='subiendo'` con ese número; `CadViewer.jsx` deja que la fase la decida `/status` en vez de declararse «traduciendo» de entrada.
PENDIENTE:            1) B va commiteado («SOLO 1 Y 2»); falta push y Manual Deploy del backend y del portal. 2) A (la 32) NO se commitea por decisión del dueño: «NO MIGRAREMOS NADA», y tras explicársela, «SOLO 1 Y 2». Sus tres ficheros quedan SIN SEGUIMIENTO (`backend/sql/32_*.sql` y `backend/tests/test_migracion_marcas_de_pdf.py`); las marcas de PDF siguen rotas. No volver a proponerla sin que él la saque. 3) Sigue abierto el punto 3 del encargo (dibujado contra ACC: falta su pestaña) y, de la lista del §7, la «@» en los nombres, sacar la pre-traducción del proceso que gunicorn recicla, y la causa de que la subida por bloques corrompa.
ARCHIVOS MODIFICADOS: backend/routes/docs_cad.py, frontend-docs/src/components/CadViewer.jsx, backend/tests/test_copia_incompleta_en_autodesk.py (el falso `_upload_to_oss` acepta `avisar`), docs/archivos/08…md, docs/AI_WORKSTATE.md; nuevos: backend/sql/32_marcas_de_pdf_por_uuid.sql, backend/sql/32_marcas_de_pdf_por_uuid_rollback.sql, backend/tests/test_migracion_marcas_de_pdf.py, backend/tests/test_porcentaje_de_preparacion.py. Ajenos, no tocados: FilesPage.jsx, .claude/launch.json y los untracked históricos.
TESTS EJECUTADOS:     pytest completo → 1 failed, 1958 passed (el fallo es test_capacidades_con_puerta, preexistente); npm test → 10 bancos en verde; la 32 EJECUTADA de verdad contra un PostgreSQL 18 de usar y tirar (initdb en el temporal) con el esquema de hoy y sus cuatro índices: 9 comprobaciones en verde, incluidas las dos guardias, la consulta real de `list_markups` y las dos direcciones del rollback; banco `banco_fases` con el `CadViewer` REAL y un backend de mentira → 10/10; ESLint de CadViewer.jsx = el mismo error que HEAD, ninguno nuevo.
TESTS PENDIENTES:     en producción: abrir un plano y comprobar que ya no sale el 500 de las marcas (después de la 32), y subir un CAD grande para ver la cuenta de bloques de verdad.
FALLO CONOCIDO:       el porcentaje de la fase de traducción sigue siendo el que informa Autodesk, que da saltos suyos; esto arregla el tramo de subida y la etiqueta, no el informe de Model Derivative.
NEXT EXACT ACTION:    push y Manual Deploy (backend y portal) del porcentaje.
DO NOT TOUCH:         el lector PDF; P1; el WIP ajeno; producción y Oregón.
COMMIT/HEAD REF:      B = `feat(cad): count the upload …` sobre 0ffc962; A sin commitear

### Unidad VISOR 3D · SOMBRA AMBIENTAL EN METROS REALES — 28fa7a3 DESPLEGADO (PC bien, tableta con manchones) + ARREGLO DE TABLETA, 16-sep

El dueño comparó la topografía `PASTEADO_GENERAL.shared.dwg` en ACC y en `visor.alephia.com.pe`: en ACC el relieve tiene
volumen y en el nuestro sale plano. Autorizado: «VAMOS, CON CUIDADO Y SIN ROMPER NADA». Informe: `docs/archivos/08…` §11.

[WIP HANDOFF]
TAREA:                VISOR 3D: la topografía salía plana frente a ACC.
IMPLEMENTADO:         `frontend-react/src/components/Viewer.jsx`, SOLO el bloque de la sombra ambiental dentro de `applyViewerVisualQuality`: se llama a `viewer.impl.renderer().setAOOptions` (con `viewer.impl.setAOOptions` de respaldo) y el radio va en metros reales, `(__vqAoMetros ?? 2.5) / viewer.model.getUnitScale()`; `__vqAoRadius` sigue siendo el ajuste a mano en unidades de escena. El fichero tiene WIP AJENO (7 bloques, ~48 líneas): se commitea SIN él, poniendo en el índice HEAD + este bloque con `git hash-object -w` + `git update-index --cacheinfo`; el WIP sigue en el árbol de trabajo, intacto.
PENDIENTE:            `28fa7a3` desplegado y verificado en producción (radio 2500 aplicado solo). En la TABLETA Android del dueño salió en manchones negros: segundo commit con `isMobileDevice()` → radio de fábrica en tabletas y móviles (como antes de hoy), 2,5 m en PC (también táctil). `6edb7f6` desplegado y la franja SIGUE en la tableta. Sus pruebas en el panel no valen: el código reimpone los efectos en cada carga y en cada filtro. Tercer commit: interruptor de prueba TEMPORAL `?sin=todo|sombra|aristas|suelo|fantasma` con aviso rojo en pantalla. Falta: Manual Deploy de `visor-ecd-frontend`, que el dueño abra en la tableta `?sin=todo` y luego uno a uno, y RETIRAR el interruptor al saber la causa. Informe §11, últimos apartados.
ARCHIVOS MODIFICADOS: frontend-react/src/components/Viewer.jsx (solo el bloque), docs/archivos/08…md, docs/AI_WORKSTATE.md.
TESTS EJECUTADOS:     medido en producción con el visor real y ACC al lado: los AJUSTES eran iguales (Boardwalk, exposición −7, SAO, suavizado, aristas, sombra en el suelo, DPR); la diferencia era la unidad de escena (ACC metros, nosotros milímetros por `applyScaling:'mm'`) y que el radio nunca se aplicaba (`viewer.impl.setAOOptions` no existe en 7.126.0: radio de fábrica 10 mm con la topografía, 0,25 m con Revit). Calibrado con cámara idéntica y métricas de píxeles de `getScreenShot`: topografía de cerca, ACC 2,9 % oscuros, 10 mm 0,9 %, 2,5 m 2,7 %, 8 m 13,9 %; de lejos, 2,5 m no cambia nada; estructuras (3 `.rvt`) sin cambios con 2,5 m. La cuenta del código nuevo, comprobada contra el visor real (→ 2500 en milímetros). El radio sobrevive a `setLightPreset`, `setQualityLevel` y `prefs.set`. ESLint de Viewer.jsx 62 → 62, ninguno nuevo; `vite build` a carpeta temporal, OK.
TESTS PENDIENTES:     la mirada del dueño tras el despliegue.
FALLO CONOCIDO:       sin el ajuste de sesgo de ACC (`getAOBias`, 7.126.1), con radios grandes las zonas llanas se manchan; por eso 2,5 m y no los 8 m de ACC. `__vq.ao()` sigue llamando al método inexistente (fuera del bloque autorizado): para calibrar a mano, `__vqAoMetros = n; __applyViewerVisualQuality()`.
NEXT EXACT ACTION:    push y Manual Deploy de `visor-ecd-frontend`.
DO NOT TOUCH:         el WIP ajeno de Viewer.jsx y los demás protegidos; la migración 32 (aparcada).
COMMIT/HEAD REF:      `fix(viewer): …` encima del commit del porcentaje

### Unidad VISOR · COMPARADOR · PARPADEO, «EL OTRO DESAPARECE» Y 409 EN DRENAJE — `28c2f49` DESPLEGADO Y VERIFICADO; CORRECCIÓN DEL DIAGNÓSTICO SIN COMMIT, 18-sep

CORRECCIÓN (18-sep, tarde): el diagnóstico de la mañana decía que el visor principal seguía dibujando bajo el comparador
(«tres visores») y que la sincronía «no es un bucle». FALSO: App desmonta el visor principal mientras se compara
(`{!compareMode && <Viewer/>}`, desde `666f21a`), y la sincronía antigua SÍ era un bucle: medido con la pestaña visible,
tras un movimiento los dos visores se redibujaban desde cero ~29 veces/s sin parar. Esa era la causa del parpadeo y el
arreglo de la sincronía de `28c2f49` la quita (medido: un redibujado por lado). La «pausa» es inocua y no hace nada.
Informe corregido: `docs/visor/01_…`; preguntas siguientes (varios modelos, archivo local, ECD Docs): `docs/visor/02_…`.

SEGUNDO PARPADEO (18-sep, noche; `docs/visor/01_…` §5, EN LOCAL, SIN COMMIT): «el lado de rojo parpadea cuando me acerco o
giro», y solo con una versión inicial en A. Caso suyo: canal `004120@004145` v2 (2.749 de 304.373 piezas con material al 50 %,
configuración suya) contra v58 (ninguna). LMV dibuja las transparentes solo al terminar todas las opacas; con el dibujo
progresivo no termina mientras la cámara se mueve → desaparecen en cada movimiento. Medido girando B, fotogramas de A sin
ellas: 6/6, 7/7, 45/74; con A sin dibujo progresivo 0/8, 0/9, 0/53, y con el código exacto aplicado a mano en su pestaña
16/16 con ellas. Arreglo: `dibujarEnteroSiHayTransparentes` en `CompareView.jsx` (solo el lado con transparentes, al terminar
su geometría; no se guarda en el navegador). Banco `probar-comparar` 4 casos; ESLint 4 = HEAD. Lección: probar con SU caso
(versiones distintas, de cerca); con «los mismos modelos» no sale. Evidencia: `docs/visor/evidencias/comparador_transparentes_2026-09-18.json`.

El propietario, tras desplegar la apertura del lector: «cuando hago comparar los modelos empiezan a parpadear; cuando me acerco
en uno, el otro desaparece; y al comparar modelos de drenaje urbano sale error» (consola: `POST /api/inventory/extract` 409 y
«[Compare] Error: No se pudo iniciar la extracción de lado A · vínculo 1»). Informe: `docs/visor/01_COMPARADOR_PARPADEO_Y_VERSIONES.md`;
medición: `docs/visor/evidencias/comparador_medicion_2026-09-18.json`.

[WIP HANDOFF]
TAREA:                que el comparador no parpadee ni pierda un lado al mover, y que compare versiones de los modelos de drenaje.
IMPLEMENTADO:         `frontend-react/src/components/CompareView.jsx`: la pausa del visor principal usa `viewer.impl.stop()`/`run()` (la de junio llamaba a `viewer.stop()`, que NO existe en LMV 7.x: nunca pausó nada y tres visores dibujaban a la vez), sobre `__mainViewer` y `NOP_VIEWER` y solo sobre el que corre; la sincronía de cámaras copia solo si posición/objetivo/vertical cambiaron (evita la cámara «sucia» y el redibujado de más); la extracción temporal manda `scope` (frente desde el que se compara) y enseña el motivo real si el servidor no la arranca. `backend/routes/inventory.py`: `_extraction_source_context(…, scope_hint)` elige, entre las obras YA registradas para el linaje, la del frente declarado (no es prueba de propiedad; sin frente o con frente no registrado sigue el 409); `start_extraction` lo lee solo para `__cmp__` y lo pasa al hilo. `frontend-react/src/probar-comparar.jsx`: palanca `window.__extraccion`.
ESTADO:               medido en producción con el Chrome del dueño: `typeof viewer.stop` undefined y `_renderLoopOn` true con 6 modelos debajo del comparador; tras un gesto en A los dos lados reciben los mismos eventos (5/5, 7/7, 12/12) y A queda `dirty`; sin bucle infinito (0 eventos/s en reposo). 409 reproducido: `…DR-HD-011259@011263` v23 vs v24 → `SOURCE_SCOPE_AMBIGUOUS` (el HD está vinculado en `1_DRENAJE` y en el frente de interferencias); `…DR-ST-011242` v40 vs v41 funciona. Arreglo probado: backend 10 pruebas nuevas + suite 1989/1 (fallo preexistente); ESLint CompareView 4 (HEAD 6); banco `probar-comparar` construido y recorrido (409 → mensaje con código; 202 → «Listo»; el cuerpo lleva `scope`).
PENDIENTE:            `28c2f49` empujado («SI HAZLO») y desplegado por el propietario en backend y visor; verificado: /api/health 28c2f49b5c91 y el paquete del visor con el código nuevo; en producción, sin pimpón (medido). Sin commit: la corrección del diagnóstico (comentarios de `CompareView.jsx`, sin cambio de comportamiento; `docs/visor/01_…` corregido; evidencia JSON ampliada) y el análisis nuevo `docs/visor/02_…`. Falta: que el propietario mire el parpadeo con drenaje, y repetir `…DR-HD-011259` v23→v24 (crea extracción temporal: lo lanza él). De `docs/visor/02`: emparejar por documento cuando un lado tiene varios (1 «modificado» falso medido con encofrados) y la decisión sobre la identidad de los modelos del ECD/locales (hoy se quedan sin datos: `INVALID_SOURCE_URN`). `LOB4DWorkspace.jsx` tiene el mismo `stop?.()` muerto (protegido, sin tocar).
ARCHIVOS MODIFICADOS: backend/routes/inventory.py, frontend-react/src/components/CompareView.jsx, frontend-react/src/probar-comparar.jsx; nuevos: backend/tests/test_comparador_documento_en_dos_obras.py, docs/visor/01_COMPARADOR_PARPADEO_Y_VERSIONES.md, docs/visor/evidencias/comparador_medicion_2026-09-18.json; docs/AI_WORKSTATE.md.
TESTS EJECUTADOS:     `pytest tests/test_comparador_documento_en_dos_obras.py tests/test_comparador_perimetro.py tests/test_compare.py tests/test_inventory_identity_core.py` 39/39; suite completa 1989 pasan / 1 falla (`test_capacidades_con_puerta`, preexistente); ESLint `CompareView.jsx` 4 (HEAD 6) y `probar-comparar.jsx` 0; `vite build --config vite.banco.config.js` OK; banco en Chrome integrado (5181) con dos casos.
TESTS PENDIENTES:     producción tras desplegar: comparar `…DR-HD-011259` v23 vs v24 desde `1_DRENAJE` (debe extraer y comparar) y mirar el parpadeo con drenaje.
FALLO CONOCIDO:       el 404 de `/api/civil/…?scope_urn=1_DRENAJE` de su consola es otra cosa (el frente no tiene datos civiles) y no se toca.
NEXT EXACT ACTION:    `1befc04` (corrección) y `1bc97ae` (emparejar por documento) empujados («si, vamos») y DESPLEGADOS por el propietario; verificado: /api/health 1bc97ae0296a, paquete del visor con el código nuevo, y en producción canal `004120` v58 contra v58 + ENCOFRADO v24 → 0 modificados, 0 eliminados, 6.094 agregados (todos del encofrado). El propietario pregunta qué recomiendo porque los modelos de ejecución no existen en el contractual: respuesta en `docs/visor/02` §5 (contractual contra sí mismo; ejecución contra sus propias versiones; mejora propuesta y no hecha: enseñar aparte los documentos que solo están en un lado). Esperar su decisión sobre esa mejora y sobre el contrato de identidad del ECD (B1). Detalle de lo que entró (`docs/visor/02` §2.1): `routes/compare.py` (diff por `external_id` + `source_lineage` cuando un lado tiene varios documentos; filas con `fa`/`fb` y `fuentes`; `/api/compare/element` acepta un lado ausente), `CompareView.jsx` (mapa por fichero; pintar, aislar, espejo y detalle por documento), banco `probar-comparar.jsx`, `tests/test_comparador_por_documento.py` (8) y `herramientas/ensayo_comparador_por_documento.py` (12/12 contra PostgreSQL desechable, reproduce el «antes»). Suite 1997/1 (la de siempre). Tras desplegar: repetir en producción el caso de encofrados (esperado 3.443 agregados, 0 modificados). Lo segundo de §4 (identidad de los documentos del ECD en el inventario) es una decisión sobre B1: su «si, vamos» respondía al commit/push; se le pide aparte, explícitamente, antes de tocar nada.
DO NOT TOUCH:         los protegidos de siempre (incluido LOB4DWorkspace.jsx) y el WIP ajeno.
COMMIT/HEAD REF:      `fix(compare): pause the main viewer for real, sync cameras only on change, and compare versions of documents linked in two projects`, sobre `f9345b4`.

### Unidad ARCHIVOS · CAD · LOS DWG COMO EN AUTOCAD — `1bd162c` y `2635719` (versión elegida y apertura como ACC) DESPLEGADOS EN BACKEND VA Y PORTAL Y VERIFICADOS, 21-sep

El propietario, comparando un DWG en ALEPHIA y en ACC: «debemos respetar el CAD original; lo que se ve en CAD en mi
PC, que se vea lo mismo en la web» y «todo junto». Informe: `docs/archivos/16_CAD_COMO_EN_AUTOCAD.md` (§4: versiones y
apertura). Verificado el 21-sep: `/api/health` en `26357191c262` y el portal sirviendo el `CadViewer` con `vistas: 'autocad'`.
El bloque de abajo es el handoff previo al despliegue.

[WIP HANDOFF]
TAREA:                vistas 2D de los DWG iguales a como las configuró el cadista.
IMPLEMENTADO:
- Backend (`routes/docs_cad.py`): los DWG se traducen con `"advanced": {"2dviews": "pdf"}`, así que AutoCAD dibuja cada vista 2D, como hace ACC.
  - Va en OTRO objeto de Autodesk (`docs-<versión>-pdf2d.dwg`), con su estado en `cad.vistas_pdf`.
  - Mientras se prepara se da la traducción de siempre, con `preparando_vistas`.
  - Se copia en Autodesk (OSS copyto) si el dibujo ya estaba allí; si no, se sube.
  - Si Autodesk falla, se vuelve a la de siempre (`retry_legacy`).
  - Solo lo pide el lector nuevo (`vistas: 'autocad'`), y las subidas de DWG.
- Portal (`CadViewer.jsx`):
  - pide las vistas de AutoCAD;
  - da un aviso mientras se preparan;
  - vuelve a la traducción de siempre si Autodesk no puede;
  - `utils/capasDelDwg.js` aplica el estado de capas del DWG a todas las vistas 2D.
ESTADO:
- Capas: verificado en Docs local con su lámina (en P08-0006, 5 capas apagadas solas; magenta de 4.375 a 1.757 px).
- La traducción de Autodesk NO se puede probar en local (las credenciales solo están en Render).
PENDIENTE:
1. Manual Deploy de SOLO `visor-ecd-backend-va`. Es inerte para los usuarios: el portal actual no pide las vistas nuevas.
2. Abrir su DWG en Docs local (5182) y esperar a que se prepare.
3. Él lo compara con su Civil 3D.
4. Si está igual, Manual Deploy de `visor-ecd-portal`.
- Coste: cada DWG ya subido se traduce una vez más la primera vez que se abre.
ARCHIVOS MODIFICADOS:
- `backend/routes/docs_cad.py`, `backend/routes/documents.py`, `backend/routes/uploads.py`
- `backend/tests/test_vistas_de_autocad.py`
- `frontend-docs/src/components/CadViewer.jsx`, `frontend-docs/src/utils/capasDelDwg.js`
- `frontend-docs/pruebas/capasDelDwg.prueba.mjs`, `frontend-docs/pruebas/aperturaSinRepetir.prueba.mjs`
- `docs/archivos/16_*.md`
TESTS EJECUTADOS:
- Backend 2048 pasan; falla 1, `test_capacidades_con_puerta`, que ya fallaba en HEAD.
- Portal: 12 bancos en verde.
TESTS PENDIENTES:
- La traducción real con `2dviews: pdf` y que nuestro visor abra esas vistas PDF.
- La comparación con Civil 3D (la hace él).
NEXT EXACT ACTION:    cuando `/api/health` diga `1bd162c`, abrir el DWG en `http://localhost:5182`.
DO NOT TOUCH:         no desplegar el portal antes de probar las vistas de AutoCAD en Docs local.
COMMIT/HEAD REF:      `1bd162c` sobre `4e69c9c`.

### Unidad ARCHIVOS · LECTOR · «INICIA OPACO» (vista previa nítida) Y MOSAICOS (paso 2) — `4e69c9c` DESPLEGADO (backend VA y portal, 21-sep) Y VERIFICADO POR CONTENIDO; FALTA SU PRUEBA CON SESIÓN

El propietario: «ALEPHIA sigue iniciando opaco y recién cuando nos acercamos se ve». Comparado con ACC en su Chrome
(informe `docs/archivos/14`): ACC pinta un derivado vectorial con WebGL. Nuestro «opaco» NO era pdf.js, era la vista previa.
- **Paso 1 (vista previa):** 1500 px + enfoque.
- **Paso 2 (mosaicos):** «VAMOS CON EL PASO 2». Primero el servidor de mosaicos local («vamos») y después el lado de
  producción probado en local («vamos»).
- Informe: `docs/archivos/15_MOSAICOS_PASO_2.md`, §6 para esta vuelta.

[WIP HANDOFF]
TAREA:                la lámina nítida desde el primer segundo y al acercar rápido, sin esperar al PDF, en el portal. El mosaico se prepara al subir y lo sirve el servidor con la misma puerta que el PDF.
IMPLEMENTADO:
- Backend:
  - `gcs_manager.py`: vista previa a 1500 px con enfoque (paso 1).
  - `mosaicos.py`: el generador. WebP método 2, y z0–z2 al preparar.
  - `mosaicos_almacen.py`: almacén, preparar, y a demanda con candados, cupo y caché de disco segura.
  - `routes/documents.py`: la ruta `POST /api/docs/mosaico`, una sola, con `_acceso_al_recurso`. Encola al subir por Multimedia.
  - `routes/uploads.py`: encola al subir por bloques.
- Portal:
  - `CapaMosaico.jsx`.
  - `utils/fuenteDeMosaico.js` (lógica pura) y `utils/mosaicoRemoto.js` (la ruta).
  - `PDFViewer.jsx`: fuente por documento y versión, `?mosaico=0`, y tres arreglos (base del zoom al llegar la URL, espera sin vista previa, encuadre al cambiar de lámina).
  - `PdfToolsOverlay.jsx`: marcas en z-index 9.
  - `PDFViewer.css`.
- Banco: `probar-lector.jsx` simula la ruta sobre el servidor local 5190, con `?api=` y `?dibujo=`.
ESTADO:
- Medido en Chrome sin ventana, frío y sin PDF:
  - hoja entera 0,46–0,55 s;
  - acercar rápido a z2, 0,61 s tras el gesto;
  - primera vez a z3, a 110 ms por tesela, centro ~0,7 s y vista entera 2,3 s;
  - pasear 0,7–0,9 s, con 1 petición.
- Marcas encima de las teselas. Más allá del último nivel la capa cede a pdf.js. Hoja girada: sin capa.
- Cambio de lámina limpio.
- La carrera manifiesto-antes-que-URL, demostrada en los dos sentidos: sin el arreglo, la rueda muerta.
PENDIENTE:
- Probado por el propietario en Docs local (5182) con sus láminas; commit y push hechos a su orden (`4e69c9c`).
- Desplegado por él: backend `visor-ecd-backend-va` con /api/health `4e69c9c73d40` desde las 00:21 del 21-sep y estable; portal (`visor-ecd-portal.onrender.com` y `alephia.com.pe`) sirviendo `assets/index-CZpN5ESZ.js`, que lleva `api/docs/mosaico`, desde las 00:23. (Sin sesión la ruta da 401 por la autenticación general, que va antes del enrutado: eso no prueba nada; lo prueba la versión.)
- Falta su prueba con sesión en producción: una lámina ya subida (la primera apertura la prepara el servidor), una recién subida, y la línea `[mosaico] … teselas, … ms` del log de Render, que da el tiempo real de preparación en esa máquina.
- La puesta al día es opcional: cada lámina se prepara sola en su primera apertura. Si la quiere, decidir dónde corre.
- Revisar la subida del techo del perfil portal (285 → 286).
ARCHIVOS MODIFICADOS:
- Modificados:
  - `backend/gcs_manager.py`, `backend/routes/documents.py`, `backend/routes/uploads.py`
  - `backend/tests/test_vista_previa_legible.py`, `backend/tests/test_perfil_portal.py`
  - `frontend-docs/src/components/PDFViewer.jsx`, `PDFViewer.css`, `PdfToolsOverlay.jsx`
  - `frontend-docs/src/probar-lector.jsx`, `frontend-docs/probar-lector.html`
- Nuevos:
  - `backend/mosaicos.py`, `backend/mosaicos_almacen.py`
  - `backend/tests/test_mosaicos_del_documento.py`, `backend/tests/test_mosaicos_almacen.py`
  - `backend/herramientas/servidor_mosaicos_local.py`, `prueba_mosaicos.py`, `prueba_vista_previa_nitidez.py`
  - `frontend-docs/src/components/CapaMosaico.jsx`
  - `frontend-docs/src/utils/fuenteDeMosaico.js`, `mosaicoRemoto.js`
  - `frontend-docs/pruebas/fuenteDeMosaico.prueba.mjs`
  - `docs/archivos/14_*.md`, `docs/archivos/15_*.md`, `docs/archivos/evidencias/previa/`
TESTS EJECUTADOS:
- Backend: 2028 pasan y 1 falla que ya fallaba en HEAD (`test_capacidades_con_puerta`).
- `npm test` del portal: 11 bancos en verde.
- ESLint: los ficheros nuevos limpios; `PDFViewer.jsx` con los 4 errores de HEAD.
- Banco en Chrome sin ventana, cuatro escenarios: frío, carrera, marcas y cambio.
TESTS PENDIENTES:     producción tras el despliegue. Ahí se medirá el tiempo real de dibujo a demanda en Render; el que se usa es una estimación de 110 ms por tesela.
FALLO CONOCIDO:
- La primera vez que alguien acerca a z3 en una zona, el servidor dibuja: ~2,3 s la vista entera, estimado.
- Más allá de z3 manda pdf.js, como hoy.
NEXT EXACT ACTION:    que el propietario lo pruebe en `http://localhost:5180/probar-lector.html?mosaico=1`, y con `&frio=1&pdf=30000&dibujo=110`. Con su visto bueno, commit por lista.
DO NOT TOUCH:
- Los protegidos y el WIP ajeno (Viewer.jsx, probar-primitivas.*, la migración 32).
- No commitear:
  - `.claude/launch.json` (entradas «banco» y «mosaicos»);
  - `frontend-docs/public/_probar/` (ignorado);
  - `vite.banco.config.js`.
COMMIT/HEAD REF:      `4e69c9c` feat(archivos): tile a sheet like a map so it is sharp from the first second — sobre `8278114`, empujado a origin/main el 21-sep. Docs en local (5182) se probó con sus láminas antes de publicar.

### Unidad ACCESO · 30 DÍAS EN DOCS Y SEGUNDO FACTOR OPCIONAL — CHECKPOINT AUTORIZADO, 21-sep

El propietario (21-sep, repitiendo lo del 10-sep): «la verificación de dos pasos debe ser opcional, y cuando iniciemos
sesión debemos poder marcar que queremos estar por 30 días».

[WIP HANDOFF]
TAREA:                casilla de 30 días en el acceso de Docs y segundo factor opcional.
IMPLEMENTADO:
- La casilla solo existía en el acceso del VISOR (`f24e8f4`, 10-sep). Docs (alephia.com.pe), por donde entra él, no la tenía:
  - `frontend-docs/src/LoginScreen.jsx` y `LoginScreen.css`: «Mantener la sesión 30 días en este equipo», que manda `recordar`.
  - El backend la admite desde `f24e8f4`: 7 días sin marcar, 30 marcada; con 2FA la elección viaja firmada en el desafío.
- Los dos arreglos de sesión de `f24e8f4` tampoco llegaron a Docs. Se portan igual:
  - `App_Refactor.jsx`: al arrancar, solo un 401 de `/api/auth/me` cierra la sesión; la red caída o un 5xx no.
  - `utils/apiFetch.js`: solo cierran sesión los 401 con `NO_TOKEN`/`INVALID_TOKEN` o los de `/api/auth/me`.
- `backend/segundo_factor.py` (`exigido_para`): el segundo factor es opcional salvo con `EXIGIR_2FA=admin|todos`.
  - Antes se exigía siempre al admin, sin forma de aflojarlo.
  - `EXIGIR_2FA_ESTRICTO` sin `EXIGIR_2FA` ya no deja fuera a nadie.
- `docs/entidad/11-guia-despliegue-instancia.md`: filas de `EXIGIR_2FA` y `EXIGIR_2FA_ESTRICTO` al día.
- Maqueta v2 del acceso con la casilla: `docs/ux/maquetas/pantallas_de_entrada_v2.html` (sin commitear).
TESTS EJECUTADOS:
- 2FA: 54 pasan, y 5 de ellas fallan con la regla anterior.
- Suite backend: 2054 pasan sin `test_capacidades_con_puerta.py`, cuyo fallo conocido sigue (1 falla y 3 pasan).
- ESLint: 0 → 0 en los tres ficheros del portal.
- Docs local (5182) reconstruido: la casilla se ve y el cuerpo del login lleva `recordar`.
PENDIENTE:
1. Él entra en `http://localhost:5182` con la casilla marcada. Docs local habla con el backend de producción, que ya admite los 30 días.
2. Commit y push autorizados en este chat. Manual Deploy del backend VA y del portal NO ejecutado ni autorizado en esta entrega.
3. ANTES de quitarse su propio 2FA:
   - que el backend nuevo esté desplegado;
   - que en Render no exista `EXIGIR_2FA` ni `EXIGIR_2FA_ESTRICTO`. La guía 11 los recomendaba, y con el estricto encendido y el 2FA quitado el admin se queda fuera.
DO NOT TOUCH:         no quitar ni cambiar el 2FA de ninguna cuenta; lo hace cada uno en «Mi cuenta».
COMMIT/HEAD REF:      checkpoint conjunto con ENTRADA sobre `2635719`; resolver por `git log -1 -- backend/segundo_factor.py`. Sin cambios funcionales del agente que empaqueta; pruebas anteriores de Claude conservadas, no repetidas por instrucción del propietario.

### Unidad ENTRADA · GRIS MEDIO EN EL INICIO, LOS PROYECTOS DE DOCS Y LA ENTRADA DE VIEW — CHECKPOINT AUTORIZADO, 21-sep

El propietario pidió estas tres cosas:
- «No tan blanco sino como escala de grises».
- «Que sea como la maqueta y solo a esas pantallas».
- «Con cuidado y sin romper nada».

La maqueta es `docs/ux/maquetas/pantallas_de_entrada_v4.html`, en el tono gris medio, que es con el que abre. El acceso se queda como está.

[WIP HANDOFF]
TAREA:                aplicar el aspecto de la maqueta v4 (gris medio) a cuatro pantallas sin cambiar la lógica.
IMPLEMENTADO:
- Docs:
  - `pages/entradaGris.css` (nuevo): la paleta y las reglas cuelgan de `.entrada-gris`, así que Archivos y el resto de Docs no cambian.
  - `pages/HubPage.jsx`:
    - cabecera gris carbón y fondo gris;
    - fichas sólidas con borde fino;
    - fuera la luz difusa y el efecto cristal.
  - `components/MiTrabajo.jsx`: colores de la paleta (solo se usa en el inicio) y el contador en Navy.
  - `pages/SecureProjectsPage.jsx`:
    - cabecera, bienvenida, pestañas y buscador con icono;
    - la tabla lleva la clase propia `eg-tabla`, sin tocar `.data-table` de Archivos;
    - sin emojis: 📁, 🏗️ y 🤝 pasan a iconos de línea.
- View:
  - `components/LandingPage.css`: la paleta se redefine en `.acc-home-wrapper`, no en `:root`. Incluye las ventanas de nuevo proyecto y nuevo portafolio.
  - `components/LandingPage.jsx`:
    - la cabecera compartida también sale en la pantalla de frentes, que antes no tenía ninguna;
    - el avatar muestra las iniciales (antes decía «VE» para todos);
    - todos los frentes llevan el mismo icono de línea;
    - al crear un frente ya no se pide emoji, porque no se mostraba en ningún sitio (se sigue guardando 📌);
    - los estilos en línea pasan a clases.
  - `App.css`: `.acc-main-title`, `.frente-header h1` y sus subtítulos salen de la regla global con `!important` que los ponía en mayúsculas. Solo los usa LandingPage.
- Bancos incluidos en el checkpoint autorizado:
  - `frontend-docs/probar-entrada.html` y `src/probar-entrada.jsx`: inicio y proyectos con datos de ejemplo;
  - `frontend-react/probar-entrada.html` y `src/probar-entrada.jsx`: lista, frente y formulario.
TESTS EJECUTADOS:
- ESLint: 0 en todos los ficheros tocados, igual que en HEAD.
- Tripwires: T7b baja de 4006 a 3969 literales. Ese fallo ya existía; el resto de comprobaciones siguen igual.
- Capturas de los bancos: las cuatro pantallas salen como la maqueta.
- Corregida la raya de la pestaña activa de View, que quedaba 8 px por debajo de la cabecera.
- Reconstruidos Docs local (5182) y el banco del visor (5181).
PENDIENTE:
1. Él lo revisa con sus datos:
   - Docs en `http://localhost:5182`;
   - View en `http://localhost:5181`, entrando con su usuario (ahí ya está la casilla de 30 días).
   - Ojo: la ficha View de Docs local apunta a 5173, el servidor de desarrollo, que está parado.
2. Commit y push junto con ACCESO autorizados expresamente en este chat.
   Manual Deploy del backend VA, portal y visor queda pendiente de autorización separada.
DO NOT TOUCH:         el acceso (se queda como está), Archivos y el resto de pantallas.
COMMIT/HEAD REF:      checkpoint conjunto con ACCESO sobre `2635719`; resolver por `git log -1 -- frontend-docs/src/pages/entradaGris.css`. Sólo estos dos bloques del handoff entran al commit; WIP de 4D/perfiles/reextracción/ViewerFacade, migración32 y demás notas ajenas permanecen fuera. Empaquetado sin auditoría funcional ni repetición de pruebas por instrucción del propietario.

### Unidad ARCHIVOS · LECTOR · APERTURA SIN HOJA EN BLANCO — COMMIT Y PUSH AUTORIZADOS («si», 18-sep); FALTA DESPLEGAR EL PORTAL

Tras desplegar P1, el propietario: «abro cualquier PDF, se ve borroso, espero a que cargue, y es como si se actualizara y
vuelve a aparecer incompleto, va cargando y recién carga todo». Reproducido en el banco (informe 13 §5.2): miniatura
flotante → 10,5 s de hoja en blanco → pintado por trozos. La propuesta del informe 13 §6 («tratar la miniatura igual que la
vista previa») la aceptó con «si» el 18-sep. Informe: `docs/archivos/13_ZOOM_BORROSO_DIAGNOSTICO.md` §7.

[WIP HANDOFF]
TAREA:                que la miniatura se comporte como la vista previa: dentro de la hoja, en su sitio, y retirada sólo con la página 1 dibujada entera; también al cambiar de lámina con el lector abierto.
IMPLEMENTADO:         `PDFViewer.jsx`: una sola capa `.pdf-vista` para la vista previa o, si no la hay, la miniatura (`imagenProvisional`); fuera la silueta flotante (`.pdf-silueta`, `siluetaLista`); `pedidoDesde`/`documentoAbierto` dicen si el documento abierto es ya el de la lámina pedida (el lector no se desmonta al cambiar de lámina, y antes la imagen sólo salía al abrirse el documento nuevo); `encajarConLaVista` encuadra también al cambiar de lámina y no recentra si el usuario ya movió la hoja; si la vista previa no carga se vuelve a la miniatura. `PDFViewer.css`: fuera `.pdf-silueta`. Backend sin tocar.
ESTADO:               medido en el banco local con 004120 y red de producción: sin vista previa, la lámina entera en su sitio a 0,33 s y nítida de un solo paso a 47,86 s; 0 fotogramas en blanco o a medias (antes: 10,5 s en blanco y 3,4 s por trozos). Con vista previa, igual y sin cambio en lo legible (1,18 s). Cambio de lámina desde encuadrada, desde ×3,14 y desde ×3,14 con vista previa: la nueva entera y encuadrada a 0,26–0,28 s, 0 fotogramas en blanco o a medias. Puerta multipágina (7 pasos) bien con la miniatura. Vector y reapertura sin cambio.
PENDIENTE:            commit y push autorizados por el propietario («si», 18-sep); falta el Manual Deploy del portal, que hace él (el backend no cambia), y verificarlo en producción. Fuera de esta unidad: sin vista previa ni miniatura (miniatura «pendiente» en la primera apertura) el lector sigue como antes; el zoom (informe 13 §6).
ARCHIVOS MODIFICADOS: frontend-docs/src/components/PDFViewer.jsx, frontend-docs/src/components/PDFViewer.css; docs/archivos/13_ZOOM_BORROSO_DIAGNOSTICO.md (§7), docs/archivos/evidencias/zoom/apertura_con_el_arreglo.png y apertura_medicion.json, docs/AI_WORKSTATE.md.
TESTS EJECUTADOS:     banco local (`probar-lector.html`, PDFViewer real, lámina de 71,9 MB), Chrome sin ventana 1920×945, red 2,4 MB/s + 200 ms, fotograma a fotograma y registro del DOM de la capa provisional: apertura off/2000, tres cambios de lámina, puerta multipágina con `plano-I` (banco restaurado después, huellas iguales a las originales). Clasificador validado antes con la medición del código anterior. ESLint `PDFViewer.jsx` 4 = HEAD (los mismos); `npm test` 10 bancos en verde; `vite build` del banco OK.
TESTS PENDIENTES:     producción tras el despliegue.
FALLO CONOCIDO:       ninguno nuevo. Al acercar antes de que termine el vector la imagen provisional se ve blanda (ya pasaba con la vista previa; es el zoom del informe 13).
NEXT EXACT ACTION:    tras el despliegue del portal, verificar por contenido: el paquete servido contiene la marca `SILUETA` y ya no contiene `pdf-silueta`; después, abrir una lámina pesada sin vista previa y cambiar de lámina desde una ampliada.
DO NOT TOUCH:         los protegidos de siempre y el WIP ajeno; el zoom hasta que lo autorice.
COMMIT/HEAD REF:      `fix(archivos): keep a sheet's thumbnail in place until its drawing is complete`, sobre `979c2d7`; lleva también los informes 09, 10, 12 y 13, la sección 004122 del 11 y sus evidencias.

### Unidad ARCHIVOS · PDF PESADO · P1 VISTA PREVIA LEGIBLE — `979c2d7`, EMPUJADO, DESPLEGADO Y VERIFICADO EN PRODUCCIÓN, 17-sep

Cerrado P0, el propietario fijó el objetivo siguiente: bajar `click → lámina legible` sin esperar a bajar y rasterizar el PDF
original, PRIMERO con una previsualización/proxy por versión y sin montar todavía mosaicos. Contrato suyo: representación
ligera preparada de antemano, identidad por `version_id`, misma autorización documental que la versión, mostrarla al abrir,
PDF por detrás, sustituirla al estar listo el vector sin mover zoom/centro/scroll, y fallback al lector actual si no existe.
NO autorizados: pirámide de mosaicos, motor PDF nuevo, infraestructura, zoom ×3–×8, migración de BD y lote masivo de
históricos. Sin commit hasta que él revise. Informe: `docs/archivos/11_P1_VISTA_PREVIA_LEGIBLE.md`; evidencias en
`docs/archivos/evidencias/P1_vista_previa/`.

Revisado el prototipo, el propietario lo aceptó (`P1 CONCEPT = PASS`, `2000 px JPEG q85 = CANDIDATO`, sin más experimentos de tamaño)
y autorizó la INTEGRACIÓN BACKEND EN LOCAL con reglas: la vista previa ligada a la versión; autorización equivalente a la del PDF
(`usuario → obra → documento/versión → permiso_documental`); nunca filtrar nombre, imagen ni existencia; validar que la versión es del
documento; reutilizar PyMuPDF, bucket, cola, naming por `gcs_urn` y caché de URLs firmadas; generar al subir; históricos en cola perezosa
sin lote masivo. Mediciones obligatorias antes de cualquier commit. NO autorizados: despliegue, mosaicos, WebP, lote de históricos, motor
PDF nuevo, zoom, infraestructura y migraciones.

[WIP HANDOFF]
TAREA:                enseñar la lámina legible en 1-3 s mientras el PDF pesado sigue bajando, sustituirla por el vector sin que se mueva nada, y servirla con la misma puerta que el PDF.
IMPLEMENTADO:         BACKEND: `POST /api/docs/vista-previa/url` (recibe documento y versión, resuelve el objeto, comprueba que la versión es de ese documento y pasa por `_acceso_al_recurso` — la misma función que el PDF —, devuelve URL firmada o `pendiente` y encola UNA preparación); `_encolar_vistas_previas` con marca por tamaño; `gcs_manager.crear_vista_previa` = `get_or_create_thumbnail(urn, 2000, calidad=85)` con la calidad ya parametrizada; las dos rutas de subida encolan la vista previa de los PDF. FRONTEND: `PDFViewer.jsx` pide la vista previa de la versión abierta (`urlDeVistaPrevia` en `colaMiniaturas.js`), la dibuja DENTRO de la caja de la hoja, encuadra con la proporción de la imagen mientras pdf.js no ha abierto el fichero, conserva el encuadre si el usuario movió la hoja durante la espera, y la retira con el dibujo COMPLETO (no con la primera tinta); `PDFViewer.css` `.pdf-vista` sin desvanecido; banco `probar-lector.jsx` con la lámina real de 71,9 MB, endpoint simulado y `?vista=`/`?inicial=vacio`. BACKEND SIN TOCAR.
ESTADO:               P1 CODE/TEST GREEN LOCAL = PASS PARA COMMIT (dictamen del propietario, 17-sep) · PREVIEW AUTH = PASS · VERSION BINDING = PASS · UPLOAD GENERATION CODE/TEST = PASS · REAL GCS E2E = NOT TESTED · HISTORICAL LAZY QUEUE = PASS · DUPLICATE GENERATION = PREVENTED · 004120 = 1,13 s A LEGIBLE · 004122 = 1,14 s A LEGIBLE (medido en local el 17-sep, informe 11 §11: preview 458 KB, generación 1,79 s, vector 17,8 s sin cambio) · RENDER COST = NOT MEASURED · FALLBACK = PASS · PRODUCTION READY = NO · coste de preparar 1,9-2,5 s de reloj y 1,8-2,5 s de CPU, 453 KB, pico 253-263 MB (camino del servidor menos la red) · clic → lámina legible 1,1 s (objetivo ≤ 5 s, preferido 1-3 s) frente a 45-50 s de hoy · primera tinta y dibujo completo del vector SIN CAMBIO (45-48 s) · reapertura sin cambio (1,1-1,6 s) · CPU y heap sin cambio · sustitución sin mover nada (scroll 0 px, hoja 0 px, lienzo 0,13 px) incluso tras arrastrar durante la espera · elegido 2000 px (436 KB, 1,9× la pantalla); 2600 y 3200 no mejoran lo que se ve · CONTRATO = 9 de 10 puntos; falta la autorización documental de la vista previa.
PENDIENTE:            1) push («push», 17-sep) y despliegue del propietario HECHOS; verificado en producción. 2) PUERTA MULTIPÁGINA: EJECUTADA (informe 11 §10) — destapó un defecto (la vista previa se retiraba con el primer dibujado del documento, fuera de la página que fuera) corregido con UNA línea en `PDFViewer.jsx` e integrado en el mismo commit por amend autorizado. Dos observaciones medidas para decidir: los 94 px que se desplaza la hoja cuando el lector abre solo el panel de miniaturas en documentos de varias páginas (comportamiento previo del lector), y que al volver a la página 1 la imagen se vuelve a montar y a pedir (en producción saldría de la caché inmutable). 3) Ejecutar el camino real contra GCS (aquí no hay credenciales): generación y subida de punta a punta. 4) Medir la generación en Render (1 vCPU): NOT MEASURED, exige desplegar. 5) `004122`: MEDIDO en local el 17-sep (informe 11 §11), legible a 1,14 s. 6) Históricos sin lote masivo (no autorizado): la 1.ª apertura encola y la 2.ª ya la tiene.
ARCHIVOS MODIFICADOS: backend/gcs_manager.py, backend/routes/documents.py, backend/routes/uploads.py, frontend-docs/src/components/PDFViewer.jsx, frontend-docs/src/components/PDFViewer.css, frontend-docs/src/components/DocumentViewer.jsx, frontend-docs/src/utils/colaMiniaturas.js, frontend-docs/src/probar-lector.jsx, docs/AI_WORKSTATE.md; nuevos sin commit: backend/tests/test_vista_previa_legible.py, docs/archivos/11_P1_VISTA_PREVIA_LEGIBLE.md y docs/archivos/evidencias/P1_vista_previa/ (2 PNG y 1 JSON). Los ficheros del banco (lámina de 71,9 MB y proxies) viven en `frontend-docs/public/_probar/`, que está en .gitignore.
TESTS EJECUTADOS:     backend: 19 pruebas nuevas (`test_vista_previa_legible.py`) con la cadena de autorización real pinchada en sus dos decisiones — permitido, sin sesión, otra obra, sin permiso documental, base caída (503), versión ajena, versión fijada, no-PDF, histórico pendiente→listo, 8 hilos simultáneos encolan 1, cola ocupada sin bloquear (<0,2 s) — y suite completa 1974 pasan / 1 falla anterior y ajena; coste del camino del servidor medido con un doble del almacén. Frontend: banco local con el PDFViewer real y la lámina de 71,9 MB, Chrome sin ventana 1920×945 y red emulada 2,4 MB/s + 200 ms (el PDF baja en 33-35 s frente a 32,8 s medidos en producción): 3 campañas (off/2000 ×2 rondas, cuatro tamaños, y la sustitución corregida), prueba de arrastre durante la espera, recortes del cajetín a 1,1 s, y coste de generación con PyMuPDF. ESLint de lo tocado igual que HEAD (4 en PDFViewer, 2 en el banco, 0 en colaMiniaturas); `npm test` 10 bancos en verde; `vite build` del banco OK.
TESTS PENDIENTES:     Render (coste de generación en 1 vCPU) y los casos de denegación de la ruta en producción (solo probados en las pruebas unitarias).
FALLO CONOCIDO:       con la vista previa puesta, acercar más de ~1,9× la ve blanda hasta que llega el vector (optimizar el zoom no está autorizado). El primer prototipo quitaba la imagen en la primera tinta y enseñaba la hoja a medio dibujar: corregido, se retira con el dibujo completo.
NEXT EXACT ACTION:    ninguna en esta unidad. Lo siguiente es la apertura SIN vista previa: ver «Unidad ARCHIVOS · LECTOR · APERTURA SIN HOJA EN BLANCO».
DO NOT TOUCH:         mosaicos/tiles, motor PDF, infraestructura, migraciones, zoom ×3–×8, lote masivo de históricos. (El «camino del lector cuando no hay vista previa» dejó de estar protegido el 18-sep: el propietario autorizó cambiarlo, ver la unidad de la apertura.)
COMMIT/HEAD REF:      `979c2d7` (= `b82c4e6` + la línea multipágina, por amend autorizado) sobre `fe84d32`; empujado el 17-sep por orden del propietario y desplegado por él; verificado: /api/health 979c2d7 y el portal sirve el código nuevo (`vista-previa/url`, marca `VISTA-PREVIA`, `.pdf-vista`).

### Unidad ARCHIVOS · PDF PESADO · P0 RANGOS Y MINIATURAS REPETIDAS — MEDIDO; QUICK WIN EN `fe84d32`, 17-sep

Tras comparar láminas con ACC (`docs/archivos/09_LAMINAS_PDF_ACC_VS_ALEPHIA.md`, solo medición, sin commit), el propietario
autorizó «PDF HEAVY · PERFORMANCE P0»: experimento controlado de la descarga por rangos con `…-004120.pdf` y `…-004122.pdf`
(baseline, `disableRange`, `rangeChunkSize` 1 MB y 2 MB, sin otros cambios del lector) y, aparte, quitar las peticiones repetidas
a `api/docs/miniaturas/urls` si se demostraba que eran redundantes. Sin commit, push ni despliegue. NO autorizados: mosaicos al
subir, vista previa en servidor, cambiar el motor PDF, reescribir el lector, zoom ×3–×8 e infraestructura. Informe:
`docs/archivos/10_P0_RANGOS_PDFJS.md`.

[WIP HANDOFF]
TAREA:                medir si la tormenta de rangos es la causa de la primera apertura lenta de láminas pesadas; deduplicar las URLs de miniaturas.
IMPLEMENTADO:         `frontend-docs/src/components/MatrixGrid.jsx` (+14 −4), COMMITEADO en `fe84d32` con autorización del propietario («commit separado», `IMPACTO PDF PESADO = NONE`): el efecto de las URLs de miniaturas depende de `firmaVista` (`JSON.stringify` de los `gcs_urn` con vista) y no de `files`, que `useFileExplorer` rehace en cada renderizado. Nada de pdf.js ni del lector en el repositorio.
ESTADO:               RANGOS = PUERTA NO SUPERADA POR NINGUNA VARIANTE · HIPÓTESIS DESCARTADA · IMPLEMENTACIÓN DE RANGOS = NINGUNA. 004120 tinta mediana: BASELINE 43,5 s · disableRange 39,9 s (−8 %, 3 de 5 rondas sin ganancia) · 1 MB 64,8 s · 2 MB 67,9 s (bajan el fichero dos veces). Todos los bytes llegan antes de la primera tinta en las 29 aperturas: pesa el tamaño (72 MB a ~2–2,6 MB/s) más 10–12 s de dibujo. MINIATURAS = REDUNDANCIA DEMOSTRADA (producción: 9 y 10 peticiones idénticas, 20 urns, al cargar una carpeta en cuadrícula) · ARREGLO = CODE/TEST GREEN en arnés (guion: HEAD 20 peticiones → 4; 10 renderizados +10 → +0; reintento de 12 s que HEAD perdía, ahora llega) · MEDICIÓN DEL ARREGLO EN PRODUCCIÓN = NOT RUN.
PENDIENTE:            1) medir el arreglo en producción DESPUÉS de desplegarlo (el propietario lo dejó fuera del bloqueo del checkpoint). 2) Rangos: cerrado, `RANGE HYPOTHESIS = DISCARDED`, no seguir investigando en este frente. 3) Push y despliegue de `fe84d32`: NO autorizados todavía.
ARCHIVOS MODIFICADOS: frontend-docs/src/components/MatrixGrid.jsx, docs/AI_WORKSTATE.md; nuevos sin commit: docs/archivos/09_LAMINAS_PDF_ACC_VS_ALEPHIA.md, docs/archivos/10_P0_RANGOS_PDFJS.md. Bancos, compilaciones, resultados y arnés en el scratchpad de la sesión (`p0/`); perfil del Chrome de banco BORRADO.
TESTS EJECUTADOS:     dos campañas válidas contra producción (29 aperturas en frío y en caliente; la primera campaña se descartó porque `004122` salió de caché), compilaciones locales servidas con `Fetch.fulfillRequest` y caché desactivada; control con el lector de producción. Arnés de `MatrixGrid` (HEAD frente al árbol, doble que cuenta la petición) en Chrome sin ventana. ESLint MatrixGrid 2 = 2 de HEAD (ninguno nuevo); npm test 10 bancos; `vite build` OK.
TESTS PENDIENTES:     medición en producción del arreglo; apertura desde la cuadrícula en producción (el clic no abrió: ventana del banco oculta).
FALLO CONOCIDO:       la sesión del Chrome de banco se perdió a mitad del trabajo, sin causa identificada (el backend no cierra sesiones al iniciar otra; `apiFetch` borra el token ante cualquier 401). Con la configuración de hoy, 3 de 11 aperturas bajaron el PDF 1,6–1,9 veces (flujo y rangos solapados): anotado, no tocado.
NEXT EXACT ACTION:    ninguna en esta unidad; el frente sigue en P1 (vista previa legible). No tocar rangos.
DO NOT TOUCH:         `RECURSOS_PDF` y el lector; mosaicos, vista previa en servidor, motor PDF y zoom ×3–×8 (no autorizados); migración 32 (aparcada); WIP ajeno.
COMMIT/HEAD REF:      `fe84d32` sobre 8c98553; sin push ni despliegue

### Unidad UX · UI POLISH · F4 BARRA LATERAL — `8c98553`, EMPUJADO Y DESPLEGADO EN EL PORTAL, 17-sep

El propietario comparó en capturas la barra lateral de ALEPHIA y la de ACC, expandida y contraída, y eligió la opción B: probar
en local el arreglo sin commitear de la columna de iconos (el WIP de `FilesPage.jsx` que no se tocaba desde F0) y resolver los
seis puntos que quedaban frente a ACC, sin quitar ni añadir entradas, con la identidad ALEPHIA y sin copiar la barra azul de ACC.
Revisado el cierre, dictamen del propietario (17-sep): `F4 BARRA LATERAL = CODE/TEST GREEN · PASS PARA COMMIT`, un único commit;
integración del arreglo previo de iconos dentro de `BarraLateral` aceptada expresamente; sin push, despliegue ni F1. Informe:
`docs/ux/UI_POLISH_03_F4_BARRA_LATERAL.md`; evidencias en `docs/ux/evidencias/F4/`.

[WIP HANDOFF]
TAREA:                barra lateral de Archivos: columna de iconos sana, foco sin recortar, hover, nombre flotante, botón de contraer con nombre, separadores y solo tokens.
IMPLEMENTADO:         nuevo `frontend-docs/src/components/BarraLateral.jsx` (dibuja lista o columna de iconos, activa con `aria-current`, hover, foco, nombre flotante en `document.body` con ratón o Tab, sobrevolable 150 ms y Escape en captura, botón de contraer con `aria-label`/`aria-expanded` y flecha girada con `scale`) y `BarraLateral.css` (solo tokens; lista con `scrollbar-width: thin` y, contraída, `scrollbar-gutter: stable both-edges`; entradas a 8 px del borde, 4 px contraída, para que el anillo de F0 no se recorte). `FilesPage.jsx` pasa las mismas entradas, grupos, permisos y filtros al componente; el arreglo sin commitear (icono que no encoge, texto que no se dibuja) vive ahora en el componente.
ESTADO:               F4 BARRA LATERAL = CODE/TEST GREEN · PASS PARA COMMIT · COLUMNA DE ICONOS = PASS · FOCUS WITH KEYBOARD = PASS · HOVER = PASS (respuesta visual medida, 1,25:1; NO se declara AA) · ACTIVE + HOVER = Navy + peso, «selected-hover» pendiente del programa de tokens · NOMBRE FLOTANTE = PASS · BOTÓN DE CONTRAER = PASS · SEPARADORES = PASS · PALETA = PASS · NAVEGACIÓN = SIN CAMBIO · TRIPWIRES = 9 PASS · T7b PREEXISTING FAIL 3.899 (−4) · WIP AJENO = INTACTO (6).
PENDIENTE:            1) HECHO el 17-sep: push por orden del propietario («haz push») y despliegue del portal lanzado por él («ya lance., y se ve los cambios.»). 2) F1 sigue sin autorizar. 3) «selected-hover» (activa con el puntero encima) queda para el programa de tokens; no se corrige en F4. 4) Mi Trabajo, fuera de esta entrega.
ARCHIVOS MODIFICADOS: frontend-docs/src/pages/FilesPage.jsx (antes WIP ajeno; integrado con autorización), docs/AI_WORKSTATE.md; nuevos: frontend-docs/src/components/BarraLateral.jsx, frontend-docs/src/components/BarraLateral.css, docs/ux/UI_POLISH_03_F4_BARRA_LATERAL.md, docs/ux/evidencias/F4/ (2 PNG y 1 JSON). Copia del WIP previo de FilesPage.jsx en el scratchpad de la sesión. WIP ajeno restante intacto (sha256, 6/6).
TESTS EJECUTADOS:     banco F4 (scratchpad) con la FilesPage real y servidor falso, construido tres veces (HEAD, arreglo sin commitear, F4) y medido con Chrome sin ventana a 1280×800 y entrada real CDP: contraída, iconos 1,1–4,2 px → 22 → 22, descentrado 17 → 8 → 0,5 px, separadores 0 → 0 → 3; anillo de foco con Tab recortado a la izquierda en HEAD y en el arreglo, entero en los cuatro lados en F4 (mín. 3,39:1); hover nuevo 1,25:1; nombre flotante con ratón y con Tab, sobrevolable, se va al salir y con Escape, y Escape no borra la selección de la tabla (un segundo Escape sí); títulos 2,64 → 4,95:1; icono de contraer 2,85 → 4,95:1; clic en «Especificaciones» navega en las tres; 0 errores. Tripwires 9 PASS y T7b 3.899; autoprueba 5/5; ESLint BarraLateral 0 y FilesPage 4 = 4 en HEAD; npm test 10 bancos; `vite build` del portal a carpeta temporal OK.
TESTS PENDIENTES:     Firefox, Safari y tableta = NOT TESTED (en tableta el nombre flotante no debería salir con un toque: razonado, no medido).
FALLO CONOCIDO:       ninguno medido en la barra. Cambia la silueta de la entrada activa expandida (de pastilla pegada al borde a rectángulo redondeado separado 8 px): es lo que evita el recorte del anillo.
NEXT EXACT ACTION:    ninguna en esta unidad. No empezar F1 sin orden.
DO NOT TOUCH:         Mi Trabajo y el resto de F4 del plan; `transition: all` de `.btn-*` (F1); navegación, menús y Reviews fuera de la barra; Tailwind CDN; WIP ajeno restante.
COMMIT/HEAD REF:      `8c98553` sobre 4511e8f; en origin/main y desplegado en el portal

### Unidad UX · UI POLISH · F0 + T2 — `4511e8f`, EMPUJADO Y DESPLEGADO EN EL PORTAL, 16/17-sep

Autorizado por el propietario («ALEPHIA · UI POLISH — AUTORIZACIÓN F0»): QW1, QW3, QW4, QW5, QW7 y T1. Decisiones suyas: pulsado =
desplazamiento de 1 px propio de ALEPHIA; `--a-state-hover` autorizado a corregir; barra lateral y FilesPage.jsx NO en F0 (van a
F4). Después, antes del commit, «ALEPHIA · UI POLISH F0 — T2 AUTORIZADO ANTES DEL COMMIT»: corregir el token canónico de foco
(1,52:1) sin soluciones por componente. Revisada la evidencia, dictamen del propietario (17-sep): `F0 + T2 = CODE/TEST GREEN · PASS
PARA COMMIT`, un único commit; sin push, despliegue ni F1. Informe: `docs/ux/UI_POLISH_02_F0_RESULTADOS.md`; evidencias en
`docs/ux/evidencias/F0/`.

[WIP HANDOFF]
TAREA:                F0 del pase de pulido de interacción (hover de fila instantáneo, foco visible canónico, pulsado, casilla con paleta, spinner con token y T1) y T2 (anillo de foco canónico con contraste >= 3:1).
IMPLEMENTADO:         MatrixTable.jsx fila `transition: 'none'`; index.css `.adsk-spinner` con `--a-action-primary` y bloque final «INTERACCIÓN CANÓNICA · UI POLISH F0» (`:where(…):focus-visible` con `box-shadow: var(--a-focus-ring) !important` y contorno transparente; `.inline-edit-box:focus-within`; pulsado `translate: 0 1px` solo en familias de botón; casilla `input[type=checkbox]` con color `--a-action-primary`, borde `--a-text-muted`, hover `--a-state-hover`/`--a-text-secondary`, marcada-hover `--a-action-primary-hover`, sin anillo de Tailwind al clicar); tokens T1 `--a-state-hover` claro neutral-200 y oscuro ink-500; T2 `--a-focus-ring` en los dos temas `0 0 0 2px var(--a-surface-base), 0 0 0 4px var(--a-action-text)` (antes `0 0 0 3px` Signal al 30 % / blue-400 al 45 %); Button.css pulsado con `translate` y comentarios al día.
ESTADO:               F0 = CODE/TEST GREEN · TOKEN T1 = PASS · TOKEN T2 / FOCUS CONTRAST = PASS · FOCUS WITH KEYBOARD = PASS · PRESSED = PASS · ROW HOVER INSTANT = PASS · ROW STATE TRANSITION LAG = REMOVED · POSITION ANIMATION = NOT PRESENT · FOCUS INSTANTANEITY .btn-* = OBSERVED / DEFER TO F1 · TRIPWIRES = 9 PASS · T7b PREEXISTING FAIL 3.903 · WIP AJENO = INTACTO.
PENDIENTE:            1) HECHO el 17-sep: push por orden del propietario («HAZ EL PUSH») y despliegue del portal lanzado por él; verificado por contenido: `alephia.com.pe` sirve el CSS con el anillo de T2, el pulsado y el cuadro de renombrar (publicado 8:34), sin el anillo anterior. 2) F1 NO autorizado ni empezado; candidatos: `transition: all` en `.btn` (por él el anillo tarda en `.btn-*`: 3:1 a 43–71 ms, entero a ~150 ms; FOCUS INSTANTANEITY .btn-* = OBSERVED / DEFER TO F1), hover `#4d6a8f` de `.btn-primary`, reglas duplicadas de fila/árbol/menú. 3) F2: `--a-opacity-disabled` (deshabilitado sigue sin estado en `.btn-*` y casilla) y un «borde de control» de 3:1 en el canon (T9 avisa del secundario, 1,25:1, desde antes de F0). 4) Frente aparte: Tailwind Play CDN en `frontend-docs/index.html:18`.
ARCHIVOS MODIFICADOS: frontend-docs/src/MatrixTable.jsx, frontend-docs/src/index.css, design/alephia.tokens.css, design/ui/Button.css, docs/ux/UI_POLISH_01_CONTRATO_DE_INTERACCION.md (corrección: la posición de las filas NO se animaba), docs/AI_WORKSTATE.md; nuevos: docs/ux/UI_POLISH_02_F0_RESULTADOS.md, docs/ux/evidencias/F0/ (3 PNG y 4 JSON: F0_* sin T2, F0_medicion_con_T2.json, T2_*). WIP ajeno intacto (sha256, 7/7).
TESTS EJECUTADOS:     banco F0 (scratchpad: MatrixTable real + .btn-* + primitiva + casilla + spinner, Tailwind por CDN) construido ANTES y DESPUÉS y medido con Chrome sin ventana y entrada real CDP (ratón pulsado sin soltar, Tab, puntero): hover de fila final a 0 ms (antes 400 ms), pulsado 1 px en .btn-primary/.btn-secondary (antes 0), T1 cambia el fondo de la secundaria, casilla Navy con borde 4,95:1, spinner Navy, 0 transiciones y 0 posiciones intermedias al reordenar/insertar, 0 errores; repetido sobre el árbol con T2: idéntico salvo el anillo. Banco T2 con Tab y clic reales y contraste en PÍXELES por los cuatro lados: 0/30 con el token anterior (1,27–2,32:1) y 30/30 con T2 (blanco 5,40; Mist 4,98; Navy 12,31 por la banda de separación, Signal sola 2,28; oscuro 7,10; tabla de Archivos 4,40–5,40 en cabecera, fila, fila con puntero, fila seleccionada, renombrar y descripción), sin lados recortados; casillas, primitivas y cuadros enteros en el primer fotograma, `.btn-*` en tres pasadas. Tripwires después de T2 idénticos a la base (9 PASA con T4a y T9, T7b 3903 previo); autoprueba 5/5; ESLint MatrixTable igual que HEAD; npm test 10 bancos.
TESTS PENDIENTES:     la mirada del propietario en producción.
FALLO CONOCIDO:       en `.btn-*` el anillo crece con su `transition: all 0.15s` (3:1 a 43–71 ms, entero a ~150 ms); antes de F0 esos botones mostraban el contorno del navegador al instante. El propietario lo registró como `FOCUS INSTANTANEITY .btn-* = OBSERVED / DEFER TO F1`: no bloquea el commit y no se cambia todavía. Deshabilitado sin estado en `.btn-*` y casilla.
NEXT EXACT ACTION:    ninguna en esta unidad. No empezar F1 sin orden.
DO NOT TOUCH:         la barra lateral fuera de su unidad F4; navegación, menús, Reviews y Mi Trabajo; `transition: all` de `.btn-*` (F1), deshabilitado y Tailwind CDN sin orden; UX-05; WIP ajeno.
COMMIT/HEAD REF:      `4511e8f` sobre d86b1db; en origin/main y desplegado en el portal

### Unidad UX · UI POLISH · CONTRATO DE INTERACCIÓN FRENTE A ACC — SOLO ANÁLISIS, 16-sep

Pedido del propietario («ALEPHIA · UI POLISH / PROFESSIONAL INTERACTION PASS»): profesionalizar la interacción de lo que ya
existe tomando ACC como referencia de calidad; sin funciones nuevas, sin backend, «todavía no implementes». Informe:
`docs/ux/UI_POLISH_01_CONTRATO_DE_INTERACCION.md`.

[WIP HANDOFF]
TAREA:                inventario de patrones visuales del portal (Archivos, Revisiones, Mi Trabajo, navegación, menús y paneles), comparación con ACC, quick wins, primitivas, tokens y orden por impacto.
IMPLEMENTADO:         NADA de código. Solo el informe (sin commitear).
PENDIENTE:            que el propietario elija por dónde empezar (propuesta: F0 = QW1 transición de fila, QW3 foco visible, QW4 pulsado, QW5 casilla, QW7 spinner). Decisiones abiertas: mecanismo de pulsado (recomendado: el de la primitiva, translateY 1px); T1 separar `--a-state-hover` de `--a-action-secondary` (cambio del canon: autorización y tripwires); la barra lateral vive en `FilesPage.jsx`, que tiene WIP del propietario.
ARCHIVOS MODIFICADOS: docs/ux/UI_POLISH_01_CONTRATO_DE_INTERACCION.md (nuevo), docs/AI_WORKSTATE.md.
TESTS EJECUTADOS:     medición en vivo en ACC (2.120 reglas CSS, fila, botones, casilla, menú ⋮, selección, carga con MutationObserver) y en ALEPHIA (856 reglas, fila, menú contextual, selección) + censo del código de frontend-docs/src. Sin tocar datos; en ACC se reordenó la tabla y se marcaron filas por un error de calibración y se deshizo comprobando orden y selección.
TESTS PENDIENTES:     tooltips de ACC (una muestra, no concluyente), teclado en menús de ACC (teclas sintéticas no prueban nada), paneles laterales y desplegables de ACC, equivalente de Mi Trabajo en ACC.
FALLO CONOCIDO:       ninguno nuevo; los hallazgos están clasificados en el informe.
NEXT EXACT ACTION:    superada: el propietario eligió F0 y autorizó T2 (unidad F0 + T2).
DO NOT TOUCH:         UX-05 (contrato congelado, se continúa desde L0); `Toolbar` sigue aplazado; WIP de FilesPage.jsx.
COMMIT/HEAD REF:      el informe entra en el commit de F0 + T2 (`fix(ui-polish/f0): …`), sobre d86b1db

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

8. **`P0-2/homonyms-cannot-survive-flat-contract`: TEST DEFECT, retirado.**
   El caso entregaba al motor una fila **plana** y exigía que casara a la vez con
   dos propiedades homónimas cualificadas. Desde esa entrada el valor de uno de
   los grupos **ya no existe**: se perdió al aplanar. El oráculo era imposible y
   estaba en la capa equivocada. Se sustituyó por lo que **sí** se puede afirmar
   desde una entrada aplanada —que un dato ambiguo no se atribuye en silencio a
   una propiedad cualificada que no lo respalda, y que sin homonimia el nombre
   suelto sigue resolviendo— y la propiedad original se demuestra extremo a
   extremo en `filtersCore.normalizadores`. Ninguna expectativa de producto se
   cambió para conseguir verde.

7. **Comparador frente↔frente: emparejamiento entre documentos distintos.**
   Cuando los dos lados son frentes, el diff empareja por `external_id`, así que
   un elemento del documento D1 puede quedar emparejado con uno de D2 — y el
   censo B1 midió **2.146 externalIds presentes en dos frentes**. No es un
   lookup: es el algoritmo de compare, congelado. Cambiarlo altera lo que ve el
   usuario en una comparación frente-a-frente deliberada, así que es una
   **decisión de producto pendiente y queda FUERA de B1** por decisión del
   propietario (7-sep-2026). No bloquea B1.
## CURRENT TASK

**19-sep-2026 · VISOR · «AVANCE POR AGRUPACIÓN» (botón nuevo) — EN LOCAL, SIN COMMIT** (informe
`docs/visor/05_AVANCE_POR_AGRUPACION.md`). Pedido y maqueta v2 aprobada: planta 3D fija arriba, perfil en medio y
matriz por GRUPO (Localizador, como PREDICT_V01) abajo; elegir un grupo lo resalta sin mover la cámara. Nuevos
`components/AvancePorAgrupacion.jsx`, `aps/utils/avanceAgrupacion.js` (40/40 en `pruebas/avanceAgrupacion.prueba.mjs`);
cambiados `App.jsx` (ESLint 38 = HEAD), `ProfilePanel.jsx` (eventos opcionales + progreso; 3 = antes),
`piezasDelVisor.js`. Protegidos sin tocar (solo su API/eventos; el encuadre suave de la extensión se anula en la
instancia mientras dura y se devuelve). Verificado en el banco: Drenaje 132 grupos (29 fuera), Canal 19 (Politécnico
fuera, «-» sin código), DSP → 23 partidas y cámara quieta; la salida lo restaura todo (cámara ortográfica incluida).
Límite: la primera proyección del perfil en el canal ≈ 1 min. Segunda vuelta (§3 bis del 05): imagen del 4D en la
planta, frente entero por dirección principal (91 % del ancho, dentro de la banda), píldoras ocultas, guardián de
cámara, 0,5° de inclinación (una vista exactamente vertical deja la cámara de LMV sin orientación) y perfil «50 m ·
1:1» ◀ ▶; al salir, cámara y modelo intactos (el norte real no se toca). 45/45 pruebas.
Tercera vuelta (§3 ter del 05, pedido: «DSP no se distingue muy bien» y «no entiendo esas celdas, solo aparecen 5
filas»): la matriz es ahora POR PARTIDAS (filas = las partidas reales bajo su etapa, que resume «terminadas / de obra»
como PREDICT; suministro y transporte al final de su etapa; celda ✓ / % / ○ / vacía si el grupo no la tiene; etapas
plegables; canal = 70 partidas × 19 grupos, Drenaje ≈ 190 × 132 contado con PREDICT en vivo, sin abrir); el grupo
elegido va en azul intenso con el resto claro (medido: resto 155 y grupo 106 de luminancia; antes casi iguales) más
un marco y su rótulo en la planta. Arreglados: detalles de PREDICT perdidos (`lote[c] = await …`, se quedaba en «10 de
19»), columna de nombres que tapaba los grupos (tabla sin ancho fijo), nombres cortos quitando lo común de los grupos
del EJE. 57/57 pruebas. Drenaje sin medir en esta vuelta (en el navegador de la app no tiene ejes cargados y
extraerlos toca producción); filas memorizadas para que llegar un grupo no rehaga las ~25.000 celdas.
Cuarta vuelta (§3 quater): planta con media vuelta por omisión cuando el frente sigue en línea ANTES del inicio del
eje (canal: Santa Rita a la izquierda, Politécnico a la derecha, como en obra) y botón «⇄ Girar planta» recordado por
eje en el navegador. 64/64. SIN verificar en pantalla: el navegador de la app perdió la sesión tras el reinicio.
Quinta vuelta (§3 quinquies, tras verlo él: giro correcto): sin recuadro alrededor del grupo (solo su etiqueta), el
resto con el gris de la Agrupación (el casi blanco «se hace muy blanco»), perfil en 1x verdadera por tramos de 50 m
al entrar (evento `perfil-tramo` en ProfilePanel) y elegir un grupo lleva la PK a su inicio (APT 4 → 0+481.67,
perfil 0+450–0+500 · 1:1). Verificada la lógica en una pestaña OCULTA de su Chrome, no la imagen.
Sexta vuelta (§3 sexies): al elegir un grupo, nada en gris (se quita el teñido de la Agrupación), solo la topografía
(«Tin Surface») semitransparente conservando el relieve y las etiquetas de progresiva al 30 %; elegir un grupo
devuelve el perfil a su tramo en 1x aunque se hubiera hecho zoom con la rueda. SIN verificar (pestaña oculta).
Séptima vuelta (§3 septies): los dos canales en UN perfil (eje compuesto: Santa Rita a la izquierda con su PK hacia
la izquierda, Politécnico a la derecha, unidos en el 0+000 común; sigue a la planta si se gira), grupos repartidos
entre los dos ejes, perfil reescrito sobrio (grises; color solo el grupo elegido con su % y el cursor con su lectura
de cotas), rótulos sin estirar, leyenda plegada y los paneles ya no quedan bajo el riel izquierdo (64 px). Nuevo
`aps/utils/rielDelVisor.js`. 76/76. Perfil verificado por eventos en una pestaña oculta; el recorrido de Avance con
los dos ejes, NO.
Octava vuelta (§3 octies, «se pone lento»): Modelo 3D proyectado POR EJE y guardado (antes se recalculaba al llegar
el compuesto y al girar), lo fijo del perfil memorizado (solo se redibuja el cursor), PK una vez por fotograma.
Medido por movimiento de PK: 13,4–14,5 ms → 1,1–1,5 ms; 714 → 77–84 elementos SVG.
Novena vuelta (§3 nonies): Modelo 3D solo de las clases visibles, cediendo cada 8 ms, por prioridad (cerca de la
PK) y por tandas (`piezasDelVisor` reescrito); `proyectarPiezas` con `alargue` (gaviones pasado el final del eje);
Avance a ±50 m y botón «◐ Colorear por avance» (planta y perfil). Medido en Drenaje: Modelo 3D en ~6 s, coloreo
correcto y limpio al salir. Canal sin medir.
Décima vuelta (§3 undecies, «sigo sin ver los gaviones»): el eje «01 CANAL_SANTA RITA» trae sus tramos desordenados y
`densificarEje` los unía tal cual (el eje «acababa» en 0+260; los gaviones pasado el 0+732 se aplastaban en esa PK):
ahora los ordena por progresiva. `crearProyector` 5,2× más rápido con el mismo resultado (puntos alineados juntos,
claves numéricas, sin conjuntos por consulta); la barra del Modelo 3D ya no se queda en 30 % al proyectar. Medido en el
banco (canal, dos ejes, ±50 m): completo en 66 s (antes ~3,5 min), 7.380 piezas; gaviones visibles en 0+732–0+743 de
Santa Rita y 0+640–0+651 del Politécnico. 65/65 y 76/76; lint = antes (showBands ×2). CONFIRMADO por él: «SI, YA SE VIO».

**19-sep-2026 · VISOR · PREDICT EN VIVO EN EL BANCO LOCAL — SOLO CONFIGURACIÓN DEL BANCO, SIN COMMIT.** Pedido: «no
quiero que salga de ningún JSON, que salga del mismo proyecto (PREDICT_V01) una vez lo corra». Antes el banco (build de
producción, sin `VITE_PREDICT_URL`) leía la copia exportada `public/predict/predict_pqt8_sinohydro/` (7-sep; hoy idéntica
a PREDICT en vivo: 163/163 códigos y el detalle de DSP_SANTA RITA iguales), comprobado también en SU Chrome (BP-10 pidió
`…/grupos/BP-10.json`, 0 peticiones al 5001). PREDICT_V01 (`D:\PREDICT_V01`, API 127.0.0.1:5001 sobre Neo4j) solo da
CORS a 5173. Hecho: `vite.banco.config.js` (local, no se commitea) reenvía `/predict-vivo/*` → 127.0.0.1:5001 en
`vite preview`; el banco se construye con `MSYS_NO_PATHCONV=1 VITE_PREDICT_URL=/predict-vivo …` (sin MSYS_NO_PATHCONV,
Git Bash convierte `/predict-vivo` en `C:/Program Files/Git/predict-vivo` y el visor pedía `file:///…`) y después se borra
`dist-banco/predict` (la copia no llega al banco; `public/predict/` intacto). Verificado: el catálogo y el detalle salen de
`/predict-vivo/api/graph/bim/predict_pqt8_sinohydro[/DSP_SANTA RITA]` (200), 163 rótulos con avance, panel de DSP_SANTA RITA
completo, ninguna petición a la copia. Sin tocar ficheros protegidos ni PREDICT_V01. Leído en el código, NO medido: con
PREDICT apagado predictBim falla en silencio (sin datos, el visor sigue); si PREDICT arranca después del visor, recargar.

**19-sep-2026 · VISOR · OBRA LINEAL · LÍNEA AMARILLA DE PROGRESIVA PERPENDICULAR AL EJE — EN LOCAL, SIN COMMIT
(fichero PROTEGIDO, tocado con su autorización: «si, hazlo profesionalmente»).** Queja: la línea del cursor de
progresiva empieza perpendicular y, tras los cambios de dirección (quiebres en buzones), se tuerce; en la 0+135 casi
paralela al eje. Causa (`LOB4DExtension.getDirectionAtStation`): la dirección salía de la muestra con la PK más cercana
entre TODAS las de `alignmentSamples` —que guarda las de todos los ejes activos— y de la cuerda entre sus dos vecinas.
Con un solo eje activo solo fallaba en los quiebres (13,5° en la 0+585.29 del colector); con varios, tomaba la dirección
de OTRO eje. Arreglo, solo esa función (diff frente a la copia previa: 41+/5−; su WIP sin commitear intacto, git del
fichero = su +141/−7 más esto): la dirección del TRAMO donde cae la PK, con dos puntos del eje ACTIVO a ±5 cm
(`pointAtStation` + `civilToViewerPoint`, lo mismo que sitúa el cursor y dibuja el eje; extremos hacia dentro; encima del
quiebre, la bisectriz); respaldo por muestras, pero solo las del eje activo. Medido en el banco con su sesión, contra la
geometría de Civil (`subEntities`, rectas y arcos): los 46 ejes cada 0,5 m (3.056 PK, sin ±6 cm de los vértices) → antes,
con las muestras de los 46 mezcladas, 1.365 PK torcidas más de 5° (máx 89,6°); ahora 0 (máx 0°). Vista superior: 0+590 y
0+600 (entre los quiebres de −30,2° y +28,7°) a 90,00°. ESLint del fichero 16 = antes. Al commitear (cuando lo pida): solo
este trozo, sin su WIP (`git update-index --cacheinfo`, como con Viewer.jsx).

**18-sep-2026 (noche) · VISOR · INVENTARIO 409 EN DRENAJE URBANO — RESUELTO EN PRODUCCIÓN; «Reextraer inventario» EN
LOCAL, SIN COMMIT.** Síntoma: `INVENTORY_REEXTRACTION_REQUIRED` en `1_DRENAJE` (Canal normal) desde «descargar
actualizaciones» (update-all), y sus relinks no lo quitaban. Regla: `inventory_http._ensure_readable` bloquea el frente
ENTERO si un solo modelo de `model_config` no tiene activa en `inventory_identity_b1.sources` su versión vinculada; el
update-all cambia la versión ANTES de extraer (hilo en cola). Ensayo en seco, solo lectura contra APS (script en el
scratchpad, sin Postgres; el `.env` se cargó en memoria y no se imprimió nada): los 5 modelos pasan todas las reglas del
extractor (vista configurada, propiedades, árbol, cobertura de hojas, externalId, sin repetidos) → los modelos no eran la
causa. Hipótesis, NO demostrada con el log: hilos `daemon` de extracción muertos por el despliegue de las 19:18Z o por el
reciclaje del único worker (`--workers 1 --max-requests 300 --max-requests-jitter 60`); mueren sin «Extractor ERROR». La
app lo escondía: la barra de extracción desaparecía al terminar y el fallo solo decía «Error». Hecho en local:
`SourceFilesPanel.jsx` «⋯» → «Reextraer inventario» (la misma extracción de Update/Relink con la versión ya enlazada, sin
buscar en ACC) y línea final ✓/⚠ con el motivo; `TandemSidebar.jsx` pasa `reextractModel`; `App.jsx`
`triggerBackgroundExtraction` enseña el código del servidor si no arranca y «Error: <mensaje del job>». ESLint de los tres
= HEAD (47). En producción, con su «si», desde el banco `localhost:5181` con su sesión: HD-011259 v26 ✓ 1.873 (sigue 409),
HD-011264 v65 ✓ 406 (sigue 409), ST-011242 v42 ✓ 545 → `/api/inventory?model_urn=1_DRENAJE` 200 y el inventario enseña
2.852 elementos (545 + 1.873 + 406 + 1 + 27 de los DWG, que no hizo falta tocar). PENDIENTE, decisión suya: el arreglo de
fondo (update-all que no cambie la versión hasta publicar la extracción; extracciones que sobrevivan al reciclaje) y
publicar «Reextraer inventario». Trampa aparte: en el relink de un DWG el modal viene en «Solo datos Civil», que NO extrae
inventario ni reapunta. Con el 409 fuera, guardar los parámetros del 4D en el inventario (§13 del 03) queda desbloqueado.

**18-sep-2026 · VISOR · 4D POR FASES (demo `aps-phasing-poc` de Autodesk) — SOLO ANÁLISIS, sin código.** Pedido: «un
botón más para 4D, replicar eso mismo con la misma calidad de su imagen 3D; solo analiza e investiga primero». Informe:
`docs/visor/03_4D_FASES_DEMO_APS_ANALISIS.md` (sin commit). La calidad de la demo sale de los valores de fábrica del perfil
DWG (Sharp Highlights, sin aristas, sombra 3 m, fantasma), no de su código. A/B medido en su modelo y en el nuestro (su visor
restaurado y comprobado). Datos ya existentes: P6 (4.372 actividades) + `/api/lob/timeline` + `/api/lob/links`
(`DSI_CodigoDePartida` → partida → actividad). Espera sus 7 decisiones (§6) antes de construir nada; `components/lob4d/*`
y `LOB4DExtension.js` siguen protegidos. §8 (a fondo, en su Chrome): la web en vivo es byte a byte el código de GitHub;
simulación recorrida día a día (203 días, 87 con cambios, solo amarillo/rojo/azul) y con clics de ratón; las excavaciones
de la demo son TIN del modelo con conjunto de propiedades (Demo → Construct); nuestros sólidos/topografías son mallas
añadidas (dos vías para fasearlos). Evidencia: `docs/visor/evidencias/demo_4d_barrido_2026-09-18.json`.
Decisión suya: sin P6 por ahora; por progresivas sí; primero el botón y el visor 4D exclusivo. Recomendación en §9
(paso 1: botón «4D» solo admin + capa propia como el comparador, que desmonta el principal + `GuiViewer3D` con la receta
de la demo + barra de tiempo sin datos; `Visor4D.jsx` nuevo, `App.jsx` solo el montaje). Aprobado («vamos, con cuidado y
sin romper nada») y HECHO EN LOCAL, SIN COMMIT (§9.5): `Visor4D.jsx`, `aps/utils/dibujoEntero.js`, quinto argumento
opcional en `loadAlignedUrn` (`unidadPorDefecto`), `App.jsx` (botón, estado, montaje con ErrorBoundary,
`pantallaAparte` en los 5 sitios del comparador), banco `probar-4d` (4 casos) + banco del comparador sin regresión;
ESLint App 38 = HEAD, loadAlignedModels 3 = HEAD, nuevos 0; build de producción OK. `frontend-react/vite.banco.config.js`
(untracked esperado) lleva ahora la entrada `visor4d` y el reenvío /api por marca (§9.6): NO se commitea. VERIFICADO EN
LOCAL CON SU SESIÓN (§9.7, `http://localhost:5181` → backend de producción por el reenvío de `vite preview`): 5 modelos del
Frente Drenaje Urbano, cámara idéntica (0 mm), imagen de la demo, 43/43 fotogramas completos al girar, «Salir» devuelve el
principal con sus ajustes; rótulo corregido a `frontName`. DECISIÓN SUYA: «seguimos mejorando solo en local; cuando haya
algo lo publicamos» → NO commit/push hasta que lo pida. §9.8: selector de modelos (al abrir no carga nada; «Cargar»;
«Modelos · n de m» para añadir/quitar con `unloadModel`; cámara solo en la primera carga), banco 5 casos, su sesión local
OK. Pendiente: que elija la exposición (−9 / −8 recomendada / −7); el 409 del drenaje (HD-011264 v65 sin extraer:
«Relink» en Files; datos de producción, lo decide él); paso 2 (progresivas). §10: pidió un ESTÁNDAR para elegir
modelos («no crear nuevas cosas, enlazarlas»); recomendado: el frente = conjunto de modelos; UN estado (el ojo,
`hiddenModelUrns`), UNA pantalla (panel «MODELOS», `SourceFilesPanel` con `modo="seleccion"` dentro del 4D en lugar de la
lista de §9.8), las vistas guardadas como conjuntos con nombre, Docs como origen vía «Importar»/«Publicar al visor».
ESPERA SU VISTO BUENO. §11: diseño del paso 2 («¿por parámetros? que no se distorsione al activar/desactivar»): el plan es
del frente (rango de PK del eje de `civil_alignments` + tipos de trabajo con inicio/ritmo/desfase), cada pieza lleva su
PK (`DSI_Progresiva` o proyección al eje) y su tipo; el estado de cada pieza solo depende de sus datos y del instante.
Por medir con su pestaña delante: qué frentes tienen eje. §12: el «efecto excavación» de la demo está MODELADO (terreno
TIN recortado + «tapas» enlazadas Demo→Construct + fondos planos + tablestacas Temp→Demo), sin cortes; en su drenaje: 0
piezas con `DSI_Progresiva` (hay que proyectar al eje); EXCAVACIONES.rvt = capas de relleno; excavación y piedra over son
los sólidos de Civil (backend); `04_29_DSI_CodigoPlaneamiento1..4` = códigos P6 para más adelante. En su 4D local quedaron
cargados HD-011264 y EXCAVACIONES (mis pruebas). §13: él subirá una ZONA de drenaje (topografía, rellenos…) y quiere
PARAMETRIZAR EN EL VISOR: propuesto guardar «Tipo 4D» y «Fase» en `inventory_identity_b1.user_data` (extras) con el PATCH
bulk existente, modo «Parametrizar» en el 4D; condiciones: subir por «Importar» desde ACC, inventario del frente legible
(el 409 de drenaje o frente propio), los parámetros se escriben en la base real. §14: importó (ACC, al Frente Drenaje
Urbano) `CANALCERRADO.shared.dwg` (1 TIN «SCL_EXCAVACIÓN EJECUTADA») y `4D_OCT_V01.dwg` (27 sólidos AutoCAD SIN nombre ni
propiedades; capas 0 / 11.01). Falta solo el TIPO de cada sólido (EXCAVACIÓN / PIEDRA OVER / RELLENO); el orden sale por
tipo + progresiva. Dónde: modo «Parametrizar» del 4D (inventario; requiere el Relink de HD-011264) o capas en Civil 3D.
§15 (DEMO POR PAÑOS, HECHA EN LOCAL, SIN COMMIT): pidió «un parámetro para identificar qué es y en qué orden; 8 paños más
el cabezal 9; topografía desde el inicio; excavación → over → estructura → relleno por paño». Dos parámetros por pieza
(TIPO y PAÑO), 36 pasos, reglas de la demo con paños en vez de fechas. Propuesta automática en
`aps/utils/fases4D.js` (sólidos agrupados a lo largo del eje, cabezal = huella mayor en un extremo y va el último, tipo
por cota, estructura por `04_29_DSI_CodigoPlaneamiento1` o por posición, fuera de la zona sin parámetro) + corrección a
mano en «Parámetros 4D» + barra ▶/deslizador/Restablecer en `Visor4D.jsx`; parámetros en memoria de la sesión.
Verificado: `node frontend-react/pruebas/fases4D.prueba.mjs` 81/81; banco `probar-4d?caso=panos` (+`&tarde=1`) y los 5
casos de antes; en SU SESIÓN LOCAL (drenaje: ST-011242 + CANALCERRADO + 4D_OCT_V01) 9 paños con el cabezal el 9, 1/1/1
por paño, estructura 158/39/39/38/38/39/40/43/111 (el paño 1 incluye un buzón sin código, 123 piezas, por cercanía),
pasos 0–4, 22 y 36 vistos, girar a 14 ms de mediana. Defecto hallado y corregido: la propuesta salía vacía tras «Cargar»
(`loadDocumentNode` resuelve antes del árbol) → ahora espera árbol + geometría. Queda: su visto bueno al orden (buzón),
guardar en el inventario (§13, tras el 409), publicar cuando lo pida. §15.8 (tras verla, EN LOCAL, SIN COMMIT): orden
«Por tipo» por omisión (excavación 1–9 → over 10–18 → estructura 19–27 → relleno 28–36; «Por paño» sigue como opción:
dijo «por esta vez»), la estructura entra con SU color (sin amarillo), y la topografía GRIS como la demo: su TIN ya tiene
el mismo material que la demo (Phong blanco sin brillo) y el rojo viene de `vertexColors` → copia del material sin
colores por vértice, solo en el visor 4D, funciona consolidado. 93/93, banco `caso=panos` OK, visto en su sesión
(pasos 0, 9, 18, 27, 28, 36). §15.9: «el scroll está invertido» → el perfil «Default» trae `reverseMouseZoomDir=false` y el
AEC del principal `true`; el 4D sigue con «Default» pero copia el sentido de la rueda del principal (App lo pasa en
`inicio.zoomInvertido`; sin principal, el de AEC). Medido con rueda real: arriba ACERCA 11.224 mm en los dos (con el
ajuste viejo alejaba). App.jsx: ESLint 38 = HEAD. §15.10: excavación en su paso = pieza en fantasma + copia ROJA
TRANSPARENTE en capa superpuesta (la demo no es transparente: tinte 50 % opaco con fantasmas POR DELANTE; un material
transparente en la pieza salía negro por la sombra ambiental); relleno verde apagado y luego MATERIAL DEL TERRENO; over
sin cambios; estructura del CABEZAL tras su relleno por cotas (relleno >1 m bajo lo alto de la estructura = base; solo el
cabezal: 2,4 m) → 36 = estructura del cabezal. Corregido: `clone()` perdía `packedNormals` (relleno negro) → ahora
`matman.cloneMaterial`. 104/104, banco OK, visto en su sesión (pasos 1, 27, 28, 35, 36). PENDIENTE (él: «eso lo
podemos arreglar después»): que la excavación, ANTES de su paso, se vea GRIS como el terreno (hoy, el rosado de su capa).

**18-sep-2026 · VISOR · PERFIL LONGITUDINAL: PROYECTAR LAS PIEZAS DEL VISOR — EN LOCAL, SIN COMMIT** (informe
`docs/visor/04_PERFIL_PROYECCION_MODELO.md`). Pedido: «solo quiero proyectar el sólido o mis elementos de mi visor por
ahora» (como «proyectar objetos a la vista de perfil» de Civil). `aps/utils/proyeccionPerfil.js` (eje de
`__lobCivilAlignments.subEntities` densificado, progresiva/distancia por rejilla, prolongación pasado el final, silueta
por tramos de 0,25 m) + `aps/utils/piezasDelVisor.js` (geometría LMV → real = (mundo + globalOffset) × unitScale; cota
+5,268 m medida) + `ProfilePanel.jsx` («▦ Modelo 3D», franja ±15 m, «Acero» fuera por omisión, «↻», leyenda por
modelo). 26/26; en su sesión: 662 piezas en 3 s (con acero 1.550 en 19 s); el tubo HD cae entre «Clave» y «Fondo
Tubería» de Civil y el fondo de los sólidos sigue «Fondo Excavación» (0+650: 3,0 frente a 3,05). ProfilePanel: ESLint
3 = HEAD. §6 («más profesional»): líneas nunca (los 65 «Eje» de HD-011264, líneas de hasta 89 m, eran las franjas);
`clasificarPieza` por categoría/familia/tipo/capa y DISCIPLINA del fichero (ST/HD): Estructuras, Tuberías, Buzones y
sumideros encendidas; Mov. de tierras, Acero y Auxiliares (encofrado, curado, solado, empedrado, juntas PVC, masas)
apagadas; profundidad por triángulo (≤4 m color, ≤9 m medio gris, más lejos gris), de atrás hacia delante; leyenda por
clase. 54/54; en su sesión 623 piezas en 3 s; vistos 0+310–407, 0+000–036 y 0+589–703. §7 («¿por qué se ve
pixeleado?»): la silueta eran escalones de 25 cm (19 px a escala 1x en 22 m) → tramos de 5 cm, contorno por los centros
con rectas y extremos exactos (57/57; escena sintética con el módulo real: bordes rectos, 66 puntos). VERIFICADO en su
sesión desde el navegador de la app (la extensión de Chrome no conectaba; él inició sesión en el panel): tubos laterales
con bordes rectos a escala 1x. Primera proyección tras abrir el frente, 17 s (la base de propiedades aún cargando); con
todo cargado, «↻» 3,8 s. Verificado también en SU CHROME (la extensión volvió): encuadre de su captura, bordes rectos,
2,6 s. Corregido: con la pestaña oculta la proyección se paraba en el 90 % (setTimeout frenado) → `ceder()` con
MessageChannel.
**24-sep-2026 · VISOR CANAL — DOS CORRECCIONES LOCALES COMMITTEADAS;
VALIDACIÓN EN NAVEGADOR PENDIENTE.** El propietario confirmó que, en todo
Frente Canal, la rueda hacia adelante aleja, a diferencia de Drenaje Urbano;
también reportó que quitar y volver a importar una misma versión falla. Los
commits locales `91b0f88` y `84509d5` son una mitigación acotada y probada por
bancos/build, no una afirmación de UAT real ni de despliegue. El backend vivo de
Virginia respondió `1e7bf89544b3`; el visor público seguía sirviendo el bundle
anterior `index-BjMCaxao.js`, sin el código nuevo de ortofoto. No se hizo push,
deploy ni escritura productiva. Ver el último `[WIP HANDOFF]` al final.

**24-sep-2026 · ORTOFOTO CANAL — CODE/TEST GREEN LOCAL; COMMIT FUNCIONAL
`8c5ce9c`; RELEASE PENDIENTE.**
El propietario preparará semanalmente los dos JPG como en el ensayo y los
cargará desde Topografía; la capa activa NO caduca por tiempo, permanece para
los miembros del frente hasta retirada o reemplazo manual. En el worktree
aislado hay endpoints Flask con autorización por obra, objetos JPG inmutables
en GCS y cambio atómico por generación del manifiesto activo; la lectura de
los mosaicos pasa por API autenticada, sin depender de CORS del bucket. La
capa compartida se monta fuera del panel sobre el modelo/`dbId` exactos y
conserva los porcentajes de sombreado elegidos al publicar. El ensayo local
con el modelo real cubrió 43/43 fragmentos y dos JPG 4000×5961, sin publicar.
El backend local que sirve la sesión del visor principal sigue en el código
anterior y responde 404 a la ruta nueva. La API nueva se probó con GCS/DB
falsos y dos clientes, y la capa React con un banco visual aislado que verificó
A retenida → B → A tardía descartada, close/reopen, cambio de scope, retirada
y revisión repetida sin montaje duplicado. El visor real mostró la vista previa
43/43. Son pruebas locales; el smoke con GCS real queda para el despliegue.
No push, no deploy, no producción modificada. Ver `[WIP HANDOFF]` más reciente.

**18-sep-2026 · VISOR · COMPARADOR — `28c2f49` DESPLEGADO Y VERIFICADO.** La causa del parpadeo era la sincronía de cámaras
(pimpón: ~29 redibujados desde cero por segundo en los dos visores, medido con la pestaña visible); el 409 de drenaje, un
documento vinculado en dos obras. CORRECCIÓN: lo de «tres visores» era falso (App desmonta el principal al comparar).
Ver «Unidad VISOR · COMPARADOR» y `docs/visor/02_…` (varios modelos por lado, archivo local, ECD Docs).
Después, un SEGUNDO parpadeo (el lado con piezas semitransparentes, `docs/visor/01_…` §5): arreglo en local, sin commit.

**18-sep-2026 · ARCHIVOS · LECTOR · APERTURA SIN HOJA EN BLANCO — `f9345b4` EMPUJADO Y DESPLEGADO POR EL PROPIETARIO.**
La miniatura va dentro de la hoja hasta que el dibujo está completo, también al cambiar de lámina: sin los 10,5 s de hoja en
blanco ni el pintado por trozos (medido en el banco, informe 13 §7). Antes, P1 (vista previa legible, `979c2d7`) quedó
desplegado y verificado el 17-sep. Ver «Unidad ARCHIVOS · LECTOR · APERTURA SIN HOJA EN BLANCO».

**15-sep-2026 · ARCHIVOS · LECTOR · DIBUJADO REPETIDO Y CENTRADO AL ABRIR — DESPLEGADA Y VERIFICADA EN PRODUCCIÓN.**
Autorizado por el propietario («APLICA»), empujado («HAZ EL PUSH») y desplegado en el portal. Commit A `0092689`: la hoja ya no
se dibuja dos veces al reabrir, ni con «Ajustar página» o el doble clic con la hoja ya encuadrada. Commit B `1324862`: la hoja
sale centrada al abrir. Probado en el banco y verificado en producción: al reabrir el 004122, un solo dibujado, 1,33 s y 0,72 s
de tareas largas frente a 7,4 s, y desvío de (0,2; 0,3) px. Ver «Unidad ARCHIVOS · LECTOR · DIBUJADO REPETIDO Y CENTRADO AL ABRIR» y `docs/archivos/07_P1_MEDICION_EN_PRODUCCION.md` §4 y §5.

**15-sep-2026 · ARCHIVOS · VELOCIDAD DE APERTURA · LOTE P1 — DESPLEGADA (27ea400) Y MEDIDA EN PRODUCCIÓN.**
Pasan las seis puertas (`docs/archivos/07_P1_MEDICION_EN_PRODUCCION.md`). La medición destapó un defecto del lector: al
reabrir un plano la hoja se dibuja dos veces (12,6 s de hilo ocupado con 004122). Al probar el arreglo salió otro defecto,
anterior al lector: a veces la hoja sale descentrada al abrir. Los dos arreglos van en dos commits locales («APLICA»),
sin push ni despliegue (§4 y §5 del informe). Ver «Unidad ARCHIVOS · VELOCIDAD DE APERTURA · LOTE P1» y
«Unidad ARCHIVOS · LECTOR DE PLANOS».

**15-sep-2026 · ARCHIVOS · LECTOR DE PLANOS COMO ACC — DESPLEGADA con P1 (1810d11); defecto al reabrir pendiente de arreglo.**
Opción A de `docs/archivos/03_LECTOR_PDF_MANIPULACION_COMO_ACC.md`: rueda, doble clic y nitidez como el lector de planos de
ACC, medidos contra sus cifras. Probado en local (npm 8 bancos, medición CDP a 100 % y 125 %). Ver «Unidad ARCHIVOS · LECTOR DE PLANOS».

**14-sep-2026 · PERMISOS · «Editar» suprime y restaura — DESPLEGADA (6e51793, verificada el 15-sep).**
Pedido del propietario antes del commit de la corrección de la raíz de ENLACES: los dos van juntos. Probado en local (pytest
1896/1, ensayo 19/19, npm 7 bancos, app real del banco). Ver «Unidad PERMISOS · «Editar» suprime y restaura».

**14-sep-2026 · ARCHIVOS · ENLACES por obra, carpeta y documento — DESPLEGADA (9dd13e8 y la corrección de la raíz d30762d).**
Contrato final del propietario basado en ACC. Probado en local (pytest 1883/1, ensayo 34/34, regresiones de Revisiones,
npm 7 bancos, app real del banco con el recorrido pedido y los cinco casos). Revisado por el propietario («GREEN LOCAL = PASS») y
commiteado con su autorización; push y despliegue hechos por él; la corrección de la raíz tras F5 está desplegada y verificada (15-sep). Ver «Unidad ARCHIVOS · ENLACES».

**14-sep-2026 · REVIEWS · E1.3 (flujos creados utilizables) — PUBLICADA (88b300f), SIN DESPLIEGUE.**
Probado en local (pytest 1864/1, ensayo 36/36, regresiones de Revisiones, npm 6 bancos, banco de pantalla). En la misma
entrega, el contrato RONDAS para aprobar (`docs/reviews/E3_CONTRATO_RONDAS.md`, sin código). Commit («HAZLO») y push («si»)
autorizados por el propietario; desplegada por él y verificada el 14-sep (/api/health y portal por contenido). Ver «Unidad REVIEWS · E1.3».

**14-sep-2026 · PERMISOS · A (planos CAD para todos) y B («Editar» en la carpeta) — DESPLEGADA (41d7dda).**
Probado en local (pytest 1841/1, banco 21/21, npm 6 bancos, pantalla del banco); commit y push autorizados; desplegada
por el propietario el 14-sep en Virginia y en el portal, verificada por /api/health, el log de arranque y el contenido servido. Compartir varios documentos: solo análisis, pendiente
de su decisión. Revisiones (flujos creados y rondas): ver «Unidad REVIEWS · E1.3». Ver «Unidad PERMISOS · A y B».

**13-sep-2026 · REVIEWS · E1 (detalle, navegación y semántica) — DESPLEGADA (`68b14b8` en Virginia y portal).**
Dictámenes del propietario: `E1 CODE/TEST GREEN LOCAL = PASS` y `E1 COMMIT = PASS`; despliegue manual
hecho por él el 13-sep y verificado. Falta su UAT en producción. E2 y cambios en Oregón: NO autorizados.
E1.1 (corrige H1–H4 de esa UAT) está DESPLEGADA (`8875f9e` en Virginia y portal, verificado): ver «Unidad REVIEWS · E1.1».
La UAT de la noche del 13-sep (bloques C y D) dio H5–H9 (`docs/reviews/E1_UAT_HALLAZGOS.md`, segunda parte): los datos
no se cruzan. E1.2 (H5, H6, H9 y el aviso H7-A) está DESPLEGADA (27e1a42 en Virginia y portal, verificado; el primer arranque del backend se colgó y se reinició): ver «Unidad REVIEWS · E1.2».
Primera entrega del programa funcional de Reviews que aprobó el propietario
(`docs/reviews/00_PROGRAMA_Y_DECISIONES.md`, decisiones D1–D9). Contrato e informe:
`docs/reviews/E1_CONTRATO_DE_ACEPTACION.md` y `docs/reviews/E1_INFORME_DE_CIERRE.md`.
Ver `[WIP HANDOFF]` en EXPECTED WORKTREE → «Unidad REVIEWS · E1». E2–E5 no han
empezado.

La unidad anterior (A `b913e8a` + B `5967760`) está en `origin/main` desde el 13-sep:
push del propietario, con Auto-Deploy comprobado en `Off` en los cuatro servicios
que siguen `main`. El propietario la desplegó a mano en el backend de Virginia y en
el portal. Oregón sigue en `cdf7837`; qué hacer con él es una decisión de
infraestructura aparte. Lo que sigue en esta sección es el estado anterior de
Filters.

**HOST DEFECT — POPOUT SCALE / CODE/TEST GREEN — pendiente validación HOST**

## STATUS

**B1 = CLOSED. B2 = CLOSED (71d23c7). B3 = CLOSED.**
**B4 = CLOSED. B5 = CLOSED. FILTERS CORE = CODE/INTEGRATION CLOSED.**
**HOST DEFECT POPOUT SCALE = CODE/TEST GREEN / COMMITTED.**
**HOST ENVIRONMENT = READY sobre 82ae5d9; no actualizado al follow-up.**
**HOST VALIDATION = BLOCKED / pendiente reensayo. H1 = FAIL histórico; H2–H6 = NOT EXECUTED.**

Follow-up local autorizado: únicamente ventana virtual del popout, fitness y
handoff. Máximo 103 filas físicas, un click delegado, mismo FilterResult B3 e
identidad cualificada. Edge aislado: 13.783 y 50k × 80 columnas PASS; 36 filas
DOM iniciales y 103 máximas. Mutante render-all muerto; restaurarVistaV2 150/150;
regresiones afectadas y build limpio PASS. **No significa HOST GREEN.**

Evidencia y reproducción: [POPOUT_SCALE_RESULTADOS](filters/POPOUT_SCALE_RESULTADOS.md).
El nuevo candidato es el commit de este follow-up:
`git log -1 --format=%H -- frontend-react/src/lib/inventoryFilterPopout.js`.
Base anterior: `82ae5d9f6e8945dc293e3075bb7d7570d72a5392`; baseline productivo
`3e413cd` intacto. No push, deploy, H1–H6, APS, backend ni BD en esta tarea.

La revisión final independiente de B5 se hizo el 8-sep-2026: diez ataques, un
defecto L2 real encontrado y corregido —color huérfano al retirar un modelo—
más un hueco L1 del plan HOST. Declarar B5 CLOSED es decisión del propietario.
El propietario aceptó B4 (`f38bc0c`, revisión `df2c03e`) y autorizó B5:
integración reproducible, escala/stress, lifecycle y preparación HOST/release.
No cambia el baseline productivo. No push ni deploy.
La revisión independiente de B4 se hizo el 8-sep-2026: diez ataques, ningún
defecto de producto. Declarar B4 CLOSED es decisión del propietario, no del
revisor.
La revisión adversarial independiente se hizo el 8-sep-2026 y dictaminó PASS,
tras corregir un defecto L2 real. El propietario aceptó el cierre de B3 y
autorizó B4. `6ddc5a0bbc648cfc7dcc52b06961f718cdb422f0` es EXPECTED REVIEW
DELTA de Claude sobre `c091c55`, no divergencia. No repetir la revisión B3.
Resultado único revisionado conectado a Viewer/Inventory/popout.
Todos los casos B3 históricos cumplen el mismo expected original.
Los dos KNOWN_FAIL históricos B4 (búsqueda/DnD) ahora son PASS con el mismo
expected original; cero resultados inesperados sanos. Mutante integrado intacto.
Evidencia: [filters/B3_RESULTADOS.md](filters/B3_RESULTADOS.md).
[filters/B3_WIP_VALIDATION.md](filters/B3_WIP_VALIDATION.md) es historia del
bloqueo ya resuelto, NO la instrucción vigente.
Checkpoint B3 verificado el 8-sep-2026:
**`c091c556acc3d0d1af884594f8e5ee259bcae162`**, descendiente de 71d23c7, titulado
`feat(filters): unify revisioned results across viewer and inventory`.
Ya contiene los 17 archivos del delta GREEN; no se creó otro commit funcional.
Este hash es una referencia al checkpoint anterior, no un requisito
autorreferencial del presente documento. Consultar HEAD real por separado.

## EXACT NEXT ACTION

**ORTOFOTO CANAL (worktree aislado):** commit funcional `8c5ce9c` preparado.
No hacer push ni Manual Deploy sin autorización explícita por acto. Solicitar
primero autorización separada para subir la rama candidata a `origin/main`;
después verificar SHA y solicitar autorización independiente para cada servicio
que se vaya a desplegar. La calidad visual se difiere por decisión del
propietario. Ver el `[WIP HANDOFF]` más reciente al final de este documento.

**VISOR · COMPARADOR (18-sep-2026):** `28c2f49`, `1befc04` y `1bc97ae` desplegados y verificados. Segundo parpadeo (piezas
semitransparentes, `docs/visor/01_…` §5): `8278114` empujado («SI», 18-sep); falta que él despliegue el visor (backend sin
cambios) y lo mire con la v2 de `004120` en A.
Siguen pendientes de su decisión la mejora «sin equivalente contractual» (`docs/visor/02_…` §5) y la identidad del ECD (B1).

**ARCHIVOS · LECTOR · APERTURA SIN HOJA EN BLANCO (18-sep-2026):** `f9345b4` empujado y desplegado por el propietario en el portal
(sin verificar por contenido: él pidió no probarlo).

**ARCHIVOS · LECTOR · DIBUJADO REPETIDO Y CENTRADO AL ABRIR (15-sep-2026):** `0092689` y `1324862` empujados y desplegados en
el portal (`index-7-tRY03g.js`), verificados en producción: al reabrir el 004122, un solo dibujado (1,33 s, 0,72 s de tareas
largas) y la hoja centrada. Queda la UAT del propietario y más muestras de centrado.

**ARCHIVOS · VELOCIDAD DE APERTURA · LOTE P1 (15-sep-2026):** desplegado y medido; las puertas pasan. Solo queda pedir al propietario
los registros de Render del cuelgue del backend (18:53–19:57 UTC).

**PERMISOS · «Editar» suprime y restaura (14-sep-2026):** desplegada y verificada el 15-sep (`6e51793`: /api/health
6e51793937a7 y portal `index-Cr11Kw1A.js`). Esperar la UAT del propietario.

**ARCHIVOS · ENLACES (14-sep-2026):** `9dd13e8` y la corrección de la raíz (`d30762d`) desplegadas y verificadas. Esperar la
UAT del propietario.

**REVIEWS · E1.3 (14-sep-2026):** desplegada y verificada (`88b300f`: /api/health y portal por contenido). Esperar la UAT
del propietario (bloque H) y sus respuestas R1–R14 del contrato RONDAS antes de E3.

**PERMISOS · A y B (14-sep-2026):** desplegada y verificada (`41d7dda`). Esperar la UAT del propietario en producción. Decisión pendiente suya: paquete compartido
(`docs/compartir/01_COMPARTIR_VARIOS_DOCUMENTOS.md`). Revisiones: ver REVIEWS · E1.3.

**REVIEWS · E1.1 (13-sep-2026):** `8875f9e` desplegado en el backend de Virginia (`/api/health` →
`8875f9ed1428`) y en el portal (`index-BU0VvNh3.js`, con E1.1). La UAT de la noche dio H5–H9
(`docs/reviews/E1_UAT_HALLAZGOS.md`). E1.2 está desplegada y verificada (`27e1a42`;
`docs/reviews/E1_2_INFORME_DE_CIERRE.md` §6). Siguiente: la UAT del propietario con los bloques F, D4 y G de
`docs/reviews/E1_GUIA_DE_PRUEBA.md`.

**REVIEWS · E1 (13-sep-2026):** E1 (`68b14b8`) está desplegado en el backend de Virginia y en el
portal, verificado por `/api/health` y por contenido. Esperar la UAT del propietario en producción y
su autorización para E2. Sin ella: ni E2, ni cambios en Oregón.

Producción medida el 15-sep-2026, tras los dos arreglos del lector:
- portal: sirve `assets/index-7-tRY03g.js`. El paquete anterior no tiene el marcador del arreglo del dibujado repetido y este sí, y el del centrado se ve como un `.style.width=` más;
- backend: sin tocar, `/api/health` → `version 27ea400f7a0a`.

Producción medida el 15-sep-2026, tras el lector y P1:
- backend de Virginia (`visor-ecd-backend-va`): `/api/health` → `version 27ea400f7a0a`. Arrancó a las 18:53Z («Booting worker», «Live») y dejó de responder; Restart del propietario a las 19:57:39Z y estable durante los 30 min vigilados;
- portal: sirve `index-ebE4CIvV.js`, con el lector (`pdf-detalle`) y P1 (`verificar`, `guardado`, tope de 5 MB de las vecinas).

Producción medida el 15-sep-2026, tras la corrección de la raíz de ENLACES y «Editar» suprime y restaura:
- backend de Virginia (`visor-ecd-backend-va`): `/api/health` → `version 6e51793937a7`;
- portal: sirve `index-Cr11Kw1A.js`, con «Abriendo el enlace» y «suprimir y restaurar archivos».

Producción medida el 14-sep-2026, tras A y B:
- backend de Virginia (`visor-ecd-backend-va`): `/api/health` → `version 41d7dda3e662`, también por `alephia.com.pe`; arranque con «Booting worker» (sin reinicio);
- portal: sirve `index-BpgqB68-.js`, con A y B (verificado por contenido en el origen de Render y en `alephia.com.pe`);
- Oregón (`visor-ecd-backend`): Auto-Deploy Off releído; sin despliegue.

Producción medida el 13-sep-2026, tras E1.2 y el reinicio del backend:
- backend de Virginia (`visor-ecd-backend-va`): `/api/health` → `version 27e1a428ce3c`, también por el `/api` del portal y de `alephia.com.pe`;
- portal: sirve `index-DgYYQqZD.js`, con E1.2 (verificado por contenido en Render y en `alephia.com.pe`);
- Oregón (`visor-ecd-backend`): `version cdf783754574`, sin cambios.

Lo que sigue es el cierre de Filters del 10-sep; sus SHA son de esa fecha.

**Filters (10-sep-2026): ninguna.** El release y su hotfix están en producción.

**LOS DOS SHA DESPLEGADOS SON DISTINTOS Y ESO ES DELIBERADO.**

```
FILTERS CORE = PRODUCTION GREEN
P0..P9 PASS — evidencia: docs/filters/RELEASE_EJECUTADO.md

FILTERS POST-RELEASE HOTFIX = PRODUCTION GREEN   (10-sep-2026)

backend  visor-ecd-backend    0864878a985b9b30ea6a8e6859eda92b9031e5b6
View     visor-ecd-frontend   74f4dff1935fb174dcfbe5e77f7ad0351712363c
Docs     visor-ecd-portal     f5fe63d  (no se desplegó)

A · UX ............... ARREGLADO — presentación de baseline restituida
B · LATENCIA ......... ARREGLADO — 1402 ms -> 60 ms (baseline 3e413cd = 21 ms)
C · FLUJO DE DATOS ... CERRADO por el propietario
D · COLOR ............ EXPECTED · sin persistencia en ninguno de los dos sistemas
    + STATE/UI INCONSISTENCY en la LINEA DE ESTADO · ARREGLADA
evidencia: docs/filters/HOTFIX_POST_RELEASE.md
```

El hotfix es **sólo frontend**: `TandemFilterPanel.jsx`, `aps/utils/model.js`,
`lib/filterVisualDriver.js` y `lib/filterRuntimeBridge.js`, más el banco nuevo
`pruebas/filtersCore.hotfixPostRelease.prueba.mjs` y siete oráculos reapuntados
en `filtersCore.b4` / `filtersCore.b4Adversarial`. Backend, Docs, PostgreSQL y
migraciones: **sin tocar**. Que View vaya por delante del backend es correcto y
esperado hasta el próximo release; no es una desincronización que haya que
«arreglar» desplegando el backend.

**Verificación del despliegue, por contenido y no por el panel** (10-sep-2026):

```
View     assets/index-B3tSwlc8.js · 3.138.198 bytes
         las 5 cadenas de la UI retirada dan 0 en el paquete servido
backend  /api/health -> status ok · rama main · version 0864878a985b · postura 7/7
```

> **El primer Manual Deploy publicó el commit equivocado.** Construyó
> `index-DjGQhZe_.js`, que es el paquete de `0864878`, y el sitio quedó *live*
> con el código anterior aunque el commit ya estaba en `origin/main`. Se detectó
> porque el paquete servido aún contenía las cadenas que el hotfix elimina. **Un
> «Your site is live 🎉» no prueba qué código se publicó**: la comprobación buena
> es el hash del bundle en el log del build, o grep de un marcador en el paquete
> servido.

> **AVISO — pérdida de este fichero, 9-sep-2026.** Al cerrar el hotfix truncué
> `AI_WORKSTATE.md` a 0 bytes con un script mío mal escrito y hubo que
> restaurarlo desde `0864878`. Se perdieron los hunks de handoff **sin commit**
> del release (P0–P9, delta gate, ventana pública, barrera P2). **No se perdió
> evidencia**: todo eso vive versionado en `docs/filters/RELEASE_EJECUTADO.md`,
> `P0_PRECHECK.md`, `P1_BACKUP_RESTORE.md` y `RC_DELTA_GATE.md`. Las secciones
> anteriores de este fichero describen el estado **previo al release** y hay que
> leerlas con esa fecha en la mano.

### Handoff histórico — POPOUT SCALE (previo al release; superado)

[WIP HANDOFF]
TAREA: HOST DEFECT — POPOUT SCALE; código terminado, validación real pendiente.
IMPLEMENTADO: ventana virtual <=103 filas; revisión B3 e identidad intactas; 9 listeners constantes y cleanup; fitness 13.783/50k, navegador aislado, mutante, regresiones y build PASS.
PENDIENTE: integrar el follow-up en el entorno de ensayo mediante autorización separada; propietario/Claude retoman HOST. No afirmar H1 PASS antes del ensayo.
ARCHIVOS MODIFICADOS: propios frontend-react/src/lib/inventoryFilterPopout.js; frontend-react/pruebas/filtersCore.popout.prueba.mjs; frontend-react/pruebas/filtersCore.b3Adversarial.prueba.mjs; frontend-react/pruebas/filtersCore.b5Stress.prueba.mjs; frontend-react/pruebas/filtersCore.popoutScale.prueba.mjs; frontend-react/pruebas/filtersCore.popoutScaleMutants.prueba.mjs; frontend-react/pruebas/filtersCore.popoutBrowser.prueba.mjs; frontend-react/pruebas/filtersRuntime/popoutDom.mjs; docs/filters/POPOUT_SCALE_RESULTADOS.md; hunks selectivos de docs/AI_WORKSTATE.md. Ajenos: todos los de EXPECTED WORKTREE, incluidos los hunks históricos de docs/AI_WORKSTATE.md.
TESTS EJECUTADOS: node frontend-react/pruebas/<banco>.prueba.mjs: popout, scale, browser, mutante 1/1, runtime 17/17, runtimeMutants 4/4, b3Adversarial 7/7, adversarialMutants 3/3, B4 13/13, interacciones 8/8, integradas, B5 lifecycle/stress, inventoryIdentity, Saved Views y boundary; restaurarVistaV2 150/150; npm ci offline y build aislado exit 0, 516 módulos/14,11 s. Detalle reproducible en POPOUT_SCALE_RESULTADOS.
TESTS PENDIENTES: H1–H6 reales; no autorizados aquí. No se midieron GPU/heap del renderer HOST.
FALLO CONOCIDO: H1 FAIL del candidato previo 82ae5d9; follow-up sólo CODE/TEST GREEN. Sin fallo de popout reproducible pendiente en los bancos ejecutados.
NEXT EXACT ACTION: handoff del commit local para preparar el reensayo HOST con el nuevo SHA; esperar instrucciones, no modificar entorno por cuenta propia.
DO NOT TOUCH: B1–B5 CLOSED, Viewer/ViewerFacade/WIP ajeno, multi-color, Saved Views, backend/BD/APS, producción 3e413cd, secretos; no push/deploy ni reextracción.
COMMIT/HEAD REF: base 82ae5d9f6e8945dc293e3075bb7d7570d72a5392; el follow-up es el commit que contiene este handoff y inventoryFilterPopout.js (resolver mediante git log indicado arriba).

### Evidencia histórica B5 (cerrada; no repetir)

Checkpoint B5 de implementación local: lifecycle 5/5, stress 11/11,
memoria 25 scopes sin referencias históricas retenidas, mutantes 3/3,
escala 6/6, integración PostgreSQL + frontend 25/25. Regresiones verdes
salvo el fallo backend histórico aceptado. Detalle y archivos:
[filters/B5_RESULTADOS.md](filters/B5_RESULTADOS.md),
[filters/B5_HOST_RELEASE.md](filters/B5_HOST_RELEASE.md) y
[filters/evidencias/B5_CAMPAIGN.json](filters/evidencias/B5_CAMPAIGN.json).
Checkpoint B5 `e1a1601` creado y comprobado en checkout limpio:
npm ci 772 dependencias/20 s; build 516 módulos/15,24 s;
once bancos de integración pasan allí y ensayo PG18 + frontend 25/25.
Archivos propios B5: filterRuntimeBridge.js, filterVisualDriver.js,
pruebas/filtersCore.b5{BackendPayload,Lifecycle,Memory,Mutants,Scale,Stress}.prueba.mjs,
backend/herramientas/ensayo_inventory_b1_integrado.py (--b5), los tres documentos
anteriores y este handoff. Todos versionados; no queda WIP propio B5.
EXPECTED WORKTREE sigue siendo los cinco M ajenos y untracked históricos
declarados. No adoptarlos. Checks SHA256 de los cinco M coinciden con takeover.
PREDICT y todo WIP ajeno siguen protegidos. No push ni deploy.
El backend vivo registrado sigue en 3e413cd: desplegar este HEAD sin coordinación
arrastraría el cutover B1/B2. CODE/TEST GREEN no certifica host/LMV/GPU/producción.

### Checkpoint B4 — 8-sep-2026

**B4 CODE/TEST GREEN**, implementación acotada sobre `6ddc5a0`.
Informe canónico: [filters/B4_RESULTADOS.md](filters/B4_RESULTADOS.md).
El bloqueo anterior de permisos fue resuelto por autorización directa en chat.
No queda trabajo B4 local a medias; no se declara CLOSED ni validación de host.

- B4 fitness **13/13**; mutantes **3/3 muertos**.
- Interacciones e integradas: **8 PASS** cada una, cero KNOWN_FAIL y cero
  resultados inesperados; mutante integrado 1/1, expected históricos intactos.
- Regresiones B1/B2/B3/V2 aceptadas del WIP conservadas: restore 150/150,
  captura 63/63 y contrato 111/111; detalle completo en el informe.
- Build final con módulos protegidos tomados de HEAD sólo en memoria:
  **exit 0, 516 módulos, 14,14 s**, outDir temporal fuera del repo.
- Búsqueda completa antes de recorte, DnD canónico, estados desde FilterResult,
  selección count0 removible, pending no rotulado como cero y color por identidad.
- Múltiples propiedades de color conservadas con arbitraje B3 explícito.
  Sin cambios en motor/identity/runtime/driver/V2 ni en Viewer.
- Performance sintética aceptada: búsqueda entre 10001 valores mediana
  0,258 ms/p95 0,669 ms; 20 intenciones rápidas coalescidas en un cálculo.
- Commit B4: `feat(filters): complete b4 search and identity-safe interactions`,
  descendiente de `6ddc5a0`; consultar hash real en Git.
- WIP ajeno intacto; las 48 líneas ViewerFacade siguen sin commit.
- No navegador/React DOM/LMV GPU ni producción certificados. Receta manual en
  B4_RESULTADOS. No B5, push, deploy, backend ni DB.

### Evidencia de la revisión final independiente B5 — 8-sep-2026

**B5 FINAL INTEGRATION REVIEW PASS**, tras corregir un defecto L2 real.

- **L2 — un modelo retirado conservaba el tinte de Filters.** La retirada que
  añadió B5 en `bindModels` soltaba el gancho y quitaba el modelo de `painted`
  **sin retirarle antes el color**. El driver siguiente arranca con `painted`
  vacío, así que ese tinte ya no lo podía limpiar nadie: sobrevivía al propio
  `dispose()`. Es la misma invariante que B3 fijó para `dispose()` —el color
  propio se retira ANTES de soltar la propiedad—, que la ruta nueva no cumplía.
  Reproducido en aislamiento y alcanzable: `loadModelSequentially` no descarga,
  y en `reset3D` (`Viewer.jsx`, vuelta de lámina 2D a 3D) el `unloadModel` está
  comentado, así que se borra del registro un modelo que sigue en la escena.
  Los otros dos sitios que borran del registro descargan antes. El arreglo
  limpia sólo lo que Filters pintó y tolera que la instancia ya esté muerta.
- **L1 — el plan HOST no ejercitaba ese camino.** Ningún caso abría una lámina
  2D, que es el único gesto del visor que saca un modelo de `models()` sin
  descargarlo. Se añadió al caso 6 sin crear un séptimo.

**Ataques sin defecto.** Checkout limpio de `afe48dc` reproducido por el
revisor: `npm ci` desde lockfile y `npm run build` **exit 0, 516 módulos**, sin
ViewerFacade, `public/predict`, `.env` ni symlinks —los 517 del worktree son el
import ajeno del ViewerFacade—. Backend↔frontend: `ensayo_inventory_b1_integrado
--b5` ejecutado por el revisor sobre clúster PG18 desechable, **25/25 exit 0**,
clúster detenido. Migración/cutover: 31 revoca INSERT/UPDATE/DELETE/TRUNCATE en
`public.inventory_assets` **y** `public.asset_user_data`, y el rollback SQL trae
`B1_ROLE_GUARD`, `B1_OWNER_GUARD`, `B1_DATA_PRESENT` y ningún CASCADE —las dos
afirmaciones que la receta hace sobre el SQL son ciertas—. Lifecycle: un runtime
viejo no borra resultado ni espejos de uno nuevo, comprobado con dos runtimes
vivos de verdad y no sólo con el doble dispose. Escala y memoria: la campaña se
abstiene explícitamente de comparar protocolos distintos y de leer `heapUsed`
como prueba de ausencia de fugas; sus límites enumeran justo lo que mide.
Release: la receta es orden, no autorización, y cubre frontend-primero, backend
viejo tras 31, escrituras antes de HOST y los dos rollbacks.

**Bancos nuevos del revisor:** `filtersCore.b5Adversarial` (8 casos) y
`filtersCore.b5AdversarialMutants` (1/1 muerto: retirar sin retirar el color).

**Regresión:** filtersCore 38+1 knownFail 0; b5Lifecycle 5/5; b5Stress 11/11;
b5Memory 1/1 con 0 retenidos —exige `node --expose-gc`—; b5Scale exit 0;
b5Mutants 3/3; b5Adversarial 8/8; b5AdversarialMutants 1/1; runtime 17/17;
runtimeMutants 4/4; popout 1(16); b3Adversarial 7/7; adversarial V2 0/4;
normalizadores 11/11; boundary 6/6; b4 13/13; b4Mutants 3/3; b4Adversarial
19/19; b4AdversarialMutants 2/2; interacciones e integradas 8/8 con exit 0;
inventoryIdentity 17/17; inventoryConfig 20/20; lob4dIdentidad 26/26;
**captura 63/63, restore 150/150, V2 111/111**, frenteDeVistas 20/20;
`pytest` 1721 passed / 1 failed (el documentado); build exit 0.

**Límites:** HOST no ejecutado. Sin navegador, React DOM, LMV/GPU ni producción.
`filtersCore.b5BackendPayload` no es autónomo: lo alimenta por stdin el arnés
Python. Se certifica código, bancos y receta, no el host real.

### Evidencia de la revisión independiente B4 — 8-sep-2026

**B4 INTEGRATION REVIEW PASS. Ningún defecto de producto.** Diez ataques contra
el delta `6ddc5a0..f38bc0c`. B4 es capa de presentación: no añade otra autoridad
de matching, conteos, facetas ni selección global.

- **Búsqueda sobre el dominio completo.** Panel y configurador buscan primero y
  limitan después, en las dos listas. Buscar no toca conteos ni muta el
  `FilterResult`; limpiar devuelve el dominio y conserva la selección.
- **Reorder por identidad canónica.** `reorderProperty` opera sobre la lista
  completa por id; `originalIndex` se calcula antes de filtrar, así que Subir y
  Bajar usan el vecino canónico aunque la búsqueda esconda el intermedio. El
  arrastre se confirma sólo en `onDrop`: `onDragEnd` limpia sin reordenar.
- **El configurador no muta antes de Confirmar.** Escape, Cancelar y la X cierran
  sin llamar a `onUpdate`. Aplicar entrega el conjunto exacto, y el `onUpdate`
  real de App poda por id sólo las selecciones y colores de lo quitado.
- **Pending/zero/error.** El controlador publica una instantánea `pending` en
  cada `request()` y App vacía los buckets salvo `ready`: el zero de A no puede
  quedar vigente como estado de B, ni con el progreso viejo de A en mano.
- **El color de la UI es el del driver.** El swatch coincide con el tinte real
  en todos los valores y no depende del orden de la lista; con dos propiedades
  de color, la prioridad que el panel anuncia (`sort().reverse()`) predice
  exactamente la que gana en el driver (`sort()`, último escribe).
- **Sin segunda autoridad.** `filterPresentation.js` no importa motor,
  controlador ni driver, y el motor de matching se sigue llamando desde un solo
  sitio. Los seis `useState` nuevos son límites de render y términos de
  búsqueda; ninguno guarda estado de filtro.

**Fitness histórico:** los dos defectos B4 —búsqueda y DnD— pasan contra sus
`expected` originales, byte a byte; sólo cambió el cableado del banco. 0
KNOWN_FAIL propios de B4, 0 UNEXPECTED_FAIL, 0 UNEXPECTED_PASS.

**Bancos nuevos del revisor:** `filtersCore.b4Adversarial` (19 casos, reutiliza
el arnés del banco B4 en vez de copiarlo) y `filtersCore.b4AdversarialMutants`
(2/2 muertos: mutar la configuración antes de Confirmar, y dejar vigente el
resultado viejo durante pending —los dos ataques que `b4Mutants` no cubría—).

**Regresión:** filtersCore 38+1 knownFail 0; b4 13/13; b4Mutants 3/3 muertos;
b4Adversarial 19/19; b4AdversarialMutants 2/2; runtime 17/17; runtimeMutants
4/4; popout 1(16); adversarial 0 fallos/4 controles; b3Adversarial 7/7;
normalizadores 11/11; boundary 6/6; interacciones e integradas 8/8 PASS con
exit 0 y mutante integrado 1/1; inventoryIdentity 17/17; lob4dIdentidad 26/26;
inventoryConfig 20/20; captura 63/63; restore 150/150; V2 111/111;
frenteDeVistas 20/20; `pytest` 1721 passed / 1 failed (el documentado);
build con `--outDir` alterno exit 0, 517 módulos, 213 ficheros —517 y no 516
porque el `Viewer.jsx` del worktree importa el ViewerFacade ajeno, que no
existe en HEAD—.

**Límites:** sin navegador, React DOM, LMV/GPU, DB ni red. Se certifica código y
bancos, no el host real ni producción.

### Evidencia CODE/TEST del checkpoint B3

- Runtime 17/17, mutantes runtime 3/3, popout 1 escenario/16 aserciones.
- Interacciones e integradas: cada uno 6 PASS + 2 KNOWN_FAIL B4, cero
  inesperados; mutante integrado 1/1. Mantienen exit 1 del banco completo
  por B4; `b3Green=true` indica la puerta autorizada B3.
- Adversarial 10/10, mutantes B2 3/3, core 39 PASS, normalizadores 11/11,
  boundary 6/6; restore 150/150, captura 63/63, V2 111/111; inventoryIdentity
  17/17, inventoryConfig 20/20, frenteDeVistas 20/20, lob4dIdentidad 26/26.
- Build normal alterno exit 0 (516 módulos/11,19 s); build final con Viewer
  del índice sin las 48 líneas ajenas exit 0 (515 módulos/9,99 s).
- WIP ajeno preservado; ningún cambio de DB, .env, backend ni producción.
- Pendiente revisión independiente de integración. Host real no ejecutado;
  ver límites del informe. No se repitió la campaña al fijar este handoff:
  no hubo cambios de producto posteriores al GREEN.

### Evidencia de la revisión independiente B3 — 8-sep-2026

- Diez ataques numerados ejecutados contra `71d23c7..c091c55`. Nueve sin
  defecto; el décimo —propiedad de la máscara visual— destapó el L2 del color
  huérfano tras `dispose()`.
- Bancos tras el arreglo: filtersCore 38 CONTRACT + 1 BASELINE, knownFail 0,
  inesperados 0; normalizadores 11/11; boundary 6/6; runtime 17/17; mutantes
  runtime **4/4 muertos** (uno nuevo, `dispose-leaves-orphan-color`);
  popout 1 escenario/16 aserciones; adversarial de V2 0 fallos/4 controles;
  `filtersCore.b3Adversarial` 7/7; interacciones e integradas 6 PASS +
  2 KNOWN_FAIL B4 cada uno, 0 inesperados, mutante integrado 1/1;
  inventoryIdentity 17/17; lob4dIdentidad 26/26; captura 63/63, restore
  150/150, V2 111/111, frenteDeVistas 20/20.
- `python -m pytest -q`: **1721 passed / 1 failed**, el fallo preexistente del
  backlog nº 1 (`/api/docs/miniaturas/preparar` sin puerta de cliente).
- Build: `npm run build` en sitio vuelve a dar el `EPERM` de DIVERGENCIA 4
  —entorno, no código—; con `--outDir` alterno, **exit 0, 516 módulos, 11,45 s,
  213 ficheros**.
- Sin cambios de DB, `.env`, backend ni producción. WIP ajeno intacto.
- **Incidente de esta sesión, corregido:** al crear el banco nuevo se sobrescribió
  `filtersCore.adversarial.prueba.mjs`, que ya existía desde `71d23c7`. Se
  restauró a su contenido exacto de HEAD —56 líneas, idéntico— y el banco nuevo
  se movió a `filtersCore.b3Adversarial.prueba.mjs`. Los dos existen y pasan.
- Límites: sin navegador, React DOM, LMV/GPU, DB ni red. La revisión certifica
  código y bancos, no el host real ni producción.

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
| Identidad 4D | `node frontend-react/pruebas/lob4dIdentidad.prueba.mjs` | **26 / 26** — `setElementLinks` real y `linajeDeUrn` real; dobles sólo del visor |
| Identidad 4D/5D backend | `python -B backend/herramientas/ensayo_identidad_4d_5d.py --pg-bin <bin> --confirm-disposable-only` | **7 / 7**, exit 0 — clúster nuevo, DDL de `inventory_assets` por AST, rutas reales de `compare.py` |
| Integración B1 | `python -B backend/herramientas/ensayo_inventory_b1_integrado.py --pg-bin <bin> --confirm-disposable-only` | **23 / 23** INTEGRATION PASS — SQL, rutas y middleware reales sobre PG18 nuevo |
| Identidad Inventory (frontend) | `node frontend-react/pruebas/inventoryIdentity.prueba.mjs` | **17 / 17** |
| P0-2 normalizadores | `node frontend-react/pruebas/filtersCore.normalizadores.prueba.mjs` | 5 PASS + **3 KNOWN FAIL** (divergencia load/refresh caracterizada, defecto de B2) |
| Saved Views boundary | `node frontend-react/pruebas/filtersCore.savedViewsBoundary.prueba.mjs` | **6 / 6** — el contrato V2 CLOSED no necesita cambios |
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

---

## Unidad ORTOFOTO CANAL · ensayo local (24-sep-2026)

[WIP HANDOFF]
TAREA:                Ensayar en local la ortofoto ECW 260911 sobre la superficie APS de Canal sin cambiar el modelo ni producción.
IMPLEMENTADO:         Worktree aislado; dos JPG de 4000×5961 derivados del ECW fuera del repo; proyección GPU EPSG:32717 sobre los 43 fragmentos del mismo dbId seleccionado, sin clonar triángulos ni tocar el modelo. El visor real mostró la imagen, la conservó al cerrar/reabrir Topografía y la quitó correctamente. «Relieve visible» mezcla en vivo la foto con el sombreado original (40 % por defecto). Además, «Sombreado de pendientes» (70 % por defecto) modula la foto con luz direccional fija calculada de la geometría por píxel, sin remonte de geometría/texturas; se compararon 0 y 100 % en el visor local. No son sombras proyectadas. Tras reproducir laderas traseras pintadas por encima, se activó `depthTest` con offset coplanar sólo en el ensayo local. La UI sólo existe en Vite DEV y no aparece en el bundle de producción.
PENDIENTE:            1) Valoración visual del propietario de ambos controles, nitidez, extremos y costura norte/sur; 2) verificar retirada al cambiar de frente; 3) decidir si hace falta tratar la proyección cenital sobre caras casi verticales, visible en vistas rasantes; 4) ajustar sólo si la prueba visual descubre un defecto; 5) si queda GREEN, decidir commit local. No está aprobada como funcionalidad productiva.
ARCHIVOS MODIFICADOS: propios en worktree aislado: frontend-react/src/components/GeoControlPanel.jsx, frontend-react/src/components/OrthoCanalTrial.jsx, frontend-react/src/native/orthoCanalTrial.js, frontend-react/src/native/__tests__/orthoCanalTrial.test.mjs, docs/AI_WORKSTATE.md. Ajenos en checkout principal: todos los ya descritos en EXPECTED WORKTREE; ninguno se modificó aquí.
TESTS EJECUTADOS:     node --test frontend-react/src/native/__tests__/orthoCanalTrial.test.mjs = 12/12 PASS (incluye uniforme de sombreado vivo, normal geométrica, mezcla GPU/CPU y `depthTest:true`/`depthWrite:false`); npx eslint en los tres ficheros nuevos = 0 problemas; npm run build = PASS con avisos preexistentes; bundle de producción sin texto/asset del ensayo; `git diff --check` sin error. Visor local real = 43/43 fragmentos y dos imágenes visibles; cierre del panel mantiene la capa; control de sombreado comparado a 0 y 100 % con relieve a 10 % y a su 40 % por defecto; proyección observada desde arriba, oblicuo y perfil, sin error WebGL nuevo. Lint completo de GeoControlPanel.jsx no es puerta: conserva 1 error y 2 avisos previos fuera de las 3 líneas añadidas.
TESTS PENDIENTES:     Inspección visual con zoom en ambos extremos y costura norte/sur; cambio de frente con capa activa; aceptación del propietario. No se ejecutó una campaña productiva ni se midió tiempo exacto de GPU.
FALLO CONOCIDO:       La imagen aérea cenital se estira sobre caras casi verticales al mirar de perfil; un sombreado direccional no corrige esa proyección. El modo antiguo de un solo fragmento deja cobertura parcial; por eso el modo por defecto usa todos los fragmentos del mismo dbId. El «rayos X» al orbitar quedó corregido en el ensayo local por prueba de profundidad; falta aceptación del propietario desde sus ángulos originales. La nitidez cercana sigue sin validarse.
NEXT EXACT ACTION:    En http://localhost:5181/ la capa sigue aplicada en Frente Canal; abrir Topografía y comparar «Sombreado de pendientes» entre 0 y 100 % con «Relieve visible» cerca de 40 %. Girar alrededor de los taludes de las capturas y registrar si la mejora compensa la proyección cenital en caras muy inclinadas.
DO NOT TOUCH:         Checkout principal y su WIP ajeno, .env*, credenciales, backend/BD productivos, Viewer.jsx, ViewerFacade, LOB4DExtension.js, Saved Views, despliegues; no push.
COMMIT/HEAD REF:      b03d0fb2e4be4013c460c746cb4415da9619e0f6 (HEAD del worktree al escribir; ensayo sin commit).

## Unidad ORTOFOTO CANAL · publicación manual persistente (24-sep-2026)

[WIP HANDOFF]
TAREA:                Convertir el ensayo de dos JPG preparados por el propietario en una capa compartida y persistente para Frente Canal, con reemplazo/retirada manual.
IMPLEMENTADO:         Backend Flask con lectura autorizada por frente, publicación sólo para admin de obra, validación JPEG 4000×5961, dos objetos GCS inmutables y cambio atómico del manifiesto activo por generación; retirada sin borrar binarios y sin vencimiento semanal. Los JPG se sirven por la API autenticada, no por CORS de GCS. Frontend de producción monta la revisión publicada fuera del panel Topografía, separa vista previa local de publicación, conserva el mismo modelo+dbId y los porcentajes de relieve/sombreado elegidos. La preparación semanal es responsabilidad humana: dos JPG con la misma huella EPSG:32717; el JPG no permite verificar coordenadas por sí mismo, por lo que la UI exige comprobar alineación visual antes de publicar. En el visor local se seleccionaron los dos JPG y la superficie real; vista previa 43/43 fragmentos PASS sin transferencia al servidor.
PENDIENTE:            1) Probar navegador y backend nuevos juntos con GCS/DB aislados (publicar, lector de otra sesión, reemplazar, retirar, recargar, cambio de frente); 2) verificar perfil de memoria/carga con dos texturas y tiempos de transferencia; 3) self-review final y commit local selectivo sólo si queda GREEN; 4) autorización separada del propietario antes de cualquier push o despliegue. La calidad de imagen se difiere por decisión del propietario.
ARCHIVOS MODIFICADOS: propios sólo en worktree aislado: backend/routes/orthophoto.py, backend/tests/test_ortofoto_semanal.py, backend/server.py, backend/politica.py, frontend-react/src/App.jsx, frontend-react/src/components/GeoControlPanel.jsx, frontend-react/src/components/OrthoCanalLayer.jsx, frontend-react/src/components/OrthoCanalTrial.jsx, frontend-react/src/native/orthoCanalTrial.js, frontend-react/src/native/__tests__/orthoCanalTrial.test.mjs, docs/AI_WORKSTATE.md. Ajenos: WIP protegido del checkout principal, no tocado ni adoptado.
TESTS EJECUTADOS:     python -m pytest -q backend/tests/test_ortofoto_semanal.py backend/tests/test_politica.py backend/tests/test_guardias_de_escritura.py = 43 PASS (2 warnings protobuf de Python 3.14); tras la API proxy y parámetros visuales, backend/tests/test_ortofoto_semanal.py = 1 PASS; node --test frontend-react/src/native/__tests__/orthoCanalTrial.test.mjs = 12/12 PASS; npx eslint en cuatro ficheros de ortofoto = 0; npm run build = PASS con avisos preexistentes de LoginScreen/imports/chunk. Visor local: dos JPG elegidos, terreno real seleccionado, vista previa 43/43 fragmentos, capa visible, sin POST de publicación.
TESTS PENDIENTES:     E2E con backend nuevo y almacenamiento/BD aislados; dos sesiones, replace/retire/persistencia; ninguna prueba contra producción ni publicación online. Build/lint finales del cambio local pasaron.
FALLO CONOCIDO:       El backend local antiguo de la sesión del visor responde 404 a /api/orthophoto; el botón «Publicar para todos» está correctamente deshabilitado. La vista previa funciona. La proyección cenital estira píxeles en caras casi verticales (límite visual previo, calidad diferida). Un JPG de dimensiones correctas puede tener huella geográfica equivocada; debe inspeccionarse antes de publicar.
NEXT EXACT ACTION:    Montar un backend de ensayo aislado con fake GCS/DB o staging no productivo y apuntar una sesión Vite a él para probar publicar → segunda sesión → reemplazar → retirar, sin usar producción.
DO NOT TOUCH:         Checkout principal y todo su WIP protegido, .env*, credenciales, backend/BD/GCS productivos, Viewer.jsx, ViewerFacade, 4D/5D, Saved Views; no push ni deploy sin autorización explícita por acto.
COMMIT/HEAD REF:      b03d0fb2e4be4013c460c746cb4415da9619e0f6 (HEAD del worktree; implementación sin commit).

## Unidad ORTOFOTO CANAL · checkpoint funcional y preparación de publicación (24-sep-2026)

[WIP HANDOFF]
TAREA:                Preparar la publicación conjunta solicitada por el propietario: paquete ya presente en main más la ortofoto compartida de Frente Canal. Ningún acto productivo está ejecutado ni autorizado individualmente.
IMPLEMENTADO:         Commit funcional local 8c5ce9cbcdbdf2e7e1b9073577bde377b9c84f70 en codex/ortofoto-canal, descendiente de b03d0fb2e4be4013c460c746cb4415da9619e0f6. Contiene sólo API de ortofoto, montaje/UI del visor, pruebas, fixture y guía semanal. Dos JPG preparados por el propietario, capa persistente hasta retirada/reemplazo manual, lectura autenticada por scope. El checkout principal y su WIP ajeno permanecen intactos. Precheck HTTP READ ONLY: backend Virginia y Docs /api/health = b03d0fb2e4be; backend Oregon y visor-host /api/health = cdf783754574. El bundle vivo del visor tiene VITE_BACKEND_URL directo a Virginia. Auto-Deploy OFF; no asumir que el rewrite /api del host visor equivale al destino real de la SPA. No se hizo push ni deploy.
PENDIENTE:            1) Obtener autorización explícita para el acto de push del candidato a origin/main, sin arrastrar WIP del checkout principal; 2) comprobar SHA remoto; 3) obtener autorización independiente por cada Manual Deploy previsto (backend Virginia, portal Docs, visor) y verificar salud/SHA entre actos; 4) smoke autenticado de publicación/lectura/reemplazo/retirada sólo después de autorizarlo, con JPG del propietario. No desplegar ni retirar Oregon por inferencia: su función D9 sigue separada. La calidad de imagen queda diferida por decisión del propietario.
ARCHIVOS MODIFICADOS: propios commiteados en 8c5ce9c: backend/politica.py, backend/routes/orthophoto.py, backend/server.py, backend/tests/test_ortofoto_semanal.py, docs/visor/05_ORTOFOTO_CANAL.md, frontend-react/probar-ortofoto.html, frontend-react/src/App.jsx, frontend-react/src/components/GeoControlPanel.jsx, frontend-react/src/components/OrthoCanalLayer.jsx, frontend-react/src/components/OrthoCanalTrial.jsx, frontend-react/src/native/__tests__/orthoCanalTrial.test.mjs, frontend-react/src/native/orthoCanalTrial.js, frontend-react/src/probar-ortofoto.jsx. Propio todavía modificado al escribir: docs/AI_WORKSTATE.md. Ajenos: todos los WIP del checkout principal, no tocados.
TESTS EJECUTADOS:     backend/tests/test_ortofoto_semanal.py = 1/1 PASS (incluye clientes admin/lector y fake GCS/DB); python -m pytest -q --ignore=backend/tests/test_inventory_identity_core.py = 2032 PASS, 1 FAIL histórico conocido de /api/docs/miniaturas/preparar sin puerta UI; python -m pytest -q sin exclusión = error de colección por prototypes.inventory_identity_b1 ausente en worktree aislado (es WIP untracked del checkout principal, no copiar). frontend-docs npm test = 12 bancos PASS; frontend-docs npm run build = PASS; frontend-react npm run build = PASS con avisos preexistentes; node --test frontend-react/src/native/__tests__/orthoCanalTrial.test.mjs = 12/12 PASS; ESLint focal = 0; git diff --check = PASS. Fixture visual aislado en navegador: B reemplaza A retenida, A tardía no monta, close/reopen, scope switch, retirada y revisión repetida sin listeners/montajes duplicados. Visor local real: dos JPG de 4000×5961, 43/43 fragmentos en vista previa, sin POST.
TESTS PENDIENTES:     No se midió transferencia/carga real con GCS, ni se hizo smoke de producción o publicación compartida con dos sesiones reales. La prueba de navegador usa fake de API/montaje; no equivale a GCS/BD reales. No se repitió toda la suite tras el commit porque el objeto funcional es el mismo delta probado.
FALLO CONOCIDO:       El banco histórico backend/tests/test_capacidades_con_puerta.py falla por el endpoint de miniaturas sin UI, anterior a este cambio. El test de identidad no se puede colectar desde el worktree aislado porque falta el prototipo untracked protegido. Backend local antiguo devuelve 404 en la nueva ruta; no es fallo del candidato. La proyección cenital puede estirar la ortofoto en caras casi verticales y el JPG no demuestra georreferencia; verificar alineación visual antes de publicar.
NEXT EXACT ACTION:    Pedir autorización explícita sólo para hacer push del commit candidato 8c5ce9c (más este handoff documental) desde la rama aislada a origin/main; no iniciar ningún Manual Deploy en ese mismo acto. Antes del push volver a comprobar que origin/main sigue en b03d0fb y que la rama es fast-forward.
DO NOT TOUCH:         Checkout principal/WIP ajeno, .env*, secretos, credenciales, PostgreSQL/GCS productivos, Oregon por inferencia, ViewerFacade, 4D/5D, Saved Views. No push, deploy, cambio de infraestructura ni subida de JPG sin autorización separada por acto.
COMMIT/HEAD REF:      8c5ce9cbcdbdf2e7e1b9073577bde377b9c84f70 (HEAD funcional al escribir este handoff; el commit documental posterior no cambia código funcional).

## Unidad VISOR CANAL · sentido de rueda y reimportación (24-sep-2026)

[WIP HANDOFF]
TAREA:                Corregir sin afectar Drenaje Urbano la rueda invertida reportada en todo Frente Canal y la imposibilidad de quitar/reimportar la misma versión APS.
IMPLEMENTADO:         Commits funcionales locales `91b0f889969294306585aa154d8843de512ceb72` y `84509d58a34fea5aaa4bf5097b739deca94e0324` en `codex/ortofoto-canal`. El primero reaplica la preferencia de zoom no invertido tras carga de geometría y restauración de estado LMV, con limpieza de listeners. El segundo sólo reutiliza el snapshot visible exacto de `scope_id + source_lineage + source_urn` al reimportar la misma versión desvinculada; valida generación/puntero activo y no modifica el snapshot. Si no existe, sigue el extractor APS habitual. La UI no retira el modelo antes de una respuesta satisfactoria del backend. En la evidencia previa del propietario, la versión 66 ya tenía snapshot inmutable de 2.956 filas y una reextracción distinta de 8.771 chocó con `SNAPSHOT_CONTENT_CONFLICT`; reutilizar no equivale a refrescar esa versión.
PENDIENTE:            1) UAT en navegador real con backend y frontend del mismo SHA: comprobar sentido de rueda en Canal y Drenaje antes/después de cambiar viewable o restaurar vista; 2) quitar y reimportar la misma versión en un entorno seguro, comprobar vista e Inventory; 3) verificar que una versión nueva continúa la extracción normal. Push y deploy requieren autorización separada por acto. No cambiar snapshots productivos ni prometer 8.771 filas para la versión 66 sin nueva versión APS.
ARCHIVOS MODIFICADOS: propios, commiteados: frontend-react/src/components/Viewer.jsx; frontend-react/src/utils/forwardWheelZoom.js; frontend-react/src/utils/__tests__/forwardWheelZoom.test.mjs; backend/inventory_identity.py; backend/routes/inventory.py; backend/tests/test_inventory_reimport_snapshot.py; frontend-react/src/App.jsx; frontend-react/src/components/ImportModelModal.jsx; frontend-react/src/utils/removeLinkedModel.js; frontend-react/src/utils/__tests__/removeLinkedModel.test.mjs. Propio pendiente de commit documental: docs/AI_WORKSTATE.md. Ajenos: WIP protegido del checkout principal, intacto y fuera de ambos commits.
TESTS EJECUTADOS:     backend focal 43/43 PASS (incluye 10 casos nuevos de reimportación); frontend utilidades 5/5 PASS; inventoryIdentity 17/17; filtersCore.runtime 17/17; filtersCore.hotfixPostRelease 19/19; filtersCore.b5Lifecycle 5/5; savedViewV2 111/111; frenteDeVistas 20/20; frontend-react npm run build PASS con avisos preexistentes de LoginScreen/imports/tamaño; ESLint de utilidades nuevas 0; git diff --check PASS.
TESTS PENDIENTES:     UAT LMV con el modelo real de Canal y Drenaje; flujo de quitar/reimportar con backend/BD de ensayo y navegador; no se repitió la campaña completa ni se usaron credenciales o escrituras productivas. El lint completo de App/Viewer conserva errores históricos y no es puerta de este cambio.
FALLO CONOCIDO:       El visor web publicado aún sirve un bundle anterior; estos commits no están desplegados. La inversión reportada por el propietario no se reprodujo directamente en navegador por el agente: la corrección de ciclo de vida necesita confirmación visual. El snapshot existente de versión 66 contiene 2.956 filas; una reextracción posterior con otra vista produjo 8.771 y es correctamente rechazada por inmutabilidad.
NEXT EXACT ACTION:    Preparar o usar un entorno de ensayo con backend/frontend de `84509d5` y sesión manual del propietario, abrir Frente Canal y Drenaje Urbano para validar ambos sentidos de rueda; luego quitar/reimportar la misma versión en Canal y verificar Inventory. Si falla, reproducir y corregir antes de proponer publicación.
DO NOT TOUCH:         Checkout principal y WIP ajeno, .env*, credenciales, PostgreSQL/GCS productivos, snapshots históricos, ViewerFacade, 4D/5D, Saved Views, push y deploy sin autorización explícita por acto.
COMMIT/HEAD REF:      84509d58a34fea5aaa4bf5097b739deca94e0324 (HEAD funcional al escribir; el commit documental posterior no cambia código funcional).

## Unidad VISOR CANAL · rueda tras UAT y persistencia F5 (24-sep-2026)

[WIP HANDOFF]
TAREA:                Igualar la rueda de Canal con Drenaje y hacer que una carga aprobada de ortofoto sobreviva a F5 para todos los usuarios.
IMPLEMENTADO:         La rueda de Canal usa el sentido AEC (`reverseMouseZoomDir=true`) tras montar el visor, cargar geometría o restaurar estado. Drenaje conserva el `false` anterior. La selección se pasa por `scopeId` al Viewer; no se cambian cámara, modelos ni datos. En producción `/api/health` respondió `802ff0de5393` el 24-sep, por lo que el ajuste anterior `false` estaba en el candidato vivo. El propietario eligió explícitamente «TODOS LOS NAVEGADORES DE LOS USUARIOS». En Topografía, una única acción «Cargar y publicar para todos» comprueba localmente el mosaico y después publica en el backend; si la comprobación falla no envía nada, y si falla la publicación conserva la capa anterior. La UI bloquea cambios de archivos/controles durante la operación y rechaza la inversión evidente de north/south. El backend existente conserva el puntero activo en GCS y el frontend lo recupera al abrir/F5 y lo refresca en las otras sesiones; la retirada sigue siendo una acción aparte.
PENDIENTE:            UAT real en los dos frentes para la rueda y, en Canal, publicación con JPG válidos, F5, segunda sesión y retirada; requiere autorización separada para push/deploy y acción explícita del administrador en la UI. Ningún JPG se subió en esta unidad.
ARCHIVOS MODIFICADOS: propios frontend-react/src/App.jsx, frontend-react/src/components/Viewer.jsx, frontend-react/src/components/OrthoCanalTrial.jsx, frontend-react/src/utils/forwardWheelZoom.js, frontend-react/src/utils/publishAfterPreview.js, frontend-react/src/utils/__tests__/forwardWheelZoom.test.mjs, frontend-react/src/utils/__tests__/publishAfterPreview.test.mjs y este handoff. Ajenos: ninguno en este worktree; WIP del checkout principal intacto.
TESTS EJECUTADOS:     forwardWheelZoom 3/3 PASS; publishAfterPreview 3/3 PASS; orthoCanalTrial 12/12 PASS; backend/tests/test_ortofoto_semanal.py 1/1 PASS (otro cliente lee la publicación, reemplazo falla cerrado y retirada explícita); frenteDeVistas 20/20, inventoryIdentity 17/17, filtersCore.runtime 17/17, savedViewV2 111/111; build Vite aislado exit 0; ESLint de OrthoCanalTrial y utilidades nuevas exit 0; ESLint completo App/Viewer conserva 100 problemas históricos; git diff --check sin errores. Intentar frontend-react/src/components/OrthoCanalLayer.test.mjs falló porque ese fichero no existe: no es una regresión.
TESTS PENDIENTES:     UAT de rueda LMV en Canal/Drenaje y F5 en dos navegadores tras publicación real; no se hizo ninguna escritura ni despliegue productivo.
FALLO CONOCIDO:       La corrección de rueda y el flujo de una acción no están validados con LMV/GCS/navegador real. Una publicación fallida deja la vista previa local transitoria, que F5 borra; la capa compartida anterior permanece.
NEXT EXACT ACTION:    En entorno seguro, probar rueda en Canal y Drenaje y, como administrador, cargar ambos JPG con «Cargar y publicar para todos»; esperar confirmación y comprobar F5 y segunda sesión antes de cualquier despliegue productivo.
DO NOT TOUCH:         Checkout principal y WIP ajeno, .env*, credenciales, PostgreSQL/GCS productivos, snapshots, ViewerFacade, 4D/5D, Saved Views; no push ni deploy sin autorización por acto.
COMMIT/HEAD REF:      802ff0de5393787e0022533dedd6b04afce85e55 (base funcional de esta unidad; resolver el commit local del ajuste con git log).

## Unidad FILTERS · regresión Drenaje y diagnóstico Canal (24-sep-2026)

[WIP HANDOFF]
TAREA:                Recuperar el aislamiento al pulsar un valor en Filters de Drenaje Urbano y resolver la ausencia de Revit Categories/Inventory en Frente Canal, sin modificar otros productos.
IMPLEMENTADO:         Commit local `b8bc824` en `codex/ortofoto-canal`: el dueño externo del color ya no bloquea la máscara de visibilidad de Filters; el tinte ajeno no se borra y la restauración del aislamiento sigue funcionando. El panel distingue «aislamiento aplicado» de «color cedido». En Canal, si el cálculo queda pendiente por elementos no vinculados, el panel presenta la cifra real; no omite filas ni inventa coincidencias. La producción observada sirve `802ff0de5393`, por lo que este commit no está publicado. El checkout principal y su WIP ajeno siguen intactos.
PENDIENTE:            1) Recibir el resumen read-only por Source de las 33 filas no resueltas de Canal solicitado al propietario; 2) distinguir versión/viewable equivocado frente a hojas sin geometría y corregir la causa precisa sin fallback global ni bajar la comprobación B3; 3) ejecutar UAT LMV de clic/isolation en Drenaje y carga de categorías/Inventory en Canal con backend/frontend del mismo SHA; 4) autorización separada antes de push y de cada deploy.
ARCHIVOS MODIFICADOS: propios commiteados en este worktree: frontend-react/src/lib/filterVisualDriver.js, frontend-react/src/lib/filterPresentation.js, frontend-react/pruebas/filtersCore.runtime.prueba.mjs. Propio pendiente de commit documental: docs/AI_WORKSTATE.md. Ajenos: ninguno aquí; checkout principal protegido sin tocar.
TESTS EJECUTADOS:     filtersCore.runtime 18/18 PASS; filtersCore.hotfixPostRelease 19/19 PASS; filtersCore.b4 13/13 PASS; ESLint focal de los dos módulos 0 problemas; npm run build exit 0 con avisos preexistentes de LoginScreen/imports/chunk; git diff --cached --check PASS. Barrido de todos los scripts filtersCore se detuvo en b5BackendPayload porque requiere un JSON de entrada y, sin él, JSON.parse falla: no es evidencia de regresión del código nuevo.
TESTS PENDIENTES:     Prueba de navegador/GPU real en ambos frentes; diagnóstico agregado de las 33 filas; campaña completa de backend no pertinente a los tres ficheros tocados. No se usaron credenciales ni se escribió en producción.
FALLO CONOCIDO:       En Canal `__filterResult` permanece pending/UNRESOLVED_ELEMENTS con 33 de 8055 filas no vinculadas y por contrato no presenta categorías/Inventory; el origen de esas 33 aún no está identificado. El aislamiento de Drenaje sólo se verificó con el doble LMV, no todavía en navegador real.
NEXT EXACT ACTION:    Comparar la tabla read-only de `window.postgresInventory`/`window.rosettaToDbId` por Source que entregue el propietario con `coverage.unresolvedRows=33`, identificar el Source afectado y comprobar su versión/viewable y tipos de nodo antes de tocar el mapeo.
DO NOT TOUCH:         Checkout principal/WIP ajeno, .env*, credenciales, BD/APS/GCS productivos, snapshots históricos, ViewerFacade, LOB4DExtension.js, Saved Views, ortofoto, push y deploy sin autorización explícita por acto.
COMMIT/HEAD REF:      b8bc824 (HEAD funcional local al escribir este handoff; el commit documental posterior no cambia código funcional).
[WIP HANDOFF]
TAREA:                View local sin formulario y con los proyectos/Inventory existentes de `ecd_dr12d`, conservando login y datos en Render.
IMPLEMENTADO:         `python server.py` limita Flask a 127.0.0.1 y habilita identidad demo sólo para loopback; `npm run dev` limita Vite a localhost; LoginScreen prueba esa identidad sólo en DEV local. El build publicado no contiene DEMO_TOKEN. Tras autorización explícita, migración 31 aplicada sólo en PostgreSQL de la laptop (`127.0.0.1:5433`, base `ecd_dr12d`) y 20.844 filas nativas publicadas como 17 snapshots B1; 7 filas humanas legacy sin candidato se conservaron intactas en `public.asset_user_data`, sin inventarles identidad ni promoverlas. Las 20.844 filas `public.inventory_assets` originales se conservaron. Frontend local recargado: muestra 4 proyectos activos; otros 6 están archivados. No hubo push, deploy ni cambio de `.env*`.
PENDIENTE:            UAT visual de los filtros y acciones dentro de un proyecto concreto; decidir si el guion de reparación local queda como artefacto no commiteado o se retira tras auditoría. No confundir los 7 datos humanos huérfanos conservados con datos promovidos a B1. La comprobación de respaldo fue lectura/parseo completo con `pg_restore --file=NUL`, no restauración de ensayo en otra base.
ARCHIVOS MODIFICADOS: míos: `backend/auth_middleware.py`, `backend/server.py`, `backend/tests/test_auth.py`, `frontend-react/package.json`, `frontend-react/src/components/LoginScreen.jsx`, `backend/herramientas/reparar_inventory_b1_local.py` (nuevo, no commiteado) y este bloque en `docs/AI_WORKSTATE.md`; ajenos preservados: `.claude/launch.json`, `docs/filters/evidencias/IDENTIDAD_4D_5D.json`, `frontend-react/src/App.jsx`, `frontend-react/src/aps/extensions/LOB4DExtension.js`, `frontend-react/src/aps/utils/loadAlignedModels.js`, `frontend-react/src/components/ProfilePanel.jsx`, `frontend-react/src/components/SourceFilesPanel.jsx`, `frontend-react/src/components/TandemSidebar.jsx`, `frontend-react/src/components/Viewer.jsx`, `frontend-react/src/components/ViewerLabelsBar.jsx`, `frontend-react/src/lib/predictBim.js`. Los demás untracked de `git status --short` quedaron intactos.
TESTS EJECUTADOS:     `python -m pytest -q backend/tests/test_auth.py backend/tests/test_inventory_identity_core.py` → 25/25; `node frontend-react/pruebas/inventoryConfig.prueba.mjs` → 20/20; suite previa `python -m pytest -q` → 2058 passed, 1 failed histórico (`test_capacidades_con_puerta`); lint de LoginScreen → 0; build frontend a directorio temporal → OK, 525 módulos, sin DEMO_TOKEN; `py_compile` del servidor y guion local → OK; `git diff --check` → 0 errores. Censo local read-only: 17/17 configuraciones de Source válidas, 20.844/20.844 filas nativas enlazadas a versión/frente exactos, 7/7 datos humanos sin candidato. Respaldo en `C:/Users/ASUS/AppData/Local/ALEPHIA/backups/ecd_dr12d_pre_b1_20260925_114334_ab7ca5f8_{public,ai_brain}.dump`: SHA256 public `3FDF0C7D45167FE7A9110F58BBC0733B27D9325FB872F5AE85F4C0FF1B9A5C5B`, ai_brain `07711351784E88A37AA25F32887A2B9B27527CD65C63C921E55081D0483BCCFB`; `pg_restore` parseó ambos (517 y 36 líneas TOC). Ensayo de migración completo en transacción y ROLLBACK → 20.844 proyectadas, 17 Sources, 0 diferencias. Aplicación confirmada → mismos conteos; legacy conserva 20.844 nativas y 7 humanas. HTTP local con DEMO_TOKEN: `/api/auth/me` 200, `/api/projects` 200 (4 activas), `/api/portal/hubs` 200 (2), `/api/inventory/schema` 200, `/api/inventory/version` de Canal/Drenaje 200, `/api/inventory` Canal 13.766, Drenaje 2.954, Interferencias 4.124 (todos 200). Navegador local tras recargar: «Todos los proyectos», 4 proyectos visibles. Health publicado leído antes: `cdf783754574`.
TESTS PENDIENTES:     UAT de filtros/aislamiento y del modelo APS en la pantalla local; restauración completa de los archivos de respaldo en base desechable no ejecutada (ecd_migrator no tiene CREATEDB). No se ejecutó suite completa de nuevo tras la reparación sólo de datos.
FALLO CONOCIDO:       Al arrancar el backend local, las reglas históricas de Red Line indican cinco DDL pendientes por falta de propiedad de `doc_redlines`; no bloquean proyectos/Inventory y no se tocaron. Fallo histórico de pytest: `/api/docs/miniaturas/preparar` sin puerta de cliente. `public.asset_user_data` conserva 7 registros sin candidato, no visibles como datos B1.
NEXT EXACT ACTION:    Abrir un proyecto local, probar visualmente filtros y aislamiento en Canal y Drenaje, y verificar que los datos servidos por B1 se muestran sin regresión; después decidir el destino del guion local no commiteado. No publicar sin autorización nueva.
DO NOT TOUCH:         Cambios ajenos del checkout, `.env*`, datos de producción y Render; no push ni deploy sin autorización explícita nueva.
COMMIT/HEAD REF:      `b03d0fb2e4be4013c460c746cb4415da9619e0f6` (sin commit propio).

[WIP HANDOFF]
TAREA:                Integrar en la carpeta local canónica las correcciones de ortofoto persistente, filtros/Inventory y scroll de Canal/Drenaje, sin adoptar trabajo ajeno ni publicar.
IMPLEMENTADO:         Se incorporó al worktree local el código de `codex/ortofoto-canal` (HEAD `25579b7cb922c874309df4e5d1e606468eb37754`) sobre el WIP local, sin mover `main` ni alterar su HEAD. `Viewer.jsx` conserva las 48 líneas ajenas de ViewerFacade. El build del visor compila; el navegador local muestra 4 proyectos, Frente Canal, sus 5 Sources y 15 Revit Categories. Topografía muestra la opción nueva de ortofoto y comunica HTTP 503 por almacenamiento GCS local no configurado. No se tocó `.env*`, el bucket de producción, Render ni la DB de producción; tampoco hubo push ni deploy.
PENDIENTE:            Resolver, mediante decisión explícita del propietario, si la ortofoto publicada debe estar disponible en local mediante almacenamiento local propio o credenciales de un bucket de ensayo; no conectar pruebas locales al bucket de producción por suposición. Completar UAT manual de Inventory, aislamiento de filtros y scroll real en ambos frentes. Preparar un commit reproducible sin arrastrar ViewerFacade untracked ni WIP ajeno; no publicar sin nueva autorización.
ARCHIVOS MODIFICADOS: míos en esta integración: `backend/inventory_identity.py`, `backend/politica.py`, `backend/routes/inventory.py`, `backend/routes/orthophoto.py` (nuevo), `backend/server.py`, `backend/tests/test_inventory_reimport_snapshot.py` (nuevo), `backend/tests/test_ortofoto_semanal.py` (nuevo), `docs/visor/05_ORTOFOTO_CANAL.md` (nuevo), `frontend-react/probar-ortofoto.html` (nuevo), `frontend-react/pruebas/filtersCore.runtime.prueba.mjs`, `frontend-react/src/App.jsx`, `frontend-react/src/aps/utils/model.js`, `frontend-react/src/components/GeoControlPanel.jsx`, `frontend-react/src/components/ImportModelModal.jsx`, `frontend-react/src/components/InventoryDataGrid.jsx`, `frontend-react/src/components/OrthoCanalLayer.jsx` (nuevo), `frontend-react/src/components/OrthoCanalTrial.jsx` (nuevo), `frontend-react/src/components/Viewer.jsx`, `frontend-react/src/lib/filterPresentation.js`, `frontend-react/src/lib/filterRuntimeBridge.js`, `frontend-react/src/lib/filterVisualDriver.js`, `frontend-react/src/lib/filtersCore.js`, `frontend-react/src/native/orthoCanalTrial.js` (nuevo), `frontend-react/src/native/__tests__/orthoCanalTrial.test.mjs` (nuevo), `frontend-react/src/probar-ortofoto.jsx` (nuevo), `frontend-react/src/utils/classifyViewerLeaves.js` (nuevo), `frontend-react/src/utils/forwardWheelZoom.js` (nuevo), `frontend-react/src/utils/publishAfterPreview.js` (nuevo), `frontend-react/src/utils/removeLinkedModel.js` (nuevo) y sus cuatro bancos en `frontend-react/src/utils/__tests__/`, además de este bloque. Ajeno preservado: los demás modificados y untracked de `git status --short`, en particular LOB, Saved Views, ViewerFacade, PDFs y archivos de obra.
TESTS EJECUTADOS:     `python -m pytest -q` → 2069 passed, 1 failed histórico (`test_capacidades_con_puerta` por `/api/docs/miniaturas/preparar`); prueba de cobertura y pruebas ortho/reimport/auth tras ajuste estático de `server.py` → 20 passed; frontend native ortho 12/12, wheel 4/4, leaf 2/2, publish 3/3, remove model 3/3, filters runtime 19/19, inventory config 20/20, frente de vistas 20/20, Saved Views V2 111/111, hotfix postrelease 19/19. `npm run build -- --outDir C:/Users/ASUS/AppData/Local/Temp/alephia-integracion-668bb748c09642d1be6fb8981dcc6a5a` → OK, 532 módulos. `git diff --check` → 0 errores. Browser local: 4 proyectos, Canal 5 Sources y 15 categorías; Topografía enseña módulo ortofoto y reporta HTTP 503.
TESTS PENDIENTES:     UAT en navegador de Inventory, aislamiento de filtros y gesto físico de scroll en Canal y Drenaje; ensayo de publicación/lectura de ortofoto con un almacenamiento local o de ensayo autorizado. No se probó ni modificó producción.
FALLO CONOCIDO:       `/api/orthophoto/1_CANAL` devuelve 503 en local porque GCS busca `./SIN-CREDENCIAL-GOOGLE-EN-LOCAL.json`, inexistente. La suite backend mantiene el fallo histórico Docs de miniaturas. Red Line local mantiene cinco DDL sin propiedad; no bloquea la integración observada. ViewerFacade sigue untracked y el build de checkout limpio no es reproducible si se commitea `Viewer.jsx` tal como está.
NEXT EXACT ACTION:    Acordar con el propietario el almacenamiento de ortofotos para desarrollo local (preferencia segura: archivos locales fuera de producción) y, tras ello, implementar y probar esa única adaptación sin tocar el bucket productivo; después terminar UAT de los dos frentes y preparar commit por lista explícita.
DO NOT TOUCH:         `.env*`, `D:/copias-ecd/**`, bucket/DB de producción, Render, LOB protegido, `frontend-react/src/aps/viewer/` y su banco, ni demás WIP ajeno. No push ni deploy sin autorización nueva por acto.
COMMIT/HEAD REF:      `b03d0fb2e4be4013c460c746cb4415da9619e0f6` (integración local sin commit; rama `main`).

[WIP HANDOFF]
TAREA:                Respaldar fuera del repositorio la estructura y los metadatos reales de ALEPHIA Docs antes de continuar la integración local.
IMPLEMENTADO:         El propietario autenticó Cloud SQL Studio personalmente. Se confirmó que producción usa la base `postgres`, distinta de la base local de pruebas. Se exportaron a `C:/Users/ASUS/Documents/ALEPHIA-Docs-Metadatos-2026-09-26/` 13 tablas/resultados JSON: 5327 nodos (553 carpetas activas, 4750 archivos activos), 4818 versiones, enlaces compartidos, emisiones, permisos de carpeta y relaciones/configuración de proyectos. Cada JSON se parseó, se cotejó su conteo con una consulta posterior al origen y se registró SHA-256 en README.md. No se copiaron los 20,62 GB de archivos GCS: el propietario aclaró que sólo requiere conservar información de carpetas y puede recargar modelos. Se instaló Google Cloud CLI oficial 586.0.0, con firma válida de Google LLC y por autorización expresa; no se inició sesión CLI ni se transfirieron archivos. No hubo cambios en producción, Git, Render ni en código funcional.
PENDIENTE:            UAT local del vínculo Docs→ACC del handoff anterior; resolver el fallo de presupuesto de rutas antes de declarar GREEN. Si en el futuro se necesita restauración integral de Docs, obtener un `pg_dump` coherente y respaldar bytes de GCS mediante autorización nueva; los JSON actuales no sustituyen esas piezas.
ARCHIVOS MODIFICADOS: míos en este turno: `docs/AI_WORKSTATE.md` y `C:/Users/ASUS/Documents/ALEPHIA-Docs-Metadatos-2026-09-26/README.md`; se guardaron 13 JSON nuevos en la misma carpeta externa al repositorio. Ajenos preservados: todo el resto del worktree sucio, en especial 4D/LOB, ViewerFacade, visor, PDF y archivos de obra.
TESTS EJECUTADOS:     Cloud SQL Studio `SELECT` de conteos finales: coincidieron las 13 exportaciones; `project_settings` tiene 0 filas. Parseo JSON 13/13. 5327 IDs de nodo únicos; 0 versiones, carpetas hijas, permisos o enlaces compartidos con nodo ausente. `file_emisiones` tiene 2 referencias sin nodo, reproducidas por `SELECT` en producción. SHA-256 de los 13 archivos en README.md. Firma del instalador Google LLC válida; `gcloud --version` → 586.0.0. No se ejecutaron pruebas de aplicación, pues no se editó código funcional.
TESTS PENDIENTES:     Restauración de prueba de los JSON en una base desechable (no son dump SQL autónomo) y UAT local de Docs→ACC; no se descargaron ni verificaron bytes GCS por alcance definido por el propietario.
FALLO CONOCIDO:       Las 2 referencias huérfanas de `file_emisiones` ya existen en producción. Las tablas se exportaron secuencialmente, no en una instantánea transaccional común; los conteos coincidieron al cierre. Los JSON no permiten reconstruir todos los datos ni los binarios de la plataforma. El fallo previo de suite del perfil portal sigue pendiente.
NEXT EXACT ACTION:    Reiniciar el backend local para cargar las rutas Docs→ACC y probar `ALINEAMIENTOS.dwg` en Docs local con una versión ACC preparada, verificando que no se solicite `/api/docs/cad/translate`; documentar el resultado antes de decidir un commit.
DO NOT TOUCH:         `.env*`, `D:/copias-ecd/**`, contraseñas/tokens, bytes GCS, Cloud SQL/GCS de producción en escritura, Render, LOB/4D protegido, `frontend-react/src/aps/viewer/` y su banco, ni WIP ajeno. No push ni deploy sin autorización expresa nueva por acto.
COMMIT/HEAD REF:      `b03d0fb2e4be4013c460c746cb4415da9619e0f6` (sin commit propio; rama `main`).

[WIP HANDOFF]
TAREA:                Respaldar fuera de Google la información real de carpetas, versiones, permisos y archivos de ALEPHIA Docs, sin incluir binarios de modelos BIM ni modificar producción.
IMPLEMENTADO:         Auditoría de sólo lectura: el backend local de puerto 3000 usa PostgreSQL local `127.0.0.1:5433`, base `ecd_dr12d`, rol `ecd_app`; allí sólo hay 10 carpetas, 10 archivos de prueba, 0 filas en `file_versions` y 10 objetos referenciados. No es el expediente Docs en línea. En la consola de Google Cloud del propietario se verificó la instancia Cloud SQL `pqt-08-talara`, el bucket `yaser-pqt08-talara`, copias automáticas recientes de Cloud SQL y una transferencia diaria hacia el bucket de copia del mismo proyecto. La consola de Storage no ofrece descarga de carpeta `multi-tenant/` en su menú. Cloud SQL Studio quedó abierto en el navegador, esperando autenticación que sólo introduce el propietario. No se creó ninguna copia, no se leyó contraseña, no se modificó nube, base, bucket ni repositorio de producto.
PENDIENTE:            El propietario debe autenticarse personalmente en Cloud SQL Studio con una cuenta de lectura; decidir si autoriza instalar Google Cloud CLI oficial e iniciar sesión personalmente en el navegador; medir el volumen actual y acordar límite de costo antes de descargar objetos. Luego producir una copia verificable de la base que preserve dependencias documentales y otra de los objetos Docs, con manifiestos/hashes y ensayo de restauración fuera de producción. No declarar respaldo completo hasta comprobar ambas mitades.
ARCHIVOS MODIFICADOS: propio: sólo `docs/AI_WORKSTATE.md` (CURRENT TASK y este bloque). Ajenos preservados: todos los demás modificados y untracked de `git status --short`, en particular la integración ACC, ortofoto, Filters, ViewerFacade y 4D/LOB protegidos.
TESTS EJECUTADOS:     `git rev-parse HEAD` → `b03d0fb2e4be4013c460c746cb4415da9619e0f6`; baseline `cdf7837545747b3d39cd93ff070af30dd7aa7b9c` ancestro (exit 0); conexión local `SET TRANSACTION READ ONLY` → `127.0.0.1:5433 / ecd_dr12d / ecd_app`, nodos FOLDER=10, FILE=10, versiones=0, bytes registrados=0. Navegador Cloud Storage y Cloud SQL Studio: lectura de UI solamente. Intento de cliente GCS local abortó porque el bucket configurado no coincidía; segundo intento no autenticó por credencial GCS local ausente. No se ejecutaron pruebas de código ni se tomó respaldo.
TESTS PENDIENTES:     `pg_dump` y `pg_restore --file=NUL` o ensayo de restauración de la base documental real; censo/descarga/verificación de objetos GCS y cotejo contra referencias de la DB; comprobación de acceso Docs tras restauración. Pendientes por autenticación y costo no resueltos.
FALLO CONOCIDO:       Una copia de la base local no protegería Docs en línea. La sesión de Google Cloud Console no da por sí sola acceso SQL ni descarga masiva de carpetas; Cloud SQL Studio solicita credenciales de DB, e IAM DB auth aparece deshabilitado en ese diálogo. La transferencia diaria entre buckets permanece en el mismo proyecto y no es copia independiente. No existe todavía respaldo nuevo de Docs.
NEXT EXACT ACTION:    Tras la autenticación personal del propietario en Cloud SQL Studio, ejecutar allí una consulta de sólo lectura que cuente `file_nodes`, `file_versions` y `folder_permissions` del expediente real; no exportar ni modificar antes de confirmar origen, volumen y costo.
DO NOT TOUCH:         `.env*`, `D:/copias-ecd/**`, contraseñas o tokens, credencial de IA, modificaciones en Cloud SQL/GCS/Render, instalación de Google Cloud CLI sin decisión del propietario, frontend-react protegido y WIP ajeno. No push ni deploy sin autorización explícita nueva por acto.
COMMIT/HEAD REF:      `b03d0fb2e4be4013c460c746cb4415da9619e0f6` (sin commit propio; rama `main`).

[WIP HANDOFF]
TAREA:                Verificar la integración local de ortofoto, Filters/Inventory y scroll en Canal y Drenaje, sin publicar ni adoptar WIP protegido.
IMPLEMENTADO:         `python server.py` usa para la ortofoto un almacén local durable bajo `%LOCALAPPDATA%/ALEPHIA/orthophoto-dev` sólo en loopback y modo local; Render conserva GCS. Al publicar, los dos JPG se guardan como archivos inmutables y SQLite mantiene el manifiesto activo con control de generación entre procesos. GET local de `/api/orthophoto/1_CANAL` devolvió HTTP 200 `{active:false,revision:null}` sin GCS. La documentación semanal aclara la separación local/Render. Se reconcilió al principio de este fichero el baseline backend vivo (`cdf783754574`), el HEAD local y los commits funcionales posteriores; el frontend desplegado no se equiparó sin prueba. En navegador local, Canal mostró 5 Sources, 15 Revit Categories y 13.866 filas de Inventory; elegir Floors dejó 1.336 coincidencias y luego se restableció. Drenaje mostró 4 Sources, 11 categorías y 2.954 filas; elegir Doors dejó 1 coincidencia y luego se restableció. Docs local se levantó en 5174 para la navegación de proyectos; no se creó otra copia del proyecto. No hubo cambios en producción, push, deploy, commit ni migración de DB.
PENDIENTE:            Comprobar la capa desde una segunda sesión local autorizada; la publicación y el F5 ya fueron probados visualmente por el propietario y corroborados por la API. Separar los hunks propios de `App.jsx`/`Viewer.jsx` del WIP ajeno para un commit reproducible; no publicar hasta que exista checkout limpio verificable y autorización nueva por acto. Definir más adelante una política de retención para los JPG históricos, sin borrarlos por suposición.
ARCHIVOS MODIFICADOS: míos en este turno: `backend/orthophoto_local_store.py` (nuevo), `backend/routes/orthophoto.py` (selector local/GCS), `backend/tests/test_ortofoto_local_store.py` (nuevo), `docs/visor/05_ORTOFOTO_CANAL.md` y `docs/AI_WORKSTATE.md`. Los archivos de la integración previa están identificados por ruta en el handoff inmediatamente anterior. Ajenos preservados: todo el resto del `git status --short`, en especial `frontend-react/src/aps/viewer/`, `frontend-react/pruebas/viewerFacade.prueba.mjs`, LOB/4D, PDF y archivos de obra.
TESTS EJECUTADOS:     `python -m pytest -q backend/tests/test_reconstruccion_desde_cero.py backend/tests/test_ortofoto_local_store.py backend/tests/test_ortofoto_semanal.py` → 22 passed; `python -m pytest -q` → 2073 passed, 1 failed histórico (`test_toda_capacidad_de_administrador_tiene_puerta` por `/api/docs/miniaturas/preparar`), 2 warnings; `node frontend-react/src/native/__tests__/orthoCanalTrial.test.mjs` → 12/12; `node frontend-react/src/utils/__tests__/forwardWheelZoom.test.mjs` → 4/4; `node frontend-react/pruebas/filtersCore.runtime.prueba.mjs` → 19/19; `python -m py_compile backend/orthophoto_local_store.py backend/routes/orthophoto.py` → OK; `git diff --check` → 0 errores. UAT local de Filters/Inventory en ambos frentes según conteos de IMPLEMENTADO. El propietario confirmó después, con prueba manual en ambos frentes, que scroll, Filters e Inventory funcionan; esta es evidencia comunicada por él, no una medición automatizada del agente. Build frontend previo a este turno: 532 módulos OK; este turno no modificó frontend.
                      Validación posterior comunicada por el propietario: la ortofoto local se ve y vuelve a aparecer tras F5 sin elegir los JPG de nuevo; no se repitió ni reemplazó la carga. Comprobación independiente por HTTP local: `GET /api/orthophoto/1_CANAL` → `active:true`, revisión `7f3ede12f12d45debab0429acd6b419b`, superficie `db_id:135`; GET de los mosaicos norte y sur → 200, 3.213.535 y 3.543.142 bytes.
TESTS PENDIENTES:     Segunda sesión local con la capa real en navegador, build de checkout limpio sin imports untracked, comparación exacta del bundle desplegado y validación posdeploy (sólo tras autorización de publicación).
FALLO CONOCIDO:       La suite oficial conserva un fallo histórico de Docs en la puerta de miniaturas. El backend local informa cinco DDL Red Line sin propiedad; no bloquean Inventory ni proyectos. `Viewer.jsx` y `App.jsx` contienen imports de WIP ajeno no versionado: el build del worktree no acredita reproducibilidad en Render. El estado publicado en GCS no se copia automáticamente en local.
NEXT EXACT ACTION:    Preparar un staging parcial y explícito de `App.jsx` y `Viewer.jsx` que excluya `Visor4D`, `AvancePorAgrupacion` y `ViewerFacade`, y revisar `git diff --cached` antes de cualquier commit.
DO NOT TOUCH:         `.env*`, `D:/copias-ecd/**`, bucket/DB de producción, Render, LOB protegido, `frontend-react/src/aps/viewer/` y su banco, ni demás WIP ajeno. No push ni deploy sin autorización explícita nueva por acto; no commit del worktree entero.
COMMIT/HEAD REF:      `b03d0fb2e4be4013c460c746cb4415da9619e0f6` (sin commit propio; rama `main`).

[WIP HANDOFF]
TAREA:                Integrar un archivo DWG existente de ALEPHIA Docs con una versión ya preparada del mismo archivo en ACC, sin duplicarlo ni gastar una traducción APS.
IMPLEMENTADO:         En el lector CAD autenticado de Docs se consulta un vínculo por versión antes de montar el visor; con vínculo se pasa la URN de ACC directamente a CadViewer, sin `POST /api/docs/cad/translate`. El administrador de instancia puede explorar hubs, proyectos, carpetas, archivo y versiones ACC, vincular una versión de nombre coincidente y retirar el vínculo. La asociación queda en metadata JSONB de la versión de Docs; el GCS original y su descarga no cambian. La lectura del vínculo respeta la guardia del documento, y navegar/vincular ACC exige administrador global por el alcance del token APS. No se tocaron frontend-react, ortofoto, Filters/Inventory ni producción.
PENDIENTE:            UAT real en navegador local con `ALINEAMIENTOS.dwg` y su versión preparada en ACC; verificar la vista de una segunda cuenta autorizada. Resolver explícitamente la prueba de presupuesto de rutas del perfil portal antes de declarar GREEN: el portal ahora tiene 287 rutas frente al techo histórico estricto `<286` por dos rutas nuevas de Docs; no se elevó el umbral sólo para aprobar. Definir después el orden backend→portal para una eventual publicación autorizada.
ARCHIVOS MODIFICADOS: míos: `backend/routes/docs_cad.py`, `backend/tests/test_docs_acc_link.py` (nuevo), `frontend-docs/src/components/AccLinkPicker.jsx` (nuevo), `frontend-docs/src/components/DocumentViewer.jsx`, `frontend-docs/src/pages/FilesPage.jsx` y este bloque/encabezado de `docs/AI_WORKSTATE.md`. Ajenos preservados: todos los demás archivos modificados y untracked de `git status --short`, especialmente frontend-react, LOB/4D, ortofoto, PDF y archivos de obra.
TESTS EJECUTADOS:     `python -m pytest -q backend/tests/test_docs_acc_link.py backend/tests/test_vistas_de_autocad.py` → 32 passed, 2 warnings; `npm test` en frontend-docs → 12 bancos, todos verdes; `npx vite build --outDir <directorio temporal>` → OK, 466 módulos; `python -m py_compile backend/routes/docs_cad.py backend/tests/test_docs_acc_link.py` → OK; `git diff --check` de los archivos de código modificados → 0 errores. Suite oficial `python -m pytest -q` → 2078 passed, 2 failed: fallo histórico `test_capacidades_con_puerta` por `/api/docs/miniaturas/preparar`, y `test_perfil_portal::test_el_recorte_es_real` por 287 rutas frente a `<286`. Build in-place de Docs falló EPERM al limpiar `dist/assets`; el build a directorio temporal sí pasó. Lint focalizado: AccLinkPicker sin hallazgos; DocumentViewer mantiene error previo de hook condicional en línea 307 y FilesPage conserva 4 errores previos de variables sin uso; la nueva dependencia de efecto se corrigió.
TESTS PENDIENTES:     Prueba navegador local del flujo completo con Autodesk real, F5 y segundo usuario; prueba de publicación sólo tras autorización nueva. No se probó en producción ni se tocó la DB real.
FALLO CONOCIDO:       La suite general no está verde por las dos pruebas señaladas. Sin backend nuevo desplegado, el portal nuevo mostraría error de comprobación CAD; el despliegue futuro debe iniciar por backend. El vínculo sólo cubre lectores autenticados de Docs, no enlaces públicos compartidos.
NEXT EXACT ACTION:    Reiniciar el backend local para cargar las rutas nuevas y, en Docs local, abrir `ALINEAMIENTOS.dwg`, usar «Vincular vista ACC» para escoger el archivo/version ya visible en ACC y comprobar que la vista abre sin solicitud `/translate`; documentar el resultado antes de cualquier decisión sobre el techo de rutas.
DO NOT TOUCH:         `.env*`, `D:/copias-ecd/**`, bucket/DB de producción, Render, frontend-react protegido o WIP ajeno; no push ni deploy sin autorización explícita nueva por acto, ni commit del worktree completo.
COMMIT/HEAD REF:      `b03d0fb2e4be4013c460c746cb4415da9619e0f6` (integración local sin commit; rama `main`).

[WIP HANDOFF]
TAREA:                Cerrar el respaldo de metadatos Docs y retomar el UAT local del vínculo Docs→ACC.
IMPLEMENTADO:         Respaldo externo verificado en `C:/Users/ASUS/Documents/ALEPHIA-Docs-Metadatos-2026-09-26/`: 13 JSON, 5327 nodos, 4818 versiones, permisos, enlaces y configuración de proyectos; README.md contiene conteos, hashes y límites. El bloque de respaldo verificado anterior detalla la evidencia. No se descargaron los binarios GCS, por indicación del propietario; no hubo cambios en producción, push, deploy ni commit.
PENDIENTE:            Retomar la integración local Docs→ACC y el problema de acceso a Docs local sobre el checkout y la configuración existentes, sin pedir rutas de archivos ni tomar `ALINEAMIENTOS.dwg` como requisito. La diferencia observada entre la base local de ensayo y producción no obliga a copiar datos para editar código. Resolver el presupuesto de rutas del perfil portal antes de declarar GREEN.
ARCHIVOS MODIFICADOS: propio: `docs/AI_WORKSTATE.md`; fuera del repositorio: README.md y 13 JSON en la carpeta de respaldo indicada. Ajenos preservados: todo el worktree sucio anterior.
TESTS EJECUTADOS:     Conteos postexportación 13/13 coincidentes; JSON 13/13 válidos; hashes SHA-256 registrados; referencias principales de nodos 0 faltantes. Dos emisiones huérfanas confirmadas también en origen. `git diff --check -- docs/AI_WORKSTATE.md` → sin errores. No se editó ni probó código funcional en este acto.
TESTS PENDIENTES:     UAT Docs→ACC y prueba de restauración en base desechable; los JSON no son dump SQL íntegro ni instantánea transaccional común.
FALLO CONOCIDO:       Dos emisiones con referencia a nodo ausente ya existían en producción; suite general mantiene los fallos descritos en el handoff de integración Docs→ACC.
NEXT EXACT ACTION:    Revisar en el checkout local el estado del backend y frontend-docs y reproducir el problema de acceso local descrito por el propietario; después ejecutar las pruebas automatizadas de la integración Docs→ACC sin depender de un DWG concreto. No tocar producción ni importar metadatos por suposición.
DO NOT TOUCH:         `.env*`, `D:/copias-ecd/**`, contraseñas, GCS/Cloud SQL de producción en escritura, Render, LOB/4D, ViewerFacade ni WIP ajeno; no push ni deploy sin autorización expresa nueva por acto.
COMMIT/HEAD REF:      `b03d0fb2e4be4013c460c746cb4415da9619e0f6` (sin commit propio; rama `main`).

[WIP HANDOFF]
TAREA:                Habilitar y verificar el acceso a ALEPHIA Docs en el checkout local, sin cambiar el login publicado ni copiar datos de producción.
IMPLEMENTADO:         Docs en Vite DEV y `localhost` consulta la identidad local ya existente del backend mediante `DEMO_TOKEN` y entra sin contraseña; producción, navegador remoto, app nativa, invitaciones, restablecimiento, ticket SSO y `?login=1` conservan el flujo de login. En navegador se abrió `http://localhost:5174/`, se mostró el Hub con «Hola, Demo», se entró a Documentos de PQT8_TALARA y F5 conservó esa vista sin volver al login. El backend local respondió 200 a `/api/auth/me`, `/api/projects` y `/api/portal/hubs` con la identidad de ensayo. No se modificaron `.env*`, Git remoto, Render, GCS ni producción.
PENDIENTE:            UAT del vínculo Docs→ACC con cualquier versión CAD que exista en Docs local y su homóloga preparada en ACC; no es necesario `ALINEAMIENTOS.dwg` específicamente. Resolver el presupuesto de rutas del perfil portal, ya señalado en el handoff de integración, antes de declarar GREEN. Preparar commit sólo con staging explícito cuando la unidad esté completa y el propietario lo pida; push y deploy requieren autorización separada.
ARCHIVOS MODIFICADOS: míos en esta unidad: `frontend-docs/src/LoginScreen.jsx`, `frontend-docs/src/utils/accesoLocal.js` (nuevo), `frontend-docs/pruebas/accesoLocal.prueba.mjs` (nuevo) y este estado en `docs/AI_WORKSTATE.md`. Ajenos preservados: toda la integración Docs→ACC previa, frontend-react, ortofoto, LOB/4D, PDF, archivos de obra y demás entradas de `git status --short`.
TESTS EJECUTADOS:     `npm test` en frontend-docs → 13 bancos verdes (incluye 11/11 casos nuevos de acceso local); `python -m pytest -q backend/tests/test_auth.py backend/tests/test_docs_acc_link.py` → 14 passed, 2 warnings de dependencias; `npx eslint src/LoginScreen.jsx src/utils/accesoLocal.js` → 0 errores; `npx vite build --outDir <directorio temporal único>` → OK, 467 módulos, 8,07 s, advertencias de imports dinámicos/estáticos preexistentes; `git diff --check` focalizado → 0 errores. UAT navegador local: Hub, proyecto PQT8_TALARA y F5 sin rebote. Primer build concurrente con el arranque de Vite falló por bloqueo EPIPE al copiar pdf.js; repetido secuencialmente pasó sin cambio de código.
TESTS PENDIENTES:     Flujo real completo Docs→ACC con versión CAD local; verificación con un segundo usuario autorizado; suite backend oficial completa tras esta unidad no repetida porque el único código nuevo es frontend y las pruebas focalizadas/backend ACC pasaron.
FALLO CONOCIDO:       La URL alternativa `127.0.0.1:5174` muestra login porque esta configuración local permite CORS en `localhost:5174` y `VITE_BACKEND_URL` apunta a `localhost:3000`; usar `http://localhost:5174/`. El Hub mostró «No se pudo cargar el trabajo pendiente», no investigado en esta unidad. El presupuesto de rutas del perfil portal y la prueba histórica de miniaturas siguen pendientes según el handoff anterior. La obra PQT8_TALARA mostró 0 elementos en su raíz local; esto no demuestra que sus carpetas o archivos estén completos en local.
NEXT EXACT ACTION:    Revisar si existe en una carpeta de Docs local alguna versión CAD apta para UAT y, si existe, probar desde la UI «Vincular vista ACC» con una versión ACC ya preparada; registrar peticiones `/translate` y el resultado sin escribir en producción. Si no existe, no importar datos automáticamente: continuar con pruebas de contrato/flujo y pedir sólo una elección mínima al propietario para la prueba visual.
DO NOT TOUCH:         `.env*`, `D:/copias-ecd/**`, contraseñas, GCS/Cloud SQL de producción en escritura, Render, archivos LOB/4D, ViewerFacade y WIP ajeno; no push ni deploy sin autorización explícita nueva por acto.
COMMIT/HEAD REF:      `b03d0fb2e4be4013c460c746cb4415da9619e0f6` (sin commit propio; rama `main`).

[WIP HANDOFF]
TAREA:                Diagnosticar el rebote de login en Chrome y el expediente vacío de Docs local, sin copiar datos ni tocar producción.
IMPLEMENTADO:         Se reprodujo Chrome inicialmente en login y se verificó la identidad local: la petición de ensayo `/api/auth/me` devolvió 200 y usuario demo; después de recargar, Chrome mostró el Hub y permaneció en PQT8_TALARA tras F5. Había dos Vite de Docs en puerto 5174, uno del usuario en `::1` (PID 38032) y otro iniciado por este agente en `127.0.0.1` (PID 41020). Se detuvo únicamente el segundo; el servidor del usuario sigue escuchando. El WebSocket HMR registraba fallos, de modo que la pestaña podía mantener código anterior sin refrescarse en vivo. Chrome tenía guardado «MEJORAMIENTO DEL DRENAJE PLUVIAL - SAN MARCOS», ausente de los cuatro proyectos devueltos por el backend local; al elegir PQT8_TALARA, su raíz mostró 0 elementos. El censo local anterior del mismo backend registró 10 carpetas, 10 archivos de ensayo y 0 versiones; el código en la laptop no equivale a los metadatos de Docs en producción. Las líneas de diagnóstico temporales en LoginScreen se retiraron; no quedó cambio funcional nuevo en este turno.
PENDIENTE:            Decidir con el propietario qué subconjunto de metadatos documentales necesita ver y probar en local; no importar automáticamente el respaldo ni apuntar desarrollo a producción. Validar un vínculo Docs→ACC cuando haya una versión local adecuada. Evaluar una corrección acotada para invalidar `selected_project` obsoleto al cambiar de backend/identidad; no se cambió por tratarse de estado preexistente del navegador y estar fuera del diagnóstico solicitado.
ARCHIVOS MODIFICADOS: mío: `docs/AI_WORKSTATE.md` (CURRENT TASK y este bloque). `frontend-docs/src/LoginScreen.jsx` quedó exactamente como en el handoff anterior, tras retirar instrumentación temporal. Ajenos preservados: los demás modificados y untracked de `git status --short`, incluidas las piezas Docs→ACC, ortofoto y LOB/4D.
TESTS EJECUTADOS:     `git status --short`, `git rev-parse HEAD`, `git log --oneline -10`, `git merge-base --is-ancestor cdf7837545747b3d39cd93ff070af30dd7aa7b9c HEAD` → baseline ancestro (0), HEAD `b03d0fb2e4be4013c460c746cb4415da9619e0f6`; `Get-NetTCPConnection` → dos listeners en 5174 antes y sólo `::1:5174` después; inspección Chrome → `/api/auth/me` 200, identidad demo, Hub visible, cuatro proyectos locales, PQT8_TALARA con 0 elementos y sesión persistente tras F5. No se ejecutó suite de código porque la instrumentación se retiró y no hubo cambio funcional nuevo.
TESTS PENDIENTES:     UAT Docs→ACC con datos de ensayo locales y prueba de invalidación de selección obsoleta si el propietario autoriza esa mejora; suite completa del backend sigue con los fallos históricos consignados en handoffs previos.
FALLO CONOCIDO:       Docs local no contiene el expediente en línea; la raíz de PQT8_TALARA está vacía. La selección `selected_project` en Chrome puede referir a una obra de otro backend («San Marcos»), sin validación inicial contra los proyectos actuales. El HMR de Vite mostró errores de WebSocket; el rebote inicial no se atribuye de forma concluyente a ese único factor, pero recarga manual con un solo servidor sí dejó la sesión estable.
NEXT EXACT ACTION:    Explicar al propietario la diferencia entre código local y datos documentales locales; pedir una decisión de alcance para un conjunto mínimo de metadatos de prueba si quiere UAT visual Docs→ACC. No importar el respaldo completo ni descargar GCS por suposición.
DO NOT TOUCH:         `.env*`, `D:/copias-ecd/**`, contraseñas, datos de producción, Render, LOB/4D, ViewerFacade ni WIP ajeno; no commit, push ni deploy sin autorización expresa por acto.
COMMIT/HEAD REF:      `b03d0fb2e4be4013c460c746cb4415da9619e0f6` (sin commit propio; rama `main`).

[WIP HANDOFF]
TAREA:                Corregir el diagnóstico del expediente vacío: averiguar por qué Docs local ya no ve los datos que el propietario veía antes sin descargas.
IMPLEMENTADO:         Se confirmó que el Vite de `frontend-docs` en `localhost:5174` compila `VITE_BACKEND_URL` hacia `http://localhost:3000` (resultado booleano, sin imprimir `.env` ni secretos), y que el backend local usa PostgreSQL `127.0.0.1:5433`, base `ecd_dr12d`, según el censo read-only anterior. El único listener PostgreSQL local es 5433; Chrome mostró cuatro proyectos de ese backend y 0 elementos en la raíz PQT8_TALARA. `docs/AI_WORKSTATE.md` documenta que el ajuste local para View/Inventory se hizo el 25-sep sobre `ecd_dr12d`; Docs comparte backend y, por tanto, ve ese origen de ensayo. El proyecto «San Marcos» conservado en Chrome no está entre los cuatro del backend actual, evidencia de cambio de origen o datos. Se retiró la premisa anterior de que sea necesario descargar/importar documentos para trabajar desde frontend local. No se cambió configuración ni código funcional.
PENDIENTE:            Identificar con evidencia, sin leer `.env*` ni credenciales, a qué backend/base apuntaba el flujo local de Docs cuando el propietario veía sus expedientes; distinguir si era otra base local o acceso remoto. Sólo después proponer recuperar esa conexión de manera segura. UAT Docs→ACC sigue pendiente.
ARCHIVOS MODIFICADOS: mío: `docs/AI_WORKSTATE.md` (CURRENT TASK y este bloque). Ajenos preservados: todos los demás cambios del worktree; `.env*` no se leyó ni modificó.
TESTS EJECUTADOS:     `git status --short`, `git rev-parse HEAD`, `git log --oneline -10`, `git merge-base --is-ancestor cdf7837545747b3d39cd93ff070af30dd7aa7b9c HEAD` → baseline ancestro (0), HEAD `b03d0fb2e4be4013c460c746cb4415da9619e0f6`; módulo servido por Vite → `DocsFrontendToLocalBackend=True`, `DocsFrontendToRemoteBackend=False`; `Get-NetTCPConnection` → listeners en 3000, 5174 y sólo PostgreSQL 5433, no 5432. Se cotejó el handoff local del 25-sep y el código de resolución del backend. No se ejecutó suite de aplicación: análisis read-only sin cambio funcional.
TESTS PENDIENTES:     Verificación de la conexión histórica de Docs local y UAT del vínculo Docs→ACC tras resolver el origen de datos; no se probó producción.
FALLO CONOCIDO:       El frontend Docs local muestra la base de ensayo `ecd_dr12d`, que no contiene el expediente documental que el propietario esperaba. No está demostrado todavía cuál era el origen anterior; sugerir una descarga o importación fue prematuro. El HMR de Vite y la selección obsoleta de proyecto siguen documentados en el handoff previo.
NEXT EXACT ACTION:    Localizar en instrucciones y evidencia histórica del checkout (sin abrir `.env*` ni volcar credenciales) el destino anterior del backend usado por Docs local; si no hay evidencia suficiente, pedir al propietario sólo la identificación del servicio o base anterior, no archivos ni contraseñas. No reconectar a producción sin autorización explícita por acto.
DO NOT TOUCH:         `.env*`, `D:/copias-ecd/**`, contraseñas, Cloud SQL/GCS/Render de producción, LOB/4D, ViewerFacade y WIP ajeno; no commit, push ni deploy sin autorización expresa por acto.
COMMIT/HEAD REF:      `b03d0fb2e4be4013c460c746cb4415da9619e0f6` (sin commit propio; rama `main`).

[WIP HANDOFF]
TAREA:                Precisar cómo Docs mostraba datos reales desde código local sin copiarlos y distinguirlo del modo actual vacío.
IMPLEMENTADO:         Se encontró la configuración histórica `frontend-docs/vite.banco.config.js`: `--mode docslocal` construye el portal en `dist-local` y `vite preview` reenvía `/api` al backend HTTPS indicado por `dist-local/backend-remoto.txt`. `docs/archivos/16_CAD_COMO_EN_AUTOCAD.md` identifica explícitamente `http://localhost:5182` como portal nuevo local contra producción (20-sep-2026); `.claude/launch.json` aún registra modo `docslocal` y puerto 5182. `dist-local/index.html` y el marcador existen; el marcador se validó sin imprimir su valor y apunta a HTTPS de Render, no a loopback. No hay listener en 5182. En contraste, `localhost:5174` compila `VITE_BACKEND_URL=http://localhost:3000`, y el backend local usa la base de ensayo `ecd_dr12d`; por eso el portal muestra otros proyectos y el expediente vacío. No hubo pérdida de archivos demostrada ni necesidad de descarga. No se arrancó 5182 ni se llamó al backend remoto.
PENDIENTE:            Si el propietario autoriza expresamente trabajar contra datos reales, verificar primero el destino exacto y la salud del backend de 5182 con solicitudes de sólo lectura; limitar cualquier prueba de escritura porque el portal local en ese modo escribe sobre producción. Decidir cómo probar cambios con seguridad sin confundir 5174 y 5182. UAT Docs→ACC pendiente.
ARCHIVOS MODIFICADOS: mío: `docs/AI_WORKSTATE.md` (CURRENT TASK y este bloque). Ningún archivo funcional modificado en este turno; worktree ajeno preservado.
TESTS EJECUTADOS:     `rg` sobre configuración/código y documentación histórica → modo `docslocal`/5182 identificado; `Test-Path` → `dist-local/index.html` y `dist-local/backend-remoto.txt` presentes; verificación de URI del marcador → HTTPS verdadero, Render verdadero, loopback falso, sin revelar URL; `Get-NetTCPConnection` → sin listener 5182, listener Docs 5174 y backend 3000. No suite de código, porque no se modificó código funcional.
TESTS PENDIENTES:     Arranque y UAT read-only del portal 5182 sólo tras autorización específica de contacto con backend real; pruebas de integración Docs→ACC; suite funcional no repetida.
FALLO CONOCIDO:       `localhost:5174` sigue vacío para el expediente real porque consulta `ecd_dr12d`, no la base de Render. El modo 5182 existente no está arrancado. Usar la UI local 5182 para subir, vincular, editar o borrar produciría cambios reales en producción, aunque el código del frontend siga local.
NEXT EXACT ACTION:    Explicar al propietario que su flujo previo era 5182→Render y pedir autorización específica antes de reactivar/verificar ese acceso; si la concede, confirmar el destino sin exponer credenciales y empezar con GET read-only. No copiar archivos ni datos por suposición.
DO NOT TOUCH:         `.env*`, `D:/copias-ecd/**`, contraseñas, base/bucket de producción en escritura, Render deploy, LOB/4D, ViewerFacade ni WIP ajeno; no commit, push ni deploy sin autorización expresa por acto.
COMMIT/HEAD REF:      `b03d0fb2e4be4013c460c746cb4415da9619e0f6` (sin commit propio; rama `main`).

[WIP HANDOFF]
TAREA:                Reactivar Docs local con los expedientes reales y comprobar sus carpetas sólo en lectura.
IMPLEMENTADO:         El marcador del modo `docslocal` identifica `https://visor-ecd-backend-va.onrender.com`, no Oregon. El portal 5182 arrancó y su proxy respondió `/api/health` con 200, `main`, configuración completa y versión `802ff0de5393`. El `dist-local` preexistente había sido compilado con `VITE_BACKEND_URL=http://localhost:3000`: abrió la sesión pero falló la lista de proyectos con `Failed to fetch`. Se conservó intacto ese artefacto y se generó una compilación temporal fuera del repositorio con `VITE_BACKEND_URL` y `VITE_API_URL` en `http://localhost:5182`; el navegador mostró los proyectos reales y, en PQT8_TALARA, las cinco carpetas principales (01_WIP, 02_SHA, 03_PUB, 04_ARC y 05_Gestion_Administrativo). El servidor 5182 quedó activo y su pestaña abierta. No se descargaron archivos ni se hicieron solicitudes de escritura, push, deploy o commit.
PENDIENTE:            Probar la integración Docs→ACC de extremo a extremo con una versión CAD elegida por el propietario; las acciones de vincular, subir, editar o borrar en 5182 escribirían en producción y requieren autorización específica nueva. Decidir después si el flujo 5182 debe convertirse en un procedimiento reproducible del checkout, sin tocar el paquete anterior de forma accidental. Verificar la procedencia del nuevo commit de backend informado por Virginia antes de cualquier release.
ARCHIVOS MODIFICADOS: propio: `docs/AI_WORKSTATE.md` (CURRENT TASK, aclaración del baseline y este bloque). La compilación de ensayo está fuera del repositorio en `C:/Users/ASUS/AppData/Local/Temp/alephia-docs-5182-302926d66c514d2dbff6a3e79db5b39e/`. Ajenos preservados: el resto del worktree sucio, incluido `frontend-docs/dist-local` y todos los archivos protegidos.
TESTS EJECUTADOS:     `git status --short`, `git rev-parse HEAD`, `git log --oneline -10`, `git merge-base --is-ancestor cdf7837545747b3d39cd93ff070af30dd7aa7b9c HEAD` → ancestro, salida 0; `GET http://localhost:5182/api/health` → 200/ok; `npx vite build --config vite.banco.config.js --mode docslocal --outDir <temporal>` → 467 módulos, OK, advertencias conocidas de imports; inspección del bundle temporal → contiene `http://localhost:5182` y no `http://localhost:3000`; Chrome → sesión Yaser, lista de cinco proyectos y cinco carpetas raíz de PQT8_TALARA. El primer bundle dejó 0 elementos y `Failed to fetch`, defecto reproducido antes de cambiar al temporal.
TESTS PENDIENTES:     UAT Docs→ACC y suite completa backend/frontend de la integración; no se repitieron porque no hubo cambios funcionales de código en esta unidad.
FALLO CONOCIDO:       `dist-local` preexistente sigue compilado contra localhost:3000, por lo que reiniciar preview sin `--outDir` temporal reproducirá el fallo. `localhost:5174` sigue consultando la base local de ensayo. El backend Virginia ahora informa `802ff0de5393`, distinto del baseline de producción anotado el 25-sep; su procedencia aún no se verificó.
NEXT EXACT ACTION:    Si se necesita continuar el UAT, mantener la pestaña `http://localhost:5182/?obra=1` y el preview con `--outDir` temporal; antes de cualquier acción que escriba, pedir autorización expresa y delimitar el archivo/version de prueba. Para trabajo seguro sin datos reales, usar 5174 con la base de ensayo.
DO NOT TOUCH:         `.env*`, `D:/copias-ecd/**`, contraseñas, GCS/Cloud SQL/Render de producción en escritura, `dist-local` previo, LOB/4D, ViewerFacade y WIP ajeno; no commit, push ni deploy sin autorización explícita por acto.
COMMIT/HEAD REF:      `b03d0fb2e4be4013c460c746cb4415da9619e0f6` (sin commit propio; rama `main`).

[WIP HANDOFF]
TAREA:                Aclarar cómo hacer que Docs abierto por VS Code en `localhost:5174` muestre las carpetas reales sin confundirlo con 5182.
IMPLEMENTADO:         Se verificó sólo el código local: `frontend-docs/package.json` ejecuta `vite` en `npm run dev`; `frontend-docs/vite.config.js` fija el proxy `/api` a `127.0.0.1:3000`; `frontend-docs/src/utils/helpers.js` usa `VITE_BACKEND_URL`, y `frontend-docs/src/LoginScreen.jsx` cae a `localhost:3000` cuando no se define. El acceso de ensayo de `frontend-docs/src/utils/accesoLocal.js` está restringido a desarrollo y loopback; no autentica en Virginia. Por eso cambiar sólo el proxy no garantiza que todas las peticiones de 5174 vayan a Virginia. No se cambió configuración, sesión de VS Code ni datos.
PENDIENTE:            Obtener confirmación explícita del propietario para conectar el frontend Docs de 5174 al backend real de Virginia, sabiendo que las operaciones de datos desde esa URL afectarán a producción. Luego implementar de forma acotada el destino de API y el proxy de Vite, preservar un modo de ensayo local, verificar login y carpetas sólo con lecturas, y documentar el arranque reproducible. No confundirlo con despliegue de código.
ARCHIVOS MODIFICADOS: mío: `docs/AI_WORKSTATE.md` (CURRENT TASK y este bloque). Ajenos preservados: todo el worktree sucio previo, incluido `frontend-docs/src/LoginScreen.jsx`, que sólo se leyó; `.env*` no se leyó ni modificó.
TESTS EJECUTADOS:     `git status --short`, `git rev-parse HEAD`, `git log --oneline -10`, `git merge-base --is-ancestor cdf7837545747b3d39cd93ff070af30dd7aa7b9c HEAD` → ancestro, salida 0; lectura de `frontend-docs/package.json`, `vite.config.js`, `src/LoginScreen.jsx` y `src/utils/accesoLocal.js`. No se ejecutó suite funcional porque no hubo cambio de código.
TESTS PENDIENTES:     Prueba de configuración y navegador en 5174, UAT de login y carpetas; requieren autorización para la nueva conexión a Virginia. Suite automatizada sólo después de implementar.
FALLO CONOCIDO:       5174 permanece conectado al backend local 3000 y muestra el expediente de ensayo incompleto; 5182 sigue mostrando carpetas reales con el preview temporal. El backend Virginia reportó `802ff0de5393` en la verificación read-only anterior, cuya procedencia aún no se investigó.
NEXT EXACT ACTION:    Pedir al propietario un «sí, conecta 5174 a Virginia» explícito; después modificar únicamente la configuración local necesaria, sin escribir datos reales, y probar desde 5174 que la lista de proyectos y carpetas coincide con 5182.
DO NOT TOUCH:         `.env*`, `D:/copias-ecd/**`, contraseñas, datos reales de Docs en escritura, Render, LOB/4D, ViewerFacade, `dist-local` anterior ni WIP ajeno; no commit, push ni deploy sin autorización explícita por acto.
COMMIT/HEAD REF:      `b03d0fb2e4be4013c460c746cb4415da9619e0f6` (sin commit propio; rama `main`).

[WIP HANDOFF]
TAREA:                Hacer que Docs abierto desde VS Code en `localhost:5174` consulte Virginia, manteniendo el código local y un modo de ensayo separado.
IMPLEMENTADO:         Tras el «sí» explícito del propietario, `npm run dev` en `frontend-docs` ahora fija URL de API al mismo origen 5174 y reenvía `/api`, `/docs/uploads` y `/maps/uploads` al backend Virginia; `npm run dev:ensayo` conserva el backend local 3000. El build de producción no hereda la URL de desarrollo. El inicio automático con `DEMO_TOKEN` está desactivado cuando el origen real está activo. Una sesión demo antigua se cerró en la pestaña Chrome sin enviar POST a Virginia; el formulario de login quedó abierto para que el propietario introduzca su contraseña personalmente. No se tocaron documentos ni se hizo commit, push o deploy.
PENDIENTE:            El propietario debe iniciar sesión personalmente en la pestaña Chrome de `http://localhost:5174/`. Después, comprobar proyectos, cinco carpetas raíz de PQT8_TALARA y persistencia tras F5, todo sólo en lectura. Investigar por separado el WebSocket HMR de Vite si sigue fallando; no se demostró aún la recarga automática de cambios.
ARCHIVOS MODIFICADOS: propios en esta unidad: `frontend-docs/vite.config.js`, `frontend-docs/package.json`, `frontend-docs/src/utils/accesoLocal.js`, `frontend-docs/src/LoginScreen.jsx` (ya tenía cambios de la unidad anterior), `frontend-docs/src/hooks/useUser.js`, `frontend-docs/src/App_Refactor.jsx`, `frontend-docs/pruebas/accesoLocal.prueba.mjs`, `frontend-docs/pruebas/origenDocsDev.prueba.mjs` (nuevo) y `docs/AI_WORKSTATE.md`. Ajenos preservados: el resto de `git status --short`, incluidos Docs→ACC, frontend-react, LOB/4D, ortofoto, PDF y archivos de obra.
TESTS EJECUTADOS:     `node --check frontend-docs/vite.config.js` → OK; `GET http://localhost:5174/api/health` → 200/ok, main, versión `802ff0de5393`, configuración completa; `GET /api/auth/me` con `DEMO_TOKEN` → 401 esperado; módulo Vite transformado → `VITE_BACKEND_URL=http://localhost:5174` y `VITE_DOCS_REAL_DATA=true`; `npm test` en frontend-docs → 14 bancos, todos verdes; ESLint focalizado en los ocho archivos de código/pruebas modificados → 0 errores; build Vite a directorio temporal fuera del repositorio → 467 módulos, OK. Chrome en 5174 mostró login después de retirar sesión demo, sin reingreso automático. No se comprobó aún el expediente autenticado en 5174.
TESTS PENDIENTES:     UAT autenticado de 5174 (proyectos, carpetas y F5), HMR en VS Code/Chrome, prueba del modo `dev:ensayo` en navegador y suite backend completa; no se corrieron para no interrumpir al propietario ni tocar producción.
FALLO CONOCIDO:       La pestaña anterior de IAB en 5174 conserva una identidad demo obsoleta hasta cerrar sesión o recargar el estado; Chrome ya quedó en login. Vite ha registrado fallos de WebSocket HMR. El código de Docs→ACC sigue WIP y la suite general backend tiene los fallos históricos indicados en handoffs anteriores; no declararlos resueltos.
NEXT EXACT ACTION:    Una vez que el propietario confirme que inició sesión en la pestaña Chrome de 5174, abrir PQT8_TALARA, contar las carpetas raíz y recargar con F5; no realizar POST/PUT/PATCH/DELETE de documentos. Si el login falla, diagnosticar sólo las peticiones de autenticación sin leer credenciales.
DO NOT TOUCH:         `.env*`, `D:/copias-ecd/**`, contraseñas, datos reales de Docs en escritura, Render, `dist-local` anterior, LOB/4D, ViewerFacade y WIP ajeno; no commit, push ni deploy sin autorización explícita por acto.
COMMIT/HEAD REF:      `b03d0fb2e4be4013c460c746cb4415da9619e0f6` (sin commit propio; rama `main`).

[WIP HANDOFF]
TAREA:                Diagnosticar el rebote de Docs en `localhost:5174` tras conectar el frontend local al backend Virginia.
IMPLEMENTADO:         En la pestaña de ensayo IAB que aún mostraba «DU», el navegador registró `401` en `/api/projects/1/mi-administracion` y `/api/projects/proyectos%2FPQT8_TALARA/herramientas`; `apiFetch` trató esa sesión `DEMO_TOKEN` como inválida y volvió al login. Se añadió descarte síncrono del token Demo antes del primer render sólo en modo Docs→Virginia; el modo `dev:ensayo` y tokens reales no se descartan. El service worker de producción ya no se registra en Vite DEV, y las instalaciones anteriores se retiran sólo en loopback para no cachear módulos `/src/*` sin hash. Se añadieron mensajes diagnósticos sólo en DEV/Virginia con status, ruta y presencia booleana del token, sin registrar credenciales ni valores de token. Una página temporal de limpieza se retiró tras verificar 0 registros/0 caché en IAB. No se tocaron documentos ni producción en escritura.
PENDIENTE:            El propietario debe reproducir una vez el acceso en su Chrome de `localhost:5174` después de F5; distinguir si el POST de login da 200 con token y si algún GET posterior da 401 con `NO_TOKEN` o `INVALID_TOKEN`. Si ya permanece en Docs, retirar la instrumentación temporal y verificar proyectos/cinco carpetas de PQT8_TALARA/F5. Si rebota, corregir la causa específica revelada por ruta y código y volver a probar. HMR de Vite sigue fallando y requiere análisis aparte si afecta el ciclo de edición.
ARCHIVOS MODIFICADOS: míos en esta unidad: `frontend-docs/src/main.jsx`, `frontend-docs/public/sw-campo.js`, `frontend-docs/src/utils/apiFetch.js`, `frontend-docs/src/utils/accesoLocal.js`, `frontend-docs/src/hooks/useUser.js`, `frontend-docs/src/LoginScreen.jsx`, `frontend-docs/pruebas/accesoLocal.prueba.mjs` y `docs/AI_WORKSTATE.md`. Cambios anteriores de configuración de 5174 y Docs→ACC preservados; todo frontend-react, LOB/4D, ortofoto, PDF y archivos de obra ajenos preservados.
TESTS EJECUTADOS:     `git status --short`, `git rev-parse HEAD`, `git log --oneline -10` y `git merge-base --is-ancestor cdf7837545747b3d39cd93ff070af30dd7aa7b9c HEAD` → baseline ancestro, HEAD `b03d0fb`; `npm test` en frontend-docs → 14 bancos verdes, `accesoLocal` 15 casos; ESLint focalizado → 0 errores; `node --check public/sw-campo.js` → OK; build Vite a directorio temporal → 467 módulos, OK; búsqueda en bundle final → no contiene `docs-auth-diag` (diagnóstico sólo DEV); `git diff --check` previo al último cambio → 0 errores. IAB: tras navegar con token Demo, el frontend lo invalidó y mostró login; consola registró los dos 401 descritos. Chrome real aún no repitió login.
TESTS PENDIENTES:     UAT de login real/proyectos/carpetas/F5 en Chrome, observación del estado del service worker allí y HMR; suite backend no repetida porque no se tocó backend.
FALLO CONOCIDO:       El rebote de la sesión real del propietario todavía no se reprodujo después de la instrumentación; no se puede concluir que tenga la misma causa que la sesión Demo. El WebSocket HMR de Vite sigue registrando fallo en los dos navegadores. El cambio de service worker previene caché de módulos Vite, pero la página de limpieza en IAB encontró 0 registro/0 caché en ese momento, así que no demuestra que el SW fuera la causa del rebote observado.
NEXT EXACT ACTION:    Cuando el propietario confirme que volvió a intentar login en Chrome 5174, leer sólo los mensajes `docs-auth-diag` de esa pestaña (status, ruta, código, sin token); en función de ellos corregir o, si no hay 401 y permanece dentro, retirar diagnóstico y verificar PQT8_TALARA/F5.
DO NOT TOUCH:         `.env*`, `D:/copias-ecd/**`, contraseñas, tokens, datos reales de Docs en escritura, Render, `dist-local` anterior, LOB/4D, ViewerFacade ni WIP ajeno; no commit, push ni deploy sin autorización explícita por acto.
COMMIT/HEAD REF:      `b03d0fb2e4be4013c460c746cb4415da9619e0f6` (sin commit propio; rama `main`).

[WIP HANDOFF]
TAREA:                Cerrar la prueba del login de Docs local conectado a Virginia y comprobar expediente y F5 con cuenta real.
IMPLEMENTADO:         El propietario confirmó que pudo ingresar en `localhost:5174`. Chrome mostró PQT8_TALARA con las cinco carpetas principales de su árbol y la ruta `01_WIP_Trabajo_En_Curso/Componente 11.2` con dos elementos («GENERALES» y «Reposicion de pavimentos»). Tras F5 se mantuvieron sesión, ruta y ambos elementos; una segunda recarga después de retirar los mensajes temporales repitió el resultado. En ese Chrome no aparecieron nuevos `401` de sesión. Quedan los cambios acotados para descartar `DEMO_TOKEN` antes del primer render sólo en modo Virginia y para evitar que el SW cache-first de producción se registre en Vite DEV. No se modificaron documentos ni datos reales.
PENDIENTE:            No hay trabajo funcional pendiente para este incidente local. Antes de cualquier release, separar el staging explícito de estos archivos respecto al WIP ajeno, comprobar un checkout reproducible y obtener autorización individual para commit, push y deploy; no se infiere de la confirmación de login. Si aparece un nuevo rebote con token real, reproducirlo con ruta/código antes de reabrir el diagnóstico.
ARCHIVOS MODIFICADOS: propios de este incidente y configuración previa: `frontend-docs/vite.config.js`, `frontend-docs/package.json`, `frontend-docs/src/LoginScreen.jsx`, `frontend-docs/src/utils/accesoLocal.js`, `frontend-docs/src/hooks/useUser.js`, `frontend-docs/src/App_Refactor.jsx`, `frontend-docs/src/main.jsx`, `frontend-docs/public/sw-campo.js`, `frontend-docs/pruebas/accesoLocal.prueba.mjs`, `frontend-docs/pruebas/origenDocsDev.prueba.mjs` y `docs/AI_WORKSTATE.md`. `frontend-docs/src/utils/apiFetch.js` quedó sin el diagnóstico temporal (sin cambio propio respecto al estado anterior de esa ruta). Ajenos preservados: demás entradas de `git status --short`, especialmente Docs→ACC, frontend-react, LOB/4D, ortofoto, PDF y archivos de obra.
TESTS EJECUTADOS:     UAT Chrome autenticado de `localhost:5174`: cinco carpetas principales visibles en PQT8_TALARA, dos elementos en `Componente 11.2`, F5 dos veces con sesión y contenido conservados, sin nuevos 401 en logs; `npm test` frontend-docs → 14 bancos verdes (`accesoLocal`: 15 casos); ESLint focalizado → 0 errores/0 warnings tras retirar directiva obsoleta del SW; `node --check public/sw-campo.js` → OK; build Vite a directorio temporal → 467 módulos, OK; `git diff --check` antes de este bloque → 0 errores.
TESTS PENDIENTES:     No se hizo prueba de escrituras en Virginia por estar fuera del alcance; tampoco se repitió suite backend completa ni se probó despliegue. HMR de Vite no se midió con una edición en caliente después de esta resolución.
FALLO CONOCIDO:       Ningún rebote en las dos recargas observadas de Chrome con cuenta real. El WebSocket HMR había fallado en pestañas anteriores, pero no se concluye su estado en la sesión nueva sin prueba específica. La suite backend general conserva fallos históricos consignados en handoffs anteriores; no se declara GREEN del repositorio completo.
NEXT EXACT ACTION:    Esperar el siguiente cambio funcional solicitado por el propietario; mantener el trabajo local sin staging general. Si pide publicación, revisar frontera de autoría y staging por archivo antes de cualquier commit, y pedir autorización nueva para push y deploy.
DO NOT TOUCH:         `.env*`, `D:/copias-ecd/**`, contraseñas, tokens, datos reales de Docs en escritura sin solicitud, Render, `dist-local` anterior, LOB/4D, ViewerFacade ni WIP ajeno; no `git add -A`, stash, push ni deploy por inferencia.
COMMIT/HEAD REF:      `b03d0fb2e4be4013c460c746cb4415da9619e0f6` (sin commit propio; rama `main`).

[WIP HANDOFF]
TAREA:                Cambiar a 98 % el umbral verde de «Colorear por avance» en frontend-react, manteniendo amarillo intermedio y rojo hasta 10 %.
IMPLEMENTADO:         En `AvancePorAgrupacion.jsx` el verde empieza en 98 %; 10 % sigue rojo y cualquier valor superior a 10 % e inferior a 98 % es amarillo. La leyenda y el comentario coinciden con la regla. No se cambió PREDICT, 4D, Inventory ni filtros.
PENDIENTE:            Validación visual del propietario en el navegador local con grupos reales; si pide commit, separar con cuidado este cambio del resto del componente untracked y del WIP ajeno antes de preparar staging explícito. No hay modificación funcional adicional solicitada.
ARCHIVOS MODIFICADOS: propios en esta unidad: tres líneas de `frontend-react/src/components/AvancePorAgrupacion.jsx` (archivo untracked con trabajo ajeno preexistente) y el registro en `docs/AI_WORKSTATE.md`. Ajenos preservados: todas las demás entradas de `git status --short`, incluido LOB/4D protegido.
TESTS EJECUTADOS:     `node frontend-react/pruebas/avanceAgrupacion.prueba.mjs` → 76/76; seis valores de borde y caso sin dato ejecutando la función real extraída del fuente → 7/7; `npx eslint src/components/AvancePorAgrupacion.jsx` → 0 errores; `npx vite build --outDir` a carpeta temporal → 532 módulos, OK. `npm run build` normal transformó 532 módulos, pero falló al vaciar `frontend-react/dist/assets` con EPERM.
TESTS PENDIENTES:     Verificación visual en el visor local con datos PREDICT reales y lectura de la leyenda; no se hizo prueba de despliegue porque no se autorizó publicar.
FALLO CONOCIDO:       El build normal no puede vaciar `dist/assets` por bloqueo/permisos en esta sesión; el build temporal finalizó correctamente. No se ha demostrado el comportamiento visual con un grupo real.
NEXT EXACT ACTION:    Abrir View local, activar «Avance» y «Colorear por avance», comprobar en un grupo de 97–98 % la transición amarillo/verde y la leyenda; conservar el resto del worktree intacto.
DO NOT TOUCH:         `.env*`, `D:/copias-ecd/**`, producción/Render, LOB4DExtension, ViewerLabelsBar, predictBim, ViewerFacade y demás WIP ajeno; no `git add -A`, stash, push ni deploy por inferencia.
COMMIT/HEAD REF:      `b03d0fb2e4be4013c460c746cb4415da9619e0f6` (sin commit propio; rama `main`).

[WIP HANDOFF]
TAREA:                Añadir un cuarto color para grupos entre 90 % y menos de 100 %, y reservar el verde para 100 % exacto.
IMPLEMENTADO:         «Colorear por avance» usa rojo 0–10 %, amarillo >10–<90 %, cian 90–<100 % y verde 100 %. La leyenda y el porcentaje del encabezado del grupo siguen esa escala; el rótulo de planta/perfil no redondea 99,5–99,999 % a «100 %». Valor ausente o fuera de 0–100 no se colorea. Las etapas/partidas conservan su criterio de estado independiente; PREDICT, 4D y filtros no se editaron.
PENDIENTE:            Comprobar visualmente en View local con grupos PREDICT reales, si están disponibles. Para un eventual commit, separar el cambio del resto del componente untracked preexistente y revisar el staging explícito; no publicar sin autorización individual.
ARCHIVOS MODIFICADOS: propios en esta unidad: `frontend-react/src/components/AvancePorAgrupacion.jsx` (archivo untracked con WIP ajeno preexistente) y `docs/AI_WORKSTATE.md`. Ajenos preservados: demás archivos modificados y untracked, especialmente LOB4D, ViewerLabelsBar, predictBim y ViewerFacade.
TESTS EJECUTADOS:     `node frontend-react/pruebas/avanceAgrupacion.prueba.mjs` → 76/76; 17 comprobaciones focalizadas ejecutando funciones reales extraídas del componente (umbrales, dato ausente/inválido, leyenda y rótulo) → 17/17; `npx eslint src/components/AvancePorAgrupacion.jsx` → 0 errores; `npx vite build --outDir` temporal → 532 módulos, OK.
TESTS PENDIENTES:     Verificación visual con datos reales en navegador local; no se repitió el build normal porque en la unidad previa falló al vaciar `dist/assets` con EPERM, mientras el build temporal sí pasó.
FALLO CONOCIDO:       `npm run build` normal encontró EPERM en `dist/assets` en la unidad previa; no es un error de compilación del componente. No se ha demostrado visualmente la escala nueva con un grupo real.
NEXT EXACT ACTION:    Abrir View local, activar «Avance» y «Colorear por avance», comprobar un grupo entre 90 y 99,99 % en cian y uno al 100 % en verde, y confirmar la leyenda; no tocar datos reales.
DO NOT TOUCH:         `.env*`, `D:/copias-ecd/**`, producción/Render, LOB4DExtension, ViewerLabelsBar, predictBim, ViewerFacade y demás WIP ajeno; no staging general, stash, push ni deploy por inferencia.
COMMIT/HEAD REF:      `b03d0fb2e4be4013c460c746cb4415da9619e0f6` (sin commit propio; rama `main`).

[WIP HANDOFF]
TAREA:                Probar la vinculación Docs→ACC desde el mismo checkout local, sin otro proyecto ni modificación de Virginia.
IMPLEMENTADO:         `DocumentViewer` y `AccLinkPicker` consultan los endpoints ACC con `apiJson`, y `apiJson` informa status y HTML inesperado sin mostrar el cuerpo HTML al usuario. Nuevo banco `accLinkRespuesta.prueba.mjs` verifica JSON 200, error JSON 404, HTML 404/200 y que lector/selector usen el parser. Backend local en puerto 3000 responde a `/api/health` y devuelve JSON 401 en la ruta ACC sin sesión; no se cambió el 5174, que continúa apuntando al backend Virginia. El commit vivo 802ff0de5393 no incluye las rutas ACC locales, por lo que la captura de error en 5174 no se soluciona aún sólo con el parser.
PENDIENTE:            Prueba visual completa de selección y vínculo en el mismo 5174 apuntando temporalmente al backend local, con documento de ensayo ya existente o fixture sólo local; requiere acordar el cambio temporal porque interrumpe la sesión actual de Docs real. Verificar que el backend local tenga documento/permiso ACC apto sin leer ni copiar secretos. Después restaurar 5174 exactamente como estaba. No hay autorización de commit/push/deploy.
ARCHIVOS MODIFICADOS: propios en esta unidad: `frontend-docs/src/components/DocumentViewer.jsx` (hunks focalizados sobre cambios ajenos), `frontend-docs/src/components/AccLinkPicker.jsx` (untracked preexistente), `frontend-docs/src/utils/apiFetch.js`, `frontend-docs/pruebas/accLinkRespuesta.prueba.mjs` (nuevo) y `docs/AI_WORKSTATE.md`. Ajenos preservados: demás entradas de `git status --short`.
TESTS EJECUTADOS:     `python -m pytest -q backend/tests/test_docs_acc_link.py` → 6/6; `npm test` frontend-docs → 15 bancos verdes; `node pruebas/accLinkRespuesta.prueba.mjs` → 5/5 sin red; `npx eslint` sobre AccLinkPicker, apiFetch y banco nuevo → 0 errores; `npx eslint DocumentViewer.jsx --rule react-hooks/rules-of-hooks: off` → 0 errores restantes; `npx vite build --outDir` temporal → 467 módulos, OK. GET de sólo lectura a backend local puerto 3000 → health 200 y ruta ACC 401 JSON sin token; GET /api/health por 5174 → backend Virginia 802ff0de5393.
TESTS PENDIENTES:     Navegador + documento real en DB local + ACC; no se probó porque 5174 está conectado a Virginia y no se autorizó interrumpirlo. Lint completo de DocumentViewer falla en `useState` condicional preexistente en línea 306. `npm run build` normal falló en `dist/assets` por EPERM; build temporal sí pasó.
FALLO CONOCIDO:       La funcionalidad ACC sigue indisponible en el 5174 actual porque el backend Virginia no tiene las rutas locales. La prueba SQL desde el shell no conectó: ese proceso no tiene variables DB y cayó al puerto 5432; no se leyó `.env*` ni se intentó extraer credenciales. El parser mejora el diagnóstico pero no instala las rutas. Ningún E2E real está demostrado.
NEXT EXACT ACTION:    Confirmar con el propietario si se puede interrumpir temporalmente su sesión del mismo 5174 para ejecutar `dev:ensayo` contra backend local 3000; comprobar primero que la base local contiene un documento CAD de ensayo y permisos ACC, probar el flujo sólo allí y restaurar el modo anterior. No usar el documento real de Virginia como si fuera una prueba local.
DO NOT TOUCH:         `.env*`, `D:/copias-ecd/**`, contraseñas/tokens, datos de Virginia en escritura, otra carpeta/puerto local, Render, LOB4D, ViewerLabelsBar, predictBim, ViewerFacade, demás WIP ajeno; no staging general, stash, push ni deploy por inferencia.
COMMIT/HEAD REF:      `b03d0fb2e4be4013c460c746cb4415da9619e0f6` (sin commit propio; rama `main`).

[WIP HANDOFF]
TAREA:                Aclarar y verificar que la integración Docs→ACC se ensaye primero sólo en la laptop.
IMPLEMENTADO:         Se comprobó que `localhost:5174` está activo y que su proxy API devuelve versión Virginia `802ff0de5393`; el backend local `127.0.0.1:3000` también está activo. Se repitieron las pruebas automatizadas localmente sin escribir datos. No se cambió el servidor 5174 ni se creó otra instancia, copia o proyecto.
PENDIENTE:            Prueba manual del flujo ACC en navegador con backend y datos locales; si no existe documento CAD local adecuado, distinguir explícitamente la limitación y no presentarla como prueba con `ALINEAMIENTOS.dwg` real. No preparar publicación hasta cerrar ese ensayo y obtener autorización por acto.
ARCHIVOS MODIFICADOS: propio en esta unidad: `docs/AI_WORKSTATE.md` (estado y este handoff). No se tocó código; todo el WIP previo y ajeno permanece intacto.
TESTS EJECUTADOS:     `python -m pytest -q backend/tests/test_docs_acc_link.py` → 6/6, dos warnings de dependencias; `npm test` en `frontend-docs` → 15 bancos verdes. `GET /api/health` de 5174 → 200, versión `802ff0de5393`; de 3000 → 200, versión `desconocida`. `git merge-base --is-ancestor cdf7837545747b3d39cd93ff070af30dd7aa7b9c HEAD` → salida 0; HEAD `b03d0fb2e4be4013c460c746cb4415da9619e0f6`, rama `main`.
TESTS PENDIENTES:     Navegador contra backend y base locales con documento de ensayo; no ejecutado porque el 5174 activo sigue conectado a Virginia y cambiar el proceso interrumpiría la sesión del propietario. Tampoco se ha probado persistencia tras F5 con ACC real en entorno local.
FALLO CONOCIDO:       El selector ACC del 5174 actual no puede completarse: la ruta nueva no está en la versión Virginia a la que apunta; las pruebas verdes usan mocks, no el DWG real.
NEXT EXACT ACTION:    Preguntar si se puede interrumpir temporalmente el 5174 actual; si acepta, verificar primero existencia de documento CAD en la base local sin leer secretos, ejecutar el mismo frontend en modo `dev:ensayo`, probar el recorrido local y restaurar la conexión anterior.
DO NOT TOUCH:         `.env*`, `D:/copias-ecd/**`, contraseñas/tokens, datos de Virginia en escritura, Render, otro checkout/puerto local, LOB/4D, ViewerFacade y demás WIP ajeno; no staging, push ni despliegue por inferencia.
COMMIT/HEAD REF:      `b03d0fb2e4be4013c460c746cb4415da9619e0f6` (sin commit propio; rama `main`).

[WIP HANDOFF]
TAREA:                Preverificar el ensayo Docs→ACC local autorizado y devolver 5174 a su estado anterior.
IMPLEMENTADO:         Antes de alterar 5174 se comprobó que el backend local 3000 tiene la ruta ACC (GET con UUID inexistente → JSON 404 «Plano no encontrado»), pero `/api/docs/list` con sesión `DEMO_TOKEN` devuelve 500 por intentar unir `demo` con `folder_permissions.user_id integer`. Se identificó la causa concreta: `file_system_db.list_contents` llamaba a `es_admin_de_obra(cursor, ...)` antes de asignar `cursor`, caía silenciosamente a no-admin y ejecutaba la consulta equivocada. Se movió sólo esa comprobación dentro del bloque con cursor y se añadieron dos pruebas para admin demo y usuario común. El proceso 3000 aún ejecuta el código anterior; no se reinició. No se cambió ni reinició 5174, cuyo `vite.config.js` conserva hash SHA-256 `0D326D0EF884A00CC7947EB7DB1B218D27846D6E0C03BB33910AFAA6EB36E388` y `/api/health` sigue en Virginia `802ff0de5393`. No hubo escrituras en Virginia, Git remoto ni Render.
PENDIENTE:            Reiniciar controladamente sólo el backend local 3000 cuando se pueda preservar el proceso/terminal del propietario, comprobar que `/api/docs/list` ya no devuelve 500 y enumerar si alguno de los diez archivos de ensayo locales es CAD adecuado; sólo entonces considerar el cambio temporal del mismo 5174. Si no hay CAD local apto, no simular que se probó el archivo real; los tests con mocks quedan como evidencia limitada. Resolver por separado los dos fallos generales de suite antes de declarar GREEN del repositorio; no elevar umbrales por conveniencia.
ARCHIVOS MODIFICADOS: propios de esta unidad: `backend/file_system_db.py`, `backend/tests/test_docs_local_list_admin.py` (nuevo), `docs/AI_WORKSTATE.md`. Ajenos y WIP anterior preservados; `frontend-docs/vite.config.js` y `frontend-docs/package.json` no se editaron en esta unidad.
TESTS EJECUTADOS:     `python -m pytest -q backend/tests/test_docs_local_list_admin.py backend/tests/test_docs_acc_link.py` → 8/8; `python -m pytest -q` → 2080 pasaron, 2 fallaron; `python -m py_compile` de los dos Python tocados → OK; `git diff --check -- backend/file_system_db.py` → sin errores (sólo aviso de LF/CRLF); `GET /api/health` 5174 → 200/`802ff0de5393`; hash Vite antes/después idéntico. Los 2 fallos de suite son `test_toda_capacidad_de_administrador_tiene_puerta` por `/api/docs/miniaturas/preparar` sin pantalla y `test_el_recorte_es_real` por 287 rutas portal frente a techo `<286`; no se cambiaron sus criterios.
TESTS PENDIENTES:     HTTP local 3000 después de reiniciar backend con el código corregido; inventario CAD de la base local; selección/vínculo/F5/retirada en navegador local. No se hizo porque la comprobación previa falló y no se quiso interrumpir 5174 ni el backend del propietario con un ensayo inviable.
FALLO CONOCIDO:       El backend 3000 en ejecución aún devuelve 500 en `/api/docs/list` para demo; el fix sólo está en disco. La base local previamente censada tiene 10 archivos de ensayo y 0 filas `file_versions`, no el expediente real. No hay E2E Docs→ACC real demostrado.
NEXT EXACT ACTION:    Acordar el reinicio controlado del backend local 3000 (sin tocar 5174), verificar que el listado demo funcione con el fix y si hay un CAD local apto; si no lo hay, detener el ensayo de navegador y reportar la limitación sin cambiar 5174.
DO NOT TOUCH:         `.env*`, `D:/copias-ecd/**`, contraseñas/tokens, datos de Virginia en escritura, Render, servidor/configuración 5174 hasta pasar el precheck, LOB/4D, ViewerFacade, demás WIP ajeno; no staging general, stash, push ni deploy por inferencia.
COMMIT/HEAD REF:      `b03d0fb2e4be4013c460c746cb4415da9619e0f6` (sin commit propio; rama `main`).

[WIP HANDOFF]
TAREA:                Reiniciar y comprobar el backend local para la prueba Docs→ACC, conservando 5174 como estaba.
IMPLEMENTADO:         Con autorización explícita del propietario, se verificó que los PIDs 28984/17900 correspondían a `server.py`, se detuvo ese proceso local y se lanzó `D:/VISOR_APS_TL/.venv/Scripts/python.exe server.py` oculto desde `backend/`. El listener nuevo del puerto 3000 es PID 28584 y `/api/health` responde 200. Con `DEMO_TOKEN`, `/api/docs/list?model_urn=proyectos/PQT8_TALARA` pasó de 500 a 200 tras cargar el fix. Se recorrieron por API los cuatro proyectos locales: «obra pirata», «PQT8_INTERFERENCIAS» y «PQT8_TALARA» muestran 0 archivos; «PQT8 Talara (PRUEBAS)» muestra 4 carpetas y 10 archivos, ninguno `.dwg`/`.dxf`. Por ello no se cambió 5174: sigue PID 21540, proxy Virginia `802ff0de5393` y hash de `vite.config.js` `0D326D0EF884A00CC7947EB7DB1B218D27846D6E0C03BB33910AFAA6EB36E388`, idéntico al previo. No hubo escritura en Virginia ni publicación.
PENDIENTE:            Para el E2E local, disponer de un documento CAD de ensayo en la base local sin copiar el proyecto entero: acordar explícitamente si se puede usar un DWG pequeño del propietario o una ficha sintética claramente etiquetada; luego comprobar selector ACC, vínculo persistente, F5 y retirada en el mismo 5174 temporalmente conectado al backend 3000, y restaurar su proxy. Si el propietario mantiene la condición de no crear ningún documento de ensayo, reconocer que el E2E real no es posible con los datos locales actuales y conservar sólo las pruebas automatizadas con mocks. Los dos fallos de suite completa siguen abiertos por separado.
ARCHIVOS MODIFICADOS: propios de esta unidad y anterior: `backend/file_system_db.py`, `backend/tests/test_docs_local_list_admin.py` (nuevo), `docs/AI_WORKSTATE.md`. `frontend-docs/vite.config.js` preexistía modificado pero no se editó ahora; el resto del WIP ajeno se conservó.
TESTS EJECUTADOS:     `python -m pytest -q backend/tests/test_docs_local_list_admin.py backend/tests/test_docs_acc_link.py` → 8/8; suite `python -m pytest -q` → 2080 aprobadas, 2 fallos (`test_toda_capacidad_de_administrador_tiene_puerta` por `/api/docs/miniaturas/preparar`; `test_el_recorte_es_real` por 287 rutas portal frente al techo `<286`); Python compile y `git diff --check` focalizados → OK. HTTP local tras reinicio: health 200, Docs list demo 200, cuatro proyectos explorados y 0 CAD. HTTP 5174 tras reinicio local: health 200, versión Virginia `802ff0de5393`; PID y hash Vite intactos.
TESTS PENDIENTES:     Prueba navegador Docs→ACC con CAD de ensayo local, no ejecutada porque la base local carece de CAD. No se probó el archivo real `ALINEAMIENTOS.dwg`: su registro pertenece a Virginia. No se repitió `npm test` tras el reinicio porque no hubo nuevo cambio frontend en esta unidad (15 bancos habían pasado previamente).
FALLO CONOCIDO:       El vínculo ACC no puede ensayarse de punta a punta con los datos locales actuales; los tests de la ruta usan un nodo y APS simulados. El backend 3000 ahora se ejecuta en un proceso oculto lanzado por Codex, no en la terminal previa de VS Code. La suite total no está verde (2 fallos indicados).
NEXT EXACT ACTION:    Solicitar al propietario una decisión sobre un único CAD de ensayo en la base local (archivo pequeño suyo o ficha sintética, nunca copia de proyecto); sólo si lo acepta, preparar ese dato local y cambiar temporalmente el mismo 5174 para ejecutar el E2E, verificando después PID/health/hash de la restauración.
DO NOT TOUCH:         `.env*`, `D:/copias-ecd/**`, contraseñas/tokens, datos de Virginia en escritura, Render, 5174 mientras no haya CAD local apto, LOB/4D, ViewerFacade, demás WIP ajeno; no staging general, stash, push ni deploy por inferencia.
COMMIT/HEAD REF:      `b03d0fb2e4be4013c460c746cb4415da9619e0f6` (sin commit propio; rama `main`).

[WIP HANDOFF]
TAREA:                Ensayar Docs→ACC en el mismo 5174 con `ALINEAMIENTOS.dwg` ya existente en ambas plataformas, sin publicar ni escribir en Virginia.
IMPLEMENTADO:         Modo opt-in `?acc_preview=1` sólo de Vite DEV; `AccLinkPicker` enumera ACC mediante GET existentes en View, construye el URN de la versión elegida y guarda el ensayo sólo en sessionStorage de la pestaña. `DocumentViewer` abre ese URN directo y evita lanzar traducción mientras el modo de ensayo está activo y no hay vista elegida. F5 debe recuperar la elección de la misma versión/bytes. `?acc_preview=0` desactiva el modo tras recargar. Sin opt-in, las rutas persistentes y el comportamiento existente se conservan. 5174 no se reinició ni se reconfiguró, y su proxy sigue en Virginia `802ff0de5393`.
PENDIENTE:            Vinculación persistente visible para otros navegadores/usuarios: revisar en local el backend y frontend WIP, sus permisos y la frontera de autoría. El propietario indicará por separado si y cuándo hacer commit, push o despliegue; no confundir el ensayo de una pestaña con una función publicada.
ARCHIVOS MODIFICADOS: propios de esta unidad: `frontend-docs/src/utils/accPreviewLocal.js` (nuevo), `frontend-docs/pruebas/accPreviewLocal.prueba.mjs` (nuevo), `frontend-docs/pruebas/accLinkLector.prueba.mjs` (nuevo), `backend/tests/test_docs_acc_link.py` (un caso nuevo sobre WIP untracked), hunks focalizados en `frontend-docs/src/components/AccLinkPicker.jsx` (WIP untracked preexistente), `frontend-docs/src/components/DocumentViewer.jsx` (WIP modificado preexistente) y `docs/AI_WORKSTATE.md`. Ajenos preservados: todo el resto del worktree sucio, incluidos 4D/LOB y ViewerFacade; `frontend-docs/vite.config.js` no se editó.
TESTS EJECUTADOS:     `npm test` en frontend-docs → 17/17 bancos verdes (antes 16/16); banco de preview → 7 casos; banco nuevo del lector → contrato de lectura sin selector; `python -m pytest -q backend/tests/test_docs_acc_link.py` → 7/7, incluido GET del lector no-admin sin explorar ACC; lint focalizado de la implementación y el banco nuevo → 0 errores; `npx vite build --outDir` temporal antes del nuevo banco → 468 módulos, OK; `git diff --check` focalizado → 0 errores; GET local `/src/utils/accPreviewLocal.js` → HTTP 200 y GET `http://localhost:5174/api/health` → versión Virginia `802ff0de5393`; hash de `vite.config.js` permanece `0D326D0EF884A00CC7947EB7DB1B218D27846D6E0C03BB33910AFAA6EB36E388`. UAT real: el dueño eligió `ALINEAMIENTOS.dwg` ACC V1 y mostró la vista 2D; al recargar esa misma pestaña local, se observaron otra vez «Prueba local · V1», «2D View · Espacio modelo» y las líneas verdes del dibujo.
TESTS PENDIENTES:     Prueba persistente entre navegadores tras publicación autorizada; imposible con el backend Virginia actual porque carece de `acc-link`. No se repitió suite backend general en esta unidad; la ejecución previa tuvo 2080 aprobados y 2 fallos declarados.
FALLO CONOCIDO:       Sin el modo de ensayo, la ruta `acc-link` aún no existe en el backend Virginia y el vínculo persistente sigue indisponible en 5174. El ensayo local sí abrió el DWG real y sobrevivió a F5 en la misma pestaña, pero no se refleja a otros usuarios. La suite backend general conserva dos fallos ajenos documentados.
NEXT EXACT ACTION:    Revisar en local los hunks Docs→ACC WIP y los permisos del flujo persistente, sin staging, commit, push ni despliegue; el propietario decidirá cuándo autorizar cada acto de Git o Render.
DO NOT TOUCH:         `.env*`, `D:/copias-ecd/**`, credenciales, datos de Virginia en escritura, Render, config/proceso de 5174, LOB/4D, ViewerFacade y WIP ajeno; no staging general, stash, push ni deploy por inferencia.
COMMIT/HEAD REF:      `b03d0fb2e4be4013c460c746cb4415da9619e0f6` (sin commit propio; rama `main`).

[WIP HANDOFF]
TAREA:                Implementar localmente un puente temporal, opt-in por carpeta, de ALEPHIA Docs a ACC para CAD nuevos mientras la cuota de traducción normal está agotada.
IMPLEMENTADO:         Cortacircuito global apagado por defecto; mapeo exacto de carpeta sólo para admin; trabajo por versión registrado atómicamente con el alta del archivo; rutas de subida por trozos, directa y confirmada conectadas a la bifurcación; la ruta normal permanece intacta sin opt-in. Copia en hilo desde GCS a almacenamiento ACC mediante S3 firmado y creación de item/versión, sin `POST /job`; consulta de manifiesto y enlace del visor sólo tras éxito. UI de administración y estado/reintento seguro en Docs; menú DEV oculto salvo `?acc_bridge=1`. No se activó ni utilizó con datos reales.
PENDIENTE:            Revisar con el propietario un CAD pequeño y una carpeta de ensayo para una única prueba integral; requiere autorización individual para crear un archivo/versión en ACC y disponer de backend local con el documento correspondiente. Verificar resultados y restaurar todo interruptor/configuración de ensayo. Antes de cualquier publicación resolver o aceptar explícitamente los dos fallos de suite general y separar el WIP ajeno del staging. No hacer commit, push ni deploy hasta orden expresa.
ARCHIVOS MODIFICADOS: propios de este puente: `backend/acc_emergency_bridge.py`, `backend/tests/test_acc_emergency_bridge.py`, `backend/file_system_db.py` (hunk focalizado sobre WIP), `backend/routes/docs_cad.py` (sobre integración WIP), `backend/routes/documents.py`, `backend/routes/uploads.py`, `frontend-docs/src/components/AccFolderBridge.jsx`, `frontend-docs/pruebas/accBridgeTemporal.prueba.mjs`, `frontend-docs/src/components/ContextMenu.jsx`, `frontend-docs/src/components/DocumentViewer.jsx` (sobre WIP), `frontend-docs/src/pages/FilesPage.jsx` (sobre WIP) y `docs/AI_WORKSTATE.md`. Artefacto de build propio `.build-acc-bridge-check/` permanece untracked. Todos los demás cambios de `git status --short` son WIP previo o ajeno, preservados.
TESTS EJECUTADOS:     `python -m pytest -q backend/tests/test_acc_emergency_bridge.py backend/tests/test_docs_acc_link.py backend/tests/test_docs_local_list_admin.py` → 20/20; tras restaurar la llamada directa normal, `python -m pytest -q backend/tests/test_acc_emergency_bridge.py backend/tests/test_cola_de_traduccion.py backend/tests/test_vistas_de_autocad.py` → 42/42. `python -m pytest -q` final → 2092 aprobadas, 2 fallos conocidos, 2 warnings en 106,16 s; una corrida intermedia detectó dos regresiones de contrato estático de subida, se corrigieron y ya no aparecen. `npm test` en frontend-docs → 18 bancos verdes; `npx vite build --outDir ../.build-acc-bridge-check` → 469 módulos, OK; `python -m py_compile` de Python tocados → OK; `npx eslint src/components/AccFolderBridge.jsx` → 0 errores; `git diff --check` focalizado → sin errores, avisos habituales de LF/CRLF. No se cambiaron umbrales para ocultar fallos.
TESTS PENDIENTES:     E2E con subida real a ACC y manifiesto preparado, no ejecutado porque implica escritura remota no autorizada y el 5174 actual apunta al backend Virginia sin estas rutas. Lint integral no es puerta verde hoy; en ficheros JSX preexistentes muestra errores anteriores a este puente.
FALLO CONOCIDO:       Un archivo de igual nombre ya existente en ACC sin vínculo persistente previo no se adopta ni sobrescribe automáticamente; necesita vinculación explícita. Un resultado incierto tras `POST items/versions` bloquea reintento automático para evitar duplicados. La suite backend completa conserva `test_toda_capacidad_de_administrador_tiene_puerta` (`/api/docs/miniaturas/preparar`) y `test_el_recorte_es_real` (techo de rutas portal `<286`, antes 287 y ahora 289 por estas dos rutas). El 5174 actual no puede usar aún este backend nuevo; no se simuló que sí. La salida `.build-acc-bridge-check/` no se pudo retirar con el comando PowerShell permitido y queda intacta.
NEXT EXACT ACTION:    Acordar con el propietario si autoriza un solo ensayo de escritura ACC con un CAD pequeño y carpeta específica, y sólo entonces preparar un documento de ensayo en el backend local sin reconfigurar el 5174 actual por sorpresa; mantener apagado `ACC_EMERGENCY_BRIDGE_ENABLED` hasta ese ensayo.
DO NOT TOUCH:         `.env*`, `D:/copias-ecd/**`, contraseñas/tokens, datos Virginia en escritura, 5174/config/proceso sin permiso, Render, LOB/4D, ViewerFacade y WIP ajeno. No staging general, stash, commit, push ni deploy por inferencia.
COMMIT/HEAD REF:      `b03d0fb2e4be4013c460c746cb4415da9619e0f6` (sin commit propio; rama `main`).

[WIP HANDOFF]
TAREA:                Preparar la prueba del puente temporal con selección de carpeta ACC por el propio administrador y el DWG indicado por el propietario.
IMPLEMENTADO:         Se verificó en el código local que una carpeta ALEPHIA muestra «Puente temporal ACC» sólo al administrador de la instancia y abre un selector navegable de centros, proyectos y carpetas ACC; la elección no está fijada en código. Se verificó por lectura que `C:/Users/ASUS/Downloads/TRAZO_REPLANTEO_DRENAJE_URBANO (1).dwg` existe, mide 13.978.195 bytes (13,98 MB) y comienza con cabecera DWG `AC1032`; SHA-256 `3C9DDA6716B3A5458394114994B0C049056C6F0FFD7347BAD2E8DEB04AA0F1A3`. No se leyó el contenido más allá de su cabecera ni se subió.
PENDIENTE:            Mostrar/probar el selector con el mismo frontend local usando un backend local que tenga la ruta nueva, sin interrumpir 5174 por sorpresa; el propietario elegirá en la UI la carpeta ALEPHIA y la carpeta ACC `ARCHIVOS_AYUDA_VALO`. Confirmar aparte la autorización exacta de una subida de ensayo: escribiría el DWG en almacenamiento ALEPHIA y crearía un item/versión en ACC; la base local de ensayo no contiene hoy el expediente real. Luego verificar que ACC prepare la vista, desactivar el puente y restaurar la configuración local. No publicar ni hacer Git sin orden expresa.
ARCHIVOS MODIFICADOS: propio de esta unidad: sólo `docs/AI_WORKSTATE.md`. El puente y demás WIP previo listados en el handoff anterior no se editaron; resto del worktree ajeno/protegido preservado.
TESTS EJECUTADOS:     `node frontend-docs/pruebas/accBridgeTemporal.prueba.mjs` → 1 banco verde; `Get-Item` del DWG → 13.978.195 bytes; `Format-Hex` → `AC1032`; `Get-FileHash -Algorithm SHA256` → hash indicado; `GET http://localhost:5174/api/health` → versión Virginia `802ff0de5393`; `GET http://127.0.0.1:3000/api/health` → backend local versión `desconocida`; `git merge-base --is-ancestor cdf7837545747b3d39cd93ff070af30dd7aa7b9c HEAD` → 0; HEAD sin cambio.
TESTS PENDIENTES:     UAT visual del selector en backend local y E2E de subida/derivado ACC; no se hicieron porque el 5174 actual sigue con el backend publicado y las escrituras remotas requieren autorización específica.
FALLO CONOCIDO:       La opción del puente está oculta en Vite DEV salvo `?acc_bridge=1` y, aunque se mostrara, el backend Virginia detrás de 5174 aún no tiene la ruta de configuración; el código local no equivale a función operativa en esa pestaña. La suite backend completa conserva los dos fallos declarados en el handoff anterior.
NEXT EXACT ACTION:    Acordar con el propietario una prueba visual temporal del selector en el mismo 5174 con backend local y restauración posterior; antes de subir el DWG, confirmar explícitamente qué carpeta ALEPHIA elegirá y que autoriza esa escritura en ALEPHIA y ACC.
DO NOT TOUCH:         `.env*`, `D:/copias-ecd/**`, contraseñas/tokens, datos Virginia en escritura, 5174/config/proceso sin acuerdo previo, Render, LOB/4D, ViewerFacade y WIP ajeno. No staging general, stash, commit, push ni deploy por inferencia.
COMMIT/HEAD REF:      `b03d0fb2e4be4013c460c746cb4415da9619e0f6` (sin commit propio; rama `main`).

[WIP HANDOFF]
TAREA:                Probar visualmente el selector admin del puente temporal en el mismo 5174 y devolverlo exactamente al modo anterior.
IMPLEMENTADO:         Se reinició únicamente el backend local 3000 (PID anterior 28584, nuevo 12840) para cargar la ruta nueva; GET del puente pasó de HTML 404 a JSON 404 controlado. Se cambió temporalmente Vite 5174 del proceso normal PID 21540 a `--mode ensayo` PID 4504; health pasó de Virginia `802ff0de5393` a local `desconocida`. En `PQT8 TALARA (PRUEBAS)`, con cuenta demo admin y `?acc_bridge=1`, se abrió el menú de `01_Gestion_de_Proyecto`, apareció «Puente temporal ACC» y el selector enumeró el hub, proyecto Talara, Project Files y `ARCHIVOS_AYUDA_VALO`. Se seleccionó esa carpeta sólo en pantalla. No se pulsó guardar, no se configuró puente, no se subió archivo; GET posterior confirmó `bridge=null` y `service_enabled=false`. Se detuvo PID 4504, se arrancó Vite normal PID 15256, health 5174 volvió a Virginia `802ff0de5393`, hash de `vite.config.js` idéntico `0D326D0EF884A00CC7947EB7DB1B218D27846D6E0C03BB33910AFAA6EB36E388`. Pestaña temporal Chrome cerrada; pestaña interna original restaurada a su URL. Tras la propuesta posterior del propietario se creó por API sólo la carpeta local `ENSAYO_PUENTE_ACC_20260927` en el proyecto local preexistente `p_talara_pruebas`; GET de lista confirmó su UUID y GET de puente confirmó que no hay vínculo y el servicio sigue apagado. No se creó un proyecto adicional ni se escribió en GCS o ACC.
PENDIENTE:            El propietario identificó como carpeta origen ALEPHIA real `Archivos de proyecto / 05_Gestion_Administrativo / 03_Valorizaciones / ARCHIVOS_APOYO` y destino ACC `PQT8 - DRENAJE PLUVIAL TALARA / Project Files / ARCHIVOS_AYUDA_VALO`; informa haber borrado el DWG previo de ambos sistemas para la prueba, pero esa eliminación no se ha verificado y ninguna carpeta se vinculó. El flujo pedido es subir `TRAZO_REPLANTEO_DRENAJE_URBANO (1).dwg` en esa misma carpeta ALEPHIA y que el puente lo copie/previsualice en ACC, no usar el proyecto local `PQT8 TALARA (PRUEBAS)`. La propuesta anterior de ensayar allí no cumple el requisito y se descarta. La base local 3000 no contiene `ARCHIVOS_APOYO`, mientras el 5174 normal usa Virginia, cuyo backend no incorpora las rutas nuevas. Resolver esa frontera de código/datos sin tocar producción ni crear proyectos; después probar el flujo real sólo con autorización expresa de las escrituras correspondientes, verificar manifest/vista ACC y apagar el puente. No hacer commit/push/deploy ni escribir Virginia sin orden por acto.
ARCHIVOS MODIFICADOS: propios de esta unidad: sólo `docs/AI_WORKSTATE.md`; procesos locales 3000 y 5174 reiniciados como se indica. Código del puente y todo el resto del worktree WIP/ajeno preservados sin edición.
TESTS EJECUTADOS:     HTTP local GET `/api/docs/cad/acc-bridge/folder` antes→HTML 404, después→JSON 404 de carpeta inexistente; health 5174 Virginia→local→Virginia con versiones indicadas; navegador local mostró botón y ruta ACC completa; GET de configuración después de seleccionar → `success=true`, `bridge=null`, `service_enabled=false`; SHA-256 de Vite config antes/después idéntico. En el seguimiento, health 3000 → 200 versión `desconocida`, health 5174 → 200 versión Virginia `802ff0de5393`; `python -m pytest -q backend/tests/test_acc_emergency_bridge.py backend/tests/test_docs_acc_link.py backend/tests/test_docs_local_list_admin.py` → 20/20, 2 warnings. Revisión posterior de la protección del traductor habitual: `python -m pytest -q backend/tests/test_acc_emergency_bridge.py backend/tests/test_cola_de_traduccion.py backend/tests/test_vistas_de_autocad.py` → 42/42, 2 warnings; el banco del puente incluye cortacircuito apagado, carpeta exacta, despacho normal y desactivación de carpeta. `npm test` en `frontend-docs` → 18/18 bancos verdes. Nueva ejecución completa `python -m pytest -q` → 2092 aprobadas, 2 fallos, 2 warnings en 106,39 s: ruta admin `/api/docs/miniaturas/preparar` sin puerta cliente y perfil portal 289 rutas ante `TECHO=286`. Dos rutas `/api/docs/cad/acc-bridge/*` son del puente; el conteo previo ya era 287. No se modificó ningún umbral. Baseline `cdf7837545747b3d39cd93ff070af30dd7aa7b9c` ancestro de HEAD (salida 0), rama `main`, HEAD sin cambio.
TESTS PENDIENTES:     E2E de subida/derivado ACC y apertura en Docs; no se hicieron porque exigirían escrituras remotas aún no autorizadas. UAT de login en la pestaña interna restaurada requiere autenticación personal del propietario; la pestaña Chrome que él tenía abierta seguía mostrando el proyecto real.
FALLO CONOCIDO:       El 5174 normal sigue apuntando a Virginia, que aún no incluye el backend del puente. La pestaña interna usada para demo local mostró el login al regresar a Virginia; no se recuperaron ni manipularon tokens/credenciales. La suite backend completa conserva dos fallos declarados antes.
NEXT EXACT ACTION:    Carpeta local creada: `ENSAYO_PUENTE_ACC_20260927` (`c38cef7e-0a9d-424a-91b9-70620ce1b922`) en `p_talara_pruebas`; GET confirmó `bridge=null`, `service_enabled=false`. Antes de cualquier DWG, verificar con el propietario, sin leer ni exponer valores de `.env*`, si `GCS_BUCKET_NAME` del backend 3000 designa almacenamiento de ensayo o el real; luego solicitar autorización específica para una escritura en ese bucket y en ACC `ARCHIVOS_AYUDA_VALO`. Sólo después cambiar temporalmente el mismo 5174 a backend local, configurar la pareja, subir una vez y restaurar. No tocar `ARCHIVOS_APOYO` real, Git ni Render.
DO NOT TOUCH:         `.env*`, `D:/copias-ecd/**`, credenciales, datos Virginia en escritura, Render, Vite 5174 sin nuevo acuerdo, LOB/4D, ViewerFacade, WIP ajeno. No staging general, stash, commit, push ni deploy por inferencia.
COMMIT/HEAD REF:      `b03d0fb2e4be4013c460c746cb4415da9619e0f6` (sin commit propio; rama `main`).

[WIP HANDOFF]
TAREA:                Probar una sola subida Docs local→ACC desde una carpeta de ensayo sin alterar Virginia, el traductor habitual ni 5174.
IMPLEMENTADO:         Con autorización expresa para una única subida se verificó el DWG local (13.978.195 bytes y SHA-256 `3C9DDA6716B3A5458394114994B0C049056C6F0FFD7347BAD2E8DEB04AA0F1A3`), la carpeta local `ENSAYO_PUENTE_ACC_20260927` (`c38cef7e-0a9d-424a-91b9-70620ce1b922`, proyecto `p_talara_pruebas`) y, mediante GET ACC, el destino exacto `ARCHIVOS_AYUDA_VALO` (`urn:adsk.wipprod:fs.folder:co.zQHdM5xjTZ-WKWM6yRB7Vg`) en `PQT8 - DRENAJE PLUVIAL TALARA`; la lista ACC mostró 0 items cuyo nombre contiene `TRAZO_REPLANTEO` y no había paginación. Se guardó la pareja sólo en la base local mientras el cortacircuito global estaba apagado. Se inició temporalmente un segundo backend local en 3001 con el interruptor activado y se comprobó el endpoint de configuración. La ruta de URL firmada falló 500; la ruta real de subida por trozos `/api/uploads/init` falló 500 antes de crear sesión por falta del archivo de credenciales Google configurado (`./SIN-CREDENCIAL-GOOGLE-EN-LOCAL.json`). No se transfirió byte alguno a GCS ni ACC. Se detuvo el proceso de 3001 y se desactivó la pareja de carpetas local: GET/PUT final `folderEnabled=false`, `serviceEnabled=false`; 3000 sigue OK y 5174 sigue apuntando a Virginia versión `802ff0de5393`. No se reinició 5174 ni se tocó el proyecto real.
PENDIENTE:            Para reintentar la única subida local, el propietario debe autenticar personalmente Google Cloud Application Default Credentials con la CLI oficial ya instalada, sin comunicar contraseñas, tokens ni claves al agente; luego comprobar por API que el backend temporal puede crear sesión GCS usando esa identidad y que dispone de permisos sólo para el objeto de ensayo. Reactivar temporalmente la pareja y el interruptor, subir el DWG una sola vez, confirmar Docs, verificar item/manifiesto ACC y apagar/restaurar. Si la identidad Google no tiene permiso, detenerse sin buscar ni reutilizar claves de otros servicios. El flujo de carpeta real `ARCHIVOS_APOYO` queda para una fase posterior autorizada.
ARCHIVOS MODIFICADOS: propio de esta unidad: sólo `docs/AI_WORKSTATE.md`; datos locales de ensayo: carpeta creada y metadata de puente guardada como desactivada. Archivo DWG local intacto. Código del puente, `.env*`, datos Virginia y WIP ajeno sin edición.
TESTS EJECUTADOS:     `python -m pytest -q` → 2092 aprobadas, 2 fallos conocidos, 2 warnings en 106,39 s; `python -m pytest -q backend/tests/test_acc_emergency_bridge.py backend/tests/test_cola_de_traduccion.py backend/tests/test_vistas_de_autocad.py` → 42/42; `npm test` en frontend-docs → 18/18 bancos. GET de carpeta local → UUID esperado; GET de configuración antes → `bridge=null`, servicio apagado; GET ACC → hub/proyecto/Project Files/carpeta destino y 0 nombres coincidentes sin página siguiente. PUT local configuró la pareja con servicio apagado. GET 3001 → servicio activo; POST `/api/docs/upload-url` en 3000 → 500 genérico; POST `/api/uploads/init` en 3001 → 500 por archivo de credenciales inexistente, sin sesión ni objeto. Tras apagar 3001 y la pareja, health 3000 OK, health 5174 Virginia `802ff0de5393` y GET de puente `enabled=false`, `service_enabled=false`. `gcloud` instalado; archivo ADC de usuario no presente. Ningún umbral de prueba se alteró.
TESTS PENDIENTES:     Subida real GCS, copia ACC, manifiesto y apertura visual en Docs; no se ejecutaron porque faltan credenciales GCS locales. Build no repetido en esta unidad porque no cambió código funcional; build anterior del puente → 469 módulos.
FALLO CONOCIDO:       Backend local apunta a una ruta ficticia de credenciales Google y no puede iniciar subidas GCS. La suite completa conserva la ruta admin de miniaturas sin puerta de cliente y el perfil portal con 289 rutas ante `TECHO=286` (287 antes de añadir las dos rutas del puente); no se ocultaron ni corrigieron fuera de alcance. La carpeta local de ensayo permanece, sin archivos y con el puente desactivado.
NEXT EXACT ACTION:    Pedir al propietario que ejecute personalmente `gcloud auth application-default login` en su laptop y confirme cuando termine, sin compartir credenciales; después comprobar disponibilidad ADC sin mostrar valores y reintentar sólo la misma subida autorizada en un backend temporal, con restauración garantizada.
DO NOT TOUCH:         `.env*`, `D:/copias-ecd/**`, claves/tokens/contraseñas, GCS/ACC fuera del único DWG de ensayo autorizado, `ARCHIVOS_APOYO` real, Render, 5174, LOB/4D, ViewerFacade y WIP ajeno. No staging general, stash, commit, push ni deploy por inferencia.
COMMIT/HEAD REF:      `b03d0fb2e4be4013c460c746cb4415da9619e0f6` (sin commit propio; rama `main`).

[WIP HANDOFF]
TAREA:                Comprobar con un único DWG el puente temporal ALEPHIA Docs local→ACC sin publicar ni alterar el traductor habitual.
IMPLEMENTADO:         El propietario completó personalmente `gcloud auth application-default login`. Se verificó por lectura el proyecto GCP del bucket real. En el backend temporal 3001, sólo con variables del proceso y puente global activo, se habilitó únicamente la carpeta local `ENSAYO_PUENTE_ACC_20260927` del proyecto existente `p_talara_pruebas`. Se subió una sola vez `TRAZO_REPLANTEO_DRENAJE_URBANO (1).dwg` (13.978.195 bytes) mediante `/api/uploads/init` → GCS → `/api/uploads/complete`. ALEPHIA creó `TRAZO_REPLANTEO_DRENAJE_URBANO_1.dwg` V1, nodo `ff201ae4-de44-408b-a39a-86a0eaaf2937`. El puente pasó de `uploading` a `preparing` y `ready`, con enlace persistente. ACC mostró exactamente un item con ese nombre en `ARCHIVOS_AYUDA_VALO`; el backend confirmó manifiesto `success`. Se apagó la pareja de carpetas y se detuvo 3001. El enlace sigue visible por 3000 con puente apagado. 5174 conserva el proxy Virginia versión `802ff0de5393`; no se escribió en Virginia, Git remoto o Render. El DWG en ACC y el objeto GCS se conservan; no se borró nada.
PENDIENTE:            UAT visual y F5 del documento vinculado en ALEPHIA Docs con el mismo 5174 temporalmente conectado al backend local, sin segunda subida; restaurar después 5174. La carpeta real `ARCHIVOS_APOYO` y el uso por otros usuarios requieren autorización posterior. No hay commit, push ni despliegue autorizado. Los dos fallos de la suite total siguen abiertos por separado.
ARCHIVOS MODIFICADOS: propio de esta unidad: sólo `docs/AI_WORKSTATE.md`. Base local: documento V1 de ensayo y metadata de carpeta nuevamente `enabled=false`; un objeto nuevo GCS y un item nuevo ACC de la única subida autorizada. Código funcional, `.env*`, datos Virginia y WIP ajeno sin edición.
TESTS EJECUTADOS:     `POST /api/uploads/init` → 200; PUT resumable GCS → 200; `POST /api/uploads/complete` → 201; GET `/api/docs/cad/acc-link` → `uploading` → `preparing` → `ready` y enlace presente; GET `/api/docs/cad/acc-browse` → 1 item coincidente sin paginación; PUT puente `enabled=false` → 200; GET enlace por 3000 con servicio apagado → vínculo conservado. Health 3000 `ok`; health 5174 versión Virginia `802ff0de5393`; 3001 sin listener. Bancos previos, sin nuevo cambio funcional: 42/42 backend focalizados y 18/18 frontend-docs; suite total 2092 aprobadas, 2 fallos, 2 warnings.
TESTS PENDIENTES:     Apertura visual/F5 del documento local en 5174 y subida por interfaz; no se ejecutaron porque el 5174 del propietario sigue conectado a Virginia. Las rutas HTTP probadas son las mismas que usa el modal. No se repitieron pytest/build en esta unidad: no hubo edición funcional.
FALLO CONOCIDO:       Backend 3000 mantiene bucket y ruta de credenciales ficticios para subir; la prueba necesitó configuración temporal sólo en 3001. 5174 normal no muestra el documento de ensayo local. Suite total: ruta admin `/api/docs/miniaturas/preparar` sin puerta cliente y 289 rutas portal frente a techo `<286`; no se alteraron umbrales.
NEXT EXACT ACTION:    Si el propietario solicita UAT visual, cambiar controladamente el mismo 5174 a `dev:ensayo`, abrir el nodo local `ff201ae4-de44-408b-a39a-86a0eaaf2937` y comprobar vista/F5 sin subir otra vez; restaurar Vite normal y verificar `/api/health` versión Virginia `802ff0de5393`.
DO NOT TOUCH:         `.env*`, `D:/copias-ecd/**`, credenciales, `ARCHIVOS_APOYO` real, otros objetos GCS/ACC, el item/objeto de ensayo sin nueva autorización de borrado, Render, Git remoto, LOB/4D, ViewerFacade y WIP ajeno. No staging general, stash, commit, push ni deploy por inferencia.
COMMIT/HEAD REF:      `b03d0fb2e4be4013c460c746cb4415da9619e0f6` (sin commit propio; rama `main`).

[WIP HANDOFF]
TAREA:                Permitir al propietario probar una subida real por la interfaz local de Docs y restaurar después el entorno anterior.
IMPLEMENTADO:         Se verificó que `5174` apuntaba a Virginia y el puente local estaba apagado. Se reinició sólo el backend local 3000 con ADC, bucket real y puente global activados mediante variables del proceso, sin editar `.env*`; se habilitó únicamente la carpeta local `ENSAYO_PUENTE_ACC_20260927` hacia `ARCHIVOS_AYUDA_VALO` de ACC. Se cambió temporalmente el mismo Vite 5174 a `dev:ensayo` y se comprobó por API que resolvía la carpeta y mostraba el puente activo. El propietario subió por su cuenta `IZ_POLI.dwg` (1.601.664 bytes) desde Docs; ALEPHIA creó V1, nodo `f83fea4a-6b5a-4512-9ce0-d87f696ac678`, versión `9bbfae5e-0355-4dee-afe7-0372b13c8c50`. El puente terminó `ready` con enlace ACC persistente; GET del destino ACC mostró exactamente un item `IZ_POLI.dwg` sin paginación. El propietario confirmó que la vista se abrió y volvió a verse tras F5. Se apagó la pareja de carpetas, se reinició 3000 sin overrides y se restauró el Vite normal 5174. GET final: `folder_enabled=false`, `service_enabled=false`, enlace ACC conservado, health 3000 `ok` y 5174 versión Virginia `802ff0de5393`. Hash de `vite.config.js` sin cambio `0D326D0EF884A00CC7947EB7DB1B218D27846D6E0C03BB33910AFAA6EB36E388`. No se borró ningún archivo, no se escribió en Virginia, no hubo commit, push ni deploy.
PENDIENTE:            El ensayo local autorizado está cerrado. Decidir por separado, con autorización expresa del propietario, si se configura el puente en `ARCHIVOS_APOYO` real y cómo se publicará; mientras tanto mantenerlo apagado. La suite completa aún tiene dos fallos conocidos y el código del puente permanece WIP sin commit. No probar otra subida por inferencia.
ARCHIVOS MODIFICADOS: propio de esta unidad: `docs/AI_WORKSTATE.md` (estado y este handoff). Datos de ensayo: un documento V1 en base local, un objeto GCS y un item ACC creados por la subida del propietario; metadata de carpeta nuevamente apagada. No se editó código funcional, `.env*` ni WIP ajeno en esta unidad.
TESTS EJECUTADOS:     Health 5174 Virginia→local→Virginia con versiones `802ff0de5393`→`desconocida`→`802ff0de5393`; GET de puente por 5174 activo durante ensayo; GET `/api/docs/list` en la carpeta pasó de 1 a 2 DWG; GET `/api/docs/cad/acc-link` para `IZ_POLI.dwg` → `ready`, enlace presente y sin error; GET ACC contents → un item coincidente, sin paginación; UAT del propietario: vista abierta y visible tras F5; PUT puente `enabled=false` → 200; GET final en 3000 → carpeta y servicio apagados, enlace conservado. `git diff --check -- docs/AI_WORKSTATE.md` previo → salida 0 con aviso normal LF/CRLF. Bancos funcionales previos: 42/42 backend focalizados, 18/18 frontend-docs; suite total previa 2092 aprobadas, 2 fallos, 2 warnings.
TESTS PENDIENTES:     No se repitieron pytest ni build en esta unidad porque no hubo cambios de código. El flujo con carpeta real de Virginia y usuarios de producción no se probó ni se autorizó. No se verificó que el usuario pudiera subir otros tipos: el puente se diseñó para CAD y se ensayó con DWG.
FALLO CONOCIDO:       Backend local 3000 restaurado conserva configuración ficticia de GCS para subidas futuras; requeriría configuración de ensayo de nuevo. 5174 normal apunta a Virginia y no muestra el documento local de prueba. Suite total: `/api/docs/miniaturas/preparar` sin puerta cliente y perfil portal 289 rutas frente a techo `<286`; no se maquillaron los criterios.
NEXT EXACT ACTION:    Mantener el puente apagado y esperar la decisión explícita del propietario sobre una futura configuración de `ARCHIVOS_APOYO` o una publicación; antes de cualquiera, revisar estado Git, plan de reversión y los dos fallos de suite.
DO NOT TOUCH:         `.env*`, `D:/copias-ecd/**`, credenciales, `ARCHIVOS_APOYO` real, otros objetos GCS/ACC, los items y objetos de ensayo sin autorización de borrado, Render, Git remoto, LOB/4D, ViewerFacade y WIP ajeno. No staging general, stash, commit, push ni deploy por inferencia.
COMMIT/HEAD REF:      `b03d0fb2e4be4013c460c746cb4415da9619e0f6` (sin commit propio; rama `main`).

[WIP HANDOFF]
TAREA:                Mantener abierta la prueba de varios DWG desde Docs local hacia la misma carpeta ACC y explicar la latencia del puente.
IMPLEMENTADO:         Ante la aclaración del propietario «quería probar con más archivos», se reabrió sólo la carpeta local `ENSAYO_PUENTE_ACC_20260927` (`c38cef7e-0a9d-424a-91b9-70620ce1b922`, proyecto `p_talara_pruebas`) hacia ACC `ARCHIVOS_AYUDA_VALO`. Se reinició backend 3000 con ADC, bucket real y `ACC_EMERGENCY_BRIDGE_ENABLED=true` únicamente en variables del proceso; listener actual PID 24612. Se cambió el mismo Vite 5174 a `--mode ensayo`; listener actual PID 28248. El propietario confirmó «sigo probando»: ambos siguen activos deliberadamente. En la carpeta constan ahora cinco DWG: los anteriores `TRAZO_REPLANTEO_DRENAJE_URBANO_1.dwg` e `IZ_POLI.dwg`, más `4D_OCT_V01.dwg`, `500125-SCL-GEN-TOP-SKT-P08-0097_REPOSICION_SAN_LUIS_V02.dwg` y `SUP_REAL02.dwg`. Los dos primeros nuevos tienen enlace ACC listo; `SUP_REAL02.dwg` figura `preparing`, sin error. El flujo es navegador→GCS ALEPHIA→copia a ACC→preparación ACC: una transferencia extra, no dos traducciones. De metadata de versiones: `4D_OCT_V01.dwg` tardó 15 s en copia y 64 s en preparación; `...SAN_LUIS_V02.dwg`, 51 s y 358 s; `SUP_REAL02.dwg`, 17 s de copia y preparación aún pendiente. Son tiempos desde la confirmación ALEPHIA, no incluyen la primera subida del navegador. No se modificó código, `.env*`, Virginia, Git remoto ni Render.
PENDIENTE:            El propietario sigue subiendo y revisando archivos. No restaurar por cuenta propia antes de que comunique «terminé» o pida detener. Al terminar, comprobar todos los DWG y sus enlaces/errores; desactivar la pareja exacta; reiniciar backend 3000 sin overrides y Vite 5174 en modo normal; verificar GET de puente `enabled=false/service_enabled=false`, health 3000 `ok` y health 5174 versión Virginia `802ff0de5393`. Si ACC aún prepara un archivo, reportarlo sin reintentar ni duplicar.
ARCHIVOS MODIFICADOS: mío en esta unidad: sólo `docs/AI_WORKSTATE.md` (estado y handoff). Datos de prueba: tres documentos V1 nuevos en la base local y sus objetos GCS/ACC creados por el propietario. Procesos locales 3000 y 5174 cambiados temporalmente como arriba. Código funcional y WIP ajeno sin edición.
TESTS EJECUTADOS:     Precheck 3000/5174 y puente apagado; tras cambio, health 5174 versión `desconocida` del backend local y GET de puente `enabled=true/service_enabled=true`; GET `/api/docs/list` pasó de 2 a 5 archivos; GET `/api/docs/cad/acc-link` confirmó enlaces de `4D_OCT_V01.dwg` y `...SAN_LUIS_V02.dwg`, estado `preparing` sin error de `SUP_REAL02.dwg`; GET `/api/docs/versions` dio tiempos arriba. Bancos previos, no repetidos aquí: backend focalizado 42/42, frontend-docs 18/18; suite total previa 2092 aprobadas, 2 fallos, 2 warnings.
TESTS PENDIENTES:     Comprobación visual/F5 de los DWG adicionales por el propietario; no ha comunicado cierre de la prueba. Verificación final de todos los enlaces y de la restauración; no se hace todavía porque sigue probando. No se repitieron pytest/build: sin edición funcional.
FALLO CONOCIDO:       `SUP_REAL02.dwg` sigue en preparación ACC, sin error hasta el último GET. La prueba deja temporalmente 5174 conectado a base local y 3000 con puente activo: debe restaurarse al terminar. Los dos fallos conocidos de suite total siguen sin resolver: puerta cliente de `/api/docs/miniaturas/preparar` y perfil portal 289 rutas frente a techo `<286`.
NEXT EXACT ACTION:    Esperar la señal «terminé» del propietario; entonces consultar `/api/docs/list` y `/api/docs/cad/acc-link` por cada nuevo DWG, desactivar el puente de `c38cef7e-0a9d-424a-91b9-70620ce1b922`, restaurar 3000 y 5174 como indica PENDIENTE y verificar ambos health/flag.
DO NOT TOUCH:         `.env*`, `D:/copias-ecd/**`, credenciales, `ARCHIVOS_APOYO` real, otros objetos GCS/ACC, los items/objetos de ensayo sin autorización de borrado, Render, Git remoto, LOB/4D, ViewerFacade y WIP ajeno. No staging general, stash, commit, push ni deploy por inferencia.
COMMIT/HEAD REF:      `b03d0fb2e4be4013c460c746cb4415da9619e0f6` (sin commit propio; rama `main`).

[WIP HANDOFF]
TAREA:                Mostrar «Procesando» en la fila de Docs durante el puente temporal ACC, sin alterar el traductor habitual.
IMPLEMENTADO:         `cad/estados` conserva la consulta y semántica CAD normales; sólo las versiones con puente muestran `procesando/pausado/failed/success`. Programa hasta cinco comprobaciones de manifiesto por ronda en un pool separado, sin bloquear la lista ni duplicar trabajo en un proceso. La fila muestra spinner y «Procesando»; al terminar la carga, el modal dice «Archivo guardado · procesando vista…»; el lector sólo dice «Procesando…». Backend 3000 reiniciado con overrides de ensayo; 5174 sigue en `dev:ensayo`. GET local: cinco DWG `success`, health `ok`, pareja de prueba `enabled=true/service_enabled=true`. El envío de bytes GCS→ACC no se aceleró.
PENDIENTE:            Esperar respuesta del propietario sobre cerrar el ensayo. Si pide cierre, apagar sólo la pareja exacta, restaurar 3000 sin overrides y 5174 en modo normal, y verificar. Si sigue probando, observar una subida autorizada para comprobar visualmente el intervalo «Procesando». La carga simultánea navegador→ALEPHIA/ACC requiere un protocolo durable adicional; no está implementada.
ARCHIVOS MODIFICADOS: hunks propios de esta unidad en `backend/acc_emergency_bridge.py`, `backend/routes/docs_cad.py`, `frontend-docs/src/MatrixTable.jsx`, `frontend-docs/src/components/DocumentViewer.jsx`, `frontend-docs/src/hooks/useChunkedUpload.js`, `backend/tests/test_acc_emergency_bridge.py`, `frontend-docs/pruebas/accBridgeTemporal.prueba.mjs` y este documento. WIP anterior en esas rutas y resto del worktree preservado. Build temporal `frontend-docs/.build-acc-bridge-check/` quedó no versionado porque la limpieza exacta fue rechazada por política de ejecución; no es otro proyecto.
TESTS EJECUTADOS:     backend focalizado (`test_acc_emergency_bridge`, `test_docs_acc_link`, `test_estado_de_traduccion_en_la_lista`, `test_vistas_de_autocad`) 56/56; `npm test` frontend-docs 18/18 bancos; build Vite 469 módulos OK. Suite `python -m pytest -q`: 2094 aprobadas, 2 fallos históricos, 2 warnings, 455,91 s. ESLint focalizado: dos errores previos en MatrixTable:251 (`user` no usado) y DocumentViewer:324 (hook condicional), ninguno en `useChunkedUpload`. GET local 5174: health `ok`, puente activo sólo en carpeta de ensayo, estados 5/5 `success`. `git diff --check` salida 0 con avisos LF/CRLF.
TESTS PENDIENTES:     UAT visual de una fila aún en preparación; los cinco archivos ya terminaron antes de la observación. No se subió otro archivo sólo para forzar el estado. Verificación de restauración pendiente de la decisión del propietario. No se probó protocolo de carga paralela inexistente.
FALLO CONOCIDO:       La transferencia sigue navegador→GCS→ACC; esta unidad mejora la información, no el tiempo de traslado. Fallos históricos de suite: `/api/docs/miniaturas/preparar` sin puerta cliente y perfil portal 289 rutas frente a techo `<286`. Dos errores de lint previos y build temporal no versionado como arriba.
NEXT EXACT ACTION:    Leer la respuesta del propietario a la pregunta de cierre; si pide cerrar, desactivar `c38cef7e-0a9d-424a-91b9-70620ce1b922`, restaurar procesos 3000/5174 y verificar por API que el puente está apagado y 5174 vuelve a Virginia; si pide seguir, mantener el ensayo activo.
DO NOT TOUCH:         `.env*`, `D:/copias-ecd/**`, credenciales, `ARCHIVOS_APOYO` real, otros objetos GCS/ACC, items/objetos de ensayo sin autorización de borrado, Render, Git remoto, LOB/4D, ViewerFacade y WIP ajeno. No staging general, stash, commit, push ni deploy por inferencia.
COMMIT/HEAD REF:      `b03d0fb2e4be4013c460c746cb4415da9619e0f6` (sin commit propio; rama `main`).

[WIP HANDOFF]
TAREA:                Revisar si `3D_SANTA_RITA.dwg` quedó indebidamente en «Procesando» tras terminar ACC.
IMPLEMENTADO:         Diagnóstico de lectura: `/api/docs/cad/estados` por 5174 devolvió `success`; metadata V1 mostró `acc_emergency_bridge.status=ready` y enlace ACC persistente. En la pestaña real de Chrome la fila ya no mostraba «Procesando», sin F5 ni cambio de código. La captura fue anterior a la actualización visible; frontend y conciliador espaciados en rondas de 15 s pueden requerir más de un ciclo. En esa pestaña hay otra subida activa, `PANOS_DE_C.-AP-04.dwg`, al 37 % en el último estado.
PENDIENTE:            No reiniciar, restaurar ni editar módulos Vite durante la subida. Esperar que termine y verificar si la nueva fila se actualiza sola; sólo si persiste «Procesando» con backend `ready`, reproducir y corregir el refresco. Después acordar cierre del ensayo.
ARCHIVOS MODIFICADOS: mío en esta unidad: sólo `docs/AI_WORKSTATE.md`; sin cambios de código ni archivos de obra. WIP anterior y ajeno preservados.
TESTS EJECUTADOS:     GET `/api/docs/list` identificó el nodo `f98e98dd-cd3f-4e8e-afa3-ec909858095d`; POST `/api/docs/cad/estados` → `success`; GET `/api/docs/versions` → V1 `ready`, `acc_link` presente. AX de Chrome mostró la fila sin «Procesando» y la carga nueva pasó de 4 % a 37 %. Sin suites nuevas porque no hubo cambio de código.
TESTS PENDIENTES:     UAT de la nueva fila mientras ACC prepara y al quedar lista; no interrumpir la subida activa.
FALLO CONOCIDO:       La conciliación ACC y la fila usan rondas de 15 s, así que la desaparición del indicador puede requerir más de un ciclo; no hay evidencia de estado atascado en `3D_SANTA_RITA.dwg`. Persisten los dos fallos históricos de suite del handoff anterior.
NEXT EXACT ACTION:    Esperar que termine `PANOS_DE_C.-AP-04.dwg`; consultar sólo lectura su estado por 5174 y observar si «Procesando» desaparece sin F5. No restaurar 3000/5174 hasta que el propietario lo pida tras sus pruebas.
DO NOT TOUCH:         Subida activa en Chrome, `.env*`, credenciales, Virginia, `ARCHIVOS_APOYO` real, Render, Git remoto, LOB/4D, ViewerFacade y WIP ajeno; no commit, push ni deploy.
COMMIT/HEAD REF:      `b03d0fb2e4be4013c460c746cb4415da9619e0f6` (sin commit propio; rama `main`).

[WIP HANDOFF]
TAREA:                Diagnosticar la demora entre guardar `PANOS_DE_C.-AP-04.dwg` en ALEPHIA local y verlo aparecer en ACC.
IMPLEMENTADO:         Diagnóstico de sólo lectura: el propietario observó ALEPHIA ~13:11 y ACC ~13:18. Metadata del puente: `queued_at=started_at=1790532692`, `uploaded_at=1790533136`; 444 s (7 min 24 s) sin espera en cola antes de crear la versión ACC. El estado posterior es `preparing`, con versión ACC presente, sin error y todavía sin vínculo de vista. El código demuestra que el backend local primero descarga el archivo completo de GCS a un temporal y luego lo sube a S3 firmado de ACC; el envío doble es de bytes, no una doble traducción. La pantalla «Procesando» funciona, pero no reduce ese tiempo. Se añadieron a metadata del puente cuatro marcas de tiempo (`gcs_download_started_at`, `gcs_download_finished_at`, `acc_transfer_started_at`, `acc_transfer_finished_at`) para distinguir ambas fases en futuras cargas, sin cambiar el flujo ni la ruta de traducción normal. No se reinició el servidor en uso, así que esta instrumentación aún no corre. Se revisó la carga directa por S3 firmado y la advertencia oficial de Autodesk sobre CORS; no se ejecutó carga adicional.
PENDIENTE:            1) Esperar que ACC prepare la vista y verificar que la fila deje de mostrar «Procesando» sin F5; 2) cuando el propietario termine la prueba, cargar el cambio local en un reinicio controlado y medir ambas fases con un siguiente archivo de ensayo autorizado; 3) validar un protocolo directo desde navegador a ambos destinos antes de implementarlo, con fallback durable; 4) mantener el puente temporal apagado por defecto y preservar el traductor normal; 5) restaurar 3000/5174 sólo cuando el propietario cierre la prueba. No prometer aparición inmediata en ACC sin validar CORS, ancho de banda, reintentos e idempotencia.
ARCHIVOS MODIFICADOS: propios en esta unidad: `backend/acc_emergency_bridge.py` (sólo marcas de tiempo), `backend/tests/test_acc_emergency_bridge.py` (asserts de orden) y `docs/AI_WORKSTATE.md` (CURRENT TASK y handoff). Código ajeno, datos de obra y `.env*` sin cambios.
TESTS EJECUTADOS:     `git status --short`, `git rev-parse HEAD`, `git log --oneline -10`, `git merge-base --is-ancestor cdf7837545747b3d39cd93ff070af30dd7aa7b9c HEAD` → salida 0; POST local `/api/docs/cad/estados` → `procesando`; GET local `/api/docs/versions` → `preparing`, versión ACC presente, error vacío, marcas de tiempo anteriores. Inspección estática de `backend/acc_emergency_bridge.py`, `backend/routes/docs_cad.py`, `backend/routes/uploads.py` y `frontend-docs/src/hooks/useChunkedUpload.js`. `python -m pytest -q backend/tests/test_acc_emergency_bridge.py backend/tests/test_docs_acc_link.py backend/tests/test_estado_de_traduccion_en_la_lista.py backend/tests/test_vistas_de_autocad.py` → 56/56, 2 warnings; `git diff --check` focalizado → sin errores, aviso LF/CRLF normal.
TESTS PENDIENTES:     UAT de terminación de la vista de `PANOS_DE_C.-AP-04.dwg`; prueba de viabilidad CORS de URL firmada y prueba de carga paralela aún no implementada; suite completa no repetida por ser instrumentación acotada y porque el ensayo sigue en vivo. El desglose de los 444 s no puede inferirse de las marcas actuales.
FALLO CONOCIDO:       444 s de trabajo antes de que el archivo aparezca en ACC para este DWG; a las 13:38 hora de Lima la fila aún devolvía `procesando`, metadata `preparing`, sin error. El flujo actual descarga GCS al backend local y sube a ACC en serie. Persisten los dos fallos históricos de la suite completa consignados arriba.
NEXT EXACT ACTION:    Preguntar si el propietario terminó las subidas de este ensayo (GET local `/api/uploads/pending` dio 0, pero podría querer subir más); si confirma, reiniciar controladamente 3000 con la instrumentación y medir descarga/subida en un nuevo archivo autorizado antes de elegir la optimización, sin alterar la ruta CAD normal.
DO NOT TOUCH:         `.env*`, credenciales, Virginia, `ARCHIVOS_APOYO` real, Render, Git remoto, LOB/4D, ViewerFacade, WIP ajeno, ni reiniciar/restaurar 3000/5174 durante la prueba activa. No commit, push ni deploy por inferencia.
COMMIT/HEAD REF:      `b03d0fb2e4be4013c460c746cb4415da9619e0f6` (sin commit propio; rama `main`).

[WIP HANDOFF]
TAREA:                Implementar y ensayar en el mismo local el envío paralelo ALEPHIA Docs→ACC para la carpeta de emergencia, sin cambiar la traducción normal.
IMPLEMENTADO:         Segundo cortacircuito `ACC_BRIDGE_PARALLEL_UPLOAD_ENABLED`, apagado por defecto en código y activo sólo en el nuevo proceso local 3000. `init` prepara storage ACC, URLs S3 firmadas por partes y ticket temporal firmado sin entregar token APS; el hook de Docs envía el archivo a GCS y ACC en paralelo. `complete` comprueba sesión/usuario y presencia/tamaño del original GCS, confirma S3 y marca la versión para que el trabajador cree el item ACC sin redescargar GCS. Si falta el plan o falla la carga directa, queda la ruta anterior GCS→ACC. Se añadió prueba unitaria de partes/reintentos/cancelación y pruebas backend de ticket, carpeta, interruptor y ruta directa sin GCS. El propietario confirmó fin de las subidas; se comprobaron 0 sesiones pendientes, se detuvieron sólo los PID 6716/30672 de `server.py` local y se lanzó 3000 con ADC, bucket anterior, puente activo y nuevo flag, sin editar `.env*`. GET 5174 health `ok`, misma carpeta `enabled=true`, `PANOS_DE_C.-AP-04.dwg` terminó `ready` y la fila devuelve `success`. Se pidió al propietario subir un DWG pequeño en la misma carpeta; aún no lo hizo al último GET (8 archivos, 0 pendientes). No hubo nueva subida a GCS/ACC por el agente, ni escritura Virginia, commit, push o deploy.
PENDIENTE:            UAT real desde Chrome del mismo 5174: comprobar si el navegador acepta las URLs firmadas S3/CORS; medir cuándo aparece en ACC y si `direct_upload=true` evita la descarga GCS. Si falla, comprobar que se activa el fallback y corregir causa sin alterar el traductor normal. Después consultar al propietario si terminó y restaurar el proceso 3000 sin el flag nuevo y el Vite 5174 normal, sólo cuando cierre el ensayo. Revisar idempotencia de `complete` bajo dos solicitudes concurrentes antes de cualquier publicación; el flujo antiguo tampoco bloquea esta carrera.
ARCHIVOS MODIFICADOS: propios de esta unidad: `backend/enlaces_firmados.py`, `backend/acc_emergency_bridge.py`, `backend/routes/uploads.py`, `backend/tests/test_acc_emergency_bridge.py`, `frontend-docs/src/hooks/useChunkedUpload.js`, nuevo `frontend-docs/src/utils/accParallelUpload.js`, nuevo `frontend-docs/pruebas/accParallelUpload.prueba.mjs` y `docs/AI_WORKSTATE.md`; build temporal `.build-acc-bridge-check/` actualizado, no es otro proyecto. Ajenos: todo el resto de `git status --short`, sin modificar en esta unidad.
TESTS EJECUTADOS:     takeover: `git status --short`, HEAD `b03d0fb`, `git log --oneline -10`, baseline `cdf783` ancestro (exit 0). Backend focalizado final → 59/59, 2 warnings; hubo un SyntaxError en test nuevo durante una corrida intermedia, se reparó y desapareció en la final. `npm test` Docs → 19/19 bancos; build Vite → 470 módulos; `npx eslint` de hook, utilidad y prueba → 0 errores; `python -m py_compile` de módulos backend tocados → 0 errores; `git diff --check` focalizado → 0 errores, aviso normal LF/CRLF. GET `/api/docs/list` confirmó ruta `ENSAYO_PUENTE_ACC_20260927/` al UUID esperado; health y configuración del puente por 5174 → OK/activo, sólo local.
TESTS PENDIENTES:     Subida real con el nuevo flag, CORS del navegador, manifest ACC y vista en Docs; no hay resultado real todavía. Suite backend completa no repetida: la anterior tenía 2 fallos históricos documentados. Restauración pendiente del cierre de UAT.
FALLO CONOCIDO:       No se ha demostrado que Autodesk permita PUT desde `localhost` a las URLs S3 firmadas; si no lo permite, el nuevo camino cae al respaldo y no acelerará. La versión actual espera que ambos envíos terminen antes de crear la fila de Docs, por lo que cambia el momento en que la fila aparece; es un compromiso de UX a evaluar. Siguen los dos fallos históricos de suite backend.
NEXT EXACT ACTION:    Esperar que el propietario suba un DWG pequeño en `ENSAYO_PUENTE_ACC_20260927` mediante 5174; consultar sin mostrar URLs/tickets los estados de `/api/uploads`, la nueva versión local y su metadata `acc_emergency_bridge.direct_upload`, comprobar ACC y vista, y reportar tiempos y CORS. No restaurar mientras pruebe.
DO NOT TOUCH:         `.env*`, credenciales/tickets/URLs firmadas en salidas, Virginia, `ARCHIVOS_APOYO` real, Render, Git remoto, LOB/4D, ViewerFacade, WIP ajeno, documentos existentes de ensayo fuera de la nueva carga. No staging general, stash, commit, push ni deploy por inferencia.
COMMIT/HEAD REF:      `b03d0fb2e4be4013c460c746cb4415da9619e0f6` (sin commit propio; rama `main`).

[WIP HANDOFF]
TAREA:                Corregir el arranque local que impidió la primera subida real del prototipo paralelo Docs→ACC.
IMPLEMENTADO:         El `POST /api/uploads/init` de `canal.dwg` falló con 500 por la ruta falsa `GOOGLE_APPLICATION_CREDENTIALS` que `load_dotenv` repuso al no existir la variable en el proceso. No creó sesión ni archivo. Se verificó 0 sesiones pendientes, se paró sólo el proceso local 3000 y se reinició con esa variable presente pero vacía para usar ADC, conservando el bucket de ensayo y ambos interruptores ACC sólo en el proceso. No se abrió ni editó `.env*`, no se tocó Virginia, no hubo nueva carga ACC/GCS por el agente. El servidor nuevo responde en 3000 y el mismo 5174 ve 8 archivos existentes.
PENDIENTE:            El propietario debe reintentar `canal.dwg` desde `ENSAYO_PUENTE_ACC_20260927`; seguir la sesión sin exponer URLs/tickets, comprobar si GCS y ACC reciben en paralelo, medir tiempo hasta aparición en ACC y preparación de vista. Si falla, diagnosticar CORS/fallback. Al cerrar la UAT, restaurar backend 3000 sin el flag y 5174 a la configuración acordada, sólo tras confirmar que terminó. Antes de publicar, revisar idempotencia de `/complete` y la limitación ADC para firmar descargas originales.
ARCHIVOS MODIFICADOS: propios de esta unidad: `docs/AI_WORKSTATE.md` solamente. El código del prototipo y los demás cambios del worktree ya estaban presentes; ninguno se editó en esta unidad. `.env*`, credenciales, archivos de obra y áreas protegidas sin cambios.
TESTS EJECUTADOS:     takeover: `git status --short`, rama `main`, HEAD `b03d0fb`, `git log --oneline -10`, baseline `cdf783` ancestro (exit 0); `/api/uploads/pending` → 0; con ADC vacío en proceso, cliente GCS `ok` y `bucket.exists()` → True; reinicio Flask → 3000 escuchando; GET 5174 `/api/health` → `ok`, GET Docs list → éxito/8 archivos. `git diff --check` focalizado previo → sin errores (sólo avisos LF/CRLF).
TESTS PENDIENTES:     Reintento real del usuario, verificación del nuevo `/init`, carga GCS, carga ACC directa/CORS y vista; suite backend completa no repetida (dos fallos históricos documentados).
FALLO CONOCIDO:       ADC de usuario puede acceder al bucket pero no firmar URLs GCS de lectura (el listado muestra el aviso de clave privada); la prueba inicial 500 se corrigió sólo en el proceso local y aún no se ha reintentado. No se sabe si las URLs ACC aceptan PUT desde localhost.
NEXT EXACT ACTION:    Pedir al propietario que cierre el error y vuelva a seleccionar `canal.dwg` en la misma carpeta de 5174; después inspeccionar sólo estados/tiempos y metadata de la nueva versión, sin mostrar credenciales ni URLs firmadas.
DO NOT TOUCH:         `.env*`, secretos, Virginia, `ARCHIVOS_APOYO` real, Render, Git remoto, LOB/4D, ViewerFacade, WIP ajeno ni otras carpetas; no restaurar el proceso mientras el propietario prueba. Sin commit, push ni deploy.
COMMIT/HEAD REF:      `b03d0fb2e4be4013c460c746cb4415da9619e0f6` (sin commit propio; rama `main`).

[WIP HANDOFF]
TAREA:                Medir el reintento `canal.dwg` y reducir el retraso visual al volver desde ACC, sin alterar la carga ni traducción habituales.
IMPLEMENTADO:         La UAT real en la misma carpeta confirmó archivo local de 711376 bytes creado a las 14:15:03, `direct_upload=true`, ACC `uploaded_at=14:15:05`, vista `ready_at=14:15:51`, sin error y con item/vínculo ACC. `/api/uploads/pending` → 0; la fila local existe y `/api/docs/cad/estados` devuelve `success`. El propietario vio ACC antes de que ALEPHIA le permitiera entrar, con ~10 s de desfase visual. El lector sondea cada 10 s, la lista cada 15 s y el backend limita el manifiesto a 15 s. Se añadió al lector una consulta inmediata al recuperar foco/visibilidad mientras el puente esté pendiente, coalescida en 2 s, sin aumentar la cadencia regular. Se corrigieron dos reglas de hooks del mismo componente para que ESLint del archivo pase: hook de memoria del conector antes del retorno nulo y actualización de prueba local en microtarea cancelable. No se re-subió nada, no se cambió `.env*`, ni se tocó el traductor normal.
PENDIENTE:            Explicar al propietario que los ~10 s posteriores a ACC son latencia de consulta/repintado y no escalan a horas por el tamaño. El tiempo real para 500 MB depende de la subida efectiva: se transfieren dos copias en paralelo (~1 GB de salida total), más procesamiento ACC; no extrapolar 0,7 MB a 500 MB. Validar el refresco al volver de ACC cuando haya otro archivo de prueba autorizado; no pedir nueva carga por defecto. Revisar idempotencia de `/complete` antes de publicar. Al cerrar el ensayo, restaurar procesos/flags locales sólo tras confirmación del propietario.
ARCHIVOS MODIFICADOS: propios en esta unidad: `frontend-docs/src/components/DocumentViewer.jsx`, `frontend-docs/pruebas/accBridgeTemporal.prueba.mjs`, `docs/AI_WORKSTATE.md`. Los demás cambios sucios del worktree siguen ajenos o pertenecen a unidades anteriores. `.env*`, protegidos y datos de obra no modificados.
TESTS EJECUTADOS:     GET Docs list → 9 archivos, `canal.dwg` V1; GET versions → `direct_upload=true`, `status=ready`, marcas 14:15:03/05/51, sin error; POST CAD estados → `success`; GET ACC link → presente; pendientes → 0. `npm test` Docs → 19/19 bancos; `npx vite build --outDir .build-acc-bridge-check` → 470 módulos, salida 0; `npx eslint src/components/DocumentViewer.jsx` → 0 tras corregir dos problemas de hooks del archivo. Lint intermedio falló primero por hook condicional y después por setState síncrono en efecto, ambos corregidos y repetido verde. `git diff --check` focalizado antes de la última edición → salida 0, avisos LF/CRLF normales.
TESTS PENDIENTES:     UAT de foco/visibilidad con un segundo CAD en estado pendiente; medición de tiempos reales de un archivo grande, sin prometer duración; suite backend completa no repetida (dos fallos históricos documentados).
FALLO CONOCIDO:       El original GCS local con ADC de usuario no puede generar URL firmada de lectura; el puente ACC sí llegó a `ready`. El navegador puede tardar hasta el siguiente sondeo/manifiesto para enterarse de la vista lista; el nuevo evento de foco puede acortarlo al volver de ACC, aún sin UAT. La fila se crea sólo cuando ambas transferencias terminan, por lo que el tiempo de carga de 500 MB sí crecerá con la velocidad de subida.
NEXT EXACT ACTION:    Comunicar el resultado real y la estimación condicionada por ancho de banda; preguntar si quiere ensayar un archivo más grande para medir, sin cargarlo por cuenta del agente ni publicar; si acepta, observar inicio, fin de ambas transferencias y vista en la misma carpeta de ensayo.
DO NOT TOUCH:         `.env*`, credenciales/URLs firmadas, Virginia, `ARCHIVOS_APOYO` real, Render, Git remoto, LOB/4D, ViewerFacade, WIP ajeno. No staging general, stash, commit, push ni deploy. Mantener 3000/5174 mientras el propietario siga probando.
COMMIT/HEAD REF:      `b03d0fb2e4be4013c460c746cb4415da9619e0f6` (sin commit propio; rama `main`).

[WIP HANDOFF]
TAREA:                Verificar la segunda subida directa Docs→ACC y explicar el minuto en «Procesando» sin tocar el traductor normal.
IMPLEMENTADO:         El propietario cargó `CANAL_SANTARITA.dwg` (8217313 bytes) en la misma carpeta de ensayo. La versión local registró `direct_upload=true`, fila a las 14:51:59, copia ACC `uploaded_at=14:52:02`, vista `ready_at=14:53:04`, un intento y ningún error. El propietario vio la vista terminada en ACC mientras ALEPHIA seguía «Procesando», y después confirmó que ALEPHIA terminó. GET ACC link presenta vínculo, POST CAD estados devuelve `success`, y no quedan sesiones pendientes. No se hizo otra carga ni escritura remota desde el agente, ni cambios de código en esta unidad.
PENDIENTE:            Aclarar que la espera de 62 s entre carga ACC y `ready` registrado no prueba que ACC tardara exactamente 62 s en procesar: se desconoce cuándo su UI mostró «listo»; backend verifica manifiesto como máximo cada 15 s y el frontend sondea. Si el propietario quiere medir desfase exacto con ACC, registrar ambos relojes en otra prueba autorizada. Mantener ensayo local activo mientras el propietario siga probando; restaurar sólo cuando lo confirme. Revisar idempotencia de `/complete` antes de cualquier publicación.
ARCHIVOS MODIFICADOS: propio en esta unidad: sólo `docs/AI_WORKSTATE.md`. Código, `.env*`, credenciales, archivos existentes y protegidos no modificados.
TESTS EJECUTADOS:     takeover: `main`, HEAD `b03d0fb`, baseline `cdf783` ancestro (exit 0), status de archivos focalizados coincide con WIP esperado; GET Docs list → 10 archivos y nombre/tamaño/fecha del nuevo; GET versions → `ready`, directo, marcas y sin error; GET ACC link → presente; POST CAD estados → `success`; GET uploads pending → 0. No se corrieron pruebas de código porque no se editó código.
TESTS PENDIENTES:     Medición de desfase exacto entre UI ACC y UI ALEPHIA, UAT del refresco al recuperar foco, ensayo de archivo grande sólo si el propietario lo desea; suite backend completa no repetida (dos fallos históricos documentados).
FALLO CONOCIDO:       Hasta el siguiente sondeo el estado visual de ALEPHIA puede quedar en «Procesando» aunque la UI ACC ya muestre la vista; no se verificó que los 62 s observados sean enteramente latencia de UI. ADC local no firma descargas GCS originales, limitación previa del ensayo.
NEXT EXACT ACTION:    Explicar al propietario los tiempos observados sin confundir carga, traducción y sondeo; dejar 5174/3000 activos para sus pruebas y no solicitar otra subida por defecto. Si reporta que «Procesando» no termina, consultar de nuevo metadata y CAD estados antes de cambiar el sondeo.
DO NOT TOUCH:         `.env*`, credenciales/URLs firmadas, Virginia, `ARCHIVOS_APOYO` real, Render, Git remoto, LOB/4D, ViewerFacade, WIP ajeno; sin commit, push o deploy. No restaurar 3000/5174 mientras el propietario siga probando.
COMMIT/HEAD REF:      `b03d0fb2e4be4013c460c746cb4415da9619e0f6` (sin commit propio; rama `main`).

[WIP HANDOFF]
TAREA:                Respetar la medición de ~1 min de desfase visual ACC→ALEPHIA e impedir que la lista quede esperando un temporizador de pestaña oculta.
IMPLEMENTADO:         Se reconoció que el minuto fue medido por el propietario en la UI y que las marcas del backend no lo desmienten. `MatrixTable.jsx` sólo consultaba estados CAD cada 15 s si quedaban pendientes, sin actualizar inmediatamente al recuperar foco. Se añadió un GET de estado al volver de ACC mediante `focus`/`visibilitychange`, sólo cuando hay CAD pendiente, coalescido en 2 s y sin aumentar el sondeo periódico. Se retiró la desestructuración `user` no usada en esa tabla para pasar ESLint. Durante la carga del nuevo DWG de 73718446 bytes no se reiniciaron servicios ni se hicieron más ediciones; la fila local se creó a las 15:04:24 y el puente directo marcó `uploaded_at=15:04:26`, `ready_at=15:05:15`, sin error. La carga completa desde `/init` tardó aproximadamente 6 min 12 s, pero no se conoce el instante exacto de clic del usuario ni cuándo ACC mostró «listo» en su UI.
PENDIENTE:            Tomar como hecho la medición ya dada del propietario para `CANAL_SANTARITA.dwg`: ~1 min de «Procesando» en ALEPHIA después de que ACC ya estaba traducido. Validar si el refresco por foco elimina ese desfase en una UAT futura natural, sin pedirle que repita la medición ni atribuir el minuto entero a una sola causa. Revisar idempotencia de `/complete` antes de publicar. Mantener los procesos locales mientras el propietario pruebe; restaurar sólo tras su confirmación.
ARCHIVOS MODIFICADOS: propios en esta unidad: hunk focalizado de `frontend-docs/src/MatrixTable.jsx`, nuevas aserciones en `frontend-docs/pruebas/accBridgeTemporal.prueba.mjs`, y `docs/AI_WORKSTATE.md`. El resto del worktree permanece ajeno o de unidades previas; `.env*` y protegidos intactos.
TESTS EJECUTADOS:     takeover: `main`, HEAD `b03d0fb`, baseline `cdf783` ancestro (exit 0); GET uploads pending con `model_urn=p_talara_pruebas` → 1 sesión activa/40 MiB/56,9 % y luego 0; GET Docs list → 11 archivos y nuevo DWG 73718446 bytes; GET versions → directo, estado `ready`, marcas y sin error. `npm test` Docs → 19/19 bancos; build Vite → 470 módulos, salida 0; ESLint focalizado de `MatrixTable.jsx` y `DocumentViewer.jsx` → 0 al repetir tras retirar variable no usada (la primera corrida falló por esa variable preexistente); banco `accBridgeTemporal` → verde; `git diff --check` focalizado → salida 0 con avisos LF/CRLF normales.
TESTS PENDIENTES:     UAT visual del cambio de foco cuando haya otro archivo pendiente, sin nueva carga solicitada sólo para medir; suite backend completa no repetida (dos fallos históricos documentados).
FALLO CONOCIDO:       El estado visual Docs puede demorarse frente a ACC; la falta de refresco al volver de otra pestaña era un mecanismo posible y fue corregido localmente, pero aún no se ha demostrado que sea la causa única del minuto. ADC de usuario local sigue sin firmar descargas GCS originales.
NEXT EXACT ACTION:    Inspeccionar con pruebas locales la secuencia de `focus`/`visibilitychange` y sondeo de la fila pendiente; después diseñar una actualización de estado que no dependa de temporizadores de pestaña oculta ni incremente llamadas APS sin límite. No volver a pedir al propietario la medición de ~1 min que ya proporcionó.
DO NOT TOUCH:         `.env*`, credenciales/URLs firmadas, Virginia, `ARCHIVOS_APOYO` real, Render, Git remoto, LOB/4D, ViewerFacade, WIP ajeno. Sin commit, push ni deploy; no reiniciar 3000/5174 mientras haya ensayo.
COMMIT/HEAD REF:      `b03d0fb2e4be4013c460c746cb4415da9619e0f6` (sin commit propio; rama `main`).

[WIP HANDOFF]
TAREA:                Reducir el retraso entre la vista ya preparada en ACC y el estado «Procesando» de ALEPHIA Docs en el puente temporal local.
IMPLEMENTADO:         Confirmado en código: ACC prepara el derivado en Autodesk; ALEPHIA conserva el DWG original y guarda sólo el vínculo/URN a la versión ACC, no copia de vuelta la traducción. El puente antes comprobaba el manifiesto sólo a petición de la UI (lista/lector); se añadió `schedule_ready_watch` al terminar de crear la versión ACC. Comprueba en segundo plano cada 15 s durante los primeros 5 min y cada 30 s después, por hasta 30 min y con máximo de 20 vigilancias simultáneas; no llama a `POST /job`, no modifica el traductor normal y se activa sólo con `ACC_EMERGENCY_BRIDGE_ENABLED`. El lector/lista siguen como respaldo. Reiniciado únicamente el backend local 3000, con flags del ensayo previos; salud `ok`, sesiones de subida pendientes `0`.
PENDIENTE:            Observar en una próxima subida natural si el intervalo real ACC-listo→ALEPHIA-listo baja; no afirmar aún que el minuto medido quedó eliminado ni solicitar otra medición del archivo anterior. Antes de publicar, revisar idempotencia de `/complete` y carga concurrente/límites de sondeo; publicar sólo por autorización explícita. Mantener 3000/5174 mientras el propietario pruebe; restaurar sólo cuando lo confirme.
ARCHIVOS MODIFICADOS: propios de esta unidad: `backend/acc_emergency_bridge.py`, `backend/tests/test_acc_emergency_bridge.py`, `docs/AI_WORKSTATE.md`. Los dos primeros continúan untracked como WIP previo; los demás cambios sucios siguen ajenos o de unidades anteriores. `.env*` y protegidos intactos.
TESTS EJECUTADOS:     `python -m pytest -q backend/tests/test_acc_emergency_bridge.py` → 17/17 (2 avisos de deprecación); GET `/api/health` local → `ok`; GET `/api/uploads/pending?model_urn=p_talara_pruebas` → 0 sesiones y `success=true` tras reinicio; takeover previo: rama `main`, HEAD `b03d0fb`, baseline `cdf783` ancestro.
TESTS PENDIENTES:     UAT real del nuevo vigilante en una nueva carga del puente; suite backend completa y ensayos de carga/concurrencia no ejecutados en esta unidad.
FALLO CONOCIDO:       El retraso de ~1 min observado por el propietario antes de este cambio sigue siendo real; no se ha medido la mejora en UI. Tras 30 min o más de 20 archivos simultáneos, el vigilante cede al sondeo de UI; ACC puede tardar en reflejar éxito en su manifiesto aunque su interfaz ya muestre el archivo. El ADC local sigue sin firmar descargas GCS originales.
NEXT EXACT ACTION:    Cuando el propietario suba naturalmente otro DWG a la carpeta de ensayo, verificar sin intervenir la marca de `ready` en metadata y el cambio de fila en 5174; si persiste desfase cercano a 1 min, comparar `checked_at`/`ready_at` con el estado del manifiesto, sin atribuirlo de entrada al navegador.
DO NOT TOUCH:         `.env*`, credenciales/URLs firmadas, Virginia, `ARCHIVOS_APOYO` real, Render, Git remoto, LOB/4D, ViewerFacade, WIP ajeno. Sin commit, push ni deploy; no reiniciar 3000/5174 durante una subida.
COMMIT/HEAD REF:      `b03d0fb2e4be4013c460c746cb4415da9619e0f6` (sin commit propio; rama `main`).

[WIP HANDOFF]
TAREA:                Restablecer el entorno local de prueba Docs 5174 + backend 3000 para que el propietario pueda probar la mejora del puente.
IMPLEMENTADO:         Se confirmó que ambos puertos habían dejado de escuchar; se relanzó `npm run dev:ensayo` en `frontend-docs` y `python server.py` en `backend` con los flags locales del ensayo (puente y subida paralela activos, demo local, GCS ADC sin ruta de clave). Vite quedó en 5174; backend tardó aproximadamente 2 min en terminar el arranque y quedó en 127.0.0.1:3000. `http://localhost:5174/?obra=p_talara_pruebas` responde 200; su proxy `/api/health` devuelve `ok`. No se cambió código ni dato remoto.
PENDIENTE:            Que el propietario recargue la pestaña y pruebe una subida natural en la carpeta de ensayo; comprobar entonces el desfase real ACC-listo→ALEPHIA-listo. Si los procesos locales vuelven a detenerse, diagnosticar la causa de su ciclo de vida antes de seguir reiniciando. Revisar idempotencia `/complete` antes de cualquier publicación.
ARCHIVOS MODIFICADOS: propio de esta unidad: `docs/AI_WORKSTATE.md` únicamente; código WIP anterior y cambios ajenos intactos.
TESTS EJECUTADOS:     GET 5174 raíz con `obra=p_talara_pruebas` → 200; GET 5174 `/api/health` vía proxy → `ok`; GET 5174 `/api/uploads/pending?model_urn=p_talara_pruebas` → `success=true`, 0 sesiones. No pruebas de código nuevas porque no hubo edición funcional.
TESTS PENDIENTES:     UAT de la mejora con DWG nuevo y tiempo observado; suite backend completa no repetida (fallos históricos documentados).
FALLO CONOCIDO:       Los procesos locales se detuvieron entre turnos y la página dejó de responder; ahora están activos, pero no se ha identificado por qué se detuvieron. El backend inició con lentitud (~2 min). El minuto de desfase anterior no se ha vuelto a medir con el vigilante nuevo.
NEXT EXACT ACTION:    Tras la próxima subida natural del propietario en 5174, verificar en modo lectura metadata de la nueva versión y estado de la fila, sin volver a subir nada por cuenta del agente ni publicar.
DO NOT TOUCH:         `.env*`, credenciales/URLs firmadas, Virginia, `ARCHIVOS_APOYO` real, Render, Git remoto, LOB/4D, ViewerFacade, WIP ajeno. Sin commit, push ni deploy; no detener 3000/5174 durante una subida.
COMMIT/HEAD REF:      `b03d0fb2e4be4013c460c746cb4415da9619e0f6` (sin commit propio; rama `main`).

[WIP HANDOFF]
TAREA:                Corregir el minuto adicional de «Procesando» en ALEPHIA después de que el propietario ya puede abrir la vista en ACC, sin discutir su medición ni tocar el traductor habitual.
IMPLEMENTADO:         Se identificó que `status_and_link` exigía `manifest.status == success` global, aunque Data Management de ACC puede indicar que la versión concreta tiene vista lista antes de que acaben otros derivados. Se añadió una segunda señal estricta, sólo para el puente temporal: `GET data/v1/projects/{project}/versions/{version}` debe devolver la misma versión, `processState=PROCESSING_COMPLETE`, `extractionState=SUCCESS` y `relationships.derivatives.data.id` válido; sólo entonces se guarda ese URN y `ready_signal=acc_version`. Si no, continúa esperando el manifiesto como antes. Se añadió `bridge_pending` a `cad_estados` y la lista Docs consulta su propia BD cada 5 s sólo mientras el puente está pendiente (15 s para CAD normal). Backend local 3000 reiniciado tras confirmar 0 subidas activas; Docs 5174 sigue activo, salud `ok`, consulta de un archivo ya listo devuelve `success` y `bridge_pending=false`. No hubo nuevas subidas/escrituras remotas desde el agente.
PENDIENTE:            Una próxima subida natural del propietario debe mostrar si el cambio elimina el desfase real; no afirmar que ya está resuelto. Revisar idempotencia de `/complete` y carga/concurrencia antes de publicar, con autorización explícita por acto. Mantener 3000/5174 para el ensayo hasta que el propietario indique terminar.
ARCHIVOS MODIFICADOS: propios de esta unidad: `backend/acc_emergency_bridge.py`, `backend/routes/docs_cad.py`, `backend/tests/test_acc_emergency_bridge.py`, `frontend-docs/src/MatrixTable.jsx`, `frontend-docs/pruebas/accBridgeTemporal.prueba.mjs`, `docs/AI_WORKSTATE.md`; todos contenían WIP previo o siguen untracked según estado esperado. No se tocaron `.env*`, protegidos ni otros cambios ajenos.
TESTS EJECUTADOS:     `python -m pytest -q backend/tests/test_acc_emergency_bridge.py` → 19/19 (2 avisos de deprecación); `npm test` en Docs → 19/19 bancos; `npx eslint src/MatrixTable.jsx` → 0; `npm run build -- --outDir .build-acc-bridge-check` → 470 módulos, exit 0, avisos de imports dinámicos/estáticos preexistentes; `git diff --check` focalizado → 0 con avisos LF/CRLF normales. GET 5174 `/api/health` → `ok`; POST `/api/docs/cad/estados` de archivo ya listo → `success`, `bridge_pending=false`. GET read-only Data Management de versión ACC anterior confirmó forma `PROCESSING_COMPLETE`/`SUCCESS`/derivative URN sin imprimir token ni URL firmada.
TESTS PENDIENTES:     UAT real con nueva vista aún en procesamiento, tiempo ACC-abre→ALEPHIA-lista; suite backend completa no repetida (fallos históricos documentados).
FALLO CONOCIDO:       El retraso medido por el propietario antes de esta segunda corrección es real; todavía no se ha observado el nuevo camino `ready_signal=acc_version` en una traducción en vivo. La señal de Data Management puede no adelantarse al manifiesto para todos los DWG; si persiste el minuto, investigar estados concurrentes sin pedir repetir mediciones pasadas. El ADC local sigue sin firmar descargas GCS originales.
NEXT EXACT ACTION:    Esperar la próxima subida que el propietario decida hacer; si informa resultado, inspeccionar sólo los estados seguros de la nueva versión y la secuencia de señal `ready_signal`, sin cargar otro archivo, modificar ACC ni publicar por cuenta propia.
DO NOT TOUCH:         `.env*`, credenciales/URLs firmadas, Virginia, `ARCHIVOS_APOYO` real, Render, Git remoto, LOB/4D, ViewerFacade, WIP ajeno. Sin commit, push ni deploy; no reiniciar 3000/5174 durante una subida.
COMMIT/HEAD REF:      `b03d0fb2e4be4013c460c746cb4415da9619e0f6` (sin commit propio; rama `main`).

[WIP HANDOFF]
TAREA:                Registrar el resultado de la prueba local del puente ACC→ALEPHIA Docs tras corregir la detección de vista lista.
IMPLEMENTADO:         El propietario confirmó «listo ahora si» después de probar en 5174 la mejora de señal de versión ACC y sondeo de fila de 5 s. Se toma como validación funcional de su prueba local, sin atribuir un tiempo exacto que no comunicó. El código sigue únicamente en el worktree local y no se publicó. La traducción normal de ALEPHIA permanece intacta.
PENDIENTE:            Antes de cualquier publicación, revisar idempotencia de `/complete`, concurrencia y alcance/seguridad del puente temporal; decidir con el propietario cuándo terminar el ensayo y restaurar flags/procesos locales. Commit, push y deploy sólo con autorización explícita por acto.
ARCHIVOS MODIFICADOS: propio de esta unidad: `docs/AI_WORKSTATE.md`; cambios funcionales WIP previos en `backend/acc_emergency_bridge.py`, `backend/routes/docs_cad.py`, `backend/tests/test_acc_emergency_bridge.py`, `frontend-docs/src/MatrixTable.jsx` y `frontend-docs/pruebas/accBridgeTemporal.prueba.mjs` permanecen sin commit; cambios ajenos intactos.
TESTS EJECUTADOS:     Confirmación UAT del propietario: «listo ahora si», sin cifra de tiempo. Takeover read-only: rama `main`, HEAD `b03d0fb`, baseline `cdf783` ancestro y archivos focalizados con estado WIP esperado. En unidad previa: puente backend 19/19, Docs 19/19 bancos, lint focalizado 0 y build 470 módulos exit 0.
TESTS PENDIENTES:     Idempotencia de `/complete`, concurrencia y suite backend completa antes de publicar; no se solicitará otra carga sólo para repetir una medición ya confirmada.
FALLO CONOCIDO:       Ningún fallo nuevo reportado por el propietario tras su prueba. Sigue la limitación previa de ADC local para firmar descargas GCS; no se ha medido numéricamente el desfase residual ni evaluado producción.
NEXT EXACT ACTION:    Si el propietario pide preparar publicación, auditar primero idempotencia/concurrencia y separar los archivos propios del WIP ajeno; si sigue ensayando, mantener 3000/5174 sin reinicios ni cambios de configuración.
DO NOT TOUCH:         `.env*`, credenciales/URLs firmadas, Virginia, `ARCHIVOS_APOYO` real, Render, Git remoto, LOB/4D, ViewerFacade, WIP ajeno. Sin commit, push ni deploy sin autorización explícita por acto.
COMMIT/HEAD REF:      `b03d0fb2e4be4013c460c746cb4415da9619e0f6` (sin commit propio; rama `main`).

[WIP HANDOFF]
TAREA:                Preparar para uso oficial el puente temporal ALEPHIA Docs→ACC por múltiples carpetas, sin publicar ni alterar el traductor normal.
IMPLEMENTADO:         Se comprobó que el vínculo ya se guarda independientemente en metadata de cada carpeta ALEPHIA y que sólo el administrador global puede configurarlo; una nueva versión de un archivo creado por el puente usa POST de versión del mismo item ACC. Se corrigió el cambio de destino: `_previous_acc_item` sólo reutiliza un item del mismo proyecto Y carpeta ACC, de modo que las versiones históricas mantienen su enlace y una versión nueva no escribe en la carpeta antigua. Se serializó `/api/uploads/complete` por sesión con advisory lock transaccional; el estado completed se marca antes de tareas secundarias y, si el proceso cayó tras guardar file_versions, la misma GCS URN permite recuperar la versión sin duplicarla. Sólo cambió código local; no se reinició el backend 3000, no se tocó ACC ni carpetas reales, y los cambios aún no están activos en el proceso Flask actual. Autodesk documenta POST Folder para crear carpetas y POST Version para nueva versión; no se implementó creación ni borrado espejo.
PENDIENTE:            1) Recibir decisión del propietario sobre borrar en ALEPHIA: conservar ACC (recomendado) o enviarlo también a papelera ACC; 2) concretar si desea creación automática sólo para subcarpetas de una pareja vinculada; 3) probar nueva versión y cambio de destino en datos de ensayo tras comprobar que no hay subidas activas y reiniciar local controladamente; 4) revisar límites del pool/concurrencia del advisory lock y recuperación de fallos externos antes de publicación; 5) suite backend completa y UAT de 10–20 parejas; 6) commit, push y despliegue sólo por autorizaciones explícitas separadas.
ARCHIVOS MODIFICADOS: propios de esta unidad: `backend/acc_emergency_bridge.py`, `backend/routes/uploads.py`, `backend/tests/test_acc_emergency_bridge.py`, `docs/AI_WORKSTATE.md`. Estas rutas ya contenían WIP anterior o siguen untracked. Todo otro WIP ajeno, `.env*` y protegidos quedaron intactos.
TESTS EJECUTADOS:     Takeover: `main`, HEAD `b03d0fb2e4be4013c460c746cb4415da9619e0f6`, baseline `cdf7837545747b3d39cd93ff070af30dd7aa7b9c` ancestro, archivos esperados WIP. `python -m pytest -q backend/tests/test_acc_emergency_bridge.py backend/tests/test_docs_acc_link.py backend/tests/test_estado_de_traduccion_en_la_lista.py` → 39/39, 2 avisos de deprecación; `python -m py_compile` de los tres Python modificados → OK; `git diff --check` focalizado → 0 errores, avisos LF/CRLF normales.
TESTS PENDIENTES:     Prueba real local de remapeo y nueva versión con ACC, suite completa, ensayo de carga concurrente; no se ejecutaron para no mutar ACC ni interrumpir 3000/5174 mientras sigue el ensayo. Pruebas de creación/borrado espejo inexistentes porque esas funciones aún no se implementaron.
FALLO CONOCIDO:       El backend 3000 aún ejecuta el código anterior hasta reinicio. `/complete` reduce la duplicación por concurrencia y recupera una versión guardada, pero no se ha sometido a estrés con el pool de 15 conexiones. El borrado de ALEPHIA es soft-delete y no tiene espejo ACC; la creación de carpetas tampoco. La limitación de ADC local para firmar descarga GCS ya estaba documentada.
NEXT EXACT ACTION:    Recibir la preferencia de borrado; inspeccionar sesiones pendientes sin alterar datos; si son cero y el propietario quiere continuar la UAT, reiniciar sólo backend local 3000 con la misma configuración temporal y ensayar nueva versión/remapeo en carpeta de prueba, nunca en `ARCHIVOS_APOYO` real.
DO NOT TOUCH:         `.env*`, `D:/copias-ecd/**`, credenciales, Virginia, `ARCHIVOS_APOYO` real, objetos ACC/GCS existentes, Render, Git remoto, LOB/4D, ViewerFacade y WIP ajeno. No commit, push, deploy, borrado remoto ni reinicio durante una subida por inferencia.
COMMIT/HEAD REF:      `b03d0fb2e4be4013c460c746cb4415da9619e0f6` (sin commit propio; rama `main`).

[WIP HANDOFF]
TAREA:                Limitar el puente manual por carpeta a formatos Autodesk y volver a mostrar «Procesando» al subir V2/V3 del mismo documento en ALEPHIA Docs.
IMPLEMENTADO:         El propietario descartó crear y borrar carpetas/archivos en ACC automáticamente; se conserva sólo la pareja manual por carpeta hasta cambio/desactivación. `is_bridge_candidate` ahora acepta DWG, DXF, DWF/DWFX, RVT/RFA y NWD/NWC, excluyendo IFC/DGN y otros formatos abiertos o ajenos sin tocar la traducción CAD habitual. En `MatrixTable.jsx` la identidad del sondeo incluye ID, versión y GCS URN: al cambiar V1→V2 con el mismo ID se vuelve a consultar `/api/docs/cad/estados`, que ya lee `current_version_id`; durante el estado pendiente se muestran spinner y «Procesando». El selector de carpeta queda visible para admin global en el modo `ensayo` de 5174 sin requerir `?acc_bridge=1`; el modo DEV normal que apunta a Virginia sigue ocultándolo. Se reinició sólo el backend local 3000 (nuevo PID 6008) con los flags temporales de puente/carga paralela, después de autorización expresa de que no había subidas; health 3000 y health vía `http://localhost:5174` respondieron `ok`. El frontend 5174 ya estaba vivo por `::1` (PID 16452); no se inició otro ni se cambió puerto. Sin nueva subida, escritura ACC, commit, push o deploy.
PENDIENTE:            UAT natural del propietario: subir V2/V3 de un formato Autodesk a una carpeta vinculada en el mismo 5174 y observar que aparece de nuevo «Procesando» hasta que ACC tenga vista lista; verificar estados de esa versión sin duplicar la subida. Antes de publicación, revisar límites de concurrencia del lock de `/complete`, suite backend completa y compatibilidad de la nueva versión remapeada. La creación/borrado espejo ACC queda explícitamente fuera de alcance.
ARCHIVOS MODIFICADOS: propios de esta unidad: `backend/acc_emergency_bridge.py`, `backend/tests/test_acc_emergency_bridge.py`, `frontend-docs/src/MatrixTable.jsx`, `frontend-docs/src/components/AccFolderBridge.jsx`, `frontend-docs/src/pages/FilesPage.jsx`, `frontend-docs/pruebas/accBridgeTemporal.prueba.mjs`, `docs/AI_WORKSTATE.md`. `backend/routes/uploads.py` conserva edición de la unidad previa, sin editar en esta unidad. Todos tenían WIP previo o siguen untracked; WIP ajeno preservado.
TESTS EJECUTADOS:     Takeover: rama `main`, HEAD `b03d0fb2e4be4013c460c746cb4415da9619e0f6`, baseline `cdf7837545747b3d39cd93ff070af30dd7aa7b9c` ancestro (exit 0), worktree focalizado esperado. Backend `python -m pytest -q backend/tests/test_acc_emergency_bridge.py backend/tests/test_docs_acc_link.py backend/tests/test_estado_de_traduccion_en_la_lista.py` → 39/39, 2 avisos; Docs `npm test` → 19/19 bancos; build Vite → 470 módulos, exit 0; ESLint de `MatrixTable.jsx` y `AccFolderBridge.jsx` → 0; health 3000 y 5174 → `ok`; `git diff --check` focalizado → 0 errores, avisos LF/CRLF normales. ESLint incluyendo `FilesPage.jsx` falló con 4 errores preexistentes en líneas 251, 1277, 1299 y 1334, ajenos a este cambio.
TESTS PENDIENTES:     UAT real de nueva versión en el navegador, suite backend completa y ensayo de concurrencia; no se subió un DWG por cuenta del agente ni se tocó ACC para fabricar el caso. No se corrigieron los 4 errores ajenos de lint de FilesPage.
FALLO CONOCIDO:       La corrección de UI no está validada con una V2 real todavía; el usuario debe comprobarla. ESLint total de FilesPage mantiene 4 errores antiguos. La base local y la cuenta ADC conservan las limitaciones de ensayo registradas antes, incluida la firma de descargas GCS. Nada se ha publicado.
NEXT EXACT ACTION:    Pedir al propietario probar una nueva versión Autodesk en la carpeta de ensayo ya vinculada del mismo `http://localhost:5174`; si no reaparece el círculo, consultar en sólo lectura la versión actual de `/api/docs/list` y su estado `/api/docs/cad/estados`, sin repetir la carga ni alterar el traductor normal.
DO NOT TOUCH:         `.env*`, `D:/copias-ecd/**`, credenciales, Virginia, carpetas reales de Docs, objetos ACC/GCS existentes, Render, Git remoto, LOB/4D, ViewerFacade y WIP ajeno. No crear/borrar carpetas ACC, ni commit/push/deploy sin autorización explícita por acto.
COMMIT/HEAD REF:      `b03d0fb2e4be4013c460c746cb4415da9619e0f6` (sin commit propio; rama `main`).

[WIP HANDOFF]
TAREA:                Hacer visible al administrador la vinculación de la carpeta ALEPHIA actual con ACC en Docs local 5174.
IMPLEMENTADO:         Se añadió un botón «Vincular ACC» junto a «Nueva carpeta» al entrar en una carpeta con ID. Abre el selector existente con ese ID exacto; desde allí se ve la configuración guardada y se puede elegir otro destino o desactivar. La visibilidad se limita a admin global (`esEntityAdmin` o role=admin de la sesión) en el modo ensayo; el servidor mantiene `_acc_admin_guard` para GET/PUT, así que el control UI no otorga permisos. El menú contextual anterior sigue disponible. No se modificó la creación/borrado de carpetas ACC, la subida CAD normal ni la configuración del puente. GET de la fuente transformada servida por `http://localhost:5174/src/pages/FilesPage.jsx` devolvió 200 y contiene el nuevo selector; health por 5174 → `ok`. No se tocó ACC, base de obra real, Git remoto ni Render.
PENDIENTE:            El propietario debe hacer F5 en la carpeta de ensayo y confirmar visualmente el botón y la apertura del selector bajo su sesión admin. Si no aparece, verificar sólo lectura si la sesión tiene role=admin y qué devuelve `/api/projects/{obra}/mi-administracion`, sin relajar `_acc_admin_guard` por inferencia. Sigue pendiente UAT real del círculo «Procesando» al subir una nueva versión Autodesk; antes de publicar, suite backend completa y revisión de concurrencia.
ARCHIVOS MODIFICADOS: propios de esta unidad: hunk del toolbar/guardia en `frontend-docs/src/pages/FilesPage.jsx`, aserciones en `frontend-docs/pruebas/accBridgeTemporal.prueba.mjs` y `docs/AI_WORKSTATE.md`. Estas rutas ya contenían WIP anterior; todo otro cambio sucio es ajeno o de unidades anteriores y se preservó.
TESTS EJECUTADOS:     Takeover: HEAD `b03d0fb2e4be4013c460c746cb4415da9619e0f6`, baseline `cdf7837545747b3d39cd93ff070af30dd7aa7b9c` ancestro (exit 0), archivos focalizados esperados. `npm test` Docs → 19/19 bancos; build Vite → 470 módulos, exit 0; GET `http://localhost:5174/api/health` → `ok`; GET fuente Vite de FilesPage → 200 y selector presente. `npx eslint src/pages/FilesPage.jsx` → 4 errores preexistentes de no-unused-vars en líneas 251, 1293, 1315 y 1350; no se corrigieron por ser ajenos.
TESTS PENDIENTES:     UAT visual autenticada del botón y selector; prueba de lector sin botón en navegador; UAT de V2 procesando. Sin subida, cambio de vínculo ni escritura remota de prueba por el agente.
FALLO CONOCIDO:       Todavía no está confirmado por el propietario que su sesión admin vea el botón tras F5. ESLint de FilesPage sigue con 4 errores antiguos. No hay publicación ni commit.
NEXT EXACT ACTION:    Esperar confirmación del propietario tras F5 en `ENSAYO_PUENTE_ACC_20260927`; si no ve «Vincular ACC», inspeccionar el rol de esa sesión y la respuesta de administración de esa obra antes de modificar permisos.
DO NOT TOUCH:         `.env*`, `D:/copias-ecd/**`, credenciales, Virginia, carpetas reales, objetos ACC/GCS, Render, Git remoto, LOB/4D, ViewerFacade y WIP ajeno. No crear/borrar en ACC ni commit/push/deploy sin autorización explícita por acto.
COMMIT/HEAD REF:      `b03d0fb2e4be4013c460c746cb4415da9619e0f6` (sin commit propio; rama `main`).

[WIP HANDOFF]
TAREA:                Afinar la visibilidad del vínculo por carpeta ACC y limpiar el lector de archivos del puente en Docs local.
IMPLEMENTADO:         El botón «Vincular ACC» se muestra sólo a administrador global, dentro de la carpeta ALEPHIA actual y con selección vacía; el guardia backend `_acc_admin_guard` sigue exigiendo administrador global para GET/PUT. La barra consulta sólo para ese administrador el vínculo de la carpeta actual y muestra proyecto/carpeta ACC; al cambiar o desactivar el vínculo se actualiza inmediatamente. En los archivos cuyo enlace procede del puente temporal se ocultan «Vista ACC · V?» y «Cambiar vista ACC»; para enlaces manuales y el ensayo de vista local se conserva el control anterior. Sin cambio de traducción, carpeta ACC, base de datos ni servicios.
PENDIENTE:            El propietario debe pulsar F5 en el mismo 5174 y confirmar visualmente tres estados: carpeta vinculada sin selección (destino visible), un archivo seleccionado (botón oculto) y lector de archivo del puente (sin rótulo ni cambio de vista). Sigue pendiente UAT de V2 «Procesando», auditoría de concurrencia/idempotencia y suite backend completa antes de plantear publicación.
ARCHIVOS MODIFICADOS: propios de esta unidad: `frontend-docs/src/pages/FilesPage.jsx`, `frontend-docs/src/components/AccFolderBridge.jsx`, `frontend-docs/src/components/DocumentViewer.jsx`, `frontend-docs/pruebas/accBridgeTemporal.prueba.mjs`, `frontend-docs/pruebas/accLinkLector.prueba.mjs`, `docs/AI_WORKSTATE.md`. Todos salvo el último ya contenían WIP anterior o son untracked. WIP ajeno intacto.
TESTS EJECUTADOS:     Takeover: `main`, HEAD `b03d0fb2e4be4013c460c746cb4415da9619e0f6`, baseline `cdf7837545747b3d39cd93ff070af30dd7aa7b9c` ancestro (exit 0), estado focalizado esperado. `npm test` Docs → 19/19 bancos al actualizar la aserción del lector; primera corrida 18/19 por la aserción anterior al nuevo guardia, fallo reconocido y corregido. `npm run build -- --outDir .build-acc-bridge-check` → 470 módulos, exit 0. GET `http://localhost:5174/api/health` → 200; fuente Vite de FilesPage → 200 y contiene destino y guardia de selección. `git diff --check` focalizado → 0 errores, avisos normales LF/CRLF. ESLint de los tres componentes → 4 errores antiguos no-unused-vars de FilesPage (líneas 251, 1315, 1337, 1372); los otros dos sin errores.
TESTS PENDIENTES:     UAT visual autenticada en 5174; V2 real del puente; suite backend completa y concurrencia. No se hizo carga, cambio de vínculo ni escritura remota de prueba por el agente.
FALLO CONOCIDO:       La UI nueva aún no está confirmada visualmente por el propietario. FilesPage conserva cuatro errores antiguos de ESLint ajenos a esta unidad. El ensayo local mantiene la limitación previa de ADC para firmar descargas GCS originales; nada se ha publicado.
NEXT EXACT ACTION:    Pedir al propietario F5 en la carpeta de ensayo vinculada de `http://localhost:5174`, verificar destino ACC visible sin selección y oculto al marcar un archivo, y abrir un DWG del puente para comprobar el lector sin controles ACC adicionales.
DO NOT TOUCH:         `.env*`, `D:/copias-ecd/**`, credenciales, Virginia, carpetas reales, objetos ACC/GCS, Render, Git remoto, LOB/4D, ViewerFacade y WIP ajeno. Sin commit, push ni deploy sin autorización explícita por acto.
COMMIT/HEAD REF:      `b03d0fb2e4be4013c460c746cb4415da9619e0f6` (sin commit propio; rama `main`).

[WIP HANDOFF]
TAREA:                Registrar la aceptación del propietario de la UI local del vínculo ACC por carpeta.
IMPLEMENTADO:         El propietario confirmó «okey ahora si. asi quisiera que quede» después de probar en `localhost:5174` los últimos ajustes de visibilidad y lector del puente. Se conserva exactamente ese comportamiento local; no se cambió código funcional, dato ni servicio en esta unidad.
PENDIENTE:            El puente temporal completo sigue sin commit ni publicación; antes de cualquier release quedan la UAT de V2 «Procesando», la auditoría de concurrencia/idempotencia y la suite backend completa. Commit, push y deploy requieren autorización explícita y separada por acto.
ARCHIVOS MODIFICADOS: propio de esta unidad: `docs/AI_WORKSTATE.md` solamente. Los cambios funcionales WIP de Docs y el resto del worktree se preservaron intactos.
TESTS EJECUTADOS:     Aceptación visual del propietario en 5174, sin mediciones adicionales; takeover: rama `main`, HEAD `b03d0fb2e4be4013c460c746cb4415da9619e0f6`, baseline `cdf7837545747b3d39cd93ff070af30dd7aa7b9c` ancestro (exit 0), estado focalizado esperado. En unidad anterior: Docs 19/19 bancos y build 470 módulos, exit 0.
TESTS PENDIENTES:     Ninguna prueba adicional para este ajuste UI ya aceptado; UAT V2, concurrencia y suite backend completa siguen pendientes para el puente general.
FALLO CONOCIDO:       Ningún fallo nuevo reportado por el propietario para estos controles; persisten cuatro errores antiguos de ESLint en FilesPage y la limitación ADC local de descargas GCS ya documentada. Nada se ha publicado.
NEXT EXACT ACTION:    Mantener 3000/5174 y la configuración local como están mientras el propietario continúe probando; abordar la próxima solicitud sin cambiar esta UI aceptada ni preparar publicación por inferencia.
DO NOT TOUCH:         `.env*`, `D:/copias-ecd/**`, credenciales, Virginia, carpetas reales, objetos ACC/GCS, Render, Git remoto, LOB/4D, ViewerFacade y WIP ajeno. Sin commit, push ni deploy sin autorización explícita por acto.
COMMIT/HEAD REF:      `b03d0fb2e4be4013c460c746cb4415da9619e0f6` (sin commit propio; rama `main`).

[WIP HANDOFF]
TAREA:                Aclarar el alcance del ensayo local y auditar la ruta de confirmación de subidas antes de plantear commit del puente.
IMPLEMENTADO:         Se confirmó que `5174` sirve el mismo código local de `frontend-docs`, pero en modo `dev:ensayo` consulta al backend local `3000` y al proyecto `PQT8 TALARA (PRUEBAS)`; no se ha probado el puente en el expediente real. La ruta `/api/uploads/complete` ahora aplica `guardia_de_recurso('upload_sessions', upload_id)` antes del advisory lock y conserva la comprobación interna de proyecto; prueba nueva demuestra rechazo 403 de sesión ajena sin tomar lock. Sólo código local, sin reinicio de 3000/5174 ni acceso de escritura a ACC o datos reales.
PENDIENTE:            Auditar el bloqueo de confirmación con cargas concurrentes: el advisory lock mantiene una conexión del pool (máximo 15) mientras `_complete_upload_locked` puede llamar a ACC con timeout de 300 s; diseñar una alternativa acotada antes de declarar escalabilidad. Investigar sin maquillar los dos fallos restantes de suite (ruta de miniaturas sin puerta de cliente; perfil portal 289 rutas contra techo 286), separando WIP ajeno del puente. UAT V2 «Procesando» aún pendiente. No borrar carpeta/DWG de ensayo hasta acordar destinos exactos; commit, push y deploy requieren autorización separada por acto.
ARCHIVOS MODIFICADOS: propios de esta unidad: `backend/routes/uploads.py` (contiene WIP previo), `backend/tests/test_acc_emergency_bridge.py` (untracked de WIP previo), `docs/AI_WORKSTATE.md`. Todo otro WIP, UI aceptada y ficheros protegidos intactos.
TESTS EJECUTADOS:     Takeover: `main`, HEAD `b03d0fb2e4be4013c460c746cb4415da9619e0f6`, baseline `cdf7837545747b3d39cd93ff070af30dd7aa7b9c` ancestro (exit 0), worktree focalizado esperado. Suite oficial inicial `python -m pytest -q`: 2101 pasaron, 4 fallaron, 2 avisos; dos fallos eran la guardia ausente en el cuerpo de `/api/uploads/complete`. Tras el cambio, cinco módulos focalizados: 54/54 pasaron, 2 avisos; suite oficial repetida: 2104 pasaron, 2 fallaron, 2 avisos en 80 s. `python -m py_compile` de los dos Python editados → OK; `git diff --check` focalizado → 0 errores, avisos LF/CRLF normales.
TESTS PENDIENTES:     Ensayo de concurrencia sin escribir datos reales, UAT V2, resolución fundamentada de los dos fallos globales; pruebas de publicación inexistentes porque nada se publicó.
FALLO CONOCIDO:       `test_capacidades_con_puerta` exige cliente para `/api/docs/miniaturas/preparar`; `test_perfil_portal` ve 289 rutas contra techo 286. La conexión de lock puede agotar el pool bajo múltiples confirmaciones lentas. No se ajustaron umbrales ni se atribuyeron los fallos a una causa no comprobada.
NEXT EXACT ACTION:    Revisar la vida de la conexión del advisory lock y preparar una prueba simulada de múltiples confirmaciones; después identificar las tres rutas que explican el exceso del perfil portal antes de decidir cambios. Mantener 3000/5174 activos para el propietario.
DO NOT TOUCH:         `.env*`, `D:/copias-ecd/**`, credenciales, Virginia, expediente real, carpetas/archivos ACC o GCS, Render, Git remoto, LOB/4D, ViewerFacade y WIP ajeno. Sin borrado, commit, push ni deploy sin autorización explícita por acto.
COMMIT/HEAD REF:      `b03d0fb2e4be4013c460c746cb4415da9619e0f6` (sin commit propio; rama `main`).

[WIP HANDOFF]
TAREA:                Delimitar que sólo la funcionalidad temporal de vincular carpeta Docs→ACC se preparará para commit y que los proyectos de ensayo se limpiarán después.
IMPLEMENTADO:         Se confirmó al propietario que la UAT en `PQT8 TALARA (PRUEBAS)` valida código local compartido, no implica sustituir ni copiar el proyecto real. Auditoría de sólo lectura de hunks: el puente toca rutas y componentes compartidos, y esos ficheros incluyen otros cambios sucios ajenos (p. ej. `frontend-docs/src/App_Refactor.jsx` trata sesión, `frontend-docs/src/utils/apiFetch.js` trata errores HTML, `frontend-docs/vite.config.js` trata origen de desarrollo); por eso no es seguro preparar un commit con ficheros completos o `git add -A`. No se borró ningún proyecto ni objeto.
PENDIENTE:            Separar por hunk las modificaciones estrictamente necesarias del puente y sus pruebas, conservar WIP ajeno sin stage, y resolver concurrencia/fallos de suite antes de solicitar autorización explícita para un commit. Después, inventariar IDs exactos del proyecto local de ensayo, sus objetos GCS y los DWG añadidos por esta prueba al proyecto ACC existente; el propietario confirmó que quiere limpiar ambos conjuntos. Borrar sólo IDs comprobados como datos de ensayo nuestros, sin tocar el proyecto/carpeta ACC que ya existían ni DWG anteriores o de terceros.
ARCHIVOS MODIFICADOS: propio de esta unidad: `docs/AI_WORKSTATE.md` únicamente; `backend/routes/uploads.py` y su test conservan el cambio de guardia de la unidad anterior, sin nueva edición. El resto del worktree sucio intacto.
TESTS EJECUTADOS:     Takeover: `main`, HEAD `b03d0fb2e4be4013c460c746cb4415da9619e0f6`, baseline `cdf7837545747b3d39cd93ff070af30dd7aa7b9c` ancestro (exit 0), rutas focalizadas esperadas. `git diff --numstat` y hunks focalizados inspeccionados en sólo lectura. Suite previa: 2104 pasaron, 2 fallaron; no se repitió al no cambiar código funcional.
TESTS PENDIENTES:     Concurrencia/idempotencia, dos fallos globales de suite, UAT V2 y validación del paquete exacto antes de commit.
FALLO CONOCIDO:       Los ficheros compartidos contienen cambios mixtos y un commit por lista de archivos completa arrastraría trabajo fuera de alcance. Persisten los dos fallos de suite y el riesgo de conexión larga del advisory lock; ningún dato real ni de ensayo se borró.
NEXT EXACT ACTION:    Preparar un manifiesto de hunks exclusivos del puente y una prueba simulada de concurrencia; antes de limpiar, inventariar por ID y procedencia el proyecto local y los DWG de prueba en ACC, excluyendo archivos preexistentes. No cambiar `5174` ni el proyecto real.
DO NOT TOUCH:         `.env*`, `D:/copias-ecd/**`, credenciales, Virginia, proyecto real, carpeta ACC existente, objetos ACC/GCS sin inventario, Render, Git remoto, LOB/4D, ViewerFacade y WIP ajeno. No borrar, commitear, subir ni desplegar por inferencia.
COMMIT/HEAD REF:      `b03d0fb2e4be4013c460c746cb4415da9619e0f6` (sin commit propio; rama `main`).

[WIP HANDOFF]
TAREA:                Aclarar qué significa ver el puente en el local principal con las carpetas reales antes de cualquier commit.
IMPLEMENTADO:         Se confirmó por código que `npm run dev:ensayo` en `5174` consulta el backend local `3000` y su proyecto de ensayo, mientras `npm run dev` en el mismo árbol de fuentes consulta el backend Virginia con las carpetas reales. El puente nuevo guarda su configuración en la base que usa el backend; Virginia aún no tiene las rutas nuevas. Por ello cambiar sólo Vite al modo habitual mostraría las carpetas reales pero no haría funcionar el vínculo ACC. No se cambiaron procesos, conexiones, datos ni código funcional.
PENDIENTE:            El propietario confirmó que por «local principal» quiere ver las carpetas reales en `5174`, pero aún debe decidir entre una vista previa de UI sin escritura real y conectar el backend local a datos reales para guardar/probar una pareja de carpetas, lo cual afectaría producción. Esa segunda opción requiere autorización explícita de alcance y protección antes de actuar. Sigue pendiente el manifiesto de hunks, concurrencia y limpieza posterior del proyecto local de ensayo y sólo los DWG originados por la prueba en ACC.
ARCHIVOS MODIFICADOS: propio de esta unidad: `docs/AI_WORKSTATE.md` únicamente. WIP funcional y ajeno intactos.
TESTS EJECUTADOS:     Takeover: rama `main`, HEAD `b03d0fb2e4be4013c460c746cb4415da9619e0f6`, baseline `cdf7837545747b3d39cd93ff070af30dd7aa7b9c` ancestro (exit 0), rutas focalizadas esperadas. Configuración Vite y guardias/rutas del puente inspeccionadas en código. No se corrieron tests nuevos por no haber cambios funcionales.
TESTS PENDIENTES:     Vista funcional con datos reales requiere decisión y autorización; concurrencia, dos fallos de suite y UAT V2 siguen pendientes.
FALLO CONOCIDO:       El backend Virginia no contiene este puente WIP; mostrar las carpetas reales con el frontend local por sí solo no permite configurar el vínculo. No se debe sugerir que el código local ya funciona sobre el expediente real.
NEXT EXACT ACTION:    Solicitar al propietario elegir vista previa sin escritura real o prueba funcional acotada contra datos reales, explicando que ésta cambia producción; no cambiar el origen de `5174` ni conectar `3000` a Virginia antes de esa elección.
DO NOT TOUCH:         `.env*`, `D:/copias-ecd/**`, credenciales, Virginia en escritura, expediente real, carpeta ACC existente, objetos ACC/GCS, Render, Git remoto, LOB/4D, ViewerFacade y WIP ajeno. Sin commit, push, deploy o borrado por inferencia.
COMMIT/HEAD REF:      `b03d0fb2e4be4013c460c746cb4415da9619e0f6` (sin commit propio; rama `main`).

[WIP HANDOFF]
TAREA:                Mostrar en el mismo `localhost:5174` la posición del botón ACC sobre las carpetas reales antes de cualquier commit, sin guardar vínculos en Virginia.
IMPLEMENTADO:         El propietario confirmó que no había subidas en curso. Se detuvo únicamente Vite `--mode ensayo` en `::1:5174` (PID 16452) y se inició Vite en modo habitual sobre el mismo puerto (PID 26564); el backend local 3000 (PID 6008) no se reinició ni cambió. `GET http://localhost:5174/api/health` devolvió `status=ok`, versión Virginia `802ff0de5393`, rama `main`. Se abrió la misma pestaña IAB en `http://localhost:5174/?obra=1` y se verificó visualmente que muestra el login normal, sin datos de ensayo. En `frontend-docs/src/pages/FilesPage.jsx` el admin ve el botón en modo DEV habitual, pero deshabilitado con «Vista local · sin guardar»; no llama al GET/PUT de configuración ni abre el menú contextual ACC en ese modo. `dev:ensayo` conserva el selector funcional anterior. Tras la solicitud del propietario de controlar Vite desde VS Code, se confirmó que PID 26564 era este Vite y se detuvo sólo ese proceso; `::1:5174` quedó libre. No hubo escrituras a Virginia, ACC o GCS ni commit, push o deploy.
PENDIENTE:            El propietario debe ejecutar `npm run dev` en su terminal de VS Code dentro de `frontend-docs`; luego puede usar `http://localhost:5174/?obra=1` y verificar las carpetas reales y el botón ACC deshabilitado al entrar en una carpeta como admin. El vínculo persistente real no se puede probar sobre Virginia hasta disponer de backend compatible y autorización expresa para afectar datos reales. Siguen pendientes UAT V2, revisión de concurrencia, dos fallos globales de suite y limpieza inventariada del proyecto local de ensayo y sólo DWG creados por la prueba en ACC.
ARCHIVOS MODIFICADOS: propios de esta unidad: `frontend-docs/src/pages/FilesPage.jsx`, `frontend-docs/pruebas/accBridgeTemporal.prueba.mjs`, `docs/AI_WORKSTATE.md`; rutas ya contenían WIP anterior. WIP ajeno y `.env*` intactos.
TESTS EJECUTADOS:     Takeover: `main`, HEAD `b03d0fb2e4be4013c460c746cb4415da9619e0f6`, baseline `cdf7837545747b3d39cd93ff070af30dd7aa7b9c` ancestro (exit 0). `npm test` Docs → 19/19 bancos; `npm run build -- --outDir .build-acc-bridge-check` → 470 módulos, exit 0; `git diff --check` focalizado → 0 errores. GET raíz 5174 y fuente transformada FilesPage → 200; health vía 5174 → Virginia `802ff0de5393`; inspección IAB → login normal. ESLint FilesPage → 4 errores antiguos no-unused-vars (252, 1320, 1342, 1377), ajenos al cambio. GET pending sin credencial → 401; la confirmación de ausencia de subidas fue del propietario. `Get-NetTCPConnection` y proceso PID 26564 → Vite de este agente, detenido; puerto 5174 libre después.
TESTS PENDIENTES:     UAT visual autenticada de carpetas reales y botón deshabilitado; UAT V2, dos fallos globales de suite backend y concurrencia del puente. No se probó escritura en Virginia.
FALLO CONOCIDO:       La pestaña IAB requiere login del propietario para ver carpetas reales; Virginia carece de las rutas del puente, de modo que la vista previa ACC no puede guardar. Cuatro errores antiguos de ESLint en FilesPage.
NEXT EXACT ACTION:    Indicar al propietario ejecutar `npm run dev` en su terminal de VS Code en `D:\VISOR_APS_TL\frontend-docs`; cuando Vite indique `localhost:5174`, recargar la pestaña y verificar las carpetas reales y el control ACC de sólo vista previa.
DO NOT TOUCH:         `.env*`, `D:/copias-ecd/**`, credenciales, Virginia en escritura, expediente real, carpeta ACC existente, objetos ACC/GCS, Render, Git remoto, LOB/4D, ViewerFacade y WIP ajeno. No commit, push, deploy ni borrado.
COMMIT/HEAD REF:      `b03d0fb2e4be4013c460c746cb4415da9619e0f6` (sin commit propio; rama `main`).

[WIP HANDOFF]
TAREA:                Activar el puente ACC ya probado en Docs local con las carpetas reales, sin otra carga de prueba ni publicación.
IMPLEMENTADO:         Auditoría sólo lectura: `frontend-docs/vite.config.js` dirige `npm run dev` en 5174 al backend Virginia y `dev:ensayo` al backend 3000. El backend local 3000 conserva los datos de ensayo en PostgreSQL local 5433; no hay listener local 5432. La vinculación guarda JSON en `file_nodes.metadata` y la subida paralela necesita las rutas y flags del backend nuevo. Por tanto, cambiar sólo el frontend no habilita un vínculo persistente sobre las carpetas reales. El propietario ejecuta ahora su propio Vite 5174 (PID 21168); no se reinició ni tocó. No hubo consultas autenticadas ni escritura de datos, ni commit, push o deploy.
PENDIENTE:            Conectar de forma segura el backend local al mismo PostgreSQL y GCS de las carpetas reales, con identidad de aplicación y credenciales introducidas por el propietario, y sólo después apuntar el mismo 5174 a ese backend local y habilitar el puente. No ejecutar subidas ni vínculos de prueba por petición expresa. Como alternativa posterior, desplegar el backend compatible requiere autorización separada; no está autorizada ahora.
ARCHIVOS MODIFICADOS: propio de esta unidad: `docs/AI_WORKSTATE.md` únicamente. WIP funcional/ajeno intacto; `.env*` no se leyó ni cambió.
TESTS EJECUTADOS:     Takeover: `main`, HEAD `b03d0fb2e4be4013c460c746cb4415da9619e0f6`, baseline `cdf7837545747b3d39cd93ff070af30dd7aa7b9c` ancestro (exit 0); `git status --short` y lectura focalizada de `vite.config.js`, `db.py`, `docs_cad.py`, `acc_emergency_bridge.py`; listeners 3000/5174/5433 confirmados. No se ejecutó carga ni prueba funcional por petición del propietario.
TESTS PENDIENTES:     Configuración y comprobación de conexión segura del backend local a datos reales; UAT de vínculo y V2 queda a cargo del propietario si decide hacerla; concurrencia y dos fallos globales de suite backend previamente reportados.
FALLO CONOCIDO:       El backend de Virginia no tiene las rutas nuevas; el backend local usa DB de ensayo. La función aún no está activa en el 5174 real. Encender sólo el control frontend crearía una falsa promesa de funcionamiento.
NEXT EXACT ACTION:    Acordar con el propietario el mecanismo seguro para que el backend local use la base real sin leer ni transmitir su contraseña; sólo entonces configurar el proceso local y el proxy del mismo 5174, sin ejecutar pruebas de carga ni publicar.
DO NOT TOUCH:         `.env*`, `D:/copias-ecd/**`, credenciales, Virginia en escritura sin alcance autorizado, carpeta ACC existente, objetos ACC/GCS, Render, Git remoto, LOB/4D, ViewerFacade y WIP ajeno. No commit, push, deploy ni subida de prueba.
COMMIT/HEAD REF:      `b03d0fb2e4be4013c460c746cb4415da9619e0f6` (sin commit propio; rama `main`).

[WIP HANDOFF]
TAREA:                Conservar en el proyecto local principal sólo el código del puente Docs→ACC ya validado en el ensayo, sin vincular carpetas reales ahora.
IMPLEMENTADO:         El propietario corrigió expresamente la interpretación anterior: no quiere usar `5174` para vincular una carpeta real hoy ni conectar el backend local a la DB de Virginia. Quiere que el flujo normal permanezca intacto y que la función probada quede agregada al mismo árbol de código local para una publicación futura que decidirá él. El código del puente ya está en este único checkout: `frontend-docs` y `backend`, no en una segunda copia de proyecto. Se dejó intacto el servidor VS Code `5174` y el backend 3000, y no se hicieron pruebas, subidas, vínculos, escrituras reales, commits ni despliegues. Este bloque revoca el NEXT EXACT ACTION del handoff anterior de conectar la DB real.
PENDIENTE:            Hacer auditoría final focalizada del código WIP del puente y aislar sus cambios de trabajo ajeno, sin reabrir el flujo normal ni probar archivos reales. Sólo cuando el propietario lo pida, preparar un commit por lista/hunks exactos; publicar es una autorización posterior separada. La limpieza del proyecto local de ensayo y de DWG creados por la prueba en ACC sigue pendiente de inventario exacto.
ARCHIVOS MODIFICADOS: propio de esta unidad: `docs/AI_WORKSTATE.md` únicamente. WIP funcional y ajeno intactos; `.env*` no se leyó ni modificó.
TESTS EJECUTADOS:     Ninguno nuevo: el propietario indicó que la funcionalidad ya fue probada y pidió no repetir pruebas. Se leyó el handoff anterior para corregir el objetivo, sin tocar servicios ni datos.
TESTS PENDIENTES:     Auditoría focalizada de integración/alcance; concurrencia y los dos fallos globales de suite backend previamente reportados. No repetir UAT real sin petición.
FALLO CONOCIDO:       El `5174` actual consulta Virginia y por eso el control ACC permanece como vista previa; esto no impide conservar el código local para la futura publicación. No afirmar que el puente funciona ya en el backend vivo de Virginia.
NEXT EXACT ACTION:    Revisar exclusivamente los hunks de la funcionalidad Docs→ACC en el checkout principal y confirmar que la subida/traducción normal no fue sustituida, sin conectar datos reales, sin crear otro local y sin commit.
DO NOT TOUCH:         `.env*`, `D:/copias-ecd/**`, credenciales, Virginia en escritura, expediente real, carpeta ACC existente, objetos ACC/GCS sin inventario, Render, Git remoto, LOB/4D, ViewerFacade y WIP ajeno. Sin pruebas de subida, commit, push, deploy ni borrado por inferencia.
COMMIT/HEAD REF:      `b03d0fb2e4be4013c460c746cb4415da9619e0f6` (sin commit propio; rama `main`).

[WIP HANDOFF]
TAREA:                Habilitar el botón «Vincular ACC» en el frontend local principal a petición expresa del propietario, sin usar datos reales.
IMPLEMENTADO:         En `FilesPage.jsx` se retiró el guardia temporal `accBridgeBackendReady`, el `disabled` y el rótulo «Vista local · sin guardar». El botón ahora abre el selector para admins al entrar en una carpeta sin seleccionar archivos; el menú contextual y el estado de carpeta usan la misma condición de admin. La subida y traducción normales no se editaron. El Vite del propietario siguió en `localhost:5174`; GET del módulo transformado devolvió 200 y contiene el botón sin rótulo temporal. No se abrió el selector con sesión real, no se guardó vínculo, no se subió archivo, ni se hizo commit/push/deploy.
PENDIENTE:            El propietario puede pulsar F5 y comprobar el botón. El backend Virginia aún carece de estas rutas, por lo que abrir el selector puede mostrar un error y guardar un vínculo real no está disponible; la UI habilitada no demuestra integración de extremo a extremo. Auditar hunks exclusivos del puente y concurrencia antes de cualquier publicación que el propietario autorice por separado.
ARCHIVOS MODIFICADOS: propios de esta unidad: `frontend-docs/src/pages/FilesPage.jsx`, `frontend-docs/pruebas/accBridgeTemporal.prueba.mjs`, `docs/AI_WORKSTATE.md`. WIP anterior en esas rutas y WIP ajeno preservados; `.env*` intactos.
TESTS EJECUTADOS:     `node pruebas/accBridgeTemporal.prueba.mjs` → exit 0; `npm run build -- --outDir .build-acc-bridge-check` → 470 módulos, exit 0 (avisos de imports mixtos no bloqueantes); `git diff --check` focalizado → exit 0, aviso normal LF/CRLF; GET `http://localhost:5174/src/pages/FilesPage.jsx` → 200, botón presente y rótulo temporal ausente. Ninguna prueba con archivos o datos reales.
TESTS PENDIENTES:     UAT visual del propietario tras F5; conexión real del backend, concurrencia y dos fallos globales de suite backend previos. No se ejecutará carga de prueba por el agente sin nueva petición.
FALLO CONOCIDO:       El backend que atiende el 5174 habitual es el de Virginia, que no tiene aún `acc-bridge/folder`; por tanto el selector puede fallar al cargar y no puede persistir un vínculo ahora. Esto no afecta a «Cargar archivos» habitual.
NEXT EXACT ACTION:    Indicar al propietario pulsar F5 en su `localhost:5174` para ver el botón activo, advirtiendo que guardar no funcionará hasta que el backend Virginia ejecute el puente; no ejecutar vínculos ni subidas por él.
DO NOT TOUCH:         `.env*`, `D:/copias-ecd/**`, credenciales, Virginia en escritura, expediente real, carpeta ACC existente, objetos ACC/GCS, Render, Git remoto, LOB/4D, ViewerFacade y WIP ajeno. Sin commit, push, deploy ni pruebas de subida.
COMMIT/HEAD REF:      `b03d0fb2e4be4013c460c746cb4415da9619e0f6` (sin commit propio; rama `main`).

[WIP HANDOFF]
TAREA:                Preparar con cuidado el alcance mínimo del puente Docs→ACC para una futura publicación, sin romper la subida normal ni efectuar actos externos.
IMPLEMENTADO:         TAKEOVER conforme al estado operativo actual: rama main, baseline ancestro y worktree focalizado previsto. Se auditó el cableado: `frontend-docs` ofrece selector admin y estado por versión; `backend/routes/docs_cad.py` agrega consulta/vínculo/carpeta/reintento; `backend/routes/uploads.py` y `backend/routes/documents.py` mantienen la ruta GCS normal y sólo bifurcan a ACC con carpeta exacta vinculada y formato Autodesk; `backend/acc_emergency_bridge.py` tiene el cortacircuito apagado por defecto y registra el trabajo en metadata JSON existente, sin DDL nuevo. Se detectó y retiró un comentario ya falso en `frontend-docs/src/pages/FilesPage.jsx` que decía que el selector normal no enviaba acciones, después de que el propietario pidió habilitar el botón. No se tocó ninguna base, bucket, ACC ni servidor, ni hubo commit/push/deploy.
PENDIENTE:            No preparar commit todavía. Primero demostrar o descartar con un banco simulado el riesgo de agotamiento del pool en `/api/uploads/complete`: Render configura 1 worker/8 threads (`backend/package.json`), `db.py` abre 2–15 conexiones por proceso y cada confirmación retiene un advisory-lock connection mientras `_complete_upload_locked` obtiene otras conexiones y puede esperar APS/GCS. Resolver sin alterar el flujo GCS normal; luego aislar por hunk los archivos mixtos (al menos `backend/file_system_db.py` tiene un cambio de permisos ajeno; `frontend-docs/src/pages/FilesPage.jsx` y `DocumentViewer.jsx` tienen WIP superpuesto), sin staging amplio. La suite general tiene dos fallos previos, que deben declararse y analizarse antes de afirmar GREEN. Limpieza del ensayo/ACC sólo tras inventario exacto y nueva instrucción. Publicar requiere permisos separados.
ARCHIVOS MODIFICADOS: propios de esta unidad: sólo `frontend-docs/src/pages/FilesPage.jsx` (retirado comentario obsoleto) y `docs/AI_WORKSTATE.md` (este handoff). El puente WIP en `backend/acc_emergency_bridge.py`, `backend/enlaces_firmados.py`, `backend/file_system_db.py`, `backend/routes/docs_cad.py`, `backend/routes/documents.py`, `backend/routes/uploads.py`, `frontend-docs/src/MatrixTable.jsx`, `frontend-docs/src/components/AccFolderBridge.jsx`, `frontend-docs/src/components/ContextMenu.jsx`, `frontend-docs/src/components/DocumentViewer.jsx`, `frontend-docs/src/hooks/useChunkedUpload.js`, `frontend-docs/src/pages/FilesPage.jsx`, `frontend-docs/src/utils/accParallelUpload.js` y pruebas asociadas ya existía en el worktree; WIP ajeno y `.env*` intactos.
TESTS EJECUTADOS:     `git status --short`, `git rev-parse HEAD`, `git log --oneline -10`, `git merge-base --is-ancestor cdf7837545747b3d39cd93ff070af30dd7aa7b9c HEAD` → 0/ancestro. `python -m pytest -q` → 2104 aprobadas, 2 fallidas, 2 avisos en 75,88 s: `test_toda_capacidad_de_administrador_tiene_puerta` por `/api/docs/miniaturas/preparar` sin llamador y `test_el_recorte_es_real` por 289 rutas portal con techo `<286`. No se alteraron tests ni umbrales. `python -m pytest -q backend/tests/test_acc_emergency_bridge.py backend/tests/test_docs_acc_link.py backend/tests/test_estado_de_traduccion_en_la_lista.py` → 40/40, 2 avisos. Docs `npm test` → 19/19 bancos; `npm run build -- --outDir .build-acc-bridge-check` → 470 módulos, exit 0 con avisos de imports mixtos; `python -m py_compile` de Python focalizados → 0; `git diff --check` focalizado → 0 errores, avisos normales LF/CRLF. No se hizo UAT con archivos ni datos reales.
TESTS PENDIENTES:     Banco de concurrencia/pool de `/api/uploads/complete`; frontera de paquete aislada y build desde ese conjunto (el build actual incluye WIP ajeno); UAT posterior del propietario si la pide. No se repetirán cargas reales por inferencia.
FALLO CONOCIDO:       La suite backend completa no es GREEN por dos fallos arriba. Posible agotamiento de pool con 8 confirmaciones simultáneas (cada una retiene una conexión de lock y pide más; máximo 15); todavía no hay medición de este caso. El botón local 5174 está activo por petición del propietario, pero Virginia aún carece de la ruta y puede mostrar error al abrir el selector. No equiparar éxito del build WIP con seguridad de publicación.
NEXT EXACT ACTION:    Escribir y ejecutar un banco simulado de ocho confirmaciones concurrentes que modele el pool 15 sin tocar DB/GCS/ACC reales; usar su resultado para decidir un arreglo focalizado de `/api/uploads/complete` antes de aislar el paquete de release.
DO NOT TOUCH:         `.env*`, `D:/copias-ecd/**`, credenciales, Virginia en escritura, expediente real, carpeta ACC existente, objetos ACC/GCS, Render, Git remoto, frontend-react/LOB/4D/ViewerFacade y WIP ajeno. No commit, push, deploy ni subida de prueba sin autorización separada.
COMMIT/HEAD REF:      `b03d0fb2e4be4013c460c746cb4415da9619e0f6` (sin commit propio; rama `main`).

[WIP HANDOFF]
TAREA:                Verificar si el puente temporal Docs→ACC está listo para una publicación futura sin alterar el proyecto real.
IMPLEMENTADO:         Auditoría read-only repetida: estado operativo y baseline coinciden; el puente y Docs pasan sus bancos focalizados y el portal compila. Se identificó el origen concreto de los dos fallos de la suite general: miniaturas ya presente en HEAD, y cuatro rutas ACC nuevas que hacen superar la alarma de perímetro del perfil portal. Se confirmó por inspección el riesgo de concurrencia de `uploads/complete` (8 threads, pool 15, dos conexiones simultáneas mínimas por confirmación), todavía sin medición simulada. Ningún cambio funcional ni acto externo.
PENDIENTE:            Crear y correr banco local simulado de ocho confirmaciones; resolver si reproduce agotamiento del pool, aislar hunks exclusivamente del puente respecto del WIP ajeno y justificar el perímetro de rutas sin modificar el umbral a ciegas. Sólo entonces preparar una propuesta de release para autorización separada; queda pendiente el inventario y limpieza autorizada del ensayo/ACC.
ARCHIVOS MODIFICADOS: propio de esta unidad: `docs/AI_WORKSTATE.md` (estado y este handoff). Todos los archivos funcionales del puente y los WIP ajenos quedaron intactos; `.env*` no se leyó ni modificó.
TESTS EJECUTADOS:     `python -m pytest -q backend/tests/test_acc_emergency_bridge.py backend/tests/test_docs_acc_link.py backend/tests/test_estado_de_traduccion_en_la_lista.py` → 40/40; `npm test` en frontend-docs → 19/19 bancos; `npm run build -- --outDir .build-acc-bridge-check` → 470 módulos, exit 0; `python -m pytest -q` → 2104 aprobadas, 2 fallidas, 2 avisos en 75,59 s; `git diff --check` focalizado → exit 0 con avisos normales LF/CRLF; takeover rama main/HEAD b03d0fb y baseline cdf7837 ancestro → confirmado.
TESTS PENDIENTES:     Concurrencia simulada de `/api/uploads/complete`; build y suite del paquete aislado sin WIP ajeno; UAT real sólo si el propietario la pide y autoriza escrituras específicas.
FALLO CONOCIDO:       Suite completa roja: capacidad admin `/api/docs/miniaturas/preparar` sin pantalla (preexistente en HEAD) y 289 rutas portal frente a techo `<286` tras cuatro rutas ACC. Posible agotamiento del pool bajo ocho confirmaciones concurrentes; aún no medido. `5174` sigue consultando Virginia, cuyo backend carece del puente.
NEXT EXACT ACTION:    Escribir y ejecutar un banco simulado, sin DB/GCS/ACC reales, con ocho llamadas concurrentes a `/api/uploads/complete` y un pool de capacidad 15; usar el resultado para decidir el arreglo focalizado antes de aislar el release.
DO NOT TOUCH:         `.env*`, `D:/copias-ecd/**`, credenciales, Virginia en escritura, expediente real, carpeta ACC existente, objetos ACC/GCS, Render, Git remoto, LOB/4D/ViewerFacade y WIP ajeno. Sin commit, push, deploy ni carga real por inferencia.
COMMIT/HEAD REF:      `b03d0fb2e4be4013c460c746cb4415da9619e0f6` (sin commit propio; rama `main`).

[WIP HANDOFF]
TAREA:                Preparar exclusivamente el backend del puente temporal Docs→ACC para una publicación futura autorizada.
IMPLEMENTADO:         Un banco local de ocho confirmaciones con pool simulado de 15 reprodujo 1 respuesta 500 antes del arreglo. Se agregó `BoundedSemaphore(5)` alrededor de `/api/uploads/complete`, manteniendo el lock por sesión, y el mismo banco pasó. El puente mantiene sus dos flags apagados por defecto y sólo actúa en carpetas exactas vinculadas y formatos Autodesk; la ruta CAD normal sigue en el `else`. Se auditó la frontera backend sin staging: `acc_emergency_bridge.py`, `enlaces_firmados.py`, `routes/docs_cad.py`, `routes/documents.py`, `routes/uploads.py`, callback del puente en `file_system_db.py`, y bancos. El hunk de permisos de `file_system_db.py` es ajeno y debe excluirse de cualquier release del puente. No se tocó Virginia, ACC, GCS, procesos, frontend ni Git remoto.
PENDIENTE:            Preparar un paquete realmente aislado por hunks, incluyendo sólo el callback de `file_system_db.py`, y validarlo sin arrastrar WIP ajeno; justificar las cuatro rutas ACC frente al guardia de perímetro sin subir umbrales sólo para pasar; decidir con el propietario cómo tratar el fallo preexistente de miniaturas. Cuando esté listo, solicitar autorización explícita y separada para commit, push y despliegue, además de activar `ACC_EMERGENCY_BRIDGE_ENABLED` y `ACC_BRIDGE_PARALLEL_UPLOAD_ENABLED` en el entorno real. Inventario/limpieza de ensayo y DWG ACC queda pendiente por separado.
ARCHIVOS MODIFICADOS: propios de esta unidad: `backend/routes/uploads.py` (limitador de concurrencia), `backend/tests/test_acc_emergency_bridge.py` (banco simulado) y `docs/AI_WORKSTATE.md` (estado y handoff). Otros archivos del puente y todo WIP ajeno preexistían y no se editaron; `.env*` no se leyó ni modificó.
TESTS EJECUTADOS:     Banco nuevo antes de corrección → 1 fallida, pico 15 conexiones, una respuesta 500; después → 1/1 aprobada. `python -m pytest -q backend/tests/test_acc_emergency_bridge.py backend/tests/test_docs_acc_link.py backend/tests/test_estado_de_traduccion_en_la_lista.py` → 41/41, 2 avisos. `python -m pytest -q` → 2105 aprobadas, 2 fallidas, 2 avisos en 76,63 s. `git diff --check` focalizado → exit 0 con avisos LF/CRLF; `python -m py_compile backend/routes/uploads.py backend/acc_emergency_bridge.py` → exit 0. Takeover: rama main/HEAD b03d0fb, baseline cdf7837 ancestro, status esperado.
TESTS PENDIENTES:     Build/suite de un paquete aislado sin WIP ajeno; UAT real sólo por decisión posterior del propietario, con escrituras concretas autorizadas. El frontend Docs no se reconstruyó en esta unidad porque no se editó.
FALLO CONOCIDO:       Suite backend completa roja por `/api/docs/miniaturas/preparar` sin pantalla (ruta ya presente en HEAD) y 289 rutas portal frente al techo `<286` tras cuatro rutas ACC. El limitador resuelve la simulación de ocho confirmaciones, pero no prueba carga real ni garantiza ausencia de saturación por otros endpoints. `5174` sigue apuntando a Virginia, cuyo backend carece del puente.
NEXT EXACT ACTION:    Crear un manifiesto de hunks del backend del puente y verificar con `git diff` que sólo el callback `on_version_created` de `file_system_db.py` entraría; preparar una validación aislada sin staging amplio, sin commit ni publicación.
DO NOT TOUCH:         `.env*`, `D:/copias-ecd/**`, credenciales, Virginia en escritura, expediente real, carpeta ACC existente, objetos ACC/GCS, Render, Git remoto, frontend-react/LOB/4D/ViewerFacade y WIP ajeno. No commit, push, deploy, cambio de flags reales ni cargas por inferencia.
COMMIT/HEAD REF:      `b03d0fb2e4be4013c460c746cb4415da9619e0f6` (sin commit propio; rama `main`).

[WIP HANDOFF]
TAREA:                Corregir las puertas locales de release del puente Docs→ACC sin publicar ni mezclar WIP ajeno.
IMPLEMENTADO:         El banco de concurrencia (8 confirmaciones/pool 15) reprodujo un 500 y pasó tras limitar `/api/uploads/complete` a cinco confirmaciones simultáneas por proceso; 41/41 pruebas focalizadas verdes. La prueba de perímetro del portal declara las cuatro rutas ACC exactas y deja intacto el techo `<286` para las demás; portal + puente 47/47. Se inspeccionó el diff backend: el único archivo con trabajo ajeno mezclado es `backend/file_system_db.py`; sólo los hunks del callback `on_version_created` pertenecen al puente, no su cambio de permisos en `list_contents`. No se tocó el frontend, 5174/3000, datos reales, Git remoto ni Render.
PENDIENTE:            Aislar físicamente sólo los hunks del puente para un commit futuro autorizado, sin incluir el cambio ajeno de permisos; comprobarlos sobre una base actualizada cuando el propietario autorice la operación Git correspondiente (el main local está 8 commits detrás de la referencia local origin/main). El fallo histórico de miniaturas requiere decisión propia, ajena al puente; no se modificó para maquillar la suite. Para que 5174 vincule carpetas reales aún hacen falta push, despliegue backend Virginia y activación explícita de los flags del puente, actos separados que el propietario no autorizó todavía. Limpieza de ensayo/ACC pendiente por separado.
ARCHIVOS MODIFICADOS: propios de esta unidad: `backend/tests/test_perfil_portal.py` (guardia exacta de cuatro rutas), `docs/AI_WORKSTATE.md` (estado/handoff). Persisten las ediciones propias anteriores en `backend/routes/uploads.py` y `backend/tests/test_acc_emergency_bridge.py`. `backend/file_system_db.py` y demás WIP ajeno intactos; `.env*` no se leyó ni modificó.
TESTS EJECUTADOS:     `python -m pytest -q backend/tests/test_perfil_portal.py backend/tests/test_acc_emergency_bridge.py backend/tests/test_docs_acc_link.py backend/tests/test_estado_de_traduccion_en_la_lista.py` → 47/47, 2 avisos. `python -m pytest -q` → 2106 aprobadas, 1 fallida, 2 avisos en 78,11 s. `git diff --check` focalizado → exit 0, avisos normales LF/CRLF. `git diff` del archivo mixto y `git log main..origin/main`/`git diff --name-only main..origin/main` → sin solapamiento de rutas del puente en la referencia local, sin fetch.
TESTS PENDIENTES:     Build/suite del conjunto de hunks aislado sobre una base actualizada; UAT real sólo tras autorización específica de escrituras. Docs no se reconstruyó porque el frontend no cambió en esta unidad.
FALLO CONOCIDO:       La suite backend oficial aún tiene 1 fallo anterior al puente: `/api/docs/miniaturas/preparar` no tiene cliente ni excepción documentada en el banco de capacidades. No es un fallo de ACC. El botón 5174 sigue apuntando al backend antiguo de Virginia; las rutas locales no están publicadas. La referencia origin/main local está 8 commits por delante del main local y puede estar desactualizada respecto al remoto real.
NEXT EXACT ACTION:    Esperar autorización expresa del propietario para preparar un commit local selectivo del backend ACC; antes de tocar el índice Git, mostrarle la lista exacta de rutas/hunks, especialmente la exclusión del hunk de permisos de `backend/file_system_db.py`. Push, despliegue y flags reales requieren autorizaciones posteriores separadas.
DO NOT TOUCH:         `.env*`, `D:/copias-ecd/**`, credenciales, Virginia en escritura, expediente real, carpeta ACC existente, objetos ACC/GCS, Render, Git remoto, frontend-react/LOB/4D/ViewerFacade y WIP ajeno. No commit, push, deploy, cambio de flags reales ni cargas por inferencia.
COMMIT/HEAD REF:      `b03d0fb2e4be4013c460c746cb4415da9619e0f6` (sin commit propio; rama `main`).

[WIP HANDOFF]
TAREA:                Aislar y verificar el paquete exacto de backend Docs→ACC sin tocar el índice real ni publicar.
IMPLEMENTADO:         Se creó un índice Git temporal basado en HEAD y se añadieron explícitamente ocho archivos completos del puente más sólo los dos hunks `on_version_created` de `backend/file_system_db.py`; se rechazaron sus dos hunks ajenos de permisos. El candidato mostró nueve archivos y `git diff --cached --check` sin errores. El índice temporal se retiró después de verificar su ruta exacta; `git diff --cached --name-only` normal quedó vacío. No se crearon otros proyectos, commits ni ramas. La suite focalizada previa pasó 47/47; el backend general sigue con un único fallo histórico ajeno (miniaturas).
PENDIENTE:            Antes de un commit real, resolver la base Git: main local b03d0fb está ocho commits detrás de la referencia local origin/main, no actualizada por fetch; no empujar directo ese main. Preparar el commit selectivo sólo tras autorización expresa del propietario, usando el mismo manifiesto y excluyendo permisos ajenos; luego pedir autorizaciones independientes para push, despliegue del backend Virginia y activación de flags. No confundir el candidato comprobado con un build aislado o un release ya desplegado.
ARCHIVOS MODIFICADOS: propios de esta unidad: `docs/AI_WORKSTATE.md` (estado y handoff) únicamente. Código backend, frontend, WIP ajeno y `.env*` intactos en esta unidad; el índice temporal se eliminó y el índice normal siguió vacío.
TESTS EJECUTADOS:     Índice temporal: `git diff --cached --name-status` → nueve archivos previstos; `git diff --cached --check` → exit 0; `git diff --cached -- backend/file_system_db.py` → sólo los dos hunks del callback, 7 adiciones/1 eliminación; `git diff --cached --stat` → nueve archivos, 1910 inserciones/37 eliminaciones. Índice normal después: `git diff --cached --name-only` vacío. `git log main..origin/main` → ocho commits en la referencia local. Pruebas de aplicación no repetidas porque no cambió código funcional en esta unidad; ver handoff anterior para 47/47 y 2106 aprobadas/1 fallo histórico.
TESTS PENDIENTES:     Build/suite sobre la base Git actualizada y paquete físicamente aislado; UAT real sólo tras autorización específica. No se hicieron pruebas de subida ni de ACC en esta unidad.
FALLO CONOCIDO:       `5174` aún consulta Virginia sin las rutas del puente. Suite backend general conserva un fallo anterior al puente en `/api/docs/miniaturas/preparar`. La referencia origin/main local puede no reflejar el remoto actual; no hubo fetch.
NEXT EXACT ACTION:    Solicitar al propietario permiso explícito para crear un commit local selectivo del backend ACC; antes de hacerlo, cotejar el remoto vigente de sólo lectura y elegir una base actual sin arrastrar WIP, sin cambiar el checkout principal por sorpresa. Push, deploy y flags reales se solicitan después por separado.
DO NOT TOUCH:         `.env*`, `D:/copias-ecd/**`, credenciales, Virginia en escritura, expediente real, carpeta ACC existente, objetos ACC/GCS, Render, Git remoto en escritura, frontend-react/LOB/4D/ViewerFacade y WIP ajeno. No commit, push, deploy, cambio de flags reales ni cargas por inferencia.
COMMIT/HEAD REF:      `b03d0fb2e4be4013c460c746cb4415da9619e0f6` (sin commit propio; rama `main`).

[WIP HANDOFF]
TAREA:                Garantizar que una futura publicación del puente no incluya código viejo ni cambie servicios vivos ajenos.
IMPLEMENTADO:         Comprobación sólo lectura: `origin/main` remoto actual 89fe030 coincide con la referencia local; Virginia `/api/health` está en 802ff0d, rama main y status ok. 802ff0d es ancestro de 89fe030; los tres commits posteriores no cambiaron backend ni frontend-docs. Los nueve archivos del paquete ACC selectivo tampoco cambiaron entre el checkout local b03d0fb y 89fe030. El paquete puede basarse en 89fe030 para preservar lo que ya funciona online, sin mover el checkout actual ni arrastrar otros WIP. No hubo commit, fetch, push, despliegue, flags ni escritura en producción.
PENDIENTE:            El propietario no dio un sí inequívoco para un commit local selectivo: pidió seguridad y evitar código antiguo. Cuando lo autorice explícitamente, recomprobar inmediatamente el hash remoto y health, crear el cambio del puente sobre la base vigente sin incluir WIP ajeno ni mover main por sorpresa; revalidar el paquete. Push, Manual Deploy y flags del puente requieren permisos separados. No tocar el fallo histórico de miniaturas por esta tarea.
ARCHIVOS MODIFICADOS: propio de esta unidad: `docs/AI_WORKSTATE.md` (estado/handoff) únicamente. Código funcional, frontend, índice Git real y WIP ajeno intactos; `.env*` no se leyó ni modificó.
TESTS EJECUTADOS:     `git ls-remote origin refs/heads/main` → 89fe030; `GET https://visor-ecd-backend-va.onrender.com/api/health` → status ok/rama main/version 802ff0d; `git merge-base --is-ancestor 802ff0de5393 89fe030...` → exit 0; `git diff --name-only 802ff0d..89fe030 -- backend frontend-docs` → vacío; `git diff --name-only b03d0fb..89fe030 -- <nueve archivos ACC>` → vacío. Sin pruebas de aplicación nuevas, pues no se editó código; ver handoff previo para 47/47 focalizadas y 2106 aprobadas/1 fallo histórico.
TESTS PENDIENTES:     Repetir tests sobre el paquete aislado tras crearlo en una base actual autorizada; UAT real sólo con autorización de escritura específica. No se probaron subidas ni ACC en producción.
FALLO CONOCIDO:       `5174` aún usa el backend Virginia sin puente. Suite backend general tiene el fallo preexistente de miniaturas sin pantalla. El remoto puede avanzar tras esta medición; revalidar inmediatamente antes de cualquier push/deploy.
NEXT EXACT ACTION:    Pedir autorización explícita para crear un commit local selectivo del puente sobre la base remota vigente; si la recibe, volver a leer remoto y health y preparar la operación sin mover ni limpiar el checkout principal ni incluir cambios ajenos.
DO NOT TOUCH:         `.env*`, `D:/copias-ecd/**`, credenciales, Virginia en escritura, expediente real, carpeta ACC existente, objetos ACC/GCS, Render, Git remoto en escritura, frontend-react/LOB/4D/ViewerFacade y WIP ajeno. No commit, push, deploy ni flags reales por inferencia.
COMMIT/HEAD REF:      `b03d0fb2e4be4013c460c746cb4415da9619e0f6` (sin commit propio; rama `main`).

[WIP HANDOFF]
TAREA:                Entregar a GitHub sólo la integración temporal ALEPHIA Docs→ACC aprobada localmente, sin desplegarla.
IMPLEMENTADO:         Commit selectivo `7aba9ad798821b99b07841b84d0ea1cf8bd18007` creado sobre `89fe030c59844db225d9717ae473a99b1c970b93` y push normal a `origin/main` verificado por `git ls-remote`; sólo 24 rutas Docs/ACC frente al padre, con dos hunks de callback en `backend/file_system_db.py` y ninguno de sus permisos ajenos. El `main` local sucio y el índice real quedaron intactos. Dos flags ACC siguen apagados por defecto. `/api/health` Virginia permaneció en `802ff0de5393`; sin deploy ni escrituras reales.
PENDIENTE:            El propietario decidirá por separado si y cuándo autoriza Manual Deploy del backend Virginia, Manual Deploy de Docs y activación de flags. Antes de eso, volver a verificar base/health y configuración de Auto-Deploy; no confundir push con publicación. El `main` local sigue detrás del remoto por seguridad del worktree sucio; no fast-forward, merge, reset ni checkout sin plan explícito. Inventario y limpieza de ensayos/ACC siguen como tarea separada. Dos snapshots de validación `C:/Users/ASUS/AppData/Local/Temp/codex-acc-check-fe1a6b734fbcf` y `.../codex-acc-check-622d5c0d94f698` y el índice temporal `.../codex-acc-eeca3984650df8.index` quedaron en Temp: el entorno rechazó `Remove-Item` incluso en rutas exactas; no tocar sus junctions `node_modules` con borrado recursivo inseguro.
ARCHIVOS MODIFICADOS: propios de esta unidad: `docs/AI_WORKSTATE.md` (estado/handoff, no incluido en commit); commit ACC de 24 rutas enumeradas en el bloque de estado del 27-sep. WIP ajeno, `.env*`, visor/LOB/ViewerFacade y datos de obra preservados.
TESTS EJECUTADOS:     Worktree: `python -m pytest -q backend/tests/test_perfil_portal.py backend/tests/test_acc_emergency_bridge.py backend/tests/test_docs_acc_link.py backend/tests/test_estado_de_traduccion_en_la_lista.py` → 47/47; `npm test` Docs → 19/19 bancos. Paquete aislado sobre padre remoto: ACC backend 31/31, Docs 17/17 bancos, `npm run build` → 469 módulos; `git diff --cached <padre> --check` → sin errores. `git ls-remote` antes y después → 89fe030 y 7aba9ad; health Virginia antes/después → ok/802ff0d.
TESTS PENDIENTES:     Suite backend completa de paquete aislado: la recolección se detuvo en `test_inventory_identity_core.py` por `ModuleNotFoundError: prototypes` (prototipo no versionado en remoto); ensayo con perfil portal en la copia aislada fue interrumpido tras tardar más de lo esperado. UAT real posterior a despliegue sólo con autorización.
FALLO CONOCIDO:       Suite completa del worktree: 2106 aprobadas y 1 fallo histórico de miniaturas sin pantalla; paquete aislado no supera recolección por prototipo ajeno no versionado. El bridge no está activo en producción, y 5174 aún consulta Virginia con versión anterior. No proclamar GREEN de suite general.
NEXT EXACT ACTION:    Esperar decisión expresa del propietario para un despliegue específico; antes de cualquier despliegue, comprobar nuevamente `/api/health` de Virginia, hash de `origin/main` y Auto-Deploy de los servicios afectados.
DO NOT TOUCH:         `.env*`, `D:/copias-ecd/**`, credenciales, Virginia en escritura, expediente real, carpeta ACC existente, objetos ACC/GCS, Render, frontend-react/LOB/4D/ViewerFacade ni WIP ajeno sin nueva autorización. No desplegar ni activar flags por inferencia de este push.
COMMIT/HEAD REF:      `b03d0fb2e4be4013c460c746cb4415da9619e0f6` (HEAD local del checkout sucio); commit ACC remoto `7aba9ad798821b99b07841b84d0ea1cf8bd18007`.

[WIP HANDOFF]
TAREA:                Añadir en ALEPHIA Docs revisión CAD 2D propia: nube, texto, foto y referencias, con borradores privados y publicación explícita.
IMPLEMENTADO:         Código local nuevo en `backend/routes/cad_review.py`, tablas y rollback de migración 33, registro portal/bootstrap y `frontend-docs/src/components/CadReviewOverlay.jsx` + CSS montado sólo en vistas Autodesk 2D autenticadas. Una marca se asocia a documento, versión y GUID de vista; se guarda en PostgreSQL y se reproyecta al navegar el visor. El autor ve su borrador; los demás sólo lo publicado. Se pueden referenciar planos/archivos del mismo proyecto desde el árbol Docs, elegir foto raster de Docs o subir JPG/PNG/WEBP a GCS privado (reprocesado sin EXIF). GET de foto exige permiso y sirve sólo firmas raster, nunca MIME activo arbitrario. Texto tiene editor dentro del visor. Ningún cambio al puente ACC, traducción CAD ni originales. No se hizo commit, push, deploy, DDL ni UAT real.
PENDIENTE:            Validar en una base PostgreSQL local desechable una reconstrucción completa y regenerar desde medición `backend/esquema_manifiesto.txt`; aplicar migración 33 manualmente como `ecd_migrator` únicamente cuando el propietario autorice un entorno específico. Después, el propietario probará un DWG/otra vista Autodesk 2D: crear borrador, F5, otra cuenta, publicar, referencia y foto. Resolver cualquier defecto medido. No activar en producción ni publicar sin autorización por acto.
ARCHIVOS MODIFICADOS: propios de esta tarea: `backend/routes/cad_review.py`, `backend/sql/33_revision_cad.sql`, `backend/sql/33_revision_cad_rollback.sql`, `backend/tests/test_cad_review.py`, hunks de registro en `backend/server.py` y `backend/bootstrap_esquema.py`, `backend/tests/test_perfil_portal.py`, `backend/tests/test_guardias_de_escritura.py`, `backend/tests/test_cobertura_autorizacion.py`, `frontend-docs/src/components/CadReviewOverlay.jsx`, `frontend-docs/src/components/CadReviewOverlay.css`, hunk de montaje en `frontend-docs/src/components/CadViewer.jsx`, y este estado. Los demás cambios sucios y WIP ajenos permanecieron intactos; `.env*` no se leyó.
TESTS EJECUTADOS:     `python -m pytest -q backend/tests/test_cad_review.py backend/tests/test_guardias_de_escritura.py backend/tests/test_cobertura_autorizacion.py backend/tests/test_perfil_portal.py` → 29/29, 2 avisos de dependencia Google. `npm test` Docs → 19/19 bancos. `npx vite build --outDir .build-cad-review-check` → 472 módulos, exit 0, dos avisos de importación mixta preexistentes. `python -m py_compile backend/routes/cad_review.py backend/bootstrap_esquema.py backend/server.py` → exit 0. Suite backend completa antes de reconocer las nuevas guardias → 2111 aprobadas/4 fallidas; se corrigieron las dos de detectores focales. Se repitieron los dos fallos restantes por separado: reconstrucción de catálogo (nuevas tablas no medidas todavía) y `/api/docs/miniaturas/preparar` sin pantalla (histórico ajeno).
TESTS PENDIENTES:     Reconstrucción real en DB descartable y suite completa después de actualizar el manifiesto con esa medición; UAT de visor y concurrencia entre dos cuentas por el propietario. No se hicieron cargas ni escrituras externas.
FALLO CONOCIDO:       `test_el_bootstrap_cubre_las_tablas_que_el_codigo_sabe_crear` falla hasta medir y regenerar el manifiesto con `cad_review_marks` y `cad_review_attachments`; no se alteró el manifiesto a mano. `test_toda_capacidad_de_administrador_tiene_puerta` falla por miniaturas preexistentes. La interfaz local que consulta al backend Virginia actual recibirá 404 en las rutas nuevas hasta conectar un backend con este código y aplicar la migración; no afirmar que ya está disponible para usuarios reales.
NEXT EXACT ACTION:    Preparar una PostgreSQL local descartable con `ecd_migrator`, aplicar `backend/sql/33_revision_cad.sql`, reconstruir el esquema y regenerar `backend/esquema_manifiesto.txt` a partir del catálogo medido; repetir la suite backend y luego habilitar UAT local sin tocar Virginia.
DO NOT TOUCH:         `.env*`, `D:/copias-ecd/**`, credenciales, Virginia/producción en escritura, ACC, GCS real, Render, Git remoto, frontend-react/LOB/4D/ViewerFacade, documentos reales ni WIP ajeno. No commit, push, deploy ni DDL real sin autorización nueva.
COMMIT/HEAD REF:      `b03d0fb2e4be4013c460c746cb4415da9619e0f6` (checkout `main` sucio; sin commit propio).

[WIP HANDOFF]
TAREA:                Corregir el error rojo 404 de revisión CAD, ubicar la barra vertical a la derecha y fijar el almacenamiento de fotos/nubes/textos tomando ACC como referencia funcional.
IMPLEMENTADO:         Se confirmó sin autenticación que `localhost:5174` usa proxy a Virginia y que `OPTIONS /api/docs/cad/reviews` en el backend local `127.0.0.1:3000` responde HTML 404: el proceso `python server.py` actual aún es anterior al módulo. En `CadReviewOverlay` los 404 ahora desactivan las herramientas e informan discretamente que falta el backend, sin producir borradores no guardables ni mostrar el error rojo crudo. Barra de seleccionar/nube/texto/foto vertical a la derecha; panel a su izquierda. La migración 33 y el bootstrap ahora conservan `deleted_at/deleted_by_id` en adjuntos retirados, evitando foto GCS sin rastro; migración atómica con GRANT explícito a `ecd_app`. `docs/CAD_REVIEW_STORAGE.md` documenta PostgreSQL JSONB para nubes/textos/geometría, GCS privado para fotos de equipo y referencia por ID para fotos/archivos Docs. La documentación oficial de Autodesk confirma borrador privado/publicación, fotos y referencias; APS confirma que Viewer no persiste marcas y que la aplicación debe hacerlo. No se afirmó conocer el esquema interno privado de ACC.
PENDIENTE:            Para que el propietario pruebe guardado real falta una base PostgreSQL de ensayo desechable identificada y migración 33 aplicada manualmente como `ecd_migrator`; después reiniciar sólo el backend local `3000` con este código y ejecutar Docs en modo ensayo, sin apuntar escrituras a Virginia. Validar restauración F5, dos usuarios y permisos. No se reinició `3000`, no se tocó base ni servicio real.
ARCHIVOS MODIFICADOS: propios de este turno: `frontend-docs/src/components/CadReviewOverlay.jsx`, `frontend-docs/src/components/CadReviewOverlay.css`, `backend/routes/cad_review.py`, `backend/sql/33_revision_cad.sql`, `backend/tests/test_cad_review.py`, nuevo `docs/CAD_REVIEW_STORAGE.md` y este handoff. Otros cambios del worktree, incluido el puente ACC, intactos. Build local dejó `frontend-docs/.build-cad-review-check/`; el entorno rechazó la operación de limpieza exacta, no se intentó un borrado amplio.
TESTS EJECUTADOS:     `curl.exe -X OPTIONS http://127.0.0.1:3000/api/docs/cad/reviews` → 404 HTML; lectura de `vite.config.js` confirma proxy 5174→Virginia. `python -m pytest -q backend/tests/test_cad_review.py backend/tests/test_perfil_portal.py` → 16/16, dos avisos de dependencia Google. `npx vite build --outDir .build-cad-review-check` → 472 módulos, exit 0; `python -m py_compile backend/routes/cad_review.py backend/bootstrap_esquema.py backend/server.py` → exit 0; `git diff --check` focal → 0 errores, avisos normales LF/CRLF. No se hizo UAT con archivos ni DB.
TESTS PENDIENTES:     Reconstrucción PostgreSQL descartable para regenerar el manifiesto de esquema medido, suite backend completa tras ese paso, prueba visual/persistencia del propietario y validación de permisos con dos cuentas.
FALLO CONOCIDO:       La interfaz explica 404, pero el guardado no funcionará contra Virginia ni contra el proceso viejo 3000 hasta desplegar/reiniciar un backend con migración 33. Sigue fallando el banco de manifiesto de esquema por las dos tablas nuevas no medidas; el fallo histórico de miniaturas sin pantalla es ajeno.
NEXT EXACT ACTION:    Identificar una base PostgreSQL local descartable y su rol `ecd_migrator` sin leer ni pedir contraseñas; aplicar allí `backend/sql/33_revision_cad.sql`, regenerar `backend/esquema_manifiesto.txt` a partir de reconstrucción medida, y arrancar el backend local actualizado en 3000 para UAT.
DO NOT TOUCH:         `.env*`, `D:/copias-ecd/**`, Virginia/producción en escritura, ACC, GCS real, Render, Git remoto, frontend-react/LOB/4D/ViewerFacade ni WIP ajeno. No commit/push/deploy ni DDL en DB no confirmada como desechable.
COMMIT/HEAD REF:      `b03d0fb2e4be4013c460c746cb4415da9619e0f6` (checkout `main` sucio; sin commit propio).

[WIP HANDOFF]
TAREA:                Ajustar la revisión CAD al local oficial y dejar su barra de herramientas simple, sin usar el ensayo 3000.
IMPLEMENTADO:         Por decisión expresa del propietario se descartó el camino de base desechable/backend 3000 para esta función. En `CadReviewOverlay.jsx` los cuatro iconos de cursor, nube, texto y cámara son SVG propios simples (sin emojis) dentro de la barra vertical derecha; el aviso de backend ausente aparece sólo al pulsar el icono de información, no como tarjeta flotante permanente. `docs/CAD_REVIEW_STORAGE.md` deja claro que `5174` consulta Virginia y que el guardado real exige migración 33 y backend actualizado. La lógica fail-closed de 404 permanece: ningún borrador finge guardarse si falta la API. El banco de capas del DWG ahora verifica el nuevo orden real al cambiar de vista: cargar, aplicar capas y sólo entonces activar la revisión. Lectura remota: `origin/main` y health Virginia coinciden en `7aba9ad`; el diff local contra esa base muestra 52 líneas en `backend/server.py` que incluyen código ajeno, así que un futuro paquete deberá seleccionar hunks, nunca ese archivo entero. No se reinició ni borró 3000, no se hizo DDL, commit, push ni deploy.
PENDIENTE:            Auditar el paquete exacto para producción sobre el HEAD remoto vigente sin arrastrar WIP ajeno ni código antiguo; resolver el manifiesto de esquema con una medición autorizada y el fallo histórico de miniaturas por separado. Presentar al propietario los actos de migración 33 como `ecd_migrator`, commit selectivo, push y despliegues backend/portal para autorizarlos individualmente. Sólo entonces hacer UAT real en `alephia.com.pe`, como pidió.
ARCHIVOS MODIFICADOS: propios de este turno: `frontend-docs/src/components/CadReviewOverlay.jsx`, `frontend-docs/src/components/CadReviewOverlay.css`, `frontend-docs/pruebas/capasDelDwg.prueba.mjs`, `docs/CAD_REVIEW_STORAGE.md` y este estado. El resto del worktree sucio, archivos de prueba del pasado y proceso 3000 intactos.
TESTS EJECUTADOS:     `npx vite build --outDir .build-cad-review-check` → 472 módulos, exit 0; `npm test` Docs → 19/19 bancos después de actualizar la prueba de capas por la transición de vista ya implementada; `git diff --check` focal → 0 errores y avisos normales LF/CRLF. `git ls-remote origin refs/heads/main` → `7aba9ad79882`; `/api/health` Virginia → ok, main, `7aba9ad79882`, seguridad 7/7; `git diff --stat 7aba9ad -- <siete rutas mixtas>` → evidencia de WIP ajeno en server. No se abrió ni editó un plano real.
TESTS PENDIENTES:     Suite backend completa y reconstrucción de esquema medida antes del release; UAT real con dos usuarios después de habilitar backend y migración. El usuario no quiere ensayos en 3000.
FALLO CONOCIDO:       En `5174` las herramientas nuevas permanecen deshabilitadas porque Virginia devuelve 404 para `/api/docs/cad/reviews`. Es correcto hasta la migración/despliegue: el frontend solo no puede persistir marcas ni fotos. Banco de manifiesto y fallo histórico de miniaturas de la suite backend siguen pendientes.
NEXT EXACT ACTION:    Preparar un manifiesto explícito del paquete CAD review sobre `7aba9ad`, separando los dos hunks propios de `backend/server.py` de su diagnóstico de inventario ajeno; validar ese paquete sin mover el checkout ni tocar el índice real.
DO NOT TOUCH:         `.env*`, `D:/copias-ecd/**`, credenciales, Virginia/producción en escritura, ACC, GCS real, Render, Git remoto, frontend-react/LOB/4D/ViewerFacade, WIP ajeno ni proceso 3000/archivos de ensayo. No commit, push, despliegue ni migración sin autorización por acto.
COMMIT/HEAD REF:      `b03d0fb2e4be4013c460c746cb4415da9619e0f6` (checkout `main` sucio; sin commit propio).

[WIP HANDOFF]
TAREA:                Preparar commit/push selectivos de revisión CAD privada/publicable sin arrastrar WIP ajeno.
IMPLEMENTADO:         Corregido el selector de referencias para leer `response.data` de `/api/docs/list` y corregido el trazado de los cuatro lados de la nube. Añadido banco Docs focal. Se preparó un índice Git temporal sobre el `origin/main` remoto y vivo `7aba9ad798821b99b07841b84d0ea1cf8bd18007` con sólo 15 rutas CAD: en `backend/server.py` se aceptaron exclusivamente dos hunks de importación/registro y se excluyó el diagnóstico de inventario ajeno. El índice normal, HEAD local, producción, Render, PostgreSQL real, GCS real y ACC siguen intactos. No se hizo commit, push ni deploy porque la suite completa NO es GREEN.
PENDIENTE:            Resolver y medir el manifiesto de esquema para `cad_review_marks` y `cad_review_attachments` sin editarlo manualmente; respetar la decisión del propietario de no usar el ensayo 3000. Aclarar la secuencia de migración 32 PDF todavía no versionada antes de publicar la 33 CAD. Luego revalidar el paquete aislado, crear commit selectivo y push sólo con autorización vigente, y solicitar por acto separado migración real como `ecd_migrator` y despliegues Render backend/portal. El propietario hará UAT real de borrador privado, F5, otra cuenta, publicación, fotos y referencias.
ARCHIVOS MODIFICADOS: propios de esta unidad: `frontend-docs/src/components/CadReviewOverlay.jsx`, `frontend-docs/pruebas/cadReview.prueba.mjs` y este `docs/AI_WORKSTATE.md`. Paquete CAD preexistente de 15 rutas enumerado en el diff del índice temporal `C:/Users/ASUS/AppData/Local/Temp/codex-cad-29b8ba64d756421e9fe1ef033b711524.index`; ningún otro WIP se añadió al índice. `backend/server.py` mixto conserva sus hunks ajenos sólo en el worktree.
TESTS EJECUTADOS:     `python -m pytest -q` → 2115 aprobadas, 2 fallidas, 2 avisos en 78,53 s. Fallas: capacidad admin `/api/docs/miniaturas/preparar` (histórica ajena) y manifiesto de esquema sin las dos tablas CAD nuevas (propia pendiente). `python -m pytest -q backend/tests/test_cad_review.py backend/tests/test_guardias_de_escritura.py backend/tests/test_cobertura_autorizacion.py backend/tests/test_perfil_portal.py` → 30/30, 2 avisos. Docs `npm test` → 20/20 bancos. `npx vite build --outDir .build-cad-review-check` → 472 módulos, exit 0, 2 avisos de importaciones mixtas. `git diff --cached --check 7aba9ad` en índice temporal → exit 0; diff de `backend/server.py` en paquete → sólo 2 líneas.
TESTS PENDIENTES:     Reconstrucción PostgreSQL medida del esquema y suite completa GREEN; pruebas reales de persistencia F5 y privacidad entre cuentas tras migración/despliegue específicos. No se usan archivos reales ni 3000 sin nueva decisión del propietario.
FALLO CONOCIDO:       Suite backend roja por el manifiesto nuevo y miniaturas históricas. `5174`/web todavía apuntan al backend 7aba9ad que responde 404 para revisión CAD; las herramientas permanecen deshabilitadas hasta migración y deploy. Remoto tiene SQL 31 como última migración; SQL 32 PDF está en WIP local sin versionar, y SQL 33 CAD no debe aplicarse a ciegas.
NEXT EXACT ACTION:    Resolver con el propietario el alcance de validación de esquema sin 3000 y el orden de las migraciones 32/33; medir el manifiesto y repetir suite backend antes del commit/push preparado.
DO NOT TOUCH:         `.env*`, `D:/copias-ecd/**`, contraseñas, Virginia/producción en escritura, ACC, GCS real, Render, frontend-react/LOB/4D/ViewerFacade, SQL 32 PDF y WIP ajeno. No usar `git add -A`, `stash`, reset, ni mover el HEAD local sucio.
COMMIT/HEAD REF:      `b03d0fb2e4be4013c460c746cb4415da9619e0f6` (main local); `7aba9ad798821b99b07841b84d0ea1cf8bd18007` (origin/main remoto y Virginia, verificados en esta unidad). Sin commit ni push CAD.

[WIP HANDOFF]
TAREA:                Activar de forma segura la revisión CAD ya enviada a GitHub, sin alterar otros trabajos ni producción por inferencia.
IMPLEMENTADO:         Commit selectivo `dad8851727b278d4b310ca7e13f14d28b8fc129a` creado sobre `7aba9ad798821b99b07841b84d0ea1cf8bd18007` con índice temporal, y push normal verificado por `git ls-remote`. Su diff incluye exactamente 15 rutas de revisión CAD; `backend/server.py` sólo tiene dos adiciones propias. Corregidos selector de archivos y trazo de nubes. HEAD local `b03d0fb` y el índice real con WIP ajeno no se movieron. `/api/health` de Virginia continuó en `7aba9ad`: no hay migración, deploy ni cambio visible aún en la web.
PENDIENTE:            Resolver manifiesto de esquema con una reconstrucción medida aprobada; ordenar la migración 33 CAD frente al SQL 32 PDF aún no versionado. Aplicar la migración CAD manualmente como `ecd_migrator` únicamente bajo autorización específica del propietario y después desplegar backend Virginia y portal Docs por actos autorizados; validar `/api/health` y UAT del propietario con borrador, F5, segunda cuenta, publicación, referencias y fotos. No confundir push con publicación.
ARCHIVOS MODIFICADOS: commit remoto CAD: `backend/bootstrap_esquema.py`, `backend/routes/cad_review.py`, dos hunks en `backend/server.py`, `backend/sql/33_revision_cad.sql`, rollback, `backend/tests/test_cad_review.py`, `backend/tests/test_cobertura_autorizacion.py`, `backend/tests/test_guardias_de_escritura.py`, `backend/tests/test_perfil_portal.py`, `docs/CAD_REVIEW_STORAGE.md`, `frontend-docs/pruebas/cadReview.prueba.mjs`, `frontend-docs/pruebas/capasDelDwg.prueba.mjs`, `frontend-docs/src/components/CadReviewOverlay.css`, `frontend-docs/src/components/CadReviewOverlay.jsx`, `frontend-docs/src/components/CadViewer.jsx`. Sólo este `docs/AI_WORKSTATE.md` es cambio propio posterior al commit; WIP ajeno preservado.
TESTS EJECUTADOS:     Suite backend `python -m pytest -q` → 2115 aprobadas y 2 fallidas, reportadas en el commit. Focales backend 30/30; Docs `npm test` 20/20 bancos; build Vite 472 módulos. `git diff-tree --check 7aba9ad dad8851` → exit 0. Remoto `git ls-remote` → dad8851; Virginia health → ok/main/7aba9ad tras push.
TESTS PENDIENTES:     Manifiesto reconstruido de DB medida y suite completa GREEN; persistencia F5, privacidad entre cuentas y fotos reales después de migración y deploy específicos. El propietario excluyó el ensayo 3000.
FALLO CONOCIDO:       Dos fallos de suite backend: el propio manifiesto CAD nuevo y la capacidad histórica `/api/docs/miniaturas/preparar` sin pantalla. Hasta backend+migración, la web y 5174 reciben 404 de las rutas CAD y muestran herramientas deshabilitadas. El push no altera esa condición.
NEXT EXACT ACTION:    Obtener decisión expresa del propietario sobre verificación de esquema y migración 33 en producción; no desplegar backend hasta aplicar DDL como `ecd_migrator`, y pedir autorización por cada Manual Deploy de backend y portal.
DO NOT TOUCH:         `.env*`, `D:/copias-ecd/**`, contraseñas, Virginia en escritura, ACC, GCS real, Render, frontend-react/LOB/4D/ViewerFacade, SQL 32 PDF y WIP ajeno sin autorización nueva. No usar `git add -A`, `stash`, reset ni mover el HEAD local sucio.
COMMIT/HEAD REF:      `b03d0fb2e4be4013c460c746cb4415da9619e0f6` (HEAD local), `dad8851727b278d4b310ca7e13f14d28b8fc129a` (origin/main remoto), `7aba9ad798821b99b07841b84d0ea1cf8bd18007` (Virginia viva tras push).

[WIP HANDOFF]
TAREA:                Completar la publicación de revisión CAD privada/publicable tras aplicar su esquema en Cloud SQL real.
IMPLEMENTADO:         Por autorización específica del propietario, aplicada `backend/sql/33_revision_cad.sql` en `correos-gmail-425301:us-east4:pqt-08-talara`, base `postgres`, sesión `ecd_migrator`. Cloud SQL Studio indicó ejecución correcta; comprobación de solo lectura confirmó dos tablas, tres índices, columnas `deleted_at`/`deleted_by_id` y SELECT/INSERT/UPDATE de `ecd_app` en ambas. SQL local idéntico al blob de `dad8851`. No se hizo deploy.
PENDIENTE:            Obtener autorización separada para Manual Deploy del backend Virginia y luego del portal Docs; antes de cada acto cotejar commit remoto y servicio vivo. Tras desplegar, verificar `/api/health` y UAT del propietario: borrador, F5, segunda cuenta, publicación, referencias y fotos. Resolver por separado los dos fallos conocidos de la suite backend.
ARCHIVOS MODIFICADOS: propio de esta sesión: `docs/AI_WORKSTATE.md` únicamente. El SQL 33 y demás archivos CAD estaban ya en el commit remoto y en el worktree sucio previo; no se editaron. WIP ajeno intacto.
TESTS EJECUTADOS:     Cloud SQL Studio `SELECT current_user, current_database(), to_regclass(...)` previo: `ecd_migrator`, `postgres`, ambas tablas ausentes. Ejecución de SQL 33: correcta en 126.3 ms. Verificación posterior: 8/8 indicadores true para tablas, índices, columnas de borrado y grants. `git rev-parse` del blob remoto y `git hash-object --path` local: ambos `37bc2695b197f73ca304b540256a799a4600176d`. No se repitió suite de código.
TESTS PENDIENTES:     Suite backend completa después de resolver el manifiesto; comprobación de endpoints después del deploy; UAT real de privacidad, persistencia y fotos por el propietario.
FALLO CONOCIDO:       Hasta desplegar el backend nuevo, la API pública de revisión CAD sigue ausente. La última suite conocida tuvo 2115 aprobadas y 2 fallidas: manifiesto CAD y miniaturas histórica. Ninguna se ocultó ni se declaró resuelta por el DDL.
NEXT EXACT ACTION:    Solicitar autorización específica para Manual Deploy de `visor-ecd-backend-va` desde `dad8851727b278d4b310ca7e13f14d28b8fc129a`; antes confirmar por lectura `origin/main`, `/api/health` y configuración de Auto-Deploy. No desplegar el portal sin autorización posterior separada.
DO NOT TOUCH:         `.env*`, `D:/copias-ecd/**`, credenciales, ACC, GCS real, datos documentales, frontend-react/LOB/4D/ViewerFacade, SQL 32 PDF y WIP ajeno. No ejecutar más DDL, commit, push ni despliegue por inferencia.
COMMIT/HEAD REF:      `b03d0fb2e4be4013c460c746cb4415da9619e0f6` (HEAD local sin mover); `dad8851727b278d4b310ca7e13f14d28b8fc129a` (commit remoto CAD ya enviado).

[WIP HANDOFF]
TAREA:                Corregir apertura CAD para editores y mostrar fotos/documentos referenciados en una ventana flotante del visor.
IMPLEMENTADO:         En código local, `GET /api/docs/cad/acc-link` y las rutas de revisión CAD resuelven la obra desde el nodo/marca antes del control de membresía; `_mark` sigue comprobando permiso de carpeta y autor/publicación. PATCH y DELETE incorporan además guardia explícita del recurso. Las referencias abren un panel flotante: foto privada autenticada, CAD en CadViewer sin revisión anidada, PDF/imagen por URL firmada y texto con proxy autenticado y límite de 1 MB; formatos no integrados ofrecen enlace normal a ALEPHIA. Cámara/carpeta/archivo/plano usan SVG sencillos, texto más legible y nube con lóbulos más grandes. No se modificaron archivos reales, ACC, GCS ni producción; sin commit, push o despliegue.
PENDIENTE:            El propietario hará UAT visual y con dos cuentas tras publicación autorizada. Para activar el arreglo público, preparar un paquete selectivo sobre el remoto vigente que excluya WIP ajeno; solicitar autorización específica de commit, push y de cada Manual Deploy necesario. Resolver por tarea separada los dos fallos previos de la suite general, sin maquillar el manifiesto de esquema.
ARCHIVOS MODIFICADOS: propios de esta unidad: `backend/perimetro_de_obra.py`; dos guardias en `backend/routes/cad_review.py`; nuevo `backend/tests/test_cad_editor_access.py`; `frontend-docs/src/components/CadViewer.jsx`; `frontend-docs/src/components/CadReviewOverlay.jsx`; `frontend-docs/src/components/CadReviewOverlay.css`; `frontend-docs/pruebas/cadReview.prueba.mjs`; este `docs/AI_WORKSTATE.md`. Los demás cambios del worktree son ajenos o previos y no se incluyeron en ningún commit. Build de comprobación en `frontend-docs/.build-cad-review-preview-check/` permanece sin limpiar porque el checkout tiene temporales históricos; no publicarlo.
TESTS EJECUTADOS:     `python -m pytest -q backend/tests/test_perimetro_de_recurso.py backend/tests/test_cad_review.py backend/tests/test_cad_editor_access.py backend/tests/test_cobertura_autorizacion.py backend/tests/test_planos_para_todos.py` → 39/39. `python -m pytest -q` → 2119 aprobadas, 2 fallidas, 2 avisos en 92.53 s: manifiesto CAD nuevo y miniaturas históricas, ambas anteriores a esta unidad. Docs `npm test` → 20/20 bancos; `node pruebas/cadReview.prueba.mjs` → 3/3; `npx vite build --outDir .build-cad-review-preview-check` → 472 módulos y exit 0; `git diff --check` focal → sin errores. Baseline `cdf7837` es ancestro de HEAD `b03d0fb`.
TESTS PENDIENTES:     UAT real del editor que antes recibió 403, persistencia y privacidad con dos cuentas, visualización de foto y documento reales y lectura PDF/CAD/TXT referenciados. No se hizo por decisión del propietario de probar él en tiempo real; el backend público aún no contiene este arreglo.
FALLO CONOCIDO:       La suite completa no está verde: `test_toda_capacidad_de_administrador_tiene_puerta` falla por miniaturas y `test_el_bootstrap_cubre_las_tablas_que_el_codigo_sabe_crear` por `cad_review_marks`/`cad_review_attachments` ausentes del manifiesto medido. El editor seguirá viendo el 403 en la web pública hasta que se despliegue el cambio de backend. No se afirma que el panel flotante haya pasado UAT visual.
NEXT EXACT ACTION:    Si el propietario autoriza la publicación, comparar HEAD remoto y `/api/health`, preparar diff selectivo de estas rutas sobre ese remoto preservando el código vivo, repetir pruebas focales/build, y solicitar por separado commit, push y los despliegues backend/Docs; después el propietario probará el mismo DWG con editor y las ventanas flotantes.
DO NOT TOUCH:         `.env*`, `D:/copias-ecd/**`, credenciales, Virginia/producción en escritura, ACC, GCS, archivos reales, frontend-react/LOB/4D/ViewerFacade, WIP ajeno, SQL 32 PDF, proceso 3000 y temporales de ensayo. Nada sale de esta máquina sin autorización explícita por acto.
COMMIT/HEAD REF:      `b03d0fb2e4be4013c460c746cb4415da9619e0f6` (main local sucio; sin commit propio); backend público `dad8851727b278d4b310ca7e13f14d28b8fc129a` según `/api/health` leído durante esta unidad.

[WIP HANDOFF]
TAREA:                Publicar en GitHub sólo la corrección CAD de acceso editor y vistas flotantes, por autorización expresa del propietario.
IMPLEMENTADO:         Commit selectivo `03095cb87b2d4753f81d6434077dc63d59450943` creado como hijo de `dad8851727b278d4b310ca7e13f14d28b8fc129a` mediante índice temporal; push normal a `origin/main` verificado por `git ls-remote`. Diff de siete archivos: `backend/perimetro_de_obra.py`, `backend/routes/cad_review.py`, `backend/tests/test_cad_editor_access.py`, `frontend-docs/pruebas/cadReview.prueba.mjs`, `frontend-docs/src/components/CadReviewOverlay.css`, `frontend-docs/src/components/CadReviewOverlay.jsx`, `frontend-docs/src/components/CadViewer.jsx`. No se movió el HEAD ni el índice normal del checkout sucio; no hubo despliegue, DDL ni escritura en documentos/ACC/GCS.
PENDIENTE:            Manual Deploy de backend y portal Docs, cada uno sólo con autorización específica, para que el editor y las vistas flotantes reciban la corrección. Luego UAT visual y con dos cuentas a cargo del propietario. Resolver separadamente los dos fallos previos de la suite general.
ARCHIVOS MODIFICADOS: los siete del commit selectivo arriba; `docs/AI_WORKSTATE.md` sólo local (no incluido en el commit); WIP ajeno y demás ficheros sucios intactos. Índice temporal en `C:/Users/ASUS/AppData/Local/Temp/codex-cad-float-1790576483458.index`, sin tocar el índice habitual.
TESTS EJECUTADOS:     Paquete `git diff --cached --check dad8851` → sin errores; `git show --stat 03095cb` → exactamente siete archivos, 334 inserciones/24 supresiones. Antes del commit: backend focal 39/39; Docs 20/20 bancos; Vite build correcto; suite backend general 2119 aprobadas, 2 fallidas conocidas. `git ls-remote` antes → `dad8851`, después del push → `03095cb`.
TESTS PENDIENTES:     UAT real editor, panel flotante foto/CAD/PDF/TXT y privacidad entre dos cuentas tras despliegue. No se repitieron las pruebas después del commit porque el árbol del commit contiene el mismo código validado.
FALLO CONOCIDO:       La web pública sigue con backend/portal anteriores hasta Manual Deploy; editor puede seguir recibiendo 403 allí. Suite backend roja por manifiesto CAD y miniaturas preexistentes, no atribuibles a este paquete.
NEXT EXACT ACTION:    Esperar autorización expresa de Manual Deploy para `visor-ecd-backend-va` de `03095cb`; antes verificar `/api/health`, remoto y Auto-Deploy. Solicitar después autorización separada para portal Docs y comprobar UAT.
DO NOT TOUCH:         `.env*`, `D:/copias-ecd/**`, credenciales, Virginia/producción en escritura, ACC/GCS/documentos reales, frontend-react/LOB/4D/ViewerFacade, SQL 32 PDF, WIP ajeno ni proceso 3000. No desplegar por inferencia del push.
COMMIT/HEAD REF:      `b03d0fb2e4be4013c460c746cb4415da9619e0f6` (HEAD local intacto); `03095cb87b2d4753f81d6434077dc63d59450943` (`origin/main` verificado tras push); backend público último conocido `dad8851727b278d4b310ca7e13f14d28b8fc129a`.

NOTA 23-oct-2026 · Inventory FASE T (autorizada por el propietario: «SI, PERO RECUERDA HACER NUESTRO»), EN LOCAL SIN COMMIT. Nuevos: `frontend-react/src/lib/inventoryTabla.js` (motor puro: leer valores con unidad/fecha, filtrar Y/O con operadores por tipo + entre + fechas, ordenar multicriterio, agrupar N niveles, calcular suma/promedio/mín/máx/recuento/distintos por unidad) y `frontend-react/pruebas/inventoryTabla.prueba.mjs` (52/52). Cambiado: `InventoryDataGrid.jsx` (embudo → «Filtros de la tabla», cabeceras ordenan y clic derecho con menú, niveles de agrupación + «Totales en cada grupo», pie con cálculo por columna y menú, Name primera columna y EXT ID al final, contador de filas, fondo oscuro del ToolBtn corregido); respeta el WIP ajeno ya presente en ese fichero (línea de estado, color del botón de edición en bloque). Filtros/orden/niveles/cálculos viven SOLO en la sesión: persistirlos toca Saved Views (CLOSED). Verificado en el banco `localhost:5181` (reenvío a producción, sesión del propietario, Drenaje 8.378): filtro Cotas::Volumen > 1 → 544, orden ▼, 2 niveles con totales por grupo, pie «Prom. 1.71 m³», menú de cabecera. Pruebas: inventoryTabla 52/52, inventoryConfig 20/20, savedViewV2 111/111, restaurarVistaV2 150/150; ESLint del grid igual que antes (6 errores antiguos). Pendiente: paso 3 (columna = categoría + propiedad; hoy «Cotas::Área» Σ 10.046,8 m² frente a «Área» Σ 13.202,5 m²), Escape en los menús, textos internos de la línea de estado (WIP ajeno), pestaña Tickets vacía. Docs: docs/visor/16, 17, 18.

NOTA 23-oct-2026 · Inventory FASE T paso 3 (EN LOCAL SIN COMMIT): Inventory ofrece solo la columna con categoría (`Cotas::Área`, rotulada «Cotas › Área»); la suelta (`Área`, la que se pisaba entre categorías) se oculta si existe su versión cualificada; los campos propios (Name, Material, Status, Vaciado_Nro, Revit Category) se quedan siempre. `Tabla.columnasSinDuplicados` + `etiquetaDeColumna`; el aplanado de reserva de InventoryDataGrid (processDbData) escribe también la clave cualificada, como lib/inventoryNormalizers. Banco Drenaje: 363 columnas, 0 duplicadas (antes con «Cotas::Área» y «Área» a la vez); una vista antigua con columnas sueltas (`['Name','Área','Volumen']`) sigue mostrándolas. Pruebas: inventoryTabla 58/58, inventoryConfig 20/20, savedViewV2 111/111, restaurarVistaV2 150/150, capturarVistaV2 63/63, frenteDeVistas 20/20.

NOTA 23-oct-2026 · Inventory: celdas con m²/m³, fechas dd/mm/aaaa y números a la derecha (solo aspecto: `Tabla.textoDeCelda`; el valor y la edición no cambian; el original en el title); pie sin puntos y alineado. inventoryTabla 65/65. Verificado en el banco 5181 (Drenaje).

NOTA 23-oct (Inventory · tema): menús nuevos con clases v-* de tema-claude.css y cierre con Escape; «Agrupar» se abre hacia arriba si no cabe; ventana aparte (`inventoryFilterPopout.js`) pasa de oscura a la paleta clara, resaltado de fila #ECF0F1 (esperado actualizado en filtersCore.popout / popoutScale / b3Adversarial, en verde; popoutBrowser no corre: falta `playwright`, previo). En local, sin commit.

NOTA 23-oct (Inventory · «Solo con metrado»): sustituye a «Assets only» en la barra (en Revit todo es ejemplar: no quitaba nada). Deja las filas con alguna cantidad ≠ 0 en las columnas Σ de la tabla (`Tabla.conMetrado`, 69/69). Drenaje: 5.697 de 8.378 filas, totales idénticos. `assetsOnly` de inventoryConfig (CLOSED) se sigue leyendo y solo se enseña si viene marcado. Tickets: sin cambiar; las observaciones (`doc_issues`) no tienen enlace a elemento, decisión del dueño pendiente. En local, sin commit.

NOTA 23-oct (Inventory · Tickets): pestañas General/Tickets retiradas por decisión del dueño (Tickets no tenía contenido; las observaciones `doc_issues` no están ligadas a elementos). Queda pendiente, como trabajo aparte y sin autorizar, «Observaciones ligadas a elementos» (migración aditiva + crear desde la selección). En local, sin commit.

NOTA 23-oct (Inventory · fila → 3D): el vuelo ya existía (~490 ms, medido); se corrige el ENCUADRE, que quedaba tapado por el panel: `lib/encuadreCamara.js` (16/16) + `lib/irAElemento.js`, llamado desde `Viewer.jsx` (viewer-select) y `data-tapa-visor` en el panel de `App.jsx`. Además la selección ya no se acumula entre modelos. Detalle y medidas en docs/visor/18 §12. Viewer.jsx y App.jsx tienen WIP ajeno: commitear solo mis líneas (índice temporal). En local, sin commit.

NOTA 23-oct (Inventory · Excel = lo que se ve): `lib/inventoryExport.js` (37/37) sustituye al exportador de InventoryDataGrid; nombres de operadores y cálculos movidos a `lib/inventoryTabla.js` (+ `describirFiltro`). Verificado con el botón real en el banco (docs/visor/18 §13). Pruebas del banco: la librería xlsx descarga por `saveAs` global o `chrome.downloads`, no por enlace: interceptar eso o se descarga de verdad. En local, sin commit.

NOTA 23-oct (Inventory → «Planilla»): commit local `3d2a1ca` en la rama `inventario-fase-t` (sobre origin/main, índice temporal; main local sigue 39 atrás, sin push). Después, en local: nombre propio «Planilla» (solo textos visibles), selector de campos (`lib/inventoryCatalogo.js` 19/19, `components/SelectorDeCampo.jsx`), «Editar columnas» con % con dato, y Escape en paneles propios (`data-escape-propio`, guarda de 2 líneas en Viewer.jsx). docs/visor/19 §7. Extracción y datos sin tocar.

NOTA 23-oct (Planilla · buscador y selección): EN LOCAL, SIN COMMIT (encima de `e9944cc` de la rama `inventario-fase-t`). Buscador de valores parametrizados (`lib/inventoryBuscar.js` 18/18), Mayús/Ctrl + clic con «Σ selección» y selección múltiple en 3D (`viewer-select` con `items`, Viewer.jsx), `Tabla.tramo` (73/73), búsqueda en los criterios del Excel (38/38). docs/visor/20 §5.

NOTA 23-oct (Planilla · modo búsqueda): EN LOCAL, SIN COMMIT. Parecidos confirmables (los números mandan), buscar en lo seleccionado (selección congelada), columnas delante y «Sumar» por medida solo mientras se busca; diámetros/espesores/flujos/presiones pasan a promedio por defecto. Pruebas: buscar 30/30, tabla 75/75, catálogo 19/19, export 38/38. docs/visor/20 §6.

NOTA 23-oct (Planilla · orden e investigación): SOLO ANÁLISIS. docs/visor/21 (diagnóstico medido: en 280 px las barras ocupan 65–100 %, 7 maneras de acotar, 4 de sumar, Mayús «falla» porque la tabla salta) y docs/visor/22 (investigación con fuentes: Navisworks, Solibri ITO, BIMcollab, Speckle, ACC, Dalux, Revit, Excel, Airtable → tres capas: preguntar · ver · recordar). Plan en 6 pasos; el 6 (consultas guardadas) toca datos y necesita autorización. Nada implementado de esto todavía.

NOTA 24-oct (Planilla · vista Partidas): EN LOCAL, SIN COMMIT. `lib/planillaPartidas.js` (33/33) + `components/TablaDePartidas.jsx` + conmutador Elementos|Partidas en InventoryDataGrid. Regla del propietario: cantidad = medida NATIVA de Revit (docs/visor/23 §7–9; memoria cantidades-nativas-mandan). Drenaje: 633 partidas, 7.709 líneas sin medida nativa. Encofrados (sin medida nativa) y peso de acero: decisiones del propietario pendientes.

NOTA 24-oct (Visor · multiselección): `CompleteBoxSelectTool` de Viewer.jsx sustituía la selección en cada clic (Ctrl/Mayús no hacían nada, previo en producción). Ahora Ctrl/Mayús + clic añade o quita; medido con ratón real. Partidas sigue la última selección del usuario (tabla o 3D). EN LOCAL, SIN COMMIT. docs/visor/23 §10.

NOTA 24-oct (Planilla · selección y orden de partidas): EN LOCAL, SIN COMMIT. Selección del modelo arriba en Elementos (grupo + subtotal + aviso de lo que no tiene fila); Partidas agrupadas por padre/capítulo, código/nombre intercambiados leídos al derecho (⇄, 67 en Drenaje), repetidas una vez; sin total por grupo. planillaPartidas 42/42; verificado en el banco. docs/visor/23 §11.

NOTA 24-oct (Planilla · encuadre): EN LOCAL, SIN COMMIT. Panel encima de la barra inferior del visor y barra de herramientas del visor por encima del panel (App.jsx); Planilla opaca, sin desbordar; franjas fijas 187→97 px; «Editar (n)» a petición; búsqueda en una línea; columnas encontradas anchas con las medidas a la vista; subtotal alineado. docs/visor/21 §«Hecho · encuadre».

NOTA 24-oct (Planilla · inteligencia sin IA, pasos 1-2): EN LOCAL, SIN COMMIT. lib/planillaPerfil.js (perfil de parámetros + roles deducidos por los valores) 25/25; enlace «cómo se leyó» en Partidas; si el modelo no usa DSI se usa lo deducido. Drenaje local: código y descripción = DSI en las 4 líneas, unidad de la línea sin número distinta (dato malo). Decisión del propietario: NADA de IA. Paso 3 (itemizado: ítem, descripción, unidad) espera su Excel. docs/visor/24 §9-10.

NOTA 24-oct (Planilla · paso 3, itemizado): EN LOCAL, SIN COMMIT. lib/planillaItemizado.js 23/23; «cargar itemizado…» en Partidas (se lee en el navegador, no se guarda). Con Presupuesto_Rv00.xlsx (PQ-08): 100 % de códigos reconocidos, 0 fuera, 111 sub-partidas, 23 unidades distintas. Motor planillaPartidas acepta dic.itemizado (unidad/descripción oficiales); 42/42 intacto. docs/visor/24 §11.

NOTA 24-oct (Planilla · criterio solo del itemizado): EN LOCAL, SIN COMMIT. Por decisión del propietario, la vista Partidas ya no usa el DSI escrito en el código: sin itemizado está vacía; con él, el criterio sale del itemizado + valores del modelo. docs/visor/24 §12.

NOTA 24-oct (varios, EN LOCAL, SIN COMMIT): (1) backend/routes/inventory.py: un documento ya vinculado en otra obra se puede COMPARTIR si quien lo pide puede entrar en una obra donde ya está (caso HD 011264@011268 → PQT8_INTERFERENCIAS); test_documento_compartido_entre_obras 8/8; suite 2343 ok + 1 fallo ajeno (test_reconstruccion_desde_cero: tablas de WIP ajeno). ImportModelModal: mensajes claros en vez de «Error de conexión». (2) Saved Views (CLOSED, cambio pedido por el propietario): acciones en fila + menú «⋯» (Actualizar / Eliminar…); no verificado en pantalla porque la base local no tiene las migraciones 29/30 (saved_views solo v1 → POST /api/views 500 en local). Abrir el borrado a todos: PENDIENTE de su confirmación (cambia la política aprobada en vistas_permisos.py). (3) Filters (CLOSED, cambio pedido): TandemFilterPanel recuerda los valores vistos y los deja en su sitio en gris con 0; el motor no cambia; verificado en el 5173. Pruebas filtersCore en verde salvo 3 que necesitan entorno (--expose-gc, playwright, payload).

NOTA 24-oct (Planilla · volar a la partida): EN LOCAL, SIN COMMIT. Clic en una partida = selecciona sus elementos (varios modelos) y vuela a la caja que los contiene a DISTANCIA PRUDENTE (ocupan ~35 % del lado corto de la zona visible). lib/irAElemento.js: irAConjunto + OCUPACION_PRUDENTE (irAElementos de una fila de Elementos también usa ese encuadre); Viewer.jsx: viewer-select con items + encuadrar; Mayús/Ctrl no mueve la cámara. Verificado en el 5173 (SOLADO 06.01.03.01: 2 elementos, cámara de 457 m a 63 m). encuadreCamara 16/16. Hace falta recargar la página entera (F5): el visor registra su escucha al montarse.

NOTA 24-oct (Planilla · marcas y recorrido): EN LOCAL, SIN COMMIT. lib/marcasDeSeleccion.js (nuevo): números ①②③ sobre cada pieza de la partida, siguen a la cámara, clic = ir a esa pieza; se quitan al vaciar la selección. Viewer.jsx: viewer-select con items + encuadrar + enfocar (índice). TablaDePartidas: «◀ k/n ▶» en la partida activa. Verificado en el 5173 (WATER STOP 06.01.03.09: 4 marcas, ▶ 1/4 y 2/4 con la marca activa en negro). Requiere F5 (el visor registra su escucha al montarse).

NOTA 24-oct (Planilla · encuadre por lo que se ve): EN LOCAL, SIN COMMIT. encuadreCamara.vistaDeEncuadre acepta `puntos` (esquinas de cada pieza): ajusta ancho y alto proyectados desde la cámara, no la esfera (4 losas de Drenaje en 45×35 m: 128 m → 78 m). Ocupación: pieza 0,5; conjunto 0,75 (OCUPACION_CONJUNTO). Marcas más ligeras (16 px, blancas, número azul; la activa rellena). encuadreCamara 20/20.

NOTA 24-oct (Planilla · marcas con miles de piezas): EN LOCAL, SIN COMMIT. marcasDeSeleccion.js: las marcas se agrupan EN PANTALLA (celdas de 34 px, número de piezas; al acercarse se separan; pool de DOM, un redibujado por fotograma). Recorrido «◀ ▶»: hasta 40 piezas, pieza a pieza; con más (acero), por tramos de terreno de 15 m (gruposPorTramos, pura; prueba marcasDeSeleccion 6/6: 3.800 piezas en 2 ms). Viewer emite 'partida-recorrido' {pasos, porTramos} para la tabla. Verificado en el 5173, Frente Canal: acero 05.02.03.05, 2.849 barras → 57 marcas agrupadas y 73 tramos (T1/73 con ▶).

NOTA 24-oct (Planilla · fluidez y criterio del itemizado): EN LOCAL, SIN COMMIT. (1) marcasDeSeleccion: se ocultan mientras la cámara se mueve y se dibujan 150 ms después de parar; posición por transform, tamaño por ResizeObserver, texto solo si cambia. La fluidez NO se pudo medir de forma fiable desde la extensión (ventana en segundo plano: ~1.000 ms/fotograma constantes = frenado del navegador); pendiente su prueba. Hipótesis abierta: el resaltado de selección de LMV con cientos de barras (alternativa: color en vez de selección para partidas grandes). (2) Criterio: sub-partida solo si el PADRE INMEDIATO está en el itemizado; con itemizado, un parámetro de códigos cuenta como línea solo si ≥ 50 % de sus códigos están en él; ⚠ si una «sub-partida» lleva la descripción de otros ítems del itemizado. Caso Canal: 896 barras con 05.15.03.05 (CodigoDePartida1) y además 04.15.03.05 (706, ∉) / 04.02.03.05 (15, ⚠) en 03_03_01_DSI_CodigoDePartida = error de modelo, ahora señalado. Pruebas: itemizado 25/25, perfil 25/25, partidas 42/42, marcas 6/6, encuadre 20/20.

NOTA 24-oct (Planilla · partidas grandes se AÍSLAN): EN LOCAL, SIN COMMIT. El propietario: en Filters, aislar armadura va fluido; la Planilla (selección) no. Causa: LMV redibuja cada pieza SELECCIONADA en una pasada de resaltado completa por fotograma. Viewer.jsx: con más de 150 piezas (MAX_PIEZAS_SELECCIONADAS) la partida se aísla (visibilityManager.isolate por modelo, [-1] en los demás), sin selección, con las marcas; se guarda la visibilidad previa (capturarVisibilidad) y se restaura al siguiente viewer-select o con Escape (incluidos los filtros activos). Partidas pequeñas: selección como antes. Verificado en el 5173 (Canal): 896 barras aisladas, 54 marcas, Escape restaura, partida de 2 → seleccionada. La fluidez la confirma el propietario (desde la extensión no se mide: ventana frenada).

NOTA 24-oct (decisión del propietario): «que sea lo mismo que Filter en todo… que se aísle». Clic en una partida = SIEMPRE aislar (sin umbral; MAX_PIEZAS_SELECCIONADAS retirado). Mayús/Ctrl en la tabla sigue seleccionando. Verificado: partida de 2 piezas → 2 aisladas, sin selección; Escape restaura.

NOTA 24-oct (Planilla · sin puntos, clic alterna): EN LOCAL, SIN COMMIT. Por decisión del propietario se retiran las marcas («ahora que se aísla ya no beneficia en nada»): lib/marcasDeSeleccion.js eliminado (era nuevo, sin commit); lo que sigue en uso (centroDe, gruposPorTramos) pasa a lib/recorridoDePartida.js (prueba recorridoDePartida 6/6). En Partidas: un clic aísla la partida, otro clic en la misma muestra todo (evento 'planilla-mostrar-todo' → restaurarVisibilidad). «◀ ▶» se mantiene. Verificado en el 5173 (Canal, 896 barras): aísla y vuelve a 0 aislados.

NOTA 24-oct (Planilla · mostrar todo rápido): EN LOCAL, SIN COMMIT. El propietario: «Mostrar todos los objetos» (menú del visor) es inmediato y el 2.º clic en la partida no. Causa (por el código, no medida antes): aislar/restaurar modelo por modelo dispara un aviso de aislamiento por modelo, y cada aviso hace que App recorra los modelos y vuelva a filtrar la Planilla. Viewer.jsx: enSilencio() (facadeVisibilityRef, el mismo interruptor de la fachada de Filters) en aislar/restaurar; restaurarVisibilidad usa vm.aggregateIsolate([]) (una operación, como el menú) cuando antes no había aislados ni ocultos. Medido después: 0 avisos al aislar y al mostrar todo; 26 ms de JS en el 2.º clic. La fluidez la confirma el propietario.

NOTA 24-oct (Planilla · 2.º clic lento, CAUSA REAL): medido con PerformanceObserver(longtask) en el 5173 (Canal, 896 barras): el 2.º clic costaba 5.600 ms y disparaba 'filters-calculated'. Causa: al restaurar se re-ocultaba lo que estaba oculto (Sources), el HIDE_EVENT lo oye lib/filterVisualDriver.js (CLOSED, sin tocar) y recalcula todos los filtros (~5-6 s). Arreglo en Viewer.jsx: enSilencio() pone además window._filterIsolationInProgress (la marca con que Filters aísla él mismo) solo durante la operación síncrona. Medido después: 2.º clic 109 ms, 0 recálculos; 1.er clic 200 ms, 0 recálculos; los ocultos previos se conservan.

NOTA 24-oct (Planilla · aislamiento reforzado): EN LOCAL, SIN COMMIT. lib/aislamientoTemporal.js (controlador + EVENTOS + conVisibilidadProgramada; 18/18 con visor simulado; silencia con la marca de Filters) sustituye las 3 copias de Viewer.jsx; Viewer solo llama al controlador; la Planilla pasa la clave de la partida (misma clave = sin re-aislar; otra = re-aislar directo). Medido de punta a punta en el 5173 (Canal): 0 recálculos de Filters en 6 pasos, 64–265 ms, ocultos previos conservados. Build OK. Pruebas: aislamientoTemporal 18/18, recorridoDePartida 6/6, encuadreCamara 20/20, planillaItemizado 25/25, planillaPerfil 25/25, planillaPartidas 42/42, inventory* en verde, filtersCore b4/interacciones/runtime/savedViewsBoundary en verde. Al commitear Viewer.jsx: NO arrastrar la línea de import de ViewerFacade (protegida) ni el WIP ajeno. docs/visor/24 §13.
NOTA 24-oct (Planilla · PUBLICACIÓN): EMPUJADO por orden del propietario («publiquemos en la web»): origin/main 304faf20..857061ed (3d2a1ca6 Fase T, e9944cc7 nombre/selector, 857061ed partidas/itemizado/aislamiento/Filters fijos/menú de Vistas/compartir modelo entre obras). Armado con índice temporal desde `inventario-fase-t`: fuera la fachada y classifyViewerLeaves de Viewer.jsx, 4D/Avance de App.jsx, el texto nuevo de la línea de Filters y el color de la edición en bloque. Verificado en un árbol limpio del commit: 19 bancos del visor en verde, build OK; backend 2314 passed / 2 failed, los MISMOS 2 que origin/main 304faf20 (test_capacidades_con_puerta, test_reconstruccion_desde_cero; test_inventory_identity_core ignorado: importa `prototypes/`, que no está en git). FALTA Manual Deploy (Auto-Deploy OFF): visor-ecd-frontend (Planilla, Filters, Vistas) y visor-ecd-backend-va (compartir el modelo de interferencias). Render pidió iniciar sesión en la ventana de Claude: lo hace el propietario. Sin migraciones.

NOTA 24-oct (Planilla · qué mejorar): SOLO ANÁLISIS, sin código. docs/visor/25_PLANILLA_QUE_MEJORAR.md: puente modelo↔presupuesto (Cost-it/Presto, CYPE, Assemble, Navisworks, ACC Takeoff, S10/PUCP/UPeU). Propuestas P1 cobertura «qué falta», P2 colorear por estado/capítulo, P3 guardar itemizado (migración), P4 comparar metrados entre versiones (occurrences ya guarda propiedades por URN; verificar retención), P5 Excel en orden del itemizado (+ corregir «parámetro DSI» en Criterios), P6 metrado del expediente opcional, P7 recetas. Esperando decisión del propietario.
NOTA 24-oct (Planilla · nivel e IA): SOLO ANÁLISIS. docs/visor/26: frente a los 10 pedidos del doc 15, 1 hecho, 7 a medias, 2 sin empezar (~45 %); niveles: ve y entiende (1-2), no recuerda ni cruza (4-5). IA: evidencia (Stanford 17-33 % con citas; tablas y SQL ~80 %; BIM peor; D.S. 115-2025-PCM) → seguir sin IA; si algún día, solo traductor pregunta→filtro visible, nunca cifras ni escritura.
NOTA 24-oct (Planilla · P1 qué falta + P2 colorear): EN LOCAL, SIN COMMIT. lib/planillaCobertura.js (20/20) + lib/coloreoTemporal.js (16/16) + EVENTOS.COLOREAR (aislamientoTemporal 18/18); Viewer.jsx escucha el color (modeloDeUrn compartido); InventoryDataGrid itemsDelVisor + colorearEn3D; TablaDePartidas: línea de cobertura con 4 estados aislables, panel «qué falta», Colorear 3D No/Por estado/Por capítulo. Build OK. FALTA probar en el visor (5173 y :3000 apagados; los arranca el propietario). docs/visor/25 §7.
NOTA 24-oct (Filters y Planilla): SOLO ANÁLISIS, docs/visor/27. Regla: Filters decide QUÉ se mira (duradero, se guarda); la Planilla responde CUÁNTO y QUÉ FALTA (momentáneo, se deshace). Solución profesional (§6): itemizado en Postgres + capa de campos derivados (Planilla › Estado / Capítulo / Partida) registrados en el esquema → Filters filtra, colorea y guarda sin tocar su motor; la Planilla deja de pintar (se retira su «Colorear 3D» P2). Espera OK del propietario para la migración.

[WIP HANDOFF]
TAREA:                Planilla · itemizado de la obra en Postgres + campos derivados para Filters (docs/visor/27 §6-7)
IMPLEMENTADO:         sql/40 + rollback, esquema_base, planilla_itemizado.py, routes/planilla.py (GET/POST/DELETE, admin de obra, versiones), politica + perfil portal; visor: lib/itemizadoDeObra + utils/itemizadoDeObraVisor (App lo carga con la obra), lib/camposDerivados + utils/camposDerivadosVisor (en tagInventory antes de inventory-ready; Filters los lista), la Planilla reutiliza la deducción; color propio de la Planilla retirado → «Colorear en Filters»; perfilarCampos 2,5 s → 0,7 s con resultado idéntico al publicado
PENDIENTE:            1) migración 40 en la base local (la aplica el propietario como ecd_migrator; también faltan 29/30); 2) prueba en el 5173 con backend :3000: cargar itemizado, otro frente, quitar, Colorear en Filters, vista guardada con filtro por Capítulo; 3) regenerar esquema_manifiesto.txt; 4) decidir «Partida» como faceta (varios valores por elemento)
ARCHIVOS MODIFICADOS: míos: backend/sql/40_planilla_itemizados.sql y _rollback.sql, backend/planilla_itemizado.py, backend/routes/planilla.py, backend/tests/test_planilla_itemizado.py, backend/esquema_base.py, backend/politica.py, backend/server.py (2 líneas), backend/tests/test_perfil_portal.py (1 línea); frontend-react/src/lib/itemizadoDeObra.js, camposDerivados.js, planillaCobertura.js, planillaPerfil.js, planillaItemizado.js, aislamientoTemporal.js; src/utils/itemizadoDeObraVisor.js, camposDerivadosVisor.js; src/components/TablaDePartidas.jsx, InventoryDataGrid.jsx, Viewer.jsx; src/App.jsx; pruebas/itemizadoDeObra, camposDerivados, planillaCobertura, aislamientoTemporal. Ajenos: el resto del EXPECTED WORKTREE (WIP de server.py, App.jsx, Viewer.jsx, etc.)
TESTS EJECUTADOS:     python -m pytest -q → 2371 passed, 1 failed (test_reconstruccion_desde_cero, previo); test_planilla_itemizado 28/28; visor 24 bancos en verde; vite build OK
TESTS PENDIENTES:     prueba en el visor (5173 y :3000 apagados; falta la migración 40 local)
FALLO CONOCIDO:       test_reconstruccion_desde_cero (previo: tablas fuera del manifiesto)
NEXT EXACT ACTION:    el propietario aplica backend/sql/40_planilla_itemizados.sql como ecd_migrator en la base local y arranca backend + npm run dev; luego Planilla → Partidas → Cargar itemizado (Presupuesto_Rv00.xlsx)
DO NOT TOUCH:         motor de Filters (filtersCore, filterVisualDriver), Saved Views, ficheros protegidos de AGENTS.md §6
COMMIT/HEAD REF:      b03d0fb2 (origin/main 857061ed)
NOTA 25-oct (Filters · panel que se sube): REPRODUCIDO EN PRODUCCIÓN (857061ed, Drenaje Urbano_Interferencias, Código de partida 1-3, «Mostrar más», marcar un valor de abajo): el marco filters-shell (overflow hidden, sin barra) se desplazaba 1.544 px y el panel quedaba en blanco. Causa (previa, desde 74f4dff1): la casilla invisible position:absolute tenía como referencia filters-shell y no la lista; al enfocarla el navegador desplazaba el marco. Arreglo: position: relative en .tandem-cb-container (una línea, presentación; motor de Filters intacto). Probado inyectando la regla en producción en una pestaña: marco 3060→1161 px de contenido, 0 px de desplazamiento al marcar, filtro correcto (108). EN LOCAL, SIN COMMIT. Filters es CLOSED: se reabre por defecto reproducible.
NOTA 25-oct: EMPUJADO 6a95b15e (fix(filters): panel en su sitio al marcar un valor bajo) por orden del propietario («publiquemos»): origin/main 857061ed..6a95b15e, solo TandemFilterPanel.jsx. Falta Manual Deploy de visor-ecd-frontend (el backend no cambia). Lo de la Planilla del 25-oct (itemizado guardado, campos derivados, «qué falta») sigue EN LOCAL: al commitearlo, partir de 6a95b15e, no de inventario-fase-t.
NOTA 25-oct (Planilla · sin migración no se rompe): EN LOCAL, SIN COMMIT. lib/itemizadoDeObra.js: si el servidor no puede guardar (503 MIGRATION_MISSING, 404 de un backend sin la ruta, vista compartida) pasa a modo «navegador»: el itemizado vive en el navegador como en producción hoy, con aviso «solo en este navegador»; los campos derivados y la cobertura funcionan igual. Con la tabla, se guarda para la obra. itemizadoDeObra 25/25, resto de bancos en verde, build OK. Falta la prueba en el 5173 (servidores apagados).
NOTA 25-oct (Planilla · PROBADA EN EL 5173 con la migración 40 local): migraciones 29, 30 y 40 aplicadas por el propietario en la base LOCAL (127.0.0.1:5433/ecd_dr12d, ecd_migrator; 29/30 tocaron 0 filas). Canal (13.866 elementos), Presupuesto_Rv00.xlsx: guardado como itemizado de la obra v1 (1.498 ítems), 132 partidas en 25 grupos, cobertura 98,5 %; campos derivados 13.652 con partida / 81 fuera / 133 sin partida, Capítulo 05 (12.499) y Varios (1.153), 1.213 ms; tras recargar sigue y se aplica solo; Drenaje (misma obra) ve v1, Interferencias (otra obra) nada; «Colorear en Filters por estado» abre Filters con el campo arriba y pinta los 13.866 con verde/rojo/naranja; filtrar «Sin partida» = 133; Limpiar filtros vuelve a 13.866. ARREGLADO en el camino: con la identidad demo local (id no numérico) la ruta respondía 401 y el visor cerraba la sesión → ahora guarda sin autor, nunca 401 con sesión (test 28/28 → actualizado). Medido: cargar un itemizado nuevo cuesta ~1,2 s de campos + ~3 s de Filters recalculando (copia el inventario entero; conducta previa de Filters). NO PROBADO: vista guardada con filtro por campo derivado (Saved Views local falla con la identidad demo: created_by INTEGER y id «demo»; en producción los ids son numéricos). La base local además no tiene users.activated_at (migración 07): otras rutas dan 401 en local; ajeno.
NOTA 26-oct (Planilla · PUBLICACIÓN): por orden del propietario («en la web»). Commit «feat(planilla): el itemizado se guarda para la obra y Filters usa sus campos» sobre 6a95b15e, armado con índice temporal (fuera: fachada/classifyViewerLeaves de Viewer.jsx, 4D/Avance de App.jsx, línea de Filters y color de la edición en bloque de InventoryDataGrid, y el WIP de server.py). ORDEN EN PRODUCCIÓN: 1) el propietario aplica backend/sql/40_planilla_itemizados.sql como ecd_migrator en Cloud SQL; 2) Manual Deploy visor-ecd-backend-va; 3) Manual Deploy visor-ecd-frontend. Sin la migración no se rompe nada (la Planilla usa el itemizado en el navegador y lo dice).
NOTA 26-oct: EMPUJADO 0c256816 (feat(planilla): el itemizado se guarda para la obra y Filters usa sus campos) por orden del propietario («EN LA WEB»): origin/main 6a95b15e..0c256816, 33 ficheros. Copia limpia: visor 25 bancos + build OK; backend 2342 passed / 2 failed (los mismos 2 que origin/main). FALTA: 1) migración 40 en producción (Cloud SQL pqt-08-talara, base postgres, ecd_migrator) — sin ella no se rompe nada, la Planilla usa el navegador; 2) Manual Deploy visor-ecd-backend-va; 3) Manual Deploy visor-ecd-frontend (lleva también 6a95b15e, el arreglo del panel de Filters). Verificar /api/health = 0c256816.
NOTA 26-oct: MIGRACIÓN 40 APLICADA EN PRODUCCIÓN (Cloud SQL pqt-08-talara, base postgres) desde Cloud SQL Studio; el propietario se autenticó como ecd_migrator y Claude pegó y ejecutó el texto exacto de sql/40 («La sentencia se ejecutó correctamente», tablas 127→128). Verificado con SELECT: tabla sí, índice uq_planilla_itemizado_vigente sí, ecd_app SELECT/INSERT/UPDATE sí y DELETE no, secuencia sí, 0 filas. (psql directo a 34.86.206.187 no conecta desde la red del propietario: timeout.) FALTA: Manual Deploy visor-ecd-backend-va y visor-ecd-frontend.
NOTA 26-oct: DESPLEGADO Y VERIFICADO. /api/health = 0c256816477d; /api/planilla/itemizado responde 401 sin sesión (la ruta existe); el visor sirve assets/index-B413zxJo.js con el código nuevo (planilla-ver-en-filters, «Estado frente al itemizado», «Cobertura del itemizado», «solo en este navegador») y el arreglo del panel de Filters (position: relative en .tandem-cb-container). Falta: la primera carga del itemizado en producción la hace el propietario (administrador de la obra).
NOTA 26-oct (Planilla · Interferencias 1 % de cobertura): CAUSA medida en producción: el itemizado INTERFERENCIAS_Rv00_PARTIDAS.xlsx (164 ítems) escribe «2.1.1.4» y el modelo «02.01.01.04»; comparando el texto tal cual solo casaban 3 de 80 códigos de CodigoDePartida1, y solo se reconocía la línea 03_03_01. ARREGLO EN LOCAL (sin commit): (1) planillaItemizado.normalizarCodigo + índice que compara sin ceros a la izquierda por tramo (ubicar devuelve el código del itemizado); (2) planillaPerfil: la familia es el mismo papel (si CodigoDePartida1 se reconoce, sus hermanas 2, 3 y sin número también, con al menos un código en el itemizado); (3) planillaCobertura: el capítulo como lo escribe el itemizado. Medido sobre los 4.621 elementos reales de producción (copia en la pestaña, sin tocar nada): 5 líneas (antes 1), 171 partidas (antes 7), cobertura 31,8 % (antes 1 %), 02.01.01.04 = 2 elementos · 4,686 m³ con nombre oficial; 591 ms. planillaItemizado 33/33 (8 nuevas), resto en verde, build OK. Pendiente menor: en la línea sin número la deducción empareja «NOMBRE DE PLANO»/«LONGITUD» (solo afecta al nombre de partidas fuera del itemizado). Falta: push + Manual Deploy de visor-ecd-frontend (backend no cambia).
NOTA 26-oct (Planilla · CRITERIOS DE MEDIDA, «Medir con…», docs/visor/32): donde un elemento no trae medida nativa (familias propias como la malla de cerco con `Cotas › Long. Reja`, genéricos, IFC con `Qto_…`, Revit en otro idioma, metrado volcado a un parámetro), la obra dice con qué parámetro se mide: {unidad, partida?, donde? (campo es/contiene valor), medirCon [en orden]}. La nativa manda (solo rellena); gana el más específico (partida+donde → partida → donde → obra); dos del mismo nivel = conflicto avisado, sin elegir; el valor debe traer la unidad de la partida. Nada de nombres de familias/parámetros/idiomas en el código. Piezas: `lib/criteriosDeMedida.js` (53/53), `lib/almacenDeObra.js` (almacén sacado de itemizadoDeObra, cuyo banco sigue 25/25), `utils/planillaServidor.js`, `utils/criteriosDeMedidaVisor.js`, `planillaPartidas` (nativa → criterio → sin medida; Excel con origen y criterios), `TablaDePartidas` («medir con…» en «Sin medida», lista «criterios de medida (n)», «·crit.»); backend `planilla_criterios_medida.py` + rutas GET/POST `/api/planilla/criterios-medida` (guardia_de_obra, admin de obra, bloqueo, 503 MIGRATION_MISSING, nunca 401) + `sql/41` y rollback + `esquema_base` + `test_planilla_criterios_medida.py`. Suite backend: 2.379 passed, 1 failed PREVIO (`test_reconstruccion_desde_cero`: cad_review_*, grupo(s)_documentos, vinculos_de_sustento; no son de la Planilla). Sin la migración 41 los criterios se usan solo en el navegador, con aviso. PENDIENTE: migración 41 (local y producción, como ecd_migrator) y prueba visual en el visor.
NOTA 26-oct (Planilla · PARTIDAS COMO PLANTILLA DEL ITEMIZADO, docs/visor/33): la vista Partidas es el itemizado en el orden del Excel, TODO desplegado (decisión del dueño), con las partidas sin elementos visibles en gris (para el revisor: ese metrado no sale del modelo), títulos con «x de y con dato», sub-partidas del modelo debajo de su ítem, bloque final «Del modelo, fuera del itemizado», plegar a mano, «solo con dato» y el buscador que también encuentra las vacías. `lib/planillaPlantilla.js` 20/20 (50.000 filas en 186 ms); la tabla dibuja solo las filas en pantalla. Probado con la tabla real sobre Canal local: 92 de 1.298 con dato, 34 fuera, 33 filas dibujadas de 1.541. Además `camposParaDonde` ordena «solo donde» por lo que distingue en la obra (55/55). Decisiones: una sola plantilla (la pone el admin); poner el dato de Civil/Excel/a mano, exportar en forma de plantilla y la auditoría de metrados de Revit = después.
