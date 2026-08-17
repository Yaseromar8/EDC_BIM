# -*- coding: utf-8 -*-
"""API del plan de entrega de información (MIDP/TIDP).

Nace con la guardia de obra puesta en TODOS los manejadores, incluidos los de
lectura. El resto de la plataforma se escribió sin ella y ha costado un día
entero cerrarlo ruta por ruta; una familia nueva no puede repetir eso.
"""

from flask import Blueprint, request, jsonify, g

import plan_de_entrega as plan
from db import get_db_connection, log_activity
from perimetro_de_obra import guardia_de_obra
from politica import requiere_rol
from rate_limit import limite

plan_bp = Blueprint('plan_entregas', __name__)


def _autor():
    u = getattr(g, 'current_user', None) or {}
    return u.get('email') or u.get('name') or None


@plan_bp.route('/api/plan', methods=['GET'])
def listar_plan():
    """El plan de la obra, con el estado de cada compromiso."""
    model_urn = request.args.get('model_urn')
    negativa = guardia_de_obra(model_urn, 'consultar el plan de entrega')
    if negativa:
        return negativa
    tipo = request.args.get('tipo')
    try:
        with get_db_connection() as conn:
            cur = conn.cursor()
            filas = plan.listar(cur, model_urn, tipo)
            resumen = plan.resumen(cur, model_urn, tipo)
            # Los requisitos son la mitad del plan: sin ellos la pantalla es
            # una lista de codigos que no dice a nadie que tiene que producir.
            requisitos = plan.requisitos(cur, model_urn, tipo)
        return jsonify({'plan': filas, 'resumen': resumen,
                        'requisitos': requisitos}), 200
    except Exception as e:
        print(f'[plan] listar: {e}')
        return jsonify({'error': 'No se pudo leer el plan de entrega.'}), 500


@plan_bp.route('/api/plan/importar', methods=['POST'])
@limite("10 per hour")
def importar_plan():
    """Sube el MIDP/TIDP en Excel y lo mete en el ECD. NO toca ningún fichero."""
    model_urn = request.form.get('model_urn')
    negativa = guardia_de_obra(model_urn, 'importar el plan de entrega')
    if negativa:
        return negativa
    # Importar el plan reescribe lo que la obra se comprometio a entregar: no es
    # una operacion de cualquier miembro del equipo.
    u = getattr(g, 'current_user', None) or {}
    if u.get('role') not in ('admin', 'editor'):
        return jsonify({'error': 'Solo un administrador o editor puede importar el plan.'}), 403

    fichero = request.files.get('archivo')
    if not fichero or not fichero.filename:
        return jsonify({'error': 'Adjunta el Excel del MIDP o TIDP.'}), 400
    tipo = (request.form.get('tipo') or 'MIDP').upper()
    if tipo not in ('MIDP', 'TIDP'):
        return jsonify({'error': "tipo debe ser MIDP o TIDP."}), 400

    import os
    import tempfile
    ruta = None
    try:
        # openpyxl necesita un fichero en disco; se borra siempre, tambien si
        # la lectura revienta a mitad.
        with tempfile.NamedTemporaryFile(delete=False, suffix='.xlsx') as tmp:
            fichero.save(tmp.name)
            ruta = tmp.name

        # El lector de la plantilla de la Guia Nacional va PRIMERO, y no es un
        # detalle: el generico coge la primera «Fecha de Entrega», que en esta
        # plantilla es la de RIBA 3A y esta vacia -- el plan entraria entero sin
        # fechas -- y ademas no expande los rangos «004120@004145», con lo que
        # 36 filas del TIDP de PQT8 comprometerian 36 documentos en vez de 311.
        # El plan que cargaba este boton NO era el que dice el Excel.
        entregables = []
        try:
            from lector_plan_guia_nacional import leer as leer_guia
            entregables = leer_guia(ruta)
        except Exception as err:
            print(f'[plan] lector de la Guia Nacional no aplico: {err}')
        if not entregables:
            # Otras obras traen su MIDP en formatos mas sencillos.
            from cotejar_midp import leer_midp
            entregables = leer_midp(ruta)
        if not entregables:
            return jsonify({
                'error': 'No se reconocio ninguna fila. El fichero tiene que llevar la '
                         'columna "Identificación del contenedor" de la Guía Nacional BIM.'
            }), 400

        with get_db_connection() as conn:
            cur = conn.cursor()
            nuevos, actualizados = plan.importar(
                cur, model_urn, entregables, tipo=tipo,
                origen=fichero.filename, autor=_autor())
            conn.commit()

        log_activity(model_urn, 'importar_plan', 'plan', entity_name=fichero.filename,
                     performed_by=_autor(),
                     details={'tipo': tipo, 'nuevos': nuevos, 'actualizados': actualizados})
        return jsonify({'tipo': tipo, 'nuevos': nuevos, 'actualizados': actualizados,
                        'total': len(entregables)}), 200
    except Exception as e:
        print(f'[plan] importar: {e}')
        return jsonify({'error': f'No se pudo leer el fichero: {e}'}), 400
    finally:
        if ruta:
            try:
                os.unlink(ruta)
            except OSError:
                pass


@plan_bp.route('/api/plan/<int:plan_id>/vincular', methods=['POST'])
def vincular_compromiso(plan_id):
    """Ata un compromiso del plan a su documento del ECD."""
    d = request.get_json() or {}
    model_urn = d.get('model_urn')
    negativa = guardia_de_obra(model_urn, 'vincular un compromiso a su documento')
    if negativa:
        return negativa
    node_id = d.get('node_id')
    if not node_id:
        return jsonify({'error': 'Falta node_id.'}), 400
    try:
        with get_db_connection() as conn:
            cur = conn.cursor()
            ok = plan.vincular(cur, plan_id, node_id, _autor(), model_urn=model_urn)
            conn.commit()
        if not ok:
            # Puede ser que el documento sea de OTRA obra: plan.vincular lo
            # comprueba en el propio UPDATE. No se distingue el motivo.
            return jsonify({'error': 'No se pudo vincular: revisa que el documento '
                                     'exista y sea de esta obra.'}), 400
        log_activity(model_urn, 'vincular_compromiso', 'plan', entity_id=str(plan_id),
                     performed_by=_autor(), details={'node_id': str(node_id)})
        return jsonify({'vinculado': True}), 200
    except Exception as e:
        print(f'[plan] vincular: {e}')
        return jsonify({'error': 'No se pudo vincular.'}), 500


@plan_bp.route('/api/plan/<int:plan_id>/vincular', methods=['DELETE'])
def desvincular_compromiso(plan_id):
    model_urn = request.args.get('model_urn')
    negativa = guardia_de_obra(model_urn, 'deshacer el vinculo de un compromiso')
    if negativa:
        return negativa
    try:
        with get_db_connection() as conn:
            cur = conn.cursor()
            ok = plan.desvincular(cur, plan_id, _autor(), model_urn=model_urn)
            conn.commit()
        if ok:
            log_activity(model_urn, 'desvincular_compromiso', 'plan',
                         entity_id=str(plan_id), performed_by=_autor())
        return jsonify({'vinculado': False}), 200
    except Exception as e:
        print(f'[plan] desvincular: {e}')
        return jsonify({'error': 'No se pudo deshacer el vinculo.'}), 500


@plan_bp.route('/api/plan/sugerencias', methods=['GET'])
def sugerencias():
    """Compromisos cuyo código aparece en el nombre de un documento. NO vincula."""
    model_urn = request.args.get('model_urn')
    negativa = guardia_de_obra(model_urn, 'buscar vinculos posibles')
    if negativa:
        return negativa
    try:
        with get_db_connection() as conn:
            cur = conn.cursor()
            return jsonify({'sugerencias': plan.sugerir_vinculos(
                cur, model_urn, request.args.get('tipo'))}), 200
    except Exception as e:
        print(f'[plan] sugerencias: {e}')
        return jsonify({'error': 'No se pudieron calcular las sugerencias.'}), 500
