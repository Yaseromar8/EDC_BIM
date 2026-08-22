# AUDITORÍA READ-ONLY · LAS 4461 FILAS `global`

**22-ago-2026, bloque de estabilización. No se migró ni borró nada.**

**Veredicto: NO es un riesgo para el piloto. Es deuda histórica acotada y, en su
inmensa mayoría, DUPLICADA — no información única en peligro.**

---

# 1 · DISTRIBUCIÓN EXACTA (76 columnas de alcance barridas; suma = 4461)

| Tabla | Columna | Filas | % | Qué es |
|---|---|---:|---:|---|
| `lob_activities` | model_urn | 2189 | 49,1 % | actividades 4D |
| `lob_partidas` | model_urn | 1505 | 33,7 % | partidas 4D |
| `lob_avance` | model_urn | 719 | 16,1 % | avance 4D |
| `lob_frentes` | model_urn | 23 | 0,5 % | frentes 4D |
| `file_nodes` | model_urn | 11 | 0,2 % | 2 carpetas raíz + 1 carpeta + 8 fotos |
| `activity_log` | model_urn | 10 | 0,2 % | 10 `upload_file` del 4-jul-2026 |
| `tracking_pins` | model_urn | 3 | 0,1 % | 2 maquinaria + 1 restricciones |
| `lob_config` | model_urn | 1 | — | 1 fila de configuración 4D |

**El 99,4 % (4436 filas) pertenece al subsistema 4D/LOB.** Las otras 25 son
documentos, rastro y pines.

# 2 · EL HALLAZGO QUE CAMBIA LA LECTURA: ES UNA COPIA, NO UN HUÉRFANO

Los datos 4D bajo `global` **existen ya, idénticos, bajo los alcances reales**:

```
                   1_CANAL   1_DRENAJE   global
lob_frentes             23          23       23   ← INTERSECT: 23 de 23 iguales
lob_activities        2189        2189     2189
lob_partidas          1505        1505     1505
lob_avance             719         719      719
```

Comprobado con `INTERSECT` sobre (frente, cod_base): **23/23 coinciden con
`1_CANAL` y 23/23 con `1_DRENAJE`**. Es decir: `global` es un tercer ejemplar del
mismo conjunto, escrito cuando el 4D aún no separaba frentes. **Nada se pierde si
esas filas nunca se migran** — su información vive en los alcances resolubles.

Y las 8 fotos: **todas tienen copia fuera de `global`** (columna `copias_fuera` ≥ 1).

# 3 · ¿SIGUE GENERÁNDOSE?

Sí, potencialmente: **~20 rutas de `documents.py` tienen `'global'` como valor
por defecto** de `model_urn` (`request.args.get('model_urn', 'global')`), y
`verify_project_access()` lo deja pasar sin comprobar nada
([documents.py:71](../../backend/routes/documents.py:71): *«Namespace global:
dato compartido, sin obra asociada»*).

**PERO el perímetro nuevo lo tapa. Medido hoy en producción** con sesión de
miembro (id 19):

```
/api/docs/list?model_urn=global   → 403 PROJECT_UNRESOLVED
/api/docs/list  (sin scope)       → 403 PROJECT_UNRESOLVED
/api/plan?model_urn=global        → 403 PROJECT_UNRESOLVED
```

`guardia_de_obra` corre ANTES que `verify_project_access`, así que con
`ENFORCE_PROJECT_AUTHZ=true` el bypass histórico **ya no es alcanzable**. El
último asiento bajo `global` es del **4-jul-2026**: desde la ventana no ha
crecido ni una fila.

# 4 · CLASIFICACIÓN POR GRUPO

| Grupo | Filas | Clase | Razón |
|---|---:|---|---|
| 4D: `lob_activities` + `lob_partidas` + `lob_avance` + `lob_frentes` | 4436 | **E · legado, sin borrar** | Copia verificada de datos que ya viven en `1_CANAL` / `1_DRENAJE`. No aporta y no falta. Su limpieza pertenece a la auditoría del frente 4D, con el 4D estabilizado |
| `lob_config` | 1 | **C · decisión humana** | Única fila; hay que ver si algún cálculo la lee antes de tocarla |
| `file_nodes` (8 fotos + 3 carpetas) | 11 | **A · migrable con evidencia** | Las 8 fotos tienen copia fuera; las carpetas `proyectos`/`PQT8_TALARA` son raíces del 25-mar. Migrable a la obra 1 con `project_ref`, pero **no urge**: son inalcanzables por perímetro |
| `activity_log` | 10 | **D/E · no se toca NUNCA** | Rastro append-only del 4-jul. **La regla de históricos prohíbe reescribirlo**: se queda como está, para siempre |
| `tracking_pins` | 3 | **C · decisión humana** | 2 maquinaria + 1 restricciones, «General». Pertenecen a alguna obra, pero solo quien estuvo lo sabe |

**Ninguna fila es `B` (regla de migración) ni `D` legítimamente global**: no hay
configuración compartida de verdad viviendo ahí — `global` nunca fue un diseño,
fue un valor por defecto.

# 5 · RIESGO PARA EL PILOTO: BAJO, Y ACOTADO

- **Fuga**: descartada — el perímetro devuelve 403 antes de tocar nada.
- **Pérdida**: descartada — todo está duplicado en alcances resolubles.
- **Crecimiento**: detenido desde el 4-jul; el default `'global'` de
  `documents.py` sobrevive en el código pero es inalcanzable con el perímetro
  encendido.
- **Lo que sí queda**: **higiene**. Esas rutas siguen teniendo un default que no
  debería existir, y el comentario del código todavía afirma que `global` es
  «dato compartido» — una frase que ya no es verdad. Limpiarlo es trabajo de
  Resource Permission / Identity & Access, no de estabilización.

**Recomendación técnica: NO migrar durante la estabilización.** El coste es real
(tocar 4436 filas del subsistema 4D con trabajo sin commitear encima) y el
beneficio, nulo mientras el perímetro las mantenga inalcanzables. Se revisa
cuando el frente 4D esté estabilizado, junto con la pasada cromática de
`lob4d/*`, que ya está apalabrada para entonces.
