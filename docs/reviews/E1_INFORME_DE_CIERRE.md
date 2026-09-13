# E1 · Detalle, navegación y semántica — informe de cierre

Fecha: 13-sep-2026. Base: `5967760`. Contrato: `E1_CONTRATO_DE_ACEPTACION.md`.

**Estado: implementado y probado en local; dictamen del propietario `E1 CODE/TEST GREEN LOCAL = PASS` y commit único autorizado sobre `5967760`. Sin push, sin despliegue, sin migraciones.** No cambian `/act`, el alta, la sustitución ni las plantillas, y la semántica de PRE y AUTORIDAD_TERMINAL queda intacta.

## 1 · Qué se puede hacer ahora (en local)

- **Abrir una revisión por su enlace** `/?obra=<id>&revision=<id>`. Funciona también si hay que iniciar sesión antes: el enlace se guarda y se abre tras el login. Si la obra no es de quien abre el enlace, se avisa y se sigue el flujo normal.
- **Abrir desde Mi Trabajo:** las filas de tipo Revisión llevan al detalle.
- **Pantalla de detalle:**
  - documentos con la versión fijada, aviso «hay vN» si se subió otra y vista previa;
  - pasos con papel (Revisa, Aprueba o Aprueba y cierra), responsable, estado, plazo, acto registrado y sustituciones;
  - historial completo.
- **Lista:**
  - filtros: Todas, Me toca, En curso, Bloqueadas, Terminadas e Iniciadas por mí;
  - «Cargar más»;
  - «Te toca» en cada revisión que espera a quien mira.
- **Botones según actor y paso:**
  - **Dar conformidad** (REVISA), **Aprobar** (APRUEBA intermedio), **Aprobar y cerrar** (último) y **Rechazar**, siempre con confirmación y su consecuencia;
  - si una acción no está disponible, se dice por qué (versión nueva, asociación inválida);
  - quien no es el revisor no ve actos, aunque administre la obra;
  - «Sustituir revisor…» solo aparece para el administrador global y con la revisión bloqueada.
- **Mensajes y URL:**
  - aviso de éxito según el acto;
  - un 409 vuelve a cargar la revisión y avisa;
  - un 403 no nombra documentos;
  - sin doble envío;
  - atrás y adelante funcionan, y salir de Revisiones quita el enlace de la URL.

## 2 · Ficheros

**Backend**
- `backend/routes/reviews.py`:
  - `GET /api/reviews/<rid>`: detalle, solo lectura;
  - `GET /api/reviews`: filtros, paginación por cursor y `obra_id`;
  - cálculo de `acciones` con las mismas funciones que `/act`, más versión vigente y pasos para mostrar;
  - la lista de columnas de lista y detalle, compartida.
- `backend/perimetro_de_obra.py`: `get_review` en `RUTAS_POR_RECURSO`.
- Nuevo `backend/tests/test_revision_detalle_y_listado.py`: 31 pruebas.
- Nuevo `backend/herramientas/ensayo_de_detalle_de_revision.py`: 25 comprobaciones contra PostgreSQL.

**Frontend (`frontend-docs`)**
- Nuevo `src/components/RevisionDetalle.jsx`, con `SustituirRevisor` traído desde la lista con el mismo código que en `5967760`, salvo la prop `projectPrefix`, que no se usaba.
- `src/components/ReviewsModule.jsx`: lista nueva; `ReviewModal` sin cambios.
- Nuevo `src/utils/revisiones.js`: enlace, nombres, historial y mensajes.
- `src/App_Refactor.jsx`: enlace de revisión, persistencia tras el login y aviso.
- `src/hooks/useFileExplorer.js`: la vista inicial es Revisiones si hay enlace.
- `src/components/MiTrabajo.jsx` y `src/pages/HubPage.jsx`: abrir revisión.
- Nuevo `pruebas/revisiones.prueba.mjs` (13). `pruebas/vistaPrevia.prueba.mjs`: la vista previa de Revisiones ahora vive en el detalle.
- Banco sin backend: nuevos `probar-revisiones.html` y `src/probar-revisiones.jsx`, más su entrada en `vite.banco.config.js`.

**Documentación:** `docs/reviews/00_PROGRAMA_Y_DECISIONES.md`, `E1_CONTRATO_DE_ACEPTACION.md` y este informe.

**No tocados:** `FilesPage.jsx` (WIP ajeno) y el resto del WIP ajeno; sus sha256 no han cambiado.

## 3 · Evidencia

| Prueba | Resultado |
|---|---|
| `python -m pytest -q -p no:cacheprovider tests` (desde `backend`) | **1808 passed, 1 failed**. El fallo es `test_capacidades_con_puerta`, preexistente; antes eran 1777/1 y se añaden las 31 nuevas |
| Suites de revisiones, perímetro, encargos y herramientas | 283 passed |
| `ensayo_de_detalle_de_revision.py`, base desechable, ENFORCE | **25/25** |
| Regresión `ensayo_de_version_y_visibilidad.py` | **67/67** |
| Regresión `ensayo_de_revisiones.py`, sin `.env` | **50/50** |
| `npm test` (frontend-docs) | **5 bancos en verde**; `revisiones` 13/13. Repetido tras corregir el lint, con el mismo resultado |
| ESLint 9 (`frontend-docs/eslint.config.js`) sobre los 11 ficheros JS de E1 | **0 errores, 0 avisos**. La primera pasada dio 1 aviso: una directiva `eslint-disable` sobrante que había añadido E1 en `App_Refactor.jsx`. Se quitó (era un comentario). La versión de HEAD de ese fichero pasa sin avisos |
| `npx vite build --outDir <fuera del repo>` | OK |
| Banco `probar-revisiones` (servidor simulado) | ver detalle abajo |
| E2E local: backend real, base desechable e identidad de banco | ver detalle abajo |

**Banco `probar-revisiones`, todo PASS:**
- «Me toca» deja solo la revisión de quien mira.
- El detalle muestra «Dar conformidad» y su consecuencia.
- La confirmación registra la conformidad, con aviso de éxito, y el paso 2 queda en curso.
- Durante el envío los dos botones se deshabilitan: «Enviando…» y un solo acto.
- Un 409 simulado muestra «Otra persona actuó antes…» y vuelve a cargar la revisión.
- «Cargar más» pasa de 20 a 26, con `antes_de`.
- Atrás y adelante abren y cierran el detalle.
- Como aprobador, con versión nueva: «Aprobar y cerrar» deshabilitado con su motivo, «hay v2» visible y Rechazar disponible.
- **Vista previa**, comprobada al cerrar:
  - la primera vez no se abría porque la respuesta simulada de `signed-url` no traía `success`, que el backend real sí devuelve;
  - se corrigió el banco (`probar-revisiones.jsx`); la pantalla no cambió;
  - ahora «Abrir la versión que se revisa» en DR-001.pdf pide la versión fijada (`version_id=version-1-2`), descarga el PDF (200) y dibuja la página, con «DR-001.pdf» y «v2» por separado en la cabecera.

**E2E local con backend real, todo PASS:**
- **Mi Trabajo → RV-092:** la obra queda seleccionada y la URL es `?obra=…&revision=92`.
- **«Aprobar y cerrar»:** en base queda `approved` con `cerrada_en`, 2 documentos en Compartido, 2 emisiones y 0 encargos abiertos.
- **Enlace directo a RV-098:** sin actos y con «Este paso le corresponde a E1 r1».
- **Salir a Archivos:** la URL queda limpia.
- **Usuario sin permiso:** «No puedes ver esta revisión…», sin título ni nombre de documento.
- **Enlace sin sesión:** pantalla de login con el enlace guardado; tras la sesión se abre RV-099.
- **Obra ajena:** aviso «No tienes acceso a la obra de esa revisión, o ya no existe.»

**Contrato:** A1 a A8 se cumplen.

## 4 · Observaciones

- **Petición desde el ámbito de otra obra:**
  - si quien la hace es miembro de las dos, la ruta responde 404 `REVISION_DE_OTRA_OBRA`;
  - si no lo es, el middleware la para antes con 403 `PROJECT_FORBIDDEN`.
- **Revisión inexistente con ENFORCE:** el middleware responde 403 `PROJECT_UNRESOLVED` antes que el 404 de la ruta; la pantalla muestra el mensaje del servidor.
- **`npm run build` dentro de `frontend-docs/dist`** falla con EPERM sobre `dist/assets` (entorno de esta máquina). El build fuera del repo sale bien.
- **Tope del listado:** examina como mucho 1000 filas por petición; con permisos muy restrictivos, una página puede salir corta y trae `siguiente` para continuar. Rendimiento con volumen: no medido.
- **No versionado:** el servidor de banco con identidad inyectada solo existe en el scratchpad de la sesión.

## 5 · Pendiente humano

- UAT: activación con Enter y Espacio, lectura en pantalla ancha y lector de pantalla.
- Validación en producción tras el despliegue, que requiere autorización aparte: backend de Virginia y portal, sin migraciones.

## 6 · Cierre

```
CORRECCIONES PREVIAS = versión fijada y validada · lista filtrada por acceso · acceso documental para actuar y asignar · avisos neutros · vista previa (en producción desde el 13-sep)
FUNCIONES NUEVAS YA UTILIZABLES = en local (commit sin push ni despliegue): detalle con documentos, versiones, pasos, responsable, plazo e historial · enlace de revisión y apertura desde Mi Trabajo · filtros y paginación · botones según actor y paso (Dar conformidad ≠ Aprobar) · confirmación y mensajes
FUNCIONES DEL OBJETIVO TODAVÍA PENDIENTES = E2 anular y archivar · contrato nuevo completo (rondas, devolver al iniciador, volver al paso anterior, comentarios y decisión por archivo, cierre separado de la emisión) · E5 exportación y contadores · correo opcional por acción
```

## 7 · Dictamen del propietario (13-sep)

`E1 CODE/TEST GREEN LOCAL = PASS`. Autoriza un único commit funcional de E1 sobre `5967760`, con los
ficheros de §2.

Observaciones registradas; ninguna bloquea el commit:
- El E2E local con backend real e identidad inyectada se ejecutó, pero su servidor de banco quedó solo en el
  scratchpad: es evidencia válida de esta sesión, no un arnés reproducible versionado.
- Rendimiento con volumen: `NOT MEASURED`.
- UAT humana (Enter/Espacio, pantalla ancha, lector de pantalla): `PENDING`.
- `acciones` del detalle es información para presentación; `/act` sigue siendo la autoridad de ejecución y
  debe revalidar siempre.

No autorizado todavía: push, despliegue, migraciones, E2 y cambios en Oregón.
