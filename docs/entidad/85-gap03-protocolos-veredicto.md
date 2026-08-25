# 85 · GAP 03 · PROTOCOLOS E INSPECCIONES — conciliación y veredicto

**Fecha:** 25-ago-2026 · **Suite:** 1194 · **Producción:** `1a9643c`
**Contra:** doc 82 §4.2 (Forms · Inspections), congelado el 24-ago-2026.

---

# 1 · LAS DOS COMPROBACIONES EXIGIDAS

## 1.1 · El motor es GENERALIZABLE

> `TEMPLATE` define el tipo de protocolo · `ACTA` es su instantánea inmutable

| comprobación | resultado |
|---|---|
| Ni una palabra de obra concreta en el **código** de `flujo_de_protocolo.py`, `routes/protocolos.py` y el SQL | ✅ *(solo en comentarios, donde debe estar)* |
| Cuatro protocolos que no se parecen en nada, **sin tocar backend** | ✅ liberación de encofrado · prueba hidráulica de tubería · inspección de seguridad · recepción de material en almacén |
| Cinco tipos de respuesta cubren los cuatro | ✅ `conformidad · texto · numero · fecha · opcion` |
| El acta **copia** los puntos; ninguna lectura vuelve a mirar la plantilla | ✅ |
| El veredicto solo mira **ítems**, nunca el tipo de protocolo | ✅ |

**Probado en producción:** se creó `PROT-ENC-02` con puntos totalmente distintos y
el acta `PL-002` siguió con sus 4 puntos y su `v1`. La instantánea no se movió.

## 1.2 · No conformidad sin Red Line — las seis condiciones

Forzado en producción con una restricción temporal que hacía fallar el escalado
de **un** punto y no del otro:

```
1 · LA FIRMA .............. CONSERVADA
2 · EL ACTA ............... No liberado
3 · escalados con éxito ... 1  [RL-004]   ← el fallo de uno NO arrastró al otro
4 · escalados FALLIDOS .... 1  con su error textual
5 · deuda en el acta ...... escalado_pendiente=1 · escalado_con_error=1
6 · auditado .............. ESCALATION_FAILED · PL-006
    DEUDA VISIBLE ......... conciliado=False · 1 punto sin escalar
```

Retirada la causa: reintento → **RL-005 creado, `conciliado=True`**. Dos
reintentos más → **0 creados**. `escalado_pendiente=0`.

**Solo se considera conciliado con `red_line_id`.** El estado `ERROR` explica por
qué falló; su ausencia no absuelve a nadie.

---

# 2 · CONCILIACIÓN CONTRA docs/82 §4.2

| capacidad del benchmark | estado |
|---|---|
| **Plantilla configurable** | **IMPLEMENTADO** — código, nombre, disciplina, secciones y puntos |
| **Secciones / ítems** | **IMPLEMENTADO** |
| **Tipos de respuesta** | **IMPLEMENTADO** — cinco, lista cerrada |
| **Creación de instancia** | **IMPLEMENTADO** — copiando y congelando la plantilla |
| **Asignación** | **IMPLEMENTADO** — `responsable_id` + BIC al autor mientras está en borrador |
| **Estados** | **IMPLEMENTADO** — Borrador · Firmada · Liberado · No liberado · Anulada |
| **Resultado por ítem** | **IMPLEMENTADO** — Conforme · No conforme · No aplica · Pendiente |
| **Evidencia / fotos** | **IMPLEMENTADO** — y **exigible**: `409 FALTA_EVIDENCIA` |
| **Firma por identidad** | **IMPLEMENTADO** — `user_id`, no un nombre escrito |
| **Permisos** | **EQUIVALENCIA POR OTRO DISEÑO** — capas 16/08/09 + posiciones del flujo, en vez de los 4 niveles del fabricante. **Solo el admin de obra define el protocolo** |
| **Auditoría** | **IMPLEMENTADO** — `CREATE` · `SIGN` · `VOID` · `ESCALATION_FAILED` |
| **Responsable** | **IMPLEMENTADO** — y viaja al Red Line con su plazo |
| **Cierre** | **IMPLEMENTADO** — el veredicto lo dictan los ítems; el acta no se reabre |
| **Generación de observación** | **IMPLEMENTADO** — escala a **Red Line**, no a un objeto nuevo |
| **Lógica condicional entre ítems** | **AUSENTE** — el esquema lleva `depende_de` y `visible_si`, pero **ninguna ruta ni pantalla los evalúa**. Declarado, no implementado |
| **Firma de varios firmantes** | **NO ADOPTADO** — firma quien comprueba. Un acta con firmas de quien no fue a campo prueba menos, no más |
| **Plantillas a nivel de ENTIDAD** | **NO ADOPTADO** — la capa 14 ya reproduce configuración entre obras |
| **Móvil / offline** | **DEFER A GAP 07** |
| **Reinspección como objeto** | **EQUIVALENCIA POR OTRO DISEÑO** — se levanta OTRA acta; reabrir la misma borraría que hubo un no conforme |

## 2.1 · La única AUSENTE, dicha sin adornos

**La lógica condicional entre ítems no está implementada.** El esquema reserva
`depende_de` y `visible_si` en cada punto, y `_normalizar_secciones` los
conserva — pero **nadie los evalúa**: ni el manejador al validar, ni la pantalla
al pintar. Un protocolo con esos campos se comporta hoy como si no los tuviera.

Es exactamente el patrón que la conciliación de GAP 01/02 destapó tres veces
(**«existe en el backend no cuenta»**), y por eso se declara AUSENTE y no
PARCIAL. **No bloquea el cierre de GAP 03**: el benchmark la sitúa en Procore
Inspections, ningún protocolo de los cuatro ensayados la necesita, y el
veredicto —que es lo que hace que el objeto signifique algo— no depende de ella.
Queda anotada para la pasada de calidad, no enterrada.

---

# 3 · DEFECTOS QUE LA EXP DESTAPÓ

Los dos aparecieron **durante la propia EXP**, no antes, y ninguno lo habría
encontrado la suite.

**1 · El Red Line nacía con responsable y sin pelota.**

```
RL-001  PL-003 · Escuadria conforme a plano   Emitido   resp=23
encargos REDLINE abiertos en la obra: 0
```

Existe y **nadie lo debe**: no aparece en «lo que me toca». La conciliación lo
repararía más tarde, pero *más tarde* no es *genera BIC* — entre medias hay una
no conformidad de obra sin nadie encima. Corregido: abre el encargo en el mismo
acto, con el plazo del acta. Verificado: `RL-006 → usuario 23 · vence 2026-09-10`.

**2 · Cualquier miembro podía definir el protocolo que lo inspecciona.**
`crear_plantilla` solo exigía membresía. El contratista podía definir los
criterios con los que se le inspecciona a sí mismo, y el acta dejaría de probar
nada aunque todos sus puntos salieran conformes. Corregido con
`guardia_administrativa`. Verificado en producción:

```
OTRO(23) no admin ......... 403 NO_ES_ADMIN_DE_OBRA
INSPECTOR(25) no admin .... 403 NO_ES_ADMIN_DE_OBRA
ADMIN(24) admin de obra ... 201
```

Levantar un acta **no** exige ser administrador, y eso también está fijado: quien
va a campo es el inspector, y confundirlo dejaría las liberaciones paradas.

---

# 4 · EXP · LO PROBADO EN PRODUCCIÓN

| prueba | resultado |
|---|---|
| ADMIN crea plantilla · INSPECTOR levanta acta (4 puntos copiados) | ✅ |
| Acta toda conforme → **LIBERADA**, firmada por `user_id 25` | ✅ |
| Acta con no conformes → **NO LIBERADA** + 3 Red Lines | ✅ |
| Cliente manda `estado:"Liberado"` → servidor devuelve **No liberado** | ✅ |
| No conforme **sin foto** → `409 FALTA_EVIDENCIA` con el punto exacto | ✅ |
| Puntos pendientes → No liberada | ✅ |
| Acta vacía → No liberada | ✅ |
| Firmar/editar el acta de otro → `403 NO_AUTOR` | ✅ |
| Usuario **fuera de la obra** → `403 PROJECT_FORBIDDEN` ×3 rutas | ✅ |
| Cambiar la plantilla → acta histórica **intacta** | ✅ |
| Fallo de escalado forzado → seis condiciones | ✅ |
| Reconciliación + idempotencia | ✅ |

**Integridad en producción tras la EXP:**

```
actas LIBERADAS con un no conforme dentro ....... 0
divergencias PROTOCOLO/REDLINE tras conciliar ... 0
```

La conciliación reconstruyó 6 encargos —5 Red Lines previos al arreglo y el del
acta en borrador—, que es exactamente para lo que existe: **la pelota se
recupera sola; el acto, no.**

---

# 5 · VEREDICTO

```
GAP 03 · PROTOCOLOS / INSPECCIONES

ARQ ✅   semántica declarada; TEMPLATE→tipo, ACTA→instantánea;
         generalizable demostrado con cuatro protocolos distintos
OP  ✅   suite 1194; invariante en semántica, manejador Y base;
         escalado por ítem con deuda visible, auditada e idempotente
EXP ✅   flujo completo con cuatro identidades en producción,
         doce negativas, y el fallo de escalado forzado y reconciliado

→ COMPLETE
```

Con una salvedad escrita, no escondida: **la lógica condicional entre ítems
queda AUSENTE**, declarada en el esquema y sin evaluar. No bloquea el cierre por
lo dicho en §2.1, y va a la pasada de calidad.

**SIGUIENTE: GAP 04 · PUNCH / OBSERVACIONES DE CIERRE.**

---

*Sin porcentajes nuevos: la cobertura se recalcula al cerrar el bloque 01–07.*
