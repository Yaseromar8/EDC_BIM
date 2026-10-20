-- 38: la vista elegida de cada modelo, POR NOMBRE (model_config.default_view_name).
--     Migración manual como ecd_migrator, ANTES de desplegar el backend que la usa:
--     el backend nuevo lee y escribe esta columna en TODA la configuración de modelos.
--
-- POR QUÉ
-- -------
-- Hasta hoy la vista elegida se guardaba solo por su GUID, y el GUID de una vista
-- puede cambiar en cada versión (medido: «NUEVA» tuvo un GUID distinto en la v4, la
-- v6 y la v7 del mismo archivo). Tras Actualizar, el extractor caía en silencio a otra
-- vista y el visor a la vista por defecto: inventario con elementos sin pieza y
-- Filtros esperando para siempre (1_CANAL, 20-oct-2026). Con el nombre, el servidor
-- resuelve la vista en cada versión. docs/visor/10_VISTA_DEL_MODELO.md (F1).
--
-- QUÉ HACE Y QUÉ NO
-- -----------------
-- Aditiva: una columna nullable y una tabla nueva. Los modelos existentes la rellenan solos la próxima
-- vez que se extraen o se actualizan (el servidor averigua el nombre por su GUID).
-- No toca datos. Se puede repetir sin daño.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

DO $$
BEGIN
    IF current_user <> 'ecd_migrator' THEN
        RAISE EXCEPTION 'VISTA_MODELO_ROLE_GUARD: el DDL va como ecd_migrator, no como %', current_user;
    END IF;
END $$;

ALTER TABLE model_config ADD COLUMN IF NOT EXISTS default_view_name TEXT;

-- De qué vista salió cada inventario extraído. La identidad del inventario es por
-- versión; sin esto, reimportar la MISMA versión eligiendo OTRA vista reutilizaba el
-- inventario de la anterior sin decirlo (es lo que dejó al Canal sin Filtros).
CREATE TABLE IF NOT EXISTS inventory_vista_extraida (
    scope_id    TEXT NOT NULL,
    source_urn  TEXT NOT NULL,
    view_guid   TEXT,
    view_name   TEXT,
    extraido_en TIMESTAMP WITH TIME ZONE DEFAULT now(),
    PRIMARY KEY (scope_id, source_urn)
);
GRANT SELECT, INSERT, UPDATE ON inventory_vista_extraida TO ecd_app;

COMMIT;
