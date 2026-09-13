# E1.1 · Alta de revisiones y participantes — informe de cierre

13-sep-2026. Base: `68b14b8` (E1 en producción). Contrato: `E1_1_CONTRATO.md`. Corrige los hallazgos H1–H4 de la prueba de E1 (`E1_UAT_HALLAZGOS.md`).

**Estado: implementado y probado en local; commit único autorizado por el propietario sobre `68b14b8`. Sin push, sin despliegue, sin migraciones.**

## 1 · Qué queda corregido

| # | Antes | Ahora |
|---|---|---|
| H1 | Un administrador de la entidad no podía ser revisor en ninguna obra: el alta exige participar en la obra y la pantalla no dejaba añadirlo | **Se añade como participante desde Participantes**, marcado «Administrador de la entidad» y sin la casilla de administrar la obra, que ya administra. Después puede revisar, recibir encargos y verlos en Mi Trabajo. **Se retira como cualquier participante**, y retirarlo no le quita la administración |
| H1 · protección | Si el administrador hubiera sido participante, «Guardar accesos» de la portada lo habría borrado sin avisar, porque esa lista no trae administradores | **«Guardar accesos» no toca su participación.** Todo lo demás de esa lista funciona igual |
| H2 | Elegir una plantilla borraba sin avisar los revisores puestos a mano, y volver a «a mano» vaciaba la lista | **Con revisores puestos a mano, se pide confirmación antes de sustituirlos**, y cancelar no cambia nada. **«A mano» conserva los pasos.** Si la plantilla falla, **vuelven los pasos de antes** con el aviso de error |
| H3 | La lista de revisores ofrecía a toda la entidad (gente de otras obras, cuentas retiradas), y el error solo aparecía al pulsar «Iniciar revisión» | **Solo participantes activos de la obra**, con su empresa y la marca de pendiente, y una línea que explica cómo añadir a quien falte. **Lo mismo en «Sustituir revisor…»** (H3b). La sustitución en sí no cambia |
| H4 | «asi», «Anadelo» | «así», «Añádelo». Mismo arreglo en el motivo de revisión bloqueada |

## 2 · Qué no cambia, comprobado

- **Participar no le quita nada a un administrador.** Las comprobaciones de acceso miran primero si administra la entidad. Revisado en `es_admin_de_obra`, `_es_admin_de_esta_obra` (la puerta de `guardia_de_obra`), `permiso_efectivo` y el listado de documentos. El ensayo lo mide antes, durante y después de participar.
- **Las reglas del alta en el servidor, `/act` y la sustitución, sin cambios.** Esas reglas son: participar en la obra, cuenta activa, acceso a los documentos, independencia y contrato.
- **«Guardar accesos» sigue sin incorporar administradores**, y sigue retirando a quien se desmarca.
- **No toca `FilesPage.jsx` ni el resto del WIP ajeno.** Sus sha256 siguen iguales.

## 3 · Ficheros

**Backend**
- `routes/administracion.py`:
  - la lista de candidatos incluye al administrador y devuelve el `role` de cada persona;
  - incorporar ya no responde 409 `ENTITY_ADMIN_SIN_MEMBRESIA`.
- `routes/auth.py` (`update_project_users`): guardar por diferencia deja intacta la fila de un administrador.
- `routes/reviews.py` y `flujo_de_revision.py`: tildes en dos mensajes.
- **Pruebas:**
  - `tests/test_membresia_por_obra.py`: cambian dos pruebas que fijaban la regla antigua (ver §5) y hay dos nuevas sobre la pantalla;
  - `tests/test_accesos_por_diferencia.py`: dos pruebas nuevas.
- **Nuevo** `herramientas/ensayo_de_admin_participante.py`: 16 comprobaciones contra PostgreSQL.

**Frontend (`frontend-docs`)**
- `components/ReviewsModule.jsx` (`ReviewModal`):
  - la lista sale de `/miembros`;
  - confirmación al aplicar plantilla, «a mano» conserva, recuperación si la plantilla falla;
  - ayuda para añadir participantes.
- `components/RevisionDetalle.jsx` (`SustituirRevisor`): la lista sale de `/miembros` de la obra de la revisión.
- `components/ParticipantesModule.jsx`: el administrador como candidato, sin casilla de administrar la obra, con nota y con botón de retirar.
- **Nuevos:** `utils/altaDeRevision.js` (reglas puras del selector de flujo) y `pruebas/altaDeRevision.prueba.mjs` (8 pruebas).
- `probar-revisiones.jsx` (banco): abre también el alta, con plantillas simuladas (una que falla) y un padrón distinto de la lista de participantes.

## 4 · Evidencia

| Prueba | Resultado |
|---|---|
| `python -m pytest -q -p no:cacheprovider tests` (desde `backend`) | **1812 passed, 1 failed**. El fallo es el preexistente `test_capacidades_con_puerta`. Antes eran 1808 / 1; hay 4 pruebas nuevas |
| `npm test` (frontend-docs) | **6 bancos en verde**; `altaDeRevision` 8/8 |
| ESLint sobre los ficheros JS tocados | 0 problemas |
| `npx vite build --outDir <fuera del repo>` | OK |
| `ensayo_de_admin_participante.py`, base desechable, ENFORCE | **16/16** |
| Regresión `ensayo_de_detalle_de_revision.py` (E1) | **25/25** |
| Regresión `ensayo_de_version_y_visibilidad.py` | **67/67** |
| Regresión `ensayo_de_revisiones.py`, sin `.env` | **50/50** |
| Banco `probar-revisiones`: el alta real con servidor simulado | PASS, detalle abajo |
| App real con backend real del banco: Participantes | PASS, detalle abajo |

**Ensayo contra PostgreSQL, 16/16:**
- **Antes de participar:** el alta con el administrador de revisor da 400 `REVISOR_FUERA_DE_LA_OBRA`, ya con tildes.
- **Incorporación:** aparece como candidato con su rol; se incorpora; un miembro corriente lo ve en `/miembros`; deja de ser candidato; la cuenta retirada no sale.
- **Autoridad:** administra la obra y atraviesa los permisos de carpeta antes, dentro y fuera.
- **Ya participante:**
  - el alta funciona y la revisión queda ACTIVA;
  - le toca, con «Dar conformidad»;
  - la ve en Mi Trabajo;
  - su conformidad pasa por `/act`.
- **«Guardar accesos»** no le borra la fila.
- **Retirarlo desde Participantes** sí la borra. Su revisión en curso queda BLOQUEADA con el motivo con tildes, y vuelve a ser candidato.

**Banco de interfaz (el `ReviewModal` real):**
- La lista pide `/api/projects/<obra>/miembros`, no `/api/users`. Muestra Ana, Luis y Eva (PENDIENTE) con su empresa; no muestra a la persona de otra obra que sí trae el padrón. Se ve la línea de ayuda.
- Con Ana y Luis puestos a mano, elegir PLANOS_ASBUILT abre «Aplicar la plantilla · «PLANOS_ASBUILT» sustituye a los 2 revisores que has puesto».
- **Esc** cancela: siguen Ana y Luis y el flujo sigue «a mano».
- **Enter** aplica: pasan a Coordinación — Eva y Jefatura — Luis.
- Volver a «a mano» conserva esos dos pasos y avisa «Has vuelto a «a mano»…».
- PLANTILLA_ROTA también pide confirmación. Al aceptarla, el servidor responde 409: vuelven los dos pasos, el flujo queda en «a mano» y sale el error.

**App real con backend real (administrador ficticio del banco):**
- En Participantes, «Añadir persona» ofrece «E11 admin — sin empresa · Administrador de la entidad».
- Al elegirlo no aparece la casilla «administra esta obra» y sí la nota.
- Incorporar lo añade: la lista pasa de 2 a 3 personas y su fila lleva el botón de retirar.
- En la base queda su fila (`project_users`, `es_admin` falso).

## 5 · Pruebas que cambian, y por qué

En `test_membresia_por_obra.py`, dos pruebas fijaban justo la regla que H1 cambia por decisión del propietario:
- `test_el_entity_admin_no_se_incorpora`;
- el filtro `ROLE <> 'ADMIN'` de `test_candidatos_es_lo_incorporable`.

Se sustituyen por la regla nueva: el administrador se incorpora, y su filtro ya no está en la consulta. La respuesta de candidatos lleva ahora `role`, así que su dato de prueba incluye esa columna.

El resto de la regla sigue fijado igual: solo cuentas activas, que no sean ya miembros, y una cuenta retirada no se incorpora.

## 6 · Observaciones

- **Sin verificar en la app real: «Enviar a revisión».** El panel del navegador de esta sesión mide 286×307 px: la tabla de archivos no pinta las filas y los clics quedan fuera de la vista. Ese paso queda cubierto por el banco (mismo componente) y por el ensayo (alta con el administrador de revisor), pero **conviene verlo en tu prueba** tras el despliegue.
- **No ejecutado: `ensayo_de_administracion.py`**, porque lee el `.env` del repositorio. Lo cubren la suite completa y el ensayo nuevo.
- **`test_perimetro.py` falla si se ejecuta justo después de `test_accesos_por_diferencia.py`.** El fixture de este último recarga `routes.auth` en modo estricto, igual que antes de E1.1. Pasa solo (11/11) y en la suite completa.
- **Una observación del ensayo, que no es cambio:** «Guardar accesos» retira a cualquier miembro que no venga en la lista, también a una cuenta ya retirada. Siempre fue así.

## 7 · Cierre

```
CORRECCIONES PREVIAS = versión fijada y validada · lista filtrada por acceso · acceso documental para actuar y asignar · avisos neutros · vista previa (en producción desde el 13-sep) · E1.1 en local: el administrador de la entidad puede participar y revisar, «Guardar accesos» no lo borra, el alta ya no pierde revisores al cambiar de flujo, las listas de revisores solo muestran participantes activos, tildes
FUNCIONES NUEVAS YA UTILIZABLES = en producción desde el 13-sep: detalle con documentos, versiones, pasos, responsable, plazo e historial · enlace de revisión y apertura desde Mi Trabajo · filtros y paginación · botones según actor y paso (Dar conformidad ≠ Aprobar) · confirmación y mensajes
FUNCIONES DEL OBJETIVO TODAVÍA PENDIENTES = E2 anular y archivar · contrato nuevo completo (rondas, devolver al iniciador, volver al paso anterior, comentarios y decisión por archivo, cierre separado de la emisión) · E5 exportación y contadores · correo opcional por acción
```
