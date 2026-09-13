# E1 · Detalle, navegación y semántica — contrato de aceptación

Base: `5967760`. Programa y decisiones: `00_PROGRAMA_Y_DECISIONES.md`.

E1 no cambia el almacenamiento ni la semántica de PRE o AUTORIDAD_TERMINAL. `/act`, el alta y la sustitución no cambian.

## 1 · Pantalla y URL

- **Enlace de una revisión:** `/?obra=<id de la obra>&revision=<id>`. `obra` es `projects.id`, el mismo que devuelven `/api/projects` y `/api/mi-trabajo`.
- **Router (`App_Refactor.jsx`):** si la URL trae `revision`, el enlace se guarda también en `sessionStorage`, porque el login puede limpiar la URL. Con sesión, el router:
  - entra en Documentos sin pasar por el Hub;
  - selecciona la obra, buscándola en `/api/projects`;
  - abre Revisiones.

  Si la obra no está entre las del usuario, avisa y sigue el flujo normal.
- **Vista inicial (`useFileExplorer.js`):** es Revisiones cuando la URL trae `revision`. `FilesPage.jsx` no se toca, porque tiene WIP ajeno.
- **`ReviewsView`:**
  - lee `revision` de la URL y muestra el detalle;
  - al abrir o cerrar un detalle actualiza la URL (`pushState`) y responde a atrás y adelante (`popstate`);
  - al salir de Revisiones quita `revision` de la URL.
- **Pantalla de detalle** (componente nuevo `RevisionDetalle.jsx`):
  - **Cabecera:** `RV-###`, título, estado (En revisión, Bloqueada, Aprobada o Rechazada), creador y fecha, y plantilla con su versión si la hay.
  - **Documentos:** nombre y versión fijada, con vista previa por versión. Si hay versión más reciente, se marca «hay vN»; si la asociación no es válida, «sin versión válida», sin opción de abrir.
  - **Pasos:** número, etiqueta, persona, papel (Revisa, Aprueba o Aprueba y cierra) y estado (hecho, actual, rechazado, pendiente o no alcanzado). Para cada acto registrado: quién, cuándo, comentario y lo emitido. Además, plazo del paso actual y sustituciones con motivo.
  - **Historial completo**, en orden: creación, inicio de turno con plazo, conformidad, aprobación, rechazo y sustitución.
  - **Zona de acción**, solo si hay acción disponible para quien mira.

## 2 · Navegación desde Mi Trabajo

- **`MiTrabajo.jsx`:** las filas de tipo Revisión se pueden pulsar (botón accesible por teclado) si recibe la prop `onAbrir`. Los demás tipos no cambian.
- **`HubPage.jsx`:** pasa `onAbrirRevision` a `MiTrabajo`.
- **`App_Refactor.jsx`:** entrega `onAbrirRevision`, que usa el mismo camino que el enlace.
- **Asunto neutro:** una fila con asunto neutro también se abre. El detalle responde «no tienes acceso a todos sus documentos», sin nombrar nada.

## 3 · API · detalle

`GET /api/reviews/<rid>?model_urn=<ámbito actual, opcional>`

| Caso | Respuesta |
|---|---|
| No existe | 404 `REVISION_NO_ENCONTRADA` |
| Sin acceso a la obra | 403 `SIN_ACCESO_A_LA_OBRA` |
| `model_urn` de otra obra | 404 `REVISION_DE_OTRA_OBRA` |
| No puede consultar todos los documentos | 403 `SIN_PERMISO_DOCUMENTAL`, sin título ni nombres |
| Correcto | 200 `{success, revision}` |

`revision` contiene:
- los campos actuales de la lista y el estado calculado (`flujo`, `flujo_motivo`);
- `codigo` y `obra_id`;
- `items[]` con `asociacion_valida`, `version_vigente_numero` y `es_version_vigente`;
- `pasos[]`: `numero`, `etiqueta`, `persona`, `user_id`, `decision`, `terminal`, `dias`, `estado`, `acto{event, by, at, comment, emitido}`, `inicio`, `vence` y `sustituciones[]`;
- `history`, el historial sin transformar;
- `acciones`, calculadas con las mismas funciones que usa `/act`: `puede_actuar`, `puede_consultar_la_revision`, `acto_permitido`, `cierra_positivamente`, más la guarda de asociación y la de versión nueva al cerrar. Contiene:
  ```
  aprobar:  {disponible, tipo: conformidad|aprobar|aprobar_y_cerrar, motivo_no, siguiente_paso, destino}
  rechazar: {disponible, motivo_no}
  sustituir: bool          # solo con la revisión BLOQUEADA y rol global admin, como exige /reasignar
  motivo:    texto para quien no puede actuar
  ```

Es de solo lectura: no escribe nada. Queda registrada en `RUTAS_POR_RECURSO` para que el middleware resuelva la obra.

## 4 · API · listado con filtros y paginación

`GET /api/reviews?model_urn=&filtro=&limite=&antes_de=`

- **`filtro`:** `todas` (por defecto), `me_toca`, `en_curso`, `bloqueadas`, `terminadas` o `iniciadas_por_mi`. Un valor desconocido responde 400 `FILTRO_DESCONOCIDO`.
  - `me_toca`: en curso, activa y el usuario es el revisor del paso actual.
  - `iniciadas_por_mi`: `created_by` coincide con el correo o el nombre, como hoy.
- **`limite`:** de 1 a 100, 20 por defecto. **`antes_de`:** id; es paginación por cursor, descendente. Un valor inválido responde 400.
- **Orden de los filtros:** el permiso documental y el filtro se aplican antes de cortar la página. Una página nunca sale corta por revisiones invisibles, salvo por el tope de 1000 filas examinadas por petición; en ese caso se devuelve `siguiente` para continuar.
- **Respuesta:** `{success, reviews[], siguiente: id|null, filtro, limite, obra_id}`. Cada revisión añade `codigo` y `me_toca`; `obra_id` es lo que lleva el enlace de cada revisión.

## 5 · Semántica de botones

Las acciones vienen del servidor; la interfaz no decide autoridad.

| Contrato · paso | Botón principal | Consecuencia mostrada |
|---|---|---|
| AUTORIDAD_TERMINAL · REVISA | **Dar conformidad** | Queda tu conformidad; pasa al paso N (persona) |
| AUTORIDAD_TERMINAL · APRUEBA intermedio | **Aprobar** | Queda tu aprobación; pasa al paso N |
| AUTORIDAD_TERMINAL · APRUEBA final | **Aprobar y cerrar** | Se cierra aprobada; los documentos pasan a Compartido o Publicado, con las comprobaciones de emisión |
| PRE · no último | **Aprobar** | Pasa al paso N |
| PRE · último | **Aprobar y cerrar** | Se cierra aprobada |
| Cualquiera | **Rechazar** | La revisión termina rechazada; los documentos no cambian de estado |

- **Confirmación:** todas las acciones piden confirmación (`confirmAction`); Rechazar usa estilo de peligro. El comentario sigue siendo opcional, como hoy.
- **Aprobar deshabilitado, con motivo visible,** cuando:
  - hay asociación de versión inválida (AUTORIDAD_TERMINAL);
  - en el paso que cierra, algún documento tiene versión nueva;
  - el contrato no lo permite.
- **Quién ve los botones:** quien no es el revisor del paso, incluidos los administradores, no ve Aprobar ni Rechazar (R02 resuelto). «Sustituir revisor…» solo aparece con `acciones.sustituir`.

## 6 · Mensajes

- **Éxito, según el tipo:** «Conformidad registrada», «Paso aprobado», «Revisión aprobada y cerrada», «Revisión rechazada».
- **Error:** el texto del servidor. Además:
  - 409: se recarga el detalle y se avisa de que la revisión cambió;
  - 403 `SIN_PERMISO_DOCUMENTAL`: aviso en la pantalla;
  - fallo de red: «No se pudo conectar».
- **Durante la petición:** botones deshabilitados, sin doble envío.

## 7 · Qué se reutiliza

- **Backend:**
  - `_row_to_dict`, `_con_estado_del_flujo`, `_con_asociacion_documental`, `_puede_ver_la_revision`;
  - de `flujo_de_revision`: `puede_actuar`, `acto_permitido`, `cierra_positivamente`, `decision_del_paso`, `es_paso_terminal`, `etiqueta_del_paso`, `puede_consultar_la_revision`;
  - `verify_project_access`, `resolve_project_id`, `contexto_de_permisos`;
  - la lista de columnas de la consulta, compartida entre lista y detalle.
- **Frontend:**
  - `ReviewModal`, sin tocar;
  - `SustituirRevisor`, movido al detalle;
  - `useDocPreview` y `DocQuickView`;
  - `confirmAction`, `react-hot-toast` y `formatDate`;
  - el router actual.

## 8 · Fuera de E1

- Anular y archivar (E2).
- Del contrato nuevo (E3/E4): rondas, retroceso, devolución, decisión por archivo y emisión separada.
- Exportación y contadores por filtro (E5).
- Correo opcional por acción (D7): va con las primeras acciones nuevas.
- Atomicidad del registro de actividad de los actos.
- Búsqueda por texto en la lista.
- Clic en tipos de Mi Trabajo distintos de Revisión.
- Selector de revisores limitado a miembros de la obra.
- Adopción de las primitivas `design/ui`.
- Cualquier cambio en `/act`, el alta, la sustitución o las plantillas.

## 9 · Aceptación y demostración

| # | Criterio | Cómo se demuestra |
|---|---|---|
| A1 | El enlace abre el detalle, con sesión y tras el login | E2E local con backend y base desechables; prueba de `utils/revisiones` |
| A2 | Una revisión de Mi Trabajo abre su detalle | E2E local |
| A3 | El detalle muestra documentos, versiones, vista previa, pasos, papel, responsable, plazo e historial | pytest del payload; ensayo con PostgreSQL; banco de interfaz |
| A4 | Los filtros y la paginación solo devuelven revisiones visibles y no filtran nombres ajenos | pytest; ensayo con 3 usuarios y permisos distintos |
| A5 | Los botones dependen del actor y del paso, con Dar conformidad ≠ Aprobar; un administrador que no es el revisor no ve actos | pytest de `acciones`; ensayo: lo que `acciones` ofrece, `/act` lo acepta, y lo que niega, `/act` lo rechaza |
| A6 | Mensajes, confirmación, sin doble envío, recarga en 409 | banco de interfaz; E2E local |
| A7 | Atrás y adelante funcionan; salir de Revisiones limpia la URL | banco de interfaz; E2E local |
| A8 | Sin regresión en PRE, AUTORIDAD_TERMINAL, alta, `/act` ni sustitución | suite `pytest` completa; ensayos existentes |

Además: `npm test` y `npm run build` de frontend-docs. Nada se despliega sin autorización aparte.
