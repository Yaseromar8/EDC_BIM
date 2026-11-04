-- 49 · Vistas de apertura de un CAD o un PDF por carpeta (5-nov-2026, docs/archivos/28). El dueño: «si es un archivo enlazado en
-- distintas carpetas, y esas carpetas representan distintas vistas»: el mismo documento abre en la vista que se
-- fijó PARA ESA CARPETA (la suya o una que lo enlaza, migración 48). CAD (presentación y cámara) y PDF (página y zoom).
--
-- Una fila = «este documento, abierto desde esta carpeta, se ve así». La clave es la pareja: sirve igual para el
-- original (su carpeta) y para cada enlace, sin tocar `doc_enlaces` ni `file_nodes`.
--
-- Aditiva. Aplicar a mano como ecd_migrator ANTES de desplegar el backend que la usa (sin ella, el documento abre como
-- siempre y fijar una vista responde 503). Rollback: 49_vistas_de_apertura_rollback.sql.
BEGIN;

CREATE TABLE IF NOT EXISTS doc_vistas_de_apertura (
    documento_id UUID NOT NULL REFERENCES file_nodes(id) ON DELETE CASCADE,
    carpeta_id   UUID NOT NULL REFERENCES file_nodes(id) ON DELETE CASCADE,
    model_urn    TEXT NOT NULL,
    -- {tipo: cad, presentacion, camara} o {tipo: pdf, pagina, zoom, centro}: lo valida el servidor (vistas_de_apertura.py).
    vista        JSONB NOT NULL,
    -- La versión en la que se fijó. Al subir otra, la presentación se busca por su nombre.
    version_id   UUID REFERENCES file_versions(id) ON DELETE SET NULL,
    fijada_por   INTEGER REFERENCES users(id) ON DELETE SET NULL,
    fijada_en    TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (documento_id, carpeta_id),
    CONSTRAINT ck_vista_de_apertura_tamano CHECK (octet_length(vista::text) <= 8192)
);

-- REVOKE ALL antes del GRANT: en producción hay privilegios por defecto que dan a ecd_app TODO sobre cada tabla nueva
-- (medido con la 48). Fijar es insertar o sustituir; restablecer, borrar.
REVOKE ALL ON doc_vistas_de_apertura FROM ecd_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON doc_vistas_de_apertura TO ecd_app;

COMMIT;
