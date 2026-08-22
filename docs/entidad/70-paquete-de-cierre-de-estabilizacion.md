# PAQUETE DE CIERRE · PRODUCTION STABILIZATION — BORRADOR PREPARADO

**Preparado el 22-ago-2026 durante el periodo de observación. NO es el cierre:**
la estabilización se declara cerrada solo tras el `GO` del propietario al final
del periodo de smoke. Este documento existe para que ese día no haya que
reconstruir nada — solo completar §7 y decidir §8.

---

# 1 · ESTADO FINAL DE PRODUCCIÓN (22-ago, tarde)

```
servicio        visor-ecd-backend · status:ok · configuración 6/6 · a4ddfab1472f
runtime         ecd_app en exclusiva (0 conexiones postgres desde la ventana)
esquema         ESQUEMA_ESTRICTO=true · arranque gateado (95/95 tablas verificadas)
perímetro       ENFORCE_PROJECT_AUTHZ=true · fail-closed medido en ambos sentidos
identidad       G5a×3 + G6 cerrados · reset de un solo uso · padrón 4 cuentas
resolver        project_ref sembrado (27 filas · 10 obras · 10 alcances)
frontends       ALEPHIA v1.0 en portal, Hub y visor · suite backend 912/912
copia           ecd_20260822_163754 · 90 tablas · 83.574 filas · verificada por dentro
```

# 2 · EVIDENCIA CONTROLLED WINDOW

[Doc 65](65-cierre-de-la-controlled-window.md): 7/7 criterios congelados con
medida — convergencia (339 objetos, 0 fuera), cutover, smoke §4.2 completo
(409 · 404 · 400 · 200 · RFI con veredicto · permiso de carpeta que estuvo roto),
históricos intactos tras todas las escrituras, portal nuevo operado. La mitad
final del smoke se ejecutó con la sesión real del usuario de prueba, por
interfaz.

# 3 · EVIDENCIA PASO 14

[Doc 66](66-adjudicacion-de-admins-inventario.md): 7/7 identidades adjudicadas y
ejecutadas. Padrón final: 4 cuentas bajo control del propietario (2 admin+2FA ·
17 desactivada con historia · 19 y 22 QA confinadas a la obra de prueba). 3
purgas con preflight de 9 FK + referencias por texto, asiento previo cada una;
0 huérfanos; integridad intacta. Decisión A: custodio único con [recuperación de
emergencia probada en diagnóstico](69-recuperacion-de-custodia.md). Decisión B:
revocada — la obra real la administra el Entity Admin, **estado transitorio**
(nota fijada en doc 66). Congelado: no se reabre salvo nueva evidencia.

# 4 · RIESGOS RESIDUALES

[Doc 68](68-residuales-de-estabilizacion.md), sin cambios desde su corte:
6 cerrados · 3 riesgos aceptados documentados · 5 post-stabilization · 2
blockers pre-piloto (residencia de datos `us-east4` y MFA — **ambos externos al
código**) · las decisiones de propietario que quedaban ya cayeron con el PASO 14,
salvo las de §7.

# 5 · ESTADO ACC/PROCORE (ARQ / OP / EXP)

Tabla completa en [doc 63 §D](63-mapa-maestro-de-seguimiento.md). Resumen:
`COMPLETE` 3 (Contractual Function · Workflow Authorization · Responsibility/BIC)
· `PARTIAL` 8 (todas por experiencia salvo Identity, que retiene G7) · `DEFER` 5
con triggers apagados. La ventana y la estabilización movieron **OP**; la
**EXP** pendiente es exactamente el frente que se abre al cerrar
(Identity & Access UX → P5 → Resource Permission UX).

# 6 · CONDICIONES YA CUMPLIDAS PARA CERRAR

```
✅ ventana cerrada con 7/7 y sin regresión posterior
✅ project_ref sembrado y probado ida y vuelta (403→PROJECT_FORBIDDEN / miembro 200)
✅ deudas técnicas A cerradas (suite 912/912, endpoints verificados en producción)
✅ deudas documentales B cerradas (docs 65–69, exclusión ai_brain declarada en código)
✅ PASO 14 ejecutado, verificado y congelado
✅ copia fresca post-cambios verificada por contenido
✅ auditoría `global` cerrada: duplicado acotado, inalcanzable, sin crecer
✅ capa 10 COMPLETE con evidencia EXP independiente
```

# 7 · CONDICIONES TODAVÍA PENDIENTES

### 7a · Periodo de smoke — CRITERIO PROPUESTO (pendiente de ratificar)

El propietario fijó «el periodo acordado», pero **la duración nunca se
numerizó**. Propuesta concreta para ratificar en el GO/NO-GO:

```
72 HORAS desde el último cambio de producción (22-ago ~17:00 UTC), con:
  · cero 5xx no atribuible a prueba deliberada
  · cero reinicios anómalos (los despliegues intencionales no cuentan)
  · cero conexiones runtime que no sean ecd_app
  · cero fallos de aislamiento
  · al menos UNA sesión de uso real del propietario sin incidencia
→ cumplido ⇒ GO automático a presentar; incidencia ⇒ el reloj se reinicia
```

**Limitación declarada:** los monitores viven dentro de la sesión de trabajo.
Entre sesiones no hay vigilancia activa — la evidencia se acumula cuando hay
sesión abierta, y el arranque de cada sesión revisa salud e integridad del
intervalo. Si se quiere vigilancia continua real, existe la opción de una tarea
programada del sistema; **decisión del propietario**, no se configura sola.

Estado al preparar este paquete: **verde desde las 16:20 UTC** (dos monitores;
único evento: el cambio de versión esperado del deploy `a4ddfab`).

### 7b · Decisión del propietario en el GO/NO-GO

La decisión conjunta **obra de prueba + cuentas QA 19/22** (§8).

### 7c · Clasificados fuera del cierre (por orden del propietario)

| Ítem | Clase | Por qué |
|---|---|---|
| `sql/06` (doc_redlines NOT NULL) | **mejora posterior** | 0 nulos medidos; regla de contrato, no de datos; exige credencial de migrador |
| Clave `postgres` (Cloud Console) | **antes del primer lote de migrador** | no afecta al runtime ni a la recuperación de custodia (corre con ecd_app) |
| Ensayo fresco de restauración | **evidencia adicional deseable** | restaurabilidad ya probada (19–21 ago); la copia nueva verificada por contenido |
| Segundo custodio | **gate pre-piloto obligatorio** | condiciones ya escritas en doc 69 §4 |
| Residencia `us-east4` · MFA | **gate pre-piloto** | contractual / política; no retroactivos a estabilización |

# 8 · DECISIÓN FINAL — OBRA DE PRUEBA + CUENTAS QA (para el GO/NO-GO)

**Lo que está en juego:** la obra `ZZ PRUEBA VENTANA 2026-08` contiene la
evidencia **reproducible** de la ventana — DOC-0001 (ciclo WIP→C01·PR→C02·B1→C03·A2
→SHARED por revisión), TR-001 con recepción administrativa, RFI-001 respondido,
RL-001, RV-002 aprobada con independencia — y las cuentas 19/22 son el único par
que permite repetir esas pruebas (Reviews exige dos miembros).

**A) Conservar como QA permanente** — obra y par 19/22 quedan como entorno
estable de verificación.
*Gana:* toda prueba futura (y habrá muchas en Identity & Access UX) tiene dónde
correr sin tocar la obra real; la evidencia sigue viva y reproducible.
*Cuesta:* conviven en el padrón y el listado; ante un tercero hay que explicar
«ZZ…» (el prefijo ya la ordena al final y la marca como prueba).

**B) Archivar obra + desactivar cuentas conservando historia** — archivado
reversible (existe restaurar), cuentas desactivadas jamás purgadas (actividad
probatoria).
*Gana:* padrón y listado impecables.
*Cuesta:* la siguiente fase (Identity & Access UX) **necesitará un entorno de
prueba inmediatamente** — se archivaría hoy lo que habría que revivir la semana
que viene.

**C) Intermedia** — conservar hasta cerrar Identity & Access UX + Resource
Permission UX (que la van a usar intensivamente) y re-decidir A/B en el gate
pre-piloto, donde la limpieza del padrón importa de verdad.

**RECOMENDACIÓN: C** — es A con fecha de revisión donde el coste de A empieza a
existir. Archivar ahora (B) crea trabajo la semana próxima; prometer «permanente»
(A) decide hoy lo que se decide mejor en el gate del piloto.

---

*Cuando el periodo de 7a se cumpla: se presenta `GO / NO-GO` con este paquete
actualizado, el propietario decide §8, y si es GO:*

```
PRODUCTION STABILIZATION   ✅
IDENTITY & ACCESS UX       🔵 NUEVO FRENTE ACTIVO
```
