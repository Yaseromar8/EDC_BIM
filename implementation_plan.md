# Fix Mismatched View GUIDs between DB and React State

El problema está causado por una discrepancia técnica entre cómo Autodesk informa los identificadores de vista (GUID) en su API de Backend vs cómo los interpreta el Visor 3D en el Frontend.

1. **La Base de Datos**: Guardó la vista "SCL_APS" usando su identificador de "recurso" (93912d3...), que es lo que Autodesk Docs informa.
2. **El Visor 3D**: Cuando carga el modelo, busca los nodos de tipo "geometría" (Geometry). Inteligente como es, detectó que 93912d3... era un recurso y automáticamente escaló a su nodo padre (63545f5...) para poder renderizarlo. Por eso la geometría 3D **sí cargó bien**.
3. **El Panel Lateral**: Cuando el visor le pasó la lista de vistas disponibles a React, solo le pasó los identificadores de geometría (63545f5...). React intentó buscar 93912d3... en esa lista, no lo encontró, y por eso cayó en el texto por defecto ("NAVISWORKS").

## Proposed Changes

### 1. Viewer.jsx
- Modificar el mapeo extractedViews (aprox línea 1450). En lugar de enviar solo el guid principal de geometría, el visor recolectará también todos los identificadores "hijos" (recursos lógicos) que pertenecen a esa geometría y los empaquetará en un arreglo llGuids.

### 2. SourceFilesPanel.jsx
- Modificar getActiveViewName (aprox línea 100). Ahora la función buscará el defaultViewGuid de la base de datos comparándolo no solo contra el guid principal de la vista, sino también contra cualquiera de sus llGuids anidados.

## User Review Required
No haré más console.logs, he encontrado el verdadero problema. Esto unificará la memoria entre el backend y el frontend. ¿Procedo a inyectar esta corrección arquitectónica?
