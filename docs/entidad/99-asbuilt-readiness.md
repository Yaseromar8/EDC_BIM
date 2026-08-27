# 99 · SUBFRENTE · AS-BUILT READINESS — proyección read-only

**Fecha:** 27-ago-2026 · **Naturaleza:** proyección de SOLO LECTURA sobre
objetos canónicos existentes. Cero mutaciones: nada se cerró, aprobó, migró
ni reconfiguró. **CURRENT FRONT sigue siendo NG-04** — este subfrente no toca
su secuencia ni el baseline de 143 (no es una fila; es una vista).
**Entregable:** página ejecutiva con datos reales de producción
(artifact `79add536…`, regenerable).

---

## A · QUÉ ES EL READINESS (y qué no)

**ESTADO DE PREPARACIÓN AS-BUILT** = ¿cuán lejos está el expediente de poder
ensamblarse como paquete de entrega? Se responde MIDIENDO los objetos que ya
existen, no declarando nada. Explícitamente NO es: un «AS-BUILT COMPLETO», un
% contractual, el paquete de NG-11, ni un workflow nuevo. La página lo dice en
su cabecera con un aviso fijo.

## B · OBJETOS QUE LO ALIMENTAN (inspeccionados, con su fiabilidad)

| fuente | qué aporta | fiabilidad medida |
|---|---|---|
| `file_nodes` | estado documental (WIP/SHARED/PUBLISHED), `codigo_idoneidad`, `nomenclatura_ok`, por frente (`model_urn` vía `project_ref.alias`) | ✅ 370 ficheros reales en obra 1 |
| `plan_entregas` | el COMPROMISO (identificador ISO, disciplina, hito, `file_node_id` nulo hasta vincular) → «faltantes» | ⚠️ **0 filas en producción** — la tabla existe y la importación está probada (fase MIDP), pero el plan real no está cargado: el dominio se declara NO MEDIBLE, no se inventa |
| `doc_rfis` | consultas técnicas abiertas/resueltas | ✅ 25 reales (19 resueltas, 6 abiertas) |
| `doc_redlines` | modificaciones propuestas y su desenlace | ✅ 33/33 cerradas |
| `transmittals.acuses` | emisiones sin acuse | ✅ 1 emisión, 0 acuses |
| `doc_planos/…revisiones`, `doc_spec_*`, `doc_submittals`, `doc_issues`, `doc_actas` | registros estructurados | ✅ tablas fiables; **sin uso en obra 1** (el uso real vive en el piloto externo: 2/3/5/10) → NO APLICA, no cero-castigo |

## C · REGLAS DE ESTADO (las que NG-11 heredará)

- **LISTO** — todo lo exigible del dominio está en su estado terminal
  (ej.: Red Lines 33/33 cerradas).
- **CON PENDIENTES** — trabajo PROPIO en curso: publicar, codificar idoneidad,
  validar nomenclatura, acusar.
- **BLOQUEADO / NO MEDIBLE** — falta un acto de OTRA parte (RFI abierto) o un
  INSUMO (TIDP sin cargar). El semáforo siempre nombra el objeto.
- **NO APLICA** — la obra no usa esa herramienta hoy; se dice, no se castiga.

**Sin índice global**: no existe un «% de readiness» compuesto. Cada dominio
muestra su métrica; un índice solo entrará el día que tenga fórmula explícita
y pesos justificados, y se llamará readiness, jamás % de As-Built.

## D · BLOQUEADORES DETECTABLES (catálogo v1)

RFI abierto (código+título+responsable+fecha) · transmittal sin acuse ·
TIDP no cargado (insumo) · documento comprometido sin vincular (cuando el TIDP
exista) · documento sin estado publicado · sin código de idoneidad ·
nomenclatura sin validar · plano sin revisión vigente · submittal sin
veredicto · issue sin verificar · acta sin firmar — los seis últimos quedan
definidos y se activarán en cuanto la obra use esos registros.

## E · DISEÑO DE LA VISTA

Página sobria formato informe (una columna, 900 px): cabecera con obra +
instante de medición + aviso «no es % contractual» → 4 contadores de estado →
**lectura ejecutiva** (4 frases duras) → tabla de dominios
(medida/estado/qué falta) → **bloqueadores con nombre** (objeto real,
drill-down por código) → documentos por frente → método (qué mide/qué no/
reglas/fuentes). Identidad ALEPHIA (navy/ink/mist + chips semánticos del
producto), claro/oscuro por tokens, cero decoración.

## F · QUÉ SALIÓ CON DATOS REALES HOY (evidencia)

Medido contra producción el 27-ago-2026 (solo lectura):

- **370 documentos** del expediente técnico: **0 publicados, 0 con idoneidad**,
  369 WIP + 1 compartido; nomenclatura verificada solo en TALARA (81/86);
  CANAL 182 y DRENAJE 102 sin pasar el validador. INTERFERENCIAS: 2.478
  ficheros multimedia, contados aparte.
- **RFIs: 6 abiertos desde abril–mayo** (RFI-009/014/019/023/024/025, todos
  en manos de la misma responsable-texto legacy) — bloqueadores nominales.
- **Red Lines: 33/33 cerradas** → único dominio LISTO.
- **TR-001 «REVISO02»** sin acuse.
- **TIDP: 0 compromisos cargados** → «qué falta» NO MEDIBLE; primer paso de
  cualquier cierre: importar el plan con la herramienta existente.
- Resumen: 1 LISTO · 4 CON PENDIENTES · 2 BLOQUEADO/NO MEDIBLE · 4 NO APLICA.

## G · QUÉ QUEDA PARA NG-11 (y qué hereda)

NG-11 **hereda tal cual**: estas reglas de estado, este catálogo de
bloqueadores, estas fuentes y esta trazabilidad por objeto. **Añade encima**
(y solo entonces): ensamblado del paquete, inclusión de RFIs/submittals/
issues CERRADOS como parte del expediente final, exportación verificable
(índice + hashes, sobre `indice_expediente` ya existente) y el acto formal de
entrega. Nada de esa segunda capa se construyó hoy.

**Generador:** `genera_readiness.py` + `mide_readiness*.py` (scratchpad) —
consultas de solo lectura; la página se regenera contra el estado vigente
cuando se quiera. Si el dueño la quiere DENTRO del portal como pantalla viva,
eso es una pasada aparte (ruta read-only + módulo), no esta.
