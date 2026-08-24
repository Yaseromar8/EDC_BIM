# -*- coding: utf-8 -*-
"""CAPA 08 · MEMBER TOOL ACCESS — quién entra a una herramienta habilitada.

    Dentro de una herramienta HABILITADA, ¿ESTE MIEMBRO puede entrar?

El caso real que la capa hace posible:

    miembro A   Docs ✅ · Reviews ✅ · RFI ✅ · Red Lines ❌ · Transmittals ✅

Y las DOS direcciones del invariante, que son el motivo de que la capa
exista separada — probadas, no afirmadas:

    · una carpeta con permiso `edit` NO da acceso a una herramienta que el
      miembro no tiene: el permiso de recurso vive DENTRO y no se alcanza
      sin haber entrado;
    · tener acceso a una herramienta NO concede ni un solo recurso.

Y el orden completo, que no se puede saltar:

    MEMBRESÍA → ACTIVACIÓN (16) → ACCESO DEL MIEMBRO (08) → RECURSO (09)
"""
import importlib

import pytest
from flask import Flask, jsonify

OBRA = 'b.proj_prueba'


# ── El estado: la fila es la EXCEPCIÓN ──────────────────────────────────────

class _Cur:
    def __init__(self, filas=None, revienta=False):
        self._filas = filas or []
        self._revienta = revienta
    def execute(self, sql, params=None):
        if self._revienta:
            raise RuntimeError('member_tool_access no existe')
    def fetchall(self):
        return self._filas


def test_sin_filas_el_miembro_alcanza_las_herramientas_de_su_obra():
    """La puerta fail-closed es la MEMBRESÍA, ya comprobada antes. Esta capa
    RESTRINGE dentro de una pertenencia concedida: su acto explícito es
    quitar. Si el defecto fuera denegar, desplegarla habría sido un apagón."""
    import acceso_a_herramientas as ath
    import herramientas_de_obra as hdo
    estado = ath.estado_de_miembro(_Cur(), OBRA, 7)
    assert set(estado) == set(hdo.CODIGOS)
    assert all(estado.values())


def test_la_retirada_se_lee_en_la_base():
    import acceso_a_herramientas as ath
    estado = ath.estado_de_miembro(_Cur([('redlines', False)]), OBRA, 7)
    assert estado['redlines'] is False
    assert estado['rfi'] is True and estado['reviews'] is True


def test_el_caso_del_enunciado():
    """miembro A: Docs ✅ Reviews ✅ RFI ✅ Red Lines ❌ Transmittals ✅"""
    import acceso_a_herramientas as ath
    e = ath.estado_de_miembro(_Cur([('redlines', False)]), OBRA, 7)
    assert (e['reviews'], e['rfi'], e['redlines'], e['transmittals']) == \
           (True, True, False, True)


def test_si_la_tabla_no_existe_el_miembro_no_queda_fuera():
    import acceso_a_herramientas as ath
    assert all(ath.estado_de_miembro(_Cur(revienta=True), OBRA, 7).values())


def test_sin_identidad_numerica_no_entra(monkeypatch):
    import acceso_a_herramientas as ath
    monkeypatch.setattr('administracion_de_obra.es_admin_de_obra',
                        lambda cur, u, obra: False)
    assert ath.puede_entrar(_Cur(), {'id': None}, OBRA, 'rfi') is False


def test_quien_administra_la_herramienta_entra_en_ella(monkeypatch):
    """Política explícita: un administrador que no puede abrir lo que
    administra no puede administrarlo. No es un privilegio difuso."""
    import acceso_a_herramientas as ath
    monkeypatch.setattr('administracion_de_obra.es_admin_de_obra',
                        lambda cur, u, obra: True)
    # …incluso con la retirada escrita para él.
    assert ath.puede_entrar(_Cur([('rfi', False)]), {'id': 2}, OBRA, 'rfi') is True


# ── La compuerta, en orden ──────────────────────────────────────────────────

@pytest.fixture
def perimetro(monkeypatch):
    monkeypatch.setenv('APP_SECRET', 'secreto-de-prueba')
    monkeypatch.setenv('AUTH_POLICY_MODE', 'sombra')
    import auth_middleware as am
    importlib.reload(am)

    estado = {'usuario': {'id': 7, 'email': 'a@o.pe', 'role': 'user'},
              'apagadas': set(), 'retiradas': set(), 'es_admin_de_obra': False}

    class Cursor:
        def __init__(self): self._q = ''
        def execute(self, sql, params=None):
            self._q = ' '.join(sql.split()).upper()
        def fetchall(self):
            if 'FROM PROJECT_TOOLS' in self._q:
                return [(c, False) for c in estado['apagadas']]
            if 'FROM MEMBER_TOOL_ACCESS' in self._q:
                return [(c, False) for c in estado['retiradas']]
            return []
        def fetchone(self):
            return None

    class Conn:
        def cursor(self): return Cursor()
        def __enter__(self): return self
        def __exit__(self, *a): return False

    import db
    monkeypatch.setattr(db, 'get_db_connection', lambda: Conn())
    monkeypatch.setattr(am, 'validate_session', lambda t: estado['usuario'])
    monkeypatch.setattr(am, '_request_project_id', lambda: OBRA)
    monkeypatch.setattr(am, '_user_in_project', lambda uid, pid: True)
    monkeypatch.setattr('administracion_de_obra.es_admin_de_obra',
                        lambda cur, u, obra: estado['es_admin_de_obra'])

    app = Flask(__name__)
    am.init_auth_middleware(app)

    @app.route('/api/rfis', methods=['GET'])
    def _rfis(): return jsonify({'datos': 'rfis'})

    @app.route('/api/redlines', methods=['GET'])
    def _rl(): return jsonify({'datos': 'redlines'})

    @app.route('/api/docs/list', methods=['GET'])
    def _docs(): return jsonify({'datos': 'expediente'})

    c = app.test_client()
    c.environ_base['HTTP_AUTHORIZATION'] = 'Bearer sesion'
    return c, estado


def test_retirada_bloquea_a_ese_miembro(perimetro):
    c, e = perimetro
    e['retiradas'] = {'redlines'}
    r = c.get('/api/redlines')
    assert r.status_code == 403
    d = r.get_json()
    assert d['code'] == 'SIN_ACCESO_A_HERRAMIENTA' and d['herramienta'] == 'redlines'
    assert 'Red Lines' in d['error']


def test_retirar_una_no_retira_las_otras(perimetro):
    c, e = perimetro
    e['retiradas'] = {'redlines'}
    assert c.get('/api/redlines').status_code == 403
    assert c.get('/api/rfis').status_code == 200


def test_apagada_gana_a_concedida(perimetro):
    """EL ORDEN IMPORTA: la capa 16 decide ANTES. Si la herramienta no existe
    en la obra, da igual que este miembro la tenga concedida — y el mensaje
    dice la verdad de por qué, que es lo que permite arreglarlo."""
    c, e = perimetro
    e['apagadas'] = {'rfi'}
    e['retiradas'] = set()
    r = c.get('/api/rfis')
    assert r.status_code == 403
    assert r.get_json()['code'] == 'HERRAMIENTA_NO_ACTIVA'


def test_apagada_bloquea_tambien_al_administrador_de_obra(perimetro):
    """La 08 no se salta la 16: el administrador gobierna una herramienta
    RESTRINGIDA, pero una APAGADA no existe para nadie."""
    c, e = perimetro
    e['es_admin_de_obra'] = True
    e['apagadas'] = {'rfi'}
    assert c.get('/api/rfis').status_code == 403


def test_el_administrador_de_obra_entra_a_lo_restringido(perimetro):
    c, e = perimetro
    e['es_admin_de_obra'] = True
    e['retiradas'] = {'redlines'}
    assert c.get('/api/redlines').status_code == 200


# ── LAS DOS DIRECCIONES DEL INVARIANTE ──────────────────────────────────────

def test_un_permiso_de_carpeta_no_abre_una_herramienta_retirada(perimetro):
    """Aunque tuviera `admin` sobre TODO el expediente, Red Lines sigue
    cerrada: el permiso de recurso vive DENTRO de la herramienta y no se
    alcanza sin haber entrado."""
    c, e = perimetro
    e['retiradas'] = {'redlines'}
    # El expediente, abierto de par en par…
    assert c.get('/api/docs/list').status_code == 200
    # …y la herramienta, cerrada igual.
    assert c.get('/api/redlines').status_code == 403


def test_entrar_a_una_herramienta_no_concede_ningun_recurso():
    """La otra dirección: la capa 08 no puede conceder recursos NI QUERIENDO.

    Se comprueba sobre el ÁRBOL SINTÁCTICO, no sobre el texto: el módulo no
    importa el resolutor de permisos ni la tabla de concesiones. Mirar el
    texto plano confundiría una mención en la documentación con una
    dependencia real — y la documentación habla de la capa 09 precisamente
    para explicar que NO la toca.
    """
    import ast
    import io
    import os
    ruta = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                        'acceso_a_herramientas.py')
    arbol = ast.parse(io.open(ruta, encoding='utf-8').read())

    importados = set()
    for nodo in ast.walk(arbol):
        if isinstance(nodo, ast.Import):
            importados.update(a.name for a in nodo.names)
        elif isinstance(nodo, ast.ImportFrom):
            importados.add(nodo.module or '')

    prohibidos = {'permiso_documental', 'folder_permissions'}
    assert not (importados & prohibidos), (
        'la capa 08 importa el motor de permisos: %s' % (importados & prohibidos))

    # Y no nombra ninguna de sus funciones en el codigo ejecutable.
    nombres = {n.attr for n in ast.walk(arbol) if isinstance(n, ast.Attribute)}
    nombres |= {n.id for n in ast.walk(arbol) if isinstance(n, ast.Name)}
    assert 'permiso_efectivo' not in nombres
    assert 'set_permiso_de_sujeto' not in nombres
