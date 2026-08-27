# 96 · NG-03 · CUADERNO DE OBRA — definición, antes de programar

**Fecha:** 27-ago-2026 · **Naturaleza:** definición y auditoría. Sin código,
sin migraciones, sin despliegue. · **Filas:** E05 ✅(sube a profundidad) · E06
· E07 · E08 · C12.

> **APROBADA CON DOS CORRECCIONES + UNA REGLA CONGELADA (propietario,
> 27-ago-2026) — este texto ya las incorpora:**
> 1. **Project Admin NO es aprobador contractual.** Aprueba/devuelve la
>    función `SUPERVISION`; `ENTIDAD` solo como contingencia DECLARADA como
>    función autorizada, nunca por privilegio administrativo. Sin aprobador
>    contractual válido → bloqueo con código explícito.
> 2. **El destinatario de una INSTRUCCIÓN nunca es una función desnuda:** es
>    persona concreta o empresa concreta de la obra, con snapshot de
>    empresa + función. El BIC se resuelve contra ESE sujeto contractual, no
>    contra cualquier miembro que hoy comparta función.
> 3. **La fecha del parte es la fecha OPERATIVA declarada de la obra**, no
>    derivada de `created_at` UTC (a las 7 pm de Lima, UTC ya vive en mañana).
>
> **ARQ DEFINITION = CLOSED.**

**Lo que ya existe, medido:** `daily_reports` (8 columnas, `UNIQUE(model_urn,
report_date)` — la identidad por obra y día ya está decidida en datos);
funciones contractuales derivadas (`ENTIDAD, SUPERVISION, CONTRATISTA,
PROYECTISTA, OTRO`); acuses grow-only (transmittals); numeración por semántica
(`reg.siguiente_codigo`); encargos/BIC con `deudor_de_*` por objeto; frentes
con etiqueta en LOB; fotos como objeto citable (NG-02); motor offline (GAP 07).

---

## A · SEMÁNTICA DE DOMINIO — tres objetos, no uno

La pantalla los junta; la semántica los separa, porque tienen **identidad,
autoridad y ciclo distintos**:

| | PARTE DIARIO | ASIENTO | INSTRUCCIÓN |
|---|---|---|---|
| qué es | la JORNADA: el marco de un día en la obra | un registro individual, tipado, dentro de un parte | un ACTO FORMAL emitido por una parte autorizada |
| identidad | `(obra, fecha_operativa)` — única; la fecha es la DECLARADA de la jornada, no la del reloj UTC del servidor | correlativo POR OBRA, continuo entre días (la esencia del cuaderno: el asiento N.º 217 es el 217 de la obra, no «el 3.º del martes») | numeración propia `IN-###` por obra |
| quién crea | cualquier miembro lo ABRE (el primero del día); un responsable lo CIERRA | cualquier miembro con acceso a la herramienta | SOLO función `SUPERVISION` o `ENTIDAD` (APROBADO, §L) |
| inmutabilidad | CERRADO = congelado; nada entra después | REGISTRADO = inmutable; se corrige con OTRO asiento que lo referencia (rectificación), nunca editando | EMITIDA = inmutable; la corrección es una RECTIFICACIÓN: instrucción nueva con `rectifica_a`, la vieja queda `RECTIFICADA` visible — el mismo patrón supersede≠borrar de los planos |
| evidencia | cita fotos y objetos; no los copia | ídem | ídem + acuse de recibo grow-only (patrón transmittal) |

**Por qué la INSTRUCCIÓN no es un comentario del parte:** puede existir sin
parte (se emite un domingo, sin jornada abierta), obliga a alguien (BIC), exige
acuse, y su autoridad es contractual, no de pantalla. La relación con el parte
es una CITA opcional (asiento tipo `instruccion`), igual que una foto.

**Respuesta explícita a la pregunta del propietario:** una instrucción **NO se
modifica después de emitida**. Una corrección genera una RECTIFICACIÓN — acto
nuevo, numerado, que referencia al anterior; ambos quedan legibles y el
histórico dice quién rectificó qué y cuándo. No es comodidad técnica: es la
misma regla que gobierna revisiones de plano y asientos de cuaderno en papel.

## B · OBJETOS CANÓNICOS

- `doc_partes` — la jornada. `(obra, fecha_operativa)` único — fecha
  declarada, jamás derivada de UTC —, responsable, estado, timestamps de
  servidor (auditoría, no identidad), history append-only.
- `doc_asientos` — el registro. `numero` correlativo por obra, `tipo` del
  catálogo (§F), `parte_id`, contenido estructurado + texto según tipo,
  referencias (§G), estado, autor + SU EMPRESA + SU FUNCIÓN al momento
  (capturadas al registrar: la función se deriva hoy, pero el asiento debe
  decir cuál era ENTONCES), history.
- `doc_instrucciones` — el acto. Emisor (persona+empresa+función), destinatario
  = **persona concreta o empresa concreta de la obra** con snapshot de
  empresa+función (nunca una función desnuda), asunto, contenido, referencias,
  `rectifica_a`, acuses grow-only, estado, history.
- `daily_reports` (legacy, 0 uso real conocido) — **se congela y no se
  hereda**, como `photo_evidences`. Se verificará el conteo real en la pasada
  de implementación antes de declararlo en el doc de cierre.

## C · LIFECYCLE

```
PARTE:        ABIERTO ──cerrar──▶ CERRADO           (cerrado = nada entra;
              (auto-abre el 1er asiento del día)     lo tardío va al parte del
                                                     día en curso, citando)

ASIENTO       REGISTRADO                             (autor con autoridad propia:
(SUPERVISION/                                        SUPERVISION · ENTIDAD ·
ENTIDAD/PROY):                                       PROYECTISTA)

ASIENTO       EN_APROBACION ──▶ APROBADO             (E07. El autor NO gana
(CONTRATISTA/           └─────▶ DEVUELTO             autoridad por crear:
OTRO):                          (inmutable; se       su asiento no es cuaderno
                                 re-registra otro    firme hasta que quien
                                 que lo referencia)  corresponde lo apruebe)

INSTRUCCIÓN:  EMITIDA ──acuse──▶ ACUSADA ──atiende──▶ ATENDIDA ──cierra──▶ CERRADA
                  └────────────── rectificada por otra ──▶ RECTIFICADA
```

## D · ACTORES Y AUTORIDAD (capas existentes, sin motores nuevos)

- Capa 2/3: perímetro de obra + herramienta `cuaderno` (activación capa 16 +
  acceso por miembro capa 08) — herramienta NUEVA en el catálogo.
- Registrar asiento: cualquier miembro con la herramienta.
- **Aprobar/Devolver** asiento de CONTRATISTA/OTRO: SOLO función contractual.
  `FUNCIONES_APROBADORAS_DE_ASIENTO = (SUPERVISION, ENTIDAD)` — `SUPERVISION`
  es el aprobador; `ENTIDAD` es la contingencia, autorizada porque está
  DECLARADA en esa lista, no por privilegio. **Project Admin NO aprueba**:
  administrar la obra no es autoridad contractual (corrección del
  propietario). Si nadie con función aprobadora existe en la obra, el acto se
  bloquea con código explícito (`SIN_APROBADOR_CONTRACTUAL`) — no hay
  fallback administrativo. Nunca el propio autor (misma prohibición
  autor≠aprobador de `doc_reviews`).
- Cerrar el parte: el responsable del parte o admin de obra (acto
  administrativo de jornada, no aprobación contractual — por eso aquí el
  admin sí).
- **Emitir instrucción**: `FUNCIONES_EMISORAS_DE_INSTRUCCION = (SUPERVISION,
  ENTIDAD)` — el espejo de `FUNCIONES_EMISORAS` de planos, declarado como
  dato, no disperso en ifs.
- Acusar/atender instrucción: **su sujeto contractual** — la persona
  destinataria, o un miembro de la empresa destinataria. Jamás «cualquiera
  con la misma función» (corrección del propietario).

## E · BIC (encargos, los mismos)

| estado | la pelota la tiene |
|---|---|
| asiento EN_APROBACION | los miembros con función aprobadora (SUPERVISION; ENTIDAD contingencia). Si no hay ninguno: la deuda aparece como `SIN_APROBADOR_CONTRACTUAL`, visible, no asignada a un admin |
| asiento DEVUELTO | su autor (corregir y re-registrar) |
| parte ABIERTO al final del día | el responsable del parte (cerrar) |
| instrucción EMITIDA | **su sujeto contractual**: la persona destinataria, o los miembros de la empresa destinataria (acusar) |
| instrucción ACUSADA | el mismo sujeto contractual (atender) |
| instrucción ATENDIDA | el emisor (verificar y cerrar) |

El BIC de instrucción se resuelve contra el snapshot del destinatario, nunca
contra «quien hoy tenga esa función» (corrección del propietario).

`deudor_de_asiento` y `deudor_de_instruccion` en `encargos.py`, junto a los
demás — el mismo código que reparte calcula la bandeja.

## F · SECCIONES TIPADAS = TIPOS DE ASIENTO (catálogo cerrado en código)

No hay tabla «secciones» aparte: el parte ES fecha + colección de asientos
tipados; la pantalla agrupa por tipo. Catálogo mínimo profesional (Semantica,
extensible en código — la configurabilidad por cliente es GAP 11 completo, no
esto):

| tipo | estructurado | texto | referencia |
|---|---|---|---|
| `avance` | progresiva, frente, partida (opcionales) | sí | — |
| `personal` | lista {empresa, categoría, cantidad} | opcional | empresa del directorio |
| `equipos` | lista {equipo, cantidad, horas} | opcional | — |
| `materiales` | lista {material, cantidad, unidad, movimiento} | opcional | — |
| `clima` | §F.1 (procedencia obligatoria) | opcional | — |
| `seguridad` | — | sí | issue (opcional) |
| `calidad` | — | sí | acta / issue (opcional) |
| `restriccion` | horas_afectadas | sí | — |
| `visita` | {quien, entidad, motivo} | opcional | — |
| `foto` | — | opcional | **CITA a doc_fotos** (obligatoria) |
| `instruccion` | — | opcional | **CITA a doc_instrucciones** (obligatoria) |
| `rectificacion` | — | sí | asiento rectificado (obligatoria) |
| `nota` | — | sí | — |

CHECK en base con la lista, casado con el código por tripwire (lección N2).

### F.1 · El asiento `clima` (E08) — el dato con su procedencia completa

El clima que consta en un cuaderno puede decidir una ampliación de plazo; por
eso el asiento no guarda «llovió», guarda DE DÓNDE salió que llovió:

- **origen**: `proveedor` o `manual` — obligatorio, sin tercer valor.
- **instante**: `consultado_en` (reloj de SERVIDOR) + la fecha de la jornada a
  la que se refiere; ambos, porque consultar hoy el clima de ayer es legítimo
  y debe notarse.
- **ubicación**: las coordenadas **DE LA OBRA** (configuración de obra o punto
  de referencia del modelo), nunca las del dispositivo — coherente con la
  privacidad GPS de NG-02: la obra tiene ubicación; la persona, no.
- **dato_recibido**: la respuesta CRUDA del proveedor, conservada tal cual.
- **dato**: lo legible {temperatura mín/máx, precipitación, viento, cielo}.
- **corrección manual**: NO reemplaza — se conserva lo recibido Y lo corregido
  `{por, en, valores}`, ambos legibles. Quien corrige firma su corrección; el
  dato del proveedor no desaparece jamás.

Proveedor propuesto: Open-Meteo (sin clave, sin coste — decisión técnica
ordinaria, sustituible sin tocar la semántica: la procedencia guarda cuál
respondió). Sin red: asiento `clima` manual con `origen: manual`, y punto.

## G · RELACIÓN CON FOTOS (NG-02)

**Una foto no se copia al parte: SE CITA por su objeto canónico** — el asiento
tipo `foto` guarda `foto_id`; la galería podrá decir «citada por el asiento
N.º 217» por la misma unión que hoy dice `citada_por: ISS-006`. Cero
duplicación de binarios; el paso 11 de la EXP lo mide.

## H · OFFLINE (motor GAP 07, cuarto y quinto tipo)

| acto | offline | por qué |
|---|---|---|
| abrir parte (borrador) | ✅ `PARTE/CREATE` | la jornada empieza donde no hay señal |
| registrar asiento | ✅ `ASIENTO/CREATE` (con `depende_de` si el parte es local) | es EL acto de campo |
| citar foto persistida / crear foto nueva | ✅ | ya resuelto (NG-02) |
| editar un borrador aún no enviado | ✅ local | todavía no es un acto |
| clima manual | ✅ | con procedencia `manual` |
| **aprobar/devolver asiento** | ❌ SOLO EN LÍNEA | autoridad + revalidación de función al momento — la misma decisión semántica que la firma de protocolos |
| **cerrar parte** | ❌ SOLO EN LÍNEA | es el acto que congela la jornada |
| **emitir instrucción** | ❌ SOLO EN LÍNEA | acto formal con numeración y acuses |
| clima automático | ❌ por naturaleza | consulta a proveedor |

El servidor revalida las siete capas al sincronizar, como siempre; los tipos
nuevos entran en `OBJETOS` **y en `ck_sync_objeto` en la misma pasada**
(lección N2, con su tripwire ya en pie).

## I · INVARIANTES QUE VIVEN EN BASE

1. `UNIQUE (obra, fecha_operativa)` del parte — columna `DATE` declarada por
   el cliente, nunca `created_at::date`.
2. `UNIQUE (obra, numero)` del asiento — correlativo único y creciente
   (asignación con SAVEPOINT+retry como los códigos; sin pretensión de
   «sin huecos» bajo concurrencia, que sería mentirse).
3. Asiento → parte de SU MISMA obra (FK + obra en ambas filas, verificada).
4. CHECK de estados y de tipos (listas cerradas, casadas con el código).
5. Parte CERRADO no admite asientos: candado transaccional (`FOR UPDATE` del
   parte al insertar), el mismo patrón que las actas firmadas.
6. Instrucción: sin ruta de edición de contenido; `rectifica_a` FK a sí misma;
   acuses solo crecen; sin GRANT DELETE (como fotos).
7. `capturado_en` declarado ≠ timestamps de servidor (GAP 07, sin cambios).

## J · ESQUEMA CONCEPTUAL (sin DDL)

```
doc_partes         (obra+fecha_operativa ÚNICO, fecha DECLARADA) responsable
                   · estado · resumen? no: se deriva de los asientos · history
doc_asientos       numero(obra-correlativo) · parte_id · tipo · contenido
                   JSONB (estructura según tipo) · texto · referencias
                   {foto_id | instruccion_id | issue_id | acta_id |
                    asiento_id rectificado} · autor+empresa+funcion DE ENTONCES
                   · estado · history
doc_instrucciones  IN-### · emisor{persona,empresa,funcion} · destinatario
                   {tipo: persona|empresa, snapshot empresa+funcion} · asunto
                   · contenido · referencias · rectifica_a · acuses[] · estado
                   · history
```

## K · EXP FINAL PREVISTA (los 12 pasos, ejecutables por diseño)

1. Crear parte real (obra pirata) — y que el 2.º intento del mismo día choque
   con la identidad única. 2. Asientos de ≥4 tipos con dato estructurado.
3. Asiento `foto` citando una foto REAL de NG-02 (id 154). 4. Asiento de un
   colaborador (función CONTRATISTA → EN_APROBACION). 5. Aprobación con
   identidad DISTINTA (y el autor intentando aprobarse: 403). 6. Negativo:
   identidad sin autoridad emite instrucción → 403 con su código. 7. Instrucción
   real SUPERVISION→CONTRATISTA con acuse. 8. BIC: la bandeja del deudor en
   cada estado. 9. Cerrar el parte; un asiento después del cierre → rechazo.
10. Historial: quién hizo qué, con `origen` si vino de campo. 11. La foto
    citada NO se duplicó (mismo objeto, un solo registro). 12. Ciclo offline:
    abrir parte + 2 asientos + cita de foto sin red → sincronizar → verificar;
    y aprobar/emitir SIN red debe decir claramente que exige conexión.

**Limitación de fixture conocida y declarada desde ya:** los pasos 4–5 exigen
una identidad con función CONTRATISTA en obra pirata (hoy: cero miembros).
Habrá que crear un usuario QA de contratista — fixture legítimo de sandbox — o
declarar el par como no ejecutable, como se hizo con la revocación.

## · CAPACIDAD FUNCIONAL ≠ VALIDEZ REGULATORIA ·

Esto implementa el DOMINIO FUNCIONAL del cuaderno/parte diario. **No se
declara** equivalencia jurídica con el Cuaderno de Obra Digital oficial (el de
la Contraloría) ni sustitución de plataforma estatal alguna, y ninguna pantalla
ni documento lo insinuará, salvo que una investigación normativa específica —
que no existe hoy — lo demuestre. La fila del baseline mide capacidad, no
validez legal.

## L · DECISIONES DE PROPIETARIO — RESUELTAS (27-ago-2026)

1. Emisores de instrucción: `SUPERVISION` y `ENTIDAD` — **✅ APROBADO**.
2. Aprobador del asiento de CONTRATISTA/OTRO: `SUPERVISION` **✅** ·
   fallback Project Admin **❌ RECHAZADO** · contingencia `ENTIDAD` explícita
   (declarada como función autorizada) **✅ permitida**.
3. Identidad del parte: `(obra, fecha_operativa)` único — **✅ APROBADO**;
   el turno, si algún día hace falta, es un atributo del asiento, no otra
   jornada.

---

**ARQ DEFINITION = CLOSED** (con las correcciones del propietario ya
incorporadas arriba) → pasada 2: semántica → suite → migración → schema →
backend → smoke → frontend → EXP.
