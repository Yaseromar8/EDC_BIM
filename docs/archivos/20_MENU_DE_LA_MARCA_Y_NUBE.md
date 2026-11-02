# 20 · El menú de la marca (como ACC) y la nube de revisión terminada

2-nov-2026. En local. Sigue a los docs 18 y 19.

## 1 · Lo que pidió el dueño

> «Las marcas, nubes, no deben activar ningún panel. Deben tener las mismas opciones que ACC cuando se crea una marca
> nube. Por ahora solo foto e issue deben tener su panel.»

## 2 · Lo que hace ACC (medido el 16-oct, `docs/ux/ACC_LECTOR_MARCAS_FOTO_REFERENCIA.md`)

- Al elegir una marca **no se abre un panel**: sale un menú junto a ella con **Editar** (estilo: color de trazo y de
  relleno), **Duplicar**, **Referencia**, **Publicar** y **Suprimir**.
- Solo la **foto** abre su panel a la derecha («Referencias a fotos»). La **incidencia** tiene el suyo.

## 3 · Lo nuestro

Al elegir una nube, un rectángulo, una flecha, un texto, un trazo, una medición o un sello aparece `BarraDeMarca`
encima de la marca (debajo si no cabe):

| Botón | Qué hace | Quién |
|---|---|---|
| **Estilo** | Color de trazo · relleno (paleta, translúcido) · grosor (fino, medio, grueso) · en la nube, festones (pequeños, medianos, grandes) y **triángulo de revisión** | Su autor, en borrador y sin observación abierta |
| **Editar texto** | En las marcas de texto | Ídem |
| **Editar el sello** | Abre su diálogo | Su autor |
| **Referencia (n)** | Los documentos que cita: abrirlos, añadir, quitar | Ver, cualquiera; cambiar, su autor |
| **Observación** | Si la marca está en una, su chip («ISS-001 · Abierta») abre el **panel de la incidencia**; si no, «Crear observación» | Crear, su autor |
| **Llevar a la vigente** | Si es de una versión anterior | Su autor |
| **Duplicar** | Una copia tuya en borrador, desplazada, con su estilo y su texto | Cualquiera |
| **Publicar / Retirar** | — | Su autor |
| **Suprimir** | Con confirmación; no con una observación abierta | Su autor |

**Esc** cierra el menú. La **foto** sigue abriendo su panel.

## 4 · La nube de revisión, terminada (lo aprobado el 31-oct)

- **Festones a escala del plano:** se miden en puntos de la hoja (6 / 10 / 16 pt de radio), no en píxeles de
  pantalla: con el zoom crecen y menguan como en papel.
- **Grosor y relleno:** como el «Estilo» de ACC.
- **Triángulo de revisión:** en la esquina superior derecha, con el código de la revisión (C02, R1…). Se propone el
  del nombre del documento (`…-C02.pdf`) y se puede cambiar o quitar.
- **Nube poligonal:** herramienta nueva en «Marcar» (tecla N). Se hace clic en cada vértice y doble clic para cerrarla.
  Es una nube con `points` en vez de su caja; se mueve, se cambia por sus vértices y se duplica igual.

**Servidor:**
- `routes/pdf_tools.py` acepta en `style` `grosor`, `relleno`, `festones` y `triangulo`, con valores cerrados, solo
  donde tienen sentido y con las mismas reglas que el color.
- La nube admite `points`.
- Sin migración: `style` y `geometry` son jsonb.

## 5 · Pruebas

| Qué | Resultado |
|---|---|
| `test_marcas_con_enlace.py` (estilo, triángulo, nube poligonal) | 52/52 |
| Ensayo contra PostgreSQL real (doc 18) | 67/67 |
| Build de Docs y del banco | compilan |

**Sin verificar en pantalla:** el menú, el estilo y la nube poligonal. El panel del navegador de la app estaba oculto
y el lector no dibuja la hoja así. Es lo primero que hay que mirar en el banco (`probar-plano.html`).
