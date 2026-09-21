# -*- coding: utf-8 -*-
"""EL ALMACEN DE LOS MOSAICOS: lo que no puede fallar en un servidor pequeño.

  1. el manifiesto se sube el ULTIMO y solo si subieron TODAS las teselas: si
     no, prometeria teselas que no estan (y nadie lo volveria a preparar);
  2. una lamina que se esta usando para dibujar no se cierra nunca, aunque se
     pase del tope de abiertas;
  3. a demanda solo se devuelven las teselas que de verdad estan en el almacen;
  4. la cache de PDF en disco no deja ficheros a medias ni huerfanos: el
     servidor se recicla cada ~300 peticiones y llenaria el disco.
"""
import threading

import pytest

import mosaicos
import mosaicos_almacen as alm

BLOB = 'multi-tenant/b.proj_obra/1787962081_aaaaaaaa_LAMINA.pdf'
MAN = {'tesela': 512, 'extension': 'webp', 'hoja_mm': [841.0, 594.0], 'preparados': [0, 1],
       'niveles': [{'z': z, 'ancho': 1500 * 2 ** z, 'alto': 1060 * 2 ** z,
                    'columnas': 3 * 2 ** z, 'filas': 3 * 2 ** z} for z in range(4)]}


class _Blob:
    def __init__(self, cubo, nombre):
        self.cubo, self.name, self.cache_control, self.size = cubo, nombre, None, 1000

    def upload_from_string(self, datos, content_type=None):
        if self.name in self.cubo.rotas:
            raise IOError('corte de red')
        with self.cubo.candado:
            self.cubo.subidas.append(self.name)
            self.cubo.objetos[self.name] = datos

    def download_as_text(self):
        from google.cloud.exceptions import NotFound
        if self.name not in self.cubo.objetos:
            raise NotFound('no esta')
        return self.cubo.objetos[self.name].decode('utf-8')

    def reload(self):
        pass

    def download_to_file(self, f):
        f.write(b'%PDF-1.7 de mentira')


class _Cubo:
    def __init__(self):
        self.objetos, self.subidas, self.rotas = {}, [], set()
        self.candado = threading.Lock()

    def blob(self, nombre):
        return _Blob(self, nombre)

    def list_blobs(self, prefix=''):
        return [_Blob(self, n) for n in list(self.objetos) if n.startswith(prefix)]


@pytest.fixture
def cubo(monkeypatch):
    c = _Cubo()
    monkeypatch.setattr(alm, '_bucket', lambda: c)
    import gcs_manager
    monkeypatch.setattr(gcs_manager, 'nombre_inmutable', lambda blob: True)
    return c


# ── 1 · preparar ────────────────────────────────────────────────────────────

def _preparar_de_mentira(ruta, escribir, **k):
    for (x, y) in [(0, 0), (1, 0), (0, 1)]:
        escribir(0, x, y, b'tesela')
    return dict(MAN, preparados=[0]), {'teselas': 3, 'bytes': 18, 'ms': 1}


def test_el_manifiesto_se_sube_el_ultimo(cubo, monkeypatch):
    monkeypatch.setattr(mosaicos, 'preparar', _preparar_de_mentira)
    assert alm.preparar(BLOB) is True
    assert cubo.subidas[-1] == alm.nombre_manifiesto(BLOB)
    assert sorted(cubo.subidas[:-1]) == sorted(alm.nombre_tesela(BLOB, 0, x, y) for (x, y) in [(0, 0), (1, 0), (0, 1)])


def test_si_una_tesela_no_sube_no_hay_manifiesto(cubo, monkeypatch):
    monkeypatch.setattr(mosaicos, 'preparar', _preparar_de_mentira)
    cubo.rotas.add(alm.nombre_tesela(BLOB, 0, 1, 0))
    assert alm.preparar(BLOB) is False
    assert alm.nombre_manifiesto(BLOB) not in cubo.objetos, \
        'un manifiesto que promete una tesela que no esta no se vuelve a preparar nunca'
    # y la siguiente vez se reintenta entero
    cubo.rotas.clear()
    assert alm.preparar(BLOB) is True
    assert alm.nombre_manifiesto(BLOB) in cubo.objetos


def test_lo_que_ya_esta_preparado_no_se_repite(cubo, monkeypatch):
    llamadas = []
    monkeypatch.setattr(mosaicos, 'preparar', lambda *a, **k: llamadas.append(1) or _preparar_de_mentira(*a, **k))
    assert alm.preparar(BLOB) is True
    assert alm.preparar(BLOB) is True
    assert len(llamadas) == 1


# ── 2 · las laminas abiertas ────────────────────────────────────────────────

class _Doc:
    cerrados = []

    def __init__(self, ruta):
        self.ruta = ruta

    def load_page(self, n):
        return self

    def get_displaylist(self):
        return ('lista', self.ruta)

    def close(self):
        _Doc.cerrados.append(self.ruta)


@pytest.fixture
def laminas(cubo, monkeypatch, tmp_path):
    class _Motor:
        open = staticmethod(_Doc)
    monkeypatch.setattr(mosaicos, '_motor', lambda: _Motor)
    monkeypatch.setattr(alm, 'LAMINAS_ABIERTAS', 2)
    _Doc.cerrados = []
    L = alm._Laminas()
    L.carpeta = str(tmp_path)
    rutas = {}

    def abrir(blob):
        cm = L.abierta(cubo, blob)
        lista = cm.__enter__()
        rutas[blob] = lista[1]
        return cm
    return L, abrir, rutas


def test_una_lamina_en_uso_no_se_cierra_aunque_sobre(laminas):
    L, abrir, rutas = laminas
    a = abrir('A')                       # A en uso todo el rato
    abrir('B').__exit__(None, None, None)
    abrir('C').__exit__(None, None, None)   # tres abiertas con tope 2: sobra una
    assert rutas['A'] not in _Doc.cerrados, 'A se esta usando: cerrarla romperia el dibujo en marcha'
    assert rutas['B'] in _Doc.cerrados, 'sale la menos usada que NO esta en uso'
    a.__exit__(None, None, None)
    assert len(L._abiertas) == 2


def test_la_menos_usada_es_la_que_sale(laminas):
    L, abrir, rutas = laminas
    abrir('A').__exit__(None, None, None)
    abrir('B').__exit__(None, None, None)
    abrir('A').__exit__(None, None, None)   # A vuelve a usarse
    abrir('C').__exit__(None, None, None)
    assert rutas['B'] in _Doc.cerrados and rutas['A'] not in _Doc.cerrados


# ── 3 · a demanda ───────────────────────────────────────────────────────────

def test_a_demanda_solo_se_devuelven_las_que_estan(cubo, laminas, monkeypatch):
    monkeypatch.setattr(alm, '_LAMINAS', laminas[0])
    monkeypatch.setattr(mosaicos, 'tesela_a_demanda', lambda fuente, man, z, x, y: b'webp')
    cubo.objetos[alm.nombre_tesela(BLOB, 3, 1, 1)] = b'ya estaba'
    cubo.rotas.add(alm.nombre_tesela(BLOB, 3, 2, 2))
    listas = alm.asegurar_teselas(BLOB, MAN, 3, [(1, 1), (2, 1), (2, 2)])
    assert sorted(listas) == [(1, 1), (2, 1)], 'la que no subio no se entrega: su URL daria 404'
    assert alm.nombre_tesela(BLOB, 3, 1, 1) not in cubo.subidas, 'la que ya estaba no se vuelve a dibujar'


def test_las_de_un_nivel_preparado_no_se_tocan(cubo, monkeypatch):
    monkeypatch.setattr(mosaicos, 'tesela_a_demanda',
                        lambda *a: (_ for _ in ()).throw(AssertionError('no se dibuja')))
    assert alm.asegurar_teselas(BLOB, MAN, 1, [(0, 0), (5, 5)]) == [(0, 0), (5, 5)]
    assert cubo.subidas == []


# ── 4 · la cache de PDF en disco ────────────────────────────────────────────

def test_la_cache_de_pdf_no_deja_ficheros_a_medias_y_su_nombre_es_estable(cubo, monkeypatch, tmp_path):
    import hashlib
    import os
    L = alm._Laminas()
    L.carpeta = str(tmp_path)

    def cortada(bucket, blob, destino):
        with open(destino, 'wb') as f:
            f.write(b'%PDF-1.7 a medi')
        raise IOError('corte de red')
    monkeypatch.setattr(alm, '_bajar_a_disco', cortada)
    with pytest.raises(IOError):
        L._ruta_pdf(cubo, BLOB)
    assert not [n for n in os.listdir(tmp_path) if n.endswith('.pdf')], \
        'un PDF cortado a medias pasaria por bueno la vez siguiente'

    def entera(bucket, blob, destino):
        with open(destino, 'wb') as f:
            f.write(b'%PDF-1.7 entero')
        return True
    monkeypatch.setattr(alm, '_bajar_a_disco', entera)
    ruta = L._ruta_pdf(cubo, BLOB)
    assert open(ruta, 'rb').read() == b'%PDF-1.7 entero'
    # El nombre no puede depender del proceso (`hash()` cambia en cada uno).
    assert os.path.basename(ruta) == hashlib.sha1(BLOB.encode('utf-8')).hexdigest()[:24] + '.pdf'


def test_cada_proceso_empieza_con_la_cache_vacia(monkeypatch, tmp_path):
    import os
    import tempfile
    vieja = tmp_path / 'alephia-mosaicos'
    vieja.mkdir()
    (vieja / 'de_un_proceso_anterior.pdf').write_bytes(b'x' * 1000)
    monkeypatch.setattr(tempfile, 'gettempdir', lambda: str(tmp_path))
    L = alm._Laminas()
    assert os.listdir(L.carpeta) == [], 'lo que dejo otro proceso no lo lleva nadie: llenaria el disco'
