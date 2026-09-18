# Comparador · varios modelos en un lado, archivo local y modelos de ECD Docs

18-sep-2026. Preguntas del propietario: «¿funciona bien con archivos vinculados? O sea, en uno vincular varios y el
otro solo» · «¿podemos cargar un archivo local para esa comparativa?» · «debería ser posible cargar modelos desde
nuestra carpeta de ECD Docs, ¿es posible?». **Medición en producción y lectura de código; no se ha cambiado nada.**

## 1 · En corto

- **Varios modelos en un lado y uno en el otro: funciona** (medido en producción). Datos, 3D y alineación
  correctos. Una salvedad medida: si dos ficheros del mismo lado comparten elementos —un derivado como
  «…-ENCOFRADOS», hecho a partir del principal—, el comparador no sabe de cuál es cada uno. Resultado: 1 elemento
  sale «modificado» sin poder estarlo, y en 3D los elementos compartidos se pintan y se seleccionan en uno solo de
  los dos ficheros.
- **Archivo local y ECD Docs: posible, y la mitad ya existe.** El visor ya sube un modelo local a Autodesk y el
  portal ya «publica al visor» un documento del ECD. Lo que falta es que esos modelos tengan **datos**: desde B1
  (7-sep) el inventario solo acepta modelos que vienen de ACC y rechaza los demás (`INVALID_SOURCE_URN`). Sin datos,
  el comparador solo podría enseñar la geometría, no qué cambió. Para ECD Docs hace falta una decisión sobre la
  identidad de B1.

## 2 · Varios modelos en un lado (medido el 18-sep-2026)

Chrome del propietario, frente `1_DRENAJE`, solo versiones actuales (así no se crea ninguna extracción temporal):

- **A:** `…DR-HD-011264@011268.rvt` v64.
- **B:** el mismo v64 **+** `…DR-HD-011264@011268-ENCOFRADOS.rvt` v31.

| Resultado | Valor |
|---|---|
| Elementos en el inventario | A 406 · B 3.849 (406 + 3.443) |
| Agregados | **3.442**, todos del fichero de encofrados |
| Eliminados | 0 |
| Modificados | **1**, y ese elemento está en los DOS ficheros de B |
| Ids repetidos dentro de las listas | 0 |
| Ids compartidos entre el principal y el de encofrados (mapeo de LMV) | **131.833** de 399.144 |
| 3D | B carga los dos ficheros con el mismo origen (`globalOffset`) que A: alineados |

**Qué significa.** El de encofrados se hizo a partir del principal y conserva los identificadores de Revit de
buena parte de sus elementos. El comparador empareja elementos **solo por ese identificador**, sin mirar de qué
fichero es cada uno:

- El «1 modificado» es falso: el principal es la misma versión en los dos lados y no puede haber cambiado. Sale
  porque la copia de ese elemento dentro del fichero de encofrados tiene otras propiedades.
- En 3D, el comparador guarda un solo elemento por identificador. Para los 131.833 compartidos, el color y la
  selección espejo caen en uno de los dos ficheros (el último cargado), no en los dos.
- Con ficheros independientes entre sí (sin elementos compartidos) no pasa nada de esto.

**Arreglo propuesto (no hecho):** cuando un lado tiene varios documentos, emparejar por **documento + elemento**:
un documento que está en los dos lados se compara consigo mismo por identificador; uno que solo está en un lado
aporta todo como agregado o eliminado. Con un documento por lado —el caso de siempre, y el que permite comparar un
modelo con un derivado suyo— se sigue emparejando por identificador como hoy. En 3D, el mapa de identificadores
pasa a ser por modelo. El inventario ya guarda de qué documento es cada fila (`source_urn`), así que no hay
migración. Se puede medir con este mismo caso: el resultado correcto es 3.443 agregados y 0 modificados.

## 3 · Archivo local y ECD Docs

### 3.1 · Lo que ya existe

| Vía | Qué hace | Quién |
|---|---|---|
| Visor → «Importar modelo» → FILE UPLOAD | Sube el fichero a Autodesk por URL firmadas, lo traduce y lo añade al frente (`/api/modelos/firmar-subida`, `/cerrar-subida`, `/api/config/project/upload/finalize`) | solo admin |
| Portal (ECD Docs) → «Publicar al visor» | Los bytes van del almacén del ECD a Autodesk sin volver a subirlos; no publica un borrador (WIP); la clave es la huella del contenido, así que no se paga dos veces; el URN queda guardado en el documento (`/api/modelos/publicar-desde-ecd`) | solo admin |

Traducir en Autodesk consume créditos de la cuenta; por eso las dos vías son solo de administrador.

### 3.2 · Lo que falta para compararlos

1. **Elegirlos en el comparador:** hoy cada lado solo ofrece los modelos vinculados al frente, con sus versiones
   de ACC. Haría falta una tercera fuente por lado: «documento del ECD» y «archivo de mi equipo».
2. **Sus datos.** El diff se calcula en Postgres sobre el inventario, y desde B1 (7-sep) el inventario solo acepta
   versiones de ACC (`urn:adsk.wipprod:fs.file:vf.…?version=N`, con su linaje). Un modelo subido o publicado desde
   el ECD es un objeto del almacén de Autodesk (`urn:adsk.objects:os.object:…`) y su extracción se rechaza:
   comprobado en local, `source_identity` devuelve `INVALID_SOURCE_URN` en claro y en base64. Se vería en 3D, sin
   datos, y sin datos no hay «agregado / eliminado / modificado».
   - **ECD Docs** tiene una identidad natural: el propio documento del ECD y su versión (`file_nodes` +
     `file_versions`), que es justo lo que pide B1 (un linaje estable y una versión). Aceptarla es ampliar la regla
     de identidad de B1, que está congelada: **decisión del propietario**.
   - **Un archivo local suelto** no tiene identidad estable: solo tiene sentido como lado **temporal** de una
     comparación (como las versiones históricas, `__cmp__`), sin quedarse en el inventario.
3. **Emparejar elementos:** funciona si el fichero es el mismo modelo de Revit —una copia de trabajo o una
   revisión emitida—, porque Revit conserva los identificadores. Dos ficheros sin relación darán todo como
   agregado y eliminado.

### 3.3 · Hallazgo lateral

Por la misma regla, **hoy un modelo subido desde el equipo o publicado desde el ECD a un frente se queda sin datos**:
se ve en 3D, pero Filters e Inventory no tienen nada suyo (la extracción falla en silencio, en un hilo). Según el
manifiesto de P0 (6-sep, `docs/filters/P0_PRECHECK.md` §3) los 12 modelos configurados son de ACC, así que no
afecta a nadie todavía; afectará al primero que use cualquiera de esas dos vías.

## 4 · Orden propuesto (nada hecho ni autorizado)

1. **Emparejar por documento** cuando un lado tiene varios (§2). Pequeño, backend + comparador, medible con el caso
   de encofrados.
2. **Decisión:** ¿los documentos del ECD entran en el inventario con su propia identidad? Si sí: ECD Docs como
   fuente del comparador, y de paso los modelos publicados desde el ECD tendrían datos en Filters.
3. **Archivo local** como lado temporal de una comparación, solo admin por el coste de traducir.
