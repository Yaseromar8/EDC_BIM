# -*- coding: utf-8 -*-
"""Quien firma una revision tiene que poder ver lo que firma.

GUARDIAS DE FUENTE Y PRUEBAS DE UNIDAD
--------------------------------------
El comportamiento contra PostgreSQL --actor sin acceso en paso intermedio y
final, altas y sustitucion hacia alguien sin acceso, perdida y recuperacion del
acceso, bandeja y correo-- se mide con la aplicacion real en
`herramientas/ensayo_de_version_y_visibilidad.py`.

Aqui se fija el SITIO y el ORDEN de cada puerta, que la regla vive en una sola
funcion del dominio, y que lo que se ensena o se envia falla CERRADO.
"""
import io
import os


def _leer(rel):
    raiz = os.path.join(os.path.dirname(__file__), '..')
    return io.open(os.path.join(raiz, rel), encoding='utf-8').read()


def _entre(fuente, desde, hasta):
    return fuente[fuente.index(desde):fuente.index(hasta)]


def _sangria(fuente, marca):
    i = fuente.index(marca)
    return i - (fuente.rindex('\n', 0, i) + 1)


class _Cur:
    """Doble de cursor: responde por PREFIJO de la sentencia normalizada."""

    def __init__(self, respuestas=None):
        self.respuestas = respuestas or {}
        self.sql = []
        self._r = None

    def execute(self, sql, params=None):
        s = ' '.join(sql.split())
        self.sql.append((s, params))
        self._r = None
        for prefijo, valor in self.respuestas.items():
            if s.startswith(prefijo):
                self._r = valor
                break

    def fetchone(self):
        if isinstance(self._r, list):
            return self._r[0] if self._r else None
        return self._r

    def fetchall(self):
        return self._r if isinstance(self._r, list) else []


# ── /act ──────────────────────────────────────────────────────────────────

def test_act_mira_el_acceso_despues_de_la_identidad_y_antes_de_escribir():
    cuerpo = _entre(_leer('routes/reviews.py'), 'def act_on_review', 'def reasignar_revisor')
    puerta = cuerpo.index('flujo.puede_consultar_la_revision(')
    assert cuerpo.index('flujo.puede_actuar(') < puerta < cuerpo.index('flujo.acto_permitido(')
    for efecto in ('entry = {', 'cerrar_los_de(', '_empieza_el_turno(', 'UPDATE doc_reviews'):
        assert puerta < cuerpo.index(efecto), efecto


def test_act_la_exige_para_aprobar_y_para_rechazar():
    """Misma sangria que la puerta de identidad: no vive dentro de un `if action`."""
    cuerpo = _entre(_leer('routes/reviews.py'), 'def act_on_review', 'def reasignar_revisor')
    assert (_sangria(cuerpo, 'if not flujo.puede_consultar_la_revision(')
            == _sangria(cuerpo, 'if not flujo.puede_actuar('))
    bloque = cuerpo[cuerpo.index('if not flujo.puede_consultar_la_revision('):
                    cuerpo.index('flujo.acto_permitido(')]
    assert 'SIN_PERMISO_DOCUMENTAL' in bloque and '403' in bloque
    # El mensaje no puede contar lo que se juzga.
    assert "rev['title']" not in bloque and "['items']" not in bloque.split('jsonify')[1]


# ── Altas y sustitucion ───────────────────────────────────────────────────

def test_el_alta_comprueba_a_las_personas_ya_resueltas_antes_de_crear_nada():
    cuerpo = _entre(_leer('routes/reviews.py'), 'def create_review', 'def act_on_review')
    puerta = cuerpo.index('_participantes_con_acceso(')
    # Despues de expandir la plantilla y de validar las versiones.
    assert cuerpo.index('steps = res.pasos') < puerta
    assert cuerpo.index('_documentos_con_version_fijada(') < puerta
    for efecto in ('INSERT INTO doc_reviews', '_empieza_el_turno(', 'registrar_actividad('):
        assert puerta < cuerpo.index(efecto), efecto


def test_la_sustitucion_exige_que_el_sustituto_pueda_consultar_los_documentos():
    fuente = _leer('routes/reviews.py')
    cuerpo = fuente[fuente.index('def reasignar_revisor'):]
    puerta = cuerpo.index('flujo.puede_consultar_la_revision(')
    assert cuerpo.index('REVISOR_FUERA_DE_LA_OBRA') < puerta
    for efecto in ('flujo.sustituir_revisor(', 'cerrar_los_de(', '_empieza_el_turno(',
                   'UPDATE doc_reviews'):
        assert puerta < cuerpo.index(efecto), efecto
    assert 'REVISOR_SIN_ACCESO_DOCUMENTAL' in cuerpo
    # Sigue siendo la via estrecha de siempre: administrador, bloqueada y motivo.
    for puerta_previa in ('SOLO_ADMIN', 'FALTA_MOTIVO', 'NO_ESTA_BLOQUEADA',
                          'REVISION_SIN_INDEPENDENCIA'):
        assert puerta_previa in cuerpo, puerta_previa


def test_la_comprobacion_no_se_traslada_al_crud_de_plantillas():
    """Una plantilla no tiene documentos: se evalua al aplicarla a una revision."""
    assert 'puede_consultar_la_revision' not in _leer('routes/plantillas_revision.py')
    assert 'puede_consultar_la_revision' not in _leer('plantillas_de_revision.py')


# ── Una sola regla, en el dominio ─────────────────────────────────────────

def test_la_regla_vive_en_el_dominio_y_ninguna_ruta_importa_otra():
    flujo = _leer('flujo_de_revision.py')
    assert 'def puede_consultar_la_revision' in flujo
    assert 'from routes' not in flujo and 'import routes' not in flujo
    fuente = _leer('routes/directorio.py')
    mi_trabajo = fuente[fuente.index('def mi_trabajo'):]
    assert 'routes.reviews' not in fuente
    assert 'encargos_presentables(' in mi_trabajo
    avisar = _entre(_leer('encargos.py'), 'def avisar', 'def usuario_por_email')
    assert 'texto_del_aviso(' in avisar
    assert 'from routes' not in avisar and 'import routes' not in avisar


def test_la_conciliacion_ve_los_items_para_saber_si_el_paso_esta_bloqueado():
    faltantes = _entre(_leer('encargos.py'), 'def _faltantes', '# RFI vivos')
    assert "'items': items" in faltantes


# ── BLOQUEADA por perdida de acceso ───────────────────────────────────────

def _rev(items):
    return {'status': 'pending', 'steps': [{'user_id': 7}], 'current_step': 0,
            '_project_id': 'obra', 'model_urn': 'urn', 'items': items}


def _cur_revisor_dentro():
    return _Cur({'SELECT id FROM users': (7,), 'SELECT 1 FROM project_users': (1,),
                 'SELECT id, email, name, role FROM users': (7, 'r@o.pe', 'R', 'editor')})


def test_perder_el_acceso_bloquea_el_paso_y_el_motivo_no_nombra_documentos(monkeypatch):
    import flujo_de_revision as flujo
    monkeypatch.setattr(flujo, 'puede_consultar_la_revision', lambda *a, **k: False)
    estado, motivo = flujo.estado_del_flujo(
        _cur_revisor_dentro(), _rev([{'node_id': 'n1', 'name': 'PLANO-SECRETO.pdf'}]))
    assert estado == 'BLOQUEADA'
    assert 'paso 1' in motivo and 'PLANO-SECRETO' not in motivo


def test_con_acceso_sigue_activa_y_sin_items_no_hay_nada_que_consultar(monkeypatch):
    import flujo_de_revision as flujo
    llamadas = []
    monkeypatch.setattr(flujo, 'puede_consultar_la_revision',
                        lambda *a, **k: llamadas.append(a) or True)
    assert flujo.estado_del_flujo(_cur_revisor_dentro(),
                                  _rev([{'node_id': 'n1'}]))[0] == 'ACTIVA'
    assert len(llamadas) == 1
    assert flujo.estado_del_flujo(_cur_revisor_dentro(), _rev([]))[0] == 'ACTIVA'
    assert len(llamadas) == 1


def test_sin_usuario_no_se_puede_consultar_nada():
    import flujo_de_revision as flujo
    assert flujo.puede_consultar_la_revision(_Cur(), None, 'urn', [{'node_id': 'n'}]) is False
    assert flujo.puede_consultar_la_revision(_Cur(), {}, 'urn', [{'node_id': 'n'}]) is False


# ── Lo que cuentan la bandeja y el correo ─────────────────────────────────

def test_el_asunto_neutro_no_lleva_nada_del_titulo():
    import flujo_de_revision as flujo
    assert (flujo.asunto_sin_acceso('123', 'Revisar: PLANO-SECRETO (paso 2)')
            == 'Revisión RV-123 · paso 2 · sin acceso a todos sus documentos')
    assert (flujo.asunto_sin_acceso(7, 'algo sin paso')
            == 'Revisión RV-007 · sin acceso a todos sus documentos')
    assert (flujo.asunto_sin_acceso(None, None)
            == 'Revisión · sin acceso a todos sus documentos')


def test_mi_trabajo_neutraliza_solo_lo_que_su_destinatario_no_puede_consultar(monkeypatch):
    import flujo_de_revision as flujo
    import permiso_documental as pd
    monkeypatch.setattr(pd, 'contexto_de_permisos',
                        lambda cur, u, urn: {'es_admin': False, 'sujetos': {}})
    monkeypatch.setattr(flujo, 'puede_consultar_la_revision',
                        lambda cur, u, urn, items, *a, **k: urn == 'urn_abierta')
    cur = _Cur({'SELECT id, model_urn, items FROM doc_reviews':
                [(1, 'urn_abierta', []), (2, 'urn_reservada', [])]})
    pendientes = [
        {'id': 10, 'objeto_tipo': 'REVIEW', 'objeto_id': '1', 'asunto': 'Revisar: Abierta (paso 1)'},
        {'id': 11, 'objeto_tipo': 'REVIEW', 'objeto_id': '2',
         'asunto': 'Revisar: PLANO-SECRETO (paso 2)'},
        {'id': 12, 'objeto_tipo': 'RFI', 'objeto_id': '5', 'asunto': 'Responder RFI 5'},
        {'id': 13, 'objeto_tipo': 'REVIEW', 'objeto_id': '99', 'asunto': 'Revisar: Borrada (paso 1)'},
    ]
    salida = flujo.encargos_presentables(cur, {'id': 4, 'role': 'editor'}, pendientes)
    assert [p['id'] for p in salida] == [10, 11, 12, 13]       # ningun encargo desaparece
    assert salida[0]['asunto'] == 'Revisar: Abierta (paso 1)'
    assert salida[1]['asunto'] == 'Revisión RV-002 · paso 2 · sin acceso a todos sus documentos'
    assert salida[2] == pendientes[2]
    assert 'Borrada' not in salida[3]['asunto']                # sin revision: cerrado
    assert 'PLANO-SECRETO' not in repr(salida)
    assert pendientes[1]['asunto'] == 'Revisar: PLANO-SECRETO (paso 2)'   # lo guardado, igual


def test_mi_trabajo_falla_cerrado_si_no_puede_comprobar(monkeypatch):
    import flujo_de_revision as flujo
    import permiso_documental as pd

    def revienta(*a, **k):
        raise RuntimeError('no se pudo comprobar')

    monkeypatch.setattr(pd, 'contexto_de_permisos', revienta)
    cur = _Cur({'SELECT id, model_urn, items FROM doc_reviews': [(2, 'urn', [])]})
    salida = flujo.encargos_presentables(cur, {'id': 4}, [
        {'id': 11, 'objeto_tipo': 'REVIEW', 'objeto_id': '2', 'asunto': 'Revisar: SECRETO (paso 1)'}])
    assert 'SECRETO' not in salida[0]['asunto']


def test_el_texto_del_aviso_se_decide_por_destinatario_y_falla_cerrado(monkeypatch):
    import flujo_de_revision as flujo
    asunto = 'Revisar: PLANO-SECRETO (paso 1)'
    cur = _Cur({'SELECT id, email, name, role FROM users': (4, 'd@o.pe', 'D', 'editor'),
                'SELECT model_urn, items FROM doc_reviews': ('urn', [])})
    monkeypatch.setattr(flujo, 'puede_consultar_la_revision', lambda *a, **k: True)
    assert flujo.texto_del_aviso(cur, '5', 4, asunto) == asunto
    monkeypatch.setattr(flujo, 'puede_consultar_la_revision', lambda *a, **k: False)
    assert 'PLANO-SECRETO' not in flujo.texto_del_aviso(cur, '5', 4, asunto)
    assert 'PLANO-SECRETO' not in flujo.texto_del_aviso(cur, '5', None, asunto)

    def revienta(*a, **k):
        raise RuntimeError('no se pudo comprobar')

    monkeypatch.setattr(flujo, 'puede_consultar_la_revision', revienta)
    assert 'PLANO-SECRETO' not in flujo.texto_del_aviso(cur, '5', 4, asunto)


def test_avisar_no_reutiliza_el_asunto_guardado_sin_comprobar(monkeypatch):
    import encargos as enc
    import flujo_de_revision as flujo
    import mailer
    enviados = []
    monkeypatch.setattr(mailer, 'enviar', lambda correo, asunto, titulo, cuerpo, **k:
                        enviados.append((correo, asunto, titulo, cuerpo)) or (True, ''))
    monkeypatch.setattr(flujo, 'puede_consultar_la_revision', lambda *a, **k: False)
    cur = _Cur({
        'SELECT project_id, asunto, destino_usuario, destino_funcion,':
            ('obra', 'Revisar: PLANO-SECRETO (paso 1)', 4, None, 'REVIEW', None, None, '5'),
        'SELECT email FROM users': ('d@o.pe',),
        'SELECT id, email, name, role FROM users': (4, 'd@o.pe', 'D', 'editor'),
        'SELECT model_urn, items FROM doc_reviews': ('urn', []),
    })
    assert enc.avisar(cur, 1) == 1
    assert len(enviados) == 1
    assert 'PLANO-SECRETO' not in repr(enviados)
    assert enviados[0][3].startswith('Revisión RV-005 · paso 1')
