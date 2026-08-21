"""Versioned and auditable data API for the 4D LOB workspace."""
from __future__ import annotations
from esquema_congelado import solo_con_ddl

import io
import json
import os
import traceback
import uuid
from datetime import date, datetime, timedelta

from flask import Blueprint, g, jsonify, request
from psycopg2.extras import Json, execute_values
from werkzeug.utils import secure_filename

from lob4d_engine import (
    merge_cost_items,
    normalize_scope,
    parse_duraciones,
    parse_metrados,
    parse_p6_package,
    quality_report,
    sha256_stream,
    validate_source,
)


lob4d_bp = Blueprint('lob4d', __name__)


@solo_con_ddl
def ensure_lob4d_tables():
    """Compatibility check. The enterprise schema is owned by Alembic 0003."""
    try:
        from db import get_db_connection
        with get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute("SELECT to_regclass('public.lob_datasets'), to_regclass('public.lob_linear_profiles')")
            datasets_table, linear_table = cur.fetchone()
            if not datasets_table or not linear_table:
                print('[lob4d] Enterprise schema pending. Run: alembic upgrade head')
            else:
                print('[lob4d] Enterprise schema LOB Linear 1.0 ready.')
    except Exception as exc:
        print(f'[lob4d] Schema check failed: {exc}')


def _user_label():
    user = getattr(g, 'current_user', None) or {}
    return user.get('email') or user.get('name') or str(user.get('id') or 'system')


def _scope_context(raw_scope, project_id=None, front_id=None):
    scope = normalize_scope(raw_scope)
    from db import resolve_project_id
    del_alcance = resolve_project_id(scope)
    declarado = str(project_id or '').strip()

    # Si quien llama DECLARA una obra y el alcance dice otra, no se elige.
    #
    # Antes bastaba con `project_id or resolve_project_id(scope)`: el valor del
    # formulario ganaba siempre y el alcance ni se miraba. La pertenencia se
    # comprueba despues contra la obra DECLARADA (`_assert_project_access`), asi
    # que nadie podia atribuirse una obra ajena -- pero quien fuera miembro de
    # dos obras si podia publicar un dataset declarando la obra A mientras
    # traia el alcance de la B. Ese dataset quedaba archivado bajo A, y desde
    # ese momento cualquier miembro de A alcanzaba datos de B.
    if declarado and del_alcance and declarado != del_alcance:
        raise ValueError(
            'La obra declarada (%s) no es la del alcance «%s» (%s).'
            % (declarado, scope, del_alcance))

    canonical_project = declarado or str(del_alcance or '').strip()
    if not canonical_project:
        raise ValueError('No se pudo resolver el proyecto canonico del frente.')
    if not front_id:
        prefix = f'{canonical_project}_'
        front_id = scope[len(prefix):] if scope.startswith(prefix) else scope
    return scope, canonical_project, str(front_id or '').strip() or None


def _assert_project_access(cur, project_id):
    user = getattr(g, 'current_user', None) or {}
    if user.get('role') == 'admin':
        return
    cur.execute(
        'SELECT 1 FROM project_users WHERE project_id = %s AND user_id = %s LIMIT 1',
        (str(project_id), user.get('id')),
    )
    if not cur.fetchone():
        raise PermissionError('Sin acceso a este proyecto.')


def _active_dataset(cur, scope, dataset_id=None):
    if dataset_id:
        cur.execute("""
            SELECT id, project_id, front_id, scope_urn, version, name, status,
                   data_date::text, is_active, stats, validation, created_by,
                   created_at, activated_at
            FROM lob_datasets WHERE id = %s AND scope_urn = %s
        """, (dataset_id, scope))
    else:
        cur.execute("""
            SELECT id, project_id, front_id, scope_urn, version, name, status,
                   data_date::text, is_active, stats, validation, created_by,
                   created_at, activated_at
            FROM lob_datasets
            WHERE scope_urn = %s AND is_active = TRUE
            ORDER BY version DESC LIMIT 1
        """, (scope,))
    row = cur.fetchone()
    if not row:
        return None
    return {
        'id': row[0], 'project_id': row[1], 'front_id': row[2], 'scope_urn': row[3],
        'version': row[4], 'name': row[5], 'status': row[6], 'data_date': row[7],
        'is_active': row[8], 'stats': row[9] or {}, 'validation': row[10] or {},
        'created_by': row[11], 'created_at': row[12].isoformat() if row[12] else None,
        'activated_at': row[13].isoformat() if row[13] else None,
    }


def _load_dataset_parts(cur, dataset_id):
    cur.execute("""
        SELECT codigo, parent_codigo, descripcion, unidad, metrado, pu, rendimiento,
               duracion, activity_id, frente_label, orden, tipo
        FROM lob_cost_items WHERE dataset_id = %s
    """, (dataset_id,))
    items = {}
    for row in cur.fetchall():
        items[row[0]] = {
            'codigo': row[0], 'parent_codigo': row[1], 'descripcion': row[2],
            'unidad': row[3], 'metrado': row[4], 'pu': row[5], 'rendimiento': row[6],
            'duracion': row[7], 'activity_id': row[8], 'frente_label': row[9],
            'orden': row[10], 'tipo': row[11] or 'partida',
        }

    cur.execute("SELECT codigo, periodo, metrado_ejec FROM lob_progress_entries WHERE dataset_id = %s", (dataset_id,))
    progress = {}
    for code, period, value in cur.fetchall():
        progress.setdefault(code, {})[period] = value

    cur.execute("SELECT frente, cod_base FROM lob_front_map WHERE dataset_id = %s", (dataset_id,))
    fronts = [{'frente': row[0], 'cod_base': row[1]} for row in cur.fetchall()]

    cur.execute("""
        SELECT activity_id, nombre, planned_start::text, planned_finish::text,
               actual_start::text, actual_finish::text, percent, status
        FROM lob_activity_schedule WHERE dataset_id = %s
    """, (dataset_id,))
    activities = {
        row[0]: {
            'nombre': row[1], 'start': row[2], 'finish': row[3],
            'actual_start': row[4], 'actual_finish': row[5],
            'percent': row[6], 'status': row[7],
        }
        for row in cur.fetchall()
    }
    cur.execute("""
        SELECT predecessor_id,successor_id,relation_type,lag_hours,source
        FROM lob_activity_relations WHERE dataset_id=%s
    """, (dataset_id,))
    relations = [{
        'predecessor_id': row[0], 'successor_id': row[1],
        'relation_type': row[2], 'lag_hours': row[3], 'source': row[4],
    } for row in cur.fetchall()]
    return items, progress, fronts, activities, relations


def _source_rows(cur, dataset_id):
    cur.execute("""
        SELECT source_type, original_name, gcs_urn, sha256, size_bytes,
               content_type, archived
        FROM lob_dataset_sources WHERE dataset_id = %s
    """, (dataset_id,))
    return {
        row[0]: {
            'source_type': row[0], 'original_name': row[1], 'gcs_urn': row[2],
            'sha256': row[3], 'size_bytes': row[4], 'content_type': row[5],
            'archived': row[6],
        }
        for row in cur.fetchall()
    }


def _archive_source(file_storage, scope, dataset_id, source_type):
    digest, size = sha256_stream(file_storage.stream)
    filename = secure_filename(file_storage.filename or f'{source_type}.bin')
    blob_name = f"lob4d/{scope}/{dataset_id}/{source_type}/{filename}"
    archived = False
    if os.getenv('GCS_BUCKET_NAME') and os.getenv('GCS_BUCKET_NAME') != 'TU_BUCKET_AQUI':
        try:
            from gcs_manager import upload_file_to_gcs
            file_storage.seek(0)
            archived = bool(upload_file_to_gcs(file_storage, blob_name))
        finally:
            file_storage.seek(0)
    if not archived and os.getenv('LOB_REQUIRE_SOURCE_ARCHIVE', 'false').lower() in ('1', 'true', 'yes'):
        raise RuntimeError(f'No se pudo archivar {file_storage.filename} en GCS.')
    return {
        'source_type': source_type,
        'original_name': file_storage.filename or filename,
        'gcs_urn': blob_name if archived else None,
        'sha256': digest,
        'size_bytes': size,
        'content_type': file_storage.content_type,
        'archived': archived,
    }


_PK_RE = None  # compilado perezoso (re se importa aquí abajo para no tocar cabecera)


def _parse_pk(value):
    """'0+065.00' → 65.0 m (km*1000 + m). También acepta números planos."""
    import re
    global _PK_RE
    if _PK_RE is None:
        _PK_RE = re.compile(r'^(\d+)\+(\d+(?:\.\d+)?)$')
    s = str(value or '').strip()
    if not s:
        return None
    m = _PK_RE.match(s)
    if m:
        return float(m.group(1)) * 1000.0 + float(m.group(2))
    try:
        return float(s.replace(',', '.'))
    except ValueError:
        return None


def _derive_locations_from_model(cur, dataset_id, scope):
    """Progresivas por partida DERIVADAS del modelo (Línea de Balance
    Tiempo × Progresiva). Cada elemento lleva DSI_Progresiva (punto, '0+065.00')
    y DSI_CodigoDePartida[1..n]; la partida ocupa el rango [min..max] de las
    progresivas de sus elementos. No pisa filas cargadas a mano (source='manual')."""
    import re
    cur.execute("""
        SELECT ia.external_id,
               MAX(CASE WHEN kv.key ~* 'DSI_Progresiva\\s*$' THEN kv.value END) AS progresiva,
               array_agg(DISTINCT TRIM(kv.value))
                   FILTER (WHERE kv.key ~* 'DSI_CodigoDePartida\\d*\\s*$') AS codigos
        FROM inventory_assets ia
        CROSS JOIN LATERAL jsonb_each(
            CASE WHEN jsonb_typeof(ia.properties) = 'object' THEN ia.properties ELSE '{}'::jsonb END
        ) grp
        CROSS JOIN LATERAL jsonb_each_text(
            CASE WHEN jsonb_typeof(grp.value) = 'object' THEN grp.value ELSE '{}'::jsonb END
        ) kv
        WHERE ia.model_urn = %s
          AND (kv.key ~* 'DSI_Progresiva\\s*$' OR kv.key ~* 'DSI_CodigoDePartida\\d*\\s*$')
        GROUP BY ia.external_id
    """, (scope,))

    code_re = re.compile(r'^\d{1,3}(\.\d{1,3})+$')
    ranges = {}
    for _ext, progresiva, codigos in cur.fetchall():
        pk = _parse_pk(progresiva)
        if pk is None or not codigos:
            continue
        for code in codigos:
            code = (code or '').strip()
            if not code or not code_re.match(code):
                continue
            lo, hi = ranges.get(code, (pk, pk))
            ranges[code] = (min(lo, pk), max(hi, pk))

    rows = [
        (dataset_id, code, None, lo, hi, 1, 'model_progresiva')
        for code, (lo, hi) in ranges.items() if hi > lo
    ]
    if rows:
        execute_values(cur, """
            INSERT INTO lob_locations
                (dataset_id, codigo, alignment_id, station_start, station_end, direction, source)
            VALUES %s
            ON CONFLICT (dataset_id, codigo) DO UPDATE SET
                station_start = EXCLUDED.station_start,
                station_end = EXCLUDED.station_end,
                source = EXCLUDED.source
            WHERE lob_locations.source IS DISTINCT FROM 'manual'
        """, rows)
    return len(rows)


def _build_element_links(cur, dataset_id, scope):
    cur.execute('DELETE FROM lob_element_links WHERE dataset_id = %s', (dataset_id,))
    cur.execute("""
        INSERT INTO lob_element_links
            (dataset_id, source_urn, external_id, codigo, activity_id, link_method, confidence)
        SELECT DISTINCT %s, ia.source_urn, ia.external_id, TRIM(kv.value), ci.activity_id,
               'property_exact', 1.0
        FROM inventory_assets ia
        CROSS JOIN LATERAL jsonb_each(
            CASE WHEN jsonb_typeof(ia.properties) = 'object' THEN ia.properties ELSE '{}'::jsonb END
        ) grp
        CROSS JOIN LATERAL jsonb_each_text(
            CASE WHEN jsonb_typeof(grp.value) = 'object' THEN grp.value ELSE '{}'::jsonb END
        ) kv
        JOIN lob_cost_items ci
          ON ci.dataset_id = %s AND ci.codigo = TRIM(kv.value) AND ci.tipo = 'partida'
        WHERE ia.model_urn = %s
          AND kv.key ~* 'DSI_CodigoDePartida[1-4]?\\s*$'
        ON CONFLICT DO NOTHING
    """, (dataset_id, dataset_id, scope))
    cur.execute("""
        SELECT COUNT(*), COUNT(DISTINCT (source_urn, external_id))
        FROM lob_element_links WHERE dataset_id = %s
    """, (dataset_id,))
    links, elements = cur.fetchone()
    return int(links or 0), int(elements or 0)


def _insert_dataset_data(cur, dataset_id, items, progress, fronts, activities, relations, period_config):
    if items:
        execute_values(cur, """
            INSERT INTO lob_cost_items
                (dataset_id, codigo, parent_codigo, descripcion, unidad, metrado, pu,
                 rendimiento, duracion, activity_id, frente_label, orden, tipo)
            VALUES %s
        """, [(
            dataset_id, item['codigo'], item.get('parent_codigo'), item.get('descripcion'),
            item.get('unidad'), item.get('metrado'), item.get('pu'), item.get('rendimiento'),
            item.get('duracion'), item.get('activity_id'), item.get('frente_label'),
            item.get('orden') or 0, item.get('tipo') or 'partida',
        ) for item in items.values()])

    start_date = period_config.get('fecha_inicio')
    days = int(period_config.get('dias_por_periodo') or 30)
    progress_rows = []
    for code, periods in progress.items():
        if code not in items or items[code].get('tipo') != 'partida':
            continue
        for period, value in periods.items():
            period_start = period_end = None
            if start_date:
                base = datetime.strptime(str(start_date)[:10], '%Y-%m-%d').date()
                period_start = base + timedelta(days=(int(period) - 1) * days)
                period_end = base + timedelta(days=int(period) * days - 1)
            progress_rows.append((dataset_id, code, int(period), max(0, float(value or 0)), period_start, period_end))
    if progress_rows:
        execute_values(cur, """
            INSERT INTO lob_progress_entries
                (dataset_id, codigo, periodo, metrado_ejec, period_start, period_end)
            VALUES %s
        """, progress_rows)

    if fronts:
        execute_values(cur, """
            INSERT INTO lob_front_map (dataset_id, frente, cod_base) VALUES %s
        """, [(dataset_id, row['frente'], row['cod_base']) for row in fronts])

    if activities:
        execute_values(cur, """
            INSERT INTO lob_activity_schedule
                (dataset_id, activity_id, nombre, planned_start, planned_finish,
                 actual_start, actual_finish, percent, status)
            VALUES %s
        """, [(
            dataset_id, activity_id, activity.get('nombre'), activity.get('start'),
            activity.get('finish'), activity.get('actual_start'), activity.get('actual_finish'),
            activity.get('percent'), activity.get('status'),
        ) for activity_id, activity in activities.items()])

    if relations:
        execute_values(cur, """
            INSERT INTO lob_activity_relations
                (dataset_id,predecessor_id,successor_id,relation_type,lag_hours,source)
            VALUES %s ON CONFLICT DO NOTHING
        """, [(
            dataset_id, relation['predecessor_id'], relation['successor_id'],
            relation.get('relation_type') or 'FS', relation.get('lag_hours') or 0,
            relation.get('source') or 'p6',
        ) for relation in relations])


def _config(cur, scope):
    cur.execute("SELECT to_regclass('public.lob_config')")
    if not cur.fetchone()[0]:
        return {'fecha_inicio': None, 'dias_por_periodo': 30}
    cur.execute("SELECT fecha_inicio::text, dias_por_periodo FROM lob_config WHERE model_urn = %s", (scope,))
    row = cur.fetchone()
    return {'fecha_inicio': row[0] if row else None, 'dias_por_periodo': (row[1] if row else None) or 30}


@lob4d_bp.route('/api/lob/import', methods=['POST'])
def lob_import():
    """Publish an immutable dataset version. Existing active data is never deleted."""
    try:
        scope, project_id, front_id = _scope_context(
            request.form.get('scope_urn') or request.form.get('model_urn'),
            request.form.get('project_id'),
            request.form.get('front_id'),
        )
        files = {
            'duraciones': request.files.get('duraciones'),
            'metrados': request.files.get('metrados'),
            'cronograma': request.files.get('cronograma'),
        }
        if not any(files.values()):
            return jsonify({'error': 'Adjunta al menos una fuente 4D.'}), 400
        for source_type, file_storage in files.items():
            validate_source(file_storage, source_type)

        # Validate the minimum dataset before archiving any source. This keeps
        # rejected first imports from leaving orphaned objects in storage.
        from db import get_db_connection
        with get_db_connection() as validation_conn:
            validation_cur = validation_conn.cursor()
            _assert_project_access(validation_cur, project_id)
            existing_dataset = _active_dataset(validation_cur, scope)
            if not existing_dataset and (not files['duraciones'] or not files['metrados']):
                return jsonify({
                    'error': 'La primera version requiere Duraciones y Metrados. El cronograma P6 es opcional.'
                }), 400

        dataset_id = str(uuid.uuid4())
        source_meta = {
            source_type: _archive_source(file_storage, scope, dataset_id, source_type)
            for source_type, file_storage in files.items() if file_storage
        }

        durations = parse_duraciones(files['duraciones'].read()) if files['duraciones'] else None
        quantities = parse_metrados(files['metrados'].read()) if files['metrados'] else None
        p6_package = parse_p6_package(files['cronograma'].stream) if files['cronograma'] else None
        activities = p6_package['activities'] if p6_package else None
        relations = p6_package['relations'] if p6_package else None

        with get_db_connection() as conn:
            cur = conn.cursor()
            _assert_project_access(cur, project_id)
            cur.execute('SELECT pg_advisory_xact_lock(hashtext(%s))', (f'lob4d:{scope}',))
            base = _active_dataset(cur, scope)
            if not base and (durations is None or quantities is None):
                return jsonify({
                    'error': 'La primera version requiere Duraciones y Metrados. El cronograma P6 es opcional.'
                }), 400

            base_items = {}
            base_progress = {}
            base_fronts = []
            base_activities = {}
            base_relations = []
            inherited_sources = {}
            if base:
                base_items, base_progress, base_fronts, base_activities, base_relations = _load_dataset_parts(cur, base['id'])
                inherited_sources = _source_rows(cur, base['id'])

            duration_rows = durations if durations is not None else [
                dict(item) for item in base_items.values() if item.get('tipo') == 'partida'
            ]
            if quantities is None:
                quantities = {
                    'control': {
                        code: {
                            'descripcion': item.get('descripcion'), 'unidad': item.get('unidad'),
                            'metrado': item.get('metrado'), 'pu': item.get('pu'),
                        }
                        for code, item in base_items.items() if item.get('tipo') == 'partida'
                    },
                    'avance': base_progress,
                    'frentes': base_fronts,
                    'titulos': {
                        code: item.get('descripcion')
                        for code, item in base_items.items() if item.get('tipo') == 'titulo'
                    },
                }
            items = merge_cost_items(duration_rows, quantities)
            progress = quantities.get('avance') or {}
            fronts = quantities.get('frentes') or []
            activities = activities if activities is not None else base_activities
            relations = relations if relations is not None else base_relations

            cur.execute('SELECT COALESCE(MAX(version), 0) + 1 FROM lob_datasets WHERE scope_urn = %s', (scope,))
            version = int(cur.fetchone()[0])
            data_date = request.form.get('data_date') or date.today().isoformat()
            try:
                data_date = date.fromisoformat(data_date).isoformat()
            except ValueError as exc:
                raise ValueError('La fecha de datos debe usar el formato AAAA-MM-DD.') from exc
            name = (request.form.get('name') or f'4D LOB {scope} v{version}').strip()[:180]
            all_sources = dict(inherited_sources)
            all_sources.update(source_meta)
            fingerprint = ':'.join(sorted(meta['sha256'] for meta in all_sources.values()))

            cur.execute("""
                INSERT INTO lob_datasets
                    (id, project_id, front_id, scope_urn, version, name, status,
                     data_date, is_active, source_fingerprint, created_by)
                VALUES (%s,%s,%s,%s,%s,%s,'validated',%s,FALSE,%s,%s)
            """, (dataset_id, project_id, front_id, scope, version, name, data_date, fingerprint, _user_label()))

            if all_sources:
                execute_values(cur, """
                    INSERT INTO lob_dataset_sources
                        (dataset_id, source_type, original_name, gcs_urn, sha256,
                         size_bytes, content_type, archived)
                    VALUES %s
                """, [(
                    dataset_id, source_type, meta['original_name'], meta.get('gcs_urn'),
                    meta['sha256'], meta['size_bytes'], meta.get('content_type'), bool(meta.get('archived')),
                ) for source_type, meta in all_sources.items()])

            config = _config(cur, scope)
            _insert_dataset_data(cur, dataset_id, items, progress, fronts, activities, relations, config)
            link_count, linked_elements = _build_element_links(cur, dataset_id, scope)
            locations_count = _derive_locations_from_model(cur, dataset_id, scope)
            quality = quality_report(items, activities, progress, link_count, linked_elements)
            quality['fuentes_archivadas'] = sum(1 for meta in all_sources.values() if meta.get('archived'))
            quality['fuentes_total'] = len(all_sources)
            quality['partidas_con_progresiva'] = locations_count
            quality['relaciones_p6'] = len(relations)

            cur.execute("UPDATE lob_datasets SET is_active=FALSE, status='superseded' WHERE scope_urn=%s AND is_active=TRUE", (scope,))
            cur.execute("""
                UPDATE lob_datasets
                SET is_active=TRUE, status='active', stats=%s, validation=%s,
                    activated_by=%s, activated_at=NOW()
                WHERE id=%s
            """, (Json(quality), Json({'warnings': quality['warnings']}), _user_label(), dataset_id))
            cur.execute("""
                INSERT INTO lob_dataset_audit (dataset_id, scope_urn, action, performed_by, details)
                VALUES (%s,%s,'import_and_activate',%s,%s)
            """, (dataset_id, scope, _user_label(), Json({'version': version, 'sources': list(source_meta)})))
            conn.commit()

        return jsonify({'status': 'ok', 'dataset_id': dataset_id, 'version': version, 'quality': quality}), 201
    except PermissionError as exc:
        return jsonify({'error': str(exc)}), 403
    except ValueError as exc:
        return jsonify({'error': str(exc)}), 422
    except Exception as exc:
        traceback.print_exc()
        return jsonify({'error': str(exc)}), 500


def _timeline_from_dataset(cur, dataset):
    dataset_id = dataset['id']
    cur.execute("""
        SELECT codigo, descripcion, unidad, metrado, pu, rendimiento, duracion,
               activity_id, frente_label, orden, tipo, parent_codigo
        FROM lob_cost_items WHERE dataset_id=%s ORDER BY orden, codigo
    """, (dataset_id,))
    items = [{
        'codigo': row[0], 'descripcion': row[1], 'unidad': row[2], 'metrado': row[3],
        'pu': row[4], 'rendimiento': row[5], 'duracion': row[6], 'activity_id': row[7],
        'frente_label': row[8], 'orden': row[9], 'tipo': row[10], 'parent_codigo': row[11],
    } for row in cur.fetchall()]

    cur.execute("""
        SELECT activity_id, planned_start::text, planned_finish::text,
               actual_start::text, actual_finish::text, percent, status
        FROM lob_activity_schedule WHERE dataset_id=%s
    """, (dataset_id,))
    activities = {
        row[0]: {
            'start': row[1], 'finish': row[2], 'actual_start': row[3],
            'actual_finish': row[4], 'percent': row[5], 'status': row[6],
        }
        for row in cur.fetchall()
    }

    cur.execute("""
        SELECT codigo, periodo, metrado_ejec, period_start::text, period_end::text
        FROM lob_progress_entries WHERE dataset_id=%s ORDER BY codigo, periodo
    """, (dataset_id,))
    progress = {}
    periods = {}
    for code, period, value, start, end in cur.fetchall():
        progress.setdefault(code, {})[str(period)] = value
        periods[str(period)] = {'period': period, 'start': start, 'end': end}

    cur.execute("SELECT frente, cod_base FROM lob_front_map WHERE dataset_id=%s ORDER BY frente, cod_base", (dataset_id,))
    fronts = {}
    for front, code in cur.fetchall():
        fronts.setdefault(front, []).append(code)

    cur.execute("""
        SELECT codigo, alignment_id, station_start, station_end, direction, source
        FROM lob_locations WHERE dataset_id=%s
    """, (dataset_id,))
    locations = {
        row[0]: {
            'alignment_id': row[1], 'station_start': row[2], 'station_end': row[3],
            'direction': row[4], 'source': row[5],
        }
        for row in cur.fetchall()
    }
    cur.execute("""
        SELECT predecessor_id,successor_id,relation_type,lag_hours,source
        FROM lob_activity_relations WHERE dataset_id=%s
    """, (dataset_id,))
    relations = [{
        'predecessor_id': row[0], 'successor_id': row[1],
        'relation_type': row[2], 'lag_hours': row[3], 'source': row[4],
    } for row in cur.fetchall()]
    return items, activities, progress, list(periods.values()), fronts, locations, relations


def _legacy_timeline(cur, scope):
    try:
        config = _config(cur, scope)
        cur.execute("""
            SELECT codigo, descripcion, unidad, metrado, pu, rendimiento, duracion,
                   activity_id, frente_label, orden, tipo
            FROM lob_partidas WHERE model_urn=%s ORDER BY orden, codigo
        """, (scope,))
        items = [{
            'codigo': row[0], 'descripcion': row[1], 'unidad': row[2], 'metrado': row[3],
            'pu': row[4], 'rendimiento': row[5], 'duracion': row[6], 'activity_id': row[7],
            'frente_label': row[8], 'orden': row[9], 'tipo': row[10] or 'partida',
        } for row in cur.fetchall()]
        if not items:
            return None
        cur.execute("SELECT activity_id,start_date::text,finish_date::text,percent,status FROM lob_activities WHERE model_urn=%s", (scope,))
        activities = {row[0]: {'start': row[1], 'finish': row[2], 'percent': row[3], 'status': row[4]} for row in cur.fetchall()}
        cur.execute("SELECT codigo,periodo,metrado_ejec FROM lob_avance WHERE model_urn=%s", (scope,))
        progress = {}
        for code, period, value in cur.fetchall():
            progress.setdefault(code, {})[str(period)] = value
        cur.execute("SELECT frente,cod_base FROM lob_frentes WHERE model_urn=%s", (scope,))
        fronts = {}
        for front, code in cur.fetchall():
            fronts.setdefault(front, []).append(code)
        return {
            'config': config, 'partidas': items, 'activities': activities,
            'avance': progress, 'periods': [], 'frentes': fronts, 'locations': {}, 'relations': [],
            'dataset': None, 'quality': {'legacy': True, 'warnings': ['Datos heredados: publica una version para habilitar auditoria y rollback.']},
        }
    except Exception:
        cur.connection.rollback()
        return None


@lob4d_bp.route('/api/lob/timeline', methods=['GET'])
def lob_timeline():
    try:
        scope, project_id, _ = _scope_context(
            request.args.get('scope_urn') or request.args.get('model_urn'),
            request.args.get('project_id'), request.args.get('front_id'),
        )
        from db import get_db_connection
        with get_db_connection() as conn:
            cur = conn.cursor()
            _assert_project_access(cur, project_id)
            dataset = _active_dataset(cur, scope, request.args.get('dataset_id'))
            if not dataset:
                legacy = _legacy_timeline(cur, scope)
                return jsonify(legacy or {
                    'config': {'fecha_inicio': None, 'dias_por_periodo': 30},
                    'partidas': [], 'activities': {}, 'avance': {}, 'periods': [],
                    'frentes': {}, 'locations': {}, 'relations': [], 'dataset': None,
                    'quality': {'empty': True, 'warnings': ['No hay un dataset 4D publicado para este frente.']},
                }), 200
            items, activities, progress, periods, fronts, locations, relations = _timeline_from_dataset(cur, dataset)
            config = _config(cur, scope)
            return jsonify({
                'config': config, 'partidas': items, 'activities': activities,
                'avance': progress, 'periods': periods, 'frentes': fronts,
                'locations': locations, 'relations': relations,
                'dataset': dataset, 'quality': dataset.get('stats') or {},
            }), 200
    except PermissionError as exc:
        return jsonify({'error': str(exc)}), 403
    except ValueError as exc:
        return jsonify({'error': str(exc)}), 400
    except Exception as exc:
        traceback.print_exc()
        return jsonify({'error': str(exc)}), 500


@lob4d_bp.route('/api/lob/datasets', methods=['GET'])
def lob_datasets():
    try:
        scope, project_id, _ = _scope_context(
            request.args.get('scope_urn') or request.args.get('model_urn'),
            request.args.get('project_id'), request.args.get('front_id'),
        )
        from db import get_db_connection
        with get_db_connection() as conn:
            cur = conn.cursor()
            _assert_project_access(cur, project_id)
            cur.execute("""
                SELECT id, version, name, status, data_date::text, is_active, stats,
                       created_by, created_at, activated_at
                FROM lob_datasets WHERE scope_urn=%s ORDER BY version DESC
            """, (scope,))
            rows = [{
                'id': row[0], 'version': row[1], 'name': row[2], 'status': row[3],
                'data_date': row[4], 'is_active': row[5], 'stats': row[6] or {},
                'created_by': row[7], 'created_at': row[8].isoformat() if row[8] else None,
                'activated_at': row[9].isoformat() if row[9] else None,
            } for row in cur.fetchall()]
        return jsonify({'datasets': rows}), 200
    except PermissionError as exc:
        return jsonify({'error': str(exc)}), 403
    except Exception as exc:
        return jsonify({'error': str(exc)}), 500


@lob4d_bp.route('/api/lob/datasets/<dataset_id>/activate', methods=['POST'])
def lob_activate_dataset(dataset_id):
    try:
        data = request.get_json() or {}
        scope, project_id, _ = _scope_context(
            data.get('scope_urn') or data.get('model_urn'), data.get('project_id'), data.get('front_id')
        )
        from db import get_db_connection
        with get_db_connection() as conn:
            cur = conn.cursor()
            _assert_project_access(cur, project_id)
            cur.execute('SELECT 1 FROM lob_datasets WHERE id=%s AND scope_urn=%s', (dataset_id, scope))
            if not cur.fetchone():
                return jsonify({'error': 'Dataset no encontrado en este frente.'}), 404
            cur.execute('SELECT pg_advisory_xact_lock(hashtext(%s))', (f'lob4d:{scope}',))
            cur.execute("UPDATE lob_datasets SET is_active=FALSE,status='superseded' WHERE scope_urn=%s AND is_active=TRUE", (scope,))
            cur.execute("""
                UPDATE lob_datasets SET is_active=TRUE,status='active',activated_by=%s,activated_at=NOW()
                WHERE id=%s
            """, (_user_label(), dataset_id))
            cur.execute("""
                INSERT INTO lob_dataset_audit(dataset_id,scope_urn,action,performed_by)
                VALUES (%s,%s,'activate',%s)
            """, (dataset_id, scope, _user_label()))
            conn.commit()
        return jsonify({'status': 'ok', 'dataset_id': dataset_id}), 200
    except PermissionError as exc:
        return jsonify({'error': str(exc)}), 403
    except Exception as exc:
        traceback.print_exc()
        return jsonify({'error': str(exc)}), 500


@lob4d_bp.route('/api/lob/links', methods=['GET'])
def lob_links():
    try:
        scope, project_id, _ = _scope_context(
            request.args.get('scope_urn') or request.args.get('model_urn'),
            request.args.get('project_id'), request.args.get('front_id'),
        )
        from db import get_db_connection
        with get_db_connection() as conn:
            cur = conn.cursor()
            _assert_project_access(cur, project_id)
            dataset = _active_dataset(cur, scope, request.args.get('dataset_id'))
            if not dataset:
                return jsonify({'dataset_id': None, 'links': [], 'summary': {'links': 0, 'elements': 0}}), 200
            cur.execute("""
                SELECT source_urn, external_id, codigo, activity_id, link_method, confidence
                FROM lob_element_links WHERE dataset_id=%s
                ORDER BY source_urn, external_id, codigo
            """, (dataset['id'],))
            links = [{
                'source_urn': row[0], 'external_id': row[1], 'codigo': row[2],
                'activity_id': row[3], 'method': row[4], 'confidence': row[5],
            } for row in cur.fetchall()]
            elements = len({(row['source_urn'], row['external_id']) for row in links})
        return jsonify({'dataset_id': dataset['id'], 'links': links, 'summary': {'links': len(links), 'elements': elements}}), 200
    except PermissionError as exc:
        return jsonify({'error': str(exc)}), 403
    except Exception as exc:
        return jsonify({'error': str(exc)}), 500


@lob4d_bp.route('/api/lob/links/rebuild', methods=['POST'])
def lob_rebuild_links():
    try:
        data = request.get_json() or {}
        scope, project_id, _ = _scope_context(
            data.get('scope_urn') or data.get('model_urn'), data.get('project_id'), data.get('front_id')
        )
        from db import get_db_connection
        with get_db_connection() as conn:
            cur = conn.cursor()
            _assert_project_access(cur, project_id)
            dataset = _active_dataset(cur, scope, data.get('dataset_id'))
            if not dataset:
                return jsonify({'error': 'No hay dataset activo.'}), 404
            links, elements = _build_element_links(cur, dataset['id'], scope)
            locations_count = _derive_locations_from_model(cur, dataset['id'], scope)
            stats = dict(dataset.get('stats') or {})
            stats.update({
                'vinculos_bim': links,
                'elementos_bim_vinculados': elements,
                'partidas_con_progresiva': locations_count,
            })
            cur.execute('UPDATE lob_datasets SET stats=%s WHERE id=%s', (Json(stats), dataset['id']))
            cur.execute("""
                INSERT INTO lob_dataset_audit(dataset_id,scope_urn,action,performed_by,details)
                VALUES (%s,%s,'rebuild_links',%s,%s)
            """, (dataset['id'], scope, _user_label(), Json({'links': links, 'elements': elements, 'locations': locations_count})))
            conn.commit()
        return jsonify({'status': 'ok', 'links': links, 'elements': elements, 'locations': locations_count}), 200
    except PermissionError as exc:
        return jsonify({'error': str(exc)}), 403
    except Exception as exc:
        traceback.print_exc()
        return jsonify({'error': str(exc)}), 500


@lob4d_bp.route('/api/lob/locations', methods=['POST'])
def lob_upsert_locations():
    try:
        data = request.get_json() or {}
        scope, project_id, _ = _scope_context(
            data.get('scope_urn') or data.get('model_urn'), data.get('project_id'), data.get('front_id')
        )
        rows = data.get('locations') or []
        from db import get_db_connection
        with get_db_connection() as conn:
            cur = conn.cursor()
            _assert_project_access(cur, project_id)
            dataset = _active_dataset(cur, scope, data.get('dataset_id'))
            if not dataset:
                return jsonify({'error': 'No hay dataset activo.'}), 404
            if rows:
                execute_values(cur, """
                    INSERT INTO lob_locations
                        (dataset_id,codigo,alignment_id,station_start,station_end,direction,source)
                    VALUES %s
                    ON CONFLICT (dataset_id,codigo) DO UPDATE SET
                        alignment_id=EXCLUDED.alignment_id,
                        station_start=EXCLUDED.station_start,
                        station_end=EXCLUDED.station_end,
                        direction=EXCLUDED.direction,
                        source=EXCLUDED.source
                """, [(
                    dataset['id'], row.get('codigo'), row.get('alignment_id'),
                    row.get('station_start'), row.get('station_end'),
                    -1 if int(row.get('direction') or 1) < 0 else 1,
                    row.get('source') or 'manual',
                ) for row in rows if row.get('codigo')])
            conn.commit()
        return jsonify({'status': 'ok', 'updated': len(rows)}), 200
    except PermissionError as exc:
        return jsonify({'error': str(exc)}), 403
    except Exception as exc:
        traceback.print_exc()
        return jsonify({'error': str(exc)}), 500


@lob4d_bp.route('/api/lob/config', methods=['POST'])
def lob_set_config():
    try:
        data = request.get_json() or {}
        scope, project_id, _ = _scope_context(
            data.get('scope_urn') or data.get('model_urn'), data.get('project_id'), data.get('front_id')
        )
        days = int(data.get('dias_por_periodo') or 30)
        if days < 1 or days > 366:
            return jsonify({'error': 'dias_por_periodo fuera de rango.'}), 422
        from db import get_db_connection
        with get_db_connection() as conn:
            cur = conn.cursor()
            _assert_project_access(cur, project_id)
            cur.execute("""
                INSERT INTO lob_config(model_urn,fecha_inicio,dias_por_periodo,updated_at)
                VALUES (%s,%s,%s,NOW())
                ON CONFLICT(model_urn) DO UPDATE SET
                    fecha_inicio=COALESCE(EXCLUDED.fecha_inicio,lob_config.fecha_inicio),
                    dias_por_periodo=EXCLUDED.dias_por_periodo,updated_at=NOW()
            """, (scope, data.get('fecha_inicio'), days))
            conn.commit()
        return jsonify({'status': 'ok'}), 200
    except PermissionError as exc:
        return jsonify({'error': str(exc)}), 403
    except Exception as exc:
        return jsonify({'error': str(exc)}), 500
