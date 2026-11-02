-- Rollback de 45. Se niega si alguna incidencia usa lo que trae la 45 —un estado nuevo, una empresa responsable,
-- observadores, adjuntos, subtipo, causa raíz o campos propios— o si alguna obra configuró sus incidencias: quitarlo
-- borraría datos que alguien escribió. El rollback normal de un despliegue es volver al código (el código de antes no
-- lee ni escribe nada de esto), no esto.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM doc_issues
              WHERE estado IN ('Borrador','En curso','En disputa')
                 OR responsable_empresa IS NOT NULL OR observadores <> '{}' OR adjuntos <> '[]'::jsonb
                 OR subtipo IS NOT NULL OR causa_raiz IS NOT NULL OR campos <> '{}'::jsonb)
     OR EXISTS (SELECT 1 FROM issue_config_de_obra) THEN
    RAISE EXCEPTION 'Hay incidencias o configuraciones que usan la 45; no se puede volver atrás con rollback automático';
  END IF;
END $$;
BEGIN;
DROP TABLE IF EXISTS issue_config_de_obra;
ALTER TABLE doc_issues DROP CONSTRAINT IF EXISTS ck_issues_un_solo_responsable;
ALTER TABLE doc_issues DROP CONSTRAINT IF EXISTS fk_issues_responsable_empresa;
ALTER TABLE doc_issues DROP COLUMN IF EXISTS campos;
ALTER TABLE doc_issues DROP COLUMN IF EXISTS causa_raiz;
ALTER TABLE doc_issues DROP COLUMN IF EXISTS subtipo;
ALTER TABLE doc_issues DROP COLUMN IF EXISTS adjuntos;
ALTER TABLE doc_issues DROP COLUMN IF EXISTS observadores;
ALTER TABLE doc_issues DROP COLUMN IF EXISTS responsable_empresa;
ALTER TABLE doc_issues DROP CONSTRAINT IF EXISTS ck_issues_estado;
ALTER TABLE doc_issues ADD CONSTRAINT ck_issues_estado
    CHECK (estado IN ('Abierto','Corregido','Verificado','Reabierto','Anulado'));
COMMIT;
