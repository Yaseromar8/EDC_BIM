# 46 · Cómo venden sus licencias y separan a sus clientes ACC, Tandem, Procore, Aconex y otros — INVESTIGACIÓN

29-oct-2026. Solo investigación. El dueño: «por eso deberíamos investigar cómo funciona ACC, Tandem, Procore, etc.,
cuando venden sus licencias». Sigue al doc 45 (¿qué ve otra municipalidad si se la doy hoy?).

**Lo que se pudo leer entero y lo que no:**
- se leyeron enteras: la página de precios de Procore, la ayuda de Aconex sobre la propiedad de los datos y las
  preguntas frecuentes de Autodesk sobre almacenamiento regional;
- **varias páginas oficiales devolvieron 403**: el artículo de Autodesk sobre licencias, sus condiciones de uso y la
  descripción de servicio de Aconex en PDF. De esas hay resúmenes de búsqueda y artículos de soporte;
- los precios publicados por terceros son estimaciones y se marcan así.

## 1 · Lo que venden y cómo separan, producto por producto

| | **Autodesk ACC / Forma** | **Autodesk Tandem** | **Procore** | **Oracle Aconex** | **Trimble Connect** | **Dalux** |
|---|---|---|---|---|---|---|
| **Qué se compra** | Una **cuenta («hub»)** de la empresa, con proyectos dentro | Una suscripción de la cuenta | Una **cuenta de empresa** | Contrato **Enterprise** (proyectos ilimitados) o **por proyecto** | Suscripción por usuario | Visor gratis; módulos de pago |
| **Cómo se cobra** | **Por usuario con nombre y por producto** (Docs, Build, Design Collaboration). Las grandes empresas negocian acuerdos de cuenta (EBA) con tarifa plana | **Por capacidad** (activos etiquetados, *streams*, historia y tipo de usuario), **no por puesto**. Free: 3 instalaciones y 500 activos (otras páginas: 1.000). Los planes de pago tienen usuarios e instalaciones ilimitados | **Por volumen de obra anual (ACV) y por producto, con usuarios y almacenamiento ilimitados**. Contrato anual; bolsas plurianuales | Enterprise: por **usuario con nombre**, y los invitados cuentan. Por proyecto: por **valor del proyecto** (por millón) | Business, US$ 12,99 por usuario y mes; Premium, 23,95 (página oficial) | Visor gratis con usuarios invitados ilimitados; módulos por cotización |
| **Cómo entran otras empresas** | Invitación al proyecto **y** licencia: o **trae la suya** («bring your own subscription»), o el administrador del hub le asigna una de su bolsa, o entra con prueba. El administrador de cuenta no necesita licencia para administrar | Por permisos de la instalación | **Gratis**: usuarios ilimitados, y en EE. UU. y Canadá hay **cuentas gratuitas para colaboradores** (subcontratistas) | Cada **organización** entra al proyecto con su propio espacio | Colaboradores ilimitados en los planes de pago | Invitados gratis |
| **Dónde viven los datos** | **La región se elige al activar el hub**: EE. UU., UE, Australia, Reino Unido, Alemania, Canadá, India y Japón. **No se puede mover** un proyecto de región. **Los datos personales y de identidad están siempre en EE. UU.** | Regiones limitadas | Sin dato leído | Un resumen menciona regiones de Oracle Cloud; sin confirmar | Sin dato | Sin dato |
| **De quién son los datos** | De la cuenta (hub) | De la cuenta | De la cuenta de empresa | **De cada organización**: cada una tiene su espacio privado, **no hay superusuario**, **el dueño del proyecto no ve lo de otra organización si esta no se lo envía**, nada se borra y **se puede pedir el archivo de lo propio en cualquier momento** | De la cuenta | De la cuenta |
| **Niveles de administración** | Administrador de hub (cuenta) → administrador de proyecto → miembro | Cuenta → instalación | **Empresa** (directorio y plantillas de permisos de la empresa) → **proyecto** (su propio directorio) | Organización → proyecto | Cuenta → proyecto | Empresa → proyecto |

## 2 · Lo que tienen en común

1. **El cliente es una cuenta, nunca una persona.** La empresa o la entidad compra una cuenta y crea sus proyectos
   dentro. Las personas son identidades globales que entran a proyectos de varias cuentas. **Nadie da una base de datos
   por usuario.**
2. **Dos niveles de administración separados**: el de la cuenta (empresa) y el del proyecto. Por encima, el personal
   del fabricante, que **no es un usuario de la cuenta**.
3. **Los colaboradores de otras empresas no pagan, o traen lo suyo**:
   - Procore y Dalux: gratis;
   - Autodesk: su propia licencia o una de la bolsa del anfitrión;
   - Aconex Enterprise: los invitados cuentan como usuarios.
4. **La región de los datos se elige por cuenta**, al crearla, y no se cambia después.
5. **Tres maneras de cobrar**, según a quién apunta cada fabricante:
   - **por usuario**: ACC y Trimble;
   - **por volumen o valor de obra, con usuarios ilimitados**: Procore y Aconex por proyecto;
   - **por capacidad**: Tandem.

## 3 · Lo que significa para vender ALEPHIA a municipalidades

**El modelo que encaja (para decidir):**
- **La cuenta = la entidad** (municipalidad, gobierno regional, empresa). Es el `hub` que ya existe, convertido en
  inquilino de verdad.
- **Administrador de cuenta** de la entidad, distinto del **operador de la plataforma** (ALEPHIA). Hoy los dos son
  el mismo `role = 'admin'`, que ve todo (doc 45 §7).
- **Las obras dentro de la cuenta**, y en cada obra las **organizaciones**: entidad, contratista, supervisión y
  proyectista.
- **Las personas** siguen siendo identidades globales, invitadas. Un ingeniero que trabaja en dos municipalidades usa
  una sola cuenta personal.
- **Catálogos por cuenta**: directorio de empresas, plantillas de obra y cargos. Hoy son globales.

**La propiedad de los datos, el punto de fondo para obra pública:**
- **Aconex** es el que encaja con ISO 19650: cada organización controla su trabajo en curso y comparte cuando emite;
  no hay superusuario.
- En obra pública peruana, **el expediente es de la entidad**, pero **el trabajo en curso del contratista y del
  proyectista es suyo hasta que lo emiten**.
- ALEPHIA ya tiene estados ISO 19650 y permisos por carpeta. Lo que falta es declararlo como regla de la cuenta y
  garantizar a cada organización **la exportación de lo suyo**, con huella, en cualquier momento, como Aconex.

**Cómo cobrar en el sector público (opciones):**

| Opción | Parecido a | Por qué podría servir |
|---|---|---|
| **Por entidad, anual, obras y usuarios ilimitados** (por tramos de tamaño de la entidad o de inversión anual) | Procore, Aconex Enterprise | Un solo contrato por entidad; contratistas y supervisores entran **gratis** (no frena la adopción) |
| **Por obra, según el monto de la inversión** | Aconex por proyecto | Encaja en el presupuesto de cada inversión |
| **Por usuario** | ACC, Trimble | Simple, pero frena: cada contratista tendría que pagar |

**Dónde están los datos:**
- hoy, la base y el servidor están en EE. UU. (Render y Cloud SQL);
- para una entidad pública habría que revisar:
  - los **lineamientos de nube del Estado**: la resolución 001-2018-PCM/SEGDI son recomendaciones, y la norma posterior
    prevé el uso preferente de la nube y «Nube Perú»;
  - la **Ley 29733 de datos personales**: la transferencia a otro país y el encargo a un proveedor de nube.

  No se encontró una prohibición, pero falta leer la norma de datos personales y su reglamento.
- Autodesk guarda los datos de identidad en EE. UU. incluso con almacenamiento regional, y traduce los modelos fuera de
  la región. Lo mismo pasa con nuestros modelos, que se traducen con la cuenta de Autodesk de ALEPHIA.

## 4 · Qué habría que construir (el camino B del doc 45, con lo aprendido)

| # | Qué | Por qué, según los referentes |
|---|---|---|
| 1 | **Cuenta (inquilino) = hub de verdad**: plan, cuotas y región | Todos venden una cuenta |
| 2 | **Operador de plataforma ≠ administrador de cuenta**. El rol global `admin` se reserva al personal de ALEPHIA y la entidad tiene sus propios administradores | ACC, Procore y Aconex separan los niveles; Aconex no tiene superusuario |
| 3 | **Catálogos por cuenta**: empresas, plantillas y cargos | El directorio y las plantillas de empresa de Procore |
| 4 | **`/api/hubs` con sesión**, y que cada uno vea solo sus cuentas | Ninguno lista sus clientes en público |
| 5 | **Seguridad por filas** (RLS) como segundo candado | Recomendación general para el patrón piscina (doc 45) |
| 6 | **Colaboradores gratis** en las obras de una cuenta que paga | Procore, Dalux |
| 7 | **Exportación de lo propio** por organización, con huella | Aconex |
| 8 | Para una entidad que lo exija, **despliegue aparte** (silo) con el mismo código | Regiones de Autodesk; patrón silo |

## 5 · Decisiones del dueño

1. ¿El cliente es **la entidad** (municipalidad) y las obras van dentro de su cuenta?
2. ¿Cómo cobrar: **por entidad y año con usuarios ilimitados**, **por obra según el monto**, o por usuario?
3. La propiedad de los datos: ¿adoptamos la regla tipo **Aconex**? Cada organización controla lo suyo hasta emitirlo y
   puede exportarlo cuando quiera.
4. ¿Investigamos a fondo la **Ley 29733** y los lineamientos de nube antes de la primera venta a una entidad?
5. Para el cliente de la próxima semana: ¿**despliegue aparte** (camino A del doc 45) mientras se construye lo del §4?

## Fuentes

- **Autodesk ACC / Forma:**
  - [preguntas frecuentes sobre almacenamiento regional](https://help.autodesk.com/cloudhelp/ENU/Docs-About-ACC/files/Regional_Data_Storage.html) (leída entera)
  - [asignación de usuarios y licencias](https://www.autodesk.com/support/technical/article/caas/sfdcarticles/sfdcarticles/User-and-license-assignment-for-ACC-products.html) (403; solo resumen)
  - [¿el administrador de cuenta consume licencia?](https://www.autodesk.com/support/technical/article/caas/sfdcarticles/sfdcarticles/Does-an-Account-Admin-consume-licenses-in-an-Autodesk-Construction-Cloud-project.html)
  - [asignación automática de licencias de Build](https://www.autodesk.com/support/technical/article/caas/sfdcarticles/sfdcarticles/How-to-automatically-assign-ACC-Build-licenses.html)
  - [compartir con quien no tiene suscripción](https://www.autodesk.com/support/technical/article/caas/sfdcarticles/sfdcarticles/How-to-share-files-stored-in-ACC-with-companies-or-members-who-don-t-have-an-active-subscription.html)
  - [límites de invitados](https://www.autodesk.com/support/technical/article/caas/sfdcarticles/sfdcarticles/is-there-any-limitation-to-invite-users-to-a-project-in-BIM360-or-ACC.html)
  - [IMAGINiT, regiones](https://resources.imaginit.com/support-blog/acc-new-regional-storage-locations)
  - precios estimados por terceros: [feeguides](https://feeguides.com/software-pricing/autodesk-construction-cloud-pricing/) y [constructable](https://constructable.ai/blog/autodesk-build-review)
- **Autodesk Tandem:**
  - [precios](https://intandem.autodesk.com/pricing/) y [comparación de planes](https://www.autodesk.com/products/tandem/compare)
  - [beneficios de suscripción](https://www.autodesk.com/company/terms-of-use/en/subscription-benefits) (403; solo resumen)
  - [gestión de cuentas en Tandem for AEC](https://forums.autodesk.com/t5/tandem-forum/account-management-in-tandem-for-aec/td-p/12775921)
- **Procore:**
  - [precios](https://www.procore.com/pricing) (leída entera)
  - [cuentas gratuitas o de pago](https://support.procore.com/faq/how-can-i-tell-if-i-have-a-free-or-paid-procore-account?mt-view=f1)
  - [permisos y plantillas](https://support.procore.com/faq/what-are-permissions-in-procore-and-how-do-they-work)
  - [directorio de la empresa](https://support.procore.com/products/online/user-guide/company-level/directory/permissions)
- **Oracle Aconex:**
  - [neutralidad y propiedad de los datos](https://help.aconex.com/DisplayContent/aconexs-unique-data-ownership-model) (leída entera)
  - [descripción de los servicios](https://www.oracle.com/contracts/docs/oracle-aconex-cloud-services-service-descriptions.pdf) (403; solo resumen)
  - [análisis de licenciamiento (Redress)](https://redresscompliance.com/oracle-primavera-unifier-aconex-licensing-2026)
- **Trimble Connect:** [planes de suscripción](https://geospatial.trimble.com/en/products/software/trimble-connect/subscription-plans)
- **Dalux:** [visor BIM](https://www.dalux.com/products/bim-viewer/) y [registro](https://www.dalux.com/sign-up-free-bim-viewer/)
- **Perú:**
  - [lineamientos de nube, Res. 001-2018-PCM/SEGDI](https://busquedas.elperuano.pe/api/visor_html/1605580-1) y [el documento](https://cdn.www.gob.pe/uploads/document/file/302115/Lineamientos_Nube.PDF)
  - [informe técnico 003-2023-SSTSD («Nube Perú»)](https://cdn.www.gob.pe/uploads/document/file/4864045/INFORME%20DE%20OPINI%C3%93N%20T%C3%89CNICA%20VINCULANTE%20003-2023-SSTSD.pdf)
