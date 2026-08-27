# 97 · NG-03 · CUADERNO DE OBRA — veredicto

**Fecha:** 27-ago-2026 · **Backend:** `daaccf8` + migración 25 ·
**Suite:** 1516 en verde · **Obra de EXP:** obra pirata (sandbox) ·
**Definición previa:** doc 96, ARQ DEFINITION CLOSED con las correcciones del
propietario incorporadas.

---

## 1 · LO QUE SE CONSTRUYÓ

Tres objetos, no uno. El **PARTE** con identidad `(obra, fecha_operativa)` —
la fecha DECLARADA de la jornada, jamás `created_at` UTC — que se ABRE, junta
asientos y se CIERRA en congelado. El **ASIENTO** con correlativo POR OBRA
continuo entre días, tipado contra un catálogo cerrado de 13 tipos casado en
código, base y pantalla por tripwire, inmutable desde que se registra: se
corrige RE-REGISTRANDO otro que lo referencia. La **INSTRUCCIÓN** como acto
formal numerado (`IN-###`), inmutable al emitirse, con acuse grow-only
(patrón transmittal) y corrección por RECTIFICACIÓN que deja a la anterior
visible.

**Las correcciones del propietario, encarnadas y demostradas:**
`puede_aprobar_asiento` ni siquiera acepta un parámetro administrativo — la
firma de la función es la regla; el destinatario de una instrucción es un
SUJETO contractual (persona o empresa concretas, snapshot congelado al
emitir) y `encargos` aprendió `destino_empresa` para que el BIC lo siga a ÉL;
la autoridad de emisión vive también en la base
(`ck_instrucciones_emisor_funcion`).

Cuarta y quinta vertical del motor de campo: `PARTE/CREATE` y
`ASIENTO/CREATE` sincronizan (caso A, misma semántica que la ruta en línea,
casada por tripwire); **aprobar, devolver, cerrar la jornada y emitir
instrucciones EXIGEN conexión a propósito** (doc 96 §H) y la pantalla lo dice
con esas palabras. Clima E08 con procedencia completa: coordenadas DE LA
OBRA (`doc_obra_ubicacion`, nunca el dispositivo), instante de servidor,
respuesta cruda conservada y corrección manual que no borra lo recibido.

## 2 · EXP CONTRA PRODUCCIÓN — con DOS identidades reales

La 1ª **invitación externa real** del sistema creó la identidad
`QA Supervisor` (u27, INTERFERENCIAS=SUPERVISION en el directorio declarado
de la obra sandbox); el propietario ejecutó sus actos EN LA PANTALLA y el
resto corrió por sesión.

**Smoke en línea (15 pasos):** identidad única del parte (2.º intento → 409
`PARTE_YA_EXISTE`) · fecha futura → 400 · asiento de actor sin función →
`EN_APROBACION` (fail-closed) · **autor no se aprueba → 403** · **admin no
emite → 403 `SIN_AUTORIDAD_DE_EMISION`** · clima sin ubicación → 409 con su
código · ubicación fijada por admin (config, no acto contractual) · cita a
foto real · cita a foto inexistente → 404 · cierre → asiento tardío → 409
`PARTE_CERRADO`.

**Ciclo de aprobación (E07), identidades DISTINTAS:** los asientos del
«colaborador» (u19, función None) nacieron EN_APROBACION; la SUPERVISION
(u27) **APROBÓ el N.º 4 y DEVOLVIÓ el N.º 5 con motivo**; el autor
re-registró el N.º 8 citando al devuelto — que quedó inmutable — y la
SUPERVISION lo aprobó. El asiento propio de la SUPERVISION (N.º 7) nació
REGISTRADO: autoridad propia, sin pasar por nadie.

**Los negativos de las correcciones, en vivo:** el admin intentó acusar una
instrucción ajena → **403 `NO_DESTINATARIO`**; su bandeja de la obra:
**vacía** — la deuda de aprobar es de la FUNCIÓN y la de acusar es del
SUJETO del snapshot; al poder administrativo no le llega ninguna.

**Instrucciones:** IN-001/003 a persona (u22) e IN-002 a EMPRESA (SINOHYDRO,
encargo `destino_empresa=1`); IN-004 recorrió el ciclo entero por pantalla:
`emitida → acusada → atendida → cerrada`, acuse con identidad (`por_id`),
atención con nota, y los tres encargos del ciclo abriéndose y cerrándose en
cadena por quien tocaba.

**Ciclo offline real (el dueño, Wi-Fi apagado):** abrió el parte del 25-ago
y registró asientos sin cobertura → al volver la red, la cola entró sola:
parte con `origen: campo sin cobertura`, asiento N.º 9 REGISTRADO (función
SUPERVISION, autoridad propia también desde campo), `capturado_en`
declarado. **Tres `PARTE/CREATE` APLICADAS y UN solo parte**: la
idempotencia por identidad absorbió los reintentos de la cola. Emitir sin
red: la pantalla frena con «exige conexión».

**BIC:** bandeja de la SUPERVISION con sus deudas por función; deudas de
sujetos sin sesión (u22, SINOHYDRO) abiertas y VISIBLES — nunca adjudicadas
a un admin.

**Evidencia de no-duplicación:** la foto 154 citada por dos asientos;
`doc_fotos` sigue con las mismas 3 filas. Historial: quién hizo qué, con
función y motivo.

## 3 · LO QUE LA EXP DESTAPÓ (corregido con tripwire, o declarado)

| # | hallazgo | resolución |
|---|---|---|
| C1 | **sin red, el selector de citas quedaba vacío y la pantalla dejaba encolar un asiento `foto` SIN referencia** — el servidor lo rechazaba (`SIN_REFERENCIA`), pero el acto inválido no debió salir del dispositivo (clase F4) | guardia en el borde (espejo del servidor) + la galería viaja en la precarga · `daaccf8` |
| C2 | **el «sin DELETE» de las migraciones era texto**: los privilegios POR DEFECTO del migrador (`arwd`) regalaban DELETE a `ecd_app` en toda tabla nueva — cazado por el ENSAYO de la migración 25 | REVOKE explícito en las 4 tablas del cuaderno **y en doc_fotos/doc_albumes** (NG-02 lo declaraba sin tenerlo); barrido del resto → tarea aparte |
| C3 | **el clima decía «proveedor no responde» solo en producción** — y el 502 mudo obligaba a adivinar. Con el detalle upstream en la respuesta (`998db38`) la causa real cantó: **429 Too Many Requests** — Open-Meteo agota la cuota de la IP COMPARTIDA de Render (todos los tenants free salen por las mismas IPs), persistente en reintentos espaciados | diagnóstico visible + UA identificado; el automático queda degradado con honestidad (E08 🟡, §5) |
| C4 | **el correo de producción no envía** (invitación `avisado:false`, reseteo que nunca llegó) — el flujo degradó con gracia (enlace copiable) pero el aviso de encargos tampoco estará saliendo | declarado; reparación fuera del frente (env de mailer en Render) |
| C5 | **el formulario de registro no pide EMPRESA y no existe ruta para fijarla después** — u23/24/25 ya exhibían el patrón; sin empresa no hay función y el invitado nace sin poder contractual | fixture corregido a mano (cuenta QA con cero actividad, declarado); ruta de producto → residual |

## 4 · CAMBIOS EN LAS 143 FILAS DEL BASELINE

| fila | antes | ahora | evidencia |
|---|---|---|---|
| E05 · parte diario | 🟡 (esqueleto) | ✅ | parte real con identidad única, cierre congelado, EXP en línea y offline |
| E06 · secciones tipadas | ❌ | ✅ | 13 tipos, catálogo cerrado casado código/base/pantalla, dato estructurado + texto + referencia |
| E07 · aprobación de entradas del colaborador | ❌ | ✅ | EN_APROBACION→APROBADO/DEVUELTO con identidad DISTINTA real; autor≠aprobador; admin excluido |
| E08 · clima automático | ❌ | 🟡 | procedencia completa y clima MANUAL probados en EXP; el AUTOMÁTICO construido pero degradado (429 del proveedor a la IP compartida, C3). Destino: DEPTH RESIDUAL |
| C12 · registro de instrucciones | ❌ | ✅ | IN-### inmutable, acuse grow-only, ciclo completo por pantalla, RECTIFICACIÓN visible |

E05 es del núcleo común; E06/E07/E08/C12 son del catálogo Procore. Los
porcentajes los calcula la página, no este documento.

## 5 · PARCIALES Y RESIDUALES REALES

- **E08 🟡 · DEPTH RESIDUAL**: el asiento clima con procedencia manual quedó
  probado en EXP (asiento N.º 10, parte del 25-ago); el automático está
  construido y degrada con honestidad (502 + código + detalle + la vía manual
  intacta), pero no se demostró end-to-end: Open-Meteo responde 429 a la IP
  compartida de Render, persistente en reintentos. Residual: proveedor
  alternativo con UA identificado (p. ej. met.no) o clave dedicada.
- Acuse por tercero sin sesión (IN-001/002/003): deudas abiertas y visibles;
  ejecutarlas exige más identidades con sesión — mismo límite de fixture del
  programa, declarado.
- `APROBADOR_NO_CONTRACTUAL` (actor con función no aprobadora sobre asiento
  ajeno): cubierto por suite; en EXP la combinación exacta no existía.
- Conducción UI pendiente de: selector de destinatario-persona limitado a
  miembros (correcto) que impide elegir al Entity Admin no-miembro
  (declarado); crash puntual del explorador de documentos reportado por el
  dueño durante la ronda (no reproducible en el panel; sin detalle técnico
  aún) — vigilar.
- `daily_reports` legacy: **1 fila de prueba** (contenido basura de marzo);
  congelada, sin herencia y sin purga.

## 6 · VEREDICTO

**NG-03 · CUADERNO DE OBRA — ARQ ✅ · OP ✅ · EXP ✅ → COMPLETE**, con E08 en
🟡 declarado (manual probado; automático degradado por cuota del proveedor —
DEPTH RESIDUAL). Capacidad funcional; **sin declaración de equivalencia
regulatoria** con el Cuaderno de Obra Digital oficial (doc 96).

**Siguiente frente: NG-04 · avance desde campo.**
