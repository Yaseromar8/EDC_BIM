# E1.1 · Alta de revisiones y participantes — contrato corto

13-sep-2026. Autorizado por el propietario: «Corrige, pero con criterio, sin romper la funcionalidad».

Corrige los hallazgos H1–H4 de la prueba de E1 (`E1_UAT_HALLAZGOS.md`). Sin migraciones. Sin commit, push ni despliegue hasta que el propietario lo autorice.

## 1 · Qué cambia

| # | Cambio | Dónde |
|---|---|---|
| H1 | **Un administrador de la entidad se puede añadir como participante** de una obra desde Participantes. Entonces puede ser revisor, recibir encargos y verlos en Mi Trabajo. Sigue administrando todas las obras aunque no participe en ellas | `routes/administracion.py` (candidatos e incorporar), `ParticipantesModule.jsx` |
| H1 · protección | **«Guardar accesos» de la portada no borra la participación de un administrador.** Hoy la borraría, porque esa lista no incluye administradores y guarda por diferencia | `routes/auth.py` (`update_project_users`) |
| H1 · retirar | En Participantes, **un administrador participante se retira de la obra como cualquiera**. Retirarlo no le quita la administración de la entidad | `ParticipantesModule.jsx` |
| H2 | **Elegir una plantilla con revisores ya puestos pide confirmación**, y si cancelas no cambia nada. **Volver a «a mano» conserva los pasos.** Si la plantilla no se puede aplicar, **vuelven los pasos anteriores** | `ReviewsModule.jsx` (`ReviewModal`) y una función pura nueva con su banco |
| H3 | **La lista de revisores del alta solo muestra participantes activos de la obra**, con su empresa y la marca de pendiente, y explica cómo añadir a quien falte | `ReviewsModule.jsx`, con `GET /api/projects/<obra>/miembros` (ya existe y la puede leer cualquier miembro) |
| H3b | **Mismo defecto en «Sustituir revisor…»**: su lista también pasa a ser de participantes activos. La sustitución en sí (ruta, reglas y motivo) no cambia | `RevisionDetalle.jsx` |
| H4 | **Tildes** en «… no pertenece a esta obra, así que no puede revisar el paso N. Añádelo a la obra primero.» | `routes/reviews.py` |

## 2 · Qué no cambia

- **El acceso de un administrador.** Todas las comprobaciones siguen resolviendo primero si es administrador de la entidad. Auditado en `es_admin_de_obra`, `_es_admin_de_esta_obra` (la puerta de `guardia_de_obra`), `permiso_efectivo`, el listado de documentos y los flujos. Participar no le quita nada.
- **Las reglas del alta en el servidor:** participar en la obra, cuenta activa, acceso a los documentos, independencia y contrato. Tampoco cambia `/act`.
- **«Guardar accesos» sigue sin incorporar administradores**: se incorporan desde Participantes.
- **Fuera de alcance:** E2–E5 y Usuarios (U2–U5).

## 3 · Pruebas que cambian, y por qué

En `test_membresia_por_obra.py`, dos pruebas fijaban justo la regla que H1 cambia por decisión del propietario, y se sustituyen por la regla nueva:
- `test_el_entity_admin_no_se_incorpora`;
- el filtro `ROLE <> 'ADMIN'` de `test_candidatos_es_lo_incorporable`.

El resto sigue fijado igual: solo cuentas activas, que no sean ya miembros, y una cuenta retirada no se incorpora.

## 4 · Aceptación

| # | Se da por bueno si |
|---|---|
| A1 | Un administrador de la entidad aparece como candidato, se incorpora, sale en Participantes y se puede retirar |
| A2 | Contra PostgreSQL, con el administrador ya participante: el alta de una revisión con él de revisor funciona, la revisión queda ACTIVA, él actúa y la ve en Mi Trabajo |
| A3 | «Guardar accesos» con otra lista no borra su participación; retirarlo desde Participantes sí la borra |
| A4 | Las listas de revisores del alta y de la sustitución solo muestran participantes activos |
| A5 | Con revisores puestos, elegir una plantilla pide confirmación; cancelar no cambia nada; «a mano» conserva los pasos; si la plantilla falla, vuelven los anteriores |
| A6 | Sin regresiones: suite backend, bancos, lint, build y ensayos de administración, revisiones, detalle y versión |
