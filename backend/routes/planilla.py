# -*- coding: utf-8 -*-
"""Planilla del visor: el itemizado de la obra, guardado y con versiones.

Migración 40 (`planilla_itemizados`), docs/visor/27 §6.

Por qué existe: la vista Partidas, la cobertura del itemizado y los campos derivados
que usará Filters dependen del itemizado de la obra. Mientras vivía solo en el
navegador, se perdía al recargar y cada persona veía otra cosa. Ahora es de la OBRA:
se carga al abrir la obra, en cualquiera de sus frentes.

Seguridad, igual que el resto del ECD:
- la obra se resuelve en el servidor (`resolve_project_id`), nunca se cree la de la petición;
- leer: quien pertenece a la obra (`guardia_de_obra`);
- cambiar o quitar: además, ADMINISTRADOR DE ESA OBRA (`es_admin_de_obra`), porque cambia
  lo que ve todo el equipo;
- la lista se valida y se normaliza aquí (planilla_itemizado.py), no se guarda lo que llega tal cual.

Rutas:
  GET    /api/planilla/itemizado?project=<frente u obra>   vigente + historial de versiones
  POST   /api/planilla/itemizado                           nueva versión (la anterior deja de estar vigente)
  DELETE /api/planilla/itemizado?project=<frente u obra>   quitar el vigente (no se borra: queda en el historial)

No hay migraciones en caliente: la tabla la crea la migración 40 (y esquema_base.py en una
base nueva). Sin la tabla, las rutas responden 503 con el motivo.
"""
import json

from flask import Blueprint, g, jsonify, request

import planilla_itemizado as pi
from db import get_db_connection, resolve_project_id
from perimetro_de_obra import guardia_de_obra

planilla_bp = Blueprint('planilla', __name__)

# El itemizado real de PQ-08 son 1.498 ítems y 170 KB. Ocho megas dan margen de sobra
# sin dejar que una petición grande ocupe al proceso (el límite global es de 2 GB para CAD).
LIMITE_CUERPO = 8 * 1024 * 1024
HISTORIAL = 20


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


def _tabla_ausente(e):
    return 'planilla_itemizados' in str(e) and ('does not exist' in str(e) or 'no existe' in str(e))


def _sin_tabla():
    return _error('Falta la migración 40 (planilla_itemizados) en esta base.', 503, 'MIGRATION_MISSING')


def _fecha(v):
    return v.isoformat() if hasattr(v, 'isoformat') else v


def _json(v):
    if v is None or isinstance(v, (list, dict)):
        return v
    return json.loads(v)


@planilla_bp.route('/api/planilla/itemizado', methods=['GET'])
def leer_itemizado():
    """El itemizado vigente de la obra (o null) y las últimas versiones."""
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
            cur.execute('''SELECT i.version, i.archivo, i.hoja, i.columnas, i.items, i.n_items, i.huella,
                                  i.creado_en, u.name
                             FROM planilla_itemizados i LEFT JOIN users u ON u.id = i.creado_por
                            WHERE i.project_id = %s AND i.vigente''', (obra,))
            fila = cur.fetchone()
            cur.execute('''SELECT i.version, i.archivo, i.n_items, i.creado_en, u.name, i.vigente, i.retirado_en
                             FROM planilla_itemizados i LEFT JOIN users u ON u.id = i.creado_por
                            WHERE i.project_id = %s ORDER BY i.version DESC LIMIT %s''', (obra, HISTORIAL))
            versiones = cur.fetchall()
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
        'versiones': [{'version': v[0], 'archivo': v[1], 'n_items': v[2], 'creado_en': _fecha(v[3]),
                       'creado_por': v[4] or '', 'vigente': bool(v[5]), 'retirado_en': _fecha(v[6])}
                      for v in versiones],
    })


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
            cur = conn.cursor()
            if not _es_admin(cur, obra):
                return _error('Solo un administrador de la obra cambia el itemizado.', 403, 'NOT_PROJECT_ADMIN')
            # Una carga por obra a la vez: el número de versión y «una sola vigente» no pueden
            # depender de quién llega antes a la consulta.
            cur.execute('SELECT pg_advisory_xact_lock(hashtextextended(%s, 0))', ('planilla_itemizado:' + obra,))
            cur.execute('SELECT version, huella FROM planilla_itemizados WHERE project_id = %s AND vigente', (obra,))
            actual = cur.fetchone()
            if actual and actual[1] == huella:
                conn.commit()
                return jsonify({'success': True, 'version': actual[0], 'sin_cambios': True, 'n_items': len(items)}), 200
            cur.execute('''UPDATE planilla_itemizados SET vigente = false, retirado_por = %s, retirado_en = now()
                            WHERE project_id = %s AND vigente''', (uid, obra))
            cur.execute('SELECT COALESCE(MAX(version), 0) + 1 FROM planilla_itemizados WHERE project_id = %s', (obra,))
            version = cur.fetchone()[0]
            cur.execute('''INSERT INTO planilla_itemizados
                               (project_id, version, archivo, hoja, columnas, items, n_items, huella, creado_por)
                           VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)''',
                        (obra, version, archivo, hoja, json.dumps(columnas), json.dumps(items, ensure_ascii=False),
                         len(items), huella, uid))
            conn.commit()
    except Exception as e:
        if _tabla_ausente(e):
            return _sin_tabla()
        raise
    return jsonify({'success': True, 'version': version, 'sin_cambios': False, 'n_items': len(items), 'huella': huella}), 201


@planilla_bp.route('/api/planilla/itemizado', methods=['DELETE'])
def quitar_itemizado():
    """Deja la obra sin itemizado vigente. La versión queda en el historial, no se borra."""
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
            if not _es_admin(cur, obra):
                return _error('Solo un administrador de la obra cambia el itemizado.', 403, 'NOT_PROJECT_ADMIN')
            cur.execute('SELECT pg_advisory_xact_lock(hashtextextended(%s, 0))', ('planilla_itemizado:' + obra,))
            cur.execute('''UPDATE planilla_itemizados SET vigente = false, retirado_por = %s, retirado_en = now()
                            WHERE project_id = %s AND vigente RETURNING version''', (uid, obra))
            fila = cur.fetchone()
            conn.commit()
    except Exception as e:
        if _tabla_ausente(e):
            return _sin_tabla()
        raise
    return jsonify({'success': True, 'retirada': fila[0] if fila else None})
