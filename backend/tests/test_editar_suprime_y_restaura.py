# -*- coding: utf-8 -*-
"""«EDITAR» SUPRIME Y RESTAURA (14-sep-2026, decisión del propietario).

Mandar a la papelera y restaurar pedían «Administrar» en la carpeta. Ahora basta «Editar»,
con una salvaguarda: una carpeta arrastra su subárbol, y con «Editar» en ella no basta si
dentro hay carpetas donde esa persona no llega a «Editar». Eliminar definitivamente no
cambia. Informe: docs/usuarios/03_EDITAR_SUPRIME_Y_RESTAURA.md. El recorrido contra
PostgreSQL, con ENFORCE y sesiones reales: `herramientas/ensayo_de_editar_suprime_y_restaura.py`.
"""
import pytest

import permiso_documental as pd

OBRA = 'obra-a'
EDITORA = {'id': 7, 'role': 'user', 'email': 'editora@obra.pe'}


class _CurSubarbol(object):
    """Doble: devuelve como carpetas del subárbol con regla las que se le indiquen."""

    def __init__(self, con_regla=()):
        self.con_regla = list(con_regla)
        self.sql = []
        self._filas = []

    def execute(self, sql, params=None):
        self.sql.append(' '.join(sql.split()))
        if 'WITH RECURSIVE subarbol' not in sql:
            raise AssertionError('consulta inesperada: %s' % sql)
        self._filas = [(c,) for c in self.con_regla]

    def fetchall(self):
        return list(self._filas)


@pytest.fixture
def permisos(monkeypatch):
    """Quién administra, con qué sujetos, y el nivel efectivo de cada carpeta, de mentira."""
    estado = {'admin': False, 'sujetos': {pd.USER: '7'}, 'niveles': {}, 'preguntas': []}
    monkeypatch.setattr(pd, 'contexto_de_permisos', lambda cur, usuario, obra: {
        'es_admin': estado['admin'], 'sujetos': estado['sujetos']})

    def efectivo(cur, usuario, obra, nodo, con_motivo=False, contexto=None):
        estado['preguntas'].append((nodo, contexto is not None))
        return estado['niveles'].get(nodo, 'edit')

    monkeypatch.setattr(pd, 'permiso_efectivo', efectivo)
    return estado


# ══ 1 · EL SUBÁRBOL ════════════════════════════════════════════════════════

def test_sin_reglas_por_debajo_la_carpeta_se_puede_suprimir(permisos):
    assert pd.subcarpetas_sin_nivel(_CurSubarbol(), EDITORA, OBRA, 'carpeta', 'edit') is False
    assert permisos['preguntas'] == []


def test_una_subcarpeta_restringida_o_de_solo_ver_lo_impide(permisos):
    for nivel in ('none', 'viewer', 'view_download', 'view_markup'):
        permisos['niveles'] = {'privada': nivel}
        assert pd.subcarpetas_sin_nivel(_CurSubarbol(['privada']), EDITORA, OBRA, 'carpeta', 'edit') is True, nivel


def test_una_subcarpeta_con_editar_o_administrar_no_lo_impide(permisos):
    permisos['niveles'] = {'a': 'edit', 'b': 'admin'}
    assert pd.subcarpetas_sin_nivel(_CurSubarbol(['a', 'b']), EDITORA, OBRA, 'carpeta', 'edit') is False
    assert [n for n, _c in permisos['preguntas']] == ['a', 'b']
    assert all(con_contexto for _n, con_contexto in permisos['preguntas']), 'el contexto se calcula una vez'


def test_quien_administra_la_obra_no_tiene_subarbol_protegido(permisos):
    permisos['admin'] = True
    cur = _CurSubarbol(['privada'])
    assert pd.subcarpetas_sin_nivel(cur, EDITORA, OBRA, 'carpeta', 'edit') is False
    assert cur.sql == [], 'ni se consulta'


def test_sin_identidad_no_se_suprime_nada(permisos):
    permisos['sujetos'] = {}
    assert pd.subcarpetas_sin_nivel(_CurSubarbol(), {'role': 'user'}, OBRA, 'carpeta', 'edit') is True


def test_la_consulta_mira_solo_por_debajo_y_con_los_sujetos_de_la_persona(permisos):
    cur = _CurSubarbol()
    pd.subcarpetas_sin_nivel(cur, EDITORA, OBRA, 'carpeta', 'edit')
    assert 's.salto > 0' in cur.sql[0], 'la carpeta misma la comprueba quien llama'
    assert 'fp.sujeto_tipo' in cur.sql[0] and 's.salto <' in cur.sql[0]


# ══ 2 · LAS RUTAS ══════════════════════════════════════════════════════════

@pytest.fixture
def ruta(monkeypatch):
    """Las rutas reales sobre una app mínima: sesión, base y ficheros sustituidos."""
    from flask import Flask, g
    monkeypatch.setenv('APP_SECRET', 'secreto-de-prueba')
    import db
    import file_system_db as fsd
    import routes.documents as rd
    estado = {'pedidos': [], 'protegido': False, 'tipo': 'FOLDER', 'suprimidos': [], 'restaurados': []}

    def comprobar(usuario, nodo, obra, nivel, accion='esta acción'):
        estado['pedidos'].append((accion, nivel))
        return None

    monkeypatch.setattr(rd, 'verify_project_access', lambda usuario, obra: True)
    monkeypatch.setattr(rd, 'check_folder_permission', comprobar)
    monkeypatch.setattr(pd, 'subcarpetas_sin_nivel', lambda cur, u, obra, nodo, minimo='edit': estado['protegido'])
    monkeypatch.setattr(fsd, 'soft_delete_node',
                        lambda nodo, obra, performed_by=None, reason=None: estado['suprimidos'].append(nodo) or True)
    monkeypatch.setattr(fsd, 'restore_node', lambda obra, nodo: estado['restaurados'].append(nodo) or True)
    monkeypatch.setattr(db, 'log_activity', lambda *a, **k: None)

    class _Cur(object):
        def execute(self, sql, params=None):
            self._fila = (estado['tipo'], 'Planos') if 'SELECT node_type, name FROM file_nodes' in sql else None

        def fetchone(self):
            return self._fila

    class _Conn(object):
        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

        def cursor(self):
            return _Cur()

    monkeypatch.setattr(db, 'get_db_connection', lambda: _Conn())
    app = Flask(__name__)

    @app.before_request
    def _sesion():
        g.current_user = dict(EDITORA)

    app.register_blueprint(rd.documents_bp)
    return {'cli': app.test_client(), 'estado': estado}


def _suprimir(m, nodo='n1'):
    return m['cli'].delete('/api/docs/delete', json={'fullName': 'obra-a/Planos/', 'id': nodo, 'model_urn': OBRA})


def _restaurar(m, nodo='n1'):
    return m['cli'].post('/api/docs/restore', json={'id': nodo, 'model_urn': OBRA})


def test_suprimir_pide_editar_y_no_administrar(ruta):
    r = _suprimir(ruta)
    assert r.status_code == 200, r.get_json()
    assert ('suprimir archivos', 'edit') in ruta['estado']['pedidos']
    assert all(nivel != 'admin' for _a, nivel in ruta['estado']['pedidos'])
    assert ruta['estado']['suprimidos'] == ['n1']


def test_restaurar_pide_editar_y_no_administrar(ruta):
    r = _restaurar(ruta)
    assert r.status_code == 200, r.get_json()
    assert ('restaurar elementos', 'edit') in ruta['estado']['pedidos']
    assert ruta['estado']['restaurados'] == ['n1']


def test_una_carpeta_con_subcarpetas_sin_editar_no_se_suprime_ni_se_restaura(ruta):
    ruta['estado']['protegido'] = True
    for r in (_suprimir(ruta), _restaurar(ruta)):
        cuerpo = r.get_json()
        assert r.status_code == 403 and cuerpo['code'] == 'SUBCARPETAS_SIN_PERMISO', cuerpo
        assert '«Planos»' in cuerpo['error'] and 'Editar' in cuerpo['error']
    assert ruta['estado']['suprimidos'] == [] and ruta['estado']['restaurados'] == []


def test_un_documento_no_tiene_subarbol(ruta):
    ruta['estado']['protegido'] = True            # daría igual: a un documento no se le pregunta
    ruta['estado']['tipo'] = 'FILE'
    assert _suprimir(ruta, 'n2').status_code == 200
    assert ruta['estado']['suprimidos'] == ['n2']


def test_si_no_se_puede_comprobar_el_subarbol_no_se_suprime(ruta, monkeypatch):
    import db

    def rota():
        raise RuntimeError('sin base')

    monkeypatch.setattr(db, 'get_db_connection', rota)
    r = _suprimir(ruta)
    assert r.status_code == 503 and r.get_json()['code'] == 'SUBARBOL_SIN_COMPROBAR'
    assert ruta['estado']['suprimidos'] == []


def test_eliminar_definitivamente_sigue_siendo_solo_de_administradores(ruta):
    r = ruta['cli'].delete('/api/docs/permanent-delete', json={'id': 'n1', 'model_urn': OBRA})
    assert r.status_code == 403


def test_el_lote_suprime_con_editar_y_respeta_el_subarbol(ruta, monkeypatch):
    import db
    import routes.documents as rd
    con_nivel = {'doc-a', 'carpeta-libre', 'carpeta-protegida'}

    def comprobar(usuario, nodo, obra, nivel, accion='esta acción'):
        ruta['estado']['pedidos'].append((accion, nivel))
        return None if nodo in con_nivel else ('sin permiso', 403)

    monkeypatch.setattr(rd, 'check_folder_permission', comprobar)
    monkeypatch.setattr(pd, 'subcarpetas_sin_nivel',
                        lambda cur, u, obra, nodo, minimo='edit': nodo == 'carpeta-protegida')
    escrito = {}

    class _Cur(object):
        def execute(self, sql, params=None):
            texto = ' '.join(sql.split())
            self._uno, self._todos = None, []
            if texto.startswith('SELECT role FROM users'):
                self._uno = ('user',)
            elif "node_type = 'FOLDER'" in texto:
                self._todos = [('carpeta-libre',), ('carpeta-protegida',)]
            elif texto.startswith('UPDATE file_nodes'):
                escrito['suprimidos'] = list(params[0])

        def fetchone(self):
            return self._uno

        def fetchall(self):
            return self._todos

    class _Conn(object):
        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

        def cursor(self):
            return _Cur()

        def commit(self):
            pass

        def rollback(self):
            pass

    monkeypatch.setattr(db, 'get_db_connection', lambda: _Conn())
    r = ruta['cli'].post('/api/docs/batch', json={
        'items': ['doc-a', 'doc-ajeno', 'carpeta-libre', 'carpeta-protegida'],
        'action': 'DELETE', 'model_urn': OBRA})
    cuerpo = r.get_json()
    assert r.status_code == 200, cuerpo
    assert escrito['suprimidos'] == ['doc-a', 'carpeta-libre']
    assert cuerpo['processed'] == 2 and cuerpo['sin_permiso'] == 2
    assert ('suprimir documentos', 'edit') in ruta['estado']['pedidos']
