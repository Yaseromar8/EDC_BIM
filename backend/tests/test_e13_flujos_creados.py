# -*- coding: utf-8 -*-
"""E1.3 · FLUJOS CREADOS UTILIZABLES.

Lo que el propietario reporto el 14-sep-2026: «si se elige un flujo creado, salen
problemas». Siete causas, en docs/reviews/E1_3_FLUJOS_CREADOS_Y_RECHAZO.md. Aqui se
fijan las reglas puras, la forma del codigo y la ruta real con la base sustituida; el
recorrido contra PostgreSQL con ENFORCE esta en `herramientas/ensayo_de_flujos_creados.py`.
"""
import io
import os

import pytest

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _leer(rel):
    return io.open(os.path.join(RAIZ, rel), encoding='utf-8').read()


def _entre(fuente, desde, hasta):
    inicio = fuente.index(desde)
    return fuente[inicio:fuente.index(hasta, inicio + len(desde))]


class _Cur(object):
    """Doble de cursor con una obra de mentira: quien tiene que funcion y quien esta."""

    def __init__(self, funciones=None, activos=None, miembros=()):
        self.funciones = funciones or {}      # funcion -> [(id, name, email, empresa)]
        self.activos = activos or {}          # id -> (id, name, email)
        self.miembros = set(miembros)         # ids que pertenecen a la obra
        self._uno, self._todos = None, []

    def execute(self, sql, params=None):
        texto = ' '.join(sql.split())
        self._uno, self._todos = None, []
        if 'FROM project_users pu' in texto:                       # miembros_con_funcion
            self._todos = list(self.funciones.get(params[1], []))
        elif texto.startswith('SELECT id, name, email FROM users'):
            self._uno = self.activos.get(params[0])
        elif texto.startswith('SELECT 1 FROM project_users'):
            self._uno = (1,) if params[1] in self.miembros else None

    def fetchone(self):
        return self._uno

    def fetchall(self):
        return self._todos


ANA = (7, 'Ana Supervisora', 'ana@x', 'SUPERVISA SAC')
BETO = (9, 'Beto Supervisor', 'beto@x', 'SUPERVISA SAC')
LUIS = (4, 'Luis Jefe', 'luis@x')


def _obra(miembros=(7, 9, 4)):
    return _Cur(funciones={'SUPERVISION': [ANA, BETO]},
                activos={7: ANA[:3], 9: BETO[:3], 4: LUIS}, miembros=miembros)


FLUJO_POR_FUNCION = {'alcance': 'OBRA', 'activa': True, 'pasos': [
    {'etiqueta': 'Supervisión', 'decision': 'REVISA', 'funcion': 'SUPERVISION', 'dias': 3},
    {'etiqueta': 'Jefatura', 'decision': 'APRUEBA', 'user_id': 4},
]}


# ══ 1 · EL PLAZO Y LA PERSONA SE VALIDAN COMO EN EL ALTA ═══════════════════

def test_un_plazo_de_cero_dias_no_se_guarda():
    """El editor dejaba guardar 0 y el alta lo rechaza: el flujo no abria nada."""
    import plantillas_de_revision as plt
    base = {'etiqueta': 'x', 'decision': 'APRUEBA', 'user_id': 3}
    for malo in (0, '0', -1, 'pronto', True):
        assert plt.validar_pasos([dict(base, dias=malo)], plt.OBRA), malo
    for bueno in (1, '1', 30, None, ''):
        assert plt.validar_pasos([dict(base, dias=bueno)], plt.OBRA) is None, bueno


def test_el_plazo_de_la_plantilla_y_el_del_alta_dicen_lo_mismo():
    """Las dos reglas, leidas en la fuente: ninguna admite un plazo menor que 1."""
    assert 'int(dias) < 1' in _leer('plantillas_de_revision.py')
    assert "int(paso['dias']) <= 0" in _leer('routes/reviews.py')


def test_una_persona_que_no_es_un_id_no_se_guarda():
    import plantillas_de_revision as plt
    for malo in ('ana', True, -3):
        assert plt.validar_pasos([{'etiqueta': 'x', 'decision': 'APRUEBA', 'user_id': malo}],
                                 plt.OBRA), malo


# ══ 2 · RESOLVER: ELEGIR PERSONA SIN REVENTAR ══════════════════════════════

def test_con_varias_personas_pide_elegir_y_dice_quienes_son():
    import plantillas_de_revision as plt
    res = plt.resolver(_obra(), FLUJO_POR_FUNCION, 'obra-1')
    assert res.code == 'ELIGE_REVISOR' and res.pasos is None
    assert [c['id'] for c in res.opciones['0']] == [7, 9]
    assert 'paso 1' in res.error


def test_con_la_persona_elegida_salen_los_pasos_y_se_siguen_dando_las_opciones():
    """La pantalla necesita las opciones tambien despues de elegir, para poder cambiar."""
    import plantillas_de_revision as plt
    for eleccion in (9, '9'):
        res = plt.resolver(_obra(), FLUJO_POR_FUNCION, 'obra-1', {'0': eleccion})
        assert res.error is None, res.error
        assert [p['user_id'] for p in res.pasos] == [9, 4]
        assert res.pasos[0]['de_funcion'] == 'SUPERVISION' and res.pasos[0]['dias'] == 3
        assert [c['id'] for c in res.opciones['0']] == [7, 9]


def test_una_eleccion_mal_formada_es_un_error_claro_y_no_una_excepcion():
    import plantillas_de_revision as plt
    for elecciones in ({'0': 'ana'}, {'0': True}, {'0': 4}, {0: 12}, ['9'], 'ana'):
        res = plt.resolver(_obra(), FLUJO_POR_FUNCION, 'obra-1', elecciones)
        assert res.code == 'ELECCION_INVALIDA', (elecciones, res)
        assert res.pasos is None


def test_quien_ya_no_esta_en_la_obra_se_nombra():
    import plantillas_de_revision as plt
    res = plt.resolver(_obra(miembros=(7, 9)), FLUJO_POR_FUNCION, 'obra-1', {'0': 7})
    assert res.code == 'REVISOR_NO_MIEMBRO'
    assert 'Luis Jefe' in res.error and 'paso 2' in res.error


def test_un_id_de_persona_mal_guardado_en_la_plantilla_no_revienta():
    import plantillas_de_revision as plt
    molde = {'pasos': [{'etiqueta': 'x', 'decision': 'APRUEBA', 'user_id': 'ana'}]}
    assert plt.resolver(_obra(), molde, 'obra-1').code == 'REVISOR_INVALIDO'


# ══ 3 · EL LISTADO DICE QUE FLUJO NO SE PUEDE USAR, Y POR QUE ══════════════

def test_motivo_no_utilizable():
    import flujo_de_revision as flujo
    import plantillas_de_revision as plt
    obra = _obra()
    assert plt.motivo_no_utilizable(obra, FLUJO_POR_FUNCION, 'obra-1') is None, (
        'tener que elegir persona no hace inutilizable un flujo')

    # Un flujo viejo cuyo ultimo paso solo revisa: el mismo motivo que da el molde con
    # el contrato vigente, y bajo AUTORIDAD_TERMINAL ese motivo es que no cierra.
    viejo = dict(FLUJO_POR_FUNCION, pasos=[
        {'etiqueta': 'Jefatura', 'decision': 'APRUEBA', 'user_id': 4},
        {'etiqueta': 'Cierre', 'decision': 'REVISA', 'user_id': 4}])
    assert plt.motivo_no_utilizable(obra, viejo, 'obra-1') == plt.validar_pasos(
        viejo['pasos'], plt.OBRA)
    assert 'sólo revisa' in plt.validar_pasos(viejo['pasos'], plt.OBRA,
                                              contrato=flujo.AUTORIDAD_TERMINAL)

    cero = dict(FLUJO_POR_FUNCION, pasos=[dict(FLUJO_POR_FUNCION['pasos'][0], dias=0),
                                           FLUJO_POR_FUNCION['pasos'][1]])
    assert 'plazo' in plt.motivo_no_utilizable(obra, cero, 'obra-1')

    nadie = _Cur(activos={4: LUIS}, miembros=(4,))
    assert 'no hay nadie con esa función' in plt.motivo_no_utilizable(
        nadie, FLUJO_POR_FUNCION, 'obra-1')
    assert 'deshabilitada' in plt.motivo_no_utilizable(
        obra, dict(FLUJO_POR_FUNCION, activa=False), 'obra-1')


def test_el_listado_marca_cada_plantilla():
    fuente = _leer('routes/plantillas_revision.py')
    listar = _entre(fuente, 'def listar', '\n@plantillas_revision_bp.route')
    assert "p['utilizable'], p['motivo_no_utilizable'] = _utilizable_aqui(cur, p, obra)" in listar


def test_si_no_se_puede_comprobar_una_plantilla_no_se_marca_y_el_listado_sigue(monkeypatch):
    """Con SAVEPOINT: un fallo al comprobar una no deja el cursor inservible para las demas."""
    import routes.plantillas_revision as rutas
    sentencias = []

    class Cur(object):
        def execute(self, sql, params=None):
            sentencias.append(sql)

    def revienta(cur, plantilla, obra):
        raise RuntimeError('la base se cayo')

    monkeypatch.setattr(rutas.plt, 'motivo_no_utilizable', revienta)
    assert rutas._utilizable_aqui(Cur(), {'id': '4'}, 'obra-1') == (None, None)
    assert sentencias == ['SAVEPOINT utilizable_aqui', 'ROLLBACK TO SAVEPOINT utilizable_aqui']

    monkeypatch.setattr(rutas.plt, 'motivo_no_utilizable', lambda c, p, o: 'no se puede')
    del sentencias[:]
    assert rutas._utilizable_aqui(Cur(), {'id': '4'}, 'obra-1') == (False, 'no se puede')
    assert sentencias == ['SAVEPOINT utilizable_aqui', 'RELEASE SAVEPOINT utilizable_aqui']


def test_editar_una_plantilla_tambien_exige_personas_de_la_obra():
    fuente = _leer('routes/plantillas_revision.py')
    modificar = _entre(fuente, 'def modificar', '\n@plantillas_revision_bp.route')
    assert '_personas_fuera_de_la_obra(cur, obra, pasos)' in modificar
    assert (modificar.index('_personas_fuera_de_la_obra(')
            < modificar.index('UPDATE doc_review_plantillas'))
    crear = _entre(fuente, 'def crear', '\n# ── MODIFICAR')
    assert '_personas_fuera_de_la_obra(cur, obra, pasos)' in crear


def test_solo_un_nombre_repetido_se_anuncia_como_nombre_repetido():
    fuente = _leer('routes/plantillas_revision.py')
    for vista in ('def crear', 'def modificar'):
        cuerpo = fuente.split(vista)[1].split('\n@')[0]
        assert "getattr(e, 'pgcode', None) == '23505'" in cuerpo, vista
        assert 'NOMBRE_REPETIDO' in cuerpo, vista


# ══ 4 · LA VISTA PREVIA ES EL ALTA, PARADA ANTES DE ESCRIBIR ═══════════════

def test_la_vista_previa_es_la_misma_funcion_del_alta():
    fuente = _leer('routes/reviews.py')
    assert "@reviews_bp.route('/api/reviews/previsualizar', methods=['POST'])" in fuente
    vista = _entre(fuente, 'def previsualizar_alta', 'def create_review')
    assert 'return create_review(solo_comprobar=True)' in vista
    assert 'def create_review(solo_comprobar=False):' in fuente


def test_la_vista_previa_se_va_antes_de_la_primera_escritura():
    cuerpo = _entre(_leer('routes/reviews.py'), 'def create_review', 'def act_on_review')
    salida = cuerpo.index('if solo_comprobar:\n                return jsonify({"success": True, '
                          '"comprobado": True')
    for puerta in ('_puede_con_estos_documentos(', '_revision_independiente(u, steps)',
                   '_pasos_validos(', '_documentos_con_version_fijada(',
                   '_participantes_con_acceso('):
        assert cuerpo.index(puerta) < salida, puerta
    for escritura in ('INSERT INTO doc_reviews', '_empieza_el_turno(', 'registrar_actividad(',
                      'conn.commit()'):
        assert salida < cuerpo.index(escritura), escritura


def test_la_vista_previa_no_exige_titulo_ni_idoneidad_y_el_alta_si():
    cuerpo = _entre(_leer('routes/reviews.py'), 'def create_review', 'def act_on_review')
    assert "not (d.get('title') or solo_comprobar)" in cuerpo
    bloque = cuerpo[cuerpo.index('if not solo_comprobar:'):cuerpo.index('negado = _pasos_validos(')]
    assert 'validar_para(' in bloque


def test_la_plantilla_se_lee_dentro_de_un_try_y_un_id_malo_no_es_un_500():
    cuerpo = _entre(_leer('routes/reviews.py'), 'def create_review', 'def act_on_review')
    expansion = cuerpo[cuerpo.index("if d.get('plantilla_id') and not steps:"):
                       cuerpo.index("if (not d.get('model_urn')")]
    assert 'PLANTILLA_NO_LEIDA' in expansion and 'except Exception' in expansion
    assert expansion.index('try:') < expansion.index('plt.resolver(')
    assert 'PLANTILLA_NO_EXISTE' in expansion and 'ELECCION_INVALIDA' in expansion
    assert "int(d['plantilla_id'])" not in expansion


def test_un_error_del_servidor_en_el_alta_no_se_ensena_en_crudo():
    cuerpo = _entre(_leer('routes/reviews.py'), 'def create_review', 'def act_on_review')
    final = cuerpo[cuerpo.rindex('except Exception'):]
    assert 'str(e)' not in final and 'ERROR_DEL_SERVIDOR' in final


# ══ 5 · POR LA RUTA REAL, CON LA BASE SUSTITUIDA ═══════════════════════════
#
# Los mismos dobles que el motor de R01 (`test_r01_motor_por_contrato`): el blueprint
# real sobre Flask y una base que REGISTRA CADA SENTENCIA, para poder afirmar «no
# escribe nada» contando en vez de suponiendo.

from tests.test_r01_motor_por_contrato import (  # noqa: E402,F401  (`motor` es la fixture)
    DOC, OBRA, VERSION, escrituras, motor, paso)


@pytest.fixture
def ruta(motor, monkeypatch):
    """El motor de R01 con el control por obra en modo registro, DICHO AQUI.

    El doble no tiene base con la que resolver la obra: con ENFORCE encendido el
    middleware corta antes de llegar a la ruta (PROJECT_UNRESOLVED), igual para
    `/api/reviews` que para la vista previa. El motor de R01 lo da por apagado sin
    decirlo, y en la bateria completa no siempre lo esta: una prueba anterior lo deja
    encendido. El perimetro de esta ruta, con ENFORCE, se prueba contra PostgreSQL en
    `herramientas/ensayo_de_flujos_creados.py`.
    """
    import auth_middleware as am
    monkeypatch.setattr(am, 'ENFORCE_PROJECT_AUTHZ', False)
    return motor


def _pedir(m, ruta_http, pasos, extra):
    cuerpo = {'model_urn': OBRA, 'final_status': 'SHARED', 'steps': pasos,
              'items': [{'node_id': DOC, 'name': 'P-01.pdf', 'version_id': VERSION}]}
    cuerpo.update(extra)
    return m['cli'].post(ruta_http, json=cuerpo)


def _previa(m, pasos, **extra):
    return _pedir(m, '/api/reviews/previsualizar', pasos, extra)


def _alta(m, pasos, **extra):
    return _pedir(m, '/api/reviews', pasos, dict({'title': 'Revisión'}, **extra))


def test_la_vista_previa_comprueba_y_no_escribe_nada(ruta):
    estado = ruta['estado']
    r = _previa(ruta, [paso(1, 'REVISA'), paso(2, 'APRUEBA')])
    d = r.get_json()
    assert r.status_code == 200, d
    assert d['comprobado'] is True
    assert [p['user_id'] for p in d['pasos']] == [1, 2]
    assert escrituras(estado) == [] and estado['commits'] == 0
    assert not any(s.startswith(('INSERT', 'UPDATE', 'DELETE')) for s, _ in estado['sql'])


def test_la_vista_previa_y_el_alta_dan_la_misma_negativa(ruta):
    """Pasos sin `decision` bajo el contrato vigente: el mismo 400 y el mismo codigo."""
    pasos = [paso(1), paso(2)]
    previa, alta = _previa(ruta, pasos), _alta(ruta, pasos)
    assert previa.status_code == alta.status_code == 400
    assert previa.get_json()['code'] == alta.get_json()['code'] == 'PASO_SIN_DECISION'
    assert escrituras(ruta['estado']) == []


def test_la_vista_previa_no_exige_titulo_y_el_alta_si(ruta):
    pasos = [paso(1, 'REVISA'), paso(2, 'APRUEBA')]
    assert _previa(ruta, pasos).status_code == 200
    assert _alta(ruta, pasos, title='').status_code == 400
    assert escrituras(ruta['estado']) == []


def test_un_id_de_plantilla_o_unas_elecciones_mal_formados_no_son_un_500(ruta):
    r = _previa(ruta, [], plantilla_id='abc')
    assert r.status_code == 404 and r.get_json()['code'] == 'PLANTILLA_NO_EXISTE'
    r = _alta(ruta, [], plantilla_id='abc')
    assert r.status_code == 404 and r.get_json()['code'] == 'PLANTILLA_NO_EXISTE'
    r = _previa(ruta, [], plantilla_id='4', elecciones=['7'])
    assert r.status_code == 400 and r.get_json()['code'] == 'ELECCION_INVALIDA'


def test_si_no_se_puede_leer_la_plantilla_el_mensaje_se_entiende(ruta, monkeypatch):
    def base_caida():
        raise RuntimeError('server closed the connection unexpectedly')

    monkeypatch.setattr(ruta['rv'], 'get_db_connection', base_caida)
    for r in (_previa(ruta, [], plantilla_id='4'), _alta(ruta, [], plantilla_id='4')):
        d = r.get_json()
        assert r.status_code == 500 and d['code'] == 'PLANTILLA_NO_LEIDA', d
        assert 'server closed' not in d['error']
