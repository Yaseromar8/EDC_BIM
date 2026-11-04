# 26 · Copiar la estructura de una carpeta (4-nov-2026)

Pedido del dueño: «es posible desplazar carpetas, pero me gustaría también que se pueda copiar. Por ejemplo, tengo 10
carpetas que tendrán las mismas subcarpetas. Quisiera poder copiar esas subcarpetas, obviamente vacías, solo carpetas».

## Cómo se usa

Botón derecho sobre la carpeta modelo, **«Copiar estructura»**. Se marcan en el árbol una o varias carpetas destino y
se pulsa **«Copiar estructura»**. Cada destino recibe las subcarpetas de la modelo, vacías, con sus nombres y su
anidación. El aviso dice cuántas carpetas se crearon y cuántas ya estaban.

## Reglas

| Regla | Por qué |
|---|---|
| Se copian las **subcarpetas**, no la carpeta modelo, y **ningún documento**. | Es lo pedido: la estructura, vacía. |
| Lo que ya existe en el destino con el mismo nombre **se usa**, y se sigue dentro. | Copiar dos veces no duplica, y se puede completar una estructura a medias. |
| Solo se copia lo que quien copia **ve**: una subcarpeta sin acceso (ni lo de dentro) no se copia ni se anuncia. | Copiar no puede revelar la existencia de algo restringido. |
| Las carpetas nuevas **heredan los permisos de su destino**, como al crear una a mano. Los de la modelo no se copian. | El destino puede ser de otro equipo. |
| Hace falta **«Ver» en la modelo** y **«Editar» en cada destino**, y en cada subcarpeta del destino donde haya que crear. | Copiar es escribir en el destino. |
| Cada carpeta nueva pasa **las mismas reglas que crear una a mano**: nomenclatura de la obra, profundidad máxima y cuota. | Una sola regla, entre por donde entre la carpeta. |
| **Todo o nada**: si una carpeta no se puede crear, no se crea ninguna. El aviso dice por qué y dónde. | Nada a medias. |
| No dentro de la propia modelo. Hasta 50 destinos y 500 carpetas nuevas por vez. | Evitar el error y el abuso. |

## Piezas

- **`backend/estructura_de_carpetas.py`.** Las reglas, que reciben inyectadas las comprobaciones (ver, crear, validar),
  así que se prueban sin base de datos.
- **`POST /api/docs/carpetas/copiar-estructura`** (`routes/documents.py`).
  - Guardia de obra y permisos de carpeta reales (`permiso_documental`).
  - Las validaciones de la obra, con el mismo cursor de la transacción.
  - Ids como UUID y comparaciones sin conversión.
  - El techo del perfil portal pasa de 315 a 316, con su motivo (`test_perfil_portal`).
- **La capacidad `copiar_estructura`** (`utils/capacidadesDeSeleccion.js`): sobre una sola carpeta y con «Ver». El
  contrato de la prueba la ata al texto del servidor.
- **`components/modals/CopiarEstructuraModal.jsx`.** El árbol de «Desplazar» (`SelectFolderNode`) con elección
  múltiple opcional; la raíz y la propia modelo no se pueden marcar.

## Probado

*Pruebas automáticas*
- `backend/tests/test_estructura_de_carpetas.py`: 6 pruebas de las reglas.
- `capacidadesDeSeleccion.prueba.mjs`: 22/22.
- Suite del backend: 2623 pasan. Se excluye el fallo previo ajeno de `test_reconstruccion_desde_cero`.
- `npm test`: 35 bancos en verde. El build sale bien.
- Lint: ningún error nuevo; los dos que marca ya estaban en origin/main.

*Contra la base desechable, con la ruta y los permisos reales: 9/9*
- Sin «Editar» en el destino: 403. Con uno así entre varios, tampoco se crea nada en el otro.
- Copia tres niveles y usa la «01 Planos» que ya estaba.
- La subcarpeta sin acceso no se copia.
- Ningún documento.
- Copiar otra vez no duplica.
- Dentro de la propia modelo: 400.
- Un id inválido: 400.

*En el navegador* (con el diálogo real)
- La raíz y la modelo no se pueden marcar, y el botón se enciende al elegir.
- Copiar a «Frente 1» dice «3 carpetas nuevas en 1 destino · 1 ya estaban».
- En «Frente 2», donde Luis solo ve, el servidor lo niega y el diálogo sigue abierto con el aviso.
