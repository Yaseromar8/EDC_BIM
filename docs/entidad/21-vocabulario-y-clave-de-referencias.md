# VOCABULARIO CONGELADO Y LA CLAVE DE `project_ref`

**20-ago-2026** · Aclara dos puntos del informe [20](20-informe-del-nucleo-minimo.md)

---

# 1 · `project_uid`: no existe, y no debía haberlo escrito

## La contradicción era real, y el error es mío

En §5 del informe 20 escribí que la regla para tablas nuevas sería `project_uid`.
En §6 mantuve `projects.id` como identidad canónica hasta multi-Account. **Las dos
cosas no pueden ser ciertas a la vez**, y quien fuera a crear la siguiente tabla
se habría encontrado buscando una columna que no existe.

> **No hay ningún `project_uid` en este diseño. No está previsto crearlo antes de
> multi-Account. La identidad canónica de una obra es `projects.id`, de tipo
> `TEXT`.**

Lo he corregido en el informe 20.

## Qué quería decir, y por qué la prescripción estaba mal

El problema real que intentaba conjurar es este: **`project_id` significa tres
cosas distintas** según la tabla, y lo dice el propio código (`db.py:964-967`):

```
model_config.project_id   = id de proyecto de ACC ('b.3fcc21c3-…')
saved_views.project_id    = el frente ('1_CANAL')
control_pins.project_id   = el frente
```

De ahí saqué la conclusión «el nombre está quemado, usad otro». **Es la
conclusión equivocada.** Al mirar por qué esas tres columnas son ambiguas y
`project_ref.project_id` no lo es, la diferencia no es el nombre:

| columna | ¿clave ajena? | ¿ambigua? |
|---|---|---|
| `model_config.project_id` | no | **sí** |
| `saved_views.project_id` | no | **sí** |
| `control_pins.project_id` | no | **sí** |
| `project_ref.project_id` | **sí**, `fk_project_ref_project`, validada | **no** |
| `project_users.project_id` | **sí** (desde este núcleo) | **no** |

**Lo que desambigua es la clave ajena, no el nombre.** Una columna con
`REFERENCES projects(id)` no puede contener un id de ACC ni un frente: la base lo
impide. Una columna sin clave ajena puede contener lo que sea, y con el tiempo
contiene lo que sea — que es exactamente lo que pasó.

Y `project_uid` era además una etiqueta engañosa: «uid» sugiere un UUID y sugiere
un identificador nuevo. No hay ninguno de los dos.

## VOCABULARIO CONGELADO para tablas nuevas

### Obligatorio

| columna | tipo | significa | condición |
|---|---|---|---|
| `project_id` | `TEXT` | la obra canónica | **`REFERENCES projects(id)`, siempre.** Sin clave ajena, el nombre está prohibido |

### Cuando haga falta

| columna | tipo | significa | nota |
|---|---|---|---|
| `model_code` | `TEXT` | el modelo o frente dentro de la obra | **columna aparte.** Nunca concatenado dentro del alcance |
| `external_ref` | `TEXT` | identificador de un sistema ajeno (ACC…) | acompañado de otra columna que diga **de qué sistema** |
| `account_id` | `TEXT` | la cuenta | **solo donde sea estructuralmente vivo** — parte de una clave primaria o única. Nunca como columna dormida |

### Prohibido en una tabla nueva

| | por qué |
|---|---|
| `project_id` **sin** clave ajena | Es exactamente cómo nacieron las tres ambigüedades |
| `app_project_id`, `acc_project_id`, `base_project_id` | Tres nombres para lo mismo y para cosas distintas. No se repiten |
| `model_urn` o `scope_urn` **como frontera de obra** | Son alcances heredados. Se traducen; no se generan más |
| Cadenas compuestas `<obra>_<FRENTE>` | Meten dos dimensiones en un campo. Van en dos columnas |
| Una columna dormida «para el futuro» | `db.py:978` añadió `project_id` a 11 tablas y lo pobló; **ninguna consulta lo lee todavía**. Una columna sin lector no es un cimiento: es un dato que envejece |

### Cómo se comprueba

`project_ref` cumple la regla: su `project_id` lleva clave ajena validada. Y el
manifiesto de esquema **exige** esa clave ajena, así que una instancia donde no
se cree no arranca.

## Por qué esto no cierra la puerta a multi-Account

Justamente al revés, y es la parte que importa:

Cuando `projects.id` tenga que ser único **entre cuentas** y no solo dentro de una
instancia, el cambio está contenido porque **todas las tablas nuevas apuntan a una
sola columna referenciada**: `projects(id)`. Entonces se añade la columna nueva a
`projects`, se repuntan las claves ajenas, y `project_ref` traduce lo heredado —
que es para lo que existe.

Lo que hace barato ese futuro **no es cómo se llame la columna**: es que haya una
clave ajena y un único punto de traducción. Un `project_uid` acuñado hoy, sin
clave ajena y sin lector, no habría comprado nada de eso.

---

# 2 · Por qué la clave primaria es `(account_id, alias)`

## La regla: la unicidad va sobre aquello por lo que se busca

La búsqueda llega **como una cadena y sin tipo**:

```python
resolve_project_id('proyectos/PQT8_TALARA')   # no sabe, ni puede saber, qué kind es
```

Con `PRIMARY KEY (account_id, kind, alias)`, el mismo alias podría existir dos
veces —`LEGACY_NAME → obra A` y `LEGACY_PATH → obra B`— y una búsqueda por alias
devolvería **dos filas**. El resolutor tendría que elegir entre ellas.

Y elegir entre candidatos empatados **es exactamente lo que esta tabla se creó
para eliminar**: era lo que hacía `by_name` con las cuatro obras
`HOSPITAL_MATUCANA`, resolviendo a una según el orden en que la base devolviera
las filas. Meter `kind` en la clave habría reintroducido el mismo defecto por otra
puerta, y con aspecto de rigor.

`kind` es **metadato descriptivo**: dice de dónde salió el alias y permite
auditarlo. Tiene un uso lógico —`cargar()` usa `kind == 'PROJECT'` para saber qué
alias pueden actuar como prefijo en `<obra>_<FRENTE>`— pero eso es una propiedad
del alias, no parte de su identidad.

## Sí, es deliberado: un alias representa una sola cosa

**Confirmado y deliberado.** Dentro de una cuenta, un alias identifica **una** obra
y nada más. No hay ningún caso legítimo en el que la misma cadena deba significar
dos obras distintas: si eso ocurre, no es una riqueza del modelo, es una colisión.

## Qué ocurre si el caso aparece

Ocurre, y tiene un caso real: **crear una segunda obra con el mismo nombre que
otra**.

```
Obra VIEJA se llama «Obra X»  →  alias 'Obra X' y 'proyectos/Obra_X' apuntan a VIEJA
Alguien crea otra obra «Obra X»
```

Lo que pasa, paso a paso:

1. `anotar()` intenta escribir `'Obra X' → NUEVA` y choca con la clave primaria.
2. `ON CONFLICT (account_id, alias) DO NOTHING` → **manda la atribución que ya
   estaba**. Es lo correcto: los datos históricos cuelgan de ella, y moverla
   cambiaría de obra información que ya está guardada.
3. **Se registra un aviso** con las dos obras implicadas (ver más abajo).
4. La obra NUEVA queda **plenamente funcional**: su alias `PROJECT` es su propio
   `projects.id`, que es único por construcción —es la clave primaria de
   `projects`—, y su alcance de escritura es ese mismo id.
5. El sembrador lo lista bajo «YA ESTABAN», y las obras que comparten nombre salen
   en su propio apartado del informe.

**No se produce ninguna atribución errónea.** Y como el navegador ya no fabrica el
alcance a partir del nombre —lo recibe del servidor (`scope_escritura`)— ningún
cliente al día mandará `proyectos/Obra_X` creyendo que se refiere a la nueva.

Si una atribución hubiera que moverla de verdad, es una **decisión manual**: se
actualiza la fila. No hay camino automático, a propósito.

## Un defecto real encontrado al escribir esto

El docstring de `anotar()` decía:

> *«…es una contradicción que alguien tiene que mirar»*

Y **nadie podía mirarla**: el `ON CONFLICT DO NOTHING` descartaba la atribución
nueva sin dejar ni una línea. La función `conflicto()`, escrita justo para
detectar ese caso, había quedado **sin ningún llamador** al simplificar el
sembrador — código muerto que un lector habría dado por conectado.

Es el mismo patrón que este proyecto lleva pagando toda la revisión: **un control
que se describe por su intención y no por su comportamiento.**

**Arreglado** (`referencias_de_obra.py`): `anotar()` usa `conflicto()` y registra
un aviso con el alias y las dos obras. **La decisión no cambia** —sigue mandando
la atribución que ya estaba— pero ahora se dice. Prueba nueva:
`test_un_alias_ya_atribuido_no_se_mueve_pero_SE_DICE`, que comprueba las dos
mitades: que la antigua manda y que la nueva deja rastro.

De paso, el ensayo de segunda obra dejó de poder re-ejecutarse por sus propios
restos —membresías huérfanas de una ejecución anterior, en una base sin las claves
ajenas— y se separó la limpieza inicial del borrado que mide el arrastre, para que
el criterio 6 no acabara comprobando su propia limpieza.

---

## Pruebas

**814 pasan, 0 fallan.** Ensayo de segunda obra: **15 de 15** sobre instancia
virgen; **12 de 15** sobre la base de desarrollo, y los 3 que faltan son las
claves ajenas, que ahí no existen porque `ecd_app` no es dueño de las tablas —el
ensayo ahora lo **nombra** en vez de solo fallar.

---

**Fin de la fase.** No he continuado con ninguna funcionalidad nueva.
