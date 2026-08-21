# EVIDENCIA DE PRODUCCIÓN — E1–E5

**Fecha:** 21 de agosto de 2026 · commit `e80199d`
**Sin convergencia, sin roles, sin variables, sin despliegue, sin cuentas, sin `frontend-react`.**

---

## LA TABLA

| | Estado | Evidencia |
|---|---|---|
| **E1** | **PENDIENTE DE TI** | Exige la credencial de Cloud SQL, que no poseo ni debo poseer. Kit listo: `herramientas/evidencia_de_produccion.py` (§abajo) — solo lectura, contraseña tecleada, informe sin secretos |
| **E2** | **PENDIENTE DE TI** | El mismo kit, la misma pasada. Consultas tolerantes: existencia primero, privilegios después |
| **E3** | **PENDIENTE DE TI** | El mismo kit con `--web` — pide tu sesión de administrador por teclado, lee `/api/seguridad/postura`, cierra la sesión al terminar |
| **E4** | **PENDIENTE DE TI** | Panel de Render. El informe del kit deja la tabla para rellenar: valores no-secretos tal cual, secretos solo `PRESENTE / AUSENTE` |
| **E5** | **PASS — `DATABASE RESTORABLE = PROBADO`** | Ensayo real hoy: 89 tablas · **78.171 de 78.172 filas** · todas cuadran · **1 fila en cuarentena anunciada** (abajo) · `evidencias/ensayo-restauracion-20260821-1602.json` |

**No invento un PASS con tu nombre.** E1–E4 son lecturas que solo tus
credenciales pueden hacer; lo que estaba a mi alcance era dejarlas a un comando
de distancia, y está hecho.

## CÓMO SE EJECUTAN E1–E4 (una pasada + una pasada + una tabla)

```bash
cd backend
python herramientas/evidencia_de_produccion.py --db-host <IP de Cloud SQL> --db-name <base> --db-user postgres
```

```bash
python herramientas/evidencia_de_produccion.py --web https://visor-ecd-backend.onrender.com
```

E4: abrir el panel de Render y rellenar la tabla que el primer informe deja al
final. Los informes quedan en `docs/entidad/evidencias/`, sin ningún secreto.

---

## E5 — LO QUE PASÓ, PORQUE IMPORTA

El ensayo se ejecutó de verdad —copia real de hoy (89 tablas, 78.172 filas) →
clúster desechable → bootstrap del **esquema nuevo** → carga → cotejo— y a la
primera **FALLÓ**. Dos veces. Los dos fallos eran reales y los dos estaban
esperando al día de la urgencia:

### Hallazgo 1 — la copia del modelo viejo no entraba en el esquema nuevo

`folder_permissions.sujeto_id` es `NOT NULL` sin default en el esquema nuevo; una
copia anterior al modelo de sujetos no trae esa columna y el `COPY` rechazaba las
filas **en la inserción**. `DATABASE RESTORABLE` había dejado de ser verdad sin
que nadie lo supiera — y **la copia de producción tiene hoy el mismo problema**
si su esquema es anterior al modelo (lo dirá E1).

**Corrección:** la restauración aplica **al flujo** la misma migración que ya
aplicó el producto (*«lo que ya había es, por definición, de tipo USER»*,
sujeto = `user_id`). No se adivina nada: es la regla escrita en
`folder_permissions.py`, aplicada al mismo dato por otro camino de entrada.

### Hallazgo 2 — la fila huérfana `pdf_markups.file_node_id=123`

La decisión pendiente señalada el 13-ago. El esquema nuevo tiene esa columna en
UUID; `123` no convierte. **No se cargó y no se borró**: fue a un CSV de
**cuarentena** al lado de la copia, anunciada y descontada del cotejo — el mismo
criterio de la migración en vivo (*«decidir qué se hace con un dato que no
entendemos no es cosa del arranque»*). Ni de la restauración.

Con la fila delante, además, la decisión se vuelve fácil: es de **`Demo User`**
— un `measure` de prueba con puntos `[[1,1],[2,2]]`. No es dato contractual.
Cuando quieras, se resuelve; mientras tanto, nada la decide por ti.

### Y una robustez que faltaba

Cada tabla carga ahora bajo su `SAVEPOINT`: **una tabla mala ya no mata la
restauración entera**. El día de la urgencia, 88 tablas restauradas y una
señalada valen más que cero.

### El resultado final

```
esquema completo contra el manifiesto  (el NUEVO: 872 columnas, es_admin incluida)
89 tablas restauradas · 78.171 filas · todas cuadran fila a fila
en cuarentena (decisión pendiente): pdf_markups=1
VEREDICTO : RESTAURABLE
```

Clúster desechable destruido al terminar. Suite: **890 pasan**.

### Lo que E5 NO afirma

`FULL ECD DISASTER RECOVERY` **no se afirma**. Esto es la base. Los bytes viven
en GCS — donde, dicho sea, el 20-ago cerraste tú más de lo que yo tenía
registrado: soft delete a 90 días, borrado+recuperación real con cotejo de hash
(`crc32c` y `md5` idénticos), y copia diaria a `-copia` con «cuándo borrar:
Nunca» (evidencias `bucket-proteccion`, `borrado-y-recuperacion` y
`copia-independiente`, todas del 20-ago). Object Versioning **no aplica** a ese
bucket (limitación de HNS, documentada). El residual que sigue abierto: **ambos
buckets comparten proyecto y región** — el radio de explosión de facturación que
ya se materializó una vez. Eso se evalúa en el gate del piloto, no en este.

### Un antecedente que cuenta

El 20-ago ya ejecutaste este mismo ensayo **con la copia real de producción**
(87 tablas, 83.410 filas → `RESTAURABLE` en segunda pasada, commit `e04d157`).
E5 de hoy lo revalida **contra el esquema nuevo**, que es lo que aquel no podía
cubrir.

---

## GATE

```
TECHNICAL DEPLOYMENT GATE:
BLOCKED — E1–E4 sin ejecutar: exigen credenciales de producción
          (Cloud SQL, sesión de administrador, panel de Render) que no
          poseo ni debo poseer. El kit de las cuatro lecturas está listo
          y es de solo lectura; con sus resultados el gate se recalcula.
```

E5 está cerrada. De las cuatro restantes, **E1 primero**: dirá si
`folder_permissions.sujeto_id NOT NULL` existe en producción — y con ello, si el
servicio desplegado puede o no conceder permisos de carpeta desde el 20-ago.
