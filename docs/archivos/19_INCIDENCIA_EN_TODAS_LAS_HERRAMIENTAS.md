# 19 · La incidencia en todas las herramientas: un solo panel lateral

2-nov-2026. En local, sin commit. Sigue al doc 18 (estados de ACC y migración 45).

## 1 · Lo que pidió el dueño

> «Crear un issue y que se abra un panel lateral y ahí se haga todo eso.»

> «El issue debe estar en nuestras demás herramientas.»

## 2 · La decisión: una sola pieza, compartida por Docs y View

La incidencia se crea y se trabaja en el **mismo panel lateral**, como en ACC, y es el mismo en todas las herramientas.
Vive en `design/incidencias/`, la carpeta que ya comparten Docs y View (como `design/lienzo/` de los tableros):

| Fichero | Qué es |
|---|---|
| `reglas.js` | Los estados de ACC, quién puede cada acto, a quién le toca y el historial en palabras. Puro, sin red ni React. `frontend-docs/src/utils/estadosDeIssue.js` lo reexporta |
| `piezas.jsx` | Responsable (persona o empresa), observadores, clasificación y lo que hace falta saber de la obra |
| `PanelDeIncidencia.jsx` | El panel: el **alta** y el **detalle** |
| `incidencias.css` | Sus estilos, propios: no dependen de Docs |

**El alta** lleva, en un solo sitio:
- título, detalle y tipo;
- responsable (persona o empresa) y quien verifica;
- fecha límite, lámina o ubicación;
- observadores y clasificación;
- **fotos y documentos desde el primer momento**.

Tiene «Crear» y «Guardar borrador». Al crearla, el mismo panel pasa a **detalle**.

**El detalle** lleva:
- arriba, el estado y a quién le toca;
- debajo, los actos del paso de quien mira;
- los datos (reasignar, seguir, clasificar);
- y las pestañas **Comentarios**, **Adjuntos** e **Historial**.

**El panel no sabe de qué aplicación es.** Cada una le pasa un `entorno` con:
- cómo pedir al servidor y cómo avisar;
- cómo abrir un documento, subir una foto y elegir un documento;
- quién soy.

En Docs es `components/IncidenciaLateral.jsx`, que además conserva el alta **sin cobertura** (cola de campo) cuando
el alta no lleva nada que la cola no sepa transportar. Y **sin red** el panel saca los tipos de incidencia de la precarga de campo
(`catalogoSinRed`): las pruebas de GAP 07 destaparon que el panel nuevo solo los pedía a la red.

**Desde dónde nace** lo dice cada herramienta:
- `nueva.origen`: una lámina, una foto, un elemento del modelo…
- o `crear(cuerpo)`: la ruta de la observación de una marca o de un plano, que además fija la versión y comprueba las
  marcas.

## 3 · Fases

| Fase | Dónde | Estado |
|---|---|---|
| **1** | **Lector**: plano entero y marca. **Issues y punch**: lista a la izquierda, panel a la derecha. **Tableros**: sus tarjetas de incidencia abren el mismo panel | ✅ En local, probada en el banco |
| **2** | Resto de Docs: **Planos** (desde una lámina), **Revisiones** (desde un documento en revisión), **Fotos**, **Protocolos** (no conformidad), **Cuaderno** (vincular) | Pendiente |
| **3** | **View**: incidencia sobre **elementos del modelo 3D**, con chincheta en el elemento (dbId, linaje, punto), la cámara guardada, la lista en el visor y el mismo panel | Pendiente |

Las fases 2 y 3 **no necesitan migración nueva**: `origen_tipo` es texto y `evidencia` es jsonb. Para la 3 hay que
comprobar antes qué servicio de producción sirve a View y si tiene `/api/issues` (el perfil `portal` sí lo tiene).

## 4 · Servidor

La observación de **una marca** (`POST /api/pdf/markups/<id>/observacion`) acepta lo mismo que la del plano y que
cualquier incidencia:
- empresa responsable, observadores y adjuntos;
- subtipo, causa raíz y campos propios;
- borrador.

Lo valida `routes.issues.datos_de_la_45`, una sola regla. Sin rutas nuevas.

## 5 · Pruebas (fase 1)

| Qué | Resultado |
|---|---|
| `test_marcas_con_enlace.py`, `test_observacion_del_plano.py`, `test_estados_de_issue.py`, `test_gap11core_issues.py`, `test_perfil_portal.py`, `test_cobertura_autorizacion.py`, `test_capacidades_sin_pantalla.py` | 154/154 |
| `node pruebas/estadosDeIssue.prueba.mjs` | 7/7 |
| `node pruebas/marcasConEnlace.prueba.mjs` | 11/11 |
| Build de Docs | compila |

En el banco local, con la pantalla real:
1. **Ana**, en el lector: «Observaciones del plano» → «Nueva» abre el panel único, con las marcas de la V1.
   - La asignó a Contratista SAC, con Eva de observadora.
   - Al crearla, el mismo panel pasó a detalle: ISS-001, «Corregir: Contratista SAC (empresa)», las tres marcas
     enlazadas y las pestañas.
2. **Mario**, de la contratista: abrió la observación y pulsó «Empezar a corregir», y pasó a En curso.
3. **Eva**, en «Issues y punch»:
   - «Levantar issue» abre el mismo panel con tipo, lámina, ubicación, observadores y fotos.
   - Al pulsar una fila, el panel se abre a la derecha y la lista sigue visible.

**Sin verificar:**
- Los tableros, en pantalla: usan las mismas piezas y compilan, pero no se abrieron en el banco.
- Subir una foto real: el banco no tiene almacenamiento.
