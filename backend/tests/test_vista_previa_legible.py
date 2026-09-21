# -*- coding: utf-8 -*-
"""LA VISTA PREVIA LEGIBLE DE UNA LAMINA: misma puerta que el PDF original.

POR QUE ESTE TEST
-----------------
Una lamina de 72 MB tarda 45-50 s en dibujarse. La vista previa de 2000 px la
enseña legible en 1,1 s mientras el PDF baja por detras. Pero una imagen de
2000 px de un plano ES EL PLANO: si se sirviera por la ruta de las miniaturas
--que solo comprueba pertenencia a la obra-- se abriria una puerta mas floja
que la del propio documento, y justo para el contenido que importa.

Lo que se fija aqui:
  1. la puerta es `_acceso_al_recurso`, la del PDF: sesion, obra, documento o
     version, y permiso documental;
  2. va ligada a la VERSION: una version fijada enseña la suya, y una version
     de otro documento no existe;
  3. sin acceso no se filtra nada -- ni nombre, ni imagen, ni la existencia;
  4. nunca se prepara durante la apertura: se encola UNA vez aunque abran dos a
     la vez, y mientras tanto el lector sigue como hoy.
"""
import re
import threading
import time

import pytest
from flask import Flask, g, jsonify

import gcs_manager
import routes.documents as doc

OBRA = 'b.proj_obra'
P = 'multi-tenant/%s/' % OBRA
VIVA = P + '1787962081_aaaaaaaa_LAMINA.pdf'        # la version de hoy
ANTERIOR = P + '1787962080_99999999_LAMINA.pdf'    # su version anterior
HOJA_DE_CALCULO = P + '1787962082_cccccccc_METRADO.xlsx'
NODO = '00000000-0000-4000-8000-00000000d0c1'
OTRO_NODO = '00000000-0000-4000-8000-00000000d0c2'
V_VIVA = '00000000-0000-4000-8000-00000000fe02'
V_ANTERIOR = '00000000-0000-4000-8000-00000000fe01'
V_DE_OTRO_DOCUMENTO = '00000000-0000-4000-8000-00000000fe99'
EDITOR = {'id': 7, 'email': 'residente@obra.test', 'role': 'editor'}

NODOS = {NODO: VIVA, OTRO_NODO: HOJA_DE_CALCULO}
VERSIONES = {                                   # version -> (objeto, documento)
    V_VIVA: (VIVA, NODO),
    V_ANTERIOR: (ANTERIOR, NODO),
    V_DE_OTRO_DOCUMENTO: (HOJA_DE_CALCULO, OTRO_NODO),
}


def _respuesta(r):
    resp, codigo = r if isinstance(r, tuple) else (r, r.status_code)
    return codigo, resp.get_json()


class _Cursor:
    """Responde a las dos consultas que hace la vista, y a nada mas."""

    def __init__(self, registro):
        self.registro = registro
        self._fila = None

    def execute(self, sql, parametros=()):
        self.registro.append(' '.join(sql.split())[:60])
        if 'FROM file_versions' in sql:
            self._fila = VERSIONES.get(parametros[0])
            if self._fila:
                self._fila = (self._fila[0], self._fila[1])
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
    estado = {'preparadas': {VIVA, ANTERIOR}, 'obra': OBRA, 'acceso': True,
              'permiso': True, 'consultas': [], 'encoladas': [], 'trabajos': []}

    import db as _db
    monkeypatch.setattr(_db, 'get_db_connection', lambda *a, **k: _Conexion(estado['consultas']))

    # El almacen: solo se le pregunta si la vista previa ESTA, nunca se baja.
    monkeypatch.setattr(gcs_manager, 'vista_previa_lista',
                        lambda urn: urn in estado['preparadas'])
    monkeypatch.setattr(doc, 'generate_signed_url',
                        lambda nombre, *a, **k: 'https://firmada.test/' + nombre.rsplit('/', 1)[-1])

    # La cadena de autorizacion real, con sus dos decisiones pinchadas.
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

    # La cola, sin hilos: se anota lo que se habria preparado.
    class _Cola:
        def submit(self, fn, *a, **k):
            estado['trabajos'].append(fn)
            return None
    monkeypatch.setattr(doc, '_COLA_MINIATURAS', _Cola())
    monkeypatch.setattr(gcs_manager, 'crear_vista_previa',
                        lambda urn: estado['encoladas'].append(urn))
    doc._MINIATURAS_ENCOLADAS.clear()

    app = Flask(__name__)

    def pedir(cuerpo, usuario=EDITOR):
        with app.test_request_context('/api/docs/vista-previa/url', method='POST', json=cuerpo):
            if usuario is not None:
                g.current_user = usuario
            return _respuesta(doc.url_de_vista_previa())
    return pedir, estado


def _correr(estado):
    """Ejecuta lo que se encolo, como haria la cola de dos hilos."""
    trabajos, estado['trabajos'] = estado['trabajos'], []
    for t in trabajos:
        t()


# ── 1 · lo que se entrega ───────────────────────────────────────────────────

def test_la_lamina_preparada_devuelve_su_vista_previa(banco):
    pedir, estado = banco

    codigo, d = pedir({'node_id': NODO})

    assert codigo == 200
    assert d == {'success': True, 'pendiente': False,
                 'url': 'https://firmada.test/1787962081_aaaaaaaa_LAMINA.pdf__thumb1500.jpg'}
    assert estado['trabajos'] == [], 'lo que ya esta hecho no se vuelve a preparar'


def test_lo_que_no_es_pdf_no_tiene_vista_previa(banco):
    pedir, estado = banco

    codigo, d = pedir({'node_id': OTRO_NODO})

    assert (codigo, d) == (200, {'success': True, 'url': None, 'pendiente': False})
    assert estado['trabajos'] == []


# ── 2 · ligada a la version ─────────────────────────────────────────────────

def test_la_version_fijada_enseña_la_suya_y_no_la_viva(banco):
    pedir, _estado = banco

    codigo, d = pedir({'node_id': NODO, 'version_id': V_ANTERIOR})

    assert codigo == 200
    assert d['url'].endswith('1787962080_99999999_LAMINA.pdf__thumb1500.jpg'), \
        'la vista previa tiene que ser la del objeto de ESA version'


def test_una_version_de_otro_documento_no_existe(banco):
    pedir, estado = banco

    codigo, d = pedir({'node_id': NODO, 'version_id': V_DE_OTRO_DOCUMENTO})

    assert codigo == 404
    assert d == {'success': False, 'error': 'Documento no encontrado'}
    assert estado['trabajos'] == [], 'ni siquiera se encola lo que no se puede ver'


def test_una_version_inventada_no_existe(banco):
    pedir, _estado = banco

    codigo, d = pedir({'node_id': NODO, 'version_id': '00000000-0000-4000-8000-0000000000ff'})

    assert codigo == 404
    assert d == {'success': False, 'error': 'Documento no encontrado'}


# ── 3 · la misma puerta que el PDF ──────────────────────────────────────────

def test_sin_sesion_no_se_entrega(banco):
    pedir, estado = banco

    codigo, d = pedir({'node_id': NODO}, usuario=None)

    assert codigo == 401
    assert 'url' not in d
    assert estado['trabajos'] == []


def test_de_otra_obra_no_se_ve(banco):
    pedir, estado = banco
    estado['acceso'] = False

    codigo, d = pedir({'node_id': NODO})

    assert codigo == 403
    assert 'url' not in d and 'LAMINA' not in str(d), 'ni el nombre del fichero'
    assert estado['trabajos'] == []


def test_sin_permiso_documental_no_hay_vista_previa(banco):
    pedir, estado = banco
    estado['permiso'] = False

    codigo, d = pedir({'node_id': NODO})

    assert codigo == 403
    assert d['code'] == 'SIN_PERMISO_DOCUMENTAL'
    assert 'url' not in d and 'LAMINA' not in str(d)
    assert estado['trabajos'] == []


def test_si_no_se_puede_decidir_no_se_entrega(banco, monkeypatch):
    """Fail-closed: un fallo al resolver el documento no abre la puerta."""
    pedir, estado = banco
    import db as _db

    def _revienta(*a, **k):
        raise RuntimeError('base de datos caida')
    monkeypatch.setattr(_db, 'get_db_connection', _revienta)

    codigo, d = pedir({'node_id': NODO})

    assert codigo == 503
    assert 'url' not in d
    assert estado['trabajos'] == []


def test_la_puerta_es_literalmente_la_del_pdf():
    """No vale una puerta parecida: tiene que ser la misma funcion."""
    import inspect
    fuente = inspect.getsource(doc.url_de_vista_previa)
    assert '_acceso_al_recurso(' in fuente
    assert re.search(r'_acceso_al_recurso\([^)]*gcs_urn=', fuente)
    assert re.search(r'_acceso_al_recurso\([^)]*version_id=', fuente)
    # Y no puede colarse por la de las miniaturas, que solo mira la obra.
    assert 'verify_project_access' not in fuente


# ── 4 · nunca se prepara durante la apertura ────────────────────────────────

def test_lo_que_falta_se_encola_una_vez_y_el_lector_sigue(banco):
    pedir, estado = banco
    estado['preparadas'] = set()

    codigo, d = pedir({'node_id': NODO})

    assert (codigo, d) == (200, {'success': True, 'url': None, 'pendiente': True})
    assert len(estado['trabajos']) == 1, 'se prepara en segundo plano, no aqui'
    _correr(estado)
    assert estado['encoladas'] == [VIVA]


def test_dos_aperturas_a_la_vez_preparan_una_sola(banco):
    pedir, estado = banco
    estado['preparadas'] = set()

    primera = pedir({'node_id': NODO})
    segunda = pedir({'node_id': NODO, 'version_id': V_VIVA})

    assert primera[0] == segunda[0] == 200
    assert primera[1]['pendiente'] and segunda[1]['pendiente']
    assert len(estado['trabajos']) == 1, 'la segunda apertura no encola otra igual'

    # Y cuando la primera termina, la marca se suelta: si sigue faltando, se
    # puede volver a intentar mas adelante.
    _correr(estado)
    assert estado['encoladas'] == [VIVA]
    pedir({'node_id': NODO})
    assert len(estado['trabajos']) == 1


def test_un_historico_pendiente_se_prepara_y_la_siguiente_apertura_ya_la_tiene(banco):
    """El camino de una lamina antigua: pendiente -> encolada una vez -> lista."""
    pedir, estado = banco
    estado['preparadas'] = set()

    codigo, primera = pedir({'node_id': NODO})
    assert (codigo, primera['pendiente'], primera['url']) == (200, True, None)
    assert len(estado['trabajos']) == 1

    # La cola hace su trabajo; a partir de ahi el objeto existe.
    _correr(estado)
    estado['preparadas'].add(VIVA)

    codigo, segunda = pedir({'node_id': NODO})
    assert codigo == 200
    assert segunda['pendiente'] is False
    assert segunda['url'].endswith('__thumb1500.jpg')
    assert estado['trabajos'] == [], 'ya no hay nada que preparar'


def test_dos_hilos_a_la_vez_encolan_una_sola_vez(banco):
    """De verdad a la vez: la marca se pone bajo candado, no por orden de llegada."""
    _pedir, estado = banco
    estado['preparadas'] = set()
    listos = threading.Barrier(8)
    cuentas = []

    def abrir():
        listos.wait()
        cuentas.append(doc._encolar_vistas_previas([VIVA]))

    hilos = [threading.Thread(target=abrir) for _ in range(8)]
    for h in hilos:
        h.start()
    for h in hilos:
        h.join()

    assert sum(cuentas) == 1, 'ocho aperturas simultaneas prepararon %d veces' % sum(cuentas)
    assert len(estado['trabajos']) == 1


def test_la_cola_ocupada_no_frena_a_los_demas(banco, monkeypatch):
    """Con la cola llena de trabajo, abrir otro documento sigue contestando."""
    pedir, estado = banco
    estado['preparadas'] = set()
    atasco = threading.Event()
    cola = doc._ThreadPoolExecutor(max_workers=2, thread_name_prefix='prueba')
    monkeypatch.setattr(doc, '_COLA_MINIATURAS', cola)
    monkeypatch.setattr(gcs_manager, 'crear_vista_previa', lambda urn: atasco.wait(5))
    try:
        for _ in range(4):                     # mas trabajos que hilos: cola llena
            doc._encolar_vistas_previas([VIVA + str(time.time_ns())])

        t0 = time.perf_counter()
        codigo, d = pedir({'node_id': NODO})
        tardo = time.perf_counter() - t0

        assert (codigo, d['pendiente']) == (200, True)
        assert tardo < 0.2, 'con la cola ocupada la peticion tardo %.2f s' % tardo
    finally:
        atasco.set()
        cola.shutdown(wait=False)


def test_la_marca_de_encolado_no_choca_con_la_miniatura(banco):
    pedir, estado = banco
    estado['preparadas'] = set()
    doc._MINIATURAS_ENCOLADAS.add(VIVA)          # la silueta de 420 ya esta en cola

    codigo, _d = pedir({'node_id': NODO})

    assert codigo == 200
    assert len(estado['trabajos']) == 1, 'la vista previa lleva su propia marca'


def test_la_respuesta_no_espera_a_que_se_prepare(banco, monkeypatch):
    """La cola no puede bloquear la peticion: se contesta y se prepara detras."""
    pedir, estado = banco
    estado['preparadas'] = set()
    lento = threading.Event()

    class _ColaLenta:
        def __init__(self):
            self.hilos = []

        def submit(self, fn, *a, **k):
            h = threading.Thread(target=fn, daemon=True)
            self.hilos.append(h)
            h.start()
    monkeypatch.setattr(doc, '_COLA_MINIATURAS', _ColaLenta())
    monkeypatch.setattr(gcs_manager, 'crear_vista_previa',
                        lambda urn: lento.wait(5) or estado['encoladas'].append(urn))

    t0 = time.perf_counter()
    codigo, d = pedir({'node_id': NODO})
    tardo = time.perf_counter() - t0

    assert (codigo, d['pendiente']) == (200, True)
    assert tardo < 0.2, 'la peticion tardo %.2f s: la cola la estaba bloqueando' % tardo
    lento.set()


# ── 5 · la subida deja la vista previa hecha ────────────────────────────────

def test_al_subir_un_pdf_se_prepara_la_vista_previa():
    import io
    import os
    raiz = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    subidas = io.open(os.path.join(raiz, 'routes', 'uploads.py'), encoding='utf-8').read()
    confirmar = io.open(os.path.join(raiz, 'routes', 'documents.py'), encoding='utf-8').read()
    assert 'crear_vista_previa' in subidas, 'la subida por bloques la prepara'
    assert re.search(r"endswith\(\('\.pdf', '\.pdfx'\)\)[\s\S]{0,600}crear_vista_previa", subidas), \
        'y solo para PDF'
    assert 'crear_vista_previa' in confirmar, 'la subida de Multimedia tambien'


def test_el_nombre_lleva_el_tamaño_y_cuelga_de_la_version():
    # 20-sep-2026: de 2000 a 1500 px con mascara de enfoque, A PROPOSITO y medido
    # (docs/archivos/14 §7): la de 2000 se veia palida -- 0,82 % de tinta frente
    # al 3,03 % del lector -- y la nueva recupera el borde, pesa un 22 % menos y
    # se genera 12 veces mas rapido. El candado sigue: cambiarlo tiene que ser
    # igual de deliberado.
    assert gcs_manager.nombre_de_vista_previa(VIVA) == VIVA + '__thumb1500.jpg'
    assert gcs_manager.nombre_de_vista_previa(ANTERIOR) != gcs_manager.nombre_de_vista_previa(VIVA)
    assert (gcs_manager.PX_VISTA_PREVIA, gcs_manager.CALIDAD_VISTA_PREVIA) == (1500, 85)
    assert gcs_manager.ENFOQUE_VISTA_PREVIA == (1.0, 160, 2)
