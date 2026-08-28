# 98 · NG-04 · AVANCE FÍSICO DESDE CAMPO — definición, antes de programar

**Fecha:** 27-ago-2026 · **Naturaleza:** definición y auditoría. Sin código,
sin DDL, sin migración, sin despliegue. · **Bucle a cerrar:** PLAN/4D →
ejecución → evidencia → validación → estado reconocido → 4D actualizado.

---

## ✅ ARQ DEFINITION = CLOSED (28-ago-2026) — aprobada con 3 correcciones

Las cuatro propuestas de §N quedaron **aprobadas** (validar=aprobar · canal
manual LOB=escenario · `actual_finish` solo explícito · asiento NG-03 cita
avance). El dueño ordenó incorporar, antes de implementar:

> **1 · Snapshot de autoridad del objetivo.** Todo avance aprobado conserva
> la base contra la que fue reconocido: `fuente_objetivo · id_objetivo ·
> unidad · cantidad_objetivo_al_aprobar · versión/revisión/huella de la
> fuente`. El histórico no puede cambiar semánticamente porque después
> cambie el metrado. Se distingue **porcentaje histórico al aprobar** vs
> **porcentaje actual contra el plan vigente**, sin duplicar
> innecesariamente datos derivados.
>
> **2 · BIC contractual concreto.** No usar `SUPERVISION` como destinatario
> desnudo: resolver a **empresa concreta en la obra o persona concreta
> designada**, y snapshotear su función. `0 candidatos →
> SIN_APROBADOR_CONTRACTUAL · 1 candidato → asignar · >1 candidatos →
> APROBADOR_CONTRACTUAL_AMBIGUO`. ENTIDAD de contingencia sigue la misma
> regla.
>
> **3 · Ajustes.** No mezclar `cantidad > 0` con un delta a veces positivo y
> a veces negativo. Tipos congelados: `AVANCE · AJUSTE_POSITIVO ·
> AJUSTE_NEGATIVO`, con **magnitud siempre positiva**. Para solape/exceso:
> detectar ≠ prohibir, detectar ≠ aceptar silenciosamente — si se aprueba
> existiendo conflicto, quedan trazables **aprobación explícita + motivo +
> actor + timestamp**. Y explícito: `actual_start` = primera ejecución
> aprobada aplicable; `actual_finish` = únicamente declaración explícita de
> terminación.

Con ellas: **ARQ DEFINITION = CLOSED**. Pasada 2 autónoma; el **PRIVILEGE
SWEEP** se ejecuta como gate y viaja EN la migración 26 (no se pospone más
allá de la siguiente migración a producción — orden del dueño).

**Lo que ya existe, medido (y se reutiliza, no se duplica):**

| pieza | qué aporta |
|---|---|
| `lob_cost_items` | LA cantidad objetivo: `metrado` ≥ 0 + `unidad` por partida, ligada a `activity_id` y `frente_label`. También `pu` (dinero) — que NO entra en este frente |
| `lob_activity_schedule` | la frontera PLAN/ACTUAL **ya está en columnas**: `planned_start/finish` vs `actual_start/finish, percent, status` — el 4D ya la consume |
| `lob_linear_progress_events` | canal MANUAL del workspace LOB (estación, cantidad, unidad, evidencia) — **sin actores, sin aprobación, sin idempotencia, % tecleable**. El embrión que esta definición gobierna |
| `lob_locations` / `lob_front_map` / `lob_element_links` | tramo↔estaciones, frente↔partida, elemento↔partida↔actividad |
| `civil_solids` | objetivo CONTINUO por tramo para movimiento de tierras (corte/relleno evaluados en continuo) |
| GAP 07 · NG-02 · NG-03 | motor offline+idempotencia, foto citable, cuaderno/asientos, funciones contractuales, BIC, auditoría append-only |

---

## A · OBJETOS — tres conceptos que NO se mezclan

- **REPORTE DE AVANCE (`avance_campo`)** — lo declarado desde campo: una
  MAGNITUD FÍSICA ejecutada, con evidencia y snapshot de quién/cuándo. NO
  toca baseline, ni cantidad planificada, ni porcentaje del cronograma, ni
  fecha contractual: es un testimonio, no un estado.
- **AVANCE RECONOCIDO** — el mismo objeto en estado APROBADO por autoridad
  contractual válida. Solo lo reconocido SUMA.
- **PROYECCIÓN DE ESTADO** — cálculo DERIVADO y RE-EJECUTABLE que consume
  únicamente lo aprobado y escribe las columnas ACTUAL que ya existen. No es
  una tabla de verdad nueva: es una función de lo reconocido.

**Identidad mínima de `avance_campo`:** obra · dataset LOB · **destino
físico** (§A.1) · `fecha_operativa` DECLARADA (regla congelada de NG-03) ·
`cantidad` (>0) · `unidad` · evidencia (fotos CITADAS) · autor + empresa +
función DE ENTONCES · `capturado_en` declarado / `recibida_en` autoritativo ·
origen online/offline · `operation_id` (idempotencia del acto, GAP 07).

**A.1 · Cuatro formas de destino físico, sin convertir nada a metros:**

| forma | referencia | ejemplo |
|---|---|---|
| tramo lineal | partida/actividad + `progresiva_inicio→fin` | relleno 0+620→0+640 |
| cantidad discreta | partida/actividad (sin geometría) | 12 und de tubería instalada |
| elemento BIM | `lob_element_links` (elemento→partida→actividad) | el muro X vaciado |
| actividad no geométrica | `activity_id` a secas | movilización, trámite |

La forma no es un tipo rígido: es qué referencias vienen. Al menos UNA
(partida, actividad o elemento) es obligatoria — un avance sin destino no es
un avance.

## B · AUTORIDAD DE CANTIDADES (por defecto: MAGNITUD, no % tecleado)

El usuario reporta **cantidad física**; el sistema deriva
`% = Σ cantidad APROBADA / cantidad objetivo` cuando hay objetivo. Autoridad
del objetivo, por caso y EN ESTE ORDEN:

1. **`lob_cost_items.metrado` de la partida** — la autoridad contractual del
   plan importado. Si el avance referencia partida, su `unidad` DEBE casar
   con la de la partida (invariante §L).
2. **`civil_solids` (continuo)** — desglose por tramo SOLO para movimiento de
   tierras: valida solapes y excesos por estación; el total contractual sigue
   siendo el metrado de la partida.
3. **Elementos** — cantidad discreta = conteo/propiedades del vínculo
   elemento→partida.
4. **`presupuesto_maestro`** — NO es autoridad aquí: es dinero (§M).

Sin objetivo (actividad no geométrica): no hay %; hay cantidad acumulada y
fechas. Un % sin denominador no se inventa.

## C · LIFECYCLE

```
BORRADOR_LOCAL (solo dispositivo: la cola del GAP 07)
      ↓ sincroniza / envía
REPORTADO ──────────────┐         (BIC → función validadora)
      ↓ valida          ↓ devuelve con motivo
   APROBADO          DEVUELTO     (inmutable; se corrige RE-REPORTANDO
      ↓ deriva                     otro que lo referencia — patrón NG-03)
 proyectado_en sellado
```

- **REPORTADO absorbe EN_VALIDACION**: son el mismo hecho (llegó y espera).
  Un estado que duplica otro es un estado que miente (lección `EN_CURSO`,
  GAP 07).
- **PROYECTADO_AL_4D no es un estado del objeto**: es la marca derivada
  `proyectado_en` sobre un APROBADO. La proyección es idempotente y
  re-ejecutable; si falla, se reintenta sin tocar el objeto.
- **APROBADO = inmutable.** La corrección de un aprobado es un **AJUSTE**:
  avance nuevo (cantidad ±, misma referencia física) con `ajusta_a` → el
  anterior queda visible; el acumulado deriva de la suma. Jamás UPDATE.
- **DEVUELTO conserva TODO** (evidencia incluida), como el asiento devuelto.

## D · ACTORES Y AUTORIDAD (sin motores nuevos; admin EXCLUIDO)

- **REPORTAR**: cualquier miembro con la herramienta (capas 2/3/8/16) — la
  captura es captura; el snapshot dice quién era y qué ejercía.
- **VALIDAR y APROBAR son UN acto en v1** (una firma):
  `FUNCIONES_VALIDADORAS_DE_AVANCE = (SUPERVISION, ENTIDAD)` — ENTIDAD como
  contingencia DECLARADA, nunca por privilegio. La separación
  validador-técnico/aprobador se añadirá si la entidad la exige: no se
  inventa burocracia sin demanda (propuesta congelable, §N).
- **Project Admin NO aprueba avance** — misma firma-como-regla que NG-03:
  `puede_aprobar_avance(funcion, es_autor)` sin parámetro administrativo.
- Autor ≠ aprobador, siempre. El creador no gana autoridad por crear.
- Sin nadie con función validadora en la obra →
  **`SIN_APROBADOR_CONTRACTUAL`**, bloqueado y visible. Sin fallback.
- Snapshot de empresa+función al REPORTAR y al APROBAR, ambos.

## E · BIC (encargos, los mismos)

| estado | la pelota la tiene |
|---|---|
| REPORTADO | la función validadora (SUPERVISION; contingencia ENTIDAD). Sin nadie: `SIN_APROBADOR_CONTRACTUAL` visible, jamás un admin |
| DEVUELTO | su autor (corregir y re-reportar) |
| APROBADO | nadie — la proyección es automática e idempotente |

`deudor_de_avance` en `encargos.py`, junto a los demás.

## F · INCREMENTAL, NO ACUMULADO

**Cada reporte es un INCREMENTO ejecutado; el acumulado se DERIVA** (Σ de
aprobados). «Lunes 30 %, martes 40 %» jamás podrá leerse como 70 % de un
día: son cantidades que suman, no porcentajes que se pisan.

Si el capataz solo conoce el acumulado («llevamos 480 m³»), la PANTALLA
convierte en el borde: muestra `acumulado aprobado hoy = X` y propone
`incremento = 480 − X`, que la persona confirma ANTES de reportar. Lo que
viaja y se guarda es SIEMPRE el incremento.

- Retroceso: no existe el reporte negativo; lo aprobado de más se corrige
  con AJUSTE (±, `ajusta_a`, autoridad validadora).
- Duplicado sospechoso (misma referencia física + misma cantidad + misma
  fecha, distinto acto): NO se bloquea (dos capas iguales el mismo día son
  reales); se MARCA en la pantalla de validación. Decide quien aprueba.

## G · RELACIÓN CON EL CUADERNO (NG-03) — una sola verdad física

**El asiento CITA al avance** (`referencias.avance_id`), igual que cita
fotos. El asiento tipo `avance` del cuaderno sigue siendo NARRATIVA de la
jornada (texto + progresiva orientativa); **la CANTIDAD vive únicamente en
`avance_campo`**. Ningún objeto guarda dos cantidades: si un asiento quiere
decir «se ejecutaron 120 m³», lo dice citando al avance que los reporta.
La pantalla de registro ofrece crear ambos juntos (un gesto), pero nacen
como lo que son: un acto físico + una cita en el cuaderno.

## H · RELACIÓN CON FOTOS (NG-02)

La evidencia del avance son **CITAS a `doc_fotos` por su objeto canónico**
(y, sin red, la foto nueva viaja como blob del GAP 07 y se cita al
sincronizar — exactamente el flujo ya probado). Cero copias de binarios.
El guardia del borde de C1 aplica: sin referencia elegible, el acto no sale
del dispositivo mal formado.

## I · RELACIÓN CON LOB / 4D — la frontera PLAN vs ACTUAL

El 4D consume **únicamente AVANCE APROBADO**, nunca borradores ni
reportados. La PROYECCIÓN escribe SOLO las columnas que ya son «actual»:

| se proyecta | dónde | regla |
|---|---|---|
| cantidad ejecutada (evento) | `lob_linear_progress_events` con `source='campo'` e id = id canónico del avance (idempotente) | el pipeline 4D existente lo consume SIN tocar el visor (la matemática nunca está en el visor) |
| % físico | `lob_activity_schedule.percent` | Σ aprobado / metrado; el EXCESO no se capa en silencio: percent llega a 100 y el exceso queda visible en el objeto |
| `actual_start` | ídem | mínima `fecha_operativa` aprobada de la actividad |
| `actual_finish` | ídem | SOLO por declaración de terminación en un avance («termina la actividad») aprobada — no se infiere (propuesta §N) |
| estado | ídem | derivado (sin iniciar / en ejecución / terminada) |

**INTACTOS SIEMPRE**: `planned_start/finish`, `lob_cost_items.metrado`,
fechas contractuales, escenarios. El baseline importado no se reescribe.

**El canal manual existente** (`lob_linear_progress_events` tecleado desde el
workspace, % incluido) queda DECLARADO como herramienta de escenario/estudio
del planificador: **no es avance reconocido** y no se mezcla con
`source='campo'`. La fila del baseline mide el ciclo de campo (propuesta
congelable, §N).

## J · OFFLINE (motor GAP 07, sexta vertical — sin motores nuevos)

| acto | offline | cómo |
|---|---|---|
| crear reporte | ✅ `AVANCE/CREATE` | caso A, idempotente por acto |
| elegir actividad/partida/frente/unidad | ✅ | del SNAPSHOT precargado del dataset (con `descargado_en` visible — lección F4) |
| ingresar cantidad + progresiva | ✅ | dato local |
| citar/crear fotos | ✅ | NG-02, ya probado |
| vincular asiento del cuaderno | ✅ | cita local o canónica; `depende_de` si ambos nacen sin red |
| guardar/encolar | ✅ | IndexedDB, cola GAP 07 |
| **APROBAR / DEVOLVER** | ❌ SOLO EN LÍNEA | revalida identidad, membresía, función, autorización y estado canónico AL MOMENTO — la misma decisión que firmar, aprobar asientos y emitir |

## K · IDEMPOTENCIA Y CONFLICTOS (pruebas diseñadas desde el inicio)

| escenario | desenlace exigido |
|---|---|
| mismo `operation_id` dos veces | se devuelve lo consolidado; cero duplicados (GAP 07) |
| mismo avance con OTRO `operation_id` | entra REPORTADO; la validación lo MARCA como posible duplicado; decide el aprobador — nunca suma sola |
| respuesta perdida | el reintento es una consulta (idempotencia) |
| dos cuadrillas, mismo tramo, concurrentes | ambos entran REPORTADOS; la pantalla de validación muestra el SOLAPE de estaciones y el acumulado vs objetivo; el doble conteo silencioso es imposible porque SOLO la aprobación suma |
| solape de progresivas con un APROBADO | detectado y mostrado (solape legítimo existe: capas sucesivas del mismo tramo — por eso se marca, no se prohíbe) |
| tramo excede lo planificado / cantidad excede objetivo | aprobar exige confirmación EXPLÍCITA (`EXCESO_SOBRE_OBJETIVO`); nada se capa ni se suma en silencio |
| avance aprobado mientras el dispositivo estaba offline | `base_version`/estado esperado → CONFLICTO, decide una persona (nunca last-write-wins) |
| actividad/partida modificada o ausente al sincronizar | revalidación contra el dataset VIGENTE → rechazo con código o CONFLICTO; el reporte no se reinterpreta |
| foto todavía pendiente de subir | `depende_de` → BLOQUEADA hasta que el blob confirme (motor existente) |
| actividad cambia de frente | el avance conserva su snapshot de frente DE ENTONCES; la proyección agrupa por actividad, no por frente |

## L · INVARIANTES QUE VIVIRÁN EN BASE (sin DDL todavía)

1. Misma obra en TODAS las referencias (avance↔dataset↔partida↔foto↔asiento).
2. Estados en lista cerrada (CHECK casado con el código por tripwire).
3. `cantidad > 0` (CHECK); el signo lo pone el AJUSTE, no el reporte.
4. `unidad` = unidad de la partida cuando hay partida (validación en el
   acto; CHECK de no-nulidad condicional).
5. `progresiva_fin >= progresiva_inicio` (CHECK).
6. APROBADO exige `aprobado_por` (CHECK) y `aprobado_por ≠ autor`.
7. `ajusta_a` → FK a un avance APROBADO; guard transaccional con FOR UPDATE.
8. Aprobado no se edita: sin ruta de edición + candado transaccional.
9. **Sin DELETE — y esta vez DE VERDAD**: REVOKE explícito desde el
   nacimiento (lección C2; el privilege sweep transversal es el gate O).
10. Idempotencia: la del motor (`(project_id, operation_id)`) + proyección
    idempotente por id canónico del avance.
11. `proyectado_en` solo sobre APROBADO (CHECK).

## M · NO FINANCIERO — frontera dura

Este frente es AVANCE FÍSICO. `pu`, valorización, certificados, facturación,
SIAF: **no entran** — ni siquiera «ya que estamos». El único roce permitido
es que la partida del avance sea la misma partida que el presupuesto conoce;
el dinero que se derive de eso es de otro frente (NG-09/F08 ⚪) y de otra
pasada.

## N · EXP PREVISTA (16 pasos) Y DECISIONES

**EXP** — en obra pirata con un **dataset LOB de ensayo importado por la vía
real de importación** (obra pirata hoy no tiene plan; importarlo ES parte de
la prueba). Identidades existentes: u19 reporta (colaborador), u27
`QA Supervisor` (SUPERVISION) valida — el gate C5 NO bloquea esta EXP porque
no exige colaborador externo nuevo.

1. Actividad real del plan importado, con `metrado` y unidad. 2. Reporte
desde campo (u19). 3. Tramo real `0+620→0+640`. 4. Cantidad física.
5. Foto real NG-02 citada. 6. Asiento NG-03 citando al avance. 7. Ronda real
sin Wi-Fi (dueño). 8. Sync sin duplicar (reintentos → un objeto). 9. u27
aprueba — segunda identidad. 10. u19 se auto-aprueba → 403. 11. La
proyección actualiza `percent/actual_start` y el evento `source='campo'`.
12. `planned_*` y `metrado` INTACTOS (se miden antes/después). 13. Reporte
solapado → marcado, no sumado en silencio. 14. AJUSTE conserva al anterior.
15. BIC antes/después en la bandeja del validador. 16. Auditoría completa
(history + sync_operaciones + lob_dataset_audit).

**Y se mide, con números de la base:** cantidad planificada (`metrado`) ·
acumulado antes · incremento aprobado · acumulado después · % antes · %
después.

**Decisiones inevitables: NINGUNA.** Cuatro propuestas que quedan congeladas
salvo veto antes de la pasada 2:

1. Validar = aprobar en un solo acto (`SUPERVISION`; contingencia `ENTIDAD`
   declarada); two-tier solo si la entidad lo exige.
2. El canal manual del workspace LOB queda como escenario/estudio del
   planificador: NO es avance reconocido y no se mezcla con `source='campo'`.
3. `actual_finish` solo por declaración de terminación aprobada, nunca
   inferido.
4. El asiento CITA al avance (la cantidad vive solo en `avance_campo`).

**Gates transversales aceptados (O):** C5 (alta con empresa real, sin
fixture) condiciona cualquier EXP futura con colaborador externo — no esta;
**PRIVILEGE SWEEP** antes de la próxima ventana productiva (la tarea ya está
abierta como chip: medir qué rutas borran, revocar DELETE donde el dominio
promete historia, y que las tablas futuras nazcan sin él).

---

**ARQ DEFINITION READY** — a la espera del visto bueno (o vetos a las cuatro
propuestas de §N) para la pasada 2: semántica → suite → migración → schema →
backend → smoke → frontend → EXP.
