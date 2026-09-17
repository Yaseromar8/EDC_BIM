# ALEPHIA · UI polish · F4 — barra lateral de Archivos

17-sep-2026. El propietario comparó en capturas la barra lateral de ALEPHIA y la de ACC, expandidas y
contraídas, y eligió la opción **B**:

- probar en local el arreglo sin commitear de la columna de iconos (en `FilesPage.jsx`);
- resolver además los seis puntos que quedaban frente a ACC;
- sin quitar ni añadir entradas, con la identidad ALEPHIA y sin copiar la barra azul de ACC.

Revisado el cierre, el propietario dictaminó el 17-sep-2026 `F4 BARRA LATERAL = CODE/TEST GREEN · PASS PARA
COMMIT` y autorizó un único commit. Aceptó expresamente que el arreglo previo de la columna de iconos quede
integrado en `BarraLateral`. **Sin push, despliegue ni F1.** Esta fase cubre solo la barra lateral: el «Row»
de Mi Trabajo, que el plan del informe 01 metía también en F4, no se ha tocado.

```
F4 BARRA LATERAL          = CODE/TEST GREEN · PASS PARA COMMIT
COLUMNA DE ICONOS         = PASS   iconos de 22 px en las 24 entradas, sin texto y centrados (0,5 px)
FOCUS WITH KEYBOARD       = PASS   anillo entero en los cuatro lados; antes, recortado a la izquierda
HOVER                     = PASS   respuesta visual MEDIDA (--a-state-hover, 1,25:1, primer fotograma); NO se declara AA
NOMBRE FLOTANTE           = PASS   con ratón y con Tab; se puede sobrevolar; se va al salir y con Escape
BOTÓN DE CONTRAER         = PASS   nombre accesible, «Contraer» / «Expandir» y flecha girada
SEPARADORES AL CONTRAER   = PASS   3 líneas entre los 4 grupos
PALETA                    = PASS   solo tokens; títulos 2,64 → 4,95:1; icono de contraer 2,85 → 4,95:1
NAVEGACIÓN                = SIN CAMBIO   mismas 24 entradas y mismo clic; permisos y filtros intactos
ACTIVE + HOVER            = identificada por Navy + peso; «selected-hover» pendiente del programa de tokens
FIREFOX / SAFARI / TABLETA = NOT TESTED
MI TRABAJO                = FUERA DE ESTA ENTREGA
TRIPWIRES                 = 9 PASS · T7b PREEXISTING FAIL 3.899 (antes 3.903: −4 grises de FilesPage)
WIP AJENO                 = INTACTO (los 6 restantes; FilesPage.jsx se integra con tu autorización)
```

## 1 · Medición: la desplegada, el arreglo sin commitear y F4

El mismo banco con la `FilesPage` real, construido tres veces cambiando solo `FilesPage.jsx`. Método en §4.

| Comprobación | Desplegada (4511e8f) | Arreglo sin commitear | F4 |
|---|---|---|---|
| Iconos con la barra contraída | **1,1–4,2 px** | 22 px | 22 px |
| Entradas con texto dibujado, contraída | 24 de 24 | 0 | 0 |
| Distancia de los iconos al centro, contraída | 15,9–17,4 px a la izquierda | **8 px** a la izquierda | 0,5 px |
| Separadores entre grupos, contraída | 0 | 0 | 3 |
| Barra de desplazamiento | 15 px con flechas | 15 px con flechas | 10 px fina; contraída, 10 + 10 |
| Anillo de foco con Tab en una entrada | **recortado a la izquierda** | **recortado a la izquierda** | entero en los cuatro lados (mínimo 3,39:1) |
| Hover | no cambia | no cambia | fondo `--a-state-hover` (1,25:1) desde el primer fotograma |
| Nombre de la entrada, contraída | solo `title` del navegador | igual | nombre flotante con ratón (10–16 ms) y con Tab |
| Nombre flotante sobrevolable / se va al salir / con Escape | — | — | sí / sí / sí |
| Botón de contraer | sin nombre, misma flecha | igual | «Contraer la barra lateral» / «Expandir la barra lateral», con nombre flotante y flecha girada |
| Títulos de grupo (11 px) | **2,64:1** | 2,64:1 | 4,95:1 |
| Icono del botón de contraer | **2,85:1** | 2,85:1 | 4,95:1 |
| Texto de entrada inactiva | 6,05:1 | 6,05:1 | 7,60:1 |
| Entrada activa | Navy sobre azul muy claro, 10,95:1 | igual | los mismos colores por token, 11,0:1 |
| Escape con una fila marcada y el nombre flotante a la vista | — | — | se va el nombre y la fila sigue marcada; un segundo Escape la desmarca |
| Clic en «Especificaciones» | navega | navega | navega |
| Contraer con clic y expandir con Enter | sí | sí | sí |
| Errores de página y de consola | 0 | 0 | 0 |

**El arreglo sin commitear era correcto en lo que tocaba.** Los iconos dejaban de aplastarse y el texto dejaba de
dibujarse. No resolvía tres cosas:

- la barra de desplazamiento de Windows le quitaba 15 px y los iconos quedaban descentrados;
- el anillo de foco de F0 salía recortado, porque las entradas tocan el borde de la lista;
- faltaban los seis puntos de la comparación con ACC.

Su lógica y su explicación siguen, ahora dentro del componente nuevo.

## 2 · Qué cambió

| Fichero | Cambio |
|---|---|
| `frontend-docs/src/components/BarraLateral.jsx` (nuevo) | Dibuja la barra: lista o columna de iconos, entrada activa con `aria-current`, hover, foco, nombre flotante y botón de contraer. Incluye el arreglo sin commitear: el icono no encoge y el texto no se dibuja con la barra contraída. |
| `frontend-docs/src/components/BarraLateral.css` (nuevo) | Estilos de la barra, solo con tokens. |
| `frontend-docs/src/pages/FilesPage.jsx` | Sale el dibujo en línea (14 líneas nuevas, 44 menos respecto a HEAD). **No se mueven:** las entradas, los grupos, los iconos, los permisos, el filtro de herramientas y de trabajo de campo, lo que hace cada clic, los anchos 240/60 ni el umbral de 100 px. |

### Decisiones

- **Colores por token.**

  | Elemento | Antes | Ahora |
  |---|---|---|
  | Texto de las entradas | gris de Google | `--a-text-secondary` |
  | Títulos de grupo e icono de contraer | gris claro | `--a-text-muted` |
  | Fondo de la entrada activa | literal | `--a-state-selected`, el mismo tono |
  | Texto de la entrada activa | `--accent` | `--a-action-primary`, el mismo Navy |
  | Bordes | literales | `--a-border-default` |
  | Fondo de la barra | literal | `--a-surface-base` |

- **Silueta de las entradas.**
  - Ahora quedan a 8 px de los bordes (4 px con la barra contraída), con radio `--a-radius-lg`.
  - Antes eran una pastilla pegada al borde izquierdo, y la lista recortaba el anillo de foco, que se dibuja
    4 px por fuera.
  - **Cambia la forma de la entrada activa con la barra expandida:** de pastilla abierta a rectángulo redondeado.
- **Hover.**
  - Usa `--a-state-hover`, el del canon tras T1, sin transición, como la fila de la tabla.
  - **Observación:** ese gris es más oscuro que el fondo de la entrada activa. La activa se distingue por el texto
    Navy y el peso.
  - Si se quiere un hover más suave, es una decisión del token, no de la barra.
  - **Observaciones del propietario al autorizar:**
    - `HOVER = PASS` significa respuesta visual medida; con 1,25:1 no se declara cumplimiento AA.
    - El estado combinado activa + hover («selected-hover») queda para el programa de tokens y no se corrige en F4.
- **Nombre flotante.**
  - Navy con texto blanco (12,31:1), a la derecha del elemento y en la capa `--a-layer-tooltip`.
  - Aparece solo con ratón o con foco de teclado. En una tableta, un toque no lo deja pegado.
  - Tarda 150 ms en irse para poder pasar el puntero por encima (WCAG 1.4.13).
  - Escape se escucha en captura: `FilesPage` usa Escape en `document` para limpiar la selección, y la misma
    tecla hacía las dos cosas.
- **Barra de desplazamiento.**
  - `scrollbar-width: thin` con el color de los bordes.
  - Con la barra contraída, el hueco se reserva a los dos lados (`scrollbar-gutter: stable both-edges`) para que
    los iconos queden centrados.
- **Botón de contraer.** 32 px, `aria-label`, `aria-expanded` y la flecha girada con `scale`, sin tocar `transform`.
  El icono queda donde estaba.

## 3 · Lo que no se hizo

- No se copió nada de ACC: ni su barra azul, ni sus colores, ni sus radios.
- No se añadieron ni quitaron entradas, ni se cambió su orden o sus grupos.
- No se tocaron el foco canónico de F0, `transition: all` de `.btn-*` (F1), Mi Trabajo, Reviews, menús ni el
  Tailwind por CDN.

## 4 · Cómo se midió

- **Banco fuera del repositorio.**
  - Monta la `FilesPage` real con un servidor falso, siguiendo la idea de `frontend-docs/src/probar-busqueda.jsx`:
    administrador de obra y de entidad, trabajo de campo disponible y herramientas encendidas.
  - Así salen las 24 entradas de la captura del propietario.
  - Tailwind por CDN e Inter, como en producción; Chrome sin ventana a 1280×800.
- **Tres construcciones** que solo difieren en `FilesPage.jsx`: HEAD, la copia del arreglo sin commitear y el árbol
  con F4.
- **Entrada real por CDP:**
  - clic en contraer, Enter para expandir y puntero encima;
  - Tab para el foco: antes se da foco por código al elemento anterior, para no pulsar ninguna entrada;
  - Escape, clic en una casilla de la tabla y clic en «Especificaciones».
- **Anillo de foco medido en píxeles** en los cuatro lados del botón enfocado, con el mismo método que T2.

## 5 · Pruebas ejecutadas

| Prueba | Resultado |
|---|---|
| `python design/tripwires.py` | 9 PASS · T7b FALLA 3.899 (antes 3.903: baja 4, los grises que `FilesPage` ya no escribe) |
| `python design/tripwires.py --autoprueba` | 5/5 |
| ESLint `BarraLateral.jsx` | 0 mensajes |
| ESLint `FilesPage.jsx` | 4, los mismos 4 que en HEAD y en el arreglo sin commitear (variables sin usar, anteriores) |
| `npm test` (frontend-docs) | 10 bancos en verde |
| `vite build` del portal a una carpeta temporal | OK: 460 módulos; el CSS y el JS llevan la barra nueva |
| Banco F4 en las tres versiones | tabla del §1; 0 errores de página y de consola |
| WIP ajeno (`sha256sum -c`) | 6/6 OK |

Evidencias en `docs/ux/evidencias/F4/`:

- `F4_barra_antes_despues.png`: la barra expandida y contraída en las tres versiones, con las cifras.
- `F4_estados_con_entrada_real.png`: foco con Tab, puntero encima, nombre flotante y botón de contraer.
- `F4_medicion.json`: los números.

## 6 · Límites y pendiente

- **Límites de la medición:**
  - Solo Chrome (Windows, sin ventana). Firefox, Safari y tableta = `NOT TESTED`.
  - En la tableta, el nombre flotante no debería aparecer con un toque; está razonado, no medido.
  - ACC no se midió en vivo en esta fase: la referencia son las capturas del propietario.
- **Pendiente:**
  - Commit autorizado el 17-sep-2026 (uno, con los ficheros de esta entrega). Push, despliegue y F1, sin autorizar.
  - «selected-hover» en el programa de tokens.
  - Mi Trabajo, fuera de esta entrega.
