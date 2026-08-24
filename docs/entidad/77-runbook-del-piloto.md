# 77 · RUNBOOK DEL PILOTO — de la invitación al primer documento

**Estado al 23-ago-2026:** la pista está montada y verificada en base. Este
documento es la secuencia ejecutable, no una explicación.

## Lo que YA existe (no hay que volver a crearlo)

| Pieza | Valor real |
|---|---|
| Obra del piloto (decisión C, doc 76) | `PILOTO EXTERNO 2026` · id `b.proj_piloto_externo_2026_91305` |
| Alias de perímetro | 3 en `project_ref` (PROJECT + LEGACY_NAME + LEGACY_PATH) — sembrados al nacer |
| Estructura documental | 7 carpetas raíz estándar (01_Gestion… 06_Minutas…) creadas con la obra |
| Cuenta de prueba | `omarsanchezh8+piloto1@gmail.com` · id 23 · rol `user` · **PENDIENTE** · `invitacion_gen=1` |
| Membresía | id 23 ya incorporado a la obra del piloto (chip PENDIENTE en Participantes) |
| Hub | «Proyectos Generales» — el mismo de todas las obras |

## Paso 1 · Recuperar el enlace de invitación

**El correo NO se envía**: producción no tiene `RESEND_API_KEY`, y G1 degrada
a propósito al enlace copiable (por eso el modal dice «Envíale este enlace
por WhatsApp o correo»). No es un fallo; es el diseño sin la clave puesta.

> Inicio de Docs → pestaña **Usuarios** → fila «(Invitado pendiente)» →
> **Reinvitar** → copiar el enlace.

Reinvitar **incrementa la generación**: el enlace anterior muere en el acto
(doc 59). Es la máquina G7 trabajando, no un efecto secundario.

## Paso 2 · Activar la cuenta (como lo haría el externo)

> Abrir el enlace **en ventana de incógnito** (sin la sesión de admin
> encima) → nombre → contraseña → entrar.

Qué debe pasar, y qué comprobar después:
- La cuenta pasa de PENDIENTE a **ACTIVADA** (`activated_at` deja de ser NULL).
- El enlace usado queda **muerto** (one-shot: `activated_at IS NOT NULL`).
- Al entrar ve **solo** `PILOTO EXTERNO 2026`. Ni PQT8 ni ZZ PRUEBA: el
  listado sale filtrado por membresía desde el servidor.

## Paso 3 · Darle su sitio en la obra

En **Participantes** de la obra del piloto:
1. Su **empresa** (columna Empresa) — la empresa es de la persona, global.
2. La **función contractual** de esa empresa **en esta obra** (tabla de
   empresas). No concede permisos: describe en qué calidad participa.
3. **¿Administra esta obra?** — solo si el piloto lo requiere. No es Entity
   Admin y no alcanza ninguna otra obra.

## Paso 4 · Sus permisos documentales

En **Archivos** → clic derecho en la carpeta → **Configuración de permisos**:
- Conceder a **Persona**, **Empresa** o **Función contractual** (capa 9).
- Recordar la regla, visible en «+ Cómo se resuelve un permiso»: gana la
  carpeta **más cercana**; al mismo nivel, Persona > Empresa > Función.
- **Restringido** (`none`) es una concesión legítima: así se reserva una
  carpeta a quien tiene acceso concedido más arriba.
- Antes de dar por bueno el reparto: **«Comprobar el permiso de una
  persona»** — dice el nivel efectivo, la carpeta ganadora, el sujeto
  ganador y qué reglas quedaron desplazadas.

## Paso 5 · Qué observar durante el piloto (y dónde mirarlo)

| Pregunta | Dónde se responde |
|---|---|
| ¿Entró? ¿cuándo? | ficha de persona → «Último acceso» |
| ¿Qué hizo? | pestaña **Actividad** de la obra |
| ¿Intentó algo que no podía? | `auth_events` (login_desactivado, reclamos) |
| ¿Ve lo que debe? | inspector de permisos, por carpeta |

## Pendientes conocidos que tocan al piloto

1. **Correo de invitación** (SHOULD HAVE, doc 63 §E): configurar
   `RESEND_API_KEY` en Render. Un externo espera un correo, no un enlace por
   WhatsApp. Es configuración de entorno — la clave la pone el propietario.
2. **Segundo custodio** (doc 76): decidido (id 19), **pendiente el clic**.
   Debe hacerse **desde la cuenta principal** (`omarsanchezh8@`): nadie puede
   cambiarse el rol a sí mismo, y por eso desde la cuenta 19 el control
   aparecía inerte.
3. **P1/P2** (login e activación con identidad propia): UX POLISH aplazado
   por el propietario. Mejoran la primera impresión del externo; no bloquean.

---

## CIERRE · 24-ago-2026 — EL CICLO COMPLETO, EJECUTADO

La activación la ejecutó el asistente por decisión expresa del propietario
(cuenta de prueba desechable; la clave quedó en el historial de la sesión a
sabiendas y no debe reutilizarse jamás). El camino usado fue EXACTAMENTE el
del externo: `POST /api/auth/register` con el enlace de la generación
vigente, sin ningún atajo de servidor.

| Verificación | Resultado |
|---|---|
| Activación | `activated_at = 24-ago 16:23:01` · nombre «Piloto Uno» · gen 5 · con contraseña |
| **One-shot** | el MISMO enlace, reintentado → `400 · ya está registrado y activo` |
| **Aislamiento** | con la sesión del piloto, `/api/projects` devuelve UNA obra: `PILOTO EXTERNO 2026` — ni PQT8, ni ZZ, ni el resto de la entidad |
| Sesión | `/api/auth/me` → piloto1, rol `user`; el invariante «sesión ⇒ activada» la acepta |
| De paso | la política de contraseñas rechazó el primer intento del propio asistente («no puede contener tu nombre») — el servidor no distingue quién teclea |

```
EXTERNAL PILOT GATE → ABIERTO
```

Los tres MUST-HAVE están cerrados. Invitar al primer externo REAL es ahora
ejecutar este mismo runbook con su nombre y su correo — más la
`RESEND_API_KEY` si debe recibir la invitación por correo.
