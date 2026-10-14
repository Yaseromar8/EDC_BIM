"""Que toda escritura del registro entre SELLADA, y que las huellas se reparen.

QUE FIJA ESTO (14-oct-2026)
---------------------------
Revisión de la trazabilidad (docs/ux/PROPUESTA_CONSULTA_Y_TRAZABILIDAD.md §5 y §7):

  A. Cuatro vías insertaban en `activity_log` a mano, fuera de la cadena: la
     retirada de una aprobación al subir una versión, las reservas, los accesos y
     el «suprimido» por documento de los borrados en lote. Ahora pasan por
     `registrar_actividad`, que sella.
  I. Un fallo AL SELLAR abortaba la transacción de quien llamaba. Ahora el sellado
     va en un SAVEPOINT: si falla, el evento se escribe sin sello -- que la
     verificación señala -- y la operación sigue.
  B. Una huella que fallaba en segundo plano no se reintentaba nunca.
"""
import db
import integridad


class CursorQueApunta:
    """Anota cada sentencia. `falla_en` hace fallar la primera que la contenga."""

    def __init__(self, falla_en=None):
        self.sentencias = []
        self.params = []
        self.falla_en = falla_en
        self._u = None

    def execute(self, sql, params=None):
        s = ' '.join(sql.split())
        self.sentencias.append(s)
        self.params.append(params)
        if self.falla_en and self.falla_en in s:
            self.falla_en = None
            raise RuntimeError('fallo simulado')
        if 'ORDER BY id DESC LIMIT 1' in s:
            self._u = ('a' * 64,)
        elif s.startswith('INSERT INTO activity_log'):
            self._u = (99,)
        else:
            self._u = None

    def fetchone(self):
        return self._u


def _insert(c):
    i = [k for k, s in enumerate(c.sentencias) if s.startswith('INSERT INTO activity_log')]
    assert len(i) == 1, c.sentencias
    return c.params[i[0]]


# ── I · el sellado no puede tumbar la operación ────────────────────────────

def test_se_sella_dentro_de_un_savepoint():
    c = CursorQueApunta()
    db.registrar_actividad(c, 'obra', 'upload', 'file', 'd1', 'p.pdf', 'ana', {})
    assert c.sentencias[0] == 'SAVEPOINT sello_de_actividad'
    assert 'RELEASE SAVEPOINT sello_de_actividad' in c.sentencias
    p = _insert(c)
    assert p[-2] == 'a' * 64 and p[-1] is not None      # hash_anterior y hash


def test_si_sellar_falla_el_evento_se_escribe_sin_sello():
    """Antes: la transacción quedaba abortada y el INSERT fallaba detrás."""
    c = CursorQueApunta(falla_en='pg_advisory_xact_lock')
    db.registrar_actividad(c, 'obra', 'upload', 'file', 'd1', 'p.pdf', 'ana', {})
    assert 'ROLLBACK TO SAVEPOINT sello_de_actividad' in c.sentencias
    p = _insert(c)
    assert p[-2] is None and p[-1] is None


def test_si_falla_el_propio_insert_se_sigue_avisando():
    """El contrato de REVIEWS-R01: si el evento NO se puede escribir, se sabe."""
    c = CursorQueApunta(falla_en='INSERT INTO activity_log')
    try:
        db.registrar_actividad(c, 'obra', 'review_created', 'review', 'r1', 'R', 'ana', {})
    except RuntimeError:
        return
    raise AssertionError('un INSERT fallido no puede pasar en silencio')


# ── A · las cuatro vías pasan por la sellada ───────────────────────────────

def _espia(monkeypatch):
    llamadas = []
    monkeypatch.setattr(db, 'registrar_actividad',
                        lambda cur, *a, **k: llamadas.append(a))
    return llamadas


def test_la_reserva_entra_sellada(monkeypatch):
    import bloqueo_de_edicion as b
    llamadas = _espia(monkeypatch)
    b._auditar(object(), 'obra', 'n1', 'plano.pdf', 'reserva_retirada', 'luis',
               {'reserva_de': 'ana', 'forzada': True})
    assert llamadas and llamadas[0][1] == 'reserva_retirada'
    assert llamadas[0][6] == {'reserva_de': 'ana', 'forzada': True}


def test_la_retirada_de_una_aprobacion_entra_sellada(monkeypatch):
    import file_system_db as fs
    llamadas = _espia(monkeypatch)
    fs._registrar_vuelta_a_borrador(object(), 'obra', 'n1', 'plano.pdf', 'PUBLISHED', 4, 'ana')
    accion, detalle = llamadas[0][1], llamadas[0][6]
    assert accion == 'cambio_de_estado'
    assert detalle['estado_anterior'] == 'PUBLISHED'
    assert 'version 4' in detalle['motivo']


def test_no_queda_ningun_insert_a_mano_en_activity_log():
    """La regla, para que la quinta vía no nazca igual: fuera de `db.py` (que es
    la vía sellada) y de `estados_ecd.py` (que sella en el propio INSERT), nadie
    escribe en activity_log con un INSERT propio."""
    import os
    import re
    raiz = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    permitidos = {'db.py', 'estados_ecd.py'}
    culpables = []
    for d, dirs, fs in os.walk(raiz):
        dirs[:] = [x for x in dirs if x not in ('venv', 'tests', 'herramientas', '__pycache__', 'alembic')]
        for f in fs:
            if not f.endswith('.py') or f in permitidos:
                continue
            texto = open(os.path.join(d, f), encoding='utf-8', errors='ignore').read()
            if re.search(r'INSERT\s+INTO\s+activity_log', texto):
                culpables.append(os.path.relpath(os.path.join(d, f), raiz))
    assert culpables == [], f'INSERT a mano fuera de la cadena en: {culpables}'


# ── B · huellas pendientes ─────────────────────────────────────────────────

class CursorVersiones:
    def __init__(self, filas):
        self.filas, self.sql, self.params = filas, None, None

    def execute(self, sql, params=None):
        self.sql, self.params = ' '.join(sql.split()), params

    def fetchall(self):
        return self.filas


def test_busca_solo_las_que_no_tienen_huella_y_tienen_objeto():
    c = CursorVersiones([('v1', 'gcs/1')])
    assert integridad.versiones_sin_huella(c, 'obra') == [('v1', 'gcs/1')]
    assert 'fv.sha256 IS NULL' in c.sql and 'fv.gcs_urn IS NOT NULL' in c.sql
    assert 'is_deleted' in c.sql
    assert c.params == ('obra', integridad.TOPE_PENDIENTES)


def test_sella_en_serie_y_cuenta_las_que_salieron():
    hechas = []

    def sellar(v, u):
        hechas.append(v)
        return None if v == 'v2' else 'f' * 64     # la v2 vuelve a fallar

    n = integridad.sellar_pendientes([('v1', 'a'), ('v2', 'b'), ('v3', 'c')], sellar=sellar)
    assert hechas == ['v1', 'v2', 'v3']
    assert n == 2


# ── La ruta de trazabilidad ampliada (14-oct-2026) ─────────────────────────
# `/api/docs/trazabilidad` existía y ninguna pantalla la usaba. Ahora devuelve,
# además, la HUELLA de cada versión, el HISTORIAL de emisiones, si cada evento
# está SELLADO y el estado de la CADENA en los eventos del documento; y relanza
# el sellado de las versiones que se quedaron sin huella.

import datetime as _dt

import auditoria_encadenada as _cadena

_T = _dt.datetime(2026, 10, 12, 17, 18, tzinfo=_dt.timezone.utc)


def _fila_cadena(fid, eid, anterior):
    c = {'model_urn': 'obra', 'action': 'x', 'entity_type': 'file', 'entity_id': eid,
         'entity_name': None, 'performed_by': 'ana', 'details': {}, 'created_at': _T}
    h = _cadena.huella_de_fila(anterior, c)
    return (fid, 'obra', 'x', 'file', eid, None, 'ana', {}, _T, anterior, h), h


def _app(monkeypatch, cadena_filas, eventos):
    from flask import Flask, g
    import routes.documents as documents
    import file_system_db
    monkeypatch.setattr(documents, 'verify_project_access', lambda *_: True)
    # El permiso de carpeta (14-oct-2026) tiene su propia prueba, abajo: aquí se concede.
    import permiso_documental
    monkeypatch.setattr(permiso_documental, 'guardia', lambda *a, **k: None)
    monkeypatch.setenv('GCS_BUCKET_NAME', 'cubo-de-prueba')
    lanzadas = []
    monkeypatch.setattr(file_system_db.gcs_executor, 'submit',
                        lambda f, *a: lanzadas.append(a))

    class Db:
        def __enter__(self): return self
        def __exit__(self, *_): return False
        def cursor(self): return self

        def execute(self, sql, params=None):
            s = ' '.join(sql.split())
            if 'FROM file_nodes WHERE id' in s:
                self.r = [('obra', 'P.pdf', 'PUBLISHED', 'A1', 'C02')]
            elif 'FROM activity_log WHERE entity_id' in s:
                self.r = eventos
            elif 'FROM file_versions WHERE file_node_id' in s:
                self.r = [(2, 'C02', 'A1', _T, 'luis', _T, 'eva', 'v2', 'f' * 64, _T, 'gcs/2'),
                          (1, 'C01', None, None, None, _T, 'eva', 'v1', None, None, 'gcs/1')]
            elif 'to_regclass' in s:
                self.r = [(True,)]
            elif 'FROM file_emisiones' in s:
                self.r = [('SHARED', 'S2', 'C01', 'luis', _T, 1),
                          ('PUBLISHED', 'A1', 'C02', 'luis', _T, 2)]
            elif 'ORDER BY id ASC' in s:
                self.r = cadena_filas
            else:
                self.r = []

        def fetchone(self): return self.r[0] if self.r else None
        def fetchall(self): return self.r

    import db
    monkeypatch.setattr(db, 'get_db_connection', lambda: Db())
    app = Flask(__name__)
    app.register_blueprint(documents.documents_bp)
    app.before_request(lambda: setattr(g, 'current_user', {'id': 1, 'role': 'user'}))
    return app.test_client(), lanzadas


def test_la_ruta_da_huellas_emisiones_y_cadena_integra(monkeypatch):
    f4, h4 = _fila_cadena(4, 'otro', _cadena.GENESIS)
    f5, _h5 = _fila_cadena(5, 'doc-1', h4)
    eventos = [(5, 'cambio_de_estado', 'luis', {}, _T, True)]
    cliente, lanzadas = _app(monkeypatch, [f4, f5], eventos)
    r = cliente.get('/api/docs/trazabilidad?id=doc-1').json
    assert r['success'] is True
    assert r['versiones'][0]['huella'] == 'f' * 64
    assert r['versiones'][1]['huella'] is None
    assert [e['destino'] for e in r['emisiones']] == ['SHARED', 'PUBLISHED']
    assert r['eventos'][0]['sellado'] is True
    assert r['cadena'] == {'eventos': 1, 'sellados': 1, 'roturas': [], 'tramo_integro': True}
    # La V1 no tiene huella y sí objeto: se relanza su sellado.
    assert r['huellas_en_curso'] == 1
    assert lanzadas == [([('v1', 'gcs/1')],)]


def test_la_ruta_senala_un_evento_del_documento_escrito_sin_sellar(monkeypatch):
    f4, h4 = _fila_cadena(4, 'otro', _cadena.GENESIS)
    sin = (6, 'obra', 'acceso_a_documento', 'file', 'doc-1', None, 'ana', {}, _T, None, None)
    eventos = [(6, 'acceso_a_documento', 'ana', {}, _T, False)]
    cliente, _ = _app(monkeypatch, [f4, sin], eventos)
    r = cliente.get('/api/docs/trazabilidad?id=doc-1').json
    assert r['cadena']['sellados'] == 0
    assert r['cadena']['tramo_integro'] is False
    assert [x['motivo'] for x in r['cadena']['roturas']] == ['sin huella']


def test_la_ruta_respeta_el_permiso_de_la_carpeta(monkeypatch):
    """Ser de la obra no basta: si la carpeta esconde el documento, su historia tampoco se lee."""
    from flask import jsonify
    cliente, _ = _app(monkeypatch, [], [])
    import permiso_documental
    pedidos = []
    def negar(cur, usuario, obra, accion, minimo='viewer', node_id=None, **k):
        pedidos.append((obra, minimo, node_id))
        return jsonify({'success': False, 'error': 'Sin permiso en esta carpeta'}), 403
    monkeypatch.setattr(permiso_documental, 'guardia', negar)
    r = cliente.get('/api/docs/trazabilidad?id=doc-1')
    assert r.status_code == 403
    assert pedidos == [('obra', 'viewer', 'doc-1')]
