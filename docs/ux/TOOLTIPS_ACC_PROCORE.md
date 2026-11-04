# Tooltips · cómo lo hacen ACC y Procore (4-nov-2026)

Pregunta del dueño: «¿puedes analizar cómo hace Procore, ACC?», sobre los textos que salen al pasar el ratón.

## Qué se pudo ver

- **Las guías escritas de los dos piden hoy iniciar sesión**: Weave (Autodesk, la de ACC) redirige a un login, y la
  de Procore Core también (`design.procore.com/tooltip` → 404; `core.procore.com` → «Log In»). No hay reglas de texto
  publicadas que citar.
- **Procore**: su componente es código abierto (`@procore/core-react` 12.46.0, en npm). De ahí salen sus valores.
- **ACC**: lo que medimos EN VIVO el 13-oct-2026 en el ACC del dueño (UI_POLISH_04 §4 bis).

## Comparación

| | ACC (medido) | Procore (su componente) | ALEPHIA hoy |
|---|---|---|---|
| ¿En botones de icono? | **No**: ni tooltip ni `title` (1,5 s encima y nada) | Sí, componente propio | Sí, en casi todos |
| Para qué | — | «información descriptiva adicional de un elemento» | nombres, frases y datos técnicos |
| Cuándo sale | — | al pasar **o al llegar con el teclado**; necesita un elemento enfocable | igual, pasar o teclado |
| Retardo | — | **0 ms** al salir, se va a los 100 ms | 450 ms el primero; seguidos, al momento |
| Ancho máximo | — | **200 px** | 280 px |
| Posición | — | **arriba**, con flecha | debajo, sin flecha |
| Aspecto | — | gris muy oscuro, letra blanca pequeña | gris muy oscuro, letra blanca 13 px |

## Qué sacamos

1. **Ninguno de los dos usa el tooltip para explicar.** ACC no pone nada en sus iconos: confía en que el icono se
   entiende. Procore lo reserva para la «información descriptiva» de un elemento, en una caja de 200 px que no deja
   frases largas.
2. **Lo que nos sobra no es el sistema, son los textos.** El nuestro ya funciona como el de Procore (pasar o
   teclado, un solo estilo); lo que no hace ninguno de los dos es lo de la captura: una frase entera o la huella SHA.

## Propuesta

- Dejar el tooltip **solo en botones de icono**, con el **nombre de la acción en una a tres palabras** («Ver V1»,
  «Copiar enlace»), y en nombres que salen cortados.
- Quitarlo donde el botón ya dice lo que hace con su texto, y donde era una explicación o un dato técnico (la huella
  va en la ficha del documento).
- Ancho máximo **200 px**, como Procore: si no cabe, el texto sobra.
- Retardo y posición, como están.

## Fuentes

- `@procore/core-react` 12.46.0: `dist/Tooltip/Tooltip.d.ts`, `Tooltip.types.d.ts`, `Tooltip.js`, `Tooltip.styles.js`,
  `OverlayTrigger/OverlayTrigger.js` (jsDelivr).
- ACC medido en vivo: `docs/ux/UI_POLISH_04_F1_ARCHIVOS.md` §4 bis.
