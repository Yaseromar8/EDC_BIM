# 47 · Separación entre clientes: cuenta de entidad y cuenta personal, sin que nada se cruce — DISEÑO, LEY Y HALLAZGO

29-oct-2026. Solo análisis, sin código. El dueño:
1. «No solo entidades: también estudiantes, ingenieros… como ACC, que cualquier persona compra en su web. Pero se
   deberían ofrecer dos niveles de seguridad, **entidad y persona**. Me quiero concentrar en **cómo hacemos esa
   separación y que no se cruce nada**».
3. «¿A qué te refieres con la regla de Aconex?».
4. «Investiga» (la Ley 29733 y la nube del Estado).

Sigue a los docs 45 (qué ve hoy otra entidad) y 46 (cómo venden y separan los demás).

## 0 · Resumen

- **Dos tipos de cuenta sobre una misma identidad personal.** La **cuenta de entidad** (municipalidad, empresa,
  consultora) es por contrato, con varios usuarios y seguridad reforzada. La **cuenta personal** (estudiante,
  ingeniero) se compra en la web, tiene un dueño, cuotas y seguridad estándar.
  - Una persona puede tener su cuenta personal y además estar invitada a obras de entidades.
  - **Lo que sube en su cuenta personal es de su cuenta personal**. Pasarlo a una entidad exige un traspaso explícito,
    con registro.
- **«Que no se cruce nada» no se logra con un solo control**, sino con **doce capas** (§2). Cada una cierra un camino
  distinto por el que los datos se escapan en la práctica: base, archivos, Autodesk, enlaces, cachés, trabajos en
  segundo plano, búsquedas, registros y personal propio.
- **Hallazgo de hoy, que no espera a tener clientes** (§3): **el token del visor de Autodesk que se entrega sin sesión
  incluye `data:read`**. Según Autodesk, ese permiso **lee todos los datos de la aplicación, no solo los visibles**. Hay
  que dejarlo en `viewables:read`.
- **Ley 29733 y su reglamento (DS 016-2024-JUS, leído en el texto oficial)**:
  - con una entidad, ALEPHIA es **encargado del tratamiento**, con obligaciones concretas;
  - los servidores fuera del Perú obligan a dar **garantías y comunicarlo** (flujo transfronterizo);
  - las incidencias se notifican **en 48 horas**;
  - los **registros de acceso se guardan 2 años**;
  - al terminar, **se suprime con evidencia**.

  No se encontró una norma que obligue a tener los datos en el Perú.

## 1 · Los dos niveles

| | **Cuenta de entidad** | **Cuenta personal** |
|---|---|---|
| Quién | Municipalidad, gobierno regional, empresa, consultora | Estudiante, ingeniero independiente |
| Cómo se obtiene | Contrato, con alta asistida | Compra o alta en la web (como ACC y Tandem) |
| Usuarios | Varios: administradores de cuenta, miembros e invitados de otras empresas | Uno, el dueño. Puede invitar a pocos, con cuota |
| Obras | Las que el plan permita; colaboradores gratis (doc 46) | Pocas, con límite de almacenamiento y de modelos (como Tandem Free) |
| **Seguridad** | **Reforzada**: doble factor **obligatorio**; revisión semestral de privilegios (art. 46); registros de acceso que la entidad puede pedir; documento de seguridad; contrato de encargo con cláusulas de la ley; región y archivo exportable acordados | **Estándar**: doble factor opcional; mismas barreras entre cuentas; registros propios |
| Propiedad de los datos | De la entidad. El trabajo en curso de cada organización es suyo hasta que lo emite (§4) | Del dueño |
| Al terminar | Exportación completa y **supresión con evidencia** (art. 29.5 y 30.4) | Exportación y supresión a pedido |

**La misma persona, dos mundos:** una sola identidad (correo y contraseña o Google), pero **cada sesión trabaja en una
cuenta activa**. La pantalla dice siempre en qué cuenta estás, como el selector de cuentas de Tandem y de ACC.

## 2 · Cómo se separa sin que nada se cruce: las doce capas

Para cada capa: dónde se escapan los datos en la práctica, qué hay hoy en ALEPHIA (leído en el código) y qué falta.

| # | Capa | Camino de fuga | Hoy | Falta |
|---|---|---|---|---|
| 1 | **Resolver la cuenta en el servidor** | Que la cuenta o la obra la diga el navegador | `guardia_de_obra` y el middleware resuelven la obra en el servidor | Añadir la **cuenta** a la sesión y a la resolución. La obra pertenece a una cuenta, y nunca se acepta la cuenta del cliente |
| 2 | **Base de datos** | Una consulta que olvida el filtro | Patrón piscina; las tablas llevan la obra o cuelgan de una que la lleva; **sin RLS** | Una columna de cuenta (directa o por la tabla padre) y **seguridad por filas** (RLS) en Postgres: política por cuenta y pertenencia, rol de aplicación sin `BYPASSRLS`, cuenta fijada en cada transacción |
| 3 | **Catálogos** | Listas compartidas entre clientes | **Globales**: `companies`, `plantillas_de_obra`, `job_titles`, `perfiles_de_acceso`, `roles_de_entidad` (sin obra ni hub) | Catálogos **por cuenta**. Los genéricos (como el de idoneidad ISO) se copian a cada cuenta |
| 4 | **Archivos** (Google Cloud Storage) | Rutas adivinables o URL firmadas largas | URL firmadas que se dan tras la guardia; vida de 24 h por defecto (`generate_signed_url`) | **Prefijo de cuenta en la ruta** (permite exportar y suprimir por cuenta) y URL firmadas **cortas** |
| 5 | **Autodesk** (modelos y su traducción) | Un token que abre los modelos de todos | **Token del visor público con `data:read`** (§3); un solo bucket de la aplicación | Token **`viewables:read`**; después, **token limitado a un modelo** (`data:read:<urn>`) entregado solo a quien puede verlo, o un *proxy*; **bucket por cuenta** |
| 6 | **Enlaces compartidos y rutas públicas** | Enlaces que abren más de lo que dicen; listas públicas | Vistas compartidas por enlace (sql/30); **`GET /api/hubs` público** (doc 45) | Cada enlace limitado a una vista y un modelo, revocable y con fecha de caducidad; **`/api/hubs` con sesión** |
| 7 | **Cachés** | Una caché del servidor sin cuenta en la clave; la caché del navegador en un equipo compartido | Caché del inventario en IndexedDB por modelo; caché del servidor por URL | **La cuenta en cada clave de caché** del servidor; la caché del navegador **por usuario y cuenta**, borrada al cerrar sesión |
| 8 | **Trabajos en segundo plano** (extracciones, Design Automation, mosaicos, vistas previas) | Un trabajo que escribe en la obra equivocada | Los trabajos llevan su obra | Que lleven la **cuenta** y escriban solo en sus rutas |
| 9 | **Búsquedas y análisis** (Tablero, centro de datos, vistas entre obras) | Un índice o un resumen que mezcla cuentas | Por obra | **Nunca entre cuentas**. La vista entre obras (doc 43) solo dentro de una cuenta |
| 10 | **Registros y auditoría** | Registros mezclados, o que no se pueden entregar | Cadena sellada por obra; `auth_events`; `activity_log` | Por cuenta, **guardados 2 años** (art. 46.3) y **entregables a la entidad** |
| 11 | **Nuestro propio personal** | Un «administrador» que lo ve todo | **`role = 'admin'` ve todas las obras** (doc 45) | **Operador de plataforma** sin acceso por defecto a los datos de las cuentas. Si hace falta, **acceso de emergencia** registrado y avisado a la cuenta (como Aconex: no hay superusuario) |
| 12 | **Pruebas que lo demuestren** | Una ruta nueva que nadie revisó | `test_cobertura_autorizacion` y pruebas del perímetro por obra | **Prueba de cruce entre cuentas**: dos cuentas de prueba, y cada ruta de una intenta leer, listar y escribir en la otra. Debe fallar siempre, en cada versión, y bloquear el despliegue si no falla |

**El orden importa:**
- las capas 5, 6 y 11 son las que hoy dejarían ver lo ajeno;
- la 2 (RLS) es el segundo candado que hace que un olvido en el código no sea una fuga;
- la 12 es la que garantiza que siga así.

## 3 · Hallazgo: el token público del visor lleva `data:read`

- **Qué hay**: `GET /api/token` es público a propósito (las vistas compartidas no tienen sesión). Entrega un token con
  `APS_VIEWER_SCOPES = ['data:read', 'viewables:read']` (`backend/aps.py`, línea 20).
- **Qué dice Autodesk** (página oficial de *scopes*):
  - `viewables:read` lee **solo los datos visibles**;
  - `data:read` lee **todos los datos**, visibles y no visibles;
  - la documentación del visor dice que su token es `viewables:read`;
  - un artículo de Autodesk explica que `data:read` permite también leer los *buckets* y objetos de OSS, es decir, los
    **archivos originales**.
- **Qué significa**: cualquiera que pida ese token sin sesión podría leer, con la API de Autodesk, **los archivos
  originales de los buckets de la aplicación** si conoce o adivina sus nombres, no solo verlos. **No lo probé contra
  producción**; se basa en la documentación de Autodesk y en el código.
- **Qué hacer:**
  1. **Ya**, sin clientes nuevos de por medio: dejar el token público en **`viewables:read`** y comprobar en el banco
     que el visor abre los modelos, la Planilla, las vistas compartidas, el 4D y el comparador.
  2. Después: **un token por modelo** (`data:read:<urn>` o `viewables` del modelo) que se entrega **solo tras la
     guardia**; o un **proxy** que añada el token en el servidor.

## 4 · Punto 3: qué es «la regla de Aconex»

Es una regla sobre **quién ve el trabajo de quién dentro de una misma obra**:
- Cada **organización** de la obra (la entidad, el contratista, la supervisión, el proyectista) tiene **su espacio**.
- **Lo que una organización está trabajando y todavía no ha enviado, solo lo ve ella.** Ni el dueño de la obra lo ve.
  Lo ve cuando la organización lo **emite o lo envía**.
- **No hay superusuario**: ni el administrador de la obra ni el operador de la plataforma tienen acceso por defecto al
  trabajo en curso de otro.
- **Nada se borra a escondidas** (todo queda registrado), y **cada organización puede exportar lo suyo cuando quiera**,
  también al terminar la obra.

Ejemplo:
- el proyectista sube la versión 3 de un plano a su carpeta de trabajo (estado WIP de ISO 19650);
- la entidad **no la ve** hasta que el proyectista la **comparte** (estado S1, «compartido»);
- si la obra termina, el proyectista se lleva su historial completo, con huella.

**Por qué conviene:** es lo que pide ISO 19650 (cada equipo controla su trabajo en curso). Además da confianza a los
contratistas para trabajar dentro del ECD de la entidad, en vez de en su propio Dropbox.

**Qué hay en ALEPHIA:** estados ISO 19650 por metadato y permisos por carpeta. **Qué faltaría:**
- declararlo como regla de la cuenta: el WIP de cada organización solo lo ve ella, también frente al administrador de
  la obra;
- la exportación por organización.

## 5 · Punto 4: lo que dice la ley (leído en el texto oficial)

**Reglamento de la Ley 29733, DS 016-2024-JUS** (texto de la SMV, 74 págs.; se leyeron los artículos pertinentes):

| Tema | Artículo | Qué obliga | Qué supone para ALEPHIA |
|---|---|---|---|
| **Servicio tercerizado** (somos el proveedor de la entidad) | 29 | Informar las subcontrataciones; **no asumir la titularidad** de los datos; confidencialidad, integridad y disponibilidad; el control queda en el responsable; **garantizar y evidenciar la destrucción** al terminar | Contrato con la entidad; lista de nuestros subcontratistas (Render, Google Cloud, Autodesk); supresión con constancia |
| Mecanismos del proveedor | 30 | Avisar de cambios en las condiciones; dejar que el responsable limite el tratamiento; medidas de seguridad; **suprimir cuando el responsable ya recuperó sus datos**; impedir el acceso sin privilegios | Exportación completa antes de suprimir; capas del §2 |
| Encargo | 31 | **No transferir a terceros** sin autorización; **conservar como máximo 2 años** desde el fin del encargo; prohibida la conservación indefinida | Política de retención por cuenta |
| Subcontratación | 32–33 | El tercero necesita **autorización previa** del responsable (vale si está en el contrato) | Nuestros proveedores de nube, en el contrato |
| **Flujo transfronterizo** (servidores fuera del Perú) | 18–21 | Al país que tenga **nivel adecuado**; si no, **garantías** (cláusulas contractuales modelo); **comunicarlo a la Dirección General** (21.2) | Hoy los datos están en EE. UU. (Render, Cloud SQL, Autodesk): cláusulas modelo y comunicación, o una región que lo evite |
| **Incidentes** | 34–36 | El responsable notifica a la Autoridad **en 48 horas** si son graves; el encargado avisa **de inmediato**; documentar todo incidente | Procedimiento de incidentes con plazos |
| Oficial de datos | 37–39 | **Obligatorio si el tratamiento lo hace una entidad pública**, o si hay grandes volúmenes o datos sensibles | La entidad designa el suyo; nosotros, según el volumen |
| Inscripción | 42 | Inscribir los bancos de datos en el Registro Nacional | Lo hace el responsable; ALEPHIA, por sus cuentas personales |
| **Seguridad digital** | 46 | Gestión de accesos de alta a baja; **revisión de privilegios como mínimo cada 6 meses**; autenticación; **registros de inicio y cierre de sesión y de ver, modificar, borrar, importar y exportar, guardados 2 años como mínimo**; impedir copias no autorizadas | Encaja con lo que ya hay (auditoría, `auth_events`); falta revisión semestral, retención de 2 años por cuenta y registro de exportaciones |
| Documento de seguridad | 47 | Aprobado y con fecha cierta; referencia NTP-ISO/IEC 27001; en entidades públicas, las normas de seguridad digital | Hay que escribirlo |
| Respaldo | 48 | Copias continuas con verificación de integridad | Ya hay copia y restauración demostradas (memoria del 4-sep) |

**Nube del Estado:**
- el **Reglamento de Gobierno Digital** (DS 029-2021-PCM, art. 92) pide a las entidades usar **de forma preferente**
  servicios en la nube y define «Nube Perú»;
- los **lineamientos de 2018** (Res. 001-2018-PCM/SEGDI) son **recomendaciones**;
- **no se encontró una obligación general de tener los datos en el Perú** para un SaaS. Sí la hay para la nube privada
  del Estado (informe 003-2023-SSTSD).

Falta comprobar si una entidad concreta lo exige en sus términos de referencia; el doc 45 propone el despliegue aparte
por si lo pide.

**Datos personales que maneja ALEPHIA:** usuarios (nombre, correo, empresa, cargo), sesiones y eventos de acceso,
autores de asientos y actas, fotos de obra (puede salir gente) y firmas de actas.

## 6 · Orden propuesto

| Paso | Qué | Por qué primero |
|---|---|---|
| 1 | **Token del visor en `viewables:read`** (§3), probado en el banco | Cierra un camino abierto hoy, sin depender de clientes |
| 2 | **`/api/hubs` con sesión**; operador de plataforma ≠ administrador de cuenta | Son las fugas del doc 45 |
| 3 | **Cuenta (inquilino)**: entidad o personal, con la cuenta activa en la sesión; catálogos por cuenta | La base de los dos niveles |
| 4 | **RLS por cuenta** + **prueba de cruce entre cuentas** que bloquee el despliegue | El segundo candado y lo que lo garantiza |
| 5 | Archivos y Autodesk por cuenta (prefijos, bucket, token por modelo) | Exportar y suprimir por cuenta |
| 6 | Cumplimiento: contrato de encargo, documento de seguridad, retención de 2 años, procedimiento de incidentes, cláusulas de flujo transfronterizo | Antes del primer contrato con una entidad |
| 7 | Regla tipo Aconex (WIP de cada organización) y exportación por organización | Confianza de los contratistas |

## 7 · Decisiones del dueño

1. ¿Los **dos niveles** como en el §1: entidad por contrato y persona por la web?
2. ¿Preparo el **paso 1** (token del visor) en local para probarlo en el banco? Es pequeño y no depende de nada más.
3. ¿Adoptamos la **regla tipo Aconex** del §4?
4. Para la ley: ¿se consulta con un abogado el contrato de encargo y las cláusulas de flujo transfronterizo antes del
   primer contrato? El análisis de aquí es técnico, no un dictamen legal.

## Fuentes

- **Ley y reglamento:**
  - [Reglamento de la Ley 29733, DS 016-2024-JUS, texto de la SMV](https://www.smv.gob.pe/Uploads/DS016_2024_JUS.pdf) (leídos los arts. 18–21, 29–39, 42 y 46–48)
  - [texto en LP Derecho](https://lpderecho.pe/reglamento-ley-proteccion-datos-personales-decreto-supremo-016-2024-jus/) y [Ley 29733 vigente](https://www.smv.gob.pe/Uploads/Ley_29733_vigente_2025.pdf)
- **Nube del Estado:**
  - [DS 029-2021-PCM, Reglamento de Gobierno Digital](https://img.lpderecho.pe/wp-content/uploads/2021/02/decreto-supremo-n-029-2021-pcm-LP.pdf)
  - [lineamientos de nube de 2018](https://cdn.www.gob.pe/uploads/document/file/302115/Lineamientos_Nube.PDF)
  - [informe técnico 003-2023-SSTSD](https://cdn.www.gob.pe/uploads/document/file/4864045/INFORME%20DE%20OPINI%C3%93N%20T%C3%89CNICA%20VINCULANTE%20003-2023-SSTSD.pdf)
- **Autodesk:**
  - [Scopes (oficial)](https://aps.autodesk.com/en/docs/oauth/v2/developers_guide/scopes/)
  - [Nuevo scope viewables:read](https://aps.autodesk.com/blog/new-viewablesread-scope)
  - [Proteger el token del visor tras un proxy](https://aps.autodesk.com/blog/securing-your-forge-viewer-token-behind-proxy)
  - [Tokens con alcance limitado](https://aps.autodesk.com/blog/scoped-tokens-are-here)
  - [API del visor, conceptos básicos](https://aps.autodesk.com/en/docs/viewer/v2/developers_guide/basics)
- **Aconex:** [propiedad de los datos](https://help.aconex.com/DisplayContent/aconexs-unique-data-ownership-model)
- **Separación de clientes:** [PostgreSQL silo, puente o piscina, y RLS](https://dev.to/ashtech52/multi-tenant-saas-architecture-on-postgresql-silo-bridge-or-pool-4be9)
- **Código de ALEPHIA:**
  - `backend/aps.py` (línea 20)
  - `backend/server.py` (`/api/token`)
  - `backend/auth_middleware.py` (`PUBLIC_GET_PREFIXES`)
  - `backend/routes/projects.py`
  - `backend/gcs_manager.py`
  - `backend/esquema_base.py`
