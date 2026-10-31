-- 44 · Miembros de los tableros de Docs (31-oct-2026, docs/visor/66), como «Miembros del panel» de ACC.
-- Cada tablero tiene sus miembros con un rol —responsable (gestiona miembros y acceso), editor, lector (solo mira)— y
-- dice quién puede entrar: toda la obra ('obra', lo de hoy) o solo sus miembros ('invitados'). Los administradores de
-- la obra entran en todos. Los autores de los tableros que ya hay pasan a ser sus responsables.
-- Aplicar manualmente como ecd_migrator ANTES de desplegar el código que lee `acceso` y `tableros_miembros`.
-- Aditiva: una columna con DEFAULT (nada cambia para los tableros de hoy) y una tabla nueva.
BEGIN;
ALTER TABLE tableros ADD COLUMN IF NOT EXISTS acceso TEXT NOT NULL DEFAULT 'obra';
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tableros_acceso_valido') THEN
    ALTER TABLE tableros ADD CONSTRAINT tableros_acceso_valido CHECK (acceso IN ('obra', 'invitados'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS tableros_miembros (
    tablero_id UUID NOT NULL REFERENCES tableros(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    rol TEXT NOT NULL CHECK (rol IN ('responsable', 'editor', 'lector')),
    agregado_por INTEGER REFERENCES users(id),
    agregado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (tablero_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_tableros_miembros_usuario ON tableros_miembros (user_id);

INSERT INTO tableros_miembros (tablero_id, user_id, rol, agregado_por)
SELECT id, created_by_id, 'responsable', created_by_id FROM tableros
ON CONFLICT (tablero_id, user_id) DO NOTHING;

GRANT SELECT, INSERT, UPDATE, DELETE ON tableros_miembros TO ecd_app;
COMMIT;
