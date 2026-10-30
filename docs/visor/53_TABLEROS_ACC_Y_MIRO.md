# 53 · Los «Tableros» de ACC y el repositorio de Miro: qué son y qué nos sirve

30-oct-2026, a pedido del dueño: «analiza lo que tengo abierto, a detalle, y también github.com/miroapp».

Lo que tenía abierto era **ACC → Docs → Tableros** del proyecto CONSTRUCCIÓN D06. Lo revisé solo mirando: abrí sus paneles y no creé, moví ni borré nada.

## 1 · Qué es por dentro

| Pieza | Lo que se ve |
|---|---|
| En ACC | Docs → «Tableros». Abre un componente web de Autodesk Forma (`forma-board-landing`, cargado de `app.autodeskforma.com/web-components/board-landing/v1/board-landing.js`) |
| El tablero en sí | Un iframe de **Autodesk Forma Board** (`integration.formadesign.autodesk.com/board/<usuario>/<tablero>`). El nombre interno del producto es «Forma Board»; en ACC sale como «Forma Panel» |
| Motor del lienzo | **tldraw**, la librería de lienzo infinito para React. Usa sus clases `tl-container` y `tl-canvas-overlays` y sus globales `TLDRAW_TAB_ID_v2` y `tldrawReady` |
| Formas | De tldraw: trazo libre (`draw`), marco (`frame`), texto, imagen y grupo. **Propias de Autodesk:** nota (`forma-note-widget`) y sticker o voto (`forma-sticker-widget`) |
| Interfaz | Su sistema de diseño **Weave** (`weave-button`, `weave-icon-button`, `weave-tooltip`, `weave-flyout`…) |
| Otros | Un registro MCP (`__formaMcpRegistry`, por donde enchufa su asistente de IA), Intercom, Mixpanel y Pendo |

## 2 · Qué ofrece al usuario

- **Barra inferior:**
  - seleccionar y mano (mover el lienzo);
  - notas adhesivas (el taco amarillo);
  - lápiz;
  - stickers o votos («+1»);
  - texto, flecha, formas y marco;
  - otras dos herramientas que no tienen nombre visible (sin abrir sus menús, no se puede decir cuáles son).
- **Barra izquierda: traer datos de la obra al tablero.**
  - **Site Design.**
  - **Data Management:** «Añadir archivos de Data Management», con los vistos recientemente.
  - **Incidencias:** elegir incidencias o «Crear incidencia», con las últimas modificadas (por ejemplo, «#139 · Pernos rejilla metálica, canal de…»).
  - **Imagen.**
  - **Buscar.**
  - Deshacer y rehacer.
- **Arriba:** título, miembros del panel, comentarios, presentar, rejilla, «Hable con nosotros» y **Compartir**.
- **Abajo a la derecha:** zoom (−, %, +).
- **En la dirección:** van el encuadre (`board.x/y/w/h`), así que un enlace abre el tablero en el mismo sitio.

**Lo que no tiene: gráficas de datos.** Es una pizarra de colaboración, como Miro: notas, dibujo, documentos e incidencias de ACC encima. No calcula nada del modelo. Nuestro Tablero hace lo contrario: gráficas vivas del inventario BIM que aíslan y colorean el 3D, auditoría frente al itemizado y vistas.

## 3 · El repositorio de Miro (github.com/miroapp)

46 repositorios públicos. Los más visibles:

| Repositorio | Qué es |
|---|---|
| `app-examples` (430 ★) | Ejemplos de **apps que se instalan dentro de Miro** (Web SDK) |
| `api-clients` | Clientes de la API REST de Miro (Python) |
| `miro-ai` | Herramientas de IA de Miro (servidor MCP y skills) |
| `quill`, `rich-text-delta` | Su editor de texto enriquecido (fork de Quill) |
| `cloud-data-import` | Importa infraestructura cloud a un tablero de Miro |

**El lienzo de Miro no es público.** Lo que publican sirve para extender Miro o hablar con su API, no para construir un tablero propio. No nos aporta código para el nuestro.

## 4 · Qué nos sirve

| Opción | Licencia (verificar antes de decidir) | Encaje |
|---|---|---|
| **tldraw**, lo que usa Autodesk | Desde la versión 4 (sep-2025) pide **clave de licencia comercial** para uso comercial en producción; hay prueba de 100 días y el precio es por cotización. Antes bastaba con dejar su marca de agua | Pizarra completa (notas, dibujo, marcos, flechas, colaboración). Habría que meter nuestras gráficas como formas propias, como hizo Autodesk con las suyas |
| **Excalidraw** | MIT, libre | Pizarra con estética de boceto; menos pensada para incrustar formas propias complejas |
| **React Flow** | MIT, libre | Nodos y conexiones; bueno para diagramas, no para pizarra libre |
| **Nuestro lienzo actual** | Propio | Ya hace lo que importa (tarjetas, secciones, zoom, mover, vistas, compartir). Lo que le falta frente a Forma Board son las piezas de pizarra (notas, texto libre, flechas, imagen) y traer documentos e incidencias |

**Recomendación:** no cambiar de motor. El valor del Tablero son las gráficas conectadas al 3D, que ni Miro ni Forma Board tienen. Si se quiere lo de pizarra, añadir al lienzo propio, por partes y por orden de uso:
1. **Imagen o PDF** (pegar o arrastrar; la opción B de la conversación del 30-oct).
2. **Nota o texto libre.**
3. **Documento de Docs e incidencia** como tarjeta, que es justo lo que Forma Board trae de ACC.
4. **Flecha.**

Así no hay licencia de terceros ni se mezclan dos lienzos.

Fuentes: [tldraw SDK License](https://tldraw.dev/legal/tldraw-license) · [tldraw · License key](https://tldraw.dev/sdk-features/license-key) · [github.com/miroapp](https://github.com/miroapp)
