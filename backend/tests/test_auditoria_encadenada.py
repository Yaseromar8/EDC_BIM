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
  - filas sin sellar ANTERIORES a la cadena      -> no cuentan como rotura, cuentan
                                                   como 'sin_sellar', que es otra
                                                   cosa y hay que poder decirla
  - insertar salteando el sellado DESPUES de la
    primera fila sellada (14-oct-2026)            -> 'sin huella', que SI es rotura:
                                                   ya no hay excusa de "es antigua"
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


# ── El extremo de la cadena ────────────────────────────────────────────────
# Medido el 13-ago-2026: la cadena detecta que falta una fila porque la
# SIGUIENTE apunta a ella. La ultima no tiene siguiente, asi que borrar el final
# no se notaba -- y borrando de atras hacia delante se podia vaciar el registro
# entero sin que verificar() dijera nada. Es justo lo que haria quien quisiera
# borrar su propio rastro, porque su rastro es lo ultimo que hay.


class CursorConAncla(CursorCadena):
    """Ademas del recorrido, responde a las consultas del extremo."""

    def execute(self, sql, params=None):
        s = ' '.join(sql.split())
        if 'ORDER BY id DESC LIMIT 1' in s:
            sellada = [f for f in self.filas if f[3]]
            self._ultima = [(sellada[-1][0], sellada[-1][3])] if sellada else []
        elif 'count(*)' in s:
            self._ultima = [(len([f for f in self.filas if f[3]]),)]
        elif 'WHERE id = %s' in s:
            fila = [f for f in self.filas if f[0] == params[0]]
            self._ultima = [(fila[0][3],)] if fila else []
        else:
            super().execute(sql, params)


def test_borrar_el_final_del_registro_se_detecta_con_ancla():
    cur = CursorConAncla(_cadena_sana(4))
    ancla = cadena.ancla_actual(cur)
    assert ancla['id'] == 4

    cur.filas = cur.filas[:-1]                 # se borra el ultimo evento
    sin_ancla = cadena.verificar(cur)
    con_ancla = cadena.verificar(cur, ancla=ancla)

    assert sin_ancla['integra'] is True, 'asi era antes: el truncado de cola no se veia'
    assert con_ancla['integra'] is False
    assert con_ancla['roturas'][0]['motivo'] == 'cola truncada'


def test_vaciar_el_registro_de_atras_hacia_delante_se_detecta():
    """El caso que de verdad importa: no una fila, TODAS."""
    cur = CursorConAncla(_cadena_sana(5))
    ancla = cadena.ancla_actual(cur)
    cur.filas = []
    assert cadena.verificar(cur, ancla=ancla)['integra'] is False


def test_reescribir_el_final_tambien_se_detecta():
    cur = CursorConAncla(_cadena_sana(3))
    ancla = cadena.ancla_actual(cur)
    fid, c, ha, _h = cur.filas[-1]
    cur.filas[-1] = (fid, c, ha, 'f' * 64)     # misma fila, otra huella
    res = cadena.verificar(cur, ancla=ancla)
    assert any(r['motivo'] == 'cola reescrita' for r in res['roturas'])


def test_sin_ancla_la_verificacion_se_comporta_como_antes():
    """El ancla es opcional: quien no la tenga no ve peor de lo que veia."""
    cur = CursorConAncla(_cadena_sana(3))
    assert cadena.verificar(cur)['integra'] is True


# ── Filas sin sellar DESPUÉS de la cadena (14-oct-2026) ────────────────────
# Cuatro vías del código insertaban en activity_log sin sellar, y verificar()
# las contaba como «anteriores al encadenamiento». Así se podían alterar o
# borrar sin que nada lo notara (docs/ux/PROPUESTA_CONSULTA_Y_TRAZABILIDAD.md §5-A).

def test_una_fila_sin_sellar_despues_de_la_cadena_es_rotura():
    filas = _cadena_sana(2)
    filas.append((3, _fila(3), None, None))          # alguien escribe salteando el sello
    r = cadena.verificar(CursorCadena(filas))
    assert r['integra'] is False
    assert any(x['motivo'] == 'sin huella' and x['id'] == 3 for x in r['roturas'])


def test_las_antiguas_siguen_sin_ser_rotura_aunque_haya_nuevas_rotas():
    """El caso de las 1.755 filas anteriores no cambia."""
    filas = _cadena_sana(2)
    filas.insert(0, (0, _fila(0), None, None))
    filas.append((3, _fila(3), None, None))
    r = cadena.verificar(CursorCadena(filas))
    assert r['sin_sellar'] == 1
    assert [x['id'] for x in r['roturas']] == [3]


class CursorPendientes:
    """Responde a las consultas de sellar_pendientes() sobre una tabla en memoria."""

    def __init__(self, filas):
        self.filas = filas            # [(id, hash)]
        self.updates = []
        self._u = None

    def execute(self, sql, params=None):
        s = ' '.join(sql.split())
        sin = [i for i, h in self.filas if h is None]
        if s.startswith('SELECT min(id)'):
            self._u = [(min(sin) if sin else None,)]
        elif 'hash IS NOT NULL AND id >' in s:
            self._u = [(1,)] if any(h is not None and i > params[0] for i, h in self.filas) else []
        elif 'ORDER BY id DESC LIMIT 1' in s:
            con = [(i, h) for i, h in self.filas if h is not None]
            self._u = [(con[-1][1],)] if con else []
        elif s.startswith('SELECT id, model_urn'):
            self._u = [(i, 'o', 'a', 't', 'e', 'n', 'p', {}, '2026-10-14T00:00:00') for i in sin]
        elif s.startswith('UPDATE'):
            self.updates.append(params)
            self._u = []
        else:
            self._u = []

    def fetchone(self):
        return self._u[0] if self._u else None

    def fetchall(self):
        return self._u or []


def test_sellar_pendientes_se_niega_si_hay_filas_intercaladas():
    """Encadenarlas al final fabricaría roturas falsas, y en su sitio obligaría a
    reescribir todas las posteriores. Se niega y no toca nada."""
    c = CursorPendientes([(1, 'a' * 64), (2, None), (3, 'b' * 64)])
    assert cadena.sellar_pendientes(c) == 0
    assert c.updates == []


def test_sellar_pendientes_sigue_sellando_las_antiguas():
    c = CursorPendientes([(1, None), (2, None)])
    assert cadena.sellar_pendientes(c) == 2
    assert len(c.updates) == 2
