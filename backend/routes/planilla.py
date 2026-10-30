# -*- coding: utf-8 -*-
"""Planilla del visor: el itemizado y los criterios de medida, guardados y con versiones, POR FRENTE.

Migración 40 (`planilla_itemizados`, docs/visor/27 §6), 41 (`planilla_criterios_medida`,
docs/visor/32) y 42 (columna `frente`, docs/visor/51).

Por qué existe: la vista Partidas, la cobertura del itemizado y los campos derivados
que usará Filters dependen del itemizado. Mientras vivía solo en el navegador, se perdía
al recargar y cada persona veía otra cosa.

Por frente (42, pedido del dueño el 30-oct-2026): cada frente tiene su presupuesto (Canal ·
Componente 4, Drenaje urbano · Componente 11.2). El visor manda el frente abierto como
'<obra>_<FRENTE>' (p. ej. '1_CANAL'); el servidor resuelve la obra y el frente:
- frente '' = la obra entera: lo que había antes de la 42, y lo que se usa cuando la petición
  nombra la obra y no un frente;
- un frente sin itemizado propio LEE el de la obra (`heredado: true`) hasta que suba el suyo;
- guardar o quitar en un frente solo toca ese frente.
Sin la migración 42 el servidor sigue como antes (uno por obra) al LEER y al guardar para la
obra entera; guardar o quitar en un frente responde 503 MIGRATION_MISSING: nunca pisa el de
la obra creyendo que guarda el de un frente.

Seguridad, igual que el resto del ECD:
- la obra se resuelve en el servidor (`resolve_project_id`), nunca se cree la de la petición;
- el frente tiene que ser de ESA obra (registrado en project_frentes cuando la obra los registra);
- leer: quien pertenece a la obra (`guardia_de_obra`);
- cambiar o quitar: además, ADMINISTRADOR DE ESA OBRA (`es_admin_de_obra`), porque cambia
  lo que ve todo el equipo;
- la lista se valida y se normaliza aquí (planilla_itemizado.py), no se guarda lo que llega tal cual.

Rutas:
  GET    /api/planilla/itemizado?project=<frente u obra>   vigente + historial de versiones
  POST   /api/planilla/itemizado                           nueva versión (la anterior deja de estar vigente)
  DELETE /api/planilla/itemizado?project=<frente u obra>   quitar el vigente (no se borra: queda en el historial)
  GET    /api/planilla/criterios-medida?project=<…>         criterios de medida vigentes + historial
  POST   /api/planilla/criterios-medida                     nuevo juego de criterios (quitar uno = guardar sin él)

No hay migraciones en caliente: las tablas las crean las migraciones 40, 41 y 42 (y esquema_base.py
en una base nueva). Sin la tabla, sus rutas responden 503 con el motivo.
"""
import json
import re

from flask import Blueprint, g, jsonify, request

import planilla_criterios_medida as pcm
import planilla_itemizado as pi
from db import get_db_connection, resolve_project_id
from perimetro_de_obra import guardia_de_obra

planilla_bp = Blueprint('planilla', __name__)

# El itemizado real de PQ-08 son 1.498 ítems y 170 KB. Ocho megas dan margen de sobra
# sin dejar que una petición grande ocupe al proceso (el límite global es de 2 GB para CAD).
LIMITE_CUERPO = 8 * 1024 * 1024
HISTORIAL = 20
# El `front_id` de project_frentes: el nombre en mayúsculas, sin espacios (routes/digital_twin.py).
FRENTE_VALIDO = re.compile(r'^[A-Z0-9][A-Z0-9_]{0,63}$')


def _usuario():
    return getattr(g, 'current_user', None) or {}


def _uid():
    try:
        return int(_usuario().get('id'))
    except (TypeError, ValueError):
        return None


def _error(mensaje, status, code=None, **extra):
    cuerpo = {'success': False, 'error': mensaje}
    if code:
        cuerpo['code'] = code
    cuerpo.update(extra)
    return jsonify(cuerpo), status


def _es_admin(cur, obra):
    import administracion_de_obra as adm
    return bool(adm.es_admin_de_obra(cur, _usuario(), obra))


def _obra_canonica(valor):
    """(obra canónica, None) o (None, respuesta). Se llama DESPUÉS de `guardia_de_obra`."""
    obra = resolve_project_id(valor) if valor else None
    if not obra:
        # El Entity Admin atraviesa la guardia sin resolver la obra: aquí sí hace falta.
        return None, _error('No se pudo determinar a qué obra pertenece esta petición.', 403, 'PROJECT_UNRESOLVED')
    return obra, None


def _frente_de(cur, valor, obra):
    """El frente de la petición: '' = la obra entera, 'CANAL' = ese frente, None = no es de esta obra.

    El visor manda '<obra>_<FRENTE>'. Cualquier otra forma de nombrar la obra (su id, un alias)
    es la obra entera, como antes de la 42. Si la obra registra sus frentes en project_frentes,
    el frente tiene que estar ahí: no se crean itemizados de frentes que no existen.
    """
    valor = str(valor or '').strip()
    if not valor or valor == obra or not valor.startswith(obra + '_'):
        return ''
    frente = valor[len(obra) + 1:].upper()
    if not FRENTE_VALIDO.match(frente):
        return None
    cur.execute("SELECT to_regclass('public.project_frentes')")
    fila = cur.fetchone()
    if fila and fila[0]:
        cur.execute('SELECT front_id FROM project_frentes WHERE base_project_id = %s', (obra,))
        registrados = {str(f[0]).upper() for f in cur.fetchall()}
        if registrados and frente not in registrados:
            return None
    return frente


def _frente_desconocido():
    return _error('Ese frente no es de esta obra.', 404, 'FRONT_UNKNOWN')


def _tabla_ausente(e, tabla='planilla_itemizados'):
    return tabla in str(e) and ('does not exist' in str(e) or 'no existe' in str(e))


def _sin_frente_en_base(e):
    """¿Falta la columna `frente` (la base aún no tiene la migración 42)?"""
    texto = str(e)
    return 'frente' in texto and ('does not exist' in texto or 'no existe' in texto)


def _sin_tabla(migracion='40', tabla='planilla_itemizados'):
    return _error(f'Falta la migración {migracion} ({tabla}) en esta base.', 503, 'MIGRATION_MISSING')


def _fecha(v):
    return v.isoformat() if hasattr(v, 'isoformat') else v


def _json(v):
    if v is None or isinstance(v, (list, dict)):
        return v
    return json.loads(v)


def _candado(prefijo, obra, frente):
    # La de la obra entera conserva su clave de siempre: un backend anterior y este no se pisan.
    return prefijo + obra + (':' + frente if frente else '')


def _filtro(alias, con_frente):
    """El trozo de WHERE y si lleva el parámetro del frente (sin la 42 no hay columna)."""
    return (f' AND {alias}.frente = %s' if con_frente else ''), con_frente


def _leer(cur, sql_vigente, sql_versiones, alias, obra, frente, con_frente):
    """(fila vigente, versiones, heredado). Un frente sin vigente propio usa el de la obra."""
    trozo, _ = _filtro(alias, con_frente)
    p = (obra, frente) if con_frente else (obra,)
    cur.execute(sql_vigente.format(frente=trozo), p)
    fila = cur.fetchone()
    heredado = False
    if fila is None and con_frente and frente:
        cur.execute(sql_vigente.format(frente=trozo), (obra, ''))
        fila = cur.fetchone()
        heredado = fila is not None
    del_frente = '' if heredado else frente
    pv = ((obra, del_frente) if con_frente else (obra,)) + (HISTORIAL,)
    cur.execute(sql_versiones.format(frente=trozo), pv)
    return fila, cur.fetchall(), heredado


# ── Itemizado (migración 40 + 42) ──────────────────────────────────────────────────────────

SQL_ITEMIZADO_VIGENTE = '''SELECT i.version, i.archivo, i.hoja, i.columnas, i.items, i.n_items, i.huella,
                                  i.creado_en, u.name
                             FROM planilla_itemizados i LEFT JOIN users u ON u.id = i.creado_por
                            WHERE i.project_id = %s{frente} AND i.vigente'''
SQL_ITEMIZADO_VERSIONES = '''SELECT i.version, i.archivo, i.n_items, i.creado_en, u.name, i.vigente, i.retirado_en
                               FROM planilla_itemizados i LEFT JOIN users u ON u.id = i.creado_por
                              WHERE i.project_id = %s{frente} ORDER BY i.version DESC LIMIT %s'''


@planilla_bp.route('/api/planilla/itemizado', methods=['GET'])
def leer_itemizado():
    """El itemizado vigente del frente (o el de la obra si el frente no tiene) y sus versiones."""
    valor = request.args.get('project')
    negativa = guardia_de_obra(valor, 'leer el itemizado de la obra')
    if negativa:
        return negativa
    obra, negativa = _obra_canonica(valor)
    if negativa:
        return negativa
    try:
        with get_db_connection() as conn:
            cur = conn.cursor()
            frente = _frente_de(cur, valor, obra)
            if frente is None:
                return _frente_desconocido()
            por_frente = True
            try:
                fila, versiones, heredado = _leer(cur, SQL_ITEMIZADO_VIGENTE, SQL_ITEMIZADO_VERSIONES, 'i',
                                                  obra, frente, True)
            except Exception as e:
                if not _sin_frente_en_base(e):
                    raise
                conn.rollback()          # sin la 42: se lee como antes, el de la obra
                por_frente = False
                fila, versiones, heredado = _leer(cur, SQL_ITEMIZADO_VIGENTE, SQL_ITEMIZADO_VERSIONES, 'i',
                                                  obra, frente, False)
            puede_editar = _es_admin(cur, obra)
    except Exception as e:
        if _tabla_ausente(e):
            return _sin_tabla()
        raise
    vigente = None
    if fila:
        vigente = {'version': fila[0], 'archivo': fila[1], 'hoja': fila[2] or '', 'columnas': _json(fila[3]) or {},
                   'items': _json(fila[4]) or [], 'n_items': fila[5], 'huella': fila[6],
                   'creado_en': _fecha(fila[7]), 'creado_por': fila[8] or ''}
    return jsonify({
        'success': True, 'vigente': vigente, 'puede_editar': puede_editar,
        'frente': frente if por_frente else '', 'heredado': heredado, 'por_frente': por_frente,
        'versiones': [{'version': v[0], 'archivo': v[1], 'n_items': v[2], 'creado_en': _fecha(v[3]),
                       'creado_por': v[4] or '', 'vigente': bool(v[5]), 'retirado_en': _fecha(v[6])}
                      for v in versiones],
    })


def _guardar_itemizado(conn, obra, frente, con_frente, items, archivo, hoja, columnas, huella, uid):
    """(respuesta, status) de guardar una versión en la obra y el frente."""
    cur = conn.cursor()
    if not _es_admin(cur, obra):
        return {'success': False, 'error': 'Solo un administrador de la obra cambia el itemizado.',
                'code': 'NOT_PROJECT_ADMIN'}, 403
    # Una carga por obra y frente a la vez: el número de versión y «una sola vigente» no pueden
    # depender de quién llega antes a la consulta.
    cur.execute('SELECT pg_advisory_xact_lock(hashtextextended(%s, 0))', (_candado('planilla_itemizado:', obra, frente),))
    trozo, _ = _filtro('i', con_frente)
    p = (obra, frente) if con_frente else (obra,)
    cur.execute('SELECT i.version, i.huella FROM planilla_itemizados i WHERE i.project_id = %s{} AND i.vigente'.format(trozo), p)
    actual = cur.fetchone()
    if actual and actual[1] == huella:
        conn.commit()
        return {'success': True, 'version': actual[0], 'sin_cambios': True, 'n_items': len(items)}, 200
    cur.execute('''UPDATE planilla_itemizados i SET vigente = false, retirado_por = %s, retirado_en = now()
                    WHERE i.project_id = %s{} AND i.vigente'''.format(trozo), (uid,) + p)
    # El número de versión es único por OBRA (UNIQUE (project_id, version)), sea del frente que sea.
    cur.execute('SELECT COALESCE(MAX(version), 0) + 1 FROM planilla_itemizados WHERE project_id = %s', (obra,))
    version = cur.fetchone()[0]
    if con_frente:
        cur.execute('''INSERT INTO planilla_itemizados
                           (project_id, version, archivo, hoja, columnas, items, n_items, huella, creado_por, frente)
                       VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)''',
                    (obra, version, archivo, hoja, json.dumps(columnas), json.dumps(items, ensure_ascii=False),
                     len(items), huella, uid, frente))
    else:
        cur.execute('''INSERT INTO planilla_itemizados
                           (project_id, version, archivo, hoja, columnas, items, n_items, huella, creado_por)
                       VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)''',
                    (obra, version, archivo, hoja, json.dumps(columnas), json.dumps(items, ensure_ascii=False),
                     len(items), huella, uid))
    conn.commit()
    return {'success': True, 'version': version, 'sin_cambios': False, 'n_items': len(items), 'huella': huella}, 201


@planilla_bp.route('/api/planilla/itemizado', methods=['POST'])
def guardar_itemizado():
    """Guarda una versión nueva y la deja vigente. La misma lista que la vigente no crea otra."""
    if request.content_length is not None and request.content_length > LIMITE_CUERPO:
        return _error('El itemizado es demasiado grande para guardarlo.', 413, 'PAYLOAD_TOO_LARGE')
    datos = request.get_json(silent=True)
    if not isinstance(datos, dict):
        return _error('Cuerpo JSON requerido.', 400, 'INVALID_BODY')
    negativa = guardia_de_obra(datos.get('project'), 'cambiar el itemizado de la obra')
    if negativa:
        return negativa
    obra, negativa = _obra_canonica(datos.get('project'))
    if negativa:
        return negativa
    # Sin sesión ya ha cortado `guardia_de_obra` (401). Con sesión pero sin un id numérico -- solo la
    # identidad demo del desarrollo local -- la versión se guarda sin autor. NUNCA un 401 aquí: el visor
    # entiende un 401 como «sesión caducada», cierra la sesión y vuelve a la lista de proyectos.
    uid = _uid()
    try:
        items = pi.validar_items(datos.get('items'))
        archivo, hoja, columnas = pi.validar_origen(datos.get('archivo'), datos.get('hoja'), datos.get('columnas'))
    except pi.ItemizadoInvalido as e:
        return jsonify({'success': False, **e.como_dict()}), 400
    huella = pi.huella(items)
    try:
        with get_db_connection() as conn:
            frente = _frente_de(conn.cursor(), datos.get('project'), obra)
            if frente is None:
                return _frente_desconocido()
            try:
                cuerpo, status = _guardar_itemizado(conn, obra, frente, True, items, archivo, hoja, columnas, huella, uid)
            except Exception as e:
                if not _sin_frente_en_base(e):
                    raise
                conn.rollback()
                if frente:   # sin la 42 no se guarda el de un frente: pisaría el de la obra entera
                    return _sin_tabla('42', 'planilla_itemizados.frente')
                cuerpo, status = _guardar_itemizado(conn, obra, '', False, items, archivo, hoja, columnas, huella, uid)
    except Exception as e:
        if _tabla_ausente(e):
            return _sin_tabla()
        raise
    return jsonify(cuerpo), status


@planilla_bp.route('/api/planilla/itemizado', methods=['DELETE'])
def quitar_itemizado():
    """Deja el frente (o la obra) sin itemizado vigente. La versión queda en el historial, no se borra.

    Quitar el de un frente no toca el de la obra: el frente vuelve a usar el de la obra, si lo hay.
    """
    valor = request.args.get('project')
    negativa = guardia_de_obra(valor, 'quitar el itemizado de la obra')
    if negativa:
        return negativa
    obra, negativa = _obra_canonica(valor)
    if negativa:
        return negativa
    uid = _uid()   # None solo con la identidad demo local (ver guardar_itemizado): sin 401
    try:
        with get_db_connection() as conn:
            cur = conn.cursor()
            frente = _frente_de(cur, valor, obra)
            if frente is None:
                return _frente_desconocido()
            if not _es_admin(cur, obra):
                return _error('Solo un administrador de la obra cambia el itemizado.', 403, 'NOT_PROJECT_ADMIN')
            cur.execute('SELECT pg_advisory_xact_lock(hashtextextended(%s, 0))', (_candado('planilla_itemizado:', obra, frente),))
            try:
                cur.execute('''UPDATE planilla_itemizados i SET vigente = false, retirado_por = %s, retirado_en = now()
                                WHERE i.project_id = %s AND i.frente = %s AND i.vigente RETURNING i.version''', (uid, obra, frente))
            except Exception as e:
                if not _sin_frente_en_base(e):
                    raise
                conn.rollback()
                if frente:
                    return _sin_tabla('42', 'planilla_itemizados.frente')
                cur.execute('SELECT pg_advisory_xact_lock(hashtextextended(%s, 0))', (_candado('planilla_itemizado:', obra, ''),))
                cur.execute('''UPDATE planilla_itemizados i SET vigente = false, retirado_por = %s, retirado_en = now()
                                WHERE i.project_id = %s AND i.vigente RETURNING i.version''', (uid, obra))
            fila = cur.fetchone()
            conn.commit()
    except Exception as e:
        if _tabla_ausente(e):
            return _sin_tabla()
        raise
    return jsonify({'success': True, 'retirada': fila[0] if fila else None})


# ── Criterios de medida (migración 41 + 42, docs/visor/32) ─────────────────────────────────

TABLA_CRITERIOS = 'planilla_criterios_medida'
SQL_CRITERIOS_VIGENTE = '''SELECT c.version, c.criterios, c.n_criterios, c.huella, c.creado_en, u.name
                             FROM planilla_criterios_medida c LEFT JOIN users u ON u.id = c.creado_por
                            WHERE c.project_id = %s{frente} AND c.vigente'''
SQL_CRITERIOS_VERSIONES = '''SELECT c.version, c.n_criterios, c.creado_en, u.name, c.vigente
                               FROM planilla_criterios_medida c LEFT JOIN users u ON u.id = c.creado_por
                              WHERE c.project_id = %s{frente} ORDER BY c.version DESC LIMIT %s'''


@planilla_bp.route('/api/planilla/criterios-medida', methods=['GET'])
def leer_criterios_medida():
    """Los criterios de medida vigentes del frente (o los de la obra si el frente no tiene) y sus versiones."""
    valor = request.args.get('project')
    negativa = guardia_de_obra(valor, 'leer los criterios de medida de la obra')
    if negativa:
        return negativa
    obra, negativa = _obra_canonica(valor)
    if negativa:
        return negativa
    try:
        with get_db_connection() as conn:
            cur = conn.cursor()
            frente = _frente_de(cur, valor, obra)
            if frente is None:
                return _frente_desconocido()
            por_frente = True
            try:
                fila, versiones, heredado = _leer(cur, SQL_CRITERIOS_VIGENTE, SQL_CRITERIOS_VERSIONES, 'c',
                                                  obra, frente, True)
            except Exception as e:
                if not _sin_frente_en_base(e):
                    raise
                conn.rollback()
                por_frente = False
                fila, versiones, heredado = _leer(cur, SQL_CRITERIOS_VIGENTE, SQL_CRITERIOS_VERSIONES, 'c',
                                                  obra, frente, False)
            puede_editar = _es_admin(cur, obra)
    except Exception as e:
        if _tabla_ausente(e, TABLA_CRITERIOS):
            return _sin_tabla('41', TABLA_CRITERIOS)
        raise
    vigente = None
    if fila:
        vigente = {'version': fila[0], 'criterios': _json(fila[1]) or [], 'n_criterios': fila[2], 'huella': fila[3],
                   'creado_en': _fecha(fila[4]), 'creado_por': fila[5] or ''}
    return jsonify({
        'success': True, 'vigente': vigente, 'puede_editar': puede_editar,
        'frente': frente if por_frente else '', 'heredado': heredado, 'por_frente': por_frente,
        'versiones': [{'version': v[0], 'n_criterios': v[1], 'creado_en': _fecha(v[2]), 'creado_por': v[3] or '',
                       'vigente': bool(v[4])} for v in versiones],
    })


def _guardar_criterios(conn, obra, frente, con_frente, criterios, huella, uid):
    cur = conn.cursor()
    if not _es_admin(cur, obra):
        return {'success': False, 'error': 'Solo un administrador de la obra cambia los criterios de medida.',
                'code': 'NOT_PROJECT_ADMIN'}, 403
    cur.execute('SELECT pg_advisory_xact_lock(hashtextextended(%s, 0))', (_candado('planilla_criterios_medida:', obra, frente),))
    trozo, _ = _filtro('c', con_frente)
    p = (obra, frente) if con_frente else (obra,)
    cur.execute('SELECT c.version, c.huella FROM planilla_criterios_medida c WHERE c.project_id = %s{} AND c.vigente'.format(trozo), p)
    actual = cur.fetchone()
    # El mismo juego no crea otra versión; un frente (u obra) sin criterios que guarda «ninguno», tampoco.
    if (actual and actual[1] == huella) or (not actual and not criterios):
        conn.commit()
        return {'success': True, 'version': actual[0] if actual else None, 'sin_cambios': True,
                'n_criterios': len(criterios)}, 200
    cur.execute('''UPDATE planilla_criterios_medida c SET vigente = false, retirado_por = %s, retirado_en = now()
                    WHERE c.project_id = %s{} AND c.vigente'''.format(trozo), (uid,) + p)
    cur.execute('SELECT COALESCE(MAX(version), 0) + 1 FROM planilla_criterios_medida WHERE project_id = %s', (obra,))
    version = cur.fetchone()[0]
    if con_frente:
        cur.execute('''INSERT INTO planilla_criterios_medida (project_id, version, criterios, n_criterios, huella, creado_por, frente)
                       VALUES (%s, %s, %s, %s, %s, %s, %s)''',
                    (obra, version, json.dumps(criterios, ensure_ascii=False), len(criterios), huella, uid, frente))
    else:
        cur.execute('''INSERT INTO planilla_criterios_medida (project_id, version, criterios, n_criterios, huella, creado_por)
                       VALUES (%s, %s, %s, %s, %s, %s)''',
                    (obra, version, json.dumps(criterios, ensure_ascii=False), len(criterios), huella, uid))
    conn.commit()
    return {'success': True, 'version': version, 'sin_cambios': False, 'n_criterios': len(criterios),
            'huella': huella}, 201


@planilla_bp.route('/api/planilla/criterios-medida', methods=['POST'])
def guardar_criterios_medida():
    """Guarda el juego completo como versión nueva y la deja vigente. El mismo juego no crea otra.

    Quitar un criterio es guardar el juego sin él: la versión anterior queda en el historial.
    """
    if request.content_length is not None and request.content_length > LIMITE_CUERPO:
        return _error('Los criterios son demasiado grandes para guardarlos.', 413, 'PAYLOAD_TOO_LARGE')
    datos = request.get_json(silent=True)
    if not isinstance(datos, dict):
        return _error('Cuerpo JSON requerido.', 400, 'INVALID_BODY')
    negativa = guardia_de_obra(datos.get('project'), 'cambiar los criterios de medida de la obra')
    if negativa:
        return negativa
    obra, negativa = _obra_canonica(datos.get('project'))
    if negativa:
        return negativa
    uid = _uid()   # None solo con la identidad demo local (ver guardar_itemizado): sin 401
    try:
        criterios = pcm.validar_criterios(datos.get('criterios'))
    except pcm.CriteriosInvalidos as e:
        return jsonify({'success': False, **e.como_dict()}), 400
    huella = pcm.huella(criterios)
    try:
        with get_db_connection() as conn:
            frente = _frente_de(conn.cursor(), datos.get('project'), obra)
            if frente is None:
                return _frente_desconocido()
            try:
                cuerpo, status = _guardar_criterios(conn, obra, frente, True, criterios, huella, uid)
            except Exception as e:
                if not _sin_frente_en_base(e):
                    raise
                conn.rollback()
                if frente:
                    return _sin_tabla('42', 'planilla_criterios_medida.frente')
                cuerpo, status = _guardar_criterios(conn, obra, '', False, criterios, huella, uid)
    except Exception as e:
        if _tabla_ausente(e, TABLA_CRITERIOS):
            return _sin_tabla('41', TABLA_CRITERIOS)
        raise
    return jsonify(cuerpo), status
