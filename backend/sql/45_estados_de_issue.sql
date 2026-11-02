-- 45 · Las incidencias como las de ACC (2-nov-2026, docs/archivos/18).
--
-- 1 · ESTADOS. A los cinco de hoy se suman tres: Borrador (Draft), En curso (In progress) y En disputa (In dispute).
--     Los códigos que ya están guardados NO cambian —el historial está escrito con ellos—; lo que cambia es lo que se
--     lee en pantalla (Corregido → «En revisión», Reabierto → «No aprobada», Verificado → «Cerrada»).
-- 2 · A QUIÉN. Una incidencia se asigna a una persona O a una EMPRESA de la obra (`responsable_empresa`), como el
--     «Assigned to» de ACC; y tiene OBSERVADORES que reciben aviso de cada paso sin deber nada.
-- 3 · CON QUÉ. Adjuntos (fotos y documentos de Docs: se guardan sus ids), subtipo, causa raíz y campos propios.
-- 4 · LA OBRA DECIDE (`issue_config_de_obra`): qué estados opcionales usa, sus subtipos por tipo, su lista de causas
--     raíz y sus campos propios. Sin fila, los estados opcionales están todos encendidos y no hay listas.
--
-- Aplicar manualmente como ecd_migrator ANTES de desplegar el código que escribe todo esto.
-- Aditiva: la lista cerrada de estados se amplía (ninguna fila de hoy deja de cumplirla), columnas con DEFAULT o
-- nulas, y una tabla nueva.
BEGIN;
ALTER TABLE doc_issues DROP CONSTRAINT IF EXISTS ck_issues_estado;
ALTER TABLE doc_issues ADD CONSTRAINT ck_issues_estado
    CHECK (estado IN ('Borrador','Abierto','En curso','En disputa','Corregido','Verificado','Reabierto','Anulado'));

ALTER TABLE doc_issues ADD COLUMN IF NOT EXISTS responsable_empresa INTEGER;
ALTER TABLE doc_issues ADD COLUMN IF NOT EXISTS observadores INTEGER[] NOT NULL DEFAULT '{}';
ALTER TABLE doc_issues ADD COLUMN IF NOT EXISTS adjuntos JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE doc_issues ADD COLUMN IF NOT EXISTS subtipo TEXT;
ALTER TABLE doc_issues ADD COLUMN IF NOT EXISTS causa_raiz TEXT;
ALTER TABLE doc_issues ADD COLUMN IF NOT EXISTS campos JSONB NOT NULL DEFAULT '{}'::jsonb;

DO $$ BEGIN
    ALTER TABLE doc_issues ADD CONSTRAINT fk_issues_responsable_empresa
        FOREIGN KEY (responsable_empresa) REFERENCES companies(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- Una persona O una empresa: nunca las dos. Con las dos no se sabría a quién reclamarle.
DO $$ BEGIN
    ALTER TABLE doc_issues ADD CONSTRAINT ck_issues_un_solo_responsable
        CHECK (responsable_id IS NULL OR responsable_empresa IS NULL);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS issue_config_de_obra (
    project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
    opcionales TEXT[] NOT NULL DEFAULT ARRAY['Borrador','En curso','En disputa']::TEXT[],
    subtipos JSONB NOT NULL DEFAULT '{}'::jsonb,     -- {"PUNCH": ["Acabados", "Instalaciones"], ...}
    causas JSONB NOT NULL DEFAULT '[]'::jsonb,       -- ["Diseño", "Ejecución", ...]
    campos JSONB NOT NULL DEFAULT '[]'::jsonb,       -- [{"clave", "etiqueta", "tipo", "opciones", "obligatorio"}]
    actualizado_por INTEGER REFERENCES users(id),
    actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_issue_config_opcionales
        CHECK (opcionales <@ ARRAY['Borrador','En curso','En disputa']::TEXT[])
);

GRANT SELECT, INSERT, UPDATE, DELETE ON issue_config_de_obra TO ecd_app;
COMMIT;
