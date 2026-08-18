# Plantilla: anexo de tratamiento de datos y condiciones del servicio

**Qué es esto:** la base del anexo técnico/de datos para el contrato con una
entidad. **No es asesoría legal** — la redacción final la revisa un abogado; lo
que esta plantilla garantiza es que lo que se firme **coincida con lo que el
sistema hace de verdad**, que es donde los contratos de software suelen mentir.

**Regla de la casa, heredada del saneamiento:** aquí no se declara nada que no
esté implementado y medido. Donde hay un límite, se escribe el límite.

---

## 1 · Objeto

Servicio de Entorno Común de Datos (ECD) documental para la obra «\_\_\_\_\_\_»,
en **instancia dedicada**: servicio de aplicación, base de datos y almacén de
objetos de uso **exclusivo** de LA ENTIDAD. Los datos de LA ENTIDAD no comparten
proceso, base ni almacén con ningún otro cliente del PROVEEDOR.

## 2 · Dónde viven los datos

- Aplicación y base de datos: infraestructura de Render (región \_\_\_\_, hoy EE. UU.).
- Documentos (bytes): Google Cloud Storage, bucket exclusivo (región \_\_\_\_).
- Traducción de modelos CAD para visualización: Autodesk Platform Services.

> Si LA ENTIDAD exige residencia de datos en Perú u otra región, se pacta antes
> del despliegue: la región del bucket es elegible; la de Render, según sus
> regiones disponibles. No se promete lo que el proveedor de nube no ofrece.

## 3 · Papeles (Ley 29733 — Protección de Datos Personales)

- **LA ENTIDAD** es titular del banco de datos y responsable del tratamiento de
  los datos personales contenidos en su expediente (nombres de su personal,
  correos, registros de actividad).
- **EL PROVEEDOR** actúa por encargo, limitado a operar el servicio. No usa los
  datos para ningún otro fin, no los cede, y no los conserva más allá de lo
  pactado en la cláusula de salida.
- Datos personales que el sistema trata, enumerados: nombre, correo, rol,
  registros de acceso y actividad (quién hizo qué y cuándo — exigencia propia
  de un expediente público), y fotografías de obra. Las coordenadas GPS de las
  fotos **se extraen del fichero y se guardan bajo control de acceso**; el
  fichero que se comparte ya no las lleva (implementado 15-ago-2026).

## 4 · Acceso del proveedor — declaración honesta

1. EL PROVEEDOR administra la infraestructura y **puede acceder técnicamente**
   a la base y al bucket de la instancia (es quien la opera). Ese acceso:
   - usa una credencial **limitada a la instancia de LA ENTIDAD**;
   - dentro de la aplicación queda registrado en el log de actividad,
     **incluidos los administradores** (implementado);
   - fuera de la aplicación (acceso directo al bucket) es técnicamente posible
     para operación y soporte. Se declara en vez de negarse, y se limita por
     contrato a: mantenimiento, copia de seguridad, soporte a incidencia, y
     nunca sin registro en el parte de trabajo correspondiente.
2. Lo que EL PROVEEDOR **no puede** hacer: acceder a instancias de otras
   entidades con esta credencial, ni a esta instancia con las de otras.

## 5 · Medidas de seguridad — lo que ESTÁ, no lo que suena bien

Implementado y verificable en la instancia (cada punto es comprobable, varios
desde `/api/health` sin credenciales):

- Cifrado en tránsito (TLS) extremo a extremo.
- Sesiones con huella criptográfica; secretos de firma y pimienta propios de la
  instancia, generados en el despliegue, nunca escritos en código.
- Autorización por obra activa (`ENFORCE_PROJECT_AUTHZ=true` desde el día uno)
  y política de acceso declarada por endpoint en modo estricto.
- Registro de actividad encadenado por huellas: reescribir o borrar un asiento
  deja rastro detectable.
- Segundo factor (TOTP) disponible para todas las cuentas; **obligatorio para
  el administrador de LA ENTIDAD** (condición de entrega, verificación §5.3 de
  la guía de despliegue).
- Copia de seguridad con **ensayo de restauración probado antes de la entrega**
  y periodicidad pactada de \_\_\_\_.
- Huella SHA-256 por versión de documento: se puede demostrar que un fichero es
  el que se aprobó.

**Lo que NO se declara, a propósito:**

- Ninguna certificación ISO. El sistema está **alineado con el marco ISO 19650**
  (estados WIP/SHARED/PUBLISHED/ARCHIVED, códigos de idoneidad, triaje de
  seguridad de la parte 5, índice del expediente), pero *alineado* no es
  *certificado*, y aquí no se firma la palabra que no corresponde.
- Ningún «alta disponibilidad». La disponibilidad objetivo es la del plan de
  infraestructura contratado (§7), sin número inventado encima.

## 6 · Derechos de LA ENTIDAD sobre su expediente

1. **El expediente es de LA ENTIDAD.** En cualquier momento, sin pedir permiso,
   puede exportarlo desde el propio portal: índice (hoja de cálculo abierta, sin
   macros) y documentos completos (zip con estructura). Esto existe en el
   producto, no en una promesa (Configuración → Exportar el expediente).
2. **A la terminación del contrato:** EL PROVEEDOR entrega copia completa de la
   base de datos y del bucket en formato estándar en un plazo de \_\_ días, y
   borra los datos de su infraestructura en un plazo de \_\_ días tras la
   confirmación de recepción, con constancia escrita del borrado.
3. El registro de actividad se entrega junto con el expediente: la trazabilidad
   es parte del expediente, no del proveedor.

## 7 · Servicio y soporte

- Plan de infraestructura: \_\_\_\_ (dimensionado en la guía de despliegue; sin
  plan que se suspenda por inactividad).
- Ventana de mantenimiento y aviso previo: \_\_\_\_.
- Notificación de incidentes de seguridad que afecten a datos de LA ENTIDAD:
  máximo \_\_ horas desde la detección, con lo que se sabe y lo que se hará.
- Subencargados (infraestructura): Render, Google Cloud, Autodesk. El cambio de
  subencargado se comunica con \_\_ días.

## 8 · Lo pendiente que se declara al firmar

Transparencia sobre el estado real a fecha de firma (se actualiza en cada
revisión del anexo):

- El acceso directo del proveedor al bucket (§4.1) está **acotado por
  credencial**, pendiente de restricción adicional vía IAM condicional.
- \_\_\_\_ (lo que la matriz de saneamiento tenga abierto ese día y afecte a la
  instancia — se copia de `08-matriz-saneamiento.md`, no se resume de memoria).
