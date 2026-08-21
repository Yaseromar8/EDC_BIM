# PAQUETE FINAL PRE-WINDOW — `frontend-docs`

**Fecha:** 21 de agosto de 2026 · Gate técnico E1–E5 **ACEPTADO**: `READY FOR CONTROLLED WINDOW`.
**La ventana NO se ejecuta con este documento.** La fecha y la orden de abrirla son del propietario.

Este paquete sustituye los supuestos del runbook REV.02 por el **estado medido**
de producción. No añade arquitectura, ni funcionalidad, ni investigación.

---

## 1 · ESTADO ACTUAL DE PRODUCCIÓN — MEDIDO, NO SUPUESTO

| | Estado real | Fuente |
|---|---|---|
| Commit sirviendo | `b671559bc3e2` (rama `main`) — **28 commits por detrás** del árbol local | `/api/health` |
| Esquema | **ESTADO C explicado**: árbol del 20-ago. Modelo de sujetos presente (`sujeto_tipo`/`sujeto_id` NOT NULL, `user_id` ya nullable); **faltan exactamente los 3 objetos de `es_admin`** | E1 |
| Roles PostgreSQL | Solo `postgres` (sin `rolsuper`, con `createrole`/`createdb` — el caso Cloud SQL previsto). `ecd_app`/`ecd_migrator` **no existen**. Grants a ellos: **ninguno** | E2 |
| Propiedad | Todo de `postgres`: 95 tablas · 38 secuencias · 205 índices · 38 funciones (1 nuestra + 37 de `pgcrypto`). **Estado de partida exacto del fixture** donde la convergencia está probada 89/89 | E2 |
| Postura (6 puntos) | 5 cumplen. **Falla `ENFORCE_PROJECT_AUTHZ`** | E3 |
| Variables Render | Presentes: `DB_USER`, `DB_PASS`, `DDL_EN_CALIENTE`, `ESQUEMA_ESTRICTO`, `AUTH_POLICY_MODE`, `CORS_ORIGINS`, `APP_SECRET`, `SESSION_PEPPER`. Ausentes: `ENFORCE_PROJECT_AUTHZ`, `DEPLOY_PROFILE` (default correcto), `APP_URL` | E4, declarado por el propietario |
| Copia de la base | `DATABASE RESTORABLE = PROBADO` | E5 |

### Los dos ALERT conocidos, explícitos

> **ALERT 1 — backend viejo + modelo de sujetos ya presente.**
> **Conceder permisos de carpeta está roto en producción desde el 20-ago**: el
> backend desplegado inserta al estilo antiguo (`user_id`, sin sujeto) y el
> esquema lo rechaza (`sujeto_id NOT NULL`). Leer permisos funciona; escribirlos
> no. Nada se corrompe por esperar — pero la ventana es lo que lo cierra.

> **ALERT 2 — `ENFORCE_PROJECT_AUTHZ` en log-only.**
> El perímetro transversal por obra registra lo que bloquearía, sin bloquear. Lo
> que hoy frena el cruce entre obras son las guardias internas de cada ruta. Se
> enciende **en la ventana, con el backend nuevo** — donde está ensayado — y
> nunca antes por separado.

---

## 2 · EVIDENCIAS E1–E5

| | Veredicto | Fichero |
|---|---|---|
| E1 | ALERT — aceptado | `evidencias/evidencia-e1-2026-08-21.txt` |
| E2 | PASS | `evidencias/evidencia-e1-e2-2026-08-21.txt` |
| E3 | ALERT — aceptado | `evidencias/evidencia-e3-2026-08-21.txt` |
| E4 | PASS con notas | Declaración del propietario, citada en doc 52 |
| E5 | **PASS — `DATABASE RESTORABLE = PROBADO`, con 1 fila legacy en cuarentena explícita** (`pdf_markups`, fila de `Demo User`; CSV junto a la copia). **No es `FULL ECD DISASTER RECOVERY`**: los bytes de GCS tienen su protección propia y su gate propio | `evidencias/ensayo-restauracion-20260821-1602.json` |

Análisis completo: docs 47–52. Este paquete no los repite; los gobierna.

---

## 3 · PRECONDICIONES PARA ABRIR LA VENTANA

Todas antes del primer paso con efectos:

1. **Copia fresca de producción** tomada ese mismo día (`copia_de_seguridad.py`,
   destino fuera del proyecto de Google) — y **su restauración ensayada** con
   `ensayo_de_restauracion.py` (contraseña tecleada). E5 probó el mecanismo; la
   ventana lo repite con la copia del día.
2. **Dos contraseñas fuertes nuevas** (para `ecd_app` y `ecd_migrator`), listas
   para teclear. Nunca por chat, argumento ni fichero. Sin comilla simple; Cloud
   SQL exige símbolos.
3. **Árbol local en el commit aprobado** para la ventana (`git log -1` lo
   confirma) — la convergencia se ejecuta **desde este árbol**, nunca como Start
   Command de Render.
4. **Re-verificar en el panel** (el paso 0.d se repite al abrir): Start Command
   = `yarn start`; **no existe** `CONFIRMAR_CONVERGENCIA_PROPIEDAD`; `CORS_ORIGINS`
   es una URL limpia.
5. **Obra de prueba preparada o preparable**: la ventana termina con smoke tests
   que escriben, y solo escriben ahí.
6. **Tiempo**: una hora de ventana con el servicio suspendido, sin prisa
   programada inmediatamente después.

---

## 4 · SECUENCIA DEFINITIVA (aprobada — runbook REV.02 + E1–E5)

```
FUERA DE VENTANA
 0  Re-verificación del panel (precondición 4)
 1  Copia fresca + restauración ensayada        [STOP si no restaura]

VENTANA — el tráfico se cierra aquí
 2  Suspender el servicio web
 3  Crear roles ecd_app / ecd_migrator          (psql, stdin, tecleadas)
 4  CONVERGENCIA desde el árbol local            [única operación irreversible]
      = transferencia de propiedad + esquema completo (incluye los 3 objetos
        de es_admin) + grants, en un solo acto, con invariantes antes/después
 5  Verificar como ecd_app: --verificar = 0  ·  ALTER denegado
 6  CUTOVER en Render, un solo cambio:
      DB_USER=ecd_app · DB_PASS=(la de ecd_app)
      + ENFORCE_PROJECT_AUTHZ=true
      + APP_URL=(URL del portal)
      – retirar TODA credencial administrativa
 7  Start Command = yarn start · DESPLEGAR EL BACKEND NUEVO (git push)
      → el commit nuevo es el PRIMERO que sirve contra el esquema nuevo
 8  Arrancar · /api/health con la versión nueva
 9  pg_stat_activity: ≥2 conexiones de ecd_app desde Render, cero de postgres
10  ESQUEMA_ESTRICTO=true + reinicio             [si no arranca: volver a false]
11  Desplegar el portal (frontend-docs)
12  SMOKE TESTS (§6)
13  Abrir tráfico
FIN DE VENTANA
14  Adjudicación de admins — decisión del propietario, cuenta por cuenta
```

---

## 5 · CONDICIONES DE STOP

| Momento | STOP si… | Entonces |
|---|---|---|
| Paso 1 | la copia no restaura o las invariantes difieren | No hay ventana ese día |
| Paso 3 | alguna contraseña pasó por chat/argumento/fichero | Se rota y se repite |
| Paso 4 | la convergencia nombra un objeto desconocido, una invariante cambia, o la postcondición falla | La transacción se deshace sola; **entender antes de reintentar** |
| Paso 5 | el `ALTER` de prueba como `ecd_app` **tiene éxito** | La convergencia no terminó; **no hay cutover** |
| Paso 8 | el servicio no arranca | Leer el log. **NUNCA devolver `DB_USER` a `postgres`** — ese fallback es lo que esta ventana elimina |
| Paso 9 | aparece `postgres` conectado desde la IP de Render | El cutover no se aplicó; investigar antes de seguir |
| Paso 10 | no arranca con estricto | Volver a `false` (el servicio vuelve), leer qué objetos nombra |
| Paso 12 | un 200 donde tocaba 403, **o un 403 donde tocaba 200** | No se abre el tráfico hasta entenderlo |

Con el servicio suspendido, ningún STOP afecta a usuarios: se investiga con
calma, y si hace falta se restaura la copia del paso 1 sobre una base nueva.

---

## 6 · EVIDENCIAS QUE DEBEN CAPTURARSE DURANTE LA VENTANA

1. Salida de la **restauración** de la copia del día (veredicto + invariantes).
2. Banner de la **convergencia**: `CONVERGENCIA DE PROPIEDAD COMPLETA` con sus
   contadores, `session_user=postgres · current_user=ecd_migrator`, e
   invariantes idénticas dos veces.
3. `--verificar` como `ecd_app` = **código 0**, y el **`ERROR: debe ser dueño`**
   del ALTER de prueba (el error esperado ES la evidencia).
4. `/api/health` con la **versión nueva** tras el paso 8.
5. La consulta de **`pg_stat_activity`** del paso 9, tal cual salga.
6. Arranque con **`ESQUEMA_ESTRICTO=true`** (el propio arranque es la prueba).
7. Resultado de los **smoke tests** (§7), incluidos los códigos de error
   esperados.
8. Todo va a `docs/entidad/evidencias/`, sin un solo secreto dentro.

---

## 7 · CRITERIOS PARA DECLARAR LA VENTANA EXITOSA

Todos, no la mayoría:

1. Postcondición de convergencia: **cero objetos aplicativos fuera de
   `ecd_migrator`**, extensiones intactas, invariantes idénticas.
2. El runtime **es** `ecd_app` (paso 9), y no queda ninguna credencial
   administrativa en las variables del servicio.
3. `ESQUEMA_ESTRICTO=true` **y** el servicio arranca — los 3 objetos de
   `es_admin` existen (E1 queda cerrada).
4. **Smoke obligatorio: conceder un permiso de carpeta en la obra de prueba →
   200.** Es la funcionalidad rota desde el 20-ago; la ventana no es exitosa si
   no la cierra (ALERT 1 cerrado).
5. La postura pasa a **`completa: true, faltan: 0`** — `ENFORCE_PROJECT_AUTHZ`
   encendido y bloqueando de verdad: el usuario de la obra B recibe **403** en
   la obra A (ALERT 2 cerrado).
6. El resto de la tabla de smoke de REV.02 §4: recepciones de transmittal
   (`FALTA_DESTINATARIO`, `ADMIN_RECORDED_RECEIPT`), `ULTIMO_ADMIN_DE_OBRA`,
   RFI/Red Line históricos intactos — **escrituras solo en la obra de prueba**.
7. El portal nuevo sirve, y la columna «Administra esta obra» aparece en
   Participantes.

---

## 8 · RIESGOS RESIDUALES DESPUÉS DEL DESPLIEGUE

Lo que la ventana **no** arregla, dicho antes de abrirla:

1. **GCS es un gate separado** (`EXTERNAL DOCUMENT PILOT`). La protección medida
   el 20-ago (soft delete 90 días, recuperación con hash idéntico, copia diaria
   con «cuándo borrar: Nunca») sigue; el residual —**copia en el mismo proyecto
   y región** que el original— se evalúa allí, no aquí.
2. **Entity Admin conserva alcance global** mientras 1 instancia = 1 cliente.
   Decisión deliberada; se re-toma cuando eso deje de ser cierto.
3. **El operador de plataforma entra por fuera de Flask.** Quien tenga la
   credencial de Cloud SQL o GCS no está limitado por `users.role`. IAM de nube
   quedó explícitamente fuera.
4. **Adjudicación de admins pendiente** (paso 14): tres cuentas `role='admin'`,
   con `Medicion Infra` como candidata a cuenta técnica sin admin de app —
   decisión del propietario, cuenta por cuenta, con «primero lo que gana,
   después lo que pierde».
5. **La fila en cuarentena de `pdf_markups`** (Demo User): pendiente de una
   decisión humana; mientras tanto, documentada y a salvo.
6. **Los ~75 objetos legados** (índices/constraints de generaciones anteriores):
   inofensivos, inventariados en E1; limpiarlos sería una tarea aparte y no
   urgente.
7. **Higiene diferida**: los 4 guiones sueltos con default `postgres`
   (`audit_inventory.py` y compañía) — fuera del camino de ejecución; retirar el
   default después del cutover.

---

## 9 · SIGUIENTE FRENTE DE PRODUCTO — ANOTADO, NO INICIADO

**`IDENTITY & ACCESS UX`** — sobre la arquitectura ya definida a partir de
ACC/Procore (docs 44–46), sin volver a investigarla:

```
Identity
  → Entity membership
  → Project membership
  → Company / Contractual Function
  → Entity Admin / Project Admin
  → Resource Permission
  → Workflow
  → Responsibility
```

Alcance de la fase (cuando el propietario la abra):

- Login profesional (hoy la pantalla clona a Revizto — pendiente desde el plan
  de auth)
- Invitaciones · Activación de cuenta · Recuperación de contraseña
- Administración de usuarios · Entity Admin · Project Admin
- Membresías por proyecto

**DEFER, hasta que aparezca su trigger** (sin fecha, sin trabajo previo):
Member Tool Access · Permission Profiles · Project Templates.

Nada de esto se implementa con este paquete.

---

*Cierre técnico interno. No es una certificación ISO ni de tercero. Cada
afirmación de estado lleva su evidencia versionada en
`docs/entidad/evidencias/`.*
