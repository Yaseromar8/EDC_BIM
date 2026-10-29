# 45 · Cómo separan los datos de cada cliente (Tandem y el resto) y qué hace ALEPHIA — INVESTIGACIÓN

29-oct-2026. Solo análisis. El dueño:
- «claro, pero eso sería siempre y cuando este sea el modelo de control de todo un proyecto»;
- «¿cómo hace Tandem? Veo que cualquier usuario se crea su cuenta y puede subir sus propios modelos. ¿Cómo funciona
  eso? ¿Son varios Postgres para cada usuario?».

Límite de esta investigación: la documentación técnica de Tandem (`aps.autodesk.com/en/docs/tandem`) se dibuja con
JavaScript y la herramienta no la pudo leer. Lo de Tandem sale de sus páginas de ayuda, sus condiciones de uso, sus
ejemplos oficiales en GitHub y resúmenes de búsqueda. **Autodesk no publica qué base de datos usa por dentro.**

## 1 · «Si ALEPHIA no es el control de todo el proyecto»

Es cierto: el centro de datos (doc 44) **rinde más cuanto más del proyecto vive en el ECD**. Pero no tiene que ser todo o
nada:
- **Se ve lo que la obra usa.** Si una obra solo sube modelos, el centro muestra el modelo y la Planilla. Las fuentes de
  observaciones, revisiones o plan de entregas aparecen cuando la obra empieza a usarlas.
- **Lo que vive fuera puede entrar por puertas estándar**, sin que la obra cambie de herramienta:
  - CSV o Excel: un cronograma, valorizaciones;
  - **BCF**: observaciones de Solibri, Navisworks o Revizto;
  - **IDS**: requisitos de información.

  Entran como una fuente más.
- **Por norma, el ECD tiende a ser el centro:**
  - la Guía Nacional BIM lo hace obligatorio en la inversión pública desde ago-2026;
  - el Reglamento de la Ley 32069 (art. 154.5) lo trata como fuente para los aplicativos del Estado.

  La apuesta de ALEPHIA es justamente esa.

## 2 · Cómo funciona Tandem

**Cuentas.** Cualquiera entra con su cuenta de Autodesk y usa **Tandem Free**. Las condiciones y la página de
comparación de Autodesk lo limitan a:
- **3 instalaciones**, sin traspaso;
- **500 activos**;
- **archivos de hasta 500 MB**;
- **10 importaciones de modelos por instalación**.

Páginas más antiguas hablan de 1.000 activos, 200 *streams* y 14 días de historia de series de tiempo; algunas cuentas
aún se bloquean con esos límites. Es una prueba gratuita: para más, hay que pagar o tener ciertas suscripciones de
Autodesk.

**Cómo organiza los datos** (ayuda, ejemplos oficiales y resúmenes):
- **Cuenta o equipo → instalación** (el «gemelo») **→ modelos**:
  - cada modelo importado (Revit o IFC) tiene su identificador;
  - cada instalación tiene además un **modelo por defecto** para los datos no gráficos (sensores y otros elementos).
- **Cada modelo tiene su propio esquema** de propiedades. Las propiedades se identifican con un código interno por
  modelo, y las aplicaciones traducen esos códigos con el esquema.
- Las **plantillas de instalación** (clasificación + parámetros) se reutilizan entre instalaciones. Una nota de
  Autodesk dice que **cada instalación tiene su propia base de datos**. Solo la vi en un resumen de búsqueda y no se
  pudo leer la página.
- Las consultas van **modelo por modelo**: una instalación de tres modelos son tres consultas.
- Hay **historial de cambios** de la instalación y de los modelos, y una auditoría de permisos.

**¿Un Postgres por usuario?** No hay nada que lo indique, y no sería lo habitual. **El límite entre clientes es la
cuenta o la instalación, no el usuario**: muchos usuarios trabajan en la misma instalación según sus permisos. Qué motor
usa por dentro, Autodesk no lo publica.

## 3 · Las tres maneras de separar clientes (patrones de la industria)

| Patrón | Qué es | A favor | En contra |
|---|---|---|---|
| **Silo** | Una base de datos por cliente | El aislamiento más fuerte; copia y restauración por cliente; datos en el país que pida | Hay que crear, migrar, respaldar y vigilar cada una: el coste crece con cada cliente |
| **Puente** (*bridge*) | Una base y un esquema por cliente | Buen aislamiento para decenas de clientes | Migraciones por esquema |
| **Piscina** (*pool*) | Tablas compartidas, con el identificador del cliente en cada fila | El más barato y una sola migración | El aislamiento depende de que **ninguna consulta olvide el filtro**; un cliente pesado puede frenar a los demás |

**Lo que se recomienda:**
- **piscina por defecto**, con **seguridad por filas** (RLS) de Postgres como segundo candado, para que la base «no
  deje olvidar» el filtro;
- la aplicación conecta con un rol que no se la puede saltar;
- el cliente se fija en cada transacción;
- los **clientes grandes o regulados**, a un silo, con el mismo esquema;
- y una tabla que diga dónde vive cada cliente, para poder moverlo después.

## 4 · Qué hace ALEPHIA hoy (leído en el código)

- **Una sola base Postgres** (Cloud SQL) para todas las obras: es el patrón **piscina**. Cada tabla lleva su obra
  (`project_id` o `model_urn`).
- **El aislamiento lo pone la aplicación**:
  - `guardia_de_obra` y `guardia_de_recurso` en `perimetro_de_obra.py`;
  - el control central del middleware;
  - las pruebas de cobertura de autorización.
- **No hay seguridad por filas (RLS) en la base**: no hay `CREATE POLICY` en el código.
- Se separan **dos identidades de base**: `ecd_app` solo para datos y `ecd_migrator` para el esquema.
- **Las cuentas son solo por invitación** (`routes/auth.py`):
  - el registro abierto está apagado salvo `ALLOW_OPEN_REGISTRATION=true`;
  - entrar con Google sin invitación devuelve «pide al administrador de la obra que te invite».
- La **organización** existe como empresas de la obra y roles de entidad. No hay todavía una «cuenta» por encima de las
  obras, como la cuenta de Tandem.

## 5 · Si un día ALEPHIA quisiera alta libre como Tandem

**No haría falta un Postgres por usuario.** Haría falta:
1. **Una «cuenta» (inquilino) por encima de las obras**: la empresa o la entidad que contrata. Cada obra cuelga de una
   cuenta.
2. **Seguridad por filas en la base, como segundo candado** sobre las guardias de la aplicación. Con alta libre, un
   olvido en una consulta dejaría de ser un riesgo interno y pasaría a ser un riesgo entre desconocidos.
3. **Cuotas por cuenta**, como Tandem: obras, MB y modelos. Producción tiene 1 CPU y 2 GB, y ya hubo caídas por memoria
   con 6 usuarios: un cliente pesado frenaría a los demás.
4. **El coste de Autodesk**: cada modelo que se sube se traduce con nuestra cuenta de Autodesk. Habría que medir su
   coste antes de abrir el alta.
5. **Un silo solo para quien lo exija**, por ejemplo una entidad pública que pida sus datos aparte. Se haría con el mismo
   esquema, como recomienda la industria.

## 6 · Decisiones del dueño

1. ¿El alta sigue **solo por invitación**? Es tu política de hoy, y es la que recomiendo mientras el producto se
   prueba con obras reales.
2. ¿Ponemos ya la **seguridad por filas** como segundo candado, aunque no haya alta libre? Es defensa en profundidad;
   necesita una migración y probarla con todas las rutas.
3. ¿Se crea la **cuenta (inquilino) por encima de las obras**? Es lo que permitiría la vista entre obras del centro de
   datos (doc 43 §5.5) y, más adelante, el alta libre.

## Fuentes

- Autodesk Tandem:
  - [Tandem Free](https://intandem.autodesk.com/get-started-free/) y [acceso a Tandem Free](https://knowledge.autodesk.com/support/tandem/learn-explore/caas/CloudHelp/cloudhelp/ENU/Tandem-About/files/Tandem-About-access-tandem-free-html-html.html)
  - [comparación de planes](https://www.autodesk.com/products/tandem/compare) y [condiciones por tipo de oferta](https://www.autodesk.com/company/terms-of-use/en/offering-types-and-benefits)
  - [límite de uso de Tandem Free](https://www.autodesk.com/support/technical/article/caas/sfdcarticles/sfdcarticles/You-have-reached-the-usage-limit-for-your-account-when-opening-Tandem-Free.html)
  - [conceptos básicos de la API](https://aps.autodesk.com/en/docs/tandem/v1/developers_guide/basics) y [propiedades calificadas](https://aps.autodesk.com/en/docs/tandem/v1/developers_guide/basics/qual_props) (no se dejaron leer)
  - [plantillas de instalación](https://help.autodesk.com/cloudhelp/ENU/Tandem-Specify/files/tandem-facility-templates.html)
  - [ejemplo oficial tandem-sample-stats](https://github.com/autodesk-tandem/tandem-sample-stats) (leído), [tandem-sample-rest](https://github.com/autodesk-tandem/tandem-sample-rest/blob/main/README.md) y [tutorial-rest](https://github.com/autodesk-tandem/tutorial-rest)
- Separar clientes:
  - [Multi-Tenant SaaS on PostgreSQL: Silo, Bridge or Pool](https://dev.to/ashtech52/multi-tenant-saas-architecture-on-postgresql-silo-bridge-or-pool-4be9) (leído)
  - [Silo, Pool, or Bridge](https://dev.to/swethagolla/multi-tenant-isolation-silo-pool-or-bridge-2d07)
  - [AWS, SaaS Tenant Isolation Strategies](https://docs.aws.amazon.com/whitepapers/latest/saas-tenant-isolation-strategies/saas-tenant-isolation-strategies.html) (no se pudo leer: la conexión se cortó)
- ALEPHIA: `backend/routes/auth.py`, `backend/perimetro_de_obra.py`, `backend/ARRANQUE.md` (identidades de base)

## 7 · Caso del dueño: «la próxima semana se lo vendo a otra municipalidad, ¿verá lo mío o empieza en blanco?»

Comprobado en el código el 29-oct.

**Lo que está separado (empezaría en blanco):**
- **Las obras**: en View y en Docs, un usuario que no es administrador de la plataforma **solo ve las obras en las que
  es miembro** (`project_users`; `GET /api/projects` filtra por pertenencia). Un visitante sin sesión recibe una lista
  vacía.
- Todo lo que cuelga de una obra va con ella: modelos, documentos, revisiones, observaciones, Planilla, Tablero y vistas.
  Además lo vigilan las guardias de obra.
- El alta es solo por invitación. Quien entra con un código de invitación se une a esa obra y a ninguna otra.

**Lo que NO está separado.** La plataforma está pensada como **una sola entidad**: las plantillas se llaman «de la
entidad» y los roles son «de entidad».
1. **El administrador de la plataforma** (`role = 'admin'`) **ve todas las obras de todos los hubs**. Si a alguien de la
   otra municipalidad lo haces administrador, ve lo tuyo. Tendría que ser solo administrador de su obra.
2. **`GET /api/hubs` es público**, sin sesión (`PUBLIC_GET_PREFIXES` en `auth_middleware.py`). Lista **todas** las
   municipalidades o cuentas activas con su número de obras. Cualquiera, sin entrar, ve los nombres.
3. **Catálogos comunes a todos**:
   - el **directorio de empresas** (`companies`, nombre único global, sin hub);
   - las **plantillas de obra** (`plantillas_de_obra`, sin hub; pueden nacer de una obra tuya y llevan su estructura de
     carpetas, empresas e idoneidad);
   - los cargos.

   Que los perfiles de acceso y los catálogos de idoneidad sean comunes no se comprobó.
4. **Una sola lista de usuarios** del sistema.
5. **La misma infraestructura**:
   - el mismo servidor (1 CPU, 2 GB): el uso de una frena a la otra;
   - la misma cuenta de Autodesk para traducir modelos;
   - la misma base.

**Qué haría falta antes de un segundo cliente.** Hay dos caminos:

| Camino | Qué es | A favor | En contra |
|---|---|---|---|
| **A · Despliegue aparte** (silo) | Otra base y otro servidor en Render para la otra municipalidad, con el mismo código | Separación total **ya**, sin tocar el código; sus datos aparte, que una entidad pública puede pedir | Doble coste y doble mantenimiento: cada despliegue y cada migración, dos veces |
| **B · El hub como cuenta de verdad** (piscina) | Cada hub con sus administradores, su directorio de empresas, sus plantillas y sus usuarios; `/api/hubs` con sesión y filtrado; después, seguridad por filas | Un solo sistema que escala a muchas municipalidades | Trabajo de código y de pruebas: migraciones, el perímetro y todas las rutas que leen catálogos |

**Recomendación:**
- para **un** segundo cliente **la próxima semana**, el **camino A**, porque es seguro y no exige cambiar el código;
- el **B**, como trabajo planificado si vienen más.

Lo que conviene cerrar igual, en cualquier caso: que `/api/hubs` deje de ser público.
