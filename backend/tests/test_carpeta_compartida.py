# -*- coding: utf-8 -*-
"""EL ENLACE PÚBLICO DE UNA CARPETA (17-nov-2026, docs/archivos/32), sin base de datos.

Visto en producción: las fichas del sustento de metrados de PQT8 se compartieron con «Compartir» sobre la CARPETA, y
la página pública contestaba «El archivo físico no existe». Esos enlaces ya se habían enviado por correo.

QUE FIJA
  · el enlace de una carpeta dice que es una carpeta (y el de un archivo sigue igual);
  · revocado, caducado o de un archivo: el contenido no se lista, y se dice por qué;
  · lo que no está DENTRO de la carpeta compartida no se lista ni se abre;
  · las dos rutas nuevas son públicas en lectura y declaradas, sin pedir sesión.

Con la aplicación y PostgreSQL de verdad: herramientas/ensayo_de_carpeta_compartida.py.
"""
import datetime

import pytest
from flask import Flask

FICHA = '11111111-1111-4111-8111-111111111111'
SHARE = '564fc209-2a7d-4b3f-a216-289645556ad3'
FUERA = '99999999-9999-4999-8999-999999999999'
AYER = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=1)


class Cursor:
    def __init__(self, e):
        self.e, self._uno, self._todos = e, None, []

    def execute(self, sql, params=None):
        s = ' '.join(sql.split()).upper()
        self.e['sql'].append(s)
        self._uno, self._todos = None, []
        if 'FROM DOCUMENT_SHARES S JOIN FILE_NODES F' in s and 'F.NODE_TYPE' in s and 'F.IS_DELETED' in s:
            self._uno = self.e['enlace']                       # la carpeta del enlace (carpetas_compartidas)
        elif 'FROM DOCUMENT_SHARES S' in s and 'F.NODE_TYPE' in s:
            self._uno = self.e['enlace_documento']             # get_shared_document
        elif s.startswith('WITH RECURSIVE SUBE'):
            self._todos = self.e['camino'].get(params['nodo'], [])
        elif 'FROM FILE_NODES WHERE PARENT_ID' in s:
            self._todos = self.e['hijos']

    def fetchone(self):
        return self._uno

    def fetchall(self):
        return self._todos


class Conexion:
    def __init__(self, e):
        self.e = e

    def cursor(self):
        return Cursor(self.e)

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


def enlace(revocado=False, expira=None, tipo='FOLDER', borrada=False):
    return ('viewer', 'public', expira, revocado, FICHA, '1. ACCESO 01/', tipo, borrada, 'obra-1')


@pytest.fixture
def ruta(monkeypatch):
    import db
    import routes.documents as rd
    import routes.carpetas_compartidas  # noqa: F401  (cuelga sus rutas de documents_bp)
    e = {'sql': [], 'enlace': enlace(), 'hijos': [], 'camino': {FICHA: [(FICHA, '1. ACCESO 01', False, 'obra-1')]},
         'enlace_documento': ('viewer', 'public', '1. ACCESO 01', None, None, None, None, False, 'FOLDER')}
    monkeypatch.setattr(db, 'get_db_connection', lambda: Conexion(e))
    app = Flask(__name__)
    app.register_blueprint(rd.documents_bp)
    return {'cli': app.test_client(), 'e': e, 'app': app}


def pide(r, url):
    resp = r['cli'].get(url)
    return resp.status_code, resp.get_json()


def test_el_enlace_de_una_carpeta_dice_que_es_una_carpeta(ruta):
    s, b = pide(ruta, '/api/docs/shared/%s' % SHARE)
    assert s == 200 and b['data'] == {'es_carpeta': True, 'name': '1. ACCESO 01', 'role': 'viewer',
                                      'access_type': 'public'}


def test_una_carpeta_revocada_o_caducada_sigue_sin_abrir(ruta):
    ruta['e']['enlace_documento'] = ('viewer', 'public', 'X', None, None, None, None, True, 'FOLDER')
    assert pide(ruta, '/api/docs/shared/%s' % SHARE)[0] == 410
    ruta['e']['enlace_documento'] = ('viewer', 'public', 'X', None, None, None, AYER, False, 'FOLDER')
    assert pide(ruta, '/api/docs/shared/%s' % SHARE)[0] == 410


@pytest.mark.parametrize('cambio,http,texto', [
    (dict(revocado=True), 410, 'revocado'),
    (dict(expira=AYER), 410, 'expiró'),
    (dict(tipo='FILE'), 404, 'no es de una carpeta'),
    (dict(borrada=True), 404, 'ya no está disponible'),
])
def test_sin_un_enlace_valido_de_carpeta_no_se_lista_ni_se_abre_nada(ruta, cambio, http, texto):
    ruta['e']['enlace'] = enlace(**cambio)
    for url in ('/api/docs/shared/%s/contenido' % SHARE, '/api/docs/shared/%s/archivo/%s' % (SHARE, FUERA)):
        s, b = pide(ruta, url)
        assert s == http and texto in b['error'], (url, s, b)
    # Y no se llegó a mirar ningún contenido.
    assert not any('PARENT_ID' in s or 'RECURSIVE' in s for s in ruta['e']['sql'])


def test_un_enlace_inventado_no_llega_a_la_base(ruta):
    s, _b = pide(ruta, '/api/docs/shared/no-es-un-id/contenido')
    assert s == 404 and ruta['e']['sql'] == []


def test_lo_que_no_esta_dentro_no_se_lista(ruta):
    # El camino de FUERA no llega a la carpeta compartida.
    ruta['e']['camino'][FUERA] = [('00000000-0000-4000-8000-000000000000', 'RAIZ', False, 'obra-1'),
                                  (FUERA, 'OTRA FICHA', False, 'obra-1')]
    s, b = pide(ruta, '/api/docs/shared/%s/contenido?carpeta=%s' % (SHARE, FUERA))
    assert s == 404 and 'no está dentro' in b['error']
    assert not any('FROM FILE_NODES WHERE PARENT_ID' in x for x in ruta['e']['sql'])


def test_lo_que_esta_bajo_algo_borrado_o_de_otra_obra_no_se_lista(ruta):
    sub = '22222222-2222-4222-8222-222222222222'
    for borrado, obra in ((True, 'obra-1'), (False, 'otra-obra')):
        ruta['e']['camino'][sub] = [(FICHA, '1. ACCESO 01', False, 'obra-1'), (sub, 'PLANOS', borrado, obra)]
        s, _b = pide(ruta, '/api/docs/shared/%s/contenido?carpeta=%s' % (SHARE, sub))
        assert s == 404


def test_la_carpeta_compartida_se_lista_desde_ella_misma(ruta, monkeypatch):
    import sensibilidad
    monkeypatch.setattr(sensibilidad, 'puede_salir_del_ecd', lambda cur, nodo, urn: (True, None, ''))
    ruta['e']['hijos'] = [('22222222-2222-4222-8222-222222222222', 'PLANOS/', 'FOLDER', None, None, None, None),
                          ('33333333-3333-4333-8333-333333333333', 'METRADO.pdf', 'FILE', 1000, 'application/pdf', 2,
                           None)]
    s, b = pide(ruta, '/api/docs/shared/%s/contenido' % SHARE)
    d = b['data']
    assert s == 200 and d['migas'] == [{'id': FICHA, 'name': '1. ACCESO 01'}]
    assert d['carpetas'] == [{'id': '22222222-2222-4222-8222-222222222222', 'name': 'PLANOS'}]
    assert [a['name'] for a in d['archivos']] == ['METRADO.pdf'] and d['archivos'][0]['disponible'] is True


def test_si_la_regla_de_salida_no_se_puede_evaluar_no_sale(ruta, monkeypatch):
    import sensibilidad

    def rota(*a):
        raise RuntimeError('tabla no disponible')
    monkeypatch.setattr(sensibilidad, 'puede_salir_del_ecd', rota)
    ruta['e']['hijos'] = [('33333333-3333-4333-8333-333333333333', 'METRADO.pdf', 'FILE', 1000, None, 1, None)]
    s, b = pide(ruta, '/api/docs/shared/%s/contenido' % SHARE)
    assert s == 200 and b['data']['archivos'][0]['disponible'] is False


def test_las_dos_rutas_son_publicas_en_lectura_y_declaradas(ruta):
    from politica import politica_de
    reglas = {r.rule: r.endpoint for r in ruta['app'].url_map.iter_rules()}
    for url in ('/api/docs/shared/<share_id>/contenido', '/api/docs/shared/<share_id>/archivo/<node_id>'):
        assert url in reglas
        p = politica_de(ruta['app'], reglas[url])
        assert p is not None and p.motivo and 'enlace' in p.motivo
    # Y el middleware las deja pasar sin sesión: van bajo el prefijo público de los enlaces.
    import auth_middleware as am
    assert any(url.startswith(pref) for pref in am.PUBLIC_GET_PREFIXES for url in ('/api/docs/shared/x/contenido',))
