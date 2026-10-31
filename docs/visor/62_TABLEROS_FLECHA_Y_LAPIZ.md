# 62 · Tableros: flecha y lápiz

31-oct-2026. Cierra lo que el doc 60 §2 dejó «para la vuelta siguiente»: la **flecha** y el **lápiz** de la barra de
abajo de Forma Board. Es el primer paso del cierre del tablero (doc 57 §4: incidencias → flecha y lápiz → publicar
vista → presencia y comentarios → 3D).

## 1 · Qué hace ACC (medido en su panel, doc 60 §1)

- Barra de abajo: seleccionar · mano · notas · **lápiz** · +1 · texto · **flecha** · formas ▾ · sección ▾.
- La flecha se arrastra del inicio al final; elegida, su barra trae línea, color y los extremos (punta al final, en
  los dos, ninguna). El lápiz dibuja a mano y sigue puesto hasta que se suelta.

## 2 · Lo nuestro

| | Cómo |
|---|---|
| **Flecha** (A) | Se arrastra del inicio al final; **con Mayús, en múltiplos de 45°**. Un clic sin arrastrar: 200 hacia la derecha. Queda elegida y vuelve «Seleccionar». Negra, continua, grosor M, punta al final. Las puntas son chevrones abiertos, como en un plano |
| **Lápiz** (P) | Trazo a mano, suavizado (curvas por los puntos medios). Guarda solo los puntos que se ven: uno cada 2 px de pantalla. **Se queda puesto** para seguir dibujando; Escape lo suelta |
| **Cómo se guardan** | La flecha: su caja y en qué esquina empieza (`invX`, `invY`). El trazo: su caja y sus puntos normalizados 0–1, así que **escalarlo por las asas escala el dibujo** (con Mayús, en proporción) |
| **Barra** | Las dos: candado · **Línea** (grosor y trazo) · **Color** · ⋮. La flecha además **Puntas** (al final, en los dos extremos, sin puntas). Sin Relleno ni texto. Mezcladas con formas, la barra ofrece lo común |
| **Coger** | Por la línea (una franja de 14 px), nunca por su caja: lo que hay debajo se sigue pudiendo elegir |
| **Deshacer** | Cada flecha y cada trazo, un paso |
| **Copiar, pegar, duplicar, buscar, miniatura, atajos** | Pegar valida color, grosor, trazo, puntas y puntos; Buscar los llama «Flecha» / «Trazo»; la miniatura los dibuja; la ventana de atajos (?) trae A y P |

Ficheros: `design/lienzo/formas.js` (geometría), `PiezasLienzo.jsx` (piezas y barras), `Lienzo.jsx` (dibujo, asas,
teclas, pegar), `MenusLienzo.jsx`, `miniatura.js`, `Icono.jsx`. El lienzo es compartido: View compila con el cambio.

**No se copia:** la flecha que se engancha a otro elemento (tldraw «binding») — una flecha suelta basta para señalar
sobre una lámina; el «+1» y el comentario van con la presencia (fase 5).

**Encontrado al probar y corregido (producto):** al soltar, el paso de deshacer se cerraba con el estado aún sin
pintar (la flecha de un clic, todavía de 1 px), y el ajuste final quedaba como un segundo paso: Ctrl+Z dejaba un
punto. Ahora el gesto se cierra con el elemento en su forma final (`cerrarDibujo`), un solo paso.

**Encontrado y corregido (prueba):** los trazos de la prueba se dibujaban debajo de la barra de abajo (la ventana del
banco mide 816 px de alto).

## 3 · Pruebas

Banco (`prueba_flecha_lapiz.py`, ratón y teclado reales contra las rutas reales de Tableros y la base desechable):
**28/28** — flecha arrastrada, hacia atrás, con Mayús, de un clic; puntas y color; un paso de deshacer; se coge por la
línea y no por la caja; lápiz con su curva y su caja, que se queda puesto, deshacer por trazo, Escape; grosor XL,
Ctrl+D; guardado en la base, miniatura y reapertura.
