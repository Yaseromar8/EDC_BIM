# 73 · P5 · PROJECT MEMBERSHIP UX — CONSTRUIDO Y VERIFICADO EN PRODUCCIÓN

**Fecha:** 22-ago-2026 · **Backend:** `02c4f2c` · **Portal:** chunk
`ParticipantesModule-Bv3NHtyi.js` (`f737e02`) · **Suite:** 950 passed

## El gap que cerró

Doc 55 §P5: «+ flujo *añadir persona a esta obra* (hoy la ruta existe sin
pantalla)». La única forma de incorporar a alguien era el reemplazo-por-lista
del Entity Admin, sin interfaz y sin acto con nombre. Ahora la membresía se
opera **desde la obra y con la autoridad de la obra**.

## Lo construido

| Pieza | Qué hace |
|---|---|
| `GET …/candidatos` | El directorio de incorporación: solo lo incorporable (activos · no miembros ya · sin Entity Admins), y solo para quien pasa `guardia_administrativa`. Los PENDIENTES salen marcados. |
| `POST …/miembros` | Incorporar **de una en una**, auditado (`miembro_incorporado`), idempotente (`ya_estaba`). |
| `DELETE …/miembros/<uid>` | **RETIRAR MEMBRESÍA ≠ RETIRAR IDENTIDAD**: mueren la fila (y con ella `es_admin`, que vive en ella) y las concesiones de carpeta de ESTA obra; la historia no se toca. `ULTIMO_ADMIN_DE_OBRA` protege, con la excepción del Entity Admin. |
| Panel «Añadir persona a esta obra» | La cadena visible: **persona → su empresa (si no tiene) → función de esa empresa aquí (si no está declarada) → membresía → ¿administra?**. Cada eslabón se escribe donde vive; si un paso falla, el aviso dice **cuál**. |
| Fila de persona | Chip PENDIENTE y botón de retirar con la verdad en el diálogo. |

Autoridad: `guardia_administrativa` = Entity Admin **o** administrador de
ESTA obra. Es la figura que en ACC/Procore gestiona el padrón de su
proyecto. **Nada de esto ensancha Entity Admin.**

## EXP — interfaz real, producción, obra de prueba

| Evidencia | Resultado |
|---|---|
| Panel abierto con el padrón real | «No hay nadie incorporable» — **verdad comprobada en base**: id 2 es Entity Admin, id 17 está desactivada, 19 y 22 ya eran miembros |
| Retirar id 19 por el botón × | Diálogo veraz (captura) → «2 personas · 1 empresa» → «1 persona»; asiento `miembro_retirado` |
| Reabrir el panel | id 19 aparece como candidato con su marca «sin empresa» |
| Elegir persona → elegir empresa no declarada aquí | **La cadena se despliega** (captura): aparece «Función de su empresa aquí…» y «administra esta obra» |
| Incorporar | «yaser omar 02 participa en esta obra»; vuelve a la tabla; asiento `miembro_incorporado` |
| Guardias negativas contra producción | Entity Admin → 409 `ENTITY_ADMIN_SIN_MEMBRESIA` · desactivada → 409 `CUENTA_RETIRADA` · repetir → 200 `ya_estaba:true` · retirar a un no-miembro → 404 `NO_ES_MIEMBRO` |
| Estado final | **La obra quedó como estaba**: 19 miembro no-admin sin empresa, 22 administrador. Cadena de auditoría íntegra (cada `hash_anterior` casa con el `hash` previo). |

## Defecto encontrado por la interfaz (y cerrado)

La lista de candidatos se pedía UNA vez al abrir el panel: tras retirar a
alguien seguía diciendo «no hay nadie incorporable» justo de quien acababa
de volverse incorporable, y reincorporarlo exigía recargar la página.
**No lo vio la suite: lo vio la pantalla** — la razón exacta por la que el
propietario exige EXP de interfaz real. Corregido en `f737e02`
(`candidatos === null` significa «hay que repedirla») y fijado con dos
tests de contrato para que no vuelva.

## Estado

```
P5 · PROJECT MEMBERSHIP UX  →  ARQ ✅ · OP ✅ · EXP ✅
```

Anotado, sin bloquear: el panel permite dejar la función contractual sin
declarar (es opcional a propósito — incorporar no debe exigir cerrar antes
la ficha contractual de la empresa); el aviso amarillo de la pantalla ya
señala esa deuda cuando ocurre.
