"""El plan de entregas se cumple solo, pero SOLO cuando no hay ninguna duda (B1, 14-oct-2026).

`sugerir_vinculos` deja escrito por qué no se ata por parecido: atar el plano
equivocado es peor que no atar. `vincular_al_subir` ata al subir únicamente si el
nombre ES el código, hay un solo compromiso libre con él y el formato cuadra.
Estas pruebas fijan los casos que SÍ y, sobre todo, los que NO.
"""
import plan_de_entrega as plan

OBRA = 'obra/PQT8'
COD = '500125-CSSP001-000-XX-DR-DR-004120'


class Cursor:
    def __init__(self, compromisos, vincula=True):
        self.compromisos = compromisos       # [(id, formato)] sin atar con ese código
        self.vincula = vincula
        self.sql = []
        self._u = None

    def execute(self, sql, params=None):
        s = ' '.join(sql.split())
        self.sql.append((s, params))
        if s.startswith('SELECT id, formato FROM plan_entregas'):
            self._u = list(self.compromisos)
        elif s.startswith('UPDATE plan_entregas p'):
            self._u = [(params[2],)] if self.vincula else []
        else:
            self._u = []

    def fetchall(self):
        return self._u

    def fetchone(self):
        return self._u[0] if self._u else None


def test_ata_si_el_nombre_es_el_codigo_y_hay_un_solo_compromiso():
    c = Cursor([(7, 'PDF')])
    assert plan.vincular_al_subir(c, OBRA, 'nodo-1', COD + '.pdf') == 7
    # Se busca por el código entero, en mayúsculas, y solo entre los SIN atar.
    s, p = c.sql[0]
    assert 'upper(identificador) = %s' in s and 'file_node_id IS NULL' in s
    assert p == (OBRA, COD)
    # Y se ata con la misma función que el vínculo manual (misma obra, registrado).
    assert any(x[0].startswith('UPDATE plan_entregas p') for x in c.sql)


def test_el_nombre_en_minusculas_tambien_es_el_codigo():
    c = Cursor([(7, None)])
    assert plan.vincular_al_subir(c, OBRA, 'nodo-1', COD.lower() + '.PDF') == 7


def test_no_ata_si_el_mismo_contenedor_tiene_varias_etapas_libres():
    """Elegir una etapa sería adivinar: queda como sugerencia."""
    c = Cursor([(7, 'PDF'), (8, 'PDF')])
    assert plan.vincular_al_subir(c, OBRA, 'nodo-1', COD + '.pdf') is None
    assert not any(x[0].startswith('UPDATE') for x in c.sql)


def test_no_ata_si_no_hay_compromiso_con_ese_codigo():
    c = Cursor([])
    assert plan.vincular_al_subir(c, OBRA, 'nodo-1', 'plano_cualquiera.pdf') is None


def test_no_ata_si_el_formato_no_cuadra():
    """El plan pide el DWG y suben el PDF: no es ese contenedor."""
    c = Cursor([(7, 'DWG')])
    assert plan.vincular_al_subir(c, OBRA, 'nodo-1', COD + '.pdf') is None
    assert not any(x[0].startswith('UPDATE') for x in c.sql)


def test_no_ata_si_el_vinculo_no_pasa_la_comprobacion_de_obra():
    """`vincular` exige misma obra; si no ata, no se dice que se ató."""
    c = Cursor([(7, 'PDF')], vincula=False)
    assert plan.vincular_al_subir(c, OBRA, 'nodo-1', COD + '.pdf') is None


def test_un_nombre_que_solo_CONTIENE_el_codigo_no_es_el_codigo():
    """Lo que `sugerir_vinculos` propone por parecido, esto NO lo ata."""
    c = Cursor([])
    plan.vincular_al_subir(c, OBRA, 'nodo-1', COD + '_firmado.pdf')
    s, p = c.sql[0]
    assert p == (OBRA, COD + '_FIRMADO')


# ── La entrega en el listado de Archivos (B1) ──────────────────────────────

import datetime as _dt
import uuid as _uuid


def _cliente_listado(monkeypatch, filas_plan, hay_plan=True):
    from flask import Flask, g
    import routes.documents as documents
    import file_system_db
    import db
    n1, n2 = str(_uuid.uuid4()), str(_uuid.uuid4())
    contenido = {'folders': [], 'files': [
        {'id': n1, 'name': COD + '.pdf', 'status': 'PUBLISHED'},
        {'id': n2, 'name': 'otro.pdf', 'status': 'WIP'}]}
    monkeypatch.setattr(documents, 'verify_project_access', lambda *_: True)
    monkeypatch.setattr(documents, '_puede_descargar', lambda *_: False)
    monkeypatch.setattr(file_system_db, 'list_contents', lambda *a, **k: contenido)

    class Db:
        def __enter__(self): return self
        def __exit__(self, *_): return False
        def cursor(self): return self
        def execute(self, sql, params=None):
            s = ' '.join(sql.split())
            if 'to_regclass' in s:
                self.r = [(hay_plan,)]
            elif 'FROM plan_entregas' in s:
                self.r = [(n1 if x == 'n1' else x, t, h, f) for x, t, h, f in filas_plan]
            else:
                self.r = []
        def fetchone(self): return self.r[0] if self.r else None
        def fetchall(self): return self.r

    monkeypatch.setattr(db, 'get_db_connection', lambda: Db())
    app = Flask(__name__)
    app.register_blueprint(documents.documents_bp)
    app.before_request(lambda: setattr(g, 'current_user', {'id': 1, 'role': 'user'}))
    carpeta = str(_uuid.uuid4())
    return app.test_client(), carpeta, n1, n2


def test_el_listado_dice_la_entrega_del_documento_vinculado(monkeypatch):
    c, carpeta, n1, n2 = _cliente_listado(
        monkeypatch, [('n1', 'MIDP', 'Etapa 3', _dt.date(2026, 10, 10))])
    r = c.get(f'/api/docs/list?id={carpeta}&model_urn={OBRA}').json
    files = {f['id']: f for f in r['data']['files']}
    e = files[n1]['entrega']
    assert e['estado'] == 'entregado'          # vinculado y PUBLICADO
    assert e['hito'] == 'Etapa 3' and e['fecha'] == '2026-10-10' and e['plan'] == 'MIDP'
    assert 'entrega' not in files[n2]           # el que no está en el plan, sin entrega


def test_sin_plan_en_la_base_el_listado_sale_igual(monkeypatch):
    c, carpeta, n1, n2 = _cliente_listado(monkeypatch, [], hay_plan=False)
    r = c.get(f'/api/docs/list?id={carpeta}&model_urn={OBRA}').json
    assert r['success'] is True
    assert all('entrega' not in f for f in r['data']['files'])
