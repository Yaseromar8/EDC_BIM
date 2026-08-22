# CIERRE DE LA CONTROLLED WINDOW — 22-ago-2026

**Veredicto: VENTANA EXITOSA.** Los siete criterios del doc 53 §7, cada uno con
su evidencia medida — ninguno declarado por intención.

La ventana se abrió la madrugada del 22-ago (PASO 2, suspensión del servicio) y
se cierra este mediodía con el último elemento de la tabla de smoke congelada.
Entre medias hubo cuatro defectos reales encontrados y corregidos — que es
exactamente para lo que existe una ventana controlada con smoke tests.

---

# 1 · LOS SIETE CRITERIOS (doc 53 §7)

| # | Criterio congelado | Evidencia |
|---|---|---|
| 1 | Postcondición de convergencia: cero objetos aplicativos fuera de `ecd_migrator`, extensiones intactas, invariantes idénticas | Barrido final: **339 objetos de `ecd_migrator` · 0 aplicativos fuera** · extensiones excluidas por catálogo (`pg_depend deptype='e'`) · invariantes idénticas antes/después (`file_nodes` 3051 → 3051 + 10 de la obra de prueba; `file_versions` 2853) |
| 2 | El runtime **es** `ecd_app`, sin credencial administrativa en el servicio | `pg_stat_activity`: solo `ecd_app` conectado desde Render (pool Min:2) · `ecd_app` sin `CREATE` en `public`, sin `UPDATE` en `activity_log` · cero conexiones `postgres` |
| 3 | `ESQUEMA_ESTRICTO=true` y el servicio arranca (los 3 objetos de `es_admin` existen) | Arranque gateado: `bootstrap_esquema.py --verificar && gunicorn` — servir implica 95/95 tablas · 872/872 columnas · 510/510 restricciones · `/api/health` `status:ok` |
| 4 | **Smoke obligatorio**: conceder permiso de carpeta → 200 (lo roto desde el 20-ago) | Fila en `folder_permissions`: `id 19 · PRUEBA · USER · sujeto_id 19 · edit` — `sujeto_tipo`/`sujeto_id` poblados, lo que el backend viejo no podía escribir. **ALERT 1 cerrado** |
| 5 | Postura `completa: true, faltan: 0` y `ENFORCE_PROJECT_AUTHZ` bloqueando de verdad | `/api/health`: `{completa:true, faltan:0, puntos:6}` · sesión real de miembro contra obra ajena → **403** (fail-closed en el resolver: `PROJECT_UNRESOLVED`; la denegación por membresía la cubren los drills 32/32) · listado del miembro: **una sola obra de diez**. **ALERT 2 cerrado** |
| 6 | La tabla de smoke de REV.02 §4.2 completa, escrituras solo en la obra de prueba | §2 de este documento — 7/7 filas · históricos verificados intactos DESPUÉS de todas las escrituras: **25 RFI · 33 Red Lines · 1 transmittal contractual** |
| 7 | El portal nuevo sirve y la columna «Administra esta obra» aparece en Participantes | Bundle nuevo servido y usado · columna operada dos veces (nombramiento 200 por el propietario; 409 por el usuario de prueba) |

---

# 2 · LA TABLA DE SMOKE CONGELADA (REV.02 §4.2), FILA POR FILA

| Prueba | Esperado | Resultado | Cómo |
|---|---|---|---|
| Nombrar administrador de obra | 200 | ✅ 200 | Interfaz, sesión del propietario — asiento `project_admin_concedido` con hash encadenado |
| Retirar al único admin, sin ser Entity Admin | **409 `ULTIMO_ADMIN_DE_OBRA`** | ✅ 409 | **Interfaz real**: el propio admin de obra (usuario 22) apagando su interruptor en Participantes; la casilla no cambió y `es_admin=t` intacto en BD |
| Nombrar a quien no es miembro | **404 `NO_ES_MIEMBRO`** | ✅ 404 | Contrato API con la sesión del 22 (la interfaz no lo ofrece — la lista solo muestra miembros, que es el aprobado de pantalla) |
| Conceder permiso de carpeta | 200 | ✅ 200 | Interfaz, madrugada — la prueba de §2.1 |
| Recepción sin `destinatario_id` | **400 `FALTA_DESTINATARIO`** | ✅ 400 | **Botón real «Acusar recibo»** pulsado por un admin de obra que no es destinatario |
| Recepción con destinatario válido | **200 `ADMIN_RECORDED_RECEIPT`** | ✅ 200 | Vía administrativa con `destinatario_id:19` + motivo — acuse con `tipo, destinatario_id, registrado_por_id:22, via:admin`, fecha del servidor |
| Emitir un RFI y darle veredicto | veredicto solo del responsable | ✅ | RFI-001 emitido por interfaz (directorio por identidad), responsable 22, veredicto `Aceptado` dictado por el responsable → `Respondido`, historial de 4 eventos |

**El transmittal de prueba (TR-001)**: emitido por la interfaz desde la sesión
del usuario 22, con la identidad del destinatario **resuelta en la emisión**
(`user_id: 19` dentro de `recipients`) — la corrección que evita el acuse por
homónimo. El encargo del destinatario **no se abrió, por diseño**: `abrir`
rechaza destinatarios que no son miembros de la obra («ni siquiera por error de
quien llama»), y el 19 no es miembro de la obra de prueba. La invariante es más
fuerte que el efecto que la tabla esperaba observar.

---

# 3 · LO QUE LA VENTANA ENCONTRÓ Y CORRIGIÓ

Cuatro defectos reales, ninguno visible antes de ejecutar:

1. **`669e8c3`** — los tres listados de proyectos devolvían el resultado de
   OTRA consulta (cursor reutilizado): la pantalla de aterrizaje no listaba
   nada, sin error. Encontrado por el smoke; corregido y verificado contra
   producción.
2. **`736607d`** — `00_roles.sql` no ejecutaba en Cloud SQL (`NOSUPERUSER` /
   `NOBYPASSRLS` exigen TENER el atributo). El fixture nuevo con las
   limitaciones reales lo detectó; producción quedó intacta (transacción
   abortada antes del COMMIT).
3. **`b438746`** — el menú de estado de revisión existía, respondía y no se
   veía (recorte del scroller virtualizado). Encontrado al insistir el
   propietario en probar POR LA INTERFAZ; el ciclo completo
   WIP→C01·PR→C02·B1→C03·A2 quedó después registrado con revisiones que no se
   reutilizan.
4. **`31791e4`** — la compuerta Entity-Admin-only (de `d7e06b4`, 3-ago,
   anterior al perímetro): ningún miembro alcanzaba el expediente. Retirada
   durante la ventana por orden del propietario; verificada con sesión real.

Además, por la misma orden de autonomía: **`5b8f1a4`** (las tres puertas de
entrada respetan `is_active`; reset de un solo uso vía huella, sin DDL) y
**`556820a`** (reemisión de invitaciones, reactivación, chips de estado).

---

# 4 · PASO 13 — TRÁFICO

El servicio quedó sirviendo tráfico desde el PASO 8 (ningún STOP posterior lo
suspendió) y este cierre lo declara formalmente: **tráfico abierto**, salud
`ok`, versión `556820a8facc`, postura 6/6. No queda ninguna suspensión activa
ni credencial administrativa en el servicio.

---

# 5 · LO QUE QUEDA — PRODUCTION STABILIZATION (no es parte de la ventana)

1. **PASO 14 · Adjudicación de admins** — decisión humana del propietario,
   cuenta por cuenta. Estado real hoy: 1 Entity Admin (`omarsanchezh8`), 3
   invitaciones sin reclamar (18, 20, 21-retirada), 2 cuentas de prueba (19,
   22). La obra real no tiene ningún Project Admin nombrado.
2. **Sembrar `project_ref`** — las obras legadas resuelven por el camino
   antiguo; el `403 PROJECT_UNRESOLVED` medido confirma el fail-closed, pero el
   resolver debe conocerlas (`sembrar_referencias.py`).
3. **Smoke sostenido** unos días con uso real.
4. Anotaciones heredadas: declarar la exclusión de `ai_brain` de la copia ·
   `feedback_buffer` · `doc_redlines.project_id NOT NULL` (lote del migrador) ·
   los 7 endpoints sin política declarada (caen al lado seguro) · el guardado
   de Accesos es destructivo (reescribe membresías y pisa `es_admin`) · la vía
   administrativa del acuse no existe en la interfaz (solo por API) · el
   selector de destinatarios no lleva correos para no-admins.

**La obra de prueba** (`ZZ PRUEBA VENTANA 2026-08`) se conserva con sus
artefactos (DOC-0001 C03·A2, TR-001 con su recepción administrativa, RFI-001
respondido, RL-001): son la evidencia viva de esta ventana. Su retirada, si se
decide, es post-estabilización.

---

*Nota de método: el recorrido de experiencia se ejecutó con la sesión real del
usuario de prueba en el navegador embebido. Dos concesiones de automatización,
declaradas: el `window.confirm` nativo se auto-aceptó (los diálogos nativos no
son alcanzables por automatización) y algunos campos de texto se alimentaron
despachando los eventos `input`/`keydown` del propio producto, porque el panel
no entrega foco de teclado. En ambos casos el código del producto que corre es
exactamente el mismo; ninguna validación se saltó — como demuestra el
`REVISION_SIN_INDEPENDENCIA` que el producto nos negó igual.*
