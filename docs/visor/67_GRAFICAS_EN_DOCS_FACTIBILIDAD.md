# 67 · Gráficas en el tablero de Docs: ¿es factible?

31-oct-2026. Investigación pedida por el dueño antes de construir nada: «primero investiguemos si es factible o si
mejor lo hacemos sin gráfica». Su dirección (doc 57, fase 6): **las gráficas nacen en el tablero de Docs, con puente a
la metadata de View, y luego se comparten para verse en View.**

## 1 · Veredicto

**Es factible**, con una ruta nueva y estrecha en el portal que agrupa en Postgres y devuelve solo totales. Medido con
datos del tamaño de un frente real:
- una gráfica tarda **0,1–0,25 s** en la base;
- la lista de campos, **1,4 s**, y se puede guardar por versión del modelo.

Hay **tres límites** frente a las gráficas de View (§4). El mayor: el clic no aísla en el 3D, porque Docs no tiene el
modelo cargado; lleva a View.

## 2 · Lo que se encontró

| Pregunta | Respuesta |
|---|---|
| ¿Dónde están los datos de las gráficas de View? | En Postgres, esquema `inventory_identity_b1`: cada elemento del modelo es una fila de `occurrences`, con sus propiedades en un JSON agrupado (`{"Grupo": {"Parámetro": valor}}`) y unas columnas fijas (material, estado, vaciado, clasificación), que lo que corrige el usuario (`user_data`) sustituye. Una «versión activa» por modelo (`sources.active_urn`) |
| ¿Cómo las usa View? | Baja el inventario **entero** del frente (`/api/inventory?model_urn=<frente>`, unos 73 MB sin comprimir, con caché en el servidor y en el navegador). Lo aplana en el navegador (`lib/inventoryNormalizers.js`) y agrupa allí (`dashboard/engine.js`) |
| ¿Lo sirve el servidor de Docs? | **Hoy, en producción, sí.** El portal envía `/api` a `visor-ecd-backend-va`, el mismo backend completo que usa View: `/api/inventory` responde 401 (pide sesión), no 404. Medido sin sesión el 31-oct, solo lectura |
| ¿Y en una instalación solo para una entidad? | **No.** El «perfil portal» (`DEPLOY_PROFILE=portal`) recorta a propósito todo lo del visor, inventario incluido, y `test_perfil_portal` vigila que siga así. Hoy no está aplicado en producción, pero es la promesa de cara a una entidad |
| ¿Cómo sabe Docs qué frentes tiene su obra? | Los frentes (p. ej. `1_CANAL`, `1_DRENAJE`) son alias de su obra en `project_ref`; `resolve_project_id(frente)` da la obra. La ruta puede listar los frentes con inventario y quedarse con los que resuelven a la obra del tablero |

## 3 · Medida (clúster desechable, datos sintéticos)

Esquema aparte, borrado al terminar: 6.000 elementos × 204 propiedades. La tabla ocupa 48 MB, con 64 MB de JSON, del
orden del inventario de un frente; Drenaje tiene 2.852 elementos reales. Tres medidas de cada consulta:

| Consulta | Tiempo | Respuesta |
|---|---|---|
| ¿Qué campos hay y cuánto están rellenos? | 1.459 / 1.439 / 1.386 ms | 204 filas |
| Contar por Material | 102 / 101 / 97 ms | 4 filas |
| Sumar Longitud por Estado | 251 / 251 / 248 ms | 3 filas |
| Contar por Nivel, solo Material = PVC | 117 / 116 / 119 ms | 3 filas |

- Se calcula en Postgres, no en la memoria del servidor de Render (que ya se cayó por memoria). La respuesta es de
  unos pocos cientos de bytes.
- **No medido:** Cloud SQL de producción, que puede ser 2–3 veces más lento que esta máquina, ni el tamaño real de
  todos los frentes. Medirlo exige entrar en producción, y eso lo decide el dueño.

## 4 · Límites frente a las gráficas de View

1. **El clic no aísla en el 3D.** Docs no tiene el modelo cargado. En su lugar, «Ver en View» abre el visor en ese
   frente con el filtro de la gráfica.
2. **Los campos que calcula el navegador de View no existen en el servidor.**
   - La Planilla añade «Estado frente al itemizado» y «Capítulo» solo en View.
   - La «Revit Category» la normaliza el navegador.
   - Se pueden llevar al servidor, pero es trabajo aparte; sin eso, esas gráficas no se pueden hacer en Docs.
3. **La normalización de nombres** (quitar el prefijo del grupo, los conjuntos de propiedades de Civil 3D) hay que
   repetirla en el servidor.
   - Dos copias de la misma regla pueden separarse, y es justo el defecto que `inventoryNormalizers.js` corrigió en
     View.
   - Remedio: los mismos casos de prueba para las dos.

## 5 · Lo que haría falta construir (si se sigue)

1. **Servidor:**
   - `GET /api/docs/tableros/<tid>/datos-del-modelo`: los frentes de la obra y sus campos, guardados por versión del
     modelo.
   - `POST /api/docs/tableros/<tid>/grafica`: agrupar, con frente, campo, métrica, campo de valor, filtro y tope.
   - Las dos con la guardia del tablero y de la obra del frente; solo totales, nunca filas.
   - El techo del perfil portal sube 2, con su motivo.
2. **Pruebas:** la normalización con los mismos casos que `inventoryNormalizers.js`; la guardia (otra obra, otro
   frente, lector); y el ensayo con PostgreSQL desechable.
3. **Tablero:** una tarjeta «Gráfica» (barras, dona, número) con el mismo tema que View. Su editor: frente, campo,
   métrica y filtro. Doble clic → «Ver en View».
4. **Compartir con View** (lo que el dueño dejó para después): llevar la gráfica al Tablero del frente en View.

## 6 · Alternativa sin gráfica

Si no compensa, el tablero ya enlaza con View sin gráficas: se puede poner una tarjeta «Abrir en View», con el frente y
una vista guardada. No necesita servidor nuevo ni toca el perímetro, pero no muestra datos.
