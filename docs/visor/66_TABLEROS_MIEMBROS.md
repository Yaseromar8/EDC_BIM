# 66 · Tableros: miembros del tablero

31-oct-2026. La cuarta pieza de la cabecera de ACC que pidió el dueño (doc 65): **«Miembros del panel»**, con su rol,
«+» para invitar, «¿Quién puede unirse?» y «Salir del panel».

**Necesita la migración 44, que aplica el dueño como `ecd_migrator` ANTES de desplegar este código.** El código lee
`tableros.acceso` y `tableros_miembros` en cada ruta de un tablero: sin la 44, esas rutas fallan.

## 1 · Qué hace ACC (su captura)

- «Miembros del panel»: cada persona con su rol («Responsable» ▾) y «+» para añadir.
- «¿Quién puede unirse?: Solo los usuarios invitados».
- «Los administradores de proyectos pueden acceder a todos los paneles».
- «Salir del panel».

## 2 · Lo nuestro

| | Cómo |
|---|---|
| **Roles** | **Responsable**: edita, invita, cambia roles, decide quién puede entrar y archiva. **Editor**: edita. **Lector**: solo mira |
| **¿Quién puede entrar?** | **Toda la obra** (lo de hoy, por omisión): cualquiera de la obra lo abre y lo edita; sus miembros tienen el rol que se les dé. **Solo los invitados**: solo lo ven sus miembros; para los demás no aparece ni en la lista |
| **Administradores de la obra** | Entran en todos los tableros y los gestionan, como en ACC |
| **Quien lo crea** | Es su responsable. Al aplicar la 44, los autores de los tableros que ya hay pasan a ser sus responsables |
| **Siempre un responsable** | No se puede quitar, bajar de rol ni hacer salir al último (409) |
| **Invitar** | Solo a gente de la obra: el servidor lo comprueba. Desde «+» en el panel o desde **Compartir** («Invitar a personas de la obra»), buscando por nombre o correo |
| **El lector** | Ve el tablero de consulta, con las mismas piezas: mueve y acerca, abre documentos, incidencias y comentarios, presenta. No ve herramientas. El servidor rechaza sus guardados y renombrados (403 `LECTOR`), así que la restricción no depende de la pantalla. La cabecera dice «Solo lectura · eres lector» |
| **Si cambian mi acceso con el tablero abierto** | Si me sacan de uno «solo de invitados», al siguiente sondeo (≤ 10 s) se cierra: «Ya no eres miembro de este tablero». Si me hacen lector, el siguiente guardado se rechaza, se avisa y paso a la vista de consulta. Si me cambian el rol desde el panel, se vuelve a leer del servidor |
| **La lista** | Un candado junto a los tableros «solo de invitados». «Archivar» solo para quien puede (lo dice el servidor) |
| **Salir del tablero** | Deja de ser miembro. En uno de toda la obra sigue entrando, como editor sin gestionar; en uno de invitados, se cierra |

## 3 · Piezas

| Pieza | Qué |
|---|---|
| `backend/sql/44_tableros_miembros.sql` (+ `_rollback`) | `tableros.acceso` (`'obra'` por omisión, CHECK `obra`/`invitados`) y `tableros_miembros` (tablero, persona, rol con CHECK, quién y cuándo). Aditiva. Los autores pasan a responsables. La vuelta atrás se niega si algún tablero se cerró a sus invitados o tiene más miembros que su autor |
| `backend/routes/tableros.py` | La guardia lee el acceso y mi rol. Lista filtrada. El lector no guarda. Al crear, responsable. `PATCH {acceso}`. Ruta `/api/docs/tableros/<tid>/miembros` (GET, POST, DELETE), con la misma guardia |
| `backend/perimetro_de_obra.py` | `miembros_del_tablero` → (`tableros`, `tid`): el middleware de perímetro resuelve también la obra de esta ruta, como la del tablero |
| `backend/tests/test_perfil_portal.py` | Techo de rutas del portal: 302 → 303 (esta ruta, de la familia ya guardada `/api/docs/tableros`) |
| `frontend-docs/.../tableros/miembros.js`, `PanelMiembros.jsx` | Las llamadas y el panel; `Invitar` también en Compartir |
| `TablerosModule.jsx` | El botón, mi rol, el lector con `VistaLienzo`, el cierre al perder el acceso, el candado y «Archivar» en la lista |
| `design/lienzo/VistaLienzo.jsx` | `vacio`: su texto cuando no hay nada que enseñar |

## 4 · Encontrado al probar y corregido

**Producto:**
- El lector de un tablero vacío veía «Lo que tenía esta vista ya no está en el tablero», que es el texto de las vistas
  publicadas. Ahora ve «Este tablero aún está vacío».

- **La ruta nueva no estaba en el perímetro.** `test_cobertura_autorizacion` la marcó: «maneja datos de obra sin que
  el middleware pueda resolver la obra». La guardia propia ya la protegía, pero se declaró en `RUTAS_POR_RECURSO` (con
  un nombre propio, `miembros_del_tablero`, porque `miembros` chocaría con otras vistas) para que el middleware también
  la controle. No se añadió a ninguna lista de excepciones.

**Prueba:**
- Importaba una ayuda de `prueba_incidencias.py`, y eso ejecutaba esa prueba entera antes (su «21/21» se coló en la
  salida). Ahora la ayuda va copiada en la propia prueba.

## 5 · Pruebas

**Migración** (`ensayo_miembros.py`): **13/13**, contra el clúster desechable, como `ecd_migrator`. Cubre:
- la forma del catálogo y los CHECK;
- el dueño de la tabla y que `ecd_app` usa datos sin ser migrador;
- los autores pasan a responsables;
- aplicarla dos veces no cambia nada;
- la vuelta atrás se niega si alguien decidió algo, y vuelve sin decisiones.

**Servidor:**
- `test_tableros.py` **55/55** (+13 de miembros y acceso), `test_perfil_portal.py` y `test_cobertura_autorizacion.py`:
  68/68.
- **Suite completa del backend:** 2.489 en verde y 2 fallos. Uno era la ruta fuera del perímetro, ya corregido. El otro
  es el fallo conocido de `test_reconstruccion_desde_cero` («el bootstrap no construye estas tablas»). Ya fallaba por
  `tableros`, `tableros_abiertos` y tablas de otros módulos, y ahora **`tableros_miembros` se suma a esa lista**. No se
  arregla de paso: es deuda abierta del esquema base.

**Banco** (`prueba_miembros.py`): **19/19**, con Ana y Luis. Cubre:
- quien crea es responsable;
- el panel; invitar a Luis como lector;
- Luis solo mira (sin herramientas, el tablero vacío dicho como tablero) y ve los miembros sin cambiarlos;
- «solo los invitados»; quitar a Luis le cierra el tablero y desaparece de su lista;
- la única responsable no puede salir;
- Compartir invita a Luis como responsable; Ana sale y sigue como editora sin gestionar.

## 6 · Para publicar

En este orden, y solo cuando el dueño lo diga:
1. Las migraciones que falten: **42**, **43** y **44**, como `ecd_migrator`.
2. Push.
3. Backend.
4. Portal.
