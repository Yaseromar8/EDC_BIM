# CIERRE DE F1 — REDLINES PROFESIONALES

**21-ago-2026** · Segunda de las cuatro piezas del [mapa de cierre](33-mapa-de-cierre-de-frontend-docs.md)
Alcance aprobado en [35-f1-alcance-de-observaciones.md](35-f1-alcance-de-observaciones.md)

> **El Red Line sigue siendo el registro formal de croquis de modificación, y
> ahora tiene responsable, plazo, gobierno y rastro.**
> No se construyó ningún Issue. No se tocó `frontend-react`, 3D, 4D ni LOB.

---

## 0 · La precisión conceptual, incorporada

Se corrigió la formulación del alcance. **No se declara que una Review rechazada
SEA un Issue documental.** Lo que se sostiene es más estrecho y es lo único que
hacía falta:

> Una Review rechazada **puede contener** observaciones y **puede devolver** un
> documento a corrección, y por eso el flujo documental de V1 se cierra sin
> Issue. Pero **Review e Issue siguen siendo objetos distintos.**

**Issue independiente = DIFERIDO.** No inexistente, no sustituido. Queda para
reevaluarse cuando tenga valor transversal con documentos, modelos, elementos
BIM, ubicaciones o Field. Está escrito así en `flujo_de_redline.py`, que es
donde alguien lo leerá dentro de un año.

---

## 1 · Lo que se construyó

| | |
|---|---|
| **`responsable_id`** | Identidad del sistema, no texto del navegador. El texto histórico **no se convierte** |
| **Plazo** | `vence_en` en el **objeto**, no sólo en el encargo. **Días calendario** |
| **Historial** | `created`, `ball_in_court_changed`, `adopted`, `responded`, **`returned`**, `closed` |
| **`project_id` canónico** | `NOT NULL` + clave ajena a `projects` |
| **Unicidad** | `UNIQUE (project_id, codigo)` — por **obra**, no por alcance |
| **Estados gobernados** | `CHECK` con los cuatro, y transiciones validadas |
| **Ball-in-Court** | Fase de revisión → el responsable; nadie más |
| **Veredicto** | **Sólo el responsable actual**. Ni el emisor, ni un administrador |
| **Cierre y devolución** | El **emisor** o un **administrador** |
| **Bloqueo** | Calculado al mirarlo; se desatasca reasignando, sin puertas |
| **`encargos`** | Proyección **reconstruible**: ya se detecta que **falte** |
| **Documentos** | Los nuevos fijados a `version_id`, con rol `deteccion` / `correccion` |
| **Corrección** | **Opcional**: se puede cerrar sin ella |
| **Directorio** | `usaDirectorio: true` — miembros de la obra, no `localStorage` |

**4 columnas · 5 restricciones · 0 tablas nuevas · 0 módulos nuevos.**

---

## 2 · La pieza común, y la prueba de que no acopla

`flujo_de_rfi.py` se separó en dos: **`flujo_de_registro.py`** (mecánica) y las
**semánticas declaradas** de cada objeto. La condición era conservar
explícitamente el significado de cada uno y demostrarlo.

La semántica es un **dato**, no una subclase:

```python
SEMANTICA = Semantica(
    quien_dicta_veredicto = (RESPONSABLE,),   # ni el emisor ni un administrador
    quien_cierra          = (AUTOR, ADMIN),
    asunto_encargo        = 'Revisar %s: %s',  # «Revisar», no «Responder»
    …)
```

**`ensayo_de_desacople.py` — 22 de 22.** Lo que comprueba:

- Se declara un **Red Line hipotético** donde el veredicto lo dicta el emisor —
  la regla **contraria** a la de hoy — y **ni el RFI real ni el Red Line real se
  enteran**. Separarlos mañana es posible.
- Ningún mensaje del RFI nombra Red Lines, y al revés. Hasta el motivo de una
  transición inválida nombra al objeto correcto.
- **La numeración de uno no avanza la del otro**: con 5 RFI creados, el
  siguiente Red Line sigue siendo `RL-001`.
- Un RFI y un Red Line **con el mismo identificador** abren dos encargos
  distintos, y cerrar uno no cierra el otro.
- Una posición inventada **revienta** en vez de darse por falsa: una regla que
  no gobierna nada sería peor que ninguna.

**El API público del RFI no cambió y `routes/rfis.py` no se tocó.** Sus 49
comprobaciones siguen pasando.

---

## 3 · Tres defectos reales encontrados

### 3.1 · Un anuncio que se describía por intención

Con el rol de ejecución —que **no** es el dueño de las tablas— las cuatro
restricciones fallaban una a una, cada fallo se imprimía… y al final se
imprimía **«Reglas del RFI verificadas»**. Cada línea suelta decía la verdad y
**el resumen decía lo contrario**, que es la forma más fácil de que nadie lo
note.

Ahora `_reglas_del_registro` **devuelve lo que no pudo aplicar** y el anuncio
depende de eso: `Reglas del … INCOMPLETAS. Sin aplicar: …`.

### 3.2 · Y ese mensaje veraz encontró un defecto mío en el acto

En un clúster **virgen** avisó de tres restricciones sin aplicar. Era **mi
propio error**: en tres ramas el `pendientes.append(…)` había quedado fuera del
`except`, así que marcaba pendiente **también cuando la restricción se creaba
bien**. La restricción sí existía; el aviso mentía. Corregido, y verificado
sobre el clúster virgen.

### 3.3 · La devolución a corrección no la veía nadie, y hacía oscilar la conciliación

Al devolver un Red Line a revisión, **no volvía a la bandeja de nadie**. Y si se
reabría el encargo sin más, la conciliación lo declaraba sobrante en el acto —
porque `respuesta` seguía con el veredicto viejo y las dos mitades lo leen como
«ya no se debe». **El mismo defecto de oscilación que ya se pagó una vez.**

Al devolver, **se retira el veredicto**: no puede constar resuelto y en revisión
a la vez. No se pierde nada — queda en el historial, en la línea `returned`. El
ensayo comprueba las dos cosas, y que **una segunda pasada de conciliación no
mueva nada**.

### Y un camino muerto retirado

`responsable_funcion` abría un encargo a una función contractual **sin pasar por
ninguna comprobación**. No lo usaba nadie —ni la interfaz ni las pruebas— y era
justo el defecto que esta pieza corrige.

---

## 4 · Los históricos

**Los 33 no se tocaron.** Huella de las 33 filas antes y después:

```
ANTES:    33 filas, huella 9981f56b8e3a89ca
DESPUÉS:  33 filas, huella 9981f56b8e3a89ca
```

Y admiten las cuatro restricciones **sin modificar una sola fila** — se comprobó
antes de imponer nada: ninguno sin `project_id`, ninguno con obra inexistente,
ningún código repetido, ningún estado fuera de los cuatro.

**Ninguno pide adopción**: la regla exige heredado **y** abierto, y los 33 están
cerrados. El ensayo lo comprueba con un histórico de la misma forma que los
reales, incluido su adjunto apuntando sólo al nodo.

---

## 5 · Pruebas

| | resultado |
|---|---|
| **Suite completa** | **876 pasan · 0 fallan** |
| **Ensayo de Red Line** | **58 / 58** |
| **Ensayo de desacople** | **22 / 22** *(nuevo)* |
| Ensayo de RFI | **49 / 49** |
| Ensayo de Revisiones | **50 / 50** |
| Ensayo de Encargos | **31 / 31** |
| Ensayo de Dos obras | **16 / 16** |
| **Invariantes vs. cierre de F2** | **0 diferencias** |
| Build de `frontend-docs` | correcto |

Los ensayos corrieron contra un **clúster PostgreSQL virgen**, construido desde
cero con `bootstrap_esquema.py`. Eso demuestra algo que la base local no puede:
**que el esquema del Red Line se construye en el orden correcto desde vacío** —
sus claves ajenas apuntan a `projects` y `users`, así que van al final, con las
demás. Es la misma lección de orden que ya se pagó con las del RFI.

**Manifiesto regenerado**: +10 objetos, **0 pérdidas**. Sólo los del Red Line.

---

## 6 · Dos cosas que conviene decir

### 6.1 · Dejé residuos en la base real, y los retiré

El ensayo de RFI que lancé contra la base local **antes** de montar el clúster
falló a mitad —esa base no tiene el esquema del RFI— y dejó sus filas de prueba:
un `file_node`, una `file_version`, una obra y cuatro usuarios, todos con
prefijo `zz_rfi_`. Lo detectó la comparación de invariantes contra el cierre de
F2. Retirados con la propia limpieza del ensayo, que sólo borra por ese prefijo.
**Invariantes de nuevo en 0 diferencias.**

### 6.2 · Dos cosas del entorno, no del código

- **La base local `ecd_dr12d` no tiene el esquema profesional del RFI ni del Red
  Line.** No es un fallo: su dueño es `ecd_migrator` y el rol de ejecución es
  `ecd_app`, que no puede crear esquema — la separación de identidades
  funcionando. Lo aplica `bootstrap_esquema.py` en el despliegue.
- **`frontend-docs/dist/assets` está bloqueado** por algún proceso del sistema
  (antivirus o sincronización): todos sus ficheros dan «acceso denegado». No lo
  forcé. La compilación se verificó sobre una carpeta aparte y es correcta; para
  compilar en su sitio hay que liberar esa carpeta.

---

## 7 · Deuda declarada de esta pieza

1. **`routes/rfis.py` y `routes/redlines.py` tienen mecánica de ruta parecida.**
   Deliberado: el RFI quedó cerrado en F2 y no se reabre. Lo que importa —el
   **gobierno**— vive en el módulo de flujo, que sí es común, y el ensayo de
   desacople vigila el otro lado.
2. **`vence_en` se manda como fecha**, no como días, igual que en RFI.
3. **El aviso de bloqueo no ofrece un botón de reasignar**: se cambia el
   responsable editando la fila. La regla no lleva puertas, así que no hace
   falta un diálogo aparte como en Reviews.

---

**STOP.** No avanzo a F4 ni a F3. No se construyó ningún Issue.
