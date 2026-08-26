# 92 · EL EXPEDIENTE VIVÍA EN DOS ÁRBOLES · UNA SOLA SEMÁNTICA

**Fecha:** 25-ago-2026
**Decisión del propietario:**

```
    CANONICAL TREE   = autoridad para todo proyecto nuevo
    DERIVED TREE     = compatibilidad legacy solamente
```

> A partir de esta corrección, ningún código nuevo deriva el árbol documental
> desde el nombre de la obra.

---

## 1 · LO QUE DE VERDAD PASABA — Y ES MEJOR DE LO QUE PARECÍA

**La decisión ya estaba tomada y escrita.** `project_ref.es_escritura` marca,
para cada obra, cuál de sus alias es su alcance de escritura. Y
`GET /api/projects` **ya devolvía** `scope_escritura` con esa respuesta, con un
comentario que decía literalmente:

> «el navegador NO lo deriva del nombre visible, que es editable y hacía que
> renombrar una obra moviese el alcance de todo lo que se escribiera después».

**Nadie la leía.** Seis sitios del portal deducían la ruta del nombre:

```js
`proyectos/${project.name.replace(/ /g, '_')}`
```

No hacía falta migrar nada. Hacía falta **leer lo que ya estaba decidido**.

---

## 2 · EL INVENTARIO, MEDIDO ANTES DE TOCAR

Las once obras tienen **exactamente un** alias de escritura, y en las once
coincide con dónde vive de verdad su contenido:

| obra | alcance de escritura | tipo | nodos |
|---|---|---|---|
| PQT8_TALARA (`1`) | `proyectos/PQT8_TALARA` | LEGACY_PATH | 118 |
| PQT8_INTERFERENCIAS | `proyectos/PQT8_INTERFERENCIAS` | LEGACY_PATH | 2 481 |
| Proyectos Generales | `proyectos/Proyectos_Generales…` | LEGACY_PATH | 5 |
| HOSPITAL_MATUCANA ×4 | su id canónico | PROJECT | 8 c/u |
| PILOTO EXTERNO 2026 | su id canónico | PROJECT | 11 |
| ZZ PRUEBA VENTANA · obra pirata · Test Project | su id canónico | PROJECT | 8 · 8 · 0 |

Fuera de esos alcances quedaban **15 nodos**, inventariados uno a uno:

- **14 carpetas vacías** — sin ficheros, sin versiones, sin que nada las
  referencie. Ocho son la estructura sembrada de INTERFERENCIAS (cuyo contenido
  real está en su árbol derivado) y seis son raíces vestigiales.
- **1 fichero real** con su versión: `ZZ-PRUEBA-VENTANA-DOC-0001.pdf`.

Y aparte, fuera de la ambigüedad: los alias de tipo **FRONT** (`1_CANAL` 182
ficheros, `1_DRENAJE` 102) son **frentes de obra**, otro concepto; y `global` (8)
es la deuda ya declarada en el docstring de `resolve_project_id`.

---

## 3 · EL RESOLVEDOR ÚNICO

### En el servidor

`db.resolve_project_document_tree(project_id)` — **la vuelta** de
`resolve_project_id`, sobre la **misma tabla** y el **mismo mapa cacheado**. No
hay tabla nueva, ni columna nueva, ni una segunda verdad que mantener al día.

Si una obra tuviera **dos** filas de escritura, se deja fuera y se cae en el
canónico: elegir una por orden de la base sería decidir dónde se escribe según
cómo salgan las filas. El respaldo es **siempre el canónico**, nunca una ruta
derivada.

Ida y vuelta comprobada contra producción en las seis obras con contenido:
`project_id → alcance → project_id` devuelve **siempre la misma obra**.

### En el cliente

`utils/arbolDocumental.js`, y los seis consumidores pasan por él: Explorer,
selector de documentos, RFI/Red Line, fotos y partidas.

**No cae en la ruta derivada ni como último recurso.** Acertaría en las legacy y
fallaría en las nuevas — que es exactamente el reparto que produjo el problema.

---

## 4 · OBRAS NUEVAS

`registrar_obra` **ya** marcaba la escritura en el id canónico y estaba bien:

> «Una obra que nace escribe con su propio id. No tiene historia que partir, así
> que no hay ninguna razón para heredar el alcance derivado del nombre.»

Sigue anotando el alias `LEGACY_PATH` —un alias no es un árbol: sirve para que
una petición antigua siga resolviendo— pero la **marca de escritura** va al
canónico. Añadido el tripwire que lo fija.

---

## 5 · LA RECONCILIACIÓN, CON CORRESPONDENCIA DEMOSTRADA

**Las 14 carpetas vacías no se borran.** Son filas reales, son inalcanzables por
el resolvedor único, y borrar por estética tiene más riesgo que valor.

**El único contenido real se movió**, al árbol efectivo de **su propia obra**:

- los dos alias resuelven a la **misma obra** en `project_ref` — comprobado antes
  de tocar nada;
- el árbol destino **no tenía ningún fichero**, así que no hay colisión de nombre
  ni fusión por nombre;
- el nodo conserva su **id, sus versiones, su SHA-256 y sus permisos**: solo
  cambian `model_urn` y `parent_id`.

Sin moverlo, ese documento quedaba inalcanzable desde la interfaz — pérdida de
acceso, aunque no de datos.

### Conteos antes / después

```
    file_nodes         3 086  →  3 086
    file_versions      2 868  →  2 868
    folder_permissions     4  →      4
    nodos huérfanos        0  →      0
    versiones sin nodo     0  →      0
```

La transacción **aborta y no deja nada** si algo no cuadra.

---

## 6 · INTEGRIDAD

| comprobación | |
|---|---|
| un alias que resuelva a **dos** obras | **0** |
| obras con **dos** alcances de escritura | **ninguna** |
| obras con alcance definido | **11 de 11** |
| nodos huérfanos | 0 |
| versiones sin nodo | 0 |
| revisiones de plano apuntando a la nada | 0 |
| revisiones de especificación apuntando a la nada | 0 |
| el fichero movido | versión y SHA intactos |

---

## 7 · LA EXP · APLICAR PLANTILLA DESDE LA INTERFAZ

Lo que quedó declarado como **no ejecutable** en el doc 91 §8.2, ejecutado.

Conducida en el portal desplegado con QA Revisor Técnico (25), obra
**canonical-only**:

```
    abrir obra          →  Archivos: «Mostrando 6 elementos»
                           (antes de esta corrección: 0)
    abrir árbol         →  02_Planos_Aprobados: «Mostrando 2 elementos»
    seleccionar doc     →  aparece «Enviar a revisión»
    aplicar plantilla   →  «Aprobación de planos EXP · v2 · 3 pasos»
    previsualización    →  1 Revisión técnica — QA Revisor Tecnico · REVISA
                           2 Visto bueno de obra — Piloto Uno · REVISA
                           3 Aprobación — QA Gestor de Submittals · APRUEBA
    iniciar revisión    →  POST /api/reviews → 200
    refrescar           →  RV-009 sigue visible, con sus tres pasos
```

En la base: `plantilla_id=1`, versión **2**, **3 pasos**, `model_urn` =
**el canónico**, y el documento revisado vive en ese mismo árbol. **Una sola
revisión con ese título: sin duplicados.**

Un detalle que costó encontrar: la tabla de archivos está **virtualizada**, y con
el panel del navegador a 75 px de alto renderizaba **cero filas** aunque el
contador dijera 2. No era un fallo del producto — era el tamaño del panel.

---

## 8 · LO QUE **NO** SE PUDO EJECUTAR, DECLARADO

```
    APPLY TEMPLATE UI · obra LEGACY DERIVED-ONLY
    resolución verificada   ✅  (ida y vuelta contra producción)
    UI EXP                  NO EJECUTABLE CON FIXTURE ACTUAL
```

Las identidades de QA pertenecen **solo** a la obra piloto, que es
canonical-only. Ejecutarlo en PQT8_TALARA exigiría darles acceso a una obra con
2 481 documentos reales — fabricar el fixture para poder enseñar la prueba, que
es lo contrario de probar el producto.

Lo que **sí** está verificado para las legacy: el resolvedor devuelve
`proyectos/PQT8_TALARA` para la obra `1`, y esa ruta resuelve de vuelta a la
obra `1`.

---

## 9 · LO QUE NO SE HIZO, A PROPÓSITO

- Migración masiva de las obras legacy.
- Reparent de miles de nodos por estética.
- Cambio general del Explorer más allá de la resolución.
- Retirada del soporte derivado.

El objetivo no era convertirlo todo hoy. Era **una sola semántica de
resolución**, aunque una obra legacy siga almacenada como siempre.

---

## 10 · ESTADO

```
    resolución documental única    ✅
    nuevas obras canonical-only    ✅
    duales reconciliadas           ✅   (1 fichero movido, 14 carpetas vacías declaradas)
    legacy-only compatible         ✅   (resolución verificada; UI EXP no ejecutable)
    Apply Template UI EXP          ✅   (canonical-only)
```

**1314 pruebas en verde** (12 nuevas).

La cola offline de GAP 07 podrá usar ya `project_id + identidad canónica del
recurso + local_id` sin heredar la ambigüedad histórica.
