# 83 · GAP 01 · SUBMITTALS

**Fecha:** 25-ago-2026 · **Suite:** 1110 (antes 1077) · **Commit:** `302b2c7`
**Fase III** — primer gap del camino mínimo a paridad funcional (doc 82 §8).

---

# 1 · BENCHMARK

Del doc 82 §4.1, congelado el 24-ago-2026. Lo que los dos fabricantes exigen:

| capacidad | Forma Build | Procore |
|---|---|---|
| Papeles | Responsible Contractor · Submittal Manager · Reviewers | Submitter · Approver(s) |
| Flujo | crear+asignar → enviar → distribuir → respuestas → cerrar y distribuir | secuencial **o paralelo** |
| Ball-in-Court | explícito | explícito |
| Plazos | días naturales/hábiles desde el cronograma | due date por paso |
| Agrupación | Spec Sections + Packages | Packages |
| Revisiones | sí | sí, con historial |
| Estados | respuestas personalizables | por defecto + custom |
| Permisos | por herramienta | 4 niveles + granulares |

# 2 · DELTA

**No existía nada.** Ni tabla, ni ruta, ni pantalla. Era el ❌ de mayor valor
contractual del núcleo común: el acto por el que un contratista somete un
material a aprobación **antes de instalarlo**.

# 3 · LO IMPLEMENTADO

## 3.1 · La distinción que gobierna el diseño

    REVIEW      aprueba UN DOCUMENTO del expediente → le cambia el estado ISO
    SUBMITTAL   aprueba UN PRODUCTO que se va a instalar → sus adjuntos son
                la PRUEBA (ficha técnica, certificado, plano de taller),
                no el objeto

Por eso un submittal rechazado no deja el documento en un estado peor: deja
el **producto fuera de la obra** hasta que se reenvíe otra revisión.

## 3.2 · La regla que gobierna el objeto entero

```
quien_dicta_veredicto = ()
```

**Ninguna posición del registro dicta el veredicto.** Lo dictan los revisores,
paso a paso. En el RFI y el Red Line lo dicta el RESPONSABLE; aquí no lo dicta
nadie desde fuera del flujo — y el ADMIN tampoco, aunque sí pueda *rescatar* un
flujo atascado (distribuir, cerrar, anular).

Si el ADMIN estuviera en esa tupla, un administrador podría aprobar la
instalación de un material sin que ningún técnico lo hubiera mirado, y la
revisión técnica sería un trámite. Es `WORKFLOW AUTHORIZATION ≠ RESPONSIBILITY`
aplicado a un objeto nuevo.

## 3.3 · Reutilización, sin clonar

| qué | de dónde | líneas nuevas |
|---|---|---|
| numeración por obra, identidad, posiciones, transiciones, historial | `flujo_de_registro` | 0 |
| quién revisa este paso, plazo del turno, independencia, flujo bloqueado | `flujo_de_revision` | 0 |
| la pelota | `encargos` (tipo nuevo) | ~90 |

**Cero líneas copiadas de `routes/reviews.py`.** Los pasos de un submittal son
la misma estructura que los de una revisión —y por eso los resuelve el mismo
módulo—: si se resolvieran aparte acabarían discrepando sobre a quién le toca,
que es el defecto que `flujo_de_revision` existe para impedir.

## 3.4 · Una sola función para las dos mitades de la conciliación

`deudor_de_submittal(cur, fila)` la llaman **las dos**: `_sigue_debiendose` y
`_faltantes`. La conciliación del RFI osciló en su día porque usaban criterios
*parecidos* pero distintos —una reabría lo que la otra declaraba sobrante—, y
ese error no se repite. Hay una prueba que lo comprueba en el código fuente.

La pelota, estado por estado:

```
Borrador      NADIE   es el banco de trabajo del contratista, no una deuda
Enviado       MANAGER tiene que distribuirlo a revisión
En revisión   REVISOR del paso actual
Respondido    MANAGER tiene que cerrarlo y distribuir el veredicto
Cerrado       nadie
Anulado       nadie
```

## 3.5 · Piezas

| fichero | qué |
|---|---|
| `flujo_de_submittal.py` | semántica declarada como dato: 6 estados, 5 veredictos, transiciones |
| `sql/13_gap01_submittals.sql` | `doc_submittals` + 8 restricciones + amplía `ck_encargos_tipo` + siembra la herramienta |
| `routes/submittals.py` | 11 rutas |
| `SubmittalsModule.jsx` | pantalla: cadena de revisión, turno señalado, panel de veredicto |
| `encargos.py` · `herramientas_de_obra.py` · `perimetro_de_obra.py` · `flujo_de_registro.py` | extensiones quirúrgicas a los catálogos cerrados |

# 4 · DEFECTOS ENCONTRADOS

Ninguno por la suite anterior; los dos antes de desplegar.

**1 · `doc_submittals` no estaba en `perimetro_de_obra.RECURSOS`.**
`obra_del_recurso` **lanza `ValueError`** si la tabla no está declarada — no
devuelve `None`. Las seis rutas sobre un recurso habrían respondido **500**,
que es peor que un 403 porque no dice nada y parece una caída. Corregido, y
además se añadió un tripwire **genérico** que barre TODOS los manejadores: uno
específico de submittals habría dejado el siguiente gap expuesto igual.

**2 · El blueprint quedó registrado en el perfil `completo`, no en `portal`.**
La pantalla vive en `frontend-docs`, que es justo lo que sirve el portal:
habría quedado llamando a rutas que su propio backend no monta. Lo cazó
`test_el_portal_no_pierde_ninguna_llamada`.

**Y una ironía útil:** dos tests usaban `'SUBMITTAL'` como ejemplo canónico de
«tipo que no sabemos cotejar». Ahora ese ejemplo es `'PUNCH'`, con una aserción
(`assert 'PUNCH' not in enc.TIPOS`) que impide que vuelva a quedarse obsoleto
en silencio cuando se implemente GAP 04.

# 5 · EVIDENCIA

## 5.1 · Ensayo contra PostgreSQL 18 real

Un doble de cursor no puede probar que un CHECK **dispara**. Se levantó el
clúster desechable del repo (`cluster.sh`, puerto 5455) y se ejecutó la
migración tal cual:

```
LAS RESTRICCIONES DISPARAN
  cerrar sin veredicto ................ rechazado (23514)
  estado fuera del catálogo ........... rechazado (23514)
  veredicto fuera del catálogo ........ rechazado (23514)
  autor que no existe ................. rechazado (23503)
  código+revisión duplicados .......... rechazado (23505)

EL CAMINO COMPLETO
  Borrador → Enviado → En revisión → Respondido → Cerrado

LA REVISIÓN ES OTRA FILA; EL RECHAZO SOBREVIVE
  SUB-001 rev.0  Cerrado    Rechazado
  SUB-001 rev.1  Borrador   —

EL ENCARGO DE SUBMITTAL YA CABE
  encargo SUBMITTAL creado
  tipo PUNCH ......................... rechazado (23514)

IDEMPOTENTE: re-ejecutada, 0 filas perdidas, herramienta no duplicada
```

El clúster se destruyó al terminar. No tocó ni un dato real.

## 5.2 · Migración en PRODUCCIÓN — 25-ago-2026

Ejecutada como **`ecd_migrator`** (nunca `ecd_app`, nunca `postgres`):

```
conectado como ecd_migrator en postgres
doc_submittals antes: NO EXISTE

*** MIGRACION 13 EJECUTADA EN PRODUCCION ***

doc_submittals: 0 filas
ck_encargos_tipo -> CHECK (objeto_tipo = ANY (ARRAY['REVIEW','RFI','REDLINE',
                                                    'TRANSMITTAL','SUBMITTAL']))
obras: 11  |  con la herramienta sembrada: 11
propietario de la tabla: ecd_migrator

restricciones:
  ck_submittals_cierre_con_veredicto · ck_submittals_estado
  ck_submittals_veredicto · doc_submittals_pkey · fk_submittals_autor
  fk_submittals_project · fk_submittals_responsable · fk_submittals_revision_de
```

Y los privilegios del rol de ejecución, **sin GRANT manual** — los
`ALTER DEFAULT PRIVILEGES` del modelo de tres roles hicieron su trabajo:

```
doc_submittals   ecd_app -> DELETE, INSERT, SELECT, UPDATE
secuencia        ecd_app -> USAGE
```

La separación `APP AUTHORIZATION ≠ INFRASTRUCTURE PRIVILEGE` sigue viva: la
tabla la posee el migrador, y la aplicación solo tiene DML.

# 6 · VEREDICTO

| plano | estado |
|---|---|
| **ARQ** | ✅ semántica declarada, separaciones intactas, reutilización sin clonar |
| **OP** | ✅ suite 1110; migración en producción; restricciones probadas contra PostgreSQL real |
| **EXP** | ⏳ **pendiente del despliegue manual del backend** |

**Clasificación contra el benchmark:** *(provisional hasta la EXP)*

| capacidad del benchmark | ALEPHIA |
|---|---|
| Papeles (contratista · manager · revisores) | **PARIDAD** |
| Flujo con distribución y cierre | **PARIDAD** |
| Ball-in-Court | **PARIDAD** |
| Plazos por paso | **PARIDAD** |
| Revisiones | **EQUIVALENCIA POR OTRO DISEÑO** — fila nueva, no reapertura: el rechazo sobrevive |
| Spec sections | **PARCIAL** — texto hoy; clave foránea cuando exista GAP 05 |
| Packages | **PARIDAD** |
| Estados y respuestas | **DIFERENCIA DELIBERADA** — catálogo **cerrado**. Los dos fabricantes permiten respuestas por obra; un veredicto que cada obra reescribe hace que «aprobado» signifique cosas distintas en dos obras de la misma entidad |
| Flujo paralelo (Procore) | **AUSENTE** — solo secuencial. No se ha necesitado todavía |
| Generar desde la especificación | **AUSENTE** — depende de GAP 05 |
| Permisos por nivel | **EQUIVALENCIA POR OTRO DISEÑO** — capas 16/08/09 + posiciones del flujo |

# 7 · LO QUE FALTA PARA CERRAR

1. **Despliegue manual del backend** (acto del propietario).
2. **EXP en producción**: crear un submittal real, enviarlo, distribuirlo,
   responder desde la cuenta del revisor, cerrarlo, y comprobar en base que
   la pelota viaja y que el registro queda íntegro.
3. Comprobación negativa en vivo: que **el autor no puede figurar como
   revisor de su propio submittal** y que **nadie dicta el veredicto desde
   fuera del paso**.

**No se recalcula la cobertura** hasta que GAP 01 cierre con su EXP.

---

*Sin porcentajes nuevos. Sin tocar capas DEFER. Sin abrir ninguna de las
decisiones ⚪ del doc 82 §7.*
