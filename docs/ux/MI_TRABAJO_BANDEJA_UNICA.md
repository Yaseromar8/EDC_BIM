# «Mi trabajo» como bandeja única — 3-nov-2026

> Pedido del dueño: «necesitamos de alguna manera que esta ventana sea como un punto donde encuentren todo lo que se
> les asigna, entrega o corrige… según la ISO o normas peruanas, ¿cómo podríamos mejorar eso? ¿Podrías hacer una
> maqueta?»
>
> La maqueta está en [`docs/ux/maquetas/mi_trabajo_v1.html`](maquetas/mi_trabajo_v1.html): se abre en el navegador y
> tiene dos vistas, la portada y «Ver todo».

## 0 · El defecto que se vio en producción (arreglado en local)

**Síntoma.** «Aparece lo que le corresponde al usuario, pero al hacer clic no te lleva al archivo.»

**Causa.** En «Mi trabajo» solo se abrían las filas de **Revisión**. Las de Issue, RFI, Emisión, Protocolo, etc. eran
texto sin acción. Además, el encargo de una incidencia no decía en qué plano vivía.

**Arreglo** (en local, sin commit):

- `GET /api/mi-trabajo` añade a cada incidencia su `documento` y su `version`, sacados de su evidencia
  (`encargos.con_su_documento`). Solo se envía el id: al abrirla vuelven a pasar los guardias del documento.
- Una fila de incidencia **sobre un plano** abre ese plano con la incidencia ya abierta en su panel
  (`?obra=…&documento=…&incidencia=<id>`).
- Una incidencia **sin plano** abre la herramienta Issues de su obra con ella abierta.
- En los dos casos, el parámetro se lee una vez y se quita de la dirección.
- La etiqueta pasa de «ISSUE» a «Incidencia».

Lo demás (RFI, Emisión, Protocolo, Cuaderno…) sigue sin abrirse. Es la fase 1 de abajo.

## 1 · Qué dicen las normas de esta pantalla

### ISO 19650-2 (entrega de información)

La norma no habla de «bandejas». Habla de **actos con responsable y fecha** sobre cada contenedor de información:

| Acto | Quién | Cláusula | En ALEPHIA hoy |
|---|---|---|---|
| **Producir y entregar** lo comprometido en el plan (TIDP → MIDP) | Equipo de trabajo | 5.4.4, 5.4.5 y 5.6.2 | El Plan de entregas existe, pero **no llega a «Mi trabajo»** |
| **Comprobar, revisar y aprobar** antes de compartir | El propio equipo | 5.6.3 y 5.6.4 | Revisiones (sí llegan) |
| **Revisar y autorizar** el modelo de información | Parte designada principal | 5.7.1 y 5.7.2 | Revisiones, pasos de flujo |
| **Aceptar** la entrega | Parte que designa | 5.7.3 y 5.7.4 | Aprobación final de la revisión |
| **Corregir** lo observado y volver a entregar | Quien recibió la observación | 5.7.2 y 5.7.4, cuando se rechaza | Incidencias (llegan, y ahora se abren) |

La consecuencia para la pantalla: **«Mi trabajo» debe ordenarse por ACTO** (qué tengo que hacer) y no por herramienta
(de qué módulo viene). Una persona no piensa «tengo 2 Revisions y 1 Issue»; piensa «tengo que revisar dos cosas y
corregir una».

La norma pide también que la información viaje **con su estado** (En curso, Compartido, Publicado, Archivado) y que
cada entrega se mida **contra lo planificado**. Por eso la bandeja enseña la **fecha comprometida en el plan**, no solo
la del encargo.

### Guía Nacional BIM (MEF, 2023)

- De los seis requisitos mínimos del ECD, dos tocan esta pantalla:
  - **usuario y fecha** de cada cambio: toda fila dice quién lo pidió y cuándo;
  - **acceso controlado**: la fila no abre nada que el usuario no pueda ver. Ya es así: los guardias se repiten al abrir.
- El estado va por **metadato**, no por carpeta: la fila dice el estado del documento (S1 Compartido, A1 Publicado…)
  con su frase. Es la regla de `ECD_IDEAL_PERU.md`: «el código siempre con su frase».

### Reglamento de la Ley 32069 (DS 009-2025-EF): los plazos que deciden obras

La diferencia con ACC y Procore está aquí. En el Perú muchos actos tienen **plazo legal y consecuencia del silencio**
(tabla completa en `docs/ECD_REALIDAD_PERUANA.md` §1.3):

| Acto | Plazo | Si no se actúa | Art. |
|---|---|---|---|
| Absolver una consulta (supervisor) | 5 días | el contratista puede pedir ampliación por la demora | 190 |
| Opinión de la supervisión sobre una ampliación | 5 días hábiles | la entidad resuelve sin su opinión y penaliza al supervisor | 200 |
| Resolver una ampliación (entidad) | 10 días hábiles | **se aprueba** lo del supervisor, o lo del contratista | 200 |
| Pedir una ampliación (contratista) | 10 días hábiles desde el fin de la causal | **se tiene por no presentada** | 200 |
| Informe de la valorización (supervisor) | 5 días | — | 210 |
| Pronunciarse sobre la liquidación | 50 días | queda **consentida** | 215.6 |

«Días» son **calendario** salvo que la norma diga «hábiles» (art. 105.3).

La consecuencia para la pantalla: cuando un encargo nace de uno de estos actos, la fila dice **el plazo, de qué tipo es
y qué pasa si nadie actúa**. Por ejemplo: «Absolver · 5 días · art. 190 · si no, el contratista puede pedir
ampliación». Ningún producto extranjero lo hace, y es lo que el residente y el supervisor necesitan ver.

## 2 · La propuesta (la maqueta)

Misma estructura de la portada que el dueño ya aprobó (saludo, Docs, View y «Mi trabajo»), en la paleta D-24, IBM Plex
y los iconos del juego. Sin brillos, cristal ni emojis.

**En la portada, la tarjeta «Mi trabajo»:**

1. **Pestañas por acto** con su número: Todo · Corregir · Revisar · Responder · Entregar · Recibir. Cada tipo de
   encargo cae en un acto:

   | Tipo de encargo | Acto |
   |---|---|
   | ISSUE | Corregir, o Verificar si ya está corregida |
   | REVIEW | Revisar |
   | RFI, ASIENTO | Responder |
   | Plan de entregas, SUBMITTAL | Entregar |
   | TRANSMITTAL | Recibir |
   | PROTOCOLO, PARTE | Firmar |

2. **Cada fila empieza por el verbo**: «Corregir ISS-002…», no «ISSUE».
3. Debajo del título, **dónde vive**: el documento y la página, la obra y quién lo pidió.
4. **El plazo con su semántica**:
   - vencido, en rojo;
   - hoy;
   - en N días;
   - si es legal, el artículo y si son días hábiles. La consecuencia del silencio sale al pasar el ratón.
5. **Toda fila se abre** en su objeto, con el panel abierto. Al pasar el ratón aparece la acción principal
   («Abrir el plano»).
6. «Ver todo mi trabajo» lleva a la página completa.

**La página completa, «Mi trabajo»:**

- **Izquierda:** filtros por acto y por obra.
- **Centro:** la lista agrupada por urgencia (Vencido · Esta semana · Más adelante · Sin plazo).
- **Derecha, dos columnas nuevas:**
  - **Esperando a otros**: lo que yo levanté o envié y le toca a otro, con su estado. ISO 19650 da a quien encarga
    el deber de seguir la entrega: sin esta columna, nadie ve sus observaciones pendientes de levantar.
  - **Mis entregas del plan**: lo comprometido en el TIDP con su fecha, aunque todavía nadie haya abierto un encargo.
- Una pestaña **Hecho** con lo de los últimos 30 días, como trazabilidad: quién hizo qué y cuándo.

## 3 · Qué falta construir, en orden

| Fase | Qué | Toca | Migración |
|---|---|---|---|
| **0** | Abrir incidencias desde «Mi trabajo» (§0) | backend + portal | no (hecho en local) |
| **1** | Todas las filas se abren en su objeto; verbo por acto; grupos por urgencia; página «Ver todo» | portal (+ el destino de cada tipo en el backend) | no |
| **2** | «Esperando a otros» (encargos que yo abrí y siguen abiertos) y «Hecho» (cerrados en 30 días) | backend: dos consultas sobre `encargos` | no: `creado_por` y `cerrado_en` ya existen; comprobar el índice |
| **3** | Las entregas del Plan de entregas en la bandeja, aunque no haya encargo | backend (`plan_de_entrega`) + portal | no |
| **4** | Plazos legales: tipo de día, artículo y consecuencia, con calendario de feriados del Perú para los hábiles | backend (catálogo de actos con reloj) | probablemente pequeña, para el calendario |

Decisiones del dueño antes de la fase 1:

1. **Pestañas.** ¿Por **acto** (recomendado) o por **herramienta**, como hoy?
2. **Esperando a otros.** ¿Lo ve todo el que levantó o envió algo, o solo los roles de gestión, como supervisión y
   gestor de información?
3. **Plazos legales.** ¿Se activan **por obra** según su régimen (contrata Ley 32069, NEC, privada)? Lo recomendado
   es que sí: el régimen es un dato de la obra, como ya se propuso en `ECD_REALIDAD_PERUANA.md`.

## 4 · v2: todo en la portada (3-nov-2026)

El dueño, tras la v1: «la idea sería que todo se vea en la portada… reorganizarla, pero que se vea intuitivo y no esté
desordenado». Maqueta en [`maquetas/mi_trabajo_v2.html`](maquetas/mi_trabajo_v2.html). La v1 queda como referencia.
Desaparece «Ver todo»: no hay página aparte.

Orden de lectura, de arriba abajo y de izquierda a derecha:

1. **Saludo con un resumen de una línea**: «7 pendientes · 1 vencido · 4 esta semana · tu próxima entrega, el 8 nov.».
   Es lo único que hay que leer para saber cómo va el día.
2. **Docs y View**: arriba a la derecha y más pequeños. Siguen a un clic, pero ya no ocupan el centro.
3. **«Lo que te toca»**: la única tarjeta grande, en la columna ancha.
   - Pestañas por acto; una pestaña vacía no se muestra, y el número va en rojo si hay algo vencido.
   - Selector de obra.
   - Grupos por urgencia.
   - Cinco filas, y «Ver las N restantes» despliega el resto **ahí mismo**.
4. **Lo que sigo**: columna estrecha, más quieta, con tres tarjetas pequeñas:
   - **Esperando a otros**;
   - **Tus entregas del plan**, con su avance;
   - **Hecho esta semana**.

En el teléfono todo queda en una columna, en ese mismo orden. Los títulos ocupan hasta dos líneas y la acción se
abre con el toque.

## 5 · v3: tres ejemplos más simples (3-nov-2026)

Sobre la v2, el dueño dijo: «se sigue viendo confuso, ¿no hay otro ejemplo?». Maqueta en
[`maquetas/mi_trabajo_v3.html`](maquetas/mi_trabajo_v3.html), con tres ejemplos y los mismos datos.

Reglas comunes a los tres:

- **Cada fila es una frase**: «**Corregir** la incidencia ISS-002 del plano DR-803».
- Debajo, una línea gris corta: la obra y quién lo pidió.
- A la derecha, la fecha en palabras: «venció ayer», «miércoles», «12 nov.».
- Fuera, todo lo demás: pestañas, estados, códigos sueltos y columnas laterales.

Los tres ejemplos:

- **A · Tres preguntas.** Tres números grandes: «Te toca hacer», «Esperas de otros» y «Tus entregas». Al tocar uno,
  debajo sale solo su lista. **Recomendado**: responde en un vistazo y nunca hay más de una lista a la vista.
- **B · Agenda.** Una sola lista por días (Vencido, Esta semana, Más adelante), con un filtro «Todo / Me toca a mí /
  Espero de otros».
- **C · Por obra.** Una tarjeta por obra con sus cifras; al abrirla aparece lo que toca en ella. Sirve a quien lleva
  muchas obras.

