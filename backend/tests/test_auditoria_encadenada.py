"""El registro encadenado: alterarlo tiene que NOTARSE.

QUE FIJA ESTO
-------------
BASELINE 0 · C3: en produccion habia 552 UPDATE sobre `activity_log` y 2 DELETE
sobre `auth_events`, y no habia forma de distinguir mantenimiento legitimo de
manipulacion. La cadena no lo impide -- quien pueda escribir puede recalcularla
entera -- pero convierte una alteracion silenciosa en una alteracion visible.

Estos tests fijan las tres roturas que hay que saber distinguir:
  - cambiar el CONTENIDO de una fila            -> 'huella no coincide'
  - BORRAR una fila del medio                   -> 'eslabon roto'
  - insertar salteando el sellado               -> no cuenta como rotura, cuenta
                                                   como 'sin_sellar', que es otra
                                                   cosa y hay que poder decirla
"""
import auditoria_encadenada as cadena


def _fila(n, **kw):
    base = {'model_urn': 'obra', 'action': 'upload', 'entity_type': 'file',
            'entity_id': f'doc-{n}', 'entity_name': f'plano-{n}.pdf',
            'performed_by': 'ana', 'details': {}, 'created_at': f'2026-08-13T10:0{n}:00'}
    base.update(kw)
    return base


class CursorCadena:
    """Simula activity_log con la cadena ya calculada."""

    def __init__(self, filas):
        self.filas = filas          # [(id, contenido, hash_anterior, hash)]
        self._ultima = []

    def execute(self, sql, params=None):
        if 'FROM activity_log' in sql and 'ORDER BY id ASC' in sql:
            self._ultima = [(fid, c['model_urn'], c['action'], c['entity_type'],
                             c['entity_id'], c['entity_name'], c['performed_by'],
                             c['details'], c['created_at'], ha, h)
                            for fid, c, ha, h in self.filas]
        else:
            self._ultima = []

    def fetchall(self):
        return self._ultima

    def fetchone(self):
        return self._ultima[0] if self._ultima else None


def _cadena_sana(n=4):
    filas, anterior = [], cadena.GENESIS
    for i in range(1, n + 1):
        c = _fila(i)
        h = cadena.huella_de_fila(anterior, c)
        filas.append((i, c, anterior, h))
        anterior = h
    return filas


# ── Una cadena intacta se declara intacta ──────────────────────────────────

def test_cadena_sana_es_integra():
    r = cadena.verificar(CursorCadena(_cadena_sana()))
    assert r['integra'] is True
    assert r['revisadas'] == 4 and r['roturas'] == []


def test_la_primera_fila_arranca_en_el_genesis():
    """Sin semilla no se distingue "es la primera" de "le borraron las anteriores"."""
    assert cadena.huella_de_fila(None, _fila(1)) == cadena.huella_de_fila(cadena.GENESIS, _fila(1))


# ── Las tres roturas, y son distintas ──────────────────────────────────────

def test_cambiar_el_contenido_de_una_fila_se_detecta():
    filas = _cadena_sana()
    fid, c, ha, h = filas[1]
    filas[1] = (fid, dict(c, performed_by='otro'), ha, h)   # alguien reescribe el autor
    r = cadena.verificar(CursorCadena(filas))
    assert r['integra'] is False
    assert any(x['motivo'] == 'huella no coincide' and x['id'] == 2 for x in r['roturas'])


def test_borrar_una_fila_del_medio_se_detecta():
    filas = _cadena_sana()
    del filas[1]                                            # desaparece el evento 2
    r = cadena.verificar(CursorCadena(filas))
    assert r['integra'] is False
    assert any(x['motivo'] == 'eslabon roto' for x in r['roturas'])


def test_las_filas_sin_sellar_no_son_una_rotura():
    """Las 1.755 anteriores al encadenamiento no estan alteradas: estan sin sellar."""
    filas = _cadena_sana(2)
    filas.insert(0, (0, _fila(0), None, None))
    r = cadena.verificar(CursorCadena(filas))
    assert r['sin_sellar'] == 1
    assert r['integra'] is True, 'no sellada no es lo mismo que alterada'


# ── El texto sobre el que se calcula no puede variar ───────────────────────

def test_el_orden_de_las_claves_no_cambia_la_huella():
    """Si dependiera del orden, la verificacion daria roturas falsas."""
    a = {'z': 1, 'a': 2, 'm': {'y': 1, 'x': 2}}
    b = {'a': 2, 'm': {'x': 2, 'y': 1}, 'z': 1}
    assert cadena.huella_de_fila('x' * 64, a) == cadena.huella_de_fila('x' * 64, b)


def test_la_huella_depende_de_la_anterior():
    """Si no dependiera, reordenar el registro no se notaria."""
    c = _fila(1)
    assert cadena.huella_de_fila('a' * 64, c) != cadena.huella_de_fila('b' * 64, c)
