# 65 · Tableros: la cabecera como la de Forma Board (comentarios, presentar, compartir)

31-oct-2026. El dueño mandó tres capturas de la cabecera de un panel de ACC:
- avatar «YO» con **Miembros del panel**;
- **Mostrar comentarios**, con su panel a la derecha;
- **Editar presentación** (marcos → «Presentar»);
- **Compartir**.

Pidió llevar las cuatro. Este documento cubre tres; **Miembros del panel** necesita una migración y va en el doc 66.

## 1 · Qué hace ACC (sus capturas)

- **Cabecera, a la derecha:** avatares · Miembros | Mostrar comentarios · Editar presentación · (IA) | Ajustes ·
  «Hable con nosotros» · **Compartir** · ✕.
- **Mostrar comentarios:** un panel a la derecha, «Comentarios», con «Aún no hay comentarios» si no los hay. El botón
  queda azul mientras está abierto.
- **Editar presentación:** un panel a la derecha con «Presentar» y «Seleccionar marcos». Sin marcos, «Aún no hay
  marcos» y «Crear marco».

## 2 · Lo nuestro

| | Cómo |
|---|---|
| **Mostrar comentarios** | Botón en la cabecera, azul mientras está abierto. El panel (Abiertos / Resueltos) va **a la derecha**, con su ×. Un comentario abierto desde la lista ocupa su sitio, y «‹» vuelve a la lista. «Comentarios» sale de la paleta izquierda. La herramienta (C) sigue en la barra de abajo, como el «+ bocadillo» de ACC |
| **Presentar** | Botón en la cabecera; su panel, a la derecha, en el mismo sitio que Comentarios (uno a la vez). **Cada sección es una diapositiva** (nuestras secciones son los marcos de ACC). Van en **orden de lectura**: por filas, de arriba abajo, y en cada fila de izquierda a derecha. «▶ Presentar» empieza por la primera; el ▶ de una, desde esa; un clic en su nombre lleva la cámara a ella. Sin secciones, lo explica |
| **La presentación** | A pantalla completa, cada sección encajada con su contenido (las mismas piezas, de consulta; sin comentarios). Se pasa con ‹ › o con ← →, Re Pág / Av Pág y espacio; Inicio y Fin; Escape o ✕ salen. Abajo, «Sección 3 · 1 de 3». Las teclas no llegan al tablero de debajo. Doble clic en un documento o una incidencia los abre |
| **Compartir** | Botón principal de la cabecera. Abre «Compartir el tablero», con el enlace (`/?obra=…&tablero=…`) y «Copiar enlace». Quien lo abre entra con su usuario: tiene que poder entrar en la obra (y, con el doc 66, en el tablero) |

**No se copia (aún):**
- **«Seleccionar marcos»** de ACC (elegir y reordenar diapositivas): por ahora se presentan todas las secciones, en
  orden de lectura.
- **El asistente de IA:** NADA de IA (decisión del dueño).
- **«Hable con nosotros»:** es de Autodesk.

## 3 · Encontrado al probar y corregido

**Producto:**
- **Los botones de la cabecera se quedaban el foco.** Tras pulsar Presentar o Comentarios con el ratón, los atajos del
  tablero (F, N, C…) dejaban de llegar hasta hacer clic en el lienzo. Lo destapó la prueba: la primera sección no se
  creaba. Ahora esos botones no toman el foco con el ratón; con el teclado (Tab) siguen siendo accesibles.

- **Con un hilo abierto, «Mostrar comentarios» no enseñaba la lista** (el hilo ocupaba su sitio). Ahora abrir un panel
  de la derecha cierra el hilo.
- **Escape no cerraba un hilo si el foco había caído al body.** Ahora sí; si hay otra ventana encima, Escape sigue
  siendo de esa ventana.

**Banco:**
- **Pestaña oculta:** la foto de Luis traía su pestaña al frente y dejaba oculta la de Ana, a la que ya no le llegaban
  los clics. La prueba la vuelve a traer al frente.
- **Presencia en el puente local** (no es del producto). La base de ensayo no tenía las cuentas de producción, así que
  una segunda cuenta no podía ni abrir el tablero: error 500, por la clave foránea de `tableros_abiertos`.
- Un primer arreglo intentó darla de alta con `ecd_app`, que no puede escribir en `users` (mínimo privilegio), e hizo
  fallar también la ventana del dueño unos minutos.
- Ahora el puente la da de alta con el superusuario **del clúster desechable**, como el banco. En producción las
  cuentas existen y esto no pasa.

## 4 · Pruebas

**Banco** (`prueba_cabecera.py`): **21/21**, con ratón y teclado reales. Cubre:
- los tres botones;
- Presentar sin secciones; tres secciones creadas fuera de orden y presentadas en orden de lectura, con su contenido;
- → ← Fin con su tope; ◀ con el ratón;
- Supr y N, que no llegan al tablero; Escape; «Presentar desde aquí»; ✕;
- Comentarios a la derecha y uno a la vez; ×;
- Compartir: el enlace exacto y copiarlo.

**El resto:**
- `prueba_comentarios.py` **34/34**: abre el panel desde la cabecera y comprueba «‹ volver».
- Repetidas tras los últimos arreglos: `prueba_cabecera.py` 21/21, `prueba_comentarios.py` 34/34 y `prueba_vistas.py`
  37/37.
- La regresión entera, antes de esos dos últimos arreglos (hilo y Escape): todo en verde salvo el caso de comentarios
  que los destapó.
- **Pruebas puras:** `vistaTablero.prueba.mjs` **19/19** (+3 del orden de lectura).
