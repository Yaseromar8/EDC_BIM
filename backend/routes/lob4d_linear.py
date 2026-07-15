"""LOB Linear 1.0 configuration and portfolio-ready planning API."""
from __future__ import annotations

import uuid
from datetime import date

from flask import Blueprint, jsonify, request
from psycopg2.extras import Json, execute_values

from lob4d_linear_engine import (
    STANDARD_VERSION,
    build_zones,
    methodology_template,
    normalize_project_type,
    readiness,
    resource_template,
    validate_station_range,
)
from routes.lob4d import _active_dataset, _assert_project_access, _scope_context, _user_label


lob4d_linear_bp = Blueprint('lob4d_linear', __name__)


def _context(values):
    return _scope_context(
        values.get('scope_urn') or values.get('model_urn'),
        values.get('project_id'),
        values.get('front_id'),
    )


def _profile(cur, scope):
    cur.execute("""
        SELECT scope_urn,project_id,front_id,standard_version,name,project_type,
               alignment_id,station_start,station_end,station_unit,station_notation,
               direction,timezone,currency,calendar,settings,status,created_by,
               created_at,updated_by,updated_at
        FROM lob_linear_profiles WHERE scope_urn=%s
    """, (scope,))
    row = cur.fetchone()
    if not row:
        return None
    return {
        'scope_urn': row[0], 'project_id': row[1], 'front_id': row[2],
        'standard_version': row[3], 'name': row[4], 'project_type': row[5],
        'alignment_id': row[6], 'station_start': row[7], 'station_end': row[8],
        'station_unit': row[9], 'station_notation': row[10], 'direction': row[11],
        'timezone': row[12], 'currency': row[13], 'calendar': row[14] or {},
        'settings': row[15] or {}, 'status': row[16], 'created_by': row[17],
        'created_at': row[18].isoformat() if row[18] else None,
        'updated_by': row[19], 'updated_at': row[20].isoformat() if row[20] else None,
    }


def _state(cur, scope):
    profile = _profile(cur, scope)
    dataset = _active_dataset(cur, scope)

    cur.execute("""
        SELECT id,code,name,parent_code,zone_type,station_start,station_end,
               sequence,alignment_id,metadata
        FROM lob_linear_zones WHERE scope_urn=%s ORDER BY sequence,station_start
    """, (scope,))
    zones = [{
        'id': row[0], 'code': row[1], 'name': row[2], 'parent_code': row[3],
        'zone_type': row[4], 'station_start': row[5], 'station_end': row[6],
        'sequence': row[7], 'alignment_id': row[8], 'metadata': row[9] or {},
    } for row in cur.fetchall()]

    cur.execute("""
        SELECT id,code,name,project_type,description,reusable,is_default,version
        FROM lob_linear_methodologies WHERE scope_urn=%s ORDER BY is_default DESC,name
    """, (scope,))
    methodologies = []
    step_count = 0
    for row in cur.fetchall():
        cur.execute("""
            SELECT step_code,sequence,name,cost_code_pattern,relation_type,lag_days,
                   production_rate,production_unit,crew_code,behavior,color,metadata
            FROM lob_linear_methodology_steps WHERE methodology_id=%s ORDER BY sequence
        """, (row[0],))
        steps = [{
            'step_code': step[0], 'sequence': step[1], 'name': step[2],
            'cost_code_pattern': step[3], 'relation_type': step[4], 'lag_days': step[5],
            'production_rate': step[6], 'production_unit': step[7], 'crew_code': step[8],
            'behavior': step[9], 'color': step[10], 'metadata': step[11] or {},
        } for step in cur.fetchall()]
        step_count += len(steps)
        methodologies.append({
            'id': row[0], 'code': row[1], 'name': row[2], 'project_type': row[3],
            'description': row[4], 'reusable': row[5], 'is_default': row[6],
            'version': row[7], 'steps': steps,
        })

    cur.execute("""
        SELECT id,code,name,resource_type,capacity,unit,cost_rate,availability,active
        FROM lob_linear_resources WHERE scope_urn=%s ORDER BY resource_type,code
    """, (scope,))
    resources = [{
        'id': row[0], 'code': row[1], 'name': row[2], 'resource_type': row[3],
        'capacity': row[4], 'unit': row[5], 'cost_rate': row[6],
        'availability': row[7] or {}, 'active': row[8],
    } for row in cur.fetchall()]

    cur.execute("""
        SELECT id,dataset_id,name,scenario_type,status,is_active,assumptions,
               created_by,created_at,approved_by,approved_at
        FROM lob_linear_scenarios WHERE scope_urn=%s ORDER BY created_at DESC
    """, (scope,))
    scenarios = [{
        'id': row[0], 'dataset_id': row[1], 'name': row[2], 'scenario_type': row[3],
        'status': row[4], 'is_active': row[5], 'assumptions': row[6] or {},
        'created_by': row[7], 'created_at': row[8].isoformat() if row[8] else None,
        'approved_by': row[9], 'approved_at': row[10].isoformat() if row[10] else None,
    } for row in cur.fetchall()]

    counts = {
        'zones': len(zones), 'methodologies': len(methodologies), 'steps': step_count,
        'resources': len(resources), 'scenarios': len(scenarios),
        'locations': 0, 'links': 0, 'progress_events': 0, 'relations': 0,
    }
    if dataset:
        cur.execute('SELECT COUNT(*) FROM lob_locations WHERE dataset_id=%s', (dataset['id'],))
        counts['locations'] = int(cur.fetchone()[0] or 0)
        cur.execute('SELECT COUNT(*) FROM lob_element_links WHERE dataset_id=%s', (dataset['id'],))
        counts['links'] = int(cur.fetchone()[0] or 0)
        cur.execute('SELECT COUNT(*) FROM lob_activity_relations WHERE dataset_id=%s', (dataset['id'],))
        counts['relations'] = int(cur.fetchone()[0] or 0)
    cur.execute('SELECT COUNT(*) FROM lob_linear_progress_events WHERE scope_urn=%s', (scope,))
    counts['progress_events'] = int(cur.fetchone()[0] or 0)

    return {
        'standard': STANDARD_VERSION,
        'profile': profile,
        'zones': zones,
        'methodologies': methodologies,
        'resources': resources,
        'scenarios': scenarios,
        'dataset': dataset,
        'counts': counts,
        'readiness': readiness(profile, counts, dataset),
    }


@lob4d_linear_bp.route('/api/lob/linear/state', methods=['GET'])
def linear_state():
    try:
        scope, project_id, _ = _context(request.args)
        from db import get_db_connection
        with get_db_connection() as conn:
            cur = conn.cursor()
            _assert_project_access(cur, project_id)
            payload = _state(cur, scope)
        return jsonify(payload), 200
    except PermissionError as exc:
        return jsonify({'error': str(exc)}), 403
    except ValueError as exc:
        return jsonify({'error': str(exc)}), 400
    except Exception as exc:
        return jsonify({'error': str(exc)}), 500


@lob4d_linear_bp.route('/api/lob/linear/bootstrap', methods=['POST'])
def linear_bootstrap():
    try:
        data = request.get_json() or {}
        scope, project_id, front_id = _context(data)
        project_type = normalize_project_type(data.get('project_type'))
        station_start, station_end = validate_station_range(data.get('station_start'), data.get('station_end'))
        segment_length = data.get('segment_length') or max(1, (station_end - station_start) / 10)
        generated_zones = build_zones(station_start, station_end, segment_length)
        steps = methodology_template(project_type)
        resources = resource_template(steps)
        user = _user_label()
        calendar = data.get('calendar') or {'work_days': [1, 2, 3, 4, 5, 6], 'hours_per_day': 8}
        if not isinstance(calendar.get('work_days'), list) or not calendar.get('work_days'):
            raise ValueError('El calendario debe tener al menos un dia laborable.')
        if float(calendar.get('hours_per_day') or 0) <= 0:
            raise ValueError('Las horas por dia deben ser mayores que cero.')

        from db import get_db_connection
        with get_db_connection() as conn:
            cur = conn.cursor()
            _assert_project_access(cur, project_id)
            cur.execute('SELECT pg_advisory_xact_lock(hashtext(%s))', (f'lob-linear:{scope}',))
            existing_profile = _profile(cur, scope)
            if existing_profile and not data.get('replace_zones'):
                range_changed = (
                    float(existing_profile['station_start']) != station_start
                    or float(existing_profile['station_end']) != station_end
                )
                cur.execute('SELECT COUNT(*) FROM lob_linear_zones WHERE scope_urn=%s', (scope,))
                if range_changed and int(cur.fetchone()[0] or 0):
                    raise ValueError('El rango cambio y ya existen sectores. Confirma replace_zones para regenerarlos.')
            if existing_profile and existing_profile['project_type'] != project_type and not data.get('replace_methodology'):
                raise ValueError('El tipo de infraestructura cambio. Confirma replace_methodology para regenerar la metodologia.')

            if existing_profile and data.get('replace_methodology'):
                cur.execute('DELETE FROM lob_linear_methodologies WHERE scope_urn=%s AND is_default=TRUE', (scope,))
                cur.execute('DELETE FROM lob_linear_resources WHERE scope_urn=%s', (scope,))

            cur.execute("""
                INSERT INTO lob_linear_profiles
                    (scope_urn,project_id,front_id,standard_version,name,project_type,
                     alignment_id,station_start,station_end,station_unit,station_notation,
                     direction,timezone,currency,calendar,settings,status,created_by,updated_by)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'ready',%s,%s)
                ON CONFLICT(scope_urn) DO UPDATE SET
                    project_id=EXCLUDED.project_id,front_id=EXCLUDED.front_id,
                    name=EXCLUDED.name,project_type=EXCLUDED.project_type,
                    alignment_id=COALESCE(EXCLUDED.alignment_id,lob_linear_profiles.alignment_id),
                    station_start=EXCLUDED.station_start,station_end=EXCLUDED.station_end,
                    station_unit=EXCLUDED.station_unit,station_notation=EXCLUDED.station_notation,
                    direction=EXCLUDED.direction,timezone=EXCLUDED.timezone,
                    currency=EXCLUDED.currency,calendar=EXCLUDED.calendar,
                    settings=EXCLUDED.settings,status='ready',updated_by=EXCLUDED.updated_by,updated_at=NOW()
            """, (
                scope, project_id, front_id, STANDARD_VERSION,
                (data.get('name') or f'Proyecto lineal {scope}').strip()[:180], project_type,
                data.get('alignment_id'), station_start, station_end,
                data.get('station_unit') or 'm', data.get('station_notation') or '0+000.00',
                -1 if int(data.get('direction') or 1) < 0 else 1,
                data.get('timezone') or 'America/Lima', data.get('currency') or 'PEN',
                Json(calendar), Json(data.get('settings') or {}), user, user,
            ))

            cur.execute('SELECT COUNT(*) FROM lob_linear_zones WHERE scope_urn=%s', (scope,))
            zones_exist = int(cur.fetchone()[0] or 0)
            if data.get('replace_zones') and zones_exist:
                cur.execute('DELETE FROM lob_linear_zones WHERE scope_urn=%s', (scope,))
                zones_exist = 0
            if not zones_exist:
                execute_values(cur, """
                    INSERT INTO lob_linear_zones
                        (id,scope_urn,code,name,zone_type,station_start,station_end,sequence,alignment_id)
                    VALUES %s
                """, [(
                    str(uuid.uuid4()), scope, zone['code'], zone['name'], zone['zone_type'],
                    zone['station_start'], zone['station_end'], zone['sequence'], data.get('alignment_id'),
                ) for zone in generated_zones])

            cur.execute("""
                SELECT id FROM lob_linear_methodologies
                WHERE scope_urn=%s AND is_default=TRUE ORDER BY version DESC LIMIT 1
            """, (scope,))
            method_row = cur.fetchone()
            if not method_row:
                method_id = str(uuid.uuid4())
                method_code = f'STD_{project_type.upper()}'
                cur.execute("""
                    INSERT INTO lob_linear_methodologies
                        (id,project_id,scope_urn,code,name,project_type,description,reusable,is_default,created_by)
                    VALUES (%s,%s,%s,%s,%s,%s,%s,TRUE,TRUE,%s)
                """, (
                    method_id, project_id, scope, method_code,
                    f'Metodologia base - {project_type}', project_type,
                    f'Plantilla inicial {STANDARD_VERSION}; debe calibrarse con rendimientos contractuales.', user,
                ))
                execute_values(cur, """
                    INSERT INTO lob_linear_methodology_steps
                        (methodology_id,step_code,sequence,name,relation_type,lag_days,
                         production_rate,production_unit,crew_code,behavior,color)
                    VALUES %s
                """, [(
                    method_id, step['step_code'], step['sequence'], step['name'],
                    step['relation_type'], step['lag_days'], step['production_rate'],
                    step['production_unit'], step['crew_code'], step['behavior'], step['color'],
                ) for step in steps])

            cur.execute('SELECT COUNT(*) FROM lob_linear_resources WHERE scope_urn=%s', (scope,))
            if not int(cur.fetchone()[0] or 0):
                execute_values(cur, """
                    INSERT INTO lob_linear_resources
                        (id,scope_urn,code,name,resource_type,capacity,unit)
                    VALUES %s
                """, [(
                    str(uuid.uuid4()), scope, resource['code'], resource['name'],
                    resource['resource_type'], resource['capacity'], resource['unit'],
                ) for resource in resources])

            dataset = _active_dataset(cur, scope)
            cur.execute('SELECT COUNT(*) FROM lob_linear_scenarios WHERE scope_urn=%s', (scope,))
            if not int(cur.fetchone()[0] or 0):
                cur.execute("""
                    INSERT INTO lob_linear_scenarios
                        (id,scope_urn,dataset_id,name,scenario_type,status,is_active,assumptions,created_by)
                    VALUES (%s,%s,%s,%s,'working','active',TRUE,%s,%s)
                """, (
                    str(uuid.uuid4()), scope, dataset['id'] if dataset else None,
                    'Plan de trabajo inicial', Json({'standard': STANDARD_VERSION}), user,
                ))

            cur.execute("""
                INSERT INTO lob_dataset_audit(dataset_id,scope_urn,action,performed_by,details)
                VALUES (%s,%s,'linear_bootstrap',%s,%s)
            """, (
                dataset['id'] if dataset else None, scope, user,
                Json({'standard': STANDARD_VERSION, 'project_type': project_type,
                      'station_start': station_start, 'station_end': station_end,
                      'segment_length': float(segment_length)}),
            ))
            conn.commit()
            payload = _state(cur, scope)
        return jsonify(payload), 201
    except PermissionError as exc:
        return jsonify({'error': str(exc)}), 403
    except ValueError as exc:
        return jsonify({'error': str(exc)}), 422
    except Exception as exc:
        return jsonify({'error': str(exc)}), 500


@lob4d_linear_bp.route('/api/lob/linear/scenarios', methods=['POST'])
def linear_create_scenario():
    try:
        data = request.get_json() or {}
        scope, project_id, _ = _context(data)
        scenario_type = str(data.get('scenario_type') or 'what_if')
        if scenario_type not in ('contractual', 'baseline', 'working', 'what_if', 'actual'):
            raise ValueError('Tipo de escenario no valido.')
        from db import get_db_connection
        with get_db_connection() as conn:
            cur = conn.cursor()
            _assert_project_access(cur, project_id)
            if not _profile(cur, scope):
                return jsonify({'error': 'Configura primero el proyecto lineal.'}), 409
            dataset = _active_dataset(cur, scope, data.get('dataset_id'))
            scenario_id = str(uuid.uuid4())
            cur.execute("""
                INSERT INTO lob_linear_scenarios
                    (id,scope_urn,dataset_id,name,scenario_type,status,is_active,assumptions,created_by)
                VALUES (%s,%s,%s,%s,%s,'draft',FALSE,%s,%s)
            """, (
                scenario_id, scope, dataset['id'] if dataset else None,
                (data.get('name') or f'Escenario {date.today().isoformat()}').strip()[:180],
                scenario_type, Json(data.get('assumptions') or {}), _user_label(),
            ))
            conn.commit()
        return jsonify({'status': 'ok', 'scenario_id': scenario_id}), 201
    except PermissionError as exc:
        return jsonify({'error': str(exc)}), 403
    except ValueError as exc:
        return jsonify({'error': str(exc)}), 422
    except Exception as exc:
        return jsonify({'error': str(exc)}), 500


@lob4d_linear_bp.route('/api/lob/linear/progress', methods=['POST'])
def linear_progress():
    try:
        data = request.get_json() or {}
        scope, project_id, _ = _context(data)
        if not data.get('codigo') or not data.get('event_date'):
            raise ValueError('El avance requiere codigo y fecha.')
        event_date = date.fromisoformat(str(data['event_date'])).isoformat()
        percent = data.get('percent_complete')
        if percent is not None and not 0 <= float(percent) <= 100:
            raise ValueError('El porcentaje debe estar entre 0 y 100.')
        from db import get_db_connection
        with get_db_connection() as conn:
            cur = conn.cursor()
            _assert_project_access(cur, project_id)
            profile = _profile(cur, scope)
            if not profile:
                return jsonify({'error': 'Configura primero el proyecto lineal.'}), 409
            station_start = data.get('station_start')
            station_end = data.get('station_end')
            if station_start is not None or station_end is not None:
                if station_start is None or station_end is None:
                    raise ValueError('El avance por ubicacion requiere P.K. inicial y final.')
                station_start, station_end = validate_station_range(station_start, station_end)
                if station_start < profile['station_start'] or station_end > profile['station_end']:
                    raise ValueError('El rango del avance esta fuera del proyecto lineal configurado.')
            dataset = _active_dataset(cur, scope, data.get('dataset_id'))
            event_id = str(uuid.uuid4())
            cur.execute("""
                INSERT INTO lob_linear_progress_events
                    (id,scope_urn,dataset_id,codigo,zone_code,event_date,station_start,
                     station_end,quantity,unit,percent_complete,source,note,evidence,created_by)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
            """, (
                event_id, scope, dataset['id'] if dataset else None, str(data['codigo']).strip(),
                data.get('zone_code'), event_date, station_start, station_end,
                data.get('quantity'), data.get('unit'), percent, data.get('source') or 'field',
                data.get('note'), Json(data.get('evidence') or []), _user_label(),
            ))
            conn.commit()
        return jsonify({'status': 'ok', 'event_id': event_id}), 201
    except PermissionError as exc:
        return jsonify({'error': str(exc)}), 403
    except (ValueError, TypeError) as exc:
        return jsonify({'error': str(exc)}), 422
    except Exception as exc:
        return jsonify({'error': str(exc)}), 500
