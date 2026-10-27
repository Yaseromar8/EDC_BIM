# -*- coding: utf-8 -*-
"""Criterios de medida de la obra para la Planilla del visor (sql/41, routes/planilla.py,
planilla_criterios_medida.py, docs/visor/32).

Se fija:
  1. la validación: las mismas reglas que el visor (unidad medible, parámetros en orden, sin
     duplicados con o sin ceros a la izquierda), y lo inválido se rechaza diciendo por qué;
  2. la seguridad: obra resuelta en el servidor, miembros leen, solo el administrador de la obra cambia;
  3. las versiones: una sola vigente, el mismo juego no crea otra, quitar uno = otra versión.
No conecta a una base real: una tabla de juguete entiende las sentencias de la ruta.
"""
import contextlib
import json

import pytest
from flask import Flask, g, jsonify

import planilla_criterios_medida as pcm
import routes.planilla as rp


CRITERIOS = [
    {'unidad': 'm', 'partida': '01.02', 'medirCon': ['Cotas::Long. Reja']},
    {'unidad': 'M3', 'medirCon': ['Qto_WallBaseQuantities::NetVolume']},
    {'unidad': 'm²', 'donde': {'campo': 'Datos de identidad::Nombre de tipo', 'op': 'contiene', 'valor': 'Encofrado'},
     'medirCon': ['Otros::Área de encofrado', '  Otros::Área de encofrado ']},
]


# ── 1. Validación ───────────────────────────────────────────────────────────────────────────

def test_normaliza_unidad_y_parametros_y_conserva_el_orden():
    n = pcm.validar_criterios(CRITERIOS)
    assert [c['unidad'] for c in n] == ['m', 'm³', 'm²']
    assert n[2]['medirCon'] == ['Otros::Área de encofrado'], 'sin repetir, sin espacios'
    assert 'partida' not in n[1] and 'donde' not in n[0]


def test_una_lista_vacia_es_una_obra_sin_criterios():
    assert pcm.validar_criterios([]) == []


@pytest.mark.parametrize('criterios, codigo', [
    (None, 'CRITERIOS_INVALIDOS'),
    ([{'unidad': 'und', 'medirCon': ['a::b']}], 'UNIDAD_NO_MEDIBLE'),
    ([{'unidad': 'm', 'medirCon': []}], 'SIN_PARAMETRO'),
    ([{'unidad': 'm', 'medirCon': ['', ' ']}], 'CRITERIO_INVALIDO'),
    ([{'unidad': 'm', 'medirCon': [f'g::{i}' for i in range(6)]}], 'CRITERIO_INVALIDO'),
    ([{'unidad': 'm', 'medirCon': ['a::b'], 'donde': {'campo': 'x', 'op': 'parece', 'valor': 'y'}}], 'CRITERIO_INVALIDO'),
    ([{'unidad': 'm', 'medirCon': ['a::b'], 'donde': {'campo': 'x', 'op': 'es', 'valor': ''}}], 'CRITERIO_INVALIDO'),
    ([{'unidad': 'm', 'medirCon': ['x' * (pcm.MAX_CLAVE + 1)]}], 'CRITERIO_INVALIDO'),
    (['m'], 'CRITERIO_INVALIDO'),
])
def test_rechaza_lo_invalido_con_su_codigo(criterios, codigo):
    with pytest.raises(pcm.CriteriosInvalidos) as e:
        pcm.validar_criterios(criterios)
    assert e.value.codigo == codigo


def test_dos_criterios_iguales_se_rechazan_aunque_el_codigo_venga_con_o_sin_ceros():
    with pytest.raises(pcm.CriteriosInvalidos) as e:
        pcm.validar_criterios([{'unidad': 'm', 'partida': '01.02', 'medirCon': ['a::b']},
                               {'unidad': 'ml', 'partida': '1.2', 'medirCon': ['c::d']}])
    assert e.value.codigo == 'CRITERIO_REPETIDO' and e.value.detalle == [0, 1]
    # La misma partida con otra condición, u otra unidad, sí convive.
    assert len(pcm.validar_criterios([
        {'unidad': 'm', 'partida': '01.02', 'medirCon': ['a::b']},
        {'unidad': 'm', 'partida': '01.02', 'donde': {'campo': 'x', 'op': 'es', 'valor': 'y'}, 'medirCon': ['a::b']},
        {'unidad': 'm²', 'partida': '01.02', 'medirCon': ['a::b']},
    ])) == 3


def test_las_reglas_son_las_del_visor():
    assert pcm.normalizar_codigo('02.01.01.04') == pcm.normalizar_codigo('2.1.1.4') == '2.1.1.4'
    assert pcm.compacto('SP.1.2_MALLA  Ñandú') == 'sp12mallanandu'
    assert [pcm.normalizar_unidad(u) for u in ('ml', 'M2', 'm^3', 'Kg', 'und', '')] == ['m', 'm²', 'm³', 'kg', '', '']


def test_a_mano_se_guarda_solo_si_es_un_booleano_verdadero():
    n = pcm.validar_criterios([{'unidad': 'm', 'partida': '08.01', 'medirCon': ['Datos::02_02_DSI_Longitud'], 'aMano': True},
                               {'unidad': 'm', 'partida': '08.02', 'medirCon': ['a::b'], 'aMano': False}])
    assert n[0]['aMano'] is True and 'aMano' not in n[1]
    with pytest.raises(pcm.CriteriosInvalidos):
        pcm.validar_criterios([{'unidad': 'm', 'medirCon': ['a::b'], 'aMano': 'si'}])


def test_el_factor_se_guarda_si_no_es_1_y_se_valida():
    n = pcm.validar_criterios([{'unidad': 'm', 'partida': '2.1.2.2.1', 'medirCon': ['Cotas::SYP_PARAMETRO GLOBAL'], 'factor': 0.5},
                               {'unidad': 'm', 'partida': '2.1.2.2.2', 'medirCon': ['a::b'], 'factor': 1}])
    assert n[0]['factor'] == 0.5 and 'factor' not in n[1]
    for malo in (0, -1, 1001, 'medio', True):
        with pytest.raises(pcm.CriteriosInvalidos):
            pcm.validar_criterios([{'unidad': 'm', 'medirCon': ['a::b'], 'factor': malo}])


def test_demasiados_criterios():
    with pytest.raises(pcm.CriteriosInvalidos) as e:
        pcm.validar_criterios([{'unidad': 'm', 'partida': str(i), 'medirCon': ['a::b']} for i in range(pcm.MAX_CRITERIOS + 1)])
    assert e.value.codigo == 'DEMASIADOS_CRITERIOS'


def test_la_huella_es_la_del_juego_normalizado():
    a = pcm.huella(pcm.validar_criterios(CRITERIOS))
    b = pcm.huella(pcm.validar_criterios([dict(c) for c in CRITERIOS]))
    assert a == b and len(a) == 64 and pcm.huella(pcm.validar_criterios(CRITERIOS[:1])) != a


# ── 2 y 3. Rutas, con una tabla de juguete ──────────────────────────────────────────────────

class Tabla:
    """planilla_criterios_medida en memoria; entiende las sentencias de routes/planilla.py."""

    def __init__(self, existe=True):
        self.existe, self.filas, self.locks = existe, [], []

    def conexion(self):
        return contextlib.nullcontext(Conn(self))


class Cursor:
    def __init__(self, t):
        self.t, self.res = t, []

    def execute(self, sql, params=()):
        s = ' '.join(sql.split())
        if 'planilla_criterios_medida' in s and not self.t.existe:
            raise RuntimeError('relation "planilla_criterios_medida" does not exist')
        if s.startswith('SELECT pg_advisory_xact_lock'):
            self.t.locks.append(params[0]); self.res = [(None,)]
        elif s.startswith('SELECT c.version, c.criterios'):
            v = [f for f in self.t.filas if f['project_id'] == params[0] and f['vigente']]
            self.res = [(f['version'], f['criterios'], f['n'], f['huella'], None, 'Ana') for f in v]
        elif s.startswith('SELECT c.version, c.n_criterios'):
            v = sorted((f for f in self.t.filas if f['project_id'] == params[0]), key=lambda f: -f['version'])[:params[1]]
            self.res = [(f['version'], f['n'], None, 'Ana', f['vigente']) for f in v]
        elif s.startswith('SELECT version, huella FROM planilla_criterios_medida'):
            self.res = [(f['version'], f['huella']) for f in self.t.filas if f['project_id'] == params[0] and f['vigente']]
        elif s.startswith('UPDATE planilla_criterios_medida SET vigente = false'):
            uid, obra = params
            for f in self.t.filas:
                if f['project_id'] == obra and f['vigente']:
                    f.update(vigente=False, retirado_por=uid)
            self.res = []
        elif s.startswith('SELECT COALESCE(MAX(version), 0) + 1'):
            self.res = [(max([f['version'] for f in self.t.filas if f['project_id'] == params[0]], default=0) + 1,)]
        elif s.startswith('INSERT INTO planilla_criterios_medida'):
            obra, version, criterios, n, huella, uid = params
            assert not any(f['project_id'] == obra and f['vigente'] for f in self.t.filas), 'dos vigentes'
            self.t.filas.append({'project_id': obra, 'version': version, 'criterios': json.loads(criterios), 'n': n,
                                 'huella': huella, 'creado_por': uid, 'vigente': True})
            self.res = []
        else:
            raise AssertionError(s)

    def fetchone(self):
        return self.res[0] if self.res else None

    def fetchall(self):
        return list(self.res)


class Conn:
    def __init__(self, t):
        self.t = t

    def cursor(self):
        return Cursor(self.t)

    def commit(self):
        pass


@pytest.fixture
def entorno(monkeypatch):
    t = Tabla()
    estado = {'miembro': True, 'admin': True, 'usuario': {'id': 7, 'name': 'Ana'}}
    app = Flask(__name__)
    app.register_blueprint(rp.planilla_bp)
    app.before_request(lambda: setattr(g, 'current_user', estado['usuario']))
    monkeypatch.setattr(rp, 'get_db_connection', t.conexion)
    monkeypatch.setattr(rp, 'resolve_project_id', lambda v: {'OBRA_A_FRENTE1': 'A', 'OBRA_A_FRENTE2': 'A', 'OBRA_B': 'B'}.get(v))
    monkeypatch.setattr(rp, 'guardia_de_obra', lambda valor, accion='':
                        None if estado['miembro'] else (jsonify({'error': 'Sin acceso', 'code': 'PROJECT_FORBIDDEN'}), 403))
    monkeypatch.setattr(rp, '_es_admin', lambda cur, obra: estado['admin'])
    return app.test_client(), t, estado


RUTA = '/api/planilla/criterios-medida'


def _guardar(cli, criterios=CRITERIOS, project='OBRA_A_FRENTE1'):
    return cli.post(RUTA, json={'project': project, 'criterios': criterios})


def test_sin_criterios_la_obra_responde_vacio(entorno):
    cli, _, _ = entorno
    r = cli.get(RUTA + '?project=OBRA_A_FRENTE1')
    assert r.status_code == 200 and r.get_json()['vigente'] is None and r.get_json()['puede_editar'] is True


def test_guardar_crea_la_version_1_de_la_obra_y_otro_frente_la_ve(entorno):
    cli, t, _ = entorno
    r = _guardar(cli)
    assert r.status_code == 201 and r.get_json()['version'] == 1 and r.get_json()['n_criterios'] == 3
    assert t.filas[0]['project_id'] == 'A' and t.filas[0]['criterios'][1]['unidad'] == 'm³', 'se guarda normalizado'
    assert t.locks == ['planilla_criterios_medida:A']
    v = cli.get(RUTA + '?project=OBRA_A_FRENTE2').get_json()['vigente']
    assert v['version'] == 1 and len(v['criterios']) == 3 and v['creado_por'] == 'Ana'


def test_el_mismo_juego_no_crea_otra_version_y_quitar_uno_si(entorno):
    cli, t, _ = entorno
    _guardar(cli)
    r = _guardar(cli, criterios=[dict(c) for c in CRITERIOS])
    assert r.status_code == 200 and r.get_json()['sin_cambios'] is True and len(t.filas) == 1
    r = _guardar(cli, criterios=CRITERIOS[1:])
    assert r.status_code == 201 and r.get_json()['version'] == 2
    assert [f['vigente'] for f in t.filas] == [False, True] and t.filas[0]['retirado_por'] == 7
    j = cli.get(RUTA + '?project=OBRA_A_FRENTE1').get_json()
    assert [v['version'] for v in j['versiones']] == [2, 1]


def test_quitarlos_todos_es_otra_version_vacia_y_sin_criterios_no_crea_nada(entorno):
    cli, t, _ = entorno
    r = _guardar(cli, criterios=[])
    assert r.status_code == 200 and r.get_json()['sin_cambios'] is True and t.filas == []
    _guardar(cli)
    r = _guardar(cli, criterios=[])
    assert r.status_code == 201 and t.filas[-1]['n'] == 0 and t.filas[-1]['vigente']


def test_seguridad_miembro_admin_y_obra(entorno):
    cli, t, estado = entorno
    estado['miembro'] = False
    assert cli.get(RUTA + '?project=OBRA_A_FRENTE1').status_code == 403 and _guardar(cli).status_code == 403
    estado['miembro'] = True
    estado['admin'] = False
    assert cli.get(RUTA + '?project=OBRA_A_FRENTE1').get_json()['puede_editar'] is False
    r = _guardar(cli)
    assert r.status_code == 403 and r.get_json()['code'] == 'NOT_PROJECT_ADMIN'
    estado['admin'] = True
    r = _guardar(cli, project='global')
    assert r.status_code == 403 and r.get_json()['code'] == 'PROJECT_UNRESOLVED'
    assert t.filas == []


def test_las_obras_no_se_mezclan(entorno):
    cli, t, _ = entorno
    _guardar(cli)
    _guardar(cli, project='OBRA_B', criterios=CRITERIOS[:1])
    assert sorted((f['project_id'], f['version']) for f in t.filas) == [('A', 1), ('B', 1)]
    assert cli.get(RUTA + '?project=OBRA_B').get_json()['vigente']['n_criterios'] == 1


def test_lo_invalido_se_rechaza_sin_tocar_la_base(entorno):
    cli, t, _ = entorno
    r = _guardar(cli, criterios=CRITERIOS + [{'unidad': 'ml', 'partida': '1.2', 'medirCon': ['x::y']}])
    assert r.status_code == 400 and r.get_json()['code'] == 'CRITERIO_REPETIDO'
    assert cli.post(RUTA, data='no es json', content_type='application/json').status_code == 400
    assert t.filas == []


def test_una_sesion_sin_id_numerico_guarda_sin_autor_y_nunca_responde_401(entorno):
    cli, t, estado = entorno
    estado['usuario'] = {'id': 'demo', 'name': 'Demo User'}
    r = _guardar(cli)
    assert r.status_code == 201 and t.filas[0]['creado_por'] is None


def test_sin_la_migracion_41_se_dice_cual_falta(entorno):
    cli, t, _ = entorno
    t.existe = False
    for r in (cli.get(RUTA + '?project=OBRA_A_FRENTE1'), _guardar(cli)):
        assert r.status_code == 503 and r.get_json()['code'] == 'MIGRATION_MISSING' and '41' in r.get_json()['error']


def test_la_migracion_41_y_esquema_base_crean_la_misma_tabla_con_una_sola_vigente():
    import io
    import os
    import re
    raiz = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    mig = io.open(os.path.join(raiz, 'sql', '41_planilla_criterios_medida.sql'), encoding='utf-8').read()
    rollback = io.open(os.path.join(raiz, 'sql', '41_planilla_criterios_medida_rollback.sql'), encoding='utf-8').read()
    import esquema_base
    base = dict(esquema_base.TABLAS)['planilla_criterios_medida']
    columnas = lambda sql: set(re.findall(r'^\s*"?(\w+)"?\s+(?:BIGSERIAL|TEXT|INTEGER|JSONB|BOOLEAN|TIMESTAMP)', sql, re.M | re.I))
    assert columnas(mig) == columnas(base) and 'criterios' in columnas(mig)
    for sql in (mig, base):
        assert re.search(r'UNIQUE INDEX IF NOT EXISTS uq_planilla_criterios_medida_vigente\s+ON planilla_criterios_medida \(project_id\) WHERE vigente', sql)
    assert "current_user <> 'ecd_migrator'" in mig and "current_user <> 'ecd_migrator'" in rollback
    assert 'DROP TABLE IF EXISTS planilla_criterios_medida' in rollback and 'DROP' not in mig
    assert 'GRANT SELECT, INSERT, UPDATE ON planilla_criterios_medida TO ecd_app' in mig and 'DELETE' not in mig.split('GRANT')[1]
