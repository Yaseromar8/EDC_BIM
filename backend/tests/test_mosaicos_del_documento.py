# -*- coding: utf-8 -*-
"""LOS MOSAICOS DE UNA LAMINA: misma puerta que el PDF, ligados a la version.

POR QUE ESTE TEST
-----------------
Una tesela es un trozo del plano, a la resolucion que se quiera acercar: servida
por una puerta mas floja que la del PDF, abriria el plano por el lado. Estas
pruebas fijan, igual que las de la vista previa:

  1. la puerta es `_acceso_al_recurso`, la del PDF: sesion, obra, documento o
     version, y permiso documental; sin acceso no se dice ni si existe;
  2. va ligado a la VERSION: una version fijada tiene el suyo;
  3. nunca se prepara durante la apertura: se encola UNA vez;
  4. con el manifiesto van las URL de los niveles preparados, y SOLO esas;
  5. las teselas pedidas se validan contra el manifiesto (nivel y rejilla), con
     tope por peticion, y solo las de niveles NO preparados se dibujan a demanda.
"""
import pytest
from flask import Flask, g, jsonify

import mosaicos_almacen
import routes.documents as doc

OBRA = 'b.proj_obra'
P = 'multi-tenant/%s/' % OBRA
VIVA = P + '1787962081_aaaaaaaa_LAMINA.pdf'
ANTERIOR = P + '1787962080_99999999_LAMINA.pdf'
HOJA_DE_CALCULO = P + '1787962082_cccccccc_METRADO.xlsx'
NODO = '00000000-0000-4000-8000-00000000d0c1'
OTRO_NODO = '00000000-0000-4000-8000-00000000d0c2'
V_VIVA = '00000000-0000-4000-8000-00000000fe02'
V_ANTERIOR = '00000000-0000-4000-8000-00000000fe01'
V_DE_OTRO_DOCUMENTO = '00000000-0000-4000-8000-00000000fe99'
EDITOR = {'id': 7, 'email': 'residente@obra.test', 'role': 'editor'}

NODOS = {NODO: VIVA, OTRO_NODO: HOJA_DE_CALCULO}
VERSIONES = {
    V_VIVA: (VIVA, NODO),
    V_ANTERIOR: (ANTERIOR, NODO),
    V_DE_OTRO_DOCUMENTO: (HOJA_DE_CALCULO, OTRO_NODO),
}

# Una piramide de 4 niveles como la de un A1 (z0 y z1 preparados: 9 + 30).
MANIFIESTO = {
    'tesela': 512, 'extension': 'webp', 'hoja_mm': [841.0, 594.0], 'preparados': [0, 1],
    'niveles': [
        {'z': 0, 'ancho': 1500, 'alto': 1060, 'columnas': 3, 'filas': 3},
        {'z': 1, 'ancho': 3000, 'alto': 2119, 'columnas': 6, 'filas': 5},
        {'z': 2, 'ancho': 6000, 'alto': 4238, 'columnas': 12, 'filas': 9},
        {'z': 3, 'ancho': 12000, 'alto': 8477, 'columnas': 24, 'filas': 17},
    ],
}

# Las dos preguntas que admite la ruta: el manifiesto, y unas teselas.
ABRIR = {'node_id': NODO}
ACERCAR = {'node_id': NODO, 'z': 3, 'teselas': [[10, 7]]}


def _respuesta(r):
    resp, codigo = r if isinstance(r, tuple) else (r, r.status_code)
    return codigo, resp.get_json()


class _Cursor:
    def __init__(self, registro):
        self.registro = registro
        self._fila = None

    def execute(self, sql, parametros=()):
        self.registro.append(' '.join(sql.split())[:60])
        if 'FROM file_versions' in sql:
            fila = VERSIONES.get(parametros[0])
            self._fila = (fila[0], fila[1]) if fila else None
        elif 'FROM file_nodes' in sql:
            urn = NODOS.get(parametros[0])
            self._fila = (urn,) if urn else None
        else:
            self._fila = None

    def fetchone(self):
        return self._fila

    def close(self):
        pass


class _Conexion:
    def __init__(self, registro):
        self._cursor = _Cursor(registro)

    def cursor(self):
        return self._cursor

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


@pytest.fixture
def banco(monkeypatch):
    estado = {'con_mosaico': {VIVA, ANTERIOR}, 'obra': OBRA, 'acceso': True, 'permiso': True,
              'consultas': [], 'trabajos': [], 'preparadas': [], 'a_demanda': [], 'firmadas': []}

    import db as _db
    monkeypatch.setattr(_db, 'get_db_connection', lambda *a, **k: _Conexion(estado['consultas']))

    # El almacen, pinchado: el manifiesto existe o no; las teselas se «aseguran»
    # anotando cuales se habrian dibujado a demanda.
    monkeypatch.setattr(mosaicos_almacen, 'leer_manifiesto',
                        lambda blob: dict(MANIFIESTO) if blob in estado['con_mosaico'] else None)
    monkeypatch.setattr(mosaicos_almacen, 'preparar', lambda blob: estado['preparadas'].append(blob) or True)

    def asegurar(blob, man, z, teselas):
        if z not in man['preparados']:
            estado['a_demanda'].append((blob, z, list(teselas)))
        return list(teselas)
    monkeypatch.setattr(mosaicos_almacen, 'asegurar_teselas', asegurar)

    def firmar(nombre, *a, **k):
        estado['firmadas'].append(nombre)
        return 'https://firmada.test/' + nombre.split(OBRA + '/', 1)[-1]
    monkeypatch.setattr(doc, 'generate_signed_url', firmar)

    import acceso_a_blobs
    monkeypatch.setattr(acceso_a_blobs, 'obra_del_blob',
                        lambda cursor, gcs_urn=None, node_id=None: (estado['obra'], None, 'file_nodes'))
    monkeypatch.setattr(doc, 'verify_project_access',
                        lambda usuario, ambito: estado['acceso'] and ambito == OBRA)
    import permiso_documental
    monkeypatch.setattr(permiso_documental, 'guardia',
                        lambda *a, **k: None if estado['permiso'] else
                        (jsonify({'success': False, 'error': 'No tienes permiso.',
                                  'code': 'SIN_PERMISO_DOCUMENTAL'}), 403))
    monkeypatch.setattr(doc, '_anotar_acceso', lambda *a, **k: None)

    class _Cola:
        def submit(self, fn, *a, **k):
            estado['trabajos'].append(fn)
            return None
    monkeypatch.setattr(doc, '_COLA_MINIATURAS', _Cola())
    doc._MINIATURAS_ENCOLADAS.clear()

    app = Flask(__name__)

    def pedir(cuerpo, usuario=EDITOR):
        with app.test_request_context('/api/docs/mosaico', method='POST', json=cuerpo):
            if usuario is not None:
                g.current_user = usuario
            return _respuesta(doc.mosaico_del_documento())
    return pedir, estado


def _correr(estado):
    trabajos, estado['trabajos'] = estado['trabajos'], []
    for t in trabajos:
        t()


# ── 1 · abrir: el manifiesto y las teselas preparadas ───────────────────────

def test_al_abrir_llegan_el_manifiesto_y_las_teselas_preparadas(banco):
    pedir, estado = banco
    codigo, d = pedir(ABRIR)
    assert codigo == 200
    assert d['pendiente'] is False and d['manifiesto']['preparados'] == [0, 1]
    # z0 entera (3x3) y z1 entera (6x5): el primer acercamiento no espera nada.
    assert len(d['urls']) == 9 + 30
    assert {'0/0_0', '0/2_2', '1/0_0', '1/5_4'} <= set(d['urls'])
    assert d['urls']['1/5_4'].endswith('1787962081_aaaaaaaa_LAMINA.pdf__mosaico/z1/5_4.webp')
    # Y SOLO esas: nada de los niveles profundos, que aun no existen.
    assert not [k for k in d['urls'] if k.split('/')[0] not in ('0', '1')]
    assert estado['a_demanda'] == [] and estado['trabajos'] == [], \
        'lo que ya esta no se vuelve a preparar ni se dibuja'


def test_con_el_manifiesto_solo_van_los_niveles_que_caben_enteros(banco, monkeypatch):
    pedir, estado = banco
    # z2 tambien preparado (108 teselas): sus URL se piden al llegar a el.
    tres = dict(MANIFIESTO, preparados=[0, 1, 2])
    monkeypatch.setattr(mosaicos_almacen, 'leer_manifiesto', lambda blob: tres)
    codigo, d = pedir(ABRIR)
    assert codigo == 200
    assert len(d['urls']) == len(estado['firmadas']) == 9 + 30
    assert not [k for k in d['urls'] if k.startswith('2/')], 'nada de un nivel a medias'
    # ...y al pedirlas no se dibuja nada: estan preparadas
    codigo, d = pedir({'node_id': NODO, 'z': 2, 'teselas': [[0, 0], [11, 8]]})
    assert sorted(d['urls']) == ['2/0_0', '2/11_8'] and estado['a_demanda'] == []


def test_un_manifiesto_desmedido_no_firma_cientos_de_golpe(banco, monkeypatch):
    pedir, estado = banco
    enorme = dict(MANIFIESTO, preparados=[0, 1, 2, 3])            # 9 + 30 + 108 + 408
    monkeypatch.setattr(mosaicos_almacen, 'leer_manifiesto', lambda blob: enorme)
    codigo, d = pedir(ABRIR)
    assert codigo == 200
    assert len(d['urls']) == len(estado['firmadas']) <= mosaicos_almacen.MAX_TESELAS_PREPARADAS


def test_sin_mosaico_se_encola_una_vez_y_el_lector_sigue_como_hoy(banco):
    pedir, estado = banco
    estado['con_mosaico'] = set()
    a = pedir(ABRIR)
    b = pedir(ABRIR)
    assert a == b == (200, {'success': True, 'manifiesto': None, 'urls': {}, 'pendiente': True})
    assert len(estado['trabajos']) == 1, 'dos aperturas a la vez preparan UNA sola'
    _correr(estado)
    assert estado['preparadas'] == [VIVA]


def test_lo_que_no_es_pdf_no_tiene_mosaico(banco):
    pedir, estado = banco
    for cuerpo in ({'node_id': OTRO_NODO}, {'node_id': OTRO_NODO, 'z': 0, 'teselas': [[0, 0]]}):
        codigo, d = pedir(cuerpo)
        assert (codigo, d) == (200, {'success': True, 'manifiesto': None, 'urls': {}, 'pendiente': False})
    assert estado['trabajos'] == [] and estado['firmadas'] == []


# ── 2 · ligado a la version ─────────────────────────────────────────────────

def test_una_version_de_otro_documento_no_existe(banco):
    pedir, estado = banco
    codigo, d = pedir({'node_id': NODO, 'version_id': V_DE_OTRO_DOCUMENTO})
    assert (codigo, d) == (404, {'success': False, 'error': 'Documento no encontrado'})
    assert estado['trabajos'] == [] and estado['firmadas'] == []


def test_las_teselas_de_la_version_fijada_son_las_suyas(banco):
    pedir, _estado = banco
    codigo, d = pedir({'node_id': NODO, 'version_id': V_ANTERIOR, 'z': 0, 'teselas': [[0, 0]]})
    assert codigo == 200
    assert d['urls']['0/0_0'].endswith('1787962080_99999999_LAMINA.pdf__mosaico/z0/0_0.webp')


# ── 3 · la misma puerta que el PDF ──────────────────────────────────────────

@pytest.mark.parametrize('cuerpo', [ABRIR, ACERCAR], ids=['abrir', 'acercar'])
def test_sin_sesion_no_se_entrega_nada(banco, cuerpo):
    pedir, estado = banco
    codigo, d = pedir(cuerpo, usuario=None)
    assert codigo == 401
    assert 'manifiesto' not in d and 'urls' not in d
    assert estado['trabajos'] == [] and estado['a_demanda'] == [] and estado['firmadas'] == []


@pytest.mark.parametrize('cuerpo', [ABRIR, ACERCAR], ids=['abrir', 'acercar'])
def test_de_otra_obra_no_se_ve(banco, cuerpo):
    pedir, estado = banco
    estado['acceso'] = False
    codigo, d = pedir(cuerpo)
    assert codigo in (403, 404)
    assert 'manifiesto' not in d and 'urls' not in d
    assert estado['trabajos'] == [] and estado['a_demanda'] == [] and estado['firmadas'] == []


@pytest.mark.parametrize('cuerpo', [ABRIR, ACERCAR], ids=['abrir', 'acercar'])
def test_sin_permiso_documental_no_se_ve(banco, cuerpo):
    pedir, estado = banco
    estado['permiso'] = False
    codigo, d = pedir(cuerpo)
    assert codigo == 403
    assert 'manifiesto' not in d and 'urls' not in d
    assert estado['a_demanda'] == [] and estado['firmadas'] == []


# ── 4 · acercar: las teselas de un nivel ────────────────────────────────────

def test_las_de_un_nivel_preparado_no_se_dibujan(banco):
    pedir, estado = banco
    codigo, d = pedir({'node_id': NODO, 'z': 1, 'teselas': [[0, 0], [5, 4]]})
    assert codigo == 200
    assert sorted(d['urls']) == ['1/0_0', '1/5_4']
    assert 'manifiesto' not in d, 'al acercar no se reenvia el manifiesto'
    assert estado['a_demanda'] == [], 'z1 esta preparado: nada que dibujar'


def test_las_de_un_nivel_profundo_se_dibujan_a_demanda(banco):
    pedir, estado = banco
    codigo, d = pedir({'node_id': NODO, 'z': 3, 'teselas': [[10, 7], [11, 7]]})
    assert codigo == 200
    assert sorted(d['urls']) == ['3/10_7', '3/11_7']
    assert estado['a_demanda'] == [(VIVA, 3, [(10, 7), (11, 7)])]


def test_lo_que_no_esta_en_la_rejilla_no_se_pide(banco):
    pedir, estado = banco
    codigo, d = pedir({'node_id': NODO, 'z': 3,
                       'teselas': [[24, 0], [0, 17], [-1, 0], ['a', 1], [2, 2], [2, 2]]})
    assert codigo == 200
    assert list(d['urls']) == ['3/2_2'], 'fuera de la rejilla, negativas, basura y repetidas: fuera'


@pytest.mark.parametrize('z', [9, -1, 'z3'])
def test_un_nivel_que_no_existe_es_un_error(banco, z):
    pedir, estado = banco
    codigo, _d = pedir({'node_id': NODO, 'z': z, 'teselas': [[0, 0]]})
    assert codigo == 400
    assert estado['a_demanda'] == [] and estado['firmadas'] == []


def test_tope_de_teselas_por_peticion(banco):
    pedir, _estado = banco
    muchas = [[x, y] for x in range(24) for y in range(17)]         # 408
    codigo, d = pedir({'node_id': NODO, 'z': 3, 'teselas': muchas})
    assert codigo == 200
    assert len(d['urls']) == mosaicos_almacen.MAX_TESELAS_POR_PETICION


def test_sin_mosaico_las_teselas_esperan_y_se_encola(banco):
    pedir, estado = banco
    estado['con_mosaico'] = set()
    codigo, d = pedir({'node_id': NODO, 'z': 0, 'teselas': [[0, 0]]})
    assert (codigo, d) == (200, {'success': True, 'manifiesto': None, 'urls': {}, 'pendiente': True})
    assert len(estado['trabajos']) == 1


# ── 5 · se prepara al subir ─────────────────────────────────────────────────

def test_la_subida_prepara_el_mosaico_de_los_pdf():
    import io, os, re
    raiz = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    subidas = io.open(os.path.join(raiz, 'routes', 'uploads.py'), encoding='utf-8').read()
    confirmar = io.open(os.path.join(raiz, 'routes', 'documents.py'), encoding='utf-8').read()
    assert re.search(r"endswith\(\('\.pdf', '\.pdfx'\)\)[\s\S]{0,900}_encolar_mosaicos", subidas), \
        'la subida por bloques lo prepara, y solo para PDF'
    assert re.search(r"endswith\(\('\.pdf', '\.pdfx'\)\)[\s\S]{0,600}_encolar_mosaicos", confirmar), \
        'la subida de Multimedia tambien'
