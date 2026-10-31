# 56 · Conclusión: qué se mejoró en el Tablero, qué se aprendió y cómo colaborar entre usuarios

30-oct-2026. El dueño: «¿qué mejoras hiciste? Me interesa la colaboración entre usuarios. En conclusión de lo que investigaste y lo que te pasé».

## 1 · Qué se mejoró hoy

Todo está en la rama local `publicar-30oct`, **sin empujar ni desplegar**.

| Commit | Qué |
|---|---|
| `3bf4120b` | El tablero empieza en blanco (sin plantilla de auditoría), sin la línea de datos; doble clic sobre una gráfica abre su editor; barra lateral del visor más compacta |
| `d560cbb1` | **Pantalla completa** (el 3D no se redimensiona). **Cámara en el DOM**, sin pasar por React (rueda ×1,10 hacia el cursor, mover con espacio, clic derecho o botón central, con inercia, y encuadres animados). **Marco de selección**. **Teclado**: Supr, Ctrl+Z/Y, Ctrl+D, Ctrl+C/V, Ctrl+A, Esc, flechas, ⇧0/1/2. Menú de zoom |
| `57a0c90c` | **Aspecto de Forma Board**: zoom del 1 % al 400 % con rejilla por niveles; selección fina con asas; barras flotantes (herramientas abajo, datos a la izquierda, zoom en píldora); iconos finos. **Notas** (con puntos para la siguiente) y **texto** |
| `460d65e4` | **Arrastre fluido**: en el DOM, al píxel, con los **imanes de Excalidraw** (MIT) y sus líneas guía; foco al abrir |

**Medido** con Chrome sin ventana y la sesión del dueño:
- **rueda, mover y arrastrar: 6,9–7 ms por fotograma, ningún fotograma lento**;
- deshacer y rehacer, duplicar, copiar y pegar, notas y texto: comprobados;
- banco de imanes: 5/5.

**Pendiente del plan (doc 54 §4):** menú contextual, documentos de Docs en el tablero y vistas 3D como tarjeta (doc 56 §4).

## 2 · Lo investigado y lo que pasó el dueño

| Fuente | Conclusión |
|---|---|
| **Tableros de ACC** (su tablero de CONSTRUCCIÓN D06) | Son **Forma Board**, construido sobre **tldraw**. Se leyó su configuración y se midió el zoom. Traen **documentos de ACC en vivo** (PDF, DWG, RVT, láminas), incidencias, kanban y widgets. **No tienen gráficas del modelo ni 3D vivo** |
| **tldraw** | La referencia de comportamiento. **Licencia de pago en producción**: no se copia código |
| **Excalidraw** (MIT) | Se leyó `snapping.ts` y `renderSnaps.ts` y **se portaron sus imanes** |
| **sanidhyy/miro-clone** (MIT) | Next.js + **Liveblocks** (tiempo real) + Convex + Clerk. Su valor está en la **colaboración en vivo**, no en la fluidez |
| **jatin1510/miro-clone** | El mismo stack, sin licencia declarada; solo ideas (Ctrl+D, flechas, exportar PNG) |

**Por qué el nuestro era tosco** (y ya no lo es):
1. la rejilla de 16 px al mover;
2. React redibujando todas las tarjetas en cada movimiento de cámara y de arrastre.

## 3 · Colaboración entre usuarios

### Hoy: riesgo de perder trabajo

`PUT /api/dashboards/<id>` reemplaza **la configuración entera** (`UPDATE dashboards SET config = …`) sin versión. Si dos personas tienen el mismo tablero abierto, **el que guarda después pisa lo que hizo el otro**, sin aviso. Antes de cualquier colaboración en vivo, eso hay que cerrarlo.

### Qué hacen los demás

| Producto | Cómo colabora |
|---|---|
| **Forma Board (ACC)** | Avatares de quién está («YO» y el icono de miembros), comentarios en el lienzo, presentar y compartir. Motor tldraw con su sincronización (`@tldraw/sync`) |
| **Clones de Miro** | Liveblocks: cursores en vivo, presencia y almacenamiento compartido, en servidores de Liveblocks |
| **tldraw** | `@tldraw/sync`: servidor de websockets propio con un documento por sala |

### Opciones para ALEPHIA

| Opción | Qué da | Coste y riesgo |
|---|---|---|
| **1 · Guardado seguro + presencia** (sin infraestructura nueva) | **Nadie pisa a nadie**: el guardado lleva la versión y el servidor rechaza una versión vieja (409); el cliente **fusiona por elemento** (cada tarjeta, sección y nota tiene id) y reintenta. **Avatares** de quién está en el tablero (sondeo cada pocos segundos, como `/api/link/web-presence`). Los cambios de los demás aparecen en ≤ 3 s. **Comentarios** en tarjetas | Bajo. Encaja con Flask y Render (1 CPU / 2 GB). Hace falta una migración (`version` en `dashboards`) |
| **2 · En vivo con websockets propios** | Cursores de los demás moviéndose, cambios al instante | Medio-alto: Gunicorn con workers asíncronos o un servicio aparte; más memoria en Render |
| **3 · Servicio externo (Liveblocks)** | Lo más rápido de montar | **Los datos de la obra salen a un tercero**: choca con el CDE y la soberanía de datos. Además es de pago por uso |

**Recomendación:** la **opción 1 primero**. Resuelve el riesgo real (perder trabajo), da la sensación de equipo (quién está, qué cambió, comentarios) y no cambia la infraestructura. Los cursores en vivo (opción 2) solo si después hacen falta.

## 4 · Tablero con documentos y vistas 3D (la idea del dueño)

Traer planos, CAD y Revit de Docs y una vista 3D guardada; armar y encuadrar; seleccionar → **«Publicar vista»** → pantalla completa de consulta.

Casi todo existe ya por piezas:
- vista previa de 2.000 px por versión (`/api/docs/vista-previa/url`) y mosaicos (`/api/docs/mosaico`);
- el lector de PDF y el visor CAD;
- las vistas 3D guardadas (`/api/views`, también con enlace compartido);
- las vistas fijadas del tablero (pantalla completa, enlace, PNG, PDF).

**Fases:**
1. Botón «Documentos» en la paleta izquierda (recientes y búsqueda, respetando los permisos de Docs).
2. Doble clic → visor en ventana, con versión ▾ y páginas.
3. Tarjeta de vista 3D (imagen en el lienzo y 3D vivo en la ventana).
4. «Publicar vista» con cualquier mezcla.

**Decisión pendiente del dueño:** el botón en **Docs** (A) o en **View** (B, la recomendada).
