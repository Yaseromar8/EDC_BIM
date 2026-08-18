# Decisión: qué hacemos con el espacio `global` (N72)

**Fecha:** 17-ago-2026 · **Estado:** medido en local; pendiente de confirmar en producción
**Bloquea:** encender `ENFORCE_PROJECT_AUTHZ`, y con ello cerrar **C8**.

---

## Resumen

Lo que empezó como *«hay que migrar o declarar 4.440 filas huérfanas»* terminó, al
medirlo, en algo mucho más simple: **es una copia sobrante de datos que ya viven,
íntegros, bajo su frente real — y que además nadie puede leer.**

No hay nada que atribuir. Y donde no hay atribución, no hay riesgo de atribuir mal.

---

## Lo que se midió, y en qué orden

**1. Cuántas obras hay activas.** Es lo que decide si `'global'` resuelve, porque
`resolve_project_id('global')` devuelve la obra por defecto **sólo si hay exactamente
una activa**. En la base local hay **tres**: `PQT8_TALARA`, `PQT8_INTERFERENCIAS` y una
llamada **`obra pirata`**. Con tres, `'global'` **ya no resuelve hoy**.

> Eso cambia el diagnóstico: N72 no era deuda futura. Ya está pasando.

**2. Quién escribe ahí.** Nadie. `normalize_scope` rechaza `'global'` con un error
explícito, y las cinco rutas de escritura de LOB pasan por él vía `_scope_context`.
La deuda no crece.

**3. Quién lee de ahí.** Tampoco nadie. Las tres rutas de lectura de LOB
(`/api/lob/timeline`, `/datasets`, `/links`) rechazan igualmente ese scope. **Esas
filas son inalcanzables por cualquier vía de la API.**

**4. Qué son esas filas.** Aquí estaba la respuesta. Los recuentos coinciden
exactamente bajo tres scopes:

| tabla | `global` | `1_CANAL` | `1_DRENAJE` |
|---|---|---|---|
| `lob_activities` | 2.189 | 2.189 | 2.189 |
| `lob_partidas` | 1.505 | 1.505 | 1.505 |
| `lob_avance` | 719 | 719 | 719 |
| `lob_frentes` | 23 | 23 | 23 |

Y contar igual no es ser igual, así que se comparó el **contenido**:

```
filas de global que NO están idénticas en 1_CANAL   : 0
filas de global que NO están idénticas en 1_DRENAJE : 0
```

**Cero.** Es una copia exacta.

---

## Qué hacer

### Recomendación: **borrar la copia sobrante**

No es una migración. No hay que decidir a qué obra pertenece cada fila, porque cada
fila **ya está** bajo su frente. Se borra lo que sobra y `'global'` deja de existir
como valor de obra en esas tablas.

Esto evita de raíz el problema que paró a `backfill_obra.documentos()` — *«un dato sin
obra es preferible a un dato en la obra equivocada»* —: aquí no se atribuye nada.

**Condiciones, innegociables:**

1. **Confirmar primero contra producción.** Los números de arriba son de la base
   local, que **no es** producción. El instrumento imprime el mismo veredicto:

   ```bash
   cd backend && python herramientas/inventario_del_espacio_global.py
   ```

   Sólo lee, sólo cuenta, nunca imprime contenido. Credenciales por entorno.

2. **Copia de seguridad antes de borrar.** No porque se espere perder algo, sino
   porque un borrado sin copia no se puede deshacer y esto es un expediente de obra
   pública.

3. **Guardar el informe como evidencia** de que lo borrado estaba duplicado. Sin él,
   dentro de un año nadie podrá distinguir «se borró una copia» de «se perdieron
   4.400 filas».

4. **Si el veredicto en producción NO dice «copia exacta»**, se para. Habría filas
   únicas y volvemos a la decisión de migrar o declarar, con sus números.

### Lo que queda fuera de esta decisión

- **`inventory_assets`: 4.124 filas sin obra declarada** (`project_id` vacío). Es un
  problema hermano y **distinto** — ahí no hay copia bajo otro scope, hay ausencia.
  Merece su propia decisión y su propia medida.
- **La obra `obra pirata`, activa.** No es un problema técnico, pero una obra activa
  con ese nombre en el ECD de una obra pública es lo primero que mira un auditor. Y
  cuenta para el recuento de obras activas, que es lo que rompe la resolución de
  `'global'`. Conviene revisar qué es y archivarla si no es trabajo real.

---

## Lo que este documento NO afirma

- No afirma que en producción sea también una copia: eso lo dirá el instrumento.
- No afirma que `'global'` sea inseguro: afirma que **no está bajo el control por
  obra** y que, hoy, con tres obras activas, **no resuelve**.
- No propone tocar `file_nodes`. Ahí `model_urn` guarda el scope del frente, no el id
  de la obra, y escribir el id dejaría esas filas incompatibles con sus hermanas.
