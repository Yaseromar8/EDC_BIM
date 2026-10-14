# Propuesta · consulta del documento y trazabilidad — 14-oct-2026

> El propietario: «¿qué me recomiendas? La idea es que analices los funcionamientos, actualices y me des una
> propuesta».
>
> - **Maqueta v8** (identidad confirmada, solo datos reales): `docs/ux/maquetas/consulta_documento_v8.html`,
>   banco `http://localhost:5180/maqueta-v8.html`.
> - **Antecedentes:** `MAQUETA_V5_ANALISIS.md` y `MAQUETA_V6_TRAZABILIDAD_REVISION.md`.
> - **Alcance:** solo análisis y maqueta; no se tocó la app ni el backend.

## 1 · Cómo funciona hoy (medido en el código)

**Lo que la persona VE en Docs:**

| Pregunta del usuario | Dónde se responde hoy | Problema |
|---|---|---|
| ¿En qué estado está? | Chip de estado en la tabla | Sin fechas: no dice *cuándo* pasó a Publicado ni con qué idoneidad |
| ¿Qué versiones hay? | Panel lateral de versiones (`VersionPanel.jsx`): abrir, comparar dos PDF, promover | Bien, pero sin la huella |
| ¿Quién hizo qué? | Pantalla «Actividad» de **toda la obra** | Hay que buscar a mano. Si se pide el historial de un archivo, se busca **por nombre**: al renombrarlo se pierde lo anterior |
| ¿En qué revisiones o envíos estuvo? | Hay que entrar en Revisiones, Transmittals o RFI y buscarlo | No hay vista desde el documento |
| ¿Es este el archivo que se aprobó? | **En ninguna parte** | — |

**Lo que el sistema YA GUARDA y nadie ve:**

| Dato | Dónde | Para qué sirve |
|---|---|---|
| Emisiones con fecha, idoneidad y revisión | `file_emisiones` (`estados_ecd.py`) | El recorrido con fechas |
| Cambios de estado con autor, motivo, idoneidad y revisión, **encadenados** | `activity_log` (`auditoria_encadenada.py`) | Quién lo publicó y por qué, a prueba de alteraciones silenciosas |
| **Id del documento en cada evento** (subir, renombrar, mover, estado…) | `activity_log.entity_id` | Historial completo aunque se renombre |
| **Huella SHA-256 de cada versión** | `file_versions.sha256` (`file_system_db.py`) | Probar qué archivo exacto se emitió |
| **Comprobar un archivo contra sus versiones** | `POST /api/docs/integridad/comprobar`, que **ya existe y no lo usa ninguna pantalla** | «¿El PDF que me enseñan es el aprobado?» |
| Cobertura de huellas de la obra | `GET /api/docs/integridad`, también sin pantalla | Cuántos documentos se pueden demostrar |
| Accesos entregados | `registro_de_descargas.py` | Quién recibió qué versión |
| Enlaces desde Revisiones, Transmittals, RFI y Red Line | JSONB con el id del documento | «Lo conectado» |

**Conclusión:** la trazabilidad **ya está registrada, y bien hecha**; lo que falta es **enseñarla en un sitio**.
La propuesta es casi toda de pantalla y de rutas de lectura.

## 2 · La propuesta (maqueta v8)

Dos niveles sobre el mismo documento, con la identidad confirmada y los iconos de obra:

**A · Panel al pulsar una fila** (vistazo, sin salir de la lista):
- Abrir · Descargar · Ficha completa.
- **Recorrido ISO 19650 con fechas.**
- **Integridad:** «Huella comprobada · V3 · SHA-256 9f2c41a7…» y «Registro íntegro: 7 de 7 eventos sellados».
- Código del documento, leído campo a campo.
- **Lo conectado** (solo lo real): Revisiones, Envíos, RFI y Marcas.

**B · Ficha completa**, con ‹ › para pasar al siguiente documento:

| Pestaña | Qué muestra |
|---|---|
| Resumen | Vista previa, ubicación, idoneidad, revisión |
| Versiones | Versión, revisión, fecha, autor, idoneidad, **huella** (copiable) y abrir esa versión |
| **Trazabilidad** | **Una sola línea de tiempo** que junta estados, versiones, envíos, RFI y accesos, filtrable. Cada evento dice **quién**, **cuándo** y **por qué**, con enlace a lo que lo causó («Aprobado en RV-041»). Al pie, el estado de la cadena |
| Accesos | Quién recibió qué versión y desde dónde |
| Relacionados | Revisiones, Transmittals, RFI y Marcas |

Y dos acciones nuevas en la cabecera:
- **Comprobar un archivo.** Se suelta el PDF que alguien enseña y responde: «Coincide con la V3 · C03, emitida
  como A1 el 12/10 por Ana Revisora», o «No coincide con ninguna versión». No guarda nada. Usa la ruta que ya
  existe.
- **Constancia de trazabilidad (PDF).** La ficha impresa (recorrido, huellas, línea de tiempo y estado de la
  cadena) para el expediente, la supervisión o lo que pida el SNPMGI o la Contraloría.

**Lo que NO se muestra, por honestidad:**
- «En el modelo» y «Fotos de campo»: no existe el vínculo.
- «Descargas»: se llama **«Accesos»**, porque eso es lo que se registra.
- «Inmutable»: la cadena **detecta** cambios, pero no los impide, y la pantalla lo dice así.

**Por qué es nuestra, y no una copia:**
- ACC y Procore tienen historial, pero no ponen a la vista **la huella del archivo**, ni **comprueban** un archivo
  traído de fuera, ni dan una **constancia** pensada para el expediente público.
- Eso es lo que necesita una entidad peruana ante un control posterior.

## 3 · Plan por pasos (todo en local, sin commit hasta su visto bueno)

| Paso | Qué | Backend | Migración |
|---|---|---|---|
| **1** | Panel al pulsar una fila: recorrido sin fechas, código leído, versiones e integridad de la versión vigente | Nada (la huella ya llega con las versiones) | No |
| **2** | Rutas de lectura: emisiones por documento, actividad **por id** (un parámetro más en `/api/activity`), accesos y relacionados (búsqueda en JSONB) | 4 rutas GET o ampliaciones | No |
| **3** | Ficha completa con las 5 pestañas y la línea de tiempo unificada | Nada más | No |
| **4** | «Comprobar un archivo» | Ya existe (`/api/docs/integridad/comprobar`) | No |
| **5** | Estado de la cadena por documento | Ruta GET que verifique el tramo del documento | No |
| **6** | Constancia de trazabilidad en PDF | Generación en el navegador o en el backend | No |
| 7 (opcional) | Comentario por versión | Columna nueva | **Sí** |

**Recomendación:** empezar por **1 + 4**. Solo con lo que ya existe, el usuario gana el vistazo y la
comprobación de autenticidad, que es lo más diferencial. Después, 2 + 3 (la ficha), y por último 5 y 6.

## 4 · Decisiones

1. ¿Apruebas la v8 como diseño de la consulta?
2. ¿Empezamos por los pasos 1 + 4?
3. ¿La línea de tiempo unificada (Trazabilidad) sustituye a pestañas separadas de historial, revisiones y
   envíos? Recomendado: sí.
4. ¿La Constancia en PDF entra en esta tanda o después?

## 5 · Revisión a fondo: lo que se nos estaba pasando (14-oct-2026)

El propietario: «me gusta, pero averigua un poquito más el funcionamiento, por si se nos está pasando algo». Leído
en el código del backend (sin tocar la base de datos):

### A · GRAVE: cuatro escrituras del registro saltan la cadena, y la verificación no lo detecta

`activity_log` se encadena en `db.log_activity` y en los cambios de estado (`estados_ecd._auditar`). Pero hay
**cuatro sitios que insertan a mano sin sellar**:

| Fichero | Qué registra |
|---|---|
| `file_system_db.py:366` | **La retirada de una aprobación al subir o promover una versión** (Publicado → WIP). Es el evento más probatorio de todos |
| `bloqueo_de_edicion.py:168` | Reservas y reservas retiradas o forzadas |
| `registro_de_descargas.py:143` | Accesos a documentos |
| `routes/documents.py:2267` | El «suprimido» por documento en los borrados en lote |

Y `auditoria_encadenada.verificar()` cuenta esas filas como `sin_sellar`, «anteriores al encadenamiento», y
**no las marca como rotura**, aunque su propio comentario promete el motivo «sin huella». Resultado: esas filas
se pueden **alterar o borrar sin que la verificación diga nada**, y la pantalla podría afirmar «registro íntegro»
falsamente.

Hay además una trampa: `sellar_pendientes()` encadena las filas sin sello **al final**, en orden de id. Si se
ejecuta con filas nuevas sin sellar intercaladas, produce roturas «eslabón roto» falsas.

**Arreglo (backend, sin migración):**
- que las cuatro inserciones usen `sello_para_insercion` con su mismo cursor, como ya hace `estados_ecd`;
- que `verificar()` marque como rotura toda fila sin sello **posterior** a la primera sellada.

**Hasta que esté hecho, la pantalla no puede decir «registro íntegro».**

### B · Una huella que falla al calcularse no se reintenta nunca

La huella de las subidas por URL firmada y troceadas se calcula **en segundo plano**, leyendo el objeto del
almacén. Si falla (un corte con un plano de 272 MB, un reinicio del servicio), la versión queda **sin huella
para siempre**. `GET /api/docs/integridad` lo cuenta, pero nada lo repara.

**Arreglo:** una tarea «sellar huellas pendientes» que recorra las versiones sin `sha256` y llame a
`sellar_desde_almacen`. Es segura: `anotar()` nunca sobrescribe una huella existente.

### C · «Comprobar un archivo» compara contra UNA versión

`POST /api/docs/integridad/comprobar` pide `version_id`. Para la v8 («¿es alguna versión de este documento?»):
- calcular la huella una vez y compararla con **todas las versiones del documento**;
- responder cuál coincide, o ninguna, o «sin huella» para las versiones anteriores al control.

Cambio pequeño en la ruta, sin migración.

### D · `/api/docs/trazabilidad` YA EXISTE y ninguna pantalla la usa

Busca por id del documento (resuelve el problema del renombrado) y devuelve eventos y versiones. Le falta:
- la **huella** de cada versión;
- el **historial de emisiones** completo (`file_emisiones`; hoy lee `file_versions.emitida_en`, que se pisa en
  cada emisión);
- el **estado de la cadena** del documento;
- los **envíos**: los transmittals se registran con el id del transmittal, no con el del documento. Hay que
  cruzarlos por `transmittals.items`, igual que Revisiones, RFI y Red Line.

**Se amplía esa ruta** en lugar de crear cuatro nuevas.

### E · Los accesos no dicen qué versión

`registro_de_descargas` guarda vía e IP, pero **no el número de versión**, que la v8 enseña. **Arreglo:**
- añadir la versión al `details` (JSON, sin migración);
- los accesos antiguos saldrán como «versión no registrada».

Además:
- hay un freno por persona, documento y ventana de tiempo: los accesos repetidos seguidos se anotan una vez;
- la IP no se muestra en pantalla.

### F · Un cambio de estado manual puede quedar sin «por qué»

Las aprobaciones por revisión sí dejan el motivo («revisión #41: …»). El cambio manual con el chip de estado lo
deja opcional. **Propuesta:** al publicar o archivar **fuera de una revisión**, pedir una línea de motivo. Solo
pantalla.

### G · Versiones anteriores al control de huellas

Las versiones subidas antes de que existiera la huella no la tienen. La ficha debe decirlo:
- en la versión: «sin huella (anterior al control)»;
- en la obra: su cobertura (`/api/docs/integridad`, que tampoco tiene pantalla).

### Lo que está BIEN (comprobado)

- Toda vía que crea una versión acaba sellada o contada como sin sellar. Ninguna se escapa.
- Promover una versión antigua **copia su huella** y deja escrito que retiró la aprobación.
- Las emisiones se anotan **antes** de cambiar el estado: si no se pueden anotar, no se emite.
- La revisión aprobada deja su motivo en el documento.
- La cadena tiene **ancla** contra el borrado del final.
- El borrado en lote deja un evento por documento.

## 6 · Plan corregido

| Paso | Qué | Dónde |
|---|---|---|
| **0** | **A**: las cuatro escrituras a la cadena y `verificar()` estricto; **B**: tarea de huellas pendientes | Backend, con pruebas, sin migración |
| **1** | Panel al pulsar una fila (recorrido, código, integridad de la vigente, «sin huella» si falta) | Docs |
| **2** | **D** + **E**: ampliar `/api/docs/trazabilidad` (huella, emisiones, cadena, envíos y relacionados) y la versión en los accesos | Backend |
| **3** | Ficha completa con la línea de tiempo | Docs |
| **4** | **C**: comprobar contra todas las versiones del documento | Backend + Docs |
| **5** | **F**: motivo al publicar o archivar fuera de revisión; **G**: cobertura de huellas de la obra | Docs |
| **6** | Constancia de trazabilidad en PDF | Docs |

**La maqueta v8 es válida como diseño.** Hasta el paso 0 no se puede afirmar «registro íntegro», y hasta el
paso 2 los accesos no muestran la versión.

## 7 · Última revisión, contra los propios hallazgos (14-oct-2026)

El propietario: «una última revisión más, para estar seguros». Se buscó desmontar cada hallazgo de §5 y se
siguió buscando más. Sin tocar la base de datos.

### Lo que se confirma, con matices

| # | Hallazgo | Comprobación | Veredicto |
|---|---|---|---|
| A | Cuatro escrituras sin sellar | No hay **ningún disparador** en `sql/` ni en el bootstrap que selle `activity_log` | **Confirmado** |
| A′ | Matiz | `sql/03_grants_ida.sql` **quita a `ecd_app` el UPDATE, DELETE y TRUNCATE** sobre `activity_log`. La aplicación no puede alterar esas filas; solo un rol privilegiado (`ecd_migrator`, `postgres`). Justo lo que la cadena debe delatar | Menos grave de lo dicho, **pero sigue siendo un agujero**. Que la migración 03 esté aplicada en producción hay que verificarlo, no suponerlo |
| A″ | Contrato vigente | `tests/test_auditoria_encadenada.py::test_las_filas_sin_sellar_no_son_una_rotura` lo afirma **a propósito** para las filas antiguas (11/11 pasan) | El arreglo debe **mantener** ese caso y marcar solo las filas sin sello **posteriores** a la primera sellada |

### Nuevos hallazgos

**H · GRAVE: un administrador puede destruir un documento emitido y toda su evidencia.**
`DELETE /api/docs/permanent-delete` (`routes/documents.py:2442` → `file_system_db.permanent_delete_node_internal`):
- borra los archivos de **todas las versiones** en el almacén y el nodo;
- por `ON DELETE CASCADE` se van también las **versiones y sus huellas**;
- **no comprueba que el documento esté en la Papelera**: solo la pantalla lo llama desde allí;
- **no mira si fue publicado, emitido, enviado en un transmittal o revisado**;
- lo único que queda es una línea «permanent_delete» con el nombre.

En obra pública eso choca con la conservación del expediente.

**Propuesta:**
- solo se puede borrar definitivamente lo que **está en la Papelera** y **nunca se emitió** (sin emisiones ni
  transmittals);
- lo emitido solo se **archiva**.

Sin migración.

**H′ · Menor:** esa misma ruta valida el acceso con el `model_urn` que manda el cliente y **no con la obra del
documento**. La ruta de trazabilidad ya lo hace bien («la obra sale del documento»). Con el rol de administrador
de instancia el riesgo práctico es bajo, pero el patrón está mal.

**I · Si el sellado falla, `log_activity` inserta la fila sin sello igualmente** (`db.py`, solo un `print`).
- Es una quinta vía de filas sin sellar.
- La decisión es razonable: el registro no debe tumbar la operación.
- Pero, con el arreglo de A, esas filas aparecerán como rotura. Es lo correcto: que se vea.

**J · Nadie verifica la cadena ni guarda el ancla.**
- `verificar()` y `ancla_actual()` solo se usan en pruebas.
- No hay ruta, tarea ni copia externa del ancla.
- La protección contra «borrar el final del registro» **existe en el código, pero no está en funcionamiento**.

**Propuesta:**
- una ruta de solo lectura que verifique el tramo de un documento, para la ficha;
- una verificación de toda la obra, para un administrador;
- guardar el ancla fuera de la base: en el almacén de archivos o descargándola.

### Plan definitivo

| Paso | Qué |
|---|---|
| **0a** | **H**: impedir el borrado definitivo de lo emitido y de lo que no esté en la Papelera; obra sacada del documento (H′) |
| **0b** | **A + I**: las cuatro escrituras a la cadena y `verificar()` estricto **desde la primera fila sellada** (sin romper la prueba de las filas antiguas) |
| **0c** | **B**: tarea de huellas pendientes · **J**: verificación por documento y por obra, y guardar el ancla |
| 1–6 | Como en §6: panel, ruta de trazabilidad ampliada, ficha, comprobar, motivo y cobertura, constancia |

Todo es backend con pruebas y **sin migración**. Antes de desplegar nada:
- verificar en producción que la migración 03 está aplicada (permisos de `ecd_app` sobre `activity_log`);
- verificar cuántas filas sin sellar hay desde la primera sellada.

### Decisión del propietario sobre H (14-oct-2026)

«Eso lo tengo así porque aún no está en producción ni lo usa una entidad. De nada me serviría retenerlos y pagar
por almacenamiento en archivado mientras no tenga un usuario serio todavía.»

- **H y H′ NO se tocan**: el borrado definitivo se queda como está, por decisión de coste, mientras no haya una
  entidad usando el sistema.
- Se retomará cuando entre el primer usuario serio.
- El resto del plan (0b, 0c y 1–6) sigue adelante.

## 8 · Hecho en local: pasos 0b y 0c (14-oct-2026, sin commit)

| Hallazgo | Cambio | Fichero |
|---|---|---|
| **A** | Las cuatro vías pasan por `registrar_actividad`, que sella: reservas, retirada de aprobación, accesos y suprimido por lote (este último uno a uno, con el mismo cursor) | `bloqueo_de_edicion.py`, `file_system_db.py`, `registro_de_descargas.py`, `routes/documents.py` |
| **A** | `verificar()`: una fila sin sello **posterior** a la primera sellada es rotura «sin huella». Las anteriores a la cadena siguen siendo `sin_sellar` | `auditoria_encadenada.py` |
| **A** | `sellar_pendientes()` se niega si hay filas sin sellar intercaladas: encadenarlas al final fabricaría roturas falsas | `auditoria_encadenada.py` |
| **I** | El sellado va en un SAVEPOINT. Si falla, el evento se escribe sin sello y la operación sigue (antes se abortaba la transacción de quien llamaba). Si el INSERT mismo falla, se sigue avisando: contrato R01 intacto | `db.py` |
| **E** | El acceso guarda **qué versión** se entregó (`details.version`) | `registro_de_descargas.py` |
| **B** | `integridad.versiones_sin_huella()` + `sellar_pendientes()` (en serie: un worker, 1 CPU) | `integridad.py` |
| **B + J + D** | `/api/docs/trazabilidad` (ya existía) amplía su respuesta; ver el detalle debajo | `routes/documents.py` |

Lo que añade `/api/docs/trazabilidad`:
- la huella de cada versión;
- el historial de emisiones (`file_emisiones`);
- si cada evento está sellado;
- el estado de la cadena en los eventos del documento;
- el relanzamiento del sellado de las versiones sin huella.

**No se añadieron rutas nuevas.** Se probaron dos (verificación global de la cadena y sellado de pendientes de
toda la obra), y las dos pruebas-vigía del repositorio las frenaron:
- **`test_capacidades_con_puerta`:** una capacidad de administrador tiene que tener pantalla.
- **`test_perfil_portal`:** el techo de rutas del portal es 286, y daba 287.

No se subió el techo ni se declararon excepciones. La verificación global y el ancla externa quedan para cuando
exista su pantalla de administración.

**Pruebas:**
- Nuevas en `tests/test_trazabilidad_sellada.py` (10/10) y en `test_auditoria_encadenada.py` y
  `test_registro_de_descargas.py`.
- Tres pruebas existentes se ajustaron **solo** para leer `details` por su posición (la 6), porque el INSERT
  sellado lleva detrás la fecha y las dos huellas. Lo que comprueban no cambia.
- **Suite completa:** 2135 pasan, 2 fallan. Son los 2 de antes, ajenos a esto:
  - `test_reconstruccion_desde_cero` (tablas de revisión CAD fuera del manifiesto);
  - `test_capacidades_con_puerta` por `/api/docs/miniaturas/preparar`.

**Consecuencia esperada:** en producción hay eventos escritos por las cuatro vías antes de hoy, sin sello. La
trazabilidad de esos documentos los mostrará como no sellados y su tramo como no íntegro. Es la verdad: hasta
hoy se podían alterar sin que se notara.

## 9 · Paso 1 hecho en local: el panel de consulta (14-oct-2026, sin commit)

**Cómo funciona.** Clic en la fila de un **documento**, fuera del nombre y de la casilla, y el panel se abre a la
derecha de la tabla (`components/PanelConsulta.jsx` + `.css`). Es solo lectura.
- Pulsar la misma fila lo cierra, igual que la ✕.
- Se cierra al cambiar de carpeta o ir a la Papelera.
- No aparece en la cuadrícula ni en los resultados de búsqueda.

**Lo que no cambia** (comprobado en el banco con clics reales):
- el **nombre** sigue abriendo el lector, y el panel no se abre;
- la **casilla** sigue seleccionando, sin abrir el panel;
- las **carpetas** no abren panel;
- el clic de fila **no selecciona nada**. Era el motivo de dejarla inerte, y se respeta;
- el resto de clics de la fila (descripción editable, versión, ⋮, estado) paran la propagación por su cuenta.

**Qué enseña.** Todo sale de `/api/docs/trazabilidad`, por id del documento:
- acciones (Abrir, Versiones) y el estado;
- el **recorrido ISO 19650 con fecha corta**, tomada de las emisiones o, en su defecto, de los cambios de estado;
- la **integridad**: huella SHA-256 de la versión vigente (copiable), o el aviso de que aún no la tiene. Debajo,
  «N de M eventos sellados», y cuántos están sin sello o alterados;
- el **código del documento** desmontado: solo si el nombre trae las 7 piezas;
- los **últimos movimientos** en castellano: quién, qué y cuándo.

Lo que el servidor no devuelva no se pinta: con un backend anterior faltan la huella y la cadena, y esas
secciones no salen.

**Para verlo con datos reales del backend nuevo:**
- arranque `docs-ensayo` (`.claude/launch.json`): Docs en `http://localhost:5183` con la API en el backend local
  (`:3000`);
- en `:5174` la API va a producción, que aún no tiene la trazabilidad ampliada.

**Verificado:**
- banco `probar-busqueda.html`, con una respuesta de trazabilidad del mismo formato que la ruta nueva;
- build sin errores;
- bancos de Docs: 20 de 20 en verde.

## 10 · Columnas propias de Archivos (14-oct-2026, en local, sin commit)

El propietario: «las columnas de Archivos… ¿así son estándar o deberíamos cambiar? Creo que se parece a ACC.
Cambiar sin distorsionar nada» · «siempre abre Procore y revísalo».

Comparación con Procore en `docs/ux/PROCORE_PATRONES_ESTANDAR.md` («Columnas de la lista de documentos»).

| Antes (calcado de ACC) | Ahora |
|---|---|
| Nombre · Descripción | **igual** |
| Versión | **Revisión** (mismo botón: código de revisión o V; abre las versiones) |
| Estado de rev. (al final) | **Estado ISO 19650**, junto a Revisión (mismo control clicable) |
| Indicadores · Marcas de rev. · Incidencias | **retiradas**: estaban SIEMPRE vacías («--») |
| Últ. actualización · Actualizado por | **Actualizado** (sin segundos; el valor exacto en el título) · **Por** |
| Tamaño | al final |

Además, el chip de estado y el botón de versión pierden la forma de píldora.

**Comprobado en el banco** (clics reales):
- las 5 cabeceras siguen ordenando;
- los anchos guardados de las columnas retiradas se descartan sin romper la tabla (`anchosColumnas`, 15/15);
- build sin errores;
- bancos de Docs 20/20.

**Siguientes columnas, con datos reales:**
- **Tipo/Disciplina**, leídas del código del documento;
- **Vínculos**: revisiones, envíos y RFI, cuando el listado los traiga.

## 11 · Paso 3 hecho en local: la ficha completa (14-oct-2026, noche, sin commit)

El propietario: «sí, hazlo sin parar». Diseño: la maqueta v8 (§2-B).

**Cómo se abre.** Desde el panel de consulta, con el botón «Ficha completa».
- Ocupa el sitio del árbol y la tabla, y «← Archivos» lo deja todo como estaba: la vista activa, los filtros y el
  panel.
- Se pone **encima** de la tabla, que sigue montada. Si se la ocultaba, la tabla virtual medía 0 de alto y al
  volver no pintaba ninguna fila: pasó en el banco y quedó corregido.
- ‹ › pasan al documento anterior o siguiente de lo que se ve (la carpeta filtrada o la vista), en el orden por
  nombre de la tabla.

**Pestañas:**
- **Resumen:** ubicación, descripción, revisión, idoneidad, entrega del plan, actualizado y reserva.
- **Versiones:** cada versión con subida, emisión, idoneidad y su **huella SHA-256** (se puede copiar), y el
  enlace al historial de versiones de siempre.
- **Trazabilidad:** **una sola línea de tiempo** que junta el registro (estados, subidas, accesos, renombrados,
  vínculos con el plan) con las revisiones, los envíos y los RFI.
  - Se filtra por tipo.
  - Un evento del registro que no está sellado lo dice («sin sellar»). Lo que no viene del registro no inventa
    sello.
  - Al pie, el estado de la cadena.
- **Accesos:** quién recibió qué versión y por qué vía; los denegados en rojo. No se enseña la IP.
- **Relacionados:** revisiones, envíos (con sus acuses), RFI, compromisos del plan y marcas publicadas, buscados
  por el ID del documento.

A la derecha, siempre visibles: el recorrido ISO 19650, la integridad, el código y el último movimiento.

**«Comprobar un archivo»** (paso 4, hallazgo C):
- La huella se calcula **en el navegador**, con `crypto.subtle`, y se compara con **todas** las versiones.
- El archivo no sale del equipo.
- Dice si coincide con la vigente, si coincide con una anterior («Ojo: no es la versión vigente») o si no coincide
  con ninguna. Sin huellas, no afirma nada.
- Tope de 1,5 GB.

**Servidor** (sin rutas nuevas):
- `/api/docs/trazabilidad` añade `relacionados` (`backend/ficha_documento.py`). Cada bloque va en su SAVEPOINT,
  así que una tabla que falta o falla no deja sin datos a las demás.
- **Corrección de seguridad:** la ruta solo comprobaba ser de la obra. Ahora pasa por
  `permiso_documental.guardia` (mínimo `viewer`), igual que el listado. Las dos pruebas existentes de la ruta
  conceden ese permiso en su arnés y hay una nueva para la negativa.

**Pruebas:**
- `test_ficha_documento.py` 3/3 y `test_trazabilidad_sellada.py` 11/11.
- Bancos de Docs 23/23, con los nuevos `fichaDocumento` 12/12 y `portadaObra` 8/8.
- Clics en el banco `probar-busqueda.html`, que tiene una respuesta de trazabilidad con huellas reales: todas las
  pestañas, el filtro «Envíos», ‹ › y la vuelta a Archivos con sus filas.
- Comprobar un archivo con tres archivos (vigente, anterior y alterado): los tres veredictos correctos.

**Falta:** la constancia en PDF (paso 6) y el motivo al publicar fuera de revisión (paso 5).
