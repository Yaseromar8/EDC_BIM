"""La huella del contenido: lo que permite decir "este es el fichero que se aprobo".

LO QUE ESTOS TESTS FIJAN
------------------------
1. La huella se calcula sin consumir el flujo. Si huella_de_flujo dejara el
   puntero al final, la subida posterior escribiria CERO BYTES y nadie se
   enteraria hasta que alguien intentara abrir el documento. Es el fallo mas caro
   posible de esta funcion y el mas silencioso.
2. Una huella anotada NUNCA se sobrescribe. Si llega otra distinta para la misma
   version no es una correccion: es que el contenido cambio bajo una version ya
   sellada, y eso hay que poder verlo.
3. La comprobacion distingue CUATRO situaciones, no dos. "sin huella" no es lo
   mismo que "no coincide": la primera dice que no se puede demostrar, la segunda
   que el fichero fue alterado.
"""
import io

import integridad


class CursorFalso:
    def __init__(self, fila=None, rowcount=1):
        self.fila = fila; self.rowcount = rowcount; self.sql = []; self.params = []
    def execute(self, sql, params=None):
        self.sql.append(sql); self.params.append(params)
    def fetchone(self):
        return self.fila


# ── El flujo queda rebobinado ──────────────────────────────────────────────

def test_la_huella_no_consume_el_flujo():
    """Si consumiera el flujo, se subiria un fichero vacio en silencio."""
    datos = b'contenido del plano' * 1000
    f = io.BytesIO(datos)
    integridad.huella_de_flujo(f)
    assert f.read() == datos, 'el flujo no quedo rebobinado: la subida seria de 0 bytes'


def test_la_huella_es_la_de_sha256_de_verdad():
    import hashlib
    datos = b'500125-CSSP001-740-XX-DR-HD-004142'
    assert integridad.huella_de_flujo(io.BytesIO(datos)) == hashlib.sha256(datos).hexdigest()
    assert integridad.huella_de_bytes(datos) == hashlib.sha256(datos).hexdigest()


def test_contenidos_distintos_dan_huellas_distintas():
    a = integridad.huella_de_flujo(io.BytesIO(b'plano revision C01'))
    b = integridad.huella_de_flujo(io.BytesIO(b'plano revision C02'))
    assert a != b


def test_funciona_con_ficheros_mayores_que_el_trozo():
    """Los planos de esta obra llegan a 272 MB: la lectura va por trozos."""
    datos = b'x' * (integridad.TROZO * 2 + 137)
    import hashlib
    assert integridad.huella_de_flujo(io.BytesIO(datos)) == hashlib.sha256(datos).hexdigest()


# ── Una huella anotada no se pisa ──────────────────────────────────────────

def test_anotar_solo_escribe_si_esta_vacia():
    cur = CursorFalso()
    integridad.anotar(cur, 'v1', 'a' * 64)
    assert 'sha256 IS NULL' in cur.sql[0], 'debe condicionar a que no hubiera huella'


def test_anotar_ignora_lo_incompleto():
    cur = CursorFalso()
    assert integridad.anotar(cur, None, 'a' * 64) is False
    assert integridad.anotar(cur, 'v1', None) is False
    assert cur.sql == []


# ── La comprobacion distingue cuatro situaciones ───────────────────────────

def test_coincide():
    sha = 'a' * 64
    cur = CursorFalso(fila=(sha, 3, None, 'A1', 'C02', 'Ana'))
    veredicto, ficha = integridad.comprobar(cur, 'v1', sha)
    assert veredicto == 'coincide'
    assert ficha['codigo_idoneidad'] == 'A1' and ficha['codigo_revision'] == 'C02'


def test_no_coincide_es_distinto_de_sin_huella():
    cur = CursorFalso(fila=('a' * 64, 3, None, 'A1', 'C02', 'Ana'))
    assert integridad.comprobar(cur, 'v1', 'b' * 64)[0] == 'NO COINCIDE'

    cur2 = CursorFalso(fila=(None, 1, None, None, None, None))
    assert integridad.comprobar(cur2, 'v1', 'b' * 64)[0] == 'sin huella'


def test_version_inexistente():
    assert integridad.comprobar(CursorFalso(fila=None), 'v9', 'a' * 64)[0] == 'sin version'


def test_la_ficha_lleva_con_que_autorizacion_se_emitio():
    """Sin idoneidad y revision, "coincide" no dice para que servia ese fichero."""
    cur = CursorFalso(fila=('a' * 64, 5, None, 'A1', 'C03', 'Ana'))
    _v, ficha = integridad.comprobar(cur, 'v1', 'a' * 64)
    for clave in ('version', 'sha256_anotado', 'sha256_calculado', 'emitida_en',
                  'codigo_idoneidad', 'codigo_revision', 'emitida_por'):
        assert clave in ficha
