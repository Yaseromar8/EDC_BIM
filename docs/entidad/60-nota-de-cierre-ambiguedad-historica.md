# NOTA DE CIERRE — AMBIGÜEDAD HISTÓRICA

**Fecha:** 21 de agosto de 2026 · Resuelve la contradicción AMBIGUA ↔ `NULL/TRUE = PENDIENTE`.
**Sin código. Sin producción. Sin ventana. `invitacion_gen` no se reabre.**

---

## VEREDICTO

```
PASS — es la opción A
```

**AMBIGUA es un estado del PROCESO de migración, no del state machine.** Existe
solo *durante* la adjudicación; la migración está diseñada para **no poder
terminar** dejando una sola fila sin adjudicar. Después de M, `activated_at +
is_active` representan todos los estados **sin inferencia**, porque cada
`NULL/TRUE` que sobrevive lo es **por decisión humana registrada**, no por
defecto.

---

## 1 · LA DEMOSTRACIÓN DE A

### El universo es cerrado

- El conjunto AMBIGUA se **computa dentro de la propia migración**, en el
  instante M: `SELECT` de las filas con hash vacío y sin evidencia positiva —
  finito y enumerable (hoy: **2 en producción, 12 en local**, medidas).
- **Después de M no puede nacer ninguna AMBIGUA**: la ambigüedad existía porque
  la entrada Google no dejaba rastro; con G5a (Google registra `login_ok`) y
  G5b (Google escribe `activated_at`), toda entrada posterior a M deja estado.
  Una fila `NULL/TRUE` posterior a M **es** una invitación pendiente, por
  semántica y no por suposición.

### La migración no puede terminar con AMBIGUA en `NULL/TRUE`

El mismo patrón fail-closed que ya gobierna este proyecto (el manifiesto del
bootstrap; la parada ante lo desconocido de la convergencia):

```
la migración exige, como ENTRADA, la adjudicación del Entity Admin:
    una decisión por cada fila del conjunto AMBIGUA computado en M
        → ACTIVADA   (activated_at := created_at, convención de adenda 01 §3)
        → PENDIENTE  (queda NULL/TRUE — decidido, no inferido)

cobertura incompleta  ⇒  ROLLBACK. La transacción entera se deshace.
No existe el camino «termino y las dejo NULL»: la columna y la adjudicación
llegan o no llegan JUNTAS.
```

Quien adjudica es quien invitó — la misma figura de la Enmienda 1 de la
Administration Foundation, con el mismo formato: lista nominal en la evidencia
de la migración, decisión por fila. El **ensayo** de la migración (obligatorio,
como toda migración de este proyecto) incluye la comprobación negativa:
adjudicación incompleta ⇒ la migración aborta y lo dice.

### La prohibición original se respeta

«No convertir automáticamente en PENDIENTE» prohibía la **inferencia**, no la
**decisión**. Tras M, una fila `NULL/TRUE` histórica significa «el Entity Admin
declaró que esta persona no ha entrado» — un acto con autor, no un default.

## 2 · LA REGLA DE ADJUDICACIÓN — «en la duda, PENDIENTE»

Las dos equivocaciones posibles **no son simétricas**, y eso hace la decisión
humana segura por defecto:

| Adjudicación errónea | Consecuencia | ¿Se corrige sola? |
|---|---|---|
| Declarada PENDIENTE, pero había entrado por Google | En su **siguiente** entrada, G5b escribe `activated_at` | **Sí — se autocorrige** |
| Declarada ACTIVADA, pero nunca entró | No puede reclamar (one-shot la bloquea), no puede reset (hash vacío): solo Google la salvaría | **No — puede dejarla fuera** |

Por tanto la guía escrita de la adjudicación es: **evidencia positiva ⇒
ACTIVADA; cualquier duda ⇒ PENDIENTE**. El error barato se cura solo; el caro
no se comete por defecto.

## 3 · QUÉ QUEDA FIJADO

- **Estado del state machine: 4** (PENDIENTE · ACTIVADA · SUSPENDIDA ·
  REVOCADA). **AMBIGUA: 0** después de M — es vocabulario del proceso de
  migración y muere con él. El modelo de dos campos está **completo**.
- La adjudicación es **precondición estructural** de la migración G7 (misma
  transacción, rollback si incompleta), no un paso posterior que pueda
  olvidarse.
- E2E adicional (nº 18): migración con adjudicación incompleta ⇒ aborta;
  con cobertura total ⇒ cero filas sin clasificar y los cuatro estados derivan
  limpios.

---

```
DISEÑO IDENTITY & ACCESS UX — CERRADO
```

**STOP.**
