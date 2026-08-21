# CIERRE DEFINITIVO DE RFI

**21-ago-2026** · Tercera pieza de la Generación 1
Alcance de [31](31-rfi-alcance-corregido.md), con las dos precisiones resueltas.

> **Ningún documento, versión, SHA-256 ni permiso cambió. Ninguno de los 25 RFI
> históricos se tocó. Ningún adjunto legacy se migró. Ningún `responsable` de
> texto se convirtió en usuario.**
>
> **El módulo sigue sin montar**, como se acordó.

---

## 1 · Qué cambió

### Esquema — 4 columnas, 5 restricciones, 0 tablas

```sql
doc_rfis
  responsable_id  INTEGER  → users(id) ON DELETE SET NULL   -- a quién le toca AHORA
  vence_en        TIMESTAMP                                  -- el plazo, en el objeto
  historial       JSONB DEFAULT '[]'
  cerrado_por     VARCHAR(255)
  project_id      TEXT     NOT NULL → projects(id)           -- la obra no puede ser desconocida
+ UNIQUE (project_id, codigo)
+ CHECK  (estado IN ('Emitido','En revisión','Respondido','Cerrado'))
```

`responsable` (texto) y `respuesta` (veredicto) **intactos**.

### Comportamiento

| | |
|---|---|
| **Ball-in-court** | El **autor**, el **responsable actual** o un **administrador**. Un miembro cualquiera ya no puede quitarle un RFI a otro |
| **Veredicto** | **Solo el responsable actual.** Ni el autor ni un administrador |
| **Cierre** | El autor o un administrador |
| **Estados** | Transiciones gobernadas. `Respondido` exige veredicto; `Cerrado` exige venir de `Respondido`; cerrado es cerrado |
| **Historial** | `created` · `ball_in_court_changed` · `adopted` · `estado` · `responded` · `closed`, siempre con quién y cuándo |
| **Plazo** | En el objeto. La bandeja lo ordena y el recordatorio lo encuentra |
| **Notificación** | `avisar()` al asignar |
| **BLOQUEADO** | Calculado, no guardado, cuando el responsable deja la obra |
| **Adjuntos** | Los nuevos con `version_id` y `rol`; validados contra la obra y el permiso de carpeta |
| **Conciliación** | Ahora **también reconstruye encargos de RFI** |

---

## 2 · Las dos precisiones

### 2.1 · `project_id` garantizado en PostgreSQL

Verificado antes de aplicar: **0 RFI sin `project_id`**, 25 códigos distintos, 0
estados fuera de los cuatro. Con eso, las cinco restricciones entran limpias.

**Y ninguna se impone adivinando.** `_reglas_del_rfi` comprueba los datos antes
de cada una y, si no puede aplicarse con seguridad, **lo dice y sigue**:

```
[DB] AVISO: N RFI sin project_id. NO se impone NOT NULL y NO se
     adivina su obra: hay que decidirla a mano.
```

Una restricción que se aplica «arreglando» filas de un cliente no es una
garantía: es una pérdida de información con buena intención.

### 2.2 · Concurrencia — el reintento funciona de verdad

Tenía razón: en PostgreSQL una violación de unicidad **aborta la transacción**, y
sin punto de retorno el reintento sería un adorno.

```python
for intento in range(3):
    codigo = flujo.siguiente_codigo(cur, obra)
    cur.execute('SAVEPOINT intento_codigo')
    try:
        cur.execute('INSERT INTO doc_rfis …')
        cur.execute('RELEASE SAVEPOINT intento_codigo')
        break
    except Exception:
        cur.execute('ROLLBACK TO SAVEPOINT intento_codigo')
else:
    return 409 'CODIGO_EN_DISPUTA'
```

**Demostrado de dos formas** en `ensayo_de_rfi.py` §13:

1. **Colisión forzada** — se obliga a `siguiente_codigo` a devolver un código ya
   existente. El SAVEPOINT recupera y devuelve **200**.
2. **Ráfaga simultánea real** — seis hilos con `threading.Barrier`, seis
   conexiones:

```
seis creaciones simultaneas: NINGUN 500 opaco
y todos los codigos son DISTINTOS  ['RFI-904'…'RFI-909']
la obra no tiene ni un codigo repetido: 12/12
```

---

## 3 · Tres defectos que encontraron las pruebas

### 3.1 · Un RFI nuevo se tomaba por legacy

`es_legacy` miraba solo la ausencia de `responsable_id` — y un RFI **recién
creado** tampoco lo tiene. Su primera asignación se registraba como
**«adopción»** en vez de como asignación.

Legacy es el que arrastra **un nombre escrito a mano y ningún usuario detrás**.
Ahora exige las dos condiciones.

### 3.2 · La conciliación oscilaba en vez de converger

`_faltantes` filtraba `estado <> 'Cerrado'`, así que un RFI **Respondido** se
contaba como «falta su encargo»; la conciliación lo reabría y acto seguido
`_sigue_debiendose` lo declaraba sobrante.

**Dos mitades con criterios parecidos pero distintos hacen que la conciliación
oscile.** Ahora las dos usan `ESTADOS_DE_CIERRE`, una sola definición.

### 3.3 · Las reglas del RFI no se creaban en una instancia nueva

Estaban dentro de `ensure_rfi_schema`, que corre **pronto** — y sus claves ajenas
apuntan a `projects` y `users`, que **todavía no existen**. Sobre una base ya
construida funcionaba; sobre una **vacía fallaba en silencio**, y la instancia
nueva se quedaba sin la restricción única, sin el CHECK y sin el `NOT NULL`.

Lo encontró la regeneración del manifiesto desde cero. Es el mismo error de orden
que ya se pagó con las claves ajenas: **lo que referencia tablas ajenas va después
de quien las crea.** Ahora es un paso propio al final del arranque.

*(Y de paso: `check_folder_permission` recibía `'view'`, que no es un nivel real —
son `viewer`, `view_download`, `view_markup`, `edit`, `admin`. Denegaba siempre.)*

---

## 4 · Compatibilidad con los históricos

| | |
|---|---|
| Los 25 RFI | **25 · 25 códigos distintos · 1 responsable de texto · 0 sin `project_id`** — idénticos |
| Estados | `Cerrado` 18 · `En revisión` 6 · `Respondido` 1 — sin tocar |
| Veredictos | `Aceptado` 13 · `Rechazado` 6 · vacío 6 — sin tocar |
| `responsable` texto | **No se convirtió ni uno** |
| 26 adjuntos legacy | **No se migró ninguno.** Siguen abriendo la versión viva |
| Legacy **cerrado** | Se conserva exactamente. No pide adopción: es archivo |
| Legacy **abierto** | Exige **adopción** antes de veredicto o cierre. Una persona elige el usuario; el texto original se conserva al lado y el historial dice **quién lo eligió** |

---

## 5 · Pruebas

| | resultado |
|---|---|
| **Suite completa** | **876 pasan · 0 fallan** (antes 860) |
| **Ensayo de RFI** | **46 / 46** |
| Ensayo de revisiones | **50 / 50** |
| Ensayo del motor de encargo | **31 / 31** |
| Ensayo de dos obras | **16 / 16** |
| **Bootstrap desde base vacía** | 95 tablas · 865 columnas · **502 restricciones** · 0 fallos |
| **Invariantes** | `file_nodes` y `file_versions` **idénticas** · 46 columnas de alcance **sin reescribir** · auditoría solo anexa |

### Las 15 aceptaciones, todas verdes

Crear sin responsable (nadie lo ve) · asignar (solo el responsable lo ve, con
plazo) · **un miembro cualquiera no puede reasignar** · **ni el autor puede
responder su propio RFI** · responder sin veredicto no vale · veredicto y fecha
congelados · el responsable no cierra, cierra quien preguntó · cerrado no se
reasigna ni se modifica · pasar la pelota con rastro de quién a quién ·
**BLOQUEADO al salir de la obra, y se desatasca reasignando sin puertas** ·
legacy abierto exige adopción · legacy cerrado intacto · **dos alcances de la
misma obra no comparten código** · concurrencia · adjuntos con `version_id` y
rechazo de documentos de otra obra · **la conciliación detecta un encargo de RFI
que falta — lo que antes no podía**.

---

## 6 · Deuda deliberadamente pendiente

1. **El módulo no está montado.** Es la decisión que queda: cuándo hacerlo
   visible.
2. **`IssueModule` sigue mandando `responsable` de `localStorage`** y no
   `responsable_id`, y construye la URL de vista a mano en vez de usar
   `useDocPreview`. **La interfaz es lo que falta para montar el módulo**, y va
   con esa decisión.
3. **De un RFI legacy sigue sin poder detectarse que FALTE su encargo** — no
   tiene `responsable_id`. Consecuencia aceptada de no convertir el texto.
4. **`respuesta` sigue llamándose así** aunque contenga el veredicto. En pantalla
   debe decir «Veredicto»; renombrar la columna movería 25 registros por una
   mejora cosmética.
5. Sin referencia a elemento del modelo · sin progresiva · sin declaración de
   impacto · sin vínculo a Issue · sin Cost Management.
6. **Línea de convergencia de Render abierta y separada**
   ([28](28-auditoria-de-la-convergencia-codex.md)).

---

**STOP.** No he avanzado a Issues ni a Transmittals.
