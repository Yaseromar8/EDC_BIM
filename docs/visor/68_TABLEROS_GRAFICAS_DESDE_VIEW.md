# 68 · Tableros: gráficas de View en el tablero de Docs

31-oct-2026. Fase 6 del plan (doc 57 §4), tras la investigación del doc 67. El dueño propuso, y se eligió:

> «o las gráficas estarían en View y exportamos al tablero una vez generadas … creo que sería mejor»
> «sí, correcto, entiendo que eso es lo más profesional»

## 1 · Por qué así (y no gráficas calculadas en Docs)

| | View calcula y envía (lo hecho) | Docs calcula (doc 67) |
|---|---|---|
| Datos | Todos, también los campos que calcula View: Planilla, capítulo, categoría de Revit | Faltan esos campos |
| Aislar en el 3D | Sí, en View | No |
| Motor | Uno, el de View | Una segunda copia de las reglas en el servidor |
| Perímetro del portal | No se abre el inventario: la ruta nueva solo recibe una gráfica ya hecha | Una ruta que lee el inventario |
| Lo que se cede | La tarjeta es una **foto con fecha** | — |

## 2 · Cómo se usa

1. **En View, en el Tablero de un frente:** cada gráfica de barras, dona, línea, área o número tiene «Enviar a un
   tablero de Docs».
   - Salen los tableros de la obra de ese frente; donde eres lector aparecen apagados.
   - Eliges uno y «Enviar».
   - Responde «Enviada a «X»» o, si ya estaba, «Puesta al día en «X»», con «Abrir en Docs».
2. **En Docs:** la tarjeta llega sola al tablero, aunque esté abierto (≤ 10 s, con la fusión de siempre).
   - Muestra el título, el frente y la métrica, las barras, la dona o el número **con los colores de View**, y el
     filtro si lo había.
   - Al pie: «Datos del 31 oct., 19:51 · Ana · de View».
3. **Ponerla al día:** volver a enviarla desde View. Cambian los datos y la fecha; la tarjeta sigue **donde la dejaron
   y del tamaño que le dieron**. Las copias en el mismo tablero se ponen al día todas.
4. **«Abrir en View»** (el enlace o doble clic) abre el Tablero del frente en View, donde está el modelo. En una
   instalación sin visor (`VITE_VISOR_URL` vacío) no hay enlace.
5. **Es una tarjeta del tablero:** se mueve, se escala, se busca (por título, campo y grupos), se publica en vistas,
   sale en las presentaciones, se copia y se pega.

## 3 · Piezas

| Pieza | Qué |
|---|---|
| `backend/routes/tableros.py` | La lista acepta `frente=` (View no conoce el árbol documental de la obra): los tableros de la obra del frente. Y `POST /api/docs/tableros/<tid>/graficas`:<br>· valida la forma (tipo, métrica, hasta 60 grupos, textos acotados, colores `#rrggbb`, ids de origen);<br>· exige que el frente sea de la obra del tablero;<br>· añade a la derecha de lo que hay, o reemplaza los datos de la misma gráfica (frente + tablero de View + gráfica) sin moverla;<br>· en una transacción (`FOR UPDATE`) y subiendo la versión.<br>No lee ni calcula nada del inventario |
| `backend/perimetro_de_obra.py`, `tests/test_perfil_portal.py` | `graficas_del_tablero` en el perímetro; el techo de rutas del portal sube de 303 a 304 |
| `design/lienzo/fusion.js` | Cuando dos personas cambian el mismo elemento, ya no gana entero el de quien guarda: **campo a campo, con la geometría como un bloque**. Yo muevo la tarjeta y View le cambia los datos → quedan los dos cambios. Vale para todos los elementos |
| `frontend-docs/.../tableros/graficas.js`, `TarjetaGrafica.jsx`, `tipoGrafica.js` | La tarjeta (SVG propio, sin librería), el enlace a View y la limpieza al pegar |
| `frontend-react/.../dashboard/EnviarATablero.jsx`, `ChartCard.jsx`, `DashboardWorkspace.jsx` | El botón y la ventana en View. Se manda la gráfica tal como se ve: título, subtítulo, grupos con sus nombres legibles y colores, total, elementos y filtro |

## 4 · Encontrado al probar

**Prueba:**
- La página de banco de View se abría **sin sus parámetros**: al pedir la pestaña nueva, lo que iba tras el primer
  «&» se perdía. Por eso el «frente de otra obra» era el bueno y el reenvío mandaba el valor viejo.
- Antes de verlo se interpretó como un choque entre mover y actualizar. Ese choque es posible: la fusión elegía el
  elemento entero, y se corrigió (§3). Pero **esta ejecución no lo demostró**: lo demuestra la prueba pura de la fusión.
- La base devuelve los acentos mal por la consola de Windows y los números como `340.0`: se compara por campo y en
  entero.

## 5 · Pruebas

**Banco** (`prueba_graficas.py`): **13/13**. La ventana real de View (página de banco `frontend-react/probar-enviar.html`,
que no se commitea) contra las rutas reales de Tableros y la base desechable. Cubre:
- la lista de la obra del frente; «Enviar» apagado hasta elegir;
- enviada y guardada a la derecha de lo que había;
- el tablero abierto la recibe sin tocar la nota de Ana;
- la tarjeta con su pie;
- «Abrir en View» con obra, frente y tablero;
- reenviar: la misma tarjeta, donde Ana la dejó, con el dato nuevo, y Docs la ve al día;
- Luis, lector, la ve apagada;
- un frente de otra obra no ve los tableros;
- Buscar la encuentra por sus grupos.

**Pruebas puras:** `graficasTablero` 6/6 y `fusionTablero` **14/14** (+4: mover y actualizar a la vez, texto y
movimiento, los dos mueven, la geometría no se mezcla).

**Servidor:** `test_tableros.py` 69/69 (+14).

## 6 · Pendiente

- Que «Abrir en View» centre el Tablero en esa gráfica: hoy abre el Tablero del frente.
- Avisar en la tarjeta si el modelo cambió después de la foto. Necesitaría leer la versión del inventario, que es del
  visor.
