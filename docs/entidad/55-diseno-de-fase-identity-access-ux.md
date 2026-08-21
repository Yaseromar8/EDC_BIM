# DISEÑO DE FASE — IDENTITY & ACCESS UX

**Fecha:** 21 de agosto de 2026 · **NO SE IMPLEMENTA con este documento.**
Diseño/auditoría contra el repositorio real (`routes/auth.py`, `routes/directorio.py`,
`routes/administracion.py`, `frontend-docs/src`). Cada afirmación de estado sale de código leído hoy, no de memoria.

**Regla de la fase:** la UI **representa** las capas del seguimiento maestro (doc 54); no las mezcla. Prohibido el «rol gigante».

---

## 1 · ESTADO REAL DEL BACKEND — lo que YA existe

| Flujo | Estado | Evidencia (ruta real) |
|---|---|---|
| **Login** email+contraseña | ✅ Completo | `POST /api/auth/login` — rate limit, `is_active`, respuesta 2FA con `desafio` |
| **Login con Google** | ✅ Respeta invitación-solo | `POST /api/auth/google` — sin cuenta previa: «Pide al administrador que te invite» |
| **2FA** | ✅ Completo | `setup / activar / verify / desactivar / estado` — códigos de recuperación, sesiones revocadas al activar |
| **Logout** | ✅ | `POST /api/auth/logout` |
| **Handoff portal↔visor** | ✅ (SSO interno) | `POST /api/auth/handoff` + `/exchange` |
| **Invitación** | ✅ motor · ⚠ entrega | `POST /api/users` — crea `(Invitado pendiente)` (`password_hash=''`), token firmado 14 días, `invite_url` hacia el portal. **El correo NO se envía**: el admin copia el enlace (el propio código lo dice: «mientras no haya envío de correo (F3)») |
| **Activación de cuenta** | ✅ Completo | `POST /api/auth/register` — SOLO reclama invitaciones (token firmado obligatorio; sin él: «El registro es solo por invitación»); política de contraseña en servidor; emite sesión |
| **Recuperación** | ✅ Completo, con correo real | `forgot-password` (sin enumeración de cuentas, límite por correo, `mailer.enviar`, 1 h, un solo uso) + `reset-password` |
| **Suspensión** | ✅ | `DELETE /api/users/<id>` — **desactiva, no borra** (`is_active=FALSE`), protege al último admin, revoca sesiones; `?purgar=1` para el borrado real |
| **Reactivación** | ❌ **NO EXISTE** | Ninguna ruta vuelve `is_active` a TRUE |
| **Administración de usuarios** | ✅ | `GET /api/users` (admin: padrón entero; resto: solo compañeros de obra — anti-phishing), `PATCH /api/users/<id>/role` (último admin protegido, sesiones revocadas, auditado) |
| **Entity vs Project Admin** | ✅ | `es_entity_admin` / `es_admin_de_obra` · `GET …/mi-administracion` · `PUT …/miembros/<id>/admin` con `ULTIMO_ADMIN_DE_OBRA` |
| **Membresía por proyecto** | ✅ | `POST /api/projects/<id>/users` · directorio `GET /miembros` (con empresa, función y `es_admin_de_obra`) |
| **Company / Función contractual** | ✅ | `companies` CRUD · `PATCH …/miembros/<uid>` (empresa) · `POST …/participantes` (empresa×función, guardia administrativa) |
| **Estado de invitación** | ✅ dato · ❌ gestión | El pendiente es visible (`password_hash` vacío — producción tiene 2 hoy); **no hay** reenviar/caducar/revocar como actos propios |
| **Sesiones** | ✅ motor · ❌ visibilidad | Tabla `sessions`, revocación en cambio de rol/2FA/suspensión, rastro en `/api/auth/events` (admin); **no hay** «mis sesiones» ni cierre remoto selectivo |

**Conclusión backend:** el modelo del §6 del encargo (no-autorregistro → invitar → pendiente → activar → credencial → entrar; y aparte: añadir a proyecto → empresa/función → opcionalmente Project Admin) **ya existe de punta a punta**, con tres huecos: **entrega del correo de invitación**, **reactivación**, y **gestión del ciclo de la invitación**.

## 2 · ESTADO REAL DEL FRONTEND

| Pieza | Estado | Nota |
|---|---|---|
| `LoginScreen.jsx` (559 líneas) | ✅ flujos · ⚠ identidad | Login, desafío 2FA, alta por invitación (`?invite=`), reset (`?reset=`), recuperación, bilingüe ES/EN. **Estéticamente clona a Revizto** — el pendiente declarado desde el plan de auth |
| Hub → pestaña Usuarios | ✅ parcial | Lista, `RolDeMiembro` (cambio de rol, solo Entity Admin), invitación con copia de enlace |
| Participantes (por obra) | ✅ | Persona · empresa · función · **«Administra esta obra»** (nombrar/retirar) |
| «Usuarios del sistema» en FilesPage | ✅ | Separada de Participantes a propósito |
| Pantalla de activación dedicada | ⚠ | Vive como *modo* del LoginScreen; la ruta `/registro?invite=` del enlace emitido **depende de que el static site reescriba rutas a `index.html`** — **verificar en Render** antes de repartir enlaces (riesgo de 404 en un path que no es `/`) |
| Suspensión / reactivación en UI | ❌ | Sin control visible; reactivar tampoco tiene backend |
| Estado del usuario (activo/pendiente/suspendido) | ⚠ | El pendiente se distingue por el nombre `(Invitado pendiente)`, no por un estado de primera clase |
| Mi cuenta / sesiones | ⚠ | Cambio de contraseña y 2FA existen; lista de sesiones no |

## 3 · FLUJOS DE USUARIO (los dos actos, tal como los fijaste)

**Acto 1 — entrar a la entidad** *(backend: completo salvo correo)*

```
Entity Admin invita (correo + rol)          POST /api/users
  → pendiente visible en Usuarios           (password_hash vacío)
  → enlace firmado 14 días                  HOY: se copia a mano · DISEÑO: se envía con mailer
  → persona abre /registro?invite=…         VERIFICAR rewrite del static site
  → establece credencial                    política en servidor
  → entra a la entidad                      sesión emitida en el mismo acto
```

**Acto 2 — entrar a una obra** *(backend: completo; separado del acto 1, y así se queda)*

```
Entity/Project Admin añade a la obra        POST /api/projects/<id>/users
  → contexto empresa                        PATCH …/miembros/<uid>
  → función contractual (de la empresa)     POST …/participantes
  → opcionalmente Project Admin             PUT …/miembros/<uid>/admin
```

La UI nunca fusiona los actos: invitar a la entidad **no** pregunta por obras, y añadir a una obra **no** crea cuentas.

## 4 · PANTALLAS NECESARIAS

| # | Pantalla | Qué hace | Base existente |
|---|---|---|---|
| P1 | **Login** (rediseño con identidad propia) | Mismos flujos, cara profesional propia — deja de clonar a Revizto | LoginScreen entero se conserva por debajo |
| P2 | **Activación** (dedicada) | Reclamar invitación: nombre, credencial, entrar | El modo `registro` del LoginScreen, extraído |
| P3 | **Usuarios de la entidad** | Lista con **estado real** (activo · pendiente · suspendido), invitar, **reenviar enlace**, **revocar invitación**, suspender, **reactivar**, rol | Pestaña Usuarios + RolDeMiembro |
| P4 | **Ficha de persona** | La escalera: persona → entidad → sus obras → empresa → función por obra → qué administra. **Solo lectura transversal**; cada dato se edita donde vive | `mi-administracion`, `/miembros`, `/api/users` |
| P5 | **Participantes** (ya existe) | + flujo «añadir persona a esta obra» (hoy la ruta existe sin pantalla) | ParticipantesModule |
| P6 | **Mi cuenta** | Contraseña, 2FA, **mis sesiones** con cierre remoto | change-password + 2fa/estado |

## 5 · GAPS

**Backend (los únicos tres):**

| Gap | Diseño propuesto |
|---|---|
| **G1 · Correo de invitación** | `mailer.enviar` ya existe y lo usa el reset — invitar lo llama igual; si el envío falla, el enlace copiable queda como respaldo (comportamiento actual) |
| **G2 · Reactivación** | `PATCH /api/users/<id>/estado {activa: true}` — solo Entity Admin, auditado, simétrico de la suspensión |
| **G3 · Ciclo de la invitación** | Reenviar = re-emitir token (los firmados caducan solos a los 14 días); revocar = borrar el pendiente (purga legítima: nunca actuó); expuesto en P3 |

**Frontend:** P1–P6 (§4), más el **estado de usuario como dato de primera clase** (derivado: `password_hash` vacío = pendiente; `is_active` = suspendido) — sin columnas nuevas.

**A verificar antes de diseñar de más:** el rewrite de `/registro` en el static site (si falla, los enlaces de invitación emitidos hoy llevan a un 404 — se comprueba en 2 minutos con un token de prueba).

## 6 · RIESGOS DE MEZCLAR CAPAS — y cómo la UI los evita

| Riesgo | Regla de diseño |
|---|---|
| El «rol gigante» (ADMINISTRADOR/SUPERVISOR/CONTRATISTA/USUARIO) | **Prohibido.** El perfil del sistema (`user/editor/viewer` + Entity Admin) nunca se presenta junto a la función contractual como si fueran opciones de la misma lista |
| Invitar preguntando «¿a qué obra?» | Los dos actos separados (§3). La invitación es a la **entidad** |
| La función contractual como permiso | La UI la muestra como **contexto** (chip derivado de la empresa), jamás como selector de accesos |
| «Administra esta obra» como rol global | Vive en Participantes, por obra, con su columna propia — ya construido así |
| Suspender ≠ retirar de una obra | P3 suspende la **cuenta**; retirar de una obra es Participantes. Textos distintos, pantallas distintas |
| El operador de plataforma en la UI | No aparece. No es un rol de la aplicación |

## 7 · API REUTILIZABLE vs NUEVA

**Reutilizable tal cual (todo lo listado en §1 marcado ✅)** — la fase es sobre todo **pantallas sobre rutas que ya existen**.
**Nueva o modificada: exactamente 3** (G1 correo en invitar · G2 reactivación · G3 reenviar/revocar invitación).

## 8 · TESTS E2E NECESARIOS

1. Ciclo completo de invitación: invitar → pendiente listado → activar con el token → entra; token caducado → rechazo claro; token de otro correo → rechazo.
2. Autorregistro sin token → **negado** (la política de no-autorregistro, probada por fuera).
3. Contraseña débil en activación → rechazada por el **servidor**.
4. Recuperación: enlace un solo uso; el segundo uso falla; sin enumeración de cuentas.
5. Suspensión: login bloqueado, sesión viva revocada, 2FA verify rechaza; último admin protegido.
6. Reactivación (G2): vuelve a entrar; sus membresías intactas.
7. Cambio de rol: sesiones revocadas; último admin protegido.
8. Project Admin: nombrar/retirar; `ULTIMO_ADMIN_DE_OBRA`; su autoridad NO viaja a otra obra (ya cubierto en `ensayo_de_administracion` — se re-ejecuta, no se re-escribe).
9. Login con 2FA de punta a punta, y con código de recuperación.
10. El «rol gigante» no existe: ninguna pantalla ofrece función contractual y perfil del sistema en el mismo control (test de contrato de UI).

## 9 · QUÉ PUEDE IMPLEMENTARSE YA vs QUÉ SIGUE DEFER

**Puede implementarse ya (cuando des la orden — no con este documento):**
G1–G3 (backend pequeño y acotado) · P1–P6 · estado de primera clase · los E2E del §8. Nada de esto toca el modelo de capas: son pantallas y tres rutas sobre un motor cerrado.

**Sigue DEFER, con su trigger (doc 54):**
Member Tool Access (trigger **no activado** — evaluado hoy con los invitados externos reales) · Permission Profiles · Project Templates · Account Membership/Roles · Tool Activation.

**Fuera de esta fase, con posición reservada:** UI de permisos por COMPANY/FUNCTION (capa 9 — «antes del piloto externo», fase propia).

---

*Sin implementar. Sin tocar producción, runbook, `frontend-react`. La ventana de despliegue sigue esperando la orden del propietario y esta fase no la toca.*
