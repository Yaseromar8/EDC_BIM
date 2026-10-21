-- 39: los trabajos de Design Automation (Civil 3D) en curso, en la base y no solo en la memoria del proceso.
--     Migración manual como ecd_migrator, ANTES de desplegar el backend que la usa (el arranque comprueba
--     que la tabla exista).
--
-- POR QUÉ
-- -------
-- Al lanzar una extracción de Civil 3D, el servidor pide a Autodesk una subida firmada para el resultado y
-- guarda su clave (upload_key) para «cerrarla» cuando el trabajo termine. Esa clave vivía SOLO en la memoria
-- del proceso: si el proceso se reiniciaba entre el lanzamiento y el final -- y con --max-requests 300 lo
-- hacía cada pocos minutos con gente conectada --, la subida no se cerraba nunca y la extracción se perdía.
-- Con dos procesos (Fase 3 de docs/rendimiento/01) fallaría además la mitad de las veces, al caer la consulta
-- de estado en el otro proceso. Guardado aquí, cualquier proceso lo encuentra, y el cierre se reclama de
-- forma atómica para que dos procesos no cierren la misma subida.
--
-- QUÉ HACE Y QUÉ NO
-- -----------------
-- Aditiva: una tabla nueva de filas efímeras (el servidor borra las de más de un día). No toca datos.
-- Se puede repetir sin daño.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

DO $$
BEGIN
    IF current_user <> 'ecd_migrator' THEN
        RAISE EXCEPTION 'DA_TRABAJOS_ROLE_GUARD: el DDL va como ecd_migrator, no como %', current_user;
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS da_trabajos (
    workitem_id TEXT PRIMARY KEY,
    upload_key  TEXT,
    object_name TEXT NOT NULL,
    creado      TIMESTAMP WITH TIME ZONE DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON da_trabajos TO ecd_app;

COMMIT;
