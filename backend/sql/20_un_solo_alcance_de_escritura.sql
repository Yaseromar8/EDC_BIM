-- ═══════════════════════════════════════════════════════════════════════════
-- UN SOLO ALCANCE DE ESCRITURA POR OBRA · guardia ESTRUCTURAL
--
-- Ejecutar como  ecd_migrator  (DDL). NUNCA como ecd_app ni como postgres.
--
-- QUE GARANTIZA, Y POR QUE EN LA BASE
-- ------------------------------------
-- `project_ref.es_escritura` decide DONDE SE ESCRIBE el expediente de una obra.
-- Dos filas marcadas para la misma obra no serian un dato ambiguo: serian dos
-- respuestas a «donde guardo esto», y elegir una de las dos --por orden de la
-- base, por el minimo alias, por lo que sea-- es decidir donde vive el
-- expediente segun como salgan las filas.
--
-- El codigo ya falla cerrado ante esa ambiguedad. Esto la hace IMPOSIBLE, que
-- es distinto: una guardia en el codigo protege de los errores de hoy; una en
-- la base protege tambien de la escritura directa, del script de mantenimiento
-- y del proximo desarrollador.
--
-- NO ES DESTRUCTIVA. Las once obras tienen hoy EXACTAMENTE UNA fila de
-- escritura --medido antes de escribir esto-- asi que el indice se crea sin
-- tocar ni una. Si alguna tuviera dos, esta migracion FALLARIA en vez de
-- borrar una: cual sobra es una decision, no algo que deduzca un ALTER.
--
-- PARCIAL Y NO TOTAL: solo restringe las filas marcadas. Una obra puede seguir
-- teniendo todos los alias que necesite --PROJECT, LEGACY_NAME, LEGACY_PATH,
-- FRONT, EXTERNAL-- porque un alias no es un arbol: sirve para que una peticion
-- antigua siga resolviendo.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- UNA FILA DE ESCRITURA SIN OBRA no diria donde se escribe de nadie -- pero eso
-- ya lo impide la propia tabla: `project_ref.project_id` es NOT NULL desde su
-- creacion, comprobado en el ensayo. Se escribio aqui un CHECK que lo repitiera
-- y se quito: una restriccion que no puede dispararse nunca es como codigo
-- muerto, ocupa sitio en la lectura y da una sensacion de proteccion que ya
-- daba otra cosa.

-- LA INVARIANTE. `account_id` entra en la clave porque la tabla ya lo lleva y
-- una instancia multi-cuenta tendria una obra por cuenta; hoy todas las filas
-- comparten cuenta, asi que en la practica es una por obra.
CREATE UNIQUE INDEX IF NOT EXISTS idx_project_ref_un_solo_alcance
    ON project_ref(account_id, project_id) WHERE es_escritura;

COMMIT;
