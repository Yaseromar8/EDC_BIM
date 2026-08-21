# INFORME — DIRECTORIO, MOTOR DE ENCARGO Y «MI TRABAJO»

**20-ago-2026** · Primer bloque de la Generación 1
Alcance de [23 §4](23-revisiones-y-alcance-generacion-1.md), respetado sin ampliarlo.

> **Ningún documento, versión, ruta de objeto, SHA-256, permiso ni frontera entre
> obras cambió.** Medido antes y después con `herramientas/invariantes.py`.

---

## 1 · Qué se construyó

### 1.1 · Directorio de obra — `directorio_de_obra.py`

Una tabla, y solo una:

```sql
project_companies (project_id → projects.id, company_id → companies.id, funcion)
    funcion ∈ ENTIDAD · SUPERVISION · CONTRATISTA · PROYECTISTA · OTRO
```

**No se añadió `project_users.role`.** La función contractual es propiedad del par
*(empresa × obra)*, no de la persona, y la función de alguien **se deriva**:
`funcion_de(cur, obra, usuario)` la consulta; no hay ninguna columna que pueda
contradecirla.

Sigue el vocabulario congelado de [21](21-vocabulario-y-clave-de-referencias.md):
`project_id` con clave ajena real, que es lo que impide que la columna acabe
conteniendo un frente o un id de ACC.

### 1.2 · Motor de encargo — `encargos.py`

Una tabla que es **una proyección**, no un dueño:

```sql
encargos (project_id → projects.id, objeto_tipo, objeto_id,
          destino_usuario → users.id | destino_funcion,
          asunto, estado, vence_en, creado_en/por, cerrado_en/por, avisado_en)
```

Los cuatro objetos existentes la alimentan desde **sus propias transiciones**:

| objeto | abre | cierra |
|---|---|---|
| **Review** | al crearse (revisor del paso 1) y al avanzar de paso | al aprobar o rechazar el paso |
| **RFI** | al asignar destinatario estructurado | al responder o al pasar a estado de cierre |
| **Redline** | igual | igual |
| **Transmittal** | **uno por destinatario** | el acuse cierra **solo el suyo** |

**Ninguno de los cuatro cambió de esquema.** `doc_rfis.responsable` es texto libre
en los datos reales —`'Ing. Valeria Barrenechea'`— y sigue siendo el dato de
dominio del objeto. El destinatario **estructurado** viaja en la petición
(`responsable_id` o `responsable_funcion`) y se guarda únicamente en el encargo.
Si no se manda, no se abre encargo y el RFI se comporta exactamente como antes.

### 1.3 · «Mi Trabajo» — `routes/directorio.py` + `MiTrabajo.jsx`

`GET /api/mi-trabajo`, transversal a las obras, y un panel en la portada del
portal. Antes se entraba y se veían carpetas.

### 1.4 · Aviso y recordatorio

`mailer.enviar()` ya existía y solo lo usaban las invitaciones y los transmittals.
Ahora también avisa al abrirse un encargo. El **recordatorio** es
`herramientas/recordatorios.py`, un guion programable — no un proceso residente:
con varios workers, reinicios a mitad y sin plano de control, un proceso en
segundo plano traería su propia caja de problemas y ninguno hace falta todavía.

---

## 2 · Las dos invariantes, y cómo se garantizan

### Invariante 1 · Un encargo nunca amplía acceso

Tres cierres independientes, y ninguno depende de que alguien se acuerde:

1. **Al crear.** `abrir()` se niega si el destinatario no es miembro de la obra
   del objeto. Y **no acepta `project_id` como parámetro**: lo deduce de la fila
   del objeto, así que ni equivocándose se puede colocar un encargo en otra obra.
   Hay una prueba que inspecciona la firma para que nadie se lo añada.
2. **Al resolver una función.** `usuarios_de_la_funcion()` hace `JOIN project_users`
   dentro de la consulta.
3. **Al leer la bandeja.** `_MI_TRABAJO` empieza por
   `JOIN project_users pu ON pu.project_id = e.project_id AND pu.user_id = %(uid)s`.
   No es un filtro más: es la invariante escrita en SQL, y está dentro de la
   consulta precisamente para que no se pueda olvidar al escribir la siguiente
   pantalla.

Y el encargo solo trae **asunto y vínculo**: abrir el objeto vuelve a pasar por
los guardias de siempre (`perimetro_de_obra`, `folder_permissions`).

### Invariante 2 · `encargos` no es una segunda fuente de verdad

- **No existe ninguna ruta que escriba un encargo.** La única del bloque que los
  toca es `GET /api/mi-trabajo`, que solo lee. Lo ata
  `test_no_existe_ninguna_ruta_que_escriba_encargos`, que recorre `routes/`
  buscando `INSERT/UPDATE/DELETE` sobre la tabla.
- Se abre y se cierra **en la misma transacción** que cambia el objeto.
- Si algún día hace falta reasignar, la respuesta **no** es `PATCH /api/encargos/<id>`:
  es reasignar el objeto y que el encargo lo siga.

### La tercera regla, que apareció al implementar

**La proyección no puede tumbar la transición del objeto.**

Lo encontró la suite: el acuse de un transmittal se registraba correctamente y la
respuesta pasaba de **200 a 500** porque fallaba la actualización del encargo. Eso
es la invariante 2 al revés — si `encargos` refleja lo que el objeto ya sabe, un
fallo del reflejo no puede impedir que el objeto avance.

Un encargo abierto de más es molesto y **visible** (sale en la bandeja, y
`encargos.huerfanos()` lo encuentra). Un acuse que no se registra es información
contractual perdida.

Corregido en los puntos de llamada, y fijado con una prueba de comportamiento:
`test_un_fallo_del_encargo_NO_tumba_el_acuse` fuerza el fallo y exige el 200.

---

## 3 · Pruebas

### Suite completa

**826 pasan · 0 fallan** (línea base antes de este bloque: **814**).

### Guardianas exigidas — dónde se demuestra cada una

| exigencia | dónde | resultado |
|---|---|---|
| Un encargo a una función **no** aparece a quien no es miembro | ensayo §1 | **Sergio**, de la empresa supervisora y **no miembro**, ve **0** |
| Un usuario de otra obra no lo ve aunque comparta empresa o función | ensayo §1 y §3 | Sonia ve 0 de la obra B |
| Cerrar/responder/aprobar el objeto cierra su encargo | ensayo §4 · §7 | cerró los 3 y desapareció de la bandeja |
| No queda un encargo apuntando a un objeto inexistente o ajeno | ensayo §6 | `huerfanos()` = 0; y **no se puede crear** uno así |
| «Mi Trabajo» solo devuelve lo abierto y autorizado | ensayo §5 | ninguno de los 3 cerrados aparece |
| El bloque no toca documentos, versiones, SHA-256, permisos ni aislamiento | invariantes + suite | ver §4 |

### Los cuatro ensayos pedidos

| # | ensayo | resultado |
|---|---|---|
| 1 | Suite completa | **826 / 826** |
| 2 | Dos obras — instancia virgen | **15 / 15** |
| 2b | Dos obras — base de desarrollo con datos | **12 / 15** — los 3 que faltan son las claves ajenas, que **en esa base no existen** porque `ecd_app` no es dueño de las tablas. No es una regresión: el ensayo lo **nombra** en vez de solo fallar |
| 3 | **Entidad / Supervisión / Contratista** en la misma obra | **incluido en el ensayo §2**: cada función recibe lo suyo y **no** lo de las otras dos |
| 4 | **Un usuario en dos obras** | **incluido en §3**: Ana pertenece a A y a B, ve trabajo de las dos, y filtrando por obra solo ve la que pide |
| — | Motor de encargo, completo | **21 / 21** |

**Escenario del ensayo** — está diseñado alrededor de las dos personas que rompen
los supuestos ingenuos:

```
OBRA A                                   OBRA B
  ENTIDAD      → Ana     (miembro)         CONTRATISTA → Ana  (¡la misma!)
  SUPERVISION  → Sonia   (miembro)
  CONTRATISTA  → Carlos  (miembro)
                 Sergio  (MISMA empresa que Sonia, NO miembro de A)
```

---

## 4 · Antes / después

| | antes | después |
|---|---|---|
| Endpoints que responden «¿qué me toca?» | **0** | **1**, transversal a las obras |
| Concepto de responsable con plazo | ninguno | `encargos`, alimentada por 4 objetos |
| Función contractual de una empresa en una obra | **no se podía expresar** | `project_companies` |
| Módulos que avisan por correo | 2 de 4 (invitaciones, transmittals) | **4 de 4** |
| Objetos con cambio de esquema | — | **ninguno** |
| Rutas que pueden escribir un encargo | — | **ninguna** |
| Pruebas | 814 | **826** |
| Manifiesto de esquema | — | **+49 objetos exigidos** (2 tablas, 8 claves ajenas y checks, índices) |
| `file_nodes` / `file_versions` | huella `2e0dd670…` / `e3b0c442…` | **idénticas** |
| Alcances históricos (46 columnas) | — | **ninguno reescrito** |
| `activity_log` · `auth_events` | 94 · 43 | 94 · 43 — **solo anexan** |

Los objetos nuevos están **en el manifiesto**, así que una instancia donde no se
creen **no arranca**.

---

## 5 · Lo que deliberadamente quedó fuera

Tal como se fijó en [23 §4](23-revisiones-y-alcance-generacion-1.md), y sin
excepciones:

Fusionar RFI con Issue · `project_users.role` o `.cargo` · cualquier cambio de
permisos · numeración o estados del RFI · migrar `doc_redlines` a Issue ·
notificaciones dentro de la aplicación · panel configurable, filtros avanzados,
móvil · plantillas de flujo · Submittals · cualquier cosa de costos · escalado,
reasignación automática y delegación.

### Deuda que este bloque deja anotada

1. **`companies` está sucia**: contiene una obra (`INTERFERENCIAS`) y basura
   (`x`). La función contractual cuelga de ahí. **No borro filas** que puedan
   estar referenciadas por usuarios reales: es decisión del propietario.
2. **`job_titles` no contiene cargos sino áreas** (CALIDAD, PRODUCCIÓN, BIM).
   Renombrarlo es cosmético y tiene lectores; se anota, no se toca.
3. **`vence_en` se acepta pero nada lo exige.** Poner plazos en las Reviews es el
   punto 4.3 de la Generación 1, y no es este bloque.
4. **El recordatorio hay que programarlo.** No corre solo.
5. **En la base heredada del propietario siguen faltando las claves ajenas**
   hasta que el arranque corra como `ecd_migrator` — acción 1 del informe
   [20 §7](20-informe-del-nucleo-minimo.md).

---

## 6 · Estado

El bloque está completo según su alcance y verificado en los cuatro ensayos
pedidos.

**Me detengo aquí.** No he continuado con la siguiente pieza de la Generación 1
—Reviews con plazo, Issues, cierre del acuse— ni con ninguna otra generación.
