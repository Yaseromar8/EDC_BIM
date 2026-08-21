# NÚCLEO MÍNIMO PROFESIONAL — decisión técnica

**20-ago-2026** · Cierra los informes [17](17-foundation-v2-architecture-discovery.md) y [18](18-cierre-de-seis-puntos-foundation-v2.md)
**No se ha implementado nada.**

---

## La conclusión, en una frase

> **El producto ya tiene el cuerpo de un CDE profesional. Lo que le falta no son
> funciones: es que sus fronteras, que están declaradas, todavía no bloquean.**

Documentos con estados ISO 19650, códigos de idoneidad, versionado con huella
SHA-256, emisiones y transmittals, revisiones, RFIs, permisos por carpeta con
herencia, nomenclatura configurable por obra, registro de actividad, exportación
verificable, copia y restauración ensayada (83.410/83.410). Eso **ya está**, y
está mejor construido de lo que supuse al empezar.

Lo que no está: **la obra a la que pertenece cada cosa no siempre se puede
determinar, y mientras no se pueda, la autorización por obra no puede encenderse.**

Todo el núcleo mínimo sale de ahí. **Tres cosas.** No veintiséis, ni las siete
de mi propia lista anterior.

---

## Qué cambio respecto del informe 17, y por qué

Me pidió reconsiderar sin atarme a mi clasificación previa. La reviso entera.

| antes | ahora | por qué |
|---|---|---|
| **A1** con `project_uid UUID` | **A1 sin UUID** | Sobreingeniería. `projects.id` **ya es** clave primaria única y estable. Un UUID no arregla el problema real (los alcances *almacenados* no son `projects.id`) y sí obliga a tocar 24 tablas. Ver §«Por qué NO un UUID» |
| **A1** con `project_alias(alias TEXT PK)` | **retirado** | Colisiona. Ya hoy: 4 obras `HOSPITAL_MATUCANA` y una sola fila posible |
| **A2** encender ENFORCE | **se mantiene**, con precondiciones medidas | |
| **B1** integridad referencial (SHOULD) | **sube a AHORA** | Una membresía huérfana puede **revivir** sobre otra obra |
| **B2** Account tipado (SHOULD) | **baja a DESPUÉS** | Con instancia dedicada, **la instancia ya es la cuenta**. `hubs` es agrupación de cartera, no frontera de inquilino |
| **B3** separar roles (SHOULD) | **baja a DESPUÉS** | Ver §«Por qué B3 baja». La seguridad la sostienen membresía + permisos de carpeta, que existen |
| **B4** frontera de IA (SHOULD) | **baja a DESPUÉS** | Decisión de producto: **no vender IA en el primer producto**. En perfil portal ya devuelve 404 |
| **B5** ciclo de vida 5 estados | **baja a DESPUÉS** | `active`/`archived` basta para un piloto |
| — | **eliminado**: sello de inmutabilidad | Iba a proponerlo. **Ya existe**: `integridad.py:91` y `sellar_versiones_antiguas.py:129` escriben la huella con `WHERE ... AND sha256 IS NULL`. Nada actualiza `gcs_urn` ni `version_number`. No se construye lo que ya está |

---

# AHORA — núcleo mínimo antes del primer cliente

## 1 · Identidad de obra determinista

**Qué es:** que toda petición y todo dato se resuelvan a **una** obra, siempre,
por una tabla explícita — no por heurística — y que los identificadores de
alcance dejen de fabricarse a partir de datos que el usuario puede cambiar.

Cuatro piezas:

1. **Tabla de referencias explícita** `project_ref(account, kind, alias) → project_id`,
   con `kind ∈ {PROJECT, LEGACY_PATH, MODEL, FRONT, DATASET}`. Sustituye la
   heurística de `resolve_project_id` (`db.py:1087`): prefijo antes del `_`,
   coincidencia por nombre, y **«si hay una sola obra activa, esa»**.
2. **El resolvedor pasa a ser total**: o resuelve, o dice que no sabe. Nunca
   adivina. Los alias ambiguos —los cuatro `HOSPITAL_MATUCANA`— **no se resuelven
   solos**: se marcan y se deciden a mano.
3. **`dataset_id` entra en `_CLAVES_OBRA`** (`auth_middleware.py:413`), donde hoy
   no está, resolviéndose por `lob_datasets.project_id`.
4. **El navegador deja de acuñar alcances.** Hoy:
   ```jsx
   // frontend-react/src/App.jsx:4861
   modelUrn={selectedProject?.baseName ? `proyectos/${selectedProject.baseName.replace(/ /g,'_')}` : 'global'}
   ```
   El identificador de alcance se fabrica **del nombre visible de la obra**.
   Renombrar la obra cambia el alcance de todo lo que se escriba después. Pasa a
   enviarse el `projects.id`, que no cambia.

| | |
|---|---|
| **1 · ¿Qué problema resuelve?** | Que el sistema no siempre sabe de qué obra es un dato. Medido: de siete vocabularios de alcance, `resolve_project_id` devuelve `None` para tres — `dataset_id` (11 tablas), `global` y los ids de ACC |
| **2 · ¿Por qué ahora?** | Porque el alias se deriva del **nombre visible** y del **id de la obra**, y ambos entran en los datos. Cada documento y cada obra que entren fijan más alias en filas históricas. Y porque el propio código lo avisa: *«el día que entrara la segunda [obra], la mitad del sistema cambiaría de comportamiento a la vez»* (`db.py:1087`) |
| **3 · ¿Si lo postergamos?** | No se puede encender la autorización por obra (§2). La segunda obra del primer cliente rompe el criterio «una sola obra activa». Y renombrar una obra parte su historial en dos alcances |
| **4 · ¿Afecta datos existentes?** | **No los reescribe.** Añade una tabla y la puebla desde los valores observados. Los `model_urn` históricos se quedan como están, para siempre |
| **5 · ¿Afecta ficheros o huellas?** | **No.** Ni una ruta de objeto, ni un SHA-256, ni un byte |
| **6 · ¿Afecta autorización?** | Sí: es su cimiento. Mejora el aislamiento, no lo relaja |
| **7 · ¿Fundación o función?** | **Fundación.** No se ve en pantalla |
| **8 · ¿Útil con 1 cliente?** | Sí, en cuanto tenga **dos obras** — que es el caso de la primera entidad |
| **9 · ¿Válida con 100?** | Sí. La clave `(account, kind, alias)` ya admite varias cuentas sin rediseño |
| **10 · ¿Algo más simple?** | Sí, y lo adopto: **no un UUID**. Ver abajo |

### Por qué NO un `project_uid` UUID

Lo propuse en el informe 17 y lo retiro. Tres razones:

- `projects.id` **ya es** clave primaria, única y estable. Nada la cambia.
- Un UUID **no resuelve el problema real**, que es que los alcances *almacenados*
  (`proyectos/PQT8_TALARA`, `1_CANAL`, `653fea31-…`) no son `projects.id`.
  Seguiría haciendo falta exactamente la misma tabla de traducción.
- Obligaría a tocar las 24 tablas que llevan `project_id` como valor.

El futuro que un UUID protegería —varias entidades en una misma base— es
**MUCHO DESPUÉS**, y `project_ref` ya lleva la columna de cuenta en su clave. Si
llega ese día, se namespacea sin reescribir historia.

**Tamaño: MEDIO.** Lo caro no es el código: es **el inventario** de los alias
reales y decidir a mano a qué obra pertenece cada uno. Eso es trabajo de
ingeniería, no de programación.

---

## 2 · Que la autorización por obra bloquee de verdad

**Qué es:** encender `ENFORCE_PROJECT_AUTHZ` y demostrarlo.

Hoy la comprobación **observa y anota**, no bloquea. Con un cliente y un
administrador no se nota. Con una supervisión externa, sí.

**No es un interruptor.** Precondiciones medidas:

| precondición | evidencia |
|---|---|
| `dataset_id` debe resolver | No está en `_CLAVES_OBRA` (`auth_middleware.py:413`) y `/api/lob` **sí** está en `_PROJECT_SCOPED_PREFIXES` (:635) → **403 en todo el 4D LOB** para cada no administrador |
| Decidir qué es `global` | No resuelve. Hay datos reales de obra dentro |
| Sembrar membresías | **14 no administradores activos; solo 5 con alguna membresía.** Los otros 9 quedarían fuera de todo |
| Repetir la batería de aislamiento | Es justo lo que cambia |

| | |
|---|---|
| **1 · ¿Qué problema resuelve?** | Que la frontera entre obras está declarada pero no se aplica. Es la diferencia entre decir que hay separación y tenerla |
| **2 · ¿Por qué ahora?** | Porque una vez que hay participantes externos, encenderlo deja de ser una mejora y pasa a ser un incidente que no ocurrió. Y porque las membresías se acumulan: sembrarlas para 14 usuarios es una tarde; para 200, un proyecto |
| **3 · ¿Si lo postergamos?** | El aislamiento entre obras sigue siendo una intención. No es defendible ante un cliente con contratista y supervisión en la misma obra |
| **4 · ¿Afecta datos existentes?** | Solo añade filas de membresía. No modifica ninguna |
| **5 · ¿Afecta ficheros o huellas?** | **No** |
| **6 · ¿Afecta autorización?** | Es el punto |
| **7 · ¿Fundación o función?** | **Fundación** |
| **8 · ¿Útil con 1 cliente?** | Sí, desde el primer participante externo |
| **9 · ¿Válida con 100?** | Sí |
| **10 · ¿Algo más simple?** | No. Lo simple **es** esto: el mecanismo ya está escrito y es fail-closed (`auth_middleware.py:834`). Falta que sus entradas resuelvan |

**Tamaño: PEQUEÑO** una vez hecho §1. **Lo que no es pequeño es la reauditoría.**

---

## 3 · Integridad referencial mínima

**Qué es:** que `projects.id` y `hubs.id` se comporten como claves.

- `project_users.project_id → projects.id ON DELETE CASCADE` — hoy **no existe**,
  pese a que `ensure_users_tables` la declara. Ni en instancia nueva.
- `projects.hub_id → hubs.id`
- `UNIQUE (hub_id, name)` en `projects` — hoy **no hay UNIQUE sobre `name`** y ya
  hay **cuatro obras llamadas `HOSPITAL_MATUCANA`**
- Arreglar `create_hub`, que ante colisión hace `ON CONFLICT DO NOTHING` y aun así
  responde **`201 Created`** devolviendo el id del hub ajeno (`routes/projects.py:221-227`)

| | |
|---|---|
| **1 · ¿Qué problema resuelve?** | **Resurrección de membresías.** Sin `ON DELETE CASCADE`, borrar una obra deja filas en `project_users` apuntando a un id que ya no existe. Y los ids se acuñan con `int(time.time()) % 100000`, que **da la vuelta cada 27,7 horas**: un id puede repetirse. Cuando se repite, la membresía huérfana **revive sobre una obra distinta** — un contratista de una obra cerrada aparece como miembro de otra |
| **2 · ¿Por qué ahora?** | Porque las claves ajenas solo se pueden añadir si los datos están limpios. Hoy lo están (comprobado: los 3 valores de `project_users` existen en `projects`). Con un año de uso, puede que no |
| **3 · ¿Si lo postergamos?** | Se convierte en una limpieza de datos antes de poder añadirlas. Y hasta entonces, acceso indebido silencioso |
| **4 · ¿Afecta datos existentes?** | No los modifica. `UNIQUE (hub_id, name)` **exige renombrar 3 de las 4 obras duplicadas** — todas de prueba |
| **5 · ¿Afecta ficheros o huellas?** | **No** |
| **6 · ¿Afecta autorización?** | Sí, la protege del modo de fallo más difícil de detectar: el que no da error |
| **7 · ¿Fundación o función?** | **Fundación** |
| **8 · ¿Útil con 1 cliente?** | Sí |
| **9 · ¿Válida con 100?** | Sí |
| **10 · ¿Algo más simple?** | No. Cuatro restricciones y un `if` |

**Tamaño: PEQUEÑO.**

---

## Orden y prueba de aceptación

```
3 (claves ajenas)  →  1 (identidad determinista)  →  2 (encender)  →  reauditar
   barato, sin           el trabajo de verdad         un interruptor
   cambio de
   comportamiento
```

**Una sola prueba decide si el núcleo funciona:**

> Crear una **segunda obra** en la instancia, con su propio usuario, y demostrar
> que **nada cambia de comportamiento** en la primera: mismos documentos, mismos
> permisos, mismos alcances resueltos, y **403 cruzado en ambos sentidos**.

Es la prueba que el propio `db.py:1087` dice que hoy no se pasaría. Si se pasa,
el núcleo está.

---

# DESPUÉS — cuando exista uso real que lo justifique

| qué | por qué no ahora | por qué no es peligroso postergarlo |
|---|---|---|
| **Roles por obra** (`project_users.role`) | Ver §«Por qué B3 baja» | `ALTER TABLE ADD COLUMN` aditivo. Ninguna migración de datos |
| **Account tipado** (`hubs` → Account con `type` y membresía) | Con instancia dedicada, **la instancia ya es la cuenta**. Tipar `hubs` ahora es diseñar para un problema que no se tiene | Aditivo. `hubs` ya existe con su columna en `projects` |
| **Activación de herramientas por obra** | No hay ningún cliente que quiera media plataforma. El perfil de despliegue ya recorta el perímetro | Tabla nueva, sin tocar nada |
| **Plantillas de proyecto** | Cada obra ya tiene su configuración copiada, no referenciada — que es la propiedad difícil y ya se cumple | Al introducirlas, **sembrar y copiar**, nunca referenciar |
| **IA con frontera de obra** (B4) | **Decisión de producto: no vender IA en el primer producto.** En perfil portal ya devuelve 404 | Cuando se venda: dar obra a `ia_documentos_preparados`, quitar el `or "1"` de `routes/ai.py:667`, y cerrar los dos puntos abiertos del informe 18 (§6.2 y §6.5) **antes**, no después |
| **Ciclo de vida de 5 estados** | `active`/`archived` basta | Una columna |
| **Promover Location/WBS de LOB a concepto de proyecto** | Ya existe y funciona, y **para obra lineal** (`lob_linear_zones` con progresivas, `project_frentes`) | Renombrado y elevación, sin migración |
| **Anillos de despliegue y expand/contract formal** | Con una instancia no hay anillos que recorrer. El bootstrap ya es aditivo e idempotente, que **es** la fase expand | Se añade cuando haya versiones distintas conviviendo |
| **SSO / IdP** | Ya se decidió: endurecer lo propio | El 2FA propio funciona (14/14) |

## Por qué B3 baja a DESPUÉS

Lo subí a MUST en el informe 18. Lo bajo, y digo por qué me equivoqué.

`project_users` es `(project_id, user_id, assigned_at)` — **sin columna `role`**.
Concluí que con participantes externos eso es insuficiente. Pero al mirar cómo se
combinan las piezas que **ya existen**:

- La **membresía** limita **a qué obras** entra un usuario.
- `users.role` (`viewer`/`editor`) limita **qué puede hacer**.
- `folder_permissions`, con herencia, limita **dónde** dentro de la obra.

Un contratista con rol `editor` y membresía **solo en la obra A** es editor
**solo en la obra A**. Eso funciona. Y si además hay que encerrarlo en su carpeta,
`folder_permissions` lo hace.

Lo único que **no** se puede expresar es un mismo usuario con papeles distintos en
dos obras: *viewer* en A y *editor* en B. Eso es una **limitación de producto**,
no un agujero de seguridad. Y añadir la columna después es aditivo.

Y sobre el salto del administrador (`auth_middleware.py:813`,
`perimetro_de_obra.py:262`): con **una instancia por entidad**, el administrador
global **es** el administrador de la entidad. No es un fallo — es el diseño
correcto. Solo se convierte en problema cuando una instancia aloja a varias
entidades, y eso es MUCHO DESPUÉS.

---

# MUCHO DESPUÉS — no lo necesitamos todavía

| qué | por qué |
|---|---|
| **Varias entidades en una instancia** (*pooled*) + resolvedor de emplazamiento | La instancia dedicada es hoy nuestra mejor propiedad: el aislamiento es **físico**, no lógico. Renunciar a eso por ahorro de infraestructura, con menos de diez clientes, es cambiar la garantía más fuerte del producto por una factura menor |
| **Plano de control** | Con 1–5 entidades, el plano de control es la guía de despliegue y una hoja de cálculo. `/api/health` ya dice versión y rama |
| **Grafo genérico de objetos de proyecto** | Sin ningún consumidor. Las relaciones tipadas que existen funcionan |
| **Sincronización offline móvil** | No hay deuda estructural: las ids del dominio ya son UUID, así que un cliente offline podrá acuñar sin coordinarse |
| **Facturación y medición de consumo** | No hay nada que medir todavía |
| **Colaboración entre cuentas** | Requiere el modelo de Account maduro primero |
| **Motor de autorización FGA/ReBAC, o RLS de PostgreSQL** | Tentador y prematuro. Con instancia dedicada el aislamiento fuerte ya es físico. Vuelve a ser la pregunta correcta el día del *pooled* |
| **OpenCDE / BCF / IFC** | El modelo de estados + idoneidad + emisiones **encaja bien**, así que llegará barato. Pero solo cuando un cliente lo pida |

## Y esto no lo construyamos nunca

**Microservicios.** El acoplamiento medido es mínimo: **3 importaciones cruzadas**
entre los 27 ficheros de `routes/`. Un monolito modular es la respuesta correcta
para este producto, y ya está casi ahí. Partirlo añadiría fronteras de red donde
hoy hay llamadas a función, y con ellas fallos parciales, versionado de contratos
y trazas distribuidas — todo el coste, ninguna de las razones.

---

## Lo que ya está bien y no se toca

Digo esto con el mismo peso que las recomendaciones, porque rehacerlo sería el
error más caro de todos:

- **El modelo documental.** `file_nodes` / `file_versions` ya separa identidad
  (`id`, `version_number`, UUID) de contenido (`sha256`) y de almacenamiento
  (`gcs_urn`). Es el patrón correcto y ya está.
- **La inmutabilidad del contenido.** Los dos únicos sitios que escriben la huella
  usan `WHERE ... AND sha256 IS NULL`, con el motivo escrito
  (`integridad.py:80-92`). Nada actualiza `gcs_urn` ni `version_number`.
- **El perímetro por perfil de despliegue.** 151 rutas frente a 258, probado por
  comportamiento y no por lista.
- **El guardián documental**, fail-closed por diseño escrito
  (`perimetro_de_obra.py:243-282`).
- **La configuración por obra** (`nomenclatura_config`, `idoneidad_catalogo`,
  `sensibilidad_catalogo`), **copiada y no referenciada** — que es exactamente la
  propiedad que hay que conservar cuando lleguen las plantillas.
- **Copia, restauración y exportación**, ensayadas.
- **La verificación de esquema al arrancar**, que impide arrancar con el esquema
  incompleto.

---

## Recomendación final

**Tres cosas antes del primer cliente**, en este orden: claves ajenas, identidad
determinista, encender la autorización. Ninguna reescribe un documento, una ruta
de objeto ni una huella. Después, **parar** y reauditar autorización, aislamiento
y restauración — que son las tres evidencias del GO que este trabajo invalida.

Todo lo demás —Account, herramientas, plantillas, grafo, plano de control, IA,
*pooled*— se puede añadir sobre esa base **sin reconstruir el producto y sin tocar
la información de los clientes**. Que es exactamente el criterio que usted puso.

La forma más rápida de llegar a un producto profesional utilizable no es añadir
funciones. Es **terminar de aplicar las fronteras que el producto ya declara**.

---

**No se ha implementado nada.**
