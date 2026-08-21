# MODELO DE ACCESO OBJETIVO — `frontend-docs`

**21-ago-2026** · Auditoría de **solo lectura** sobre el repositorio después del
cierre V1. **No se implementó nada.**

Modelo de contraste:
`PRINCIPAL + ACCOUNT + PROJECT + TOOL + RESOURCE + ACTION`, con
**RESPONSIBILITY / BALL-IN-COURT** como dimensión aparte.

---

# 0 · El hallazgo que ordena todo lo demás

Antes de recorrer capa por capa, el dato que cambia las prioridades. **Sonda
ejecutada, no lectura de código:**

```
PERMISO EFECTIVO del auxiliar sobre el documento reservado: 'none'

1. BÚSQUEDA               -> 200 · 0 resultados     (no lo descubre)
2. SIGNED-URL por node_id -> pasa la puerta          (le entregan el fichero)
3. SIGNED-URL por gcs_urn -> pasa la puerta          (idem)
4. SIGNED-URL, NO MIEMBRO -> 403 PROJECT_FORBIDDEN   (la puerta de obra SÍ corta)
```

> **La entrega de bytes se gobierna por PERTENENCIA A LA OBRA, no por permiso de
> carpeta.**

`_acceso_al_recurso()` —la puerta de `/api/docs/view`, `/signed-url` y `/proxy`—
comprueba enlace firmado, sesión, y `verify_project_access`. **No llama a
`check_folder_permission`.** El permiso de carpeta gobierna **descubrir**
(navegación y búsqueda), no **obtener**.

*(Los pasos 2 y 3 terminan en 500 por credenciales de GCS ausentes en el clúster
de ensayo — pero el 500 llega **después** de autorizar. El no miembro recibe 403
**antes**. Esa diferencia es la prueba.)*

**Consecuencia práctica: el permiso de carpeta es hoy una capa de
DESCUBRIMIENTO, no de CONFIDENCIALIDAD.** Quien conozca un `node_id` y sea
miembro de la obra, obtiene el documento.

---

# 1 · PRINCIPAL

**Qué es hoy.** `validate_session` devuelve `{id, name, email, role}` desde
`users` ∪ `sessions`. Identidad numérica estable, revocable —desactivar un
usuario revoca sus sesiones—, con segundo factor y rotación de pimienta ya
ensayados.

**Lo que NO lleva la sesión:** ni `company_id`, ni obra, ni función contractual.
Se derivan al consultarlas. **Eso es correcto**: una sesión que cachea la
empresa acaba mintiendo cuando la empresa cambia.

**Problema relevante para Docs:** ninguno estructural. Una anotación:
`ALLOW_DEMO_TOKEN` produce `{'id': 'demo'}` —identidad **no numérica**— y ya
hizo caer una consulta en F4. Está apagado por defecto y guardado, pero es un
principal de segunda clase que conviene retirar antes de multi-cliente.

### `CERRADA AHORA`

---

# 2 · ACCOUNT

## `hubs` no es una Account: es una etiqueta de presentación

Evidencia: **`hub_id` no aparece en ninguna comprobación de autorización.** Solo
en `JOIN`s de listado y visualización. Y los datos lo confirman:

```
HUBS      b.mdc_default_legacy «Proyectos Generales»
          b.mdc_hub_pirata_24038 «hub pirata»      ← de una prueba de intrusión
OBRAS     9 en el hub por defecto · 1 con hub_id = NULL
```

Una obra **sin hub** existe y funciona con normalidad. Si `hubs` fuera la
frontera de cuenta, esa obra no pertenecería a ninguna — y sin embargo nada se
rompe, porque **la frontera real es `project_users`**.

> **Para V1: SÍ, se puede mantener «1 instancia dedicada = 1 Account
> implícito».** Es coherente con el despliegue real —una instancia por cliente—
> y no hace falta Account Membership ni Account Roles.

## La ambigüedad del `admin` global — el punto que sí hay que resolver

`role = 'admin'` significa **tres cosas a la vez**, y hoy no se distinguen:

| lo que significa | dónde se ve |
|---|---|
| **Proveedor / instancia** | crea hubs, borra usuarios, cambia roles globales |
| **Entidad / cliente** | administra el directorio, sustituye revisores, desatasca |
| **Proyecto** | atraviesa `folder_permissions` en **todas** las obras, y `_acceso_al_recurso` le sirve **cualquier** blob de **cualquier** obra sin comprobar pertenencia |

Ese último punto es el que escala mal: **un `admin` no necesita ser miembro de
una obra para leerla entera.** Hoy hay **3 administradores de 17 usuarios**, y
con una instancia dedicada a un solo cliente eso es tolerable — el proveedor y
la entidad son, de hecho, la misma esfera de confianza.

**Deja de serlo en cuanto haya dos clientes en una instancia, o un contratista
al que se le da administración de su obra.** Ahí, «administrar mi obra» y
«leerlo todo» se separan, y hoy son la misma palabra.

### Mínimo antes de escalar a varios clientes/contratistas

**No hace falta Account Membership.** Hace falta **partir `admin` en dos**:

1. **`admin` de instancia** — el proveedor. Puede lo que hoy puede.
2. **`admin` de obra** — administra una obra concreta: directorio, permisos,
   desatascar flujos. **Y su alcance está acotado por `project_users`.**

Es una columna en `project_users` o una tabla `project_admins`, y **las reglas
de flujo ya están preparadas**: `flujo_de_registro.ADMIN` es una *posición
declarada*, no una consulta a `users.role`. Cambiar qué significa `es_admin` en
una obra es cambiar **una función**, no los cuatro flujos.

### `PUEDE ESPERAR A ESCALA ENTERPRISE` — con la condición de que hoy sea una sola esfera de confianza

---

# 3 · PROJECT

Las cuatro cosas están **correctamente separadas**, y se comprobó en el ensayo
del expediente:

| | dónde vive | verificado |
|---|---|---|
| **Identidad canónica** | `projects.id`, con `project_ref` para los alias | La obra `1` tiene 8 alias y ninguno duplica un código |
| **Membresía** | `project_users(project_id, user_id, assigned_at)` — **sin columna de rol** | Es la frontera real de todo |
| **Empresas participantes** | `project_companies(project_id, company_id, funcion)` | La misma empresa es CONTRATISTA en A y PROYECTISTA en B |
| **Función contractual** | Del par (empresa, obra). **De la persona se DERIVA** | No existe ninguna columna que pueda contradecirla |

Y **función ≠ permiso** está probado por su lado malo: el auxiliar es
CONTRATISTA igual que el residente, su perfil del sistema es `user`, y ser
CONTRATISTA no le deja tocar el directorio.

### `CERRADA AHORA`

---

# 4 · TOOL

## Project Tool Activation — **no existe**

No hay ningún concepto de herramienta activada por proyecto. Lo único parecido
es `DEPLOY_PROFILE=portal|completo`, que es **de instancia**, no de obra, y
decide 151 rutas frente a 258.

**¿Hace falta ahora?** No, y por una razón concreta: en una instancia dedicada a
**una entidad con una cartera de obras del mismo tipo**, todas las obras usan
las mismas herramientas. Activar Reviews en unas obras y no en otras resuelve un
problema que este cliente no tiene.

**¿Crea deuda estructural diferirlo?** **No.** Activation es una tabla
`project_tools(project_id, tool, activo)` consultada en el middleware por
prefijo de ruta. **No toca permisos, ni usuarios, ni proyectos** — se añade
encima. Introducirla en la Generación 2 no obliga a reescribir nada de lo que ya
existe.

Un matiz honesto: **la interfaz ya oculta lo que no aplica** —«Informes» se
retiró en el barrido— pero eso es una decisión de código, no un dato por obra.
Si un cliente pide «esta obra no usa Red Lines», hoy no hay dónde decirlo.

### `PUEDE ESPERAR A ESCALA ENTERPRISE`

## Member Tool Access — **no existe, y aquí sí hay un matiz**

Pertenecer a una obra hoy implica **poder usar todas sus herramientas**, con dos
salvedades que ya funcionan:

- El **rol global** limita transversalmente: un `viewer` no crea nada.
- Las **reglas de flujo** limitan por posición: solo el responsable dicta un
  veredicto.

Lo que **no** existe es «este miembro sí ve documentos pero no RFI». En una obra
pública peruana con cuatro papeles, esa granularidad no aparece: quien participa
en el expediente participa en sus consultas.

**Riesgo de diferirlo: bajo.** Member Tool Access es una tabla de la misma forma
que Activation. Pero conviene decir **dónde se notaría antes**: cuando entre un
**tercero externo** —una auditoría, una entidad revisora— que debe ver
documentos y **no** debe ver el registro de RFI. Hoy eso se resolvería a mano
con permisos de carpeta, y **por el hallazgo del punto 0, no se resolvería del
todo**.

### `PUEDE ESPERAR A ESCALA ENTERPRISE` (pero ver el punto 5: hoy no hay con qué sustituirlo)

---

# 5 · RESOURCE — el núcleo del problema

## Qué hace hoy `folder_permissions`, medido

```
Concesiones en TODA la instancia:  1     (una, de nivel `edit`)
```

**El sistema de permisos por carpeta está prácticamente sin usar.** En la
práctica el acceso lo decide el **rol global**: `editor` → `edit` en todo;
`user`/`viewer` → `none` en todo. La granularidad existe y nadie la ejerce.

Semántica real, confirmada en `_get_effective_permission_impl`:

1. **Admin global** → `admin`, siempre. *(Paso 0, corta antes de nada.)*
2. Se sube por la cadena de ancestros acumulando el **MÁXIMO** — herencia
   **aditiva**.
3. El **rol global** actúa de **SUELO**: si es mayor que lo acumulado, gana.

De ahí las tres consecuencias que encontró el ensayo:

- La herencia **suma**, nunca resta.
- Un **`none` explícito no restringe** a quien ya tiene más arriba.
- Un `editor` **alcanza toda la obra** aunque se le deniegue una carpeta.

## Y la regla no es una sola: hoy hay tres

| superficie | qué la gobierna |
|---|---|
| **Navegación** (`file_system_db`) | `get_effective_permission` |
| **Búsqueda** | la misma regla, **desde el cierre V1** — antes tenía la suya |
| **Preview / Descarga** (bytes) | **pertenencia a la obra. NO el permiso de carpeta** |
| **Sharing** | `check_folder_permission(..., 'edit')` **+ acceso a obra + sensibilidad ISO 19650-5** |
| **Reviews** | `check_folder_permission`, nivel según acción |
| **RFI / Red Line** | `check_folder_permission(..., 'viewer')` al adjuntar |

**Sharing es la más rigurosa de todas** — exige `edit` para emitir un enlace de
lectura, y además comprueba si el documento *puede salir del ECD*. **La entrega
directa de bytes es la más laxa.** Esa inversión es el defecto: **compartir un
documento hacia fuera está mejor guardado que abrirlo desde dentro.**

## Semántica objetivo — comparación

| alternativa | qué resuelve | qué cuesta | veredicto |
|---|---|---|---|
| **Grant-only** *(hoy)* | Simple, imposible bloquearse a uno mismo | **No puede reservar una carpeta.** Es el defecto actual | **Insuficiente** |
| **Closest-wins** | Reservar una carpeta es natural: se pone `none` y corta | Un error arriba se hereda hacia abajo sin avisar | **Es el que encaja** |
| **Explicit deny** (deny gana siempre) | Máxima expresividad | Deny gana desde cualquier nivel → depurar «por qué no veo esto» se vuelve difícil, y es la queja clásica de ACC | **No** — expresividad que no se pide |
| **Permisos por persona** *(hoy)* | Directo | No escala: 4 papeles × N carpetas, a mano | **Insuficiente solo** |
| **Permisos por empresa** | Encaja con la realidad: «la Supervisión ve 02 COMPARTIDO» | Requiere `project_companies` — **ya existe** | **Sí, como sujeto** |
| **Permisos por función contractual** | Aún más natural en obra pública | La función **se deriva** de la empresa: mismo mecanismo, mismo dato | **Sí, es la forma preferida** |

### La regla que propongo, en una frase

> **CLOSEST-WINS sobre la cadena de carpetas, con el sujeto pudiendo ser una
> PERSONA, una EMPRESA o una FUNCIÓN CONTRACTUAL, y el rol global como suelo
> SOLO en ausencia de cualquier concesión explícita.**

Por qué encaja sin copiar a ACC ni a Procore:

1. **Closest-wins** es lo que la obra espera: «Dirección es de Dirección». Y no
   necesita un `deny` separado — `none` en el nivel más cercano ya es la
   negativa, con la ventaja de que **se lee mirando una sola carpeta**.
2. **El sujeto por función contractual ya existe**, derivado de
   `project_companies`. No hay tabla nueva: hay una **columna de sujeto** en
   `folder_permissions` (`usuario` / `empresa` / `funcion`).
3. **El rol global deja de ser un suelo universal** y pasa a ser el valor por
   defecto cuando no hay nada dicho. Es el cambio de una línea de significado, y
   el que hace que reservar una carpeta funcione.

Y una condición sin la cual todo lo anterior es decorativo:

> **La regla tiene que aplicarse también en la entrega de bytes.** Mientras
> `_acceso_al_recurso` decida por pertenencia a la obra, cualquier semántica de
> permisos que se elija seguirá siendo una capa de descubrimiento.

### `MÍNIMO A IMPLEMENTAR ANTES DE CONGELAR DOCS` — pero solo una parte. Ver §9.

---

# 6 · ACTION

Las reglas por flujo son **sólidas y homogéneas** donde existen:

| | crear | asignar | responder / aprobar | cerrar | administrar |
|---|---|---|---|---|---|
| **Review** | miembro | fija el flujo; sustituir = rescate de admin | `puede_actuar` **por identidad estricta** | — | sustituir revisor |
| **RFI** | miembro | autor · responsable · admin | **solo responsable** | autor · admin | desatascar reasignando |
| **Red Line** | miembro | autor · responsable · admin | **solo responsable** | autor · admin | ídem |
| **Transmittal** | miembro | — | **acusa el destinatario** | — | admin acusa |

Las de RFI y Red Line no se repiten: se **declaran** como posiciones
(`quien_dicta_veredicto=(RESPONSABLE,)`) y una mecánica común las evalúa, con
`ensayo_de_desacople` vigilando que compartirla no las acople.

## El hueco estructural del que sí hay evidencia

**Transmittals resuelve la identidad del destinatario POR NOMBRE:**

```python
if nombre and re_nom and re_nom == nombre:
    return True          # routes/transmittals.py:315
```

Dos personas llamadas igual → **la equivocada puede acusar recibo de una
emisión formal**. Es exactamente la clase de defecto que este proyecto ya cerró
en Reviews —`puede_actuar` es estricta: con `user_id` presente, **sin respaldo
por nombre ni correo**— y en RFI y Red Line, que solo miran `responsable_id`.

**Transmittals es el único flujo que se quedó fuera de esa corrección.** Y el
acuse de recibo es, contractualmente, de los actos que más importa poder
demostrar.

No hace falta una permission matrix. **La evidencia obliga a una sola cosa: que
el destinatario de una emisión sea una identidad, no un texto.**

### `MÍNIMO A IMPLEMENTAR ANTES DE CONGELAR DOCS`

---

# 7 · RESPONSIBILITY

**Confirmado: sigue siendo una dimensión distinta, y está defendida en la
consulta.**

- `encargos._MI_TRABAJO` empieza por
  `JOIN project_users pu ON pu.project_id = e.project_id AND pu.user_id = …`.
  **La pertenencia es un JOIN, no una comprobación posterior que alguien pueda
  olvidar.**
- `abrir()` **se niega** a crear un encargo sobre un objeto que no existe o cuya
  obra no puede determinar — lo comprobó el ensayo de desacople al intentarlo
  con un id inventado.
- Un encargo dirigido a una **función contractual** alcanza solo a quien **ya
  era miembro**.
- No existe —ni debe existir— ninguna ruta que escriba un encargo:
  `test_no_existe_ninguna_ruta_que_escriba_encargos` lo ata.
- Y se demostró **idempotente**: la segunda pasada de conciliación no mueve nada.

> **Permiso ≠ responsabilidad.** El RFI lo enseña por el lado difícil: quien
> preguntó **tiene** permiso sobre el documento y **no** puede dictar el
> veredicto, porque no le toca.

### `CERRADA AHORA`

---

# 8 · El árbol efectivo

```
Principal                    ✔ EXISTE      users + sessions, identidad numérica
   ↓
Account                      ⚠ IMPLÍCITO   1 instancia = 1 cuenta.
                                           `hubs` NO autoriza: es presentación
   ↓
Project Membership           ✔ EXISTE      project_users. LA FRONTERA REAL
   ↓
Tool Activation              ✘ NO EXISTE   solo DEPLOY_PROFILE, de instancia
   ↓
Tool Access                  ✘ NO EXISTE   ser miembro = usar todas
   ↓
Resource Permission          ⚠ PARCIAL     gobierna DESCUBRIR, no OBTENER.
                                           1 concesión en toda la instancia
   ↓
Action / Workflow Rule       ✔ EXISTE      declarada por posiciones.
                                           Hueco: Transmittal por NOMBRE
   ↓
Responsibility               ✔ EXISTE      proyección reconstruible e idempotente
```

**Lo que sostiene el aislamiento hoy es `project_users`, no la jerarquía.** Por
eso el ensayo del expediente pudo demostrar separación total entre dos obras
aunque falten tres capas: ninguna de ellas es la que separa.

---

# 9 · Clasificación final

| capa | clasificación |
|---|---|
| **1 · Principal** | `CERRADA AHORA` |
| **2 · Account** | `PUEDE ESPERAR A ESCALA ENTERPRISE` — mientras sea una instancia por cliente. Partir `admin` de instancia / de obra es el mínimo **antes de multi-cliente**, no antes de congelar |
| **3 · Project** | `CERRADA AHORA` |
| **4 · Tool Activation** | `PUEDE ESPERAR A ESCALA ENTERPRISE` — aditiva, sin deuda estructural |
| **4b · Member Tool Access** | `PUEDE ESPERAR A ESCALA ENTERPRISE` — con la reserva del tercero externo |
| **5 · Resource Permission** | **`MÍNIMO A IMPLEMENTAR ANTES DE CONGELAR DOCS`** — solo la pieza de §10 |
| **6 · Action** | **`MÍNIMO A IMPLEMENTAR ANTES DE CONGELAR DOCS`** — identidad del destinatario de un Transmittal |
| **7 · Responsibility** | `CERRADA AHORA` |
| **Explicit deny separado** | `NO NECESARIA` — `closest-wins` ya expresa la negativa |
| **Account Membership / Roles** | `NO NECESARIA` para V1 |

---

# 10 · Respuesta a la pregunta final

> **¿Podemos congelar `frontend-docs` con el modelo de acceso actual, o hay una
> pequeña pieza de Foundation/Authorization que conviene implementar AHORA?**

## Sí, se puede congelar — **pero hay dos piezas pequeñas que conviene hacer ahora, y una que NO**

### Lo que conviene AHORA, porque después obliga a reescribir

**A · La columna de SUJETO en `folder_permissions`.**

Hoy la tabla es `(folder_node_id, user_id, permission_level)` con
`UNIQUE(folder_node_id, user_id)`. Cualquier semántica futura que quiera conceder
a una **empresa** o a una **función contractual** necesita cambiar esa clave —
y con concesiones ya emitidas, cambiar una clave única es una migración con
datos vivos, no una columna nueva.

**Ahora cuesta casi nada: hay UNA concesión en toda la instancia.** Dentro de un
año, con permisos repartidos en obras reales, será una migración de verdad.

> Añadir `sujeto_tipo` (`usuario|empresa|funcion`) y `sujeto_id`, con la clave
> única sobre los tres. **Sin cambiar todavía la semántica** —seguiría siendo
> aditiva— solo dejando el sitio hecho.

**B · La identidad del destinatario de un Transmittal.**

`recipients` es JSONB con `{email, name}` y el acuse se resuelve por texto. Cada
emisión que se acumule con destinatarios sin `user_id` es un registro más que
después habrá que **adoptar a mano**, exactamente como pasó con los 25 RFI y los
33 Red Lines heredados. **Esa deuda crece sola y por emisión.**

> Guardar `user_id` en `recipients` al emitir, y que `_es_destinatario` compare
> identidades cuando lo haya —con el respaldo por texto solo para las emisiones
> ya existentes—. Es el patrón **ya construido y probado tres veces** en este
> proyecto.

### Lo que NO conviene ahora

**Cambiar la semántica de permisos a `closest-wins` y aplicarla a los bytes.**

Es lo correcto como destino, y está argumentado en §5. Pero **no es pequeño**:
toca `_get_effective_permission_impl`, `_acceso_al_recurso`, la navegación, la
búsqueda y las seis superficies. Y **hoy no hay presión real**: una concesión en
toda la instancia, y una única esfera de confianza —proveedor y entidad son la
misma— donde «todos los miembros ven todo el expediente de su obra» es una
descripción exacta de cómo trabaja esta obra.

**Debe hacerse antes de dos cosas concretas, no antes de congelar:**

1. Antes de **prometer confidencialidad por carpeta** a un cliente.
2. Antes de que entre en la obra **alguien que no deba ver todo el expediente**
   — un tercero externo, una auditoría, un subcontratista.

Mientras eso no ocurra, congelar con el modelo actual es una decisión defendible
**siempre que quede escrito lo que el modelo hace y lo que no**. Que es el objeto
de este documento.

---

## En una línea

> **`frontend-docs` se puede congelar. Antes conviene hacer dos cosas pequeñas
> —la columna de sujeto en `folder_permissions` y la identidad del destinatario
> de un Transmittal— porque las dos son baratas hoy y caras después. La
> semántica de permisos puede esperar, pero no puede olvidarse: hoy el permiso
> de carpeta decide qué se DESCUBRE, no qué se OBTIENE.**

---

**STOP.** No se implementó nada. No se tocó `frontend-react`, 3D, 4D ni LOB.
