# -*- coding: utf-8 -*-
"""ARCHIVOS · ENLACES POR OBRA, CARPETA Y DOCUMENTO.

Contrato del propietario (14-sep-2026): docs/archivos/01_ENLACES_POR_CARPETA_Y_DOCUMENTO.md
y docs/archivos/02_ENLACES_INFORME_DE_CIERRE.md. Aqui se fijan las reglas de
`enlaces_de_archivos.ubicar` con una obra de mentira y la respuesta neutra de la ruta. El
recorrido contra PostgreSQL, con ENFORCE y sesiones reales, esta en
`herramientas/ensayo_de_enlaces_de_archivos.py`.
"""
import io
import os
import uuid

import pytest

import enlaces_de_archivos as enl

RAIZ_BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OBRA, OTRA = 'obra-a', 'obra-b'
USUARIO = {'id': 7, 'role': 'editor', 'email': 'u7@obra.pe'}


def _id():
    return str(uuid.uuid4())


RAIZ, WIP, PLANOS, ENTREGAS, BORRADA = _id(), _id(), _id(), _id(), _id()
DOC, MOVIDO, EN_RAIZ, EN_BORRADA = _id(), _id(), _id(), _id()
RAIZ_B, DOC_B = _id(), _id()
V1, V2, V_MOVIDO = _id(), _id(), _id()

# id -> (parent_id, name, node_type, folder_type, model_urn, is_deleted, status)
NODOS = {
    RAIZ: (None, 'Archivos de proyecto', 'FOLDER', 'PROJECT_ROOT', OBRA, False, None),
    WIP: (RAIZ, '01_WIP', 'FOLDER', None, OBRA, False, 'WIP'),
    PLANOS: (WIP, 'Planos', 'FOLDER', None, OBRA, False, 'WIP'),
    ENTREGAS: (RAIZ, '02_SHA', 'FOLDER', None, OBRA, False, 'WIP'),
    BORRADA: (WIP, 'Vieja', 'FOLDER', None, OBRA, True, 'WIP'),
    DOC: (PLANOS, 'PL-001.pdf', 'FILE', None, OBRA, False, 'WIP'),
    MOVIDO: (ENTREGAS, 'PL-002.pdf', 'FILE', None, OBRA, False, 'SHARED'),
    EN_RAIZ: (RAIZ, 'LEEME.pdf', 'FILE', None, OBRA, False, 'WIP'),
    EN_BORRADA: (BORRADA, 'X.pdf', 'FILE', None, OBRA, True, 'WIP'),
    RAIZ_B: (None, 'Archivos de proyecto', 'FOLDER', 'PROJECT_ROOT', OTRA, False, None),
    DOC_B: (RAIZ_B, 'AJENO.pdf', 'FILE', None, OTRA, False, 'WIP'),
}
VERSIONES = {V1: DOC, V2: DOC, V_MOVIDO: MOVIDO}


class _Cur(object):
    """Doble de cursor: sube por `nodos` como el CTE, con el mismo tope de saltos."""

    def __init__(self, nodos=None):
        self.nodos = dict(NODOS if nodos is None else nodos)
        self.sql = []
        self._filas = []

    def execute(self, sql, params=None):
        self.sql.append(' '.join(sql.split()))
        if 'WITH RECURSIVE cadena' in sql:
            actual, tope = params
            filas, salto = [], 0
            while actual in self.nodos and salto <= tope:
                padre, nombre, tipo, clase, urn, borrado, estado = self.nodos[actual]
                filas.append((actual, padre, nombre, tipo, clase, urn, borrado, estado))
                actual, salto = padre, salto + 1
            self._filas = filas
        elif 'FROM file_versions' in sql:
            version, documento = params
            self._filas = [(1,)] if VERSIONES.get(version) == documento else []
        else:
            raise AssertionError('consulta inesperada: %s' % sql)

    def fetchall(self):
        return list(self._filas)

    def fetchone(self):
        return self._filas[0] if self._filas else None


@pytest.fixture
def obra(monkeypatch):
    """El permiso por nodo, quien administra y el historial de versiones, de mentira."""
    import administracion_de_obra as adm
    import file_system_db as fsd
    import permiso_documental as pd
    estado = {'niveles': {}, 'por_defecto': 'viewer', 'admin': False, 'pedidos': []}

    def permiso(cur, usuario, model_urn, node_id, **kw):
        estado['pedidos'].append((model_urn, node_id))
        return estado['niveles'].get(node_id, estado['por_defecto'])

    def versiones(model_urn, documento):
        return [{'id': v, 'version_number': n, 'size': 10, 'updated': None, 'updated_by': 'x',
                 'metadata': {}, 'gcs_urn': 'blob/' + v}
                for n, v in enumerate(sorted(v for v, d in VERSIONES.items() if d == documento), 1)
                if model_urn == OBRA]

    monkeypatch.setattr(pd, 'permiso_efectivo', permiso)
    monkeypatch.setattr(adm, 'es_admin_de_obra', lambda cur, usuario, o: estado['admin'])
    monkeypatch.setattr(fsd, 'get_file_versions', versiones)
    monkeypatch.delenv('STRICT_ISO_VISIBILITY', raising=False)
    return estado


def _ubicar(**kw):
    cur = kw.pop('cur', None) or _Cur()
    descarga = kw.pop('descarga', lambda nodo: True)
    return enl.ubicar(cur, USUARIO, kw.pop('en', OBRA), puede_descargar=descarga, **kw)


def _negado(**kw):
    with pytest.raises(enl.NoDisponible) as e:
        _ubicar(**kw)
    return e.value.motivo


# ══ 1 · DONDE ESTA ═════════════════════════════════════════════════════════

def test_una_carpeta_devuelve_su_ruta_de_arriba_abajo_sin_la_raiz(obra):
    assert _ubicar(carpeta=PLANOS) == {
        'carpeta': PLANOS, 'documento': None, 'version': None,
        'ruta': [{'id': WIP, 'name': '01_WIP'}, {'id': PLANOS, 'name': 'Planos'}]}
    assert obra['pedidos'] == [(OBRA, PLANOS)]


def test_la_raiz_es_el_enlace_de_la_obra(obra):
    """Como en el explorador: la raiz la ve todo miembro, sin mirar reglas de carpeta."""
    obra['por_defecto'] = 'none'
    assert _ubicar(carpeta=RAIZ) == {'carpeta': None, 'ruta': [], 'documento': None, 'version': None}
    assert obra['pedidos'] == []


def test_el_documento_manda_sobre_la_carpeta_del_enlace(obra):
    """Movido a 02_SHA: el enlace viejo dice Planos y se abre donde esta hoy."""
    d = _ubicar(carpeta=PLANOS, documento=MOVIDO)
    assert d['carpeta'] == ENTREGAS and d['documento'] == MOVIDO
    assert d['ruta'] == [{'id': ENTREGAS, 'name': '02_SHA'}]
    # El permiso se pregunta por el DOCUMENTO, nunca por la carpeta de la direccion.
    assert obra['pedidos'] == [(OBRA, MOVIDO)]


def test_sin_carpeta_el_documento_tambien_se_encuentra(obra):
    assert _ubicar(documento=DOC)['carpeta'] == PLANOS


def test_un_documento_en_la_raiz(obra):
    assert _ubicar(documento=EN_RAIZ) == {'carpeta': None, 'ruta': [], 'documento': EN_RAIZ,
                                          'version': None}


# ══ 2 · LO QUE NO SE ABRE, Y POR QUE (el motivo no sale al cliente) ═════════

def test_sin_permiso_no_se_abre_ni_la_carpeta_ni_el_documento(obra):
    obra['niveles'].update({PLANOS: 'none', DOC: 'none'})
    assert _negado(carpeta=PLANOS) == 'sin permiso'
    assert _negado(carpeta=PLANOS, documento=DOC) == 'sin permiso'
    obra['niveles'].update({PLANOS: 'viewer', DOC: 'viewer'})
    assert _ubicar(carpeta=PLANOS, documento=DOC)['documento'] == DOC


def test_lo_de_otra_obra_no_se_abre_desde_esta(obra):
    assert _negado(documento=DOC_B) == 'de otra obra'
    assert _negado(carpeta=RAIZ_B) == 'de otra obra'
    assert _negado(en=OTRA, documento=DOC) == 'de otra obra'
    assert obra['pedidos'] == []            # ni se llega a preguntar el permiso


def test_inexistente_en_la_papelera_o_del_tipo_equivocado(obra):
    assert _negado(documento=_id()) == 'no existe'
    assert _negado(carpeta=BORRADA) == 'en la papelera'
    assert _negado(documento=EN_BORRADA) == 'en la papelera'
    assert _negado(documento=PLANOS) == 'no es del tipo que dice el enlace'
    assert _negado(carpeta=DOC) == 'no es del tipo que dice el enlace'


def test_una_carpeta_de_arriba_borrada_esconde_lo_que_hay_dentro(obra):
    nodos = dict(NODOS)
    nodos[WIP] = NODOS[WIP][:5] + (True, 'WIP')
    assert _negado(cur=_Cur(nodos), documento=DOC) == 'en la papelera'
    assert _negado(cur=_Cur(nodos), carpeta=PLANOS) == 'en la papelera'


def test_una_cadena_rota_o_un_ciclo_no_se_sigue(obra):
    suelto, a, b = _id(), _id(), _id()
    nodos = dict(NODOS)
    nodos[suelto] = (_id(), 'suelto.pdf', 'FILE', None, OBRA, False, 'WIP')   # padre inexistente
    nodos[a] = (b, 'A', 'FOLDER', None, OBRA, False, 'WIP')
    nodos[b] = (a, 'B', 'FOLDER', None, OBRA, False, 'WIP')                   # ciclo
    assert _negado(cur=_Cur(nodos), documento=suelto).startswith('cadena')
    assert _negado(cur=_Cur(nodos), carpeta=a).startswith('cadena')


def test_un_identificador_mal_formado_no_llega_a_la_base(obra):
    cur = _Cur()
    for malo in ('abc', '1', "x' OR '1'='1", '../' + DOC):
        with pytest.raises(enl.NoDisponible):
            enl.ubicar(cur, USUARIO, OBRA, carpeta=malo)
        with pytest.raises(enl.NoDisponible):
            enl.ubicar(cur, USUARIO, OBRA, documento=DOC, version=malo)
    assert cur.sql == []
    assert _negado() == 'enlace sin carpeta ni documento'


# ══ 3 · LA VERSION ══════════════════════════════════════════════════════════

def test_la_version_tiene_que_ser_de_ese_documento(obra):
    d = _ubicar(carpeta=PLANOS, documento=DOC, version=V1)
    assert d['version']['id'] == V1 and d['version']['gcs_urn'] == 'blob/' + V1
    assert _negado(carpeta=PLANOS, documento=DOC, version=V_MOVIDO) == 'la version no es de este documento'
    assert _negado(documento=DOC, version=_id()) == 'la version no es de este documento'
    assert _negado(version=V1) == 'version sin documento'


def test_la_version_se_comprueba_despues_del_permiso(obra):
    obra['niveles'][DOC] = 'none'
    assert _negado(documento=DOC, version=V_MOVIDO) == 'sin permiso'


def test_la_clave_de_la_version_solo_para_quien_puede_descargar(obra):
    d = _ubicar(documento=DOC, version=V2, descarga=lambda nodo: False)
    assert d['version']['id'] == V2 and 'gcs_urn' not in d['version']
    sin_decir = enl.ubicar(_Cur(), USUARIO, OBRA, documento=DOC, version=V2)
    assert 'gcs_urn' not in sin_decir['version']


# ══ 4 · EL MODO ISO ESTRICTO ════════════════════════════════════════════════

def test_el_modo_iso_estricto_esconde_lo_mismo_que_el_listado(obra, monkeypatch):
    monkeypatch.setenv('STRICT_ISO_VISIBILITY', 'true')
    assert _negado(documento=DOC) == 'oculto por el modo ISO estricto'      # WIP
    assert _ubicar(documento=MOVIDO)['documento'] == MOVIDO                  # Compartido
    assert _ubicar(carpeta=PLANOS)['carpeta'] == PLANOS                      # carpetas, no
    obra['admin'] = True
    assert _ubicar(documento=DOC)['documento'] == DOC


def test_la_regla_iso_es_la_del_listado():
    listado = io.open(os.path.join(RAIZ_BACKEND, 'file_system_db.py'), encoding='utf-8').read()
    assert "os.getenv('STRICT_ISO_VISIBILITY', 'false').lower() in ('true', '1', 'yes')" in listado
    assert 'iso_visible = {_ecd.SHARED, _ecd.PUBLISHED, _ecd.ARCHIVED}' in listado


# ══ 5 · LA RUTA: UNA SOLA RESPUESTA NEUTRA ═════════════════════════════════

@pytest.fixture
def ruta(monkeypatch):
    """La ruta real sobre una app minima: la sesion y la base, sustituidas."""
    from flask import Flask, g
    monkeypatch.setenv('APP_SECRET', 'secreto-de-prueba')
    import db
    import routes.documents as rd
    estado = {'obra': True}
    monkeypatch.setattr(rd, 'verify_project_access', lambda usuario, urn: estado['obra'])

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
        g.current_user = dict(USUARIO)

    app.register_blueprint(rd.documents_bp)
    return {'cli': app.test_client(), 'estado': estado}


def _pedir(m, **q):
    q.setdefault('model_urn', OBRA)
    return m['cli'].get('/api/docs/ubicacion', query_string=q)


def test_la_ruta_responde_lo_mismo_ante_cualquier_negativa(ruta, monkeypatch):
    respuestas = []
    ruta['estado']['obra'] = False
    monkeypatch.setattr(enl, 'ubicar', lambda *a, **k: pytest.fail('sin la obra no se busca el recurso'))
    respuestas.append(_pedir(ruta, documento=DOC))
    respuestas.append(_pedir(ruta, documento=DOC, model_urn='global'))
    ruta['estado']['obra'] = True
    for motivo in ('no existe', 'de otra obra', 'en la papelera', 'sin permiso',
                   'la version no es de este documento', 'version mal formado'):
        def negar(*a, _motivo=motivo, **k):
            raise enl.NoDisponible(_motivo)
        monkeypatch.setattr(enl, 'ubicar', negar)
        respuestas.append(_pedir(ruta, documento=DOC, version=V1))
    cuerpos = [(r.status_code, r.get_json()) for r in respuestas]
    assert cuerpos[0] == (404, {'success': False, 'code': 'ENLACE_NO_DISPONIBLE',
                                'error': 'No tienes acceso a ese elemento o ya no existe.'})
    assert all(c == cuerpos[0] for c in cuerpos), cuerpos


def test_la_ruta_devuelve_donde_esta(ruta, monkeypatch):
    visto = {}

    def ubicar(cur, usuario, model_urn, **kw):
        visto.update(kw, usuario=usuario, obra=model_urn)
        return {'carpeta': PLANOS, 'ruta': [{'id': PLANOS, 'name': 'Planos'}], 'documento': DOC,
                'version': None}

    monkeypatch.setattr(enl, 'ubicar', ubicar)
    r = _pedir(ruta, carpeta=WIP, documento=DOC)
    assert r.status_code == 200
    assert r.get_json() == {'success': True, 'carpeta': PLANOS, 'documento': DOC, 'version': None,
                            'ruta': [{'id': PLANOS, 'name': 'Planos'}]}
    assert (visto['carpeta'], visto['documento'], visto['version'], visto['obra']) == (WIP, DOC, None, OBRA)
    assert visto['usuario']['id'] == USUARIO['id'] and callable(visto['puede_descargar'])


def test_un_fallo_interno_no_se_confunde_con_una_negativa(ruta, monkeypatch):
    monkeypatch.setattr(enl, 'ubicar', lambda *a, **k: 1 / 0)
    r = _pedir(ruta, documento=DOC)
    assert r.status_code == 500 and r.get_json()['code'] == 'ERROR_DEL_SERVIDOR'
    assert 'division' not in r.get_json()['error']
