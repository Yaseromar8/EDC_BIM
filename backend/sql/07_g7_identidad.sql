-- ============================================================================
-- G7 · LA MIGRACIÓN DE IDENTIDAD — activated_at + invitacion_gen + backfill
-- ============================================================================
-- Se ejecuta como `ecd_migrator` (dueño de `users`; verificado 22-ago-2026:
-- entra por sí mismo, CREATE en public, owner de las 339). NO requiere
-- `postgres`: ese rol queda para lo excepcional, y esto no lo es.
--
-- Especificación: adenda 02 (doc 58) §A.3 y §B.3 + nota final (doc 59) §3.
--   activated_at   NULL = invitación sin activar · NOT NULL = cuenta activada
--                  (los 4 estados: PENDIENTE/ACTIVADA/SUSPENDIDA/REVOCADA)
--   invitacion_gen la generación vigente del token de invitación: emitir o
--                  reemitir la incrementa y mata todo token anterior por
--                  IGUALDAD DE ENTEROS, sin relojes.
--
-- BACKFILL (§A.3, mecánico, sin inferir):
--   ACTIVADA  ⇔ evidencia POSITIVA (hash fijado, o login_ok/2fa en el rastro,
--               o actos autorados) → activated_at := created_at (marcador
--               convencional, nunca fecha histórica real de activación)
--   AMBIGUA   ⇔ hash vacío y cero evidencia → queda NULL y se LISTA.
--   Tras el barrido del PASO 14 (22-ago) el padrón son 4 cuentas, todas con
--   hash fijado ⇒ el conjunto AMBIGUA esperado es VACÍO. La consulta de
--   postcondición lo verifica en vez de suponerlo.
-- ============================================================================

BEGIN;

SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '5s';

-- ── DDL (idempotente) ──────────────────────────────────────────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS activated_at timestamp;
ALTER TABLE users ADD COLUMN IF NOT EXISTS invitacion_gen smallint NOT NULL DEFAULT 0;

COMMENT ON COLUMN users.activated_at IS
  'NULL = invitación sin activar. NOT NULL = cuenta activada (por reclamo o '
  'primera entrada Google). Valores <= 2026-08-22 son marcador de backfill, '
  'no fecha histórica (adenda 01 §3 / doc 58 §A.3).';
COMMENT ON COLUMN users.invitacion_gen IS
  'Generación vigente del token de invitación (doc 59 §3): emitir/reemitir '
  'incrementa; el reclamo exige gen(token)=gen(fila). Un token viejo muere '
  'por igualdad de enteros, sin depender de relojes.';

-- ── BACKFILL §A.3 ──────────────────────────────────────────────────────────
UPDATE users u
   SET activated_at = u.created_at
 WHERE u.activated_at IS NULL
   AND (
         u.password_hash <> ''
      OR EXISTS (SELECT 1 FROM auth_events e
                  WHERE e.user_id = u.id AND e.evento IN ('login_ok','2fa_ok'))
      OR EXISTS (SELECT 1 FROM activity_log a
                  WHERE a.performed_by = u.email OR a.performed_by = u.name)
       );

-- ── POSTCONDICIONES ────────────────────────────────────────────────────────
DO $$
DECLARE
    ambiguas int;
    filas_ambiguas text;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_name='users' AND column_name='activated_at') THEN
        RAISE EXCEPTION 'activated_at no existe tras el ALTER';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_name='users' AND column_name='invitacion_gen') THEN
        RAISE EXCEPTION 'invitacion_gen no existe tras el ALTER';
    END IF;
    -- El conjunto AMBIGUA se ENUMERA, no se supone (doc 58 §A.3):
    SELECT count(*), string_agg(id::text || ':' || email, ' · ')
      INTO ambiguas, filas_ambiguas
      FROM users WHERE activated_at IS NULL;
    RAISE NOTICE 'AMBIGUAS (activated_at NULL): % [%]',
                 ambiguas, COALESCE(filas_ambiguas, 'ninguna');
END $$;

-- El estado final, a la vista antes del COMMIT:
SELECT id, email, (password_hash='') AS hash_vacio,
       activated_at IS NOT NULL AS activada, invitacion_gen,
       COALESCE(is_active, TRUE) AS activa
  FROM users ORDER BY id;

COMMIT;
