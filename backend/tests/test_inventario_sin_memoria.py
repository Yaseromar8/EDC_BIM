"""El inventario de un modelo pesado no se junta en memoria (docs/rendimiento/02, paso 1).

Medido el 11-nov-2026 con el código anterior: extraer costaba ~31 MB por cada 1.000 elementos y servir el
inventario ~22 MB por cada 1.000; 50.000 elementos no cabían en el servidor de 2 GB. Ahora los nodos de
Autodesk y las filas del snapshot van a disco, y el cuerpo de /api/inventory se escribe fila a fila.

Lo que estas pruebas sostienen es que NADA de lo que se guarda o se sirve cambió: misma huella del snapshot,
mismas filas, mismo JSON. La medición de memoria está en el banco (docs/rendimiento/03).
"""
import datetime
import gzip
import json
import os
import random
from contextlib import contextmanager

import pytest

os.environ.setdefault('APP_SECRET', 'x' * 32)

import inventory_identity as ii  # noqa: E402
from inventory_identity import IdentityError, InventoryIdentityRepository, SnapshotRows  # noqa: E402

URN = 'urn:adsk.wipprod:fs.file:vf.Pesado?version=3'
SCOPE = '1_HOSPITAL'


def _fila(ext, **mas):
    return {'external_id': ext, 'name': 'Elemento ' + ext, 'project_id': '7',
            'properties': {'Cotas': {'Longitud': '1.50 m', 'n': 3, 'x': 1.25}, 'Texto': {'ñ': 'Á é — 日本'}}, **mas}


# ── la huella ──

def _aleatorio(r, fondo=0):
    tipo = r.randrange(7 if fondo < 3 else 5)
    if tipo == 0:
        return r.choice(['', 'a', 'Tubería Ø50', 'x' * r.randrange(40), 'comilla " y \\ barra', 'línea\nnueva'])
    if tipo == 1:
        return r.randrange(-10 ** 12, 10 ** 12)
    if tipo == 2:
        return r.uniform(-1e6, 1e6)
    if tipo == 3:
        return r.choice([True, False, None])
    if tipo == 4:
        return r.choice([0.1, 1e-07, 1e21, -0.0, 3.0])
    if tipo == 5:
        return [_aleatorio(r, fondo + 1) for _ in range(r.randrange(4))]
    return {'k%d' % r.randrange(50): _aleatorio(r, fondo + 1) for _ in range(r.randrange(5))}


@pytest.mark.parametrize('semilla', range(25))
def test_la_huella_por_filas_es_la_misma_que_la_de_la_lista(semilla):
    r = random.Random(semilla)
    filas = [{'external_id': 'e%d' % i, 'properties': {'g': _aleatorio(r)}, 'native_metadata': {}}
             for i in range(r.randrange(0, 12))]
    assert ii._fingerprint_rows(ii._canonical(f) for f in filas) == ii._fingerprint(filas)


def test_la_huella_de_cero_filas_es_la_de_la_lista_vacia():
    assert ii._fingerprint_rows(iter(())) == ii._fingerprint([])


# ── las filas en disco ──

def test_las_filas_en_disco_salen_ordenadas_y_con_la_forma_de_siempre():
    with SnapshotRows(SCOPE, URN) as filas:
        for ext in ['b', 'a', 'Z', 'ñ', 'a0']:
            filas.add(_fila(ext, cualquiera={'dato': 1}))
        filas.seal()
        salida = list(filas.rows())
    assert [f['external_id'] for f in salida] == sorted(['b', 'a', 'Z', 'ñ', 'a0'])
    assert len(salida) == 5
    uno = salida[0]
    assert uno['name'] == 'Elemento Z' and uno['project_id'] == '7'
    assert uno['material'] is None and uno['last_updated'] is None
    assert uno['native_metadata'] == {'cualquiera': {'dato': 1}}      # lo que no es campo propio, a native_metadata
    assert uno['properties']['Texto'] == {'ñ': 'Á é — 日本'}


def test_un_identificador_repetido_se_rechaza_al_llegar():
    with SnapshotRows(SCOPE, URN) as filas:
        filas.add(_fila('a'))
        with pytest.raises(IdentityError) as error:
            filas.add(_fila('a'))
    assert error.value.code == 'DUPLICATE_EXTERNAL_ID'


def test_una_fila_invalida_se_rechaza_igual_que_en_la_lista():
    with SnapshotRows(SCOPE, URN) as filas:
        with pytest.raises(IdentityError) as error:
            filas.add({'external_id': '', 'properties': {}})
        assert error.value.code == 'INVALID_IDENTIFIER'
        with pytest.raises(IdentityError) as error:
            filas.add({'external_id': 'a', 'properties': {'x': float('nan')}})
        assert error.value.code == 'INVALID_JSON'
        with pytest.raises(IdentityError) as error:
            filas.add({'external_id': 'a', 'scope_id': 'otro', 'properties': {}})
        assert error.value.code == 'ROW_IDENTITY_CONFLICT'
        assert len(filas) == 0


def test_sin_sellar_no_se_lee_y_sellado_no_admite_mas():
    with SnapshotRows(SCOPE, URN) as filas:
        filas.add(_fila('a'))
        with pytest.raises(IdentityError):
            list(filas.canonical_rows())
        filas.seal()
        with pytest.raises(IdentityError) as error:
            filas.add(_fila('b'))
        assert error.value.code == 'INVALID_ROWS'


# ── publicar: lista y disco escriben lo mismo ──

class _Cursor:
    def __init__(self, conn):
        self.conn = conn

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    def execute(self, sentencia, args=None):
        self.conn.sentencias.append((' '.join(str(sentencia).split())[:60], args))

    def fetchone(self):
        return self.conn.respuestas.pop(0)


class _Conexion:
    autocommit = False

    def __init__(self, respuestas):
        self.respuestas = list(respuestas)
        self.sentencias = []
        self.valores = []

    def cursor(self, **kw):
        return _Cursor(self)


def _publicar(monkeypatch, filas, respuestas=((None, 0), None), lote=None):
    conn = _Conexion(respuestas)

    def execute_values(cursor, sentencia, lista, **kw):
        for tupla in lista:
            conn.valores.append((' '.join(sentencia.split())[:45],
                                 tuple(getattr(v, 'adapted', v) for v in tupla)))
    monkeypatch.setattr(ii, 'execute_values', execute_values)
    if lote:
        monkeypatch.setattr(ii, '_PUBLISH_BATCH', lote)
    resultado = InventoryIdentityRepository(conn).publish_snapshot(
        SCOPE, URN, filas, expected_active_urn=None, expected_generation=0, allowed_scopes=[SCOPE])
    return resultado, conn


def _huella_guardada(conn):
    return next(args for texto, args in conn.sentencias if 'INSERT INTO inventory_identity_b1.snapshots' in texto)


def test_publicar_desde_disco_escribe_lo_mismo_que_desde_la_lista(monkeypatch):
    r = random.Random(11)
    crudas = [_fila('e%04d' % i, extra=_aleatorio(r)) for i in r.sample(range(2000), 137)]
    de_lista, conn_lista = _publicar(monkeypatch, list(crudas))
    with SnapshotRows(SCOPE, URN) as filas:
        for cruda in crudas:
            filas.add(cruda)
        filas.seal()
        de_disco, conn_disco = _publicar(monkeypatch, filas, lote=10)      # 14 lotes: nada se pierde entre lotes
    assert de_disco == de_lista and de_lista['row_count'] == 137 and de_lista['created']
    assert _huella_guardada(conn_disco) == _huella_guardada(conn_lista)   # misma huella, mismo recuento
    por_tabla = lambda conn, tabla: sorted((v for t, v in conn.valores if tabla in t), key=repr)  # noqa: E731
    assert por_tabla(conn_disco, 'elements') == por_tabla(conn_lista, 'elements')
    assert por_tabla(conn_disco, 'occurrences') == por_tabla(conn_lista, 'occurrences')
    assert len(por_tabla(conn_disco, 'occurrences')) == 137


def test_la_huella_que_se_guarda_es_la_que_se_guardaba_antes(monkeypatch):
    """Una versión ya extraída con el código anterior debe reconocerse como idéntica al reextraerla."""
    crudas = [_fila('b'), _fila('a', otra='x')]
    _, conn = _publicar(monkeypatch, crudas)
    preparadas = sorted((ii._prepare_row(c, SCOPE, 'urn:adsk.wipprod:dm.lineage:Pesado',
                                         ii.source_identity(URN)[0]) for c in crudas),
                        key=lambda f: f['external_id'])
    assert _huella_guardada(conn)[-1] == ii._fingerprint(preparadas)


def test_un_snapshot_sin_sellar_o_de_otro_modelo_no_se_publica(monkeypatch):
    with SnapshotRows(SCOPE, URN) as filas:
        filas.add(_fila('a'))
        with pytest.raises(IdentityError) as error:
            _publicar(monkeypatch, filas)
        assert error.value.code == 'INVALID_ROWS'
    with SnapshotRows('otro_frente', URN) as filas:
        filas.seal()
        with pytest.raises(IdentityError) as error:
            _publicar(monkeypatch, filas)
        assert error.value.code == 'ROW_IDENTITY_CONFLICT'
    with SnapshotRows(SCOPE, URN.replace('version=3', 'version=4')) as filas:
        filas.seal()
        with pytest.raises(IdentityError) as error:
            _publicar(monkeypatch, filas)
        assert error.value.code == 'ROW_IDENTITY_CONFLICT'


def test_un_iterador_a_medias_sigue_sin_aceptarse(monkeypatch):
    with pytest.raises(IdentityError) as error:
        _publicar(monkeypatch, (f for f in [_fila('a')]))
    assert error.value.code == 'INVALID_ROWS'


def test_reextraer_lo_mismo_no_escribe_y_lo_distinto_es_conflicto(monkeypatch):
    crudas = [_fila('a'), _fila('b')]
    _, primera = _publicar(monkeypatch, crudas)
    huella = _huella_guardada(primera)[-1]
    activo = ii.source_identity(URN)[0]
    with SnapshotRows(SCOPE, URN) as filas:
        for cruda in crudas:
            filas.add(cruda)
        filas.seal()
        resultado, conn = _publicar(monkeypatch, filas, respuestas=((activo, 0), (huella, 2, True)))
    assert resultado['created'] is False and conn.valores == []
    with SnapshotRows(SCOPE, URN) as filas:
        filas.add(_fila('a'))
        filas.add(_fila('b', cambio='sí'))
        filas.seal()
        with pytest.raises(IdentityError) as error:
            _publicar(monkeypatch, filas, respuestas=((activo, 0), (huella, 2, True)))
    assert error.value.code == 'SNAPSHOT_CONTENT_CONFLICT'


# ── servir: el cuerpo fila a fila es el mismo JSON ──

def _cuerpo(monkeypatch, filas_por_frente, props=True):
    import inventory_http as ih

    class Repo:
        def __init__(self, conn):
            pass

        def iter_inventory(self, scope, *, allowed_scopes, include_props=True):
            return iter(filas_por_frente[scope])
    monkeypatch.setattr(ih, 'get_db_connection', lambda: _nulo())
    monkeypatch.setattr(ih, 'InventoryIdentityRepository', Repo)
    return ih._construir_cuerpo(list(filas_por_frente), props)


@contextmanager
def _nulo():
    yield None


def test_el_cuerpo_fila_a_fila_es_el_mismo_json_que_el_de_la_lista(monkeypatch):
    r = random.Random(5)
    frentes = {'A': [{'external_id': 'e%d' % i, 'last_updated': datetime.datetime(2026, 11, 11, 8, i % 60),
                      'properties': {'g': _aleatorio(r)}, 'texto': 'Ñandú — 日本'} for i in range(40)],
               'B': [{'external_id': 'z', 'properties': {}}]}
    esperado = json.dumps([f for filas in frentes.values() for f in filas], ensure_ascii=False,
                          separators=(',', ':'), default=str).encode('utf-8')
    assert gzip.decompress(_cuerpo(monkeypatch, frentes)) == esperado


def test_el_cuerpo_de_un_frente_vacio_es_una_lista_vacia(monkeypatch):
    assert gzip.decompress(_cuerpo(monkeypatch, {'A': []})) == b'[]'


def test_get_inventory_es_la_lista_de_iter_inventory():
    repo = InventoryIdentityRepository(_Conexion([]))
    repo.iter_inventory = lambda scope, **kw: iter([{'external_id': 'a'}, {'external_id': 'b'}])
    assert repo.get_inventory('x', allowed_scopes=['x']) == [{'external_id': 'a'}, {'external_id': 'b'}]


def test_leer_valida_antes_de_pedir_una_sola_fila():
    repo = InventoryIdentityRepository(_Conexion([]))
    with pytest.raises(IdentityError) as error:
        repo.iter_inventory('x', allowed_scopes=['otro'])
    assert error.value.code == 'FORBIDDEN_SCOPE'


# ── extraer: el carrete y el orden de llegada ──

def test_el_carrete_devuelve_los_nodos_tal_cual_y_en_orden():
    from routes.inventory import _Carrete
    nodos = [{'objectid': i, 'name': 'Ñ %d — 日本' % i, 'properties': {'g': {'v': [1.5, '', None, 'x' * i]}}}
             for i in range(300)]
    carrete = _Carrete()
    for nodo in nodos:
        carrete.guardar(nodo)
    assert len(carrete) == 300 and list(carrete) == nodos
    assert list(carrete) == nodos                       # se puede recorrer más de una vez
    carrete.vaciar()
    assert len(carrete) == 0 and list(carrete) == []
    carrete.guardar({'objectid': 1})
    assert list(carrete) == [{'objectid': 1}]
    carrete.close()


class _Respuesta:
    status_code = 200

    def __init__(self, cuerpo):
        self._cuerpo = cuerpo
        self.text = ''

    def json(self):
        return json.loads(json.dumps(self._cuerpo))

    def raise_for_status(self):
        pass


def _extraer(monkeypatch, objetos, arbol, tam_pagina_falso=None, olvidar=()):
    """Corre extract_metadata_task entera contra un Autodesk de mentira; devuelve (filas publicadas, trabajos)."""
    import db
    from routes import inventory

    publicadas, trabajos, pedidos = [], [], []

    class Repo:
        def __init__(self, conn):
            pass

        def active_snapshot(self, *a, **k):
            return {'active_urn': None, 'generation': 0}

        def publish_snapshot(self, scope, urn, rows, **k):
            assert isinstance(rows, SnapshotRows) and rows.sealed       # completo, y no una lista en memoria
            publicadas.extend(rows.rows())
            return {'created': True}

    class Conn:
        autocommit = False

        def commit(self):
            pass

        def cursor(self, **k):
            return self

        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

        def execute(self, *a):
            pass

        def fetchone(self):
            return None

    @contextmanager
    def conexion():
        yield Conn()

    def aps(metodo, url, intentos=3, **kw):
        pedidos.append(url.rsplit('/', 1)[-1])
        if url.endswith('/metadata'):
            return _Respuesta({'data': {'metadata': [{'name': '{3D}', 'role': '3d', 'guid': 'g1'}]}})
        if url.endswith('/properties:query'):
            consulta = kw['json']
            if '$in' in consulta['query']:
                pedidas = consulta['query']['$in'][1:]
                return _Respuesta({'data': {'collection': [o for o in objetos if o['objectid'] in pedidas]}})
            pag = consulta['pagination']
            visibles = [o for o in objetos if o['objectid'] not in olvidar]
            return _Respuesta({'data': {'collection': visibles[pag['offset']:pag['offset'] + pag['limit']]}})
        return _Respuesta({'data': {'objects': arbol}})

    monkeypatch.setattr(db, 'get_db_connection', conexion)
    monkeypatch.setattr(ii, 'InventoryIdentityRepository', Repo)
    monkeypatch.setattr(inventory, '_extraction_source_context', lambda *a, **k: {
        'source_urn': ii.source_identity(URN)[0], 'source_lineage': ii.source_identity(URN)[1],
        'project_id': '7', 'item_id': None, 'linked_in_scope': False, 'authorization_scopes': [SCOPE]})
    monkeypatch.setattr(inventory, 'set_job', lambda _id, datos: trabajos.append(datos))
    monkeypatch.setattr(inventory, 'get_internal_token', lambda: ('tok', None))
    monkeypatch.setattr(inventory, '_aps', aps)
    monkeypatch.setattr(inventory, '_apuntar_vista_extraida', lambda *a: None)
    monkeypatch.setattr(inventory.requests, 'post', lambda url, **kw: aps('POST', url, **kw))
    inventory.extract_metadata_task(URN, SCOPE, 'pesado-%d' % len(objetos))
    return publicadas, trabajos, pedidos


def _modelo_pequeno():
    """Raíz → Tuberías → Tipo DN50 → tres tubos. El TIPO llega el último en la colección, después de sus instancias."""
    arbol = [{'objectid': 1, 'name': 'Model', 'objects': [
        {'objectid': 2, 'name': 'Tuberías', 'objects': [
            {'objectid': 9, 'name': 'Tipo DN50', 'objects': [
                {'objectid': 3, 'name': 'Tubo [301]'}, {'objectid': 4, 'name': 'Tubo [302]'},
                {'objectid': 5, 'name': 'Tubo [303]'}]}]}]}]
    tubo = lambda oid: {'objectid': oid, 'name': 'Tubo [30%d]' % (oid - 2), 'externalId': 'ext-%d' % oid,  # noqa: E731
                        'properties': {'Cotas': {'Longitud': '%d.00 m' % oid, 'Diámetro': ['', '']},
                                       'Datos de identidad': {'Marca': 'M%d' % oid}}}
    objetos = [{'objectid': 1, 'name': 'Model', 'externalId': 'doc', 'properties': {}},
               {'objectid': 2, 'name': 'Tuberías', 'externalId': 'cat:1', 'properties': {}},
               tubo(3), tubo(4), tubo(5),
               {'objectid': 9, 'name': 'Tipo DN50', 'externalId': 'tipo-9',
                'properties': {'Datos de identidad': {'Nombre de tipo': 'DN50', 'Marca': 'del tipo'},
                               'Cotas': {'Diámetro': '50 mm'}}}]
    return objetos, arbol


def test_la_instancia_hereda_de_su_tipo_aunque_el_tipo_llegue_despues(monkeypatch):
    objetos, arbol = _modelo_pequeno()
    filas, trabajos, _ = _extraer(monkeypatch, objetos, arbol)
    assert trabajos[-1]['status'] == 'success', trabajos[-1]
    assert [f['external_id'] for f in filas] == ['ext-3', 'ext-4', 'ext-5']     # solo instancias; ni tipo ni categoría
    tres = filas[0]['properties']
    assert tres['Datos de identidad'] == {'Nombre de tipo': 'DN50', 'Marca': 'M3'}   # hereda el tipo; manda la instancia
    assert tres['Cotas'] == {'Diámetro': '50 mm', 'Longitud': '3.00 m'}              # la lista vacía no pisa lo heredado
    assert tres['__category__'] == {'__category__': 'Pipes'}
    assert tres['__node__'] == {'__node_type__': 'instance'}
    assert filas[0]['project_id'] == '7' and filas[0]['name'] == 'Tubo [301]'
    assert '3 activos' in trabajos[-1]['message']


def test_una_hoja_que_la_paginacion_no_trajo_se_recupera(monkeypatch):
    objetos, arbol = _modelo_pequeno()
    filas, trabajos, pedidos = _extraer(monkeypatch, objetos, arbol, olvidar={4})
    assert trabajos[-1]['status'] == 'success', trabajos[-1]
    assert [f['external_id'] for f in filas] == ['ext-3', 'ext-4', 'ext-5']
    assert pedidos.count('properties:query') == 2                                # la página y la recuperación


def test_una_hoja_irrecuperable_sigue_siendo_un_error_y_no_un_inventario_a_medias(monkeypatch):
    objetos, arbol = _modelo_pequeno()
    arbol[0]['objects'][0]['objects'][0]['objects'].append({'objectid': 77, 'name': 'Fantasma [1]'})
    filas, trabajos, _ = _extraer(monkeypatch, objetos, arbol)
    assert filas == [] and trabajos[-1]['status'] == 'error'
    assert trabajos[-1]['code'] == 'INCOMPLETE_MODEL_COVERAGE'


def test_el_arbol_se_pide_antes_que_las_propiedades(monkeypatch):
    objetos, arbol = _modelo_pequeno()
    _, _, pedidos = _extraer(monkeypatch, objetos, arbol)
    assert pedidos == ['metadata', 'g1?forceget=true', 'properties:query']


def test_mientras_se_guarda_el_trabajo_sigue_dando_senales_de_vida(monkeypatch):
    """Guardar un modelo enorme tarda minutos: sin latido, el sondeo lo daría por muerto a los 10 minutos."""
    import time
    from routes import inventory
    objetos, arbol = _modelo_pequeno()
    monkeypatch.setattr(inventory, 'LATIDO_DE_GUARDADO', 0.01)
    lento = ii.SnapshotRows.rows

    def rows(self):
        time.sleep(0.15)                 # una publicación que tarda
        return lento(self)
    monkeypatch.setattr(ii.SnapshotRows, 'rows', rows)
    _, trabajos, _ = _extraer(monkeypatch, objetos, arbol)
    guardando = [t for t in trabajos if 'Guardando el inventario' in (t.get('message') or '')]
    assert len(guardando) >= 3 and trabajos[-1]['status'] == 'success'
    cuantos = len(trabajos)
    time.sleep(0.08)
    assert len(trabajos) == cuantos      # terminado el guardado, el latido calla


def test_ya_no_hay_tope_de_cien_mil_elementos():
    from pathlib import Path
    from routes import inventory
    fuente = Path(inventory.__file__).read_text(encoding='utf-8')
    assert 'max_pages = 200' not in fuente
    assert inventory.EXTRACCION_MAX_PAGINAS * 500 >= 2_000_000


def test_la_extraccion_no_guarda_el_modelo_en_una_lista():
    """Guardia contra la regresión: las tres listas que juntaban el modelo entero no vuelven."""
    from pathlib import Path
    from routes import inventory
    fuente = Path(inventory.__file__).read_text(encoding='utf-8')
    for junta in ('all_items', 'inventory_data', 'collection.extend('):
        assert junta not in fuente, junta
