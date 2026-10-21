"""La preparacion completa de una obra: miniatura, vista previa y mosaico de cada
PDF, de uno en uno, con una MARCA que salta el plano que tumbo el proceso.

Origen: 14-oct-2026, Render reinicio el backend por memoria con seis personas
abriendo laminas antiguas. Abrir ya no dibuja (2e093d0); esto deja hechos, de
noche, los planos que se subieron antes de que existiera la preparacion al subir.
"""
import time

import pytest

import gcs_manager
import mosaicos_almacen
from routes import documents as doc


class _Blob:
    def __init__(self, cubo, nombre):
        self.cubo, self.name = cubo, nombre

    def exists(self):
        return self.name in self.cubo.objetos

    def reload(self):
        pass

    @property
    def time_created(self):
        t = self.cubo.objetos.get(self.name)
        return None if t is None else _Instante(t)

    def upload_from_string(self, datos, content_type=None):
        self.cubo.objetos[self.name] = time.time()

    def delete(self):
        self.cubo.objetos.pop(self.name, None)


class _Instante:
    def __init__(self, t):
        self.t = t

    def timestamp(self):
        return self.t


class _Cubo:
    def __init__(self):
        self.objetos = {}

    def blob(self, nombre):
        return _Blob(self, nombre)


URN = 'multi-tenant/proyectos/OBRA/planos/A-101.pdf'


@pytest.fixture
def entorno(monkeypatch):
    hechas = []
    monkeypatch.setattr(gcs_manager, 'get_or_create_thumbnail',
                        lambda u, px=420, *a, **k: hechas.append(('miniatura', u)) or (b'x', 'image/jpeg'))
    monkeypatch.setattr(gcs_manager, 'crear_vista_previa',
                        lambda u: hechas.append(('vista', u)))
    monkeypatch.setattr(mosaicos_almacen, 'preparar',
                        lambda u: hechas.append(('mosaico', u)) or True)
    return _Cubo(), hechas


def test_prepara_las_tres_cosas_en_orden_y_quita_la_marca(entorno):
    cubo, hechas = entorno
    assert doc._preparar_un_pdf(cubo, URN) == 'hecho'
    assert [h[0] for h in hechas] == ['miniatura', 'vista', 'mosaico']
    assert cubo.objetos == {}, 'al terminar no queda marca'


def test_un_plano_con_marca_reciente_se_salta(entorno):
    cubo, hechas = entorno
    cubo.objetos[URN + doc._SUFIJO_MARCA] = time.time() - 3600   # el proceso cayo hace 1 h
    assert doc._preparar_un_pdf(cubo, URN) == 'saltado'
    assert hechas == [], 'no se vuelve a dibujar el plano que tumbo el servidor'


def test_una_marca_vieja_se_reintenta(entorno):
    cubo, hechas = entorno
    cubo.objetos[URN + doc._SUFIJO_MARCA] = time.time() - doc._MARCA_CADUCA_S - 60
    assert doc._preparar_un_pdf(cubo, URN) == 'hecho'
    assert len(hechas) == 3


def test_un_error_no_deja_la_marca_puesta(entorno, monkeypatch):
    cubo, _hechas = entorno

    def falla(u):
        raise RuntimeError('pdf roto')
    monkeypatch.setattr(mosaicos_almacen, 'preparar', falla)
    with pytest.raises(RuntimeError):
        doc._preparar_un_pdf(cubo, URN)
    assert cubo.objetos == {}, 'solo una CAIDA del proceso deja la marca'


def test_mientras_trabaja_la_marca_esta_puesta(entorno, monkeypatch):
    cubo, _hechas = entorno
    vista = {}
    monkeypatch.setattr(gcs_manager, 'crear_vista_previa',
                        lambda u: vista.setdefault('marca', URN + doc._SUFIJO_MARCA in cubo.objetos))
    doc._preparar_un_pdf(cubo, URN)
    assert vista['marca'] is True


def test_se_encola_un_trabajo_por_pdf_sin_repetir(entorno, monkeypatch):
    cubo, _hechas = entorno
    trabajos = []

    class _Cola:
        def submit(self, fn, *a, **k):
            trabajos.append(fn)
    monkeypatch.setattr(doc, '_COLA_MINIATURAS', _Cola())

    class _Cliente:
        def bucket(self, nombre):
            return cubo
    monkeypatch.setattr(gcs_manager, 'get_storage_client', lambda: _Cliente())
    doc._MINIATURAS_ENCOLADAS.clear()
    urns = [URN, URN.replace('A-101', 'A-102')]
    assert doc._encolar_preparacion_completa(urns) == 2
    assert doc._encolar_preparacion_completa(urns) == 0, 'lo ya encolado no se repite'
    for t in trabajos:
        t()
    assert not doc._MINIATURAS_ENCOLADAS
    doc._MINIATURAS_ENCOLADAS.clear()


def test_la_cola_es_de_un_solo_hilo():
    assert doc._COLA_MINIATURAS._max_workers == 1


def test_contar_dice_cuantos_faltan_sin_preparar_nada(entorno, monkeypatch):
    """Antes de lanzar la preparacion de noche: cuantos PDF no tienen vista previa o mosaico."""
    cubo, hechas = entorno
    a, b, c = (URN.replace('A-101', n) for n in ('A-1', 'A-2', 'A-3'))
    import mosaicos_almacen as ma
    cubo.objetos[gcs_manager.nombre_de_vista_previa(a)] = time.time()
    cubo.objetos[ma.nombre_manifiesto(a)] = time.time()            # A-1 completo
    cubo.objetos[gcs_manager.nombre_de_vista_previa(b)] = time.time()  # A-2 sin mosaico
    cubo.objetos[c + doc._SUFIJO_MARCA] = time.time() - 60          # A-3 nada y cayo hace 1 min

    class _Cliente:
        def bucket(self, nombre):
            return cubo
    monkeypatch.setattr(gcs_manager, 'get_storage_client', lambda: _Cliente())
    assert doc._contar_pendientes([a, b, c]) == {
        'total': 3, 'sin_vista_previa': 1, 'sin_mosaico': 2, 'pendientes': 2, 'interrumpidos': 1}
    assert hechas == [], 'contar no prepara nada'


@pytest.fixture
def ruta(monkeypatch):
    """La ruta real con la obra de 2.061 PDF reducida a cuatro y el almacen simulado."""
    import contextlib
    from flask import Flask
    import db

    urns = [URN.replace('A-101', n) for n in ('ROTO', 'A-2', 'A-3', 'A-4')]

    class _Cursor:
        def execute(self, *a):
            pass

        def fetchall(self):
            return [(u,) for u in urns]

    class _Conn:
        def cursor(self):
            return _Cursor()

    rotos, encolados = set(), []
    monkeypatch.setattr(db, 'get_db_connection', lambda: contextlib.nullcontext(_Conn()))
    monkeypatch.setattr(doc, 'verify_project_access', lambda user, urn: True)
    monkeypatch.setattr(gcs_manager, 'get_or_create_thumbnail',
                        lambda u, px=420, *a, **k: (None, None) if u in rotos else (b'x', 'image/jpeg'))
    monkeypatch.setattr(doc, '_encolar_preparacion_completa', lambda us: encolados.extend(us) or len(us))
    app = Flask(__name__)

    def pedir():
        with app.test_request_context('/api/docs/miniaturas/preparar', method='POST',
                                      json={'model_urn': 'proyectos/OBRA', 'completa': True}):
            r = doc.preparar_miniaturas()
            cuerpo, codigo = (r[0], r[1]) if isinstance(r, tuple) else (r, r.status_code)
            return codigo, cuerpo.get_json()

    return urns, rotos, encolados, pedir


def test_un_plano_roto_no_frena_la_obra(ruta):
    urns, rotos, encolados, pedir = ruta
    rotos.add(urns[0])          # 21-oct-2026: el primero de PQT8 fallo y freno 1.588
    codigo, cuerpo = pedir()
    assert codigo == 200 and cuerpo['success'] is True
    assert encolados == urns


def test_si_fallan_todos_es_el_servidor_y_no_arranca(ruta):
    urns, rotos, encolados, pedir = ruta
    rotos.update(urns)
    codigo, cuerpo = pedir()
    assert codigo == 500 and cuerpo['code'] == 'RASTER_FALLA'
    assert encolados == []
