# 28 · La vista de apertura de un CAD o un PDF, por carpeta (5-nov-2026)

Lo que pidió el dueño:
- «si dejo ese CAD en un layout, y quiero que cuando otro lo abra se mantenga ahí… o con zoom en cierta zona»;
- «si es un archivo enlazado en distintas carpetas, y esas carpetas representan distintas vistas»;
- «también en PDF, porque puede haber casos donde un PDF tenga varias hojas»;
- «debe ser estándar, profesional y escalable».

**Estado: construido en local y probado (§6). Falta publicar: migración 49 → backend → portal.**

## 1 · Qué hace

El mismo documento, abierto desde carpetas distintas, abre en la vista que se fijó **para cada una**:

| Carpeta | Se abre en |
|---|---|
| 0. Generales (el original) | la vista por defecto, o la que se fije ahí |
| 3. Red Secundaria (Calle San Agustín), un enlace | Layout «PLANTA-SA», con el zoom de su tramo |
| 4. Red Secundaria (Calle San Pablo), otro enlace | Model, con zoom a San Pablo |

- **CAD (DWG, DXF):** la presentación (Model o un Layout) y la cámara exacta del visor.
- **PDF:** la hoja, el zoom y el punto de la hoja que queda en el centro. El zoom se guarda **relativo a la hoja
  entera**, así la misma vista vale en un portátil y en un monitor grande.

## 2 · Cómo se usa

1. Abre el documento desde la carpeta (la suya o la de un enlace).
2. Ve a la presentación u hoja que quieras y haz el zoom.
3. El botón **«Vista de apertura»**: en el CAD está en la barra de arriba; en el PDF, en el cajetín junto a «Copiar
   enlace». Pulsa **«Abrir siempre así en esta carpeta»**.

El botón dice desde dónde y en qué se abre: «Desde «San Agustín» se abre en «PLANTA-SA», fijada por …».
**«Restablecer la vista por defecto»** la quita. Quien no tiene «Editar» en la carpeta ve la vista, pero no la cambia.

## 3 · Reglas

| Regla | Por qué |
|---|---|
| Una vista por **documento y carpeta**. Fijarla otra vez la sustituye. | Cada carpeta «representa» una vista. |
| La carpeta tiene que ser la del documento o una que lo **enlaza**. | No hay vista donde el documento no se ve. |
| Leer pide «Ver» en el documento; **fijar y restablecer, «Editar» en la carpeta**. | Decide cómo lo ve todo el que entra por ella, como enlazar. |
| El servidor guarda **solo** los campos de una vista, validados uno a uno: números finitos, tamaños y la forma del tipo (una vista de PDF no entra en un DWG). | No se guarda lo que manda el cliente tal cual. |
| Quien mira **puede moverse**: la vista guardada no cambia hasta que alguien con permiso la fija otra vez. | Es la vista de apertura, no una cámara compartida en vivo. |
| **Versión nueva** del CAD: la presentación se busca por su identificador y, si cambió, **por su nombre**. Si ya no está, se abre la vista por defecto **y se avisa**. | Nunca el encuadre de otra presentación sin decirlo. |
| **PDF con menos hojas** que la guardada: se abre en la última. | Lo más cercano a lo pedido. |
| Una dirección con `?vista=` (la Planilla) o `?pagina=` («Citado en») **manda** sobre la vista de apertura. | Un vínculo pide un sitio concreto. |
| **Quitar el enlace** quita su vista. Purgar el documento o la carpeta, también. | La vista era de ese enlace. |
| Fijar y restablecer quedan en la **actividad** de la obra. | Trazabilidad. |

## 4 · Cómo está hecho

- **Migración 49**: la tabla `doc_vistas_de_apertura`.
  - Clave `(documento_id, carpeta_id)`, `vista` JSONB de hasta 8 KB y la versión en que se fijó.
  - Quién la fijó y cuándo.
  - ON DELETE CASCADE a los dos nodos.
  - `REVOKE ALL` antes del `GRANT`, por los privilegios por defecto de producción (la lección de la 48).
  - Tiene su rollback. Sin ella aplicada, todo abre como siempre.
- **Una tabla propia**, y no una columna en `doc_enlaces` ni en `file_nodes`: así el original y cada enlace funcionan
  igual, y se puede ampliar a otros tipos de documento sin tocar el esquema de Archivos.
- **`backend/vistas_de_apertura.py`**: el tipo de documento, la validación de cada forma, el contexto (carpeta propia
  o enlazada) y las escrituras.
- **`GET|PUT|DELETE /api/docs/vista-de-apertura`**: una sola ruta, con guardia de obra y los permisos de carpeta
  reales. El techo de rutas del perfil portal pasa de 318 a 319.
- **Portal**
  - `utils/vistaDeApertura.js`: captura y vuelta, sin React.
  - `hooks/useVistaDeApertura.js` y `components/VistaDeApertura.jsx`: el botón y su ventana, que se cierra con Escape
    y con un clic fuera.
  - El CAD aplica la presentación y `restoreState({viewport})`. El PDF la aplica con su propio motor de zoom
    (`aplicarEscala`, el de la rueda).
  - Si la respuesta llega después de abrirse el documento, la vista se aplica igual, siempre que nadie haya cambiado
    de vista todavía.

## 5 · Lo que no hace

- Vistas **personales**, distintas para cada persona. Esta es por carpeta, igual para todos los que entran por ella.
- Modelos 3D (RVT, IFC, NWD). Se pidió solo para CAD y PDF.

## 6 · Probado

*Pruebas automáticas*
- `backend/tests/test_vistas_de_apertura.py`: 15 pruebas.
  - El tipo de documento.
  - La limpieza de una vista de CAD.
  - Diez formas rotas que no entran.
  - El PDF y sus límites.
  - La forma la decide el documento.
  - El tamaño.
- `pruebas/vistaDeApertura.prueba.mjs`: 7 pruebas.
  - La presentación: la misma, por nombre o ninguna.
  - Un PDF vuelve al mismo punto en la misma pantalla y al mismo encuadre relativo en otra.
  - Lo que no se puede medir no se inventa.
- Suite del backend: 2651 pasan. Falla `test_reconstruccion_desde_cero`, que ya fallaba antes en origin/main.
- `npm test`: 37 bancos en verde. El build sale bien. Lint sin errores nuevos.

*Contra la base desechable, con la ruta y los permisos reales: 16/16*
- Cada carpeta tiene la suya.
- Sin «Editar»: 403. Donde no está ni enlazado: 404. Un Excel, o una vista de PDF en un DWG: 400.
- El PDF de varias hojas abre en la hoja 4.
- Fijar otra vez sustituye; queda una fila por documento y carpeta.
- Restablecer funciona, también dos veces.
- Quitar el enlace se lleva su vista.

*En el navegador*
- **PDF**, con el lector real y un plano de dos hojas:
  - fijada la hoja 2 a ×2,14, reabre exactamente ahí (centro a 1/100 000);
  - con la respuesta llegando tarde, igual;
  - sin vista, como siempre;
  - en una pantalla de 1000 × 650, el mismo encuadre relativo (centro a 4/10 000).
- **CAD**, con el banco del visor:
  - sin vista, Model; con vista, el Layout «PERFIL LONGITUDINAL» y su cámara;
  - en una versión nueva, encontrada por su nombre;
  - borrada, la vista por defecto con su aviso;
  - llegando tarde, cambia a «PLANTA GENERAL» con su cámara;
  - la captura guarda la presentación y la cámara.
  - **El motor de Autodesk de ese banco es un sustituto**: `getState` y `restoreState` del visor real no se miden
    sin un modelo traducido y un token. Ese paso queda para la primera prueba en producción.
- **El botón**, en la pantalla real de Archivos:
  - dice desde qué carpeta se abre y en qué;
  - fija con PUT y avisa;
  - ofrece restablecer, que hace un DELETE;
  - se cierra con Escape.
