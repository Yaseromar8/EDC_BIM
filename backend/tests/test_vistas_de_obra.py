"""Vistas de obra (A2-2, 14-oct-2026) y el permiso de carpeta al buscar.

Las vistas de serie preguntan a TODA la obra («Me toca revisar», «Plazo del plan
vencido»…). Estas pruebas fijan tres cosas:
  1. cada vista trae lo que dice y nada más, con el matiz del plan de entregas
     (sin documento vinculado no se afirma nada sobre la entrega);
  2. una vista, y la búsqueda de siempre, no enseñan lo que el permiso de carpeta
     esconde en el listado;
  3. sin `vista`, la búsqueda responde igual que antes.
Ver docs/ux/A2-2_VISTAS_GUARDADAS_PROPUESTA.md.
"""
import datetime as dt
import uuid

import vistas_de_obra as v

OBRA = 'obra/PQT8'
HOY = dt.date(2026, 10, 14)


def doc(id_, status='WIP', fecha=None, en_plan=False, carpeta='c1', tipo='file'):
    d = {'id': id_, 'status': status, 'parent_id': carpeta, 'type': tipo}
    if en_plan:
        d['entrega'] = {'estado': 'x'}
        d['_fecha_plan'] = fecha
    return d


# ── 1. Qué trae cada vista ──────────────────────────────────────────────────

def test_plazo_vencido_es_vinculado_tarde_y_sin_publicar():
    ayer = HOY - dt.timedelta(days=1)
    assert v.PLAZO_VENCIDO in v.vistas_de(doc('a', 'SHARED', ayer, True), HOY, set(), True)
    # Publicado = entregado: ya no va tarde aunque la fecha pasara.
    assert v.PLAZO_VENCIDO not in v.vistas_de(doc('a', 'PUBLISHED', ayer, True), HOY, set(), True)
    # Sin vínculo con el plan no se afirma nada del plazo.
    assert v.PLAZO_VENCIDO not in v.vistas_de(doc('a', 'WIP'), HOY, set(), True)


def test_vence_pronto_es_hoy_y_los_siete_dias_siguientes():
    for dias, esperado in ((0, True), (7, True), (8, False), (-1, False)):
        claves = v.vistas_de(doc('a', 'WIP', HOY + dt.timedelta(days=dias), True), HOY, set(), True)
        assert (v.VENCE_PRONTO in claves) is esperado, dias


def test_publicados_sin_entrega_solo_si_la_obra_tiene_plan():
    assert v.PUBLICADOS_SIN_ENTREGA in v.vistas_de(doc('a', 'PUBLISHED'), HOY, set(), True)
    assert v.PUBLICADOS_SIN_ENTREGA not in v.vistas_de(doc('a', 'PUBLISHED'), HOY, set(), False)
    # Si está en el plan, tiene entrega.
    assert v.PUBLICADOS_SIN_ENTREGA not in v.vistas_de(
        doc('a', 'PUBLISHED', HOY, True), HOY, set(), True)


def test_estados_iso_y_me_toca():
    assert v.vistas_de(doc('a', 'SHARED'), HOY, set(), False) == {v.EN_REVISION}
    assert v.vistas_de(doc('a', 'PUBLISHED'), HOY, set(), False) == {v.PUBLICADOS}
    assert v.vistas_de(doc('a', 'WIP'), HOY, set(), False) == set()
    assert v.vistas_de(doc('a', 'WIP'), HOY, {'a'}, False) == {v.ME_TOCA}


# ── 2. Permiso de carpeta ───────────────────────────────────────────────────

def test_lo_que_la_carpeta_esconde_no_sale():
    niveles = {'c1': 'viewer', 'c2': 'none'}
    pedidas = []

    def permiso(c):
        pedidas.append(c)
        return niveles.get(c, 'none')
    docs = [doc('a', carpeta='c1'), doc('b', carpeta='c2'), doc('c', carpeta='c1'),
            doc('d', carpeta=None)]
    assert [d['id'] for d in v.filtrar_visibles(None, {'id': 1}, OBRA, docs, permiso)] == ['a', 'c']
    # Una sola pregunta por carpeta.
    assert sorted(pedidas) == ['c1', 'c2']


def test_con_iso_estricto_el_trabajo_en_curso_no_sale(monkeypatch):
    monkeypatch.setenv('STRICT_ISO_VISIBILITY', 'true')
    docs = [doc('a', 'WIP'), doc('b', 'SHARED'), doc('f', None, tipo='FOLDER')]
    salida = v.filtrar_visibles(None, {'id': 1}, OBRA, docs, lambda c: 'viewer')
    assert [d['id'] for d in salida] == ['b', 'f']      # las carpetas no tienen estado


# ── 3. La consulta entera, con un doble de la base ──────────────────────────

class Cur:
    """Responde por la forma de la consulta, como el resto de la suite."""

    def __init__(self, filas, items_revision=(), vencidos=0, hay_plan=True, empresa=None,
                 items_empresa=(), falla_empresa=False):
        self.filas, self.items, self.vencidos, self.hay_plan = filas, items_revision, vencidos, hay_plan
        self.empresa, self.items_empresa, self.falla_empresa = empresa, items_empresa, falla_empresa
        self.sql = []
        self.r = []

    def execute(self, sql, params=None):
        s = ' '.join(sql.split())
        self.sql.append(s)
        if 'to_regclass' in s:
            self.r = [('plan_entregas',)] if self.hay_plan else [(None,)]
        elif s.startswith('SELECT EXISTS(SELECT 1 FROM plan_entregas'):
            self.r = [(True,)]
        elif 'WITH RECURSIVE carpetas' in s:
            self.r = self.filas
        elif s.startswith('SELECT company_id FROM users'):
            self.r = [(self.empresa,)]
        elif 'FROM encargos e JOIN doc_reviews' in s:
            if self.falla_empresa:
                raise RuntimeError('columna inexistente')
            self.r = [(list(self.items_empresa),)]
        elif 'FROM doc_reviews' in s:
            self.r = [(list(self.items),)]
        elif 'count(*) FROM plan_entregas' in s:
            self.r = [(self.vencidos,)]
        else:
            self.r = []

    def fetchone(self):
        return self.r[0] if self.r else None

    def fetchall(self):
        return self.r


def fila(id_, nombre, status, carpeta='c1', ruta='01 Planos', plan=None):
    t, h, f = plan or (None, None, None)
    return (id_, nombre, 10, 1, None, status, None, 'application/pdf', None, 'Ana Pérez',
            None, None, True, None, None, None, carpeta, ruta, t, h, f)


def _preparar(monkeypatch, niveles, me_tocan=()):
    import permiso_documental as pd
    import encargos
    monkeypatch.setattr(pd, 'contexto_de_permisos', lambda *a, **k: {'es_admin': False, 'sujetos': {}})
    monkeypatch.setattr(pd, 'permiso_efectivo',
                        lambda cur, u, urn, nodo, contexto=None: niveles.get(nodo, 'none'))
    monkeypatch.setattr(encargos, 'mi_trabajo', lambda cur, uid, obra: [
        {'objeto_tipo': 'REVIEW', 'objeto_id': '5'} for _ in me_tocan])


def test_recuentos_y_documentos_de_una_vista(monkeypatch):
    _preparar(monkeypatch, {'c1': 'viewer', 'c2': 'none'}, me_tocan=['x'])
    ayer = HOY - dt.timedelta(days=3)
    filas = [
        fila('a', 'A.pdf', 'SHARED', plan=('MIDP', 'E1', ayer)),        # vencido + en revisión
        fila('b', 'B.pdf', 'PUBLISHED'),                                 # publicado sin entrega
        fila('c', 'C.pdf', 'PUBLISHED', carpeta='c2'),                   # carpeta sin permiso
        fila('d', 'D.pdf', 'WIP'),                                       # en ninguna vista
    ]
    cur = Cur(filas, items_revision=[{'node_id': 'd'}], vencidos=4)
    r = v.recuentos(cur, {'id': 7}, OBRA, hoy=HOY)
    assert r['recuentos'] == {v.ME_TOCA: 1, v.MI_EMPRESA: 0, v.PLAZO_VENCIDO: 1, v.VENCE_PRONTO: 0,
                              v.PUBLICADOS_SIN_ENTREGA: 1, v.EN_REVISION: 1, v.PUBLICADOS: 1}
    assert r['hay_plan'] is True and r['vencidos_sin_documento'] == 4

    cur = Cur(filas, vencidos=4)
    datos, total, extra = v.documentos(cur, {'id': 7}, OBRA, v.PLAZO_VENCIDO, hoy=HOY)
    assert total == 1 and extra['vencidos_sin_documento'] == 4
    d = datos[0]
    # La forma de una fila de /api/docs/list, más su ubicación.
    assert d['id'] == 'a' and d['ubicacion'] == '01 Planos' and d['fullName'] == '01 Planos/A.pdf'
    # La columna Entrega dice lo mismo que la pantalla del plan: un documento
    # atado y sin publicar es «vinculado», vaya o no tarde. Lo tarde lo dice la vista.
    assert d['entrega']['estado'] == 'vinculado' and d['entrega']['fecha'] == ayer.isoformat()
    assert d['updated_by'] == {'name': 'Ana Pérez', 'initials': 'AP'}
    assert not any(k.startswith('_') for k in d)


def test_me_toca_solo_de_revisiones_de_esta_obra_y_pendientes(monkeypatch):
    _preparar(monkeypatch, {'c1': 'viewer'}, me_tocan=['x'])
    cur = Cur([fila('d', 'D.pdf', 'WIP')], items_revision=[{'node_id': 'd'}])
    datos, total, _ = v.documentos(cur, {'id': 7}, OBRA, v.ME_TOCA, hoy=HOY)
    assert [x['id'] for x in datos] == ['d']
    consulta = next(s for s in cur.sql if 'FROM doc_reviews' in s)
    assert "status = 'pending'" in consulta and 'model_urn = %s' in consulta


def test_sin_tabla_de_plan_las_vistas_salen_igual(monkeypatch):
    _preparar(monkeypatch, {'c1': 'viewer'})
    cur = Cur([fila('b', 'B.pdf', 'PUBLISHED')], hay_plan=False)
    r = v.recuentos(cur, {'id': 7}, OBRA, hoy=HOY)
    assert r['recuentos'][v.PUBLICADOS] == 1 and r['recuentos'][v.PUBLICADOS_SIN_ENTREGA] == 0
    assert not any('plan_entregas WHERE' in s and 'LATERAL' in s for s in cur.sql)


# ── 4. La ruta: vistas y búsqueda de siempre ────────────────────────────────

def _cliente(monkeypatch, filas_busqueda, niveles):
    from flask import Flask, g
    import routes.documents as documents
    import db
    _preparar(monkeypatch, niveles)
    monkeypatch.setattr(documents, 'verify_project_access', lambda *_: True)

    class Db:
        def __enter__(self): return self
        def __exit__(self, *_): return False
        def cursor(self): return Cur([fila('b', 'B.pdf', 'PUBLISHED')], hay_plan=False)

    class DbBusqueda(Db):
        def cursor(self):
            c = Cur([])
            c.execute = lambda sql, p=None: setattr(c, 'r', filas_busqueda)
            return c

    monkeypatch.setattr(db, 'get_db_connection',
                        lambda: DbBusqueda() if filas_busqueda is not None else Db())
    app = Flask(__name__)
    app.register_blueprint(documents.documents_bp)
    app.before_request(lambda: setattr(g, 'current_user', {'id': 1, 'role': 'user'}))
    return app.test_client()


def test_la_ruta_sirve_recuentos_y_vistas_y_rechaza_lo_desconocido(monkeypatch):
    c = _cliente(monkeypatch, None, {'c1': 'viewer'})
    r = c.get(f'/api/docs/search?vista=recuentos&model_urn={OBRA}').json
    assert r['success'] and r['recuentos'][v.PUBLICADOS] == 1
    r = c.get(f'/api/docs/search?vista=publicados&model_urn={OBRA}').json
    assert r['total'] == 1 and r['data'][0]['name'] == 'B.pdf' and r['limite'] == v.LIMITE
    assert c.get(f'/api/docs/search?vista=lo_que_sea&model_urn={OBRA}').status_code == 400


def test_la_busqueda_respeta_el_permiso_de_carpeta(monkeypatch):
    a, b = uuid.uuid4(), uuid.uuid4()
    filas = [(a, 'FILE', 'plano-visible.pdf', 'Archivos de proyecto/01/plano-visible.pdf', 1, None, 1, 'c1', 'WIP'),
             (b, 'FILE', 'plano-reservado.pdf', 'Archivos de proyecto/02/plano-reservado.pdf', 1, None, 1, 'c2', 'WIP')]
    c = _cliente(monkeypatch, filas, {'c1': 'viewer', 'c2': 'none'})
    r = c.get(f'/api/docs/search?q=plano&model_urn={OBRA}').json
    assert [x['name'] for x in r['data']] == ['plano-visible.pdf']
    # La respuesta conserva su forma de siempre.
    assert set(r['data'][0]) == {'id', 'type', 'name', 'path', 'size_bytes', 'updated_at', 'version'}


def test_la_busqueda_corta_sigue_sin_consultar(monkeypatch):
    c = _cliente(monkeypatch, [], {})
    assert c.get(f'/api/docs/search?q=p&model_urn={OBRA}').json == {'success': True, 'data': []}


# ── 5. Vistas propias de toda la obra (filtros en el servidor) ──────────────

COD = '500125-CSSP001-000-XX-DR-ES-004120'


def test_piezas_del_codigo_misma_regla_que_el_portal():
    assert v.piezas_del_codigo(COD + '.pdf') == {'tipo': 'DR', 'disciplina': 'ES'}
    assert v.piezas_del_codigo(COD) == {'tipo': 'DR', 'disciplina': 'ES'}
    assert v.piezas_del_codigo('plano-cualquiera.pdf') is None
    assert v.piezas_del_codigo('a-b-c--e-f-g.pdf') is None          # una pieza vacía


def test_cumple_los_filtros_de_archivos():
    d = {'name': COD + '.pdf', 'status': 'PUBLISHED'}
    assert v.cumple(d, {'tipo': 'DR', 'disciplina': 'ES', 'estado': 'PUBLISHED'})
    assert not v.cumple(d, {'disciplina': 'AR'})
    assert not v.cumple(d, {'estado': 'SHARED'})
    assert v.cumple(d, {'q': '004120'}) and not v.cumple(d, {'q': 'zzz'})
    assert v.cumple(d, {'entrega': 'fuera'})
    assert not v.cumple(dict(d, entrega={'estado': 'entregado'}), {'entrega': 'fuera'})
    assert not v.cumple({'name': 'suelto.pdf'}, {'tipo': 'DR'})


def test_la_ruta_aplica_los_filtros_de_una_vista_propia(monkeypatch):
    c = _cliente(monkeypatch, None, {'c1': 'viewer'})
    r = c.get(f'/api/docs/search?vista=todos&estado=PUBLISHED&model_urn={OBRA}').json
    assert r['total'] == 1
    r = c.get(f'/api/docs/search?vista=todos&estado=SHARED&model_urn={OBRA}').json
    assert r['total'] == 0


# ── 6. Asignados a mi empresa ────────────────────────────────────────────────

def test_asignados_a_mi_empresa(monkeypatch):
    _preparar(monkeypatch, {'c1': 'viewer'})
    filas = [fila('a', 'A.pdf', 'SHARED'), fila('b', 'B.pdf', 'SHARED')]
    cur = Cur(filas, empresa=12, items_empresa=[{'node_id': 'b'}])
    datos, total, _ = v.documentos(cur, {'id': 7}, OBRA, v.MI_EMPRESA, hoy=HOY)
    assert [x['id'] for x in datos] == ['b']
    consulta, params = next((x, None) for x in cur.sql if 'FROM encargos e JOIN doc_reviews' in x)
    # Las tres formas de destino: la empresa, una persona de ella y su función en la obra.
    assert 'destino_empresa' in consulta and 'destino_usuario IN' in consulta and 'destino_funcion' in consulta
    assert "status = 'pending'" in consulta and "estado = 'abierto'" in consulta


def test_sin_empresa_no_hay_mi_empresa(monkeypatch):
    _preparar(monkeypatch, {'c1': 'viewer'})
    cur = Cur([fila('b', 'B.pdf', 'SHARED')], empresa=None, items_empresa=[{'node_id': 'b'}])
    assert v.recuentos(cur, {'id': 7}, OBRA, hoy=HOY)['recuentos'][v.MI_EMPRESA] == 0
    assert not any('FROM encargos e JOIN doc_reviews' in x for x in cur.sql)


def test_una_consulta_de_revisiones_que_falla_no_tumba_las_vistas(monkeypatch):
    """En PostgreSQL un fallo aborta la transacción: va en su SAVEPOINT y se deshace."""
    _preparar(monkeypatch, {'c1': 'viewer'})
    cur = Cur([fila('b', 'B.pdf', 'PUBLISHED')], empresa=12, falla_empresa=True)
    r = v.recuentos(cur, {'id': 7}, OBRA, hoy=HOY)
    assert r['recuentos'][v.PUBLICADOS] == 1 and r['recuentos'][v.MI_EMPRESA] == 0
    assert 'ROLLBACK TO SAVEPOINT vistas_aparte' in cur.sql
