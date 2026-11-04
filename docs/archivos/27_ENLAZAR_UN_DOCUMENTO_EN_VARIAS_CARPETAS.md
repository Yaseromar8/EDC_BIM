# 27 · Enlazar un documento en varias carpetas (5-nov-2026)

Lo que pidió el dueño: «tengo un único archivo que puede servir a varias calles. Subir el mismo archivo a cada calle
sería un trabajo en vano y almacenar el mismo archivo varias veces». Y sobre cómo usarlo: «en el archivo original le
daría compartir, se abre una ventana donde puedo elegir mis carpetas, selecciono dónde quiero y se comparte. Cuando
vaya a esa carpeta, el archivo sale con un signo de enlazado».

**Estado: construido en local y probado (§7). Falta publicar: migración 48 → backend → portal.** Las decisiones del
dueño, en el §6.

---

## 1 · En una frase

El documento vive en **una sola carpeta**. Las demás llevan un **enlace** a él: se ve en su lista con la marca ⤷ y,
al abrirlo, se abre el original con su última versión. No se guarda ninguna copia.

ACC no tiene esto dentro de un proyecto. Lo más parecido son dos cosas distintas:
- **Compartir** manda un enlace a personas, y el archivo no aparece en otras carpetas.
- **Bridge** lleva copias a *otro* proyecto.

Dentro de un mismo proyecto, en ACC se copia, y las copias se desactualizan.

## 2 · Cómo se usa

**Enlazar**
1. Botón derecho sobre el documento original (o varios marcados) → **«Enlazar»**.
2. Se abre el árbol de carpetas, el mismo de «Copiar estructura». Se marcan una o varias carpetas destino, por ejemplo
   «3. Red Secundaria (Calle San Agustín)», «4. … San Pablo» y «6. … San Felipe».
3. **«Enlazar»**. El aviso dice, por ejemplo: «Enlazado en 3 carpetas».

**En la carpeta destino**
- El documento sale **en su lista, con su nombre de siempre y la marca ⤷**. Al pasar el ratón sobre la marca:
  «Enlazado desde 0. Generales».
- Las columnas muestran lo del **original**: versión, estado ISO, revisión, disciplina, fecha.
- **Abrirlo abre el original**, con su visor, sus marcas, sus incidencias y sus revisiones. Si el original sube a la
  v3, en todas las carpetas se ve la v3.

**En el original**
- Su fila lleva la marca con la cifra: «⤷ 3» («Enlazado en 3 carpetas más»).
- Su ficha dice **«Enlazado en»** con la ruta de cada carpeta (solo las que quien mira puede ver).
- **Pulsar esa marca** (5-nov-2026) abre la lista de carpetas donde está enlazado, cada una con **«Ir»** y, si se
  tiene «Editar» en ella, **«Quitar»**. Es para el enlace puesto por error en una carpeta que no se recuerda, sin añadir
  nada al botón derecho. El servidor dice carpeta por carpeta si se puede quitar (`puede_quitar`): lo mismo que exige
  `DELETE`.

**En la fila enlazada, botón derecho**
- **«Ir al original»**: abre la carpeta donde vive.
- **«Quitar el enlace»**, en lugar de «Suprimir». El original no se toca.
- Cambiar nombre, Desplazar, Subir nueva versión, Reservar y Atributos salen **apagados**, con el motivo «Es un
  enlace: se hace en su carpeta original».
- Abrir, Descargar, Copiar enlace, Compartir, Añadir a grupo y Enlazar (en más carpetas) funcionan sobre el original.

## 3 · Por qué «Enlazar» y no «Compartir»

En el portal, «Compartir» ya es otra cosa: crea un **enlace público** de solo lectura y con caducidad, para alguien de
fuera (`ShareModal`). Además, «Compartido» es un **estado ISO 19650** (SHARED). Llamar también «compartir» a esto
juntaría tres significados distintos en la misma pantalla. «Enlazar» dice lo que pasa: el archivo no se mueve ni se
copia, se enlaza.

## 4 · Reglas

| Regla | Por qué |
|---|---|
| Para enlazar: **«Ver»** en el original y **«Editar»** en cada carpeta destino. | Enlazar es escribir en el destino, como subir. |
| Quien **no puede ver el original** no ve la fila ⤷, aunque vea la carpeta. | Un enlace no puede abrir una puerta que el original tiene cerrada. Los permisos son los del original. |
| Nada se copia: **0 bytes** más y **no cuenta en la cuota**. | Es lo pedido. |
| Una carpeta **no puede tener dos veces** el mismo documento, ni un enlace con el nombre de un archivo suyo. | Dos filas iguales confunden. Aviso: «Ya hay un "…" en esta carpeta». |
| No se enlaza **en su propia carpeta**. | No tendría sentido. |
| **Subir una versión** solo se hace en el original. En la fila ⤷, «Subir nueva versión» sale apagado y dice dónde se hace. | Una sola historia de versiones. |
| **Renombrar** solo en el original. El enlace toma el nombre nuevo solo. | Un solo nombre, el de la nomenclatura. |
| **Mover el original** a otra carpeta: los enlaces siguen funcionando y su aviso dice la carpeta nueva. | El enlace apunta al documento, no a su ruta. |
| **Suprimir el original** (papelera): sus enlaces **desaparecen** de las carpetas mientras está en la papelera y **vuelven al restaurarlo**. Si se borra definitivamente, los enlaces se borran con él. | No quedan enlaces rotos a la vista, y restaurar devuelve todo como estaba. |
| **Suprimir una carpeta** que tiene enlaces: van con ella a la papelera y vuelven si se restaura; borrada definitivamente, sus enlaces se van. Los originales no se tocan. | Borrar una calle no borra un documento que sirve a otras. |
| Si el original se **mueve a una carpeta que lo enlazaba**, ahí sale una vez: como suyo, no como enlace. | Nunca dos filas del mismo documento. |
| **Copiar estructura** no copia los enlaces: solo carpetas, como hoy. | No cambia lo que ya se aprobó. |
| Enlazar y quitar un enlace queda en la **actividad** de la obra, con quién y cuándo. | Trazabilidad ISO 19650. |
| Hasta 50 carpetas destino por vez. | Como «Copiar estructura». |

## 5 · Cómo se construye

**Base de datos: migración 48, aditiva**
```
doc_enlaces (
  id           uuid PK,
  model_urn    text NOT NULL,
  documento_id uuid NOT NULL → file_nodes(id) ON DELETE CASCADE,   -- el original
  carpeta_id   uuid NOT NULL → file_nodes(id) ON DELETE CASCADE,   -- donde se ve
  creado_por   int → users(id),
  creado_en    timestamptz DEFAULT now(),
  UNIQUE (documento_id, carpeta_id)
)
```
Una **tabla propia**, y no una fila nueva en `file_nodes`. Así ningún recuento, cuota, búsqueda, descarga de carpeta,
mosaico ni plan de entregas confunde un enlace con un segundo archivo: todo lo que hoy cuenta documentos sigue
contando uno. Tiene su rollback.

**Servidor**
- `POST /api/docs/enlaces` `{documentos, carpetas}`: crea los enlaces, todo o nada, con las reglas del §4.
- `DELETE /api/docs/enlaces/<id>`.
- `GET /api/docs/list` añade a cada carpeta sus filas ⤷, ya filtradas por el permiso del original, con
  `enlace: {id, desde: {id, ruta}}`.
- La ficha del original trae `enlazado_en: [{carpeta, ruta}]`.

**Portal**
- «Enlazar» en el botón derecho de un documento, con el diálogo del árbol de «Copiar estructura».
- La fila ⤷ en la tabla y en la cuadrícula. Su menú: abrir, ir al original, quitar el enlace.
- «Enlazado en N carpetas» en la ficha.

**Pruebas**
- Reglas sin base de datos.
- La ruta real contra PostgreSQL desechable: permisos, nombre repetido, papelera y restauración, mover, borrar
  carpeta.
- Navegador con la pantalla real.

**Despliegue**: migración 48 → backend → portal.

## 6 · Lo que decidió el dueño (5-nov-2026)

1. **El nombre**: «que sea solo **Enlazar**».
2. **Buscar**: el documento sale **una vez**, el original. Así es por construcción: el enlace no es un archivo.
3. **«Descargar carpeta»**: no lo contestó. Se aplicó lo recomendado, que **incluye los enlazados**, cada uno con el
   permiso de su original. Es fácil de cambiar si no lo quiere.
4. **El sitio del original**: una carpeta común que elige él, por ejemplo «0. Generales» dentro de «Componente 11.2».

## 7 · Probado

*Pruebas automáticas*
- `backend/tests/test_enlaces_de_documentos.py`: 8 pruebas de las reglas:
  - enlazar sin copiar, y otra vez sin duplicar;
  - no en su carpeta, y nada de nombres repetidos;
  - permisos;
  - solo de la obra y vivos;
  - sin la migración no escribe;
  - topes.
- `capacidadesDeSeleccion.prueba.mjs` 24/24:
  - enlazar, uno o varios documentos;
  - lo del original, apagado en un enlace;
  - quitar el enlace pide «Editar» en la carpeta;
  - el contrato con el texto del servidor.
- Suite del backend: 2636 pasan. Falla `test_reconstruccion_desde_cero`, que ya fallaba antes en origin/main.
- `npm test`: 36 bancos en verde. El build sale bien. Lint sin errores nuevos.

*Contra la base desechable, con las rutas y los permisos reales: 24/24*
- Enlazar en dos calles: cada una enseña el documento con la marca. Es el original (su id y su ruta) y no hay copia.
- El original dice «enlazado en 2». Enlazar otra vez no duplica.
- Negativas:
  - sin «Editar» en el destino: 403;
  - en su carpeta: 400;
  - nombre repetido en una de las carpetas: 409, y tampoco se enlaza en la otra.
- Quien no ve el original no ve la fila, y al descargar la carpeta no se la lleva. Quien sí lo ve la descarga dentro
  de cada calle.
- Versión nueva y nombre nuevo del original se ven en el enlace.
- Papelera: se oculta, y al restaurar vuelve.
- Mover el original a una carpeta que lo enlazaba: sale una vez, y el aviso de la otra dice la carpeta nueva.
- Quitar un enlace sin «Editar»: 403. Con «Editar»: el original sigue. Otra vez: 404. Id inválido: 400.
- Purgado el original, sus enlaces se van con él.

*En el navegador* (banco del portal, con la pantalla real de Archivos)
- La marca y su ayuda, en la fila enlazada y en el original (con la cifra).
- El menú de cada una.
- La ventana: el botón se enciende al elegir y manda las carpetas elegidas.
- «Quitar el enlace» y la ficha con «Enlazado en».

*No hecho todavía*
- El aviso en la papelera de cuántos enlaces tenía el documento.
- «Quitar el enlace» en la barra de acciones (está en el botón derecho).
