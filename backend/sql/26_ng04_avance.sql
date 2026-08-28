-- =======================================================================
-- 26 . NG-04 . AVANCE FISICO DESDE CAMPO  +  PRIVILEGE SWEEP (gate O)
--
-- Corre como ecd_migrator, via prod26.py (boton del dueno). Aditiva salvo
-- los REVOKE del sweep, que RECORTAN privilegios que nadie usa.
-- =======================================================================

-- -- PARTE 0 . PRIVILEGE SWEEP ------------------------------------------
-- Medido en prod el 28-ago-2026: 110 de 118 tablas concedian DELETE a
-- ecd_app porque los privilegios POR DEFECTO del migrador regalan arwd
-- (leccion C2 de NG-03). El barrido, en tres movimientos:
--   1. Las tablas FUTURAS nacen sin DELETE ni TRUNCATE (default privileges).
--   2. Se revoca DELETE en las 57 tablas donde el codigo del backend NO
--      borra (lista blanca medida con grep insensible sobre delete-from,
--      mas las tuplas dinamicas de los ensayos-herramienta, que corren
--      como ecd_app; document_shares entro por esa via).
--   3. Donde el codigo SI borra (53 tablas: CRUD legitimo, limpiezas de
--      fixtures, reimportes), el privilegio SE QUEDA: recortarlo romperia
--      producto. Si algun borrado de esos es cuestionable (doc_rfis,
--      doc_redlines llevan historia), esa es una decision de producto
--      anotada en el veredicto, no un barrido a ciegas.

ALTER DEFAULT PRIVILEGES FOR ROLE ecd_migrator IN SCHEMA public
  REVOKE DELETE, TRUNCATE ON TABLES FROM ecd_app;

REVOKE DELETE, TRUNCATE ON alembic_version FROM ecd_app;
REVOKE DELETE, TRUNCATE ON app_tokens FROM ecd_app;
REVOKE DELETE, TRUNCATE ON asset_user_data FROM ecd_app;
REVOKE DELETE, TRUNCATE ON civil_surfaces FROM ecd_app;
REVOKE DELETE, TRUNCATE ON daily_reports FROM ecd_app;
REVOKE DELETE, TRUNCATE ON doc_actas FROM ecd_app;
REVOKE DELETE, TRUNCATE ON doc_issues FROM ecd_app;
REVOKE DELETE, TRUNCATE ON doc_plano_revisiones FROM ecd_app;
REVOKE DELETE, TRUNCATE ON doc_plano_sets FROM ecd_app;
REVOKE DELETE, TRUNCATE ON doc_planos FROM ecd_app;
REVOKE DELETE, TRUNCATE ON doc_protocolos FROM ecd_app;
REVOKE DELETE, TRUNCATE ON doc_spec_divisiones FROM ecd_app;
REVOKE DELETE, TRUNCATE ON doc_spec_revisiones FROM ecd_app;
REVOKE DELETE, TRUNCATE ON doc_spec_secciones FROM ecd_app;
REVOKE DELETE, TRUNCATE ON doc_spec_sets FROM ecd_app;
REVOKE DELETE, TRUNCATE ON doc_submittals FROM ecd_app;
REVOKE DELETE, TRUNCATE ON extraction_jobs FROM ecd_app;
REVOKE DELETE, TRUNCATE ON gemelo_assets FROM ecd_app;
REVOKE DELETE, TRUNCATE ON gemelo_ingestion_status FROM ecd_app;
REVOKE DELETE, TRUNCATE ON gemelo_properties FROM ecd_app;
REVOKE DELETE, TRUNCATE ON hubs FROM ecd_app;
REVOKE DELETE, TRUNCATE ON ia_documentos_preparados FROM ecd_app;
REVOKE DELETE, TRUNCATE ON link_presence FROM ecd_app;
REVOKE DELETE, TRUNCATE ON link_reports FROM ecd_app;
REVOKE DELETE, TRUNCATE ON lob_activities FROM ecd_app;
REVOKE DELETE, TRUNCATE ON lob_activity_relations FROM ecd_app;
REVOKE DELETE, TRUNCATE ON lob_activity_schedule FROM ecd_app;
REVOKE DELETE, TRUNCATE ON lob_avance FROM ecd_app;
REVOKE DELETE, TRUNCATE ON lob_config FROM ecd_app;
REVOKE DELETE, TRUNCATE ON lob_cost_items FROM ecd_app;
REVOKE DELETE, TRUNCATE ON lob_dataset_audit FROM ecd_app;
REVOKE DELETE, TRUNCATE ON lob_dataset_sources FROM ecd_app;
REVOKE DELETE, TRUNCATE ON lob_datasets FROM ecd_app;
REVOKE DELETE, TRUNCATE ON lob_frentes FROM ecd_app;
REVOKE DELETE, TRUNCATE ON lob_front_map FROM ecd_app;
REVOKE DELETE, TRUNCATE ON lob_linear_methodology_steps FROM ecd_app;
REVOKE DELETE, TRUNCATE ON lob_linear_profiles FROM ecd_app;
REVOKE DELETE, TRUNCATE ON lob_linear_progress_events FROM ecd_app;
REVOKE DELETE, TRUNCATE ON lob_linear_scenarios FROM ecd_app;
REVOKE DELETE, TRUNCATE ON lob_locations FROM ecd_app;
REVOKE DELETE, TRUNCATE ON lob_partidas FROM ecd_app;
REVOKE DELETE, TRUNCATE ON lob_progress_entries FROM ecd_app;
REVOKE DELETE, TRUNCATE ON lob_schedule_tasks FROM ecd_app;
REVOKE DELETE, TRUNCATE ON lob_schedule_tasks_v2 FROM ecd_app;
REVOKE DELETE, TRUNCATE ON member_tool_access FROM ecd_app;
REVOKE DELETE, TRUNCATE ON nomenclatura_config FROM ecd_app;
REVOKE DELETE, TRUNCATE ON otp_codes FROM ecd_app;
REVOKE DELETE, TRUNCATE ON pdf_calibrations FROM ecd_app;
REVOKE DELETE, TRUNCATE ON photo_evidences FROM ecd_app;
REVOKE DELETE, TRUNCATE ON plan_entregas FROM ecd_app;
REVOKE DELETE, TRUNCATE ON plano_anclajes FROM ecd_app;
REVOKE DELETE, TRUNCATE ON project_settings FROM ecd_app;
REVOKE DELETE, TRUNCATE ON project_tools FROM ecd_app;
REVOKE DELETE, TRUNCATE ON sensibilidad_catalogo FROM ecd_app;
REVOKE DELETE, TRUNCATE ON sync_operaciones FROM ecd_app;
REVOKE DELETE, TRUNCATE ON triaje_seguridad FROM ecd_app;
REVOKE DELETE, TRUNCATE ON upload_sessions FROM ecd_app;

-- -- PARTE 1 . avance_campo: el reporte de avance fisico -----------------
-- Identidad minima del doc 98 (A) + las 3 correcciones del cierre:
-- snapshot de autoridad del objetivo (correccion 1), magnitud siempre
-- positiva con el signo en el TIPO (correccion 3), conflictos confirmados
-- trazables (correccion 3). APROBADO exige firma ajena al autor y, si hay
-- objetivo, snapshot sellado.

CREATE TABLE IF NOT EXISTS avance_campo (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_urn TEXT NOT NULL,
  numero INTEGER NOT NULL,
  dataset_id TEXT,
  activity_id TEXT,
  cost_item_codigo TEXT,
  elemento_link_id TEXT,
  frente_label TEXT,
  progresiva_inicio DOUBLE PRECISION,
  progresiva_fin DOUBLE PRECISION,
  tipo TEXT NOT NULL DEFAULT 'AVANCE',
  ajusta_a UUID REFERENCES avance_campo(id),
  cantidad DOUBLE PRECISION NOT NULL,
  unidad TEXT NOT NULL,
  termina_actividad BOOLEAN NOT NULL DEFAULT FALSE,
  descripcion TEXT,
  estado TEXT NOT NULL DEFAULT 'REPORTADO',
  fecha_operativa DATE NOT NULL,
  capturado_en TIMESTAMPTZ,
  recibido_en TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  origen TEXT NOT NULL DEFAULT 'online',
  autor_id INTEGER NOT NULL,
  autor_empresa_id INTEGER,
  autor_funcion TEXT,
  aprobado_por INTEGER,
  aprobado_empresa_id INTEGER,
  aprobado_funcion TEXT,
  aprobado_en TIMESTAMPTZ,
  devuelto_por INTEGER,
  devuelto_en TIMESTAMPTZ,
  motivo_devolucion TEXT,
  objetivo_fuente TEXT,
  objetivo_id TEXT,
  objetivo_unidad TEXT,
  objetivo_cantidad DOUBLE PRECISION,
  objetivo_huella TEXT,
  created_by TEXT,
  conflictos_detectados JSONB NOT NULL DEFAULT '[]'::jsonb,
  conflictos_confirmados JSONB NOT NULL DEFAULT '[]'::jsonb,
  proyectado_en TIMESTAMPTZ,
  CONSTRAINT uq_avance_numero UNIQUE (model_urn, numero),
  CONSTRAINT ck_avance_estado CHECK (estado IN ('REPORTADO','APROBADO','DEVUELTO')),
  CONSTRAINT ck_avance_tipo CHECK (tipo IN ('AVANCE','AJUSTE_POSITIVO','AJUSTE_NEGATIVO')),
  CONSTRAINT ck_avance_cantidad_positiva CHECK (cantidad > 0),
  CONSTRAINT ck_avance_destino CHECK (activity_id IS NOT NULL OR cost_item_codigo IS NOT NULL OR elemento_link_id IS NOT NULL),
  CONSTRAINT ck_avance_progresivas CHECK (progresiva_inicio IS NULL OR progresiva_fin IS NULL OR progresiva_fin >= progresiva_inicio),
  CONSTRAINT ck_avance_aprobado_con_firma CHECK (estado <> 'APROBADO' OR aprobado_por IS NOT NULL),
  CONSTRAINT ck_avance_autor_no_se_aprueba CHECK (aprobado_por IS NULL OR aprobado_por <> autor_id),
  CONSTRAINT ck_avance_devuelto_con_motivo CHECK (estado <> 'DEVUELTO' OR motivo_devolucion IS NOT NULL),
  CONSTRAINT ck_avance_ajuste_referencia CHECK (tipo = 'AVANCE' OR ajusta_a IS NOT NULL),
  CONSTRAINT ck_avance_proyeccion_solo_aprobado CHECK (proyectado_en IS NULL OR estado = 'APROBADO'),
  CONSTRAINT ck_avance_aprobado_con_snapshot CHECK (estado <> 'APROBADO' OR objetivo_fuente IS NULL OR objetivo_cantidad IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS ix_avance_obra_actividad ON avance_campo (model_urn, activity_id);
CREATE INDEX IF NOT EXISTS ix_avance_obra_estado ON avance_campo (model_urn, estado);

-- La evidencia son CITAS a doc_fotos (NG-02): cero copias de binarios.
CREATE TABLE IF NOT EXISTS avance_fotos (
  avance_id UUID NOT NULL REFERENCES avance_campo(id),
  foto_id BIGINT NOT NULL REFERENCES doc_fotos(id),
  CONSTRAINT uq_avance_foto UNIQUE (avance_id, foto_id)
);

-- -- PARTE 2 . el motor de campo conoce el objeto AVANCE ----------------
ALTER TABLE sync_operaciones DROP CONSTRAINT IF EXISTS ck_sync_objeto;
ALTER TABLE sync_operaciones ADD CONSTRAINT ck_sync_objeto
  CHECK (object_type IN ('PROTOCOLO','ISSUE','FOTO','PARTE','ASIENTO','AVANCE'));

-- -- PARTE 2b . encargos: el avance entra al BIC -------------------------
ALTER TABLE encargos DROP CONSTRAINT IF EXISTS ck_encargos_tipo;
ALTER TABLE encargos ADD CONSTRAINT ck_encargos_tipo CHECK (objeto_tipo IN
  ('REVIEW','RFI','REDLINE','TRANSMITTAL','SUBMITTAL','PROTOCOLO','ISSUE',
   'PARTE','ASIENTO','INSTRUCCION','AVANCE'));

-- -- PARTE 3 . GRANTS de lo nuevo (nacen ya sin DELETE por la PARTE 0;
--              el REVOKE explicito queda de cinturon y tirantes) ---------
GRANT SELECT, INSERT, UPDATE ON avance_campo TO ecd_app;
GRANT SELECT, INSERT ON avance_fotos TO ecd_app;
REVOKE DELETE, TRUNCATE ON avance_campo FROM ecd_app;
REVOKE DELETE, TRUNCATE ON avance_fotos FROM ecd_app;
