"""Acuse de recibo del transmittal: la diferencia entre enviar y entregar.

EL HUECO QUE ESTO CIERRA
------------------------
Un transmittal sin acuse prueba el ENVÍO, no la ENTREGA. En ISO 19650 -y en un
contrato de obra pública- "yo te lo mandé" y "tú lo recibiste" son dos hechos
distintos, y el segundo es el que se discute cuando hay un plazo de por medio.
La tabla no tenía ni columna, ni endpoint, ni botón: el registro decía "emitido a
Fulano" y ahí se acababa la historia.

DECISIONES QUE FIJAN ESTAS PRUEBAS
----------------------------------
· El acuse SOLO SUMA. Nadie borra un acuse: la tabla es evidencia inmutable, y un
  acuse que se puede retirar no prueba nada.
· Acusa QUIEN RECIBIÓ, no cualquiera con sesión. Un tercero acusando por su cuenta
  convertiría la prueba en ruido.
· Un administrador puede registrarlo en nombre de alguien -pasa constantemente:
  el contratista avisa por teléfono- pero queda marcado como 'admin', no como
  'destinatario'. Quien lea el expediente tiene que poder distinguirlos.
· La FECHA la pone el servidor, nunca el cliente. En una discusión de plazos, la
  fecha no la decide el navegador de quien acusa.
"""
import importlib
import json

import pytest
from flask import Flask, g


OBRA = 'urn:obra:PQT8'
AJENA = 'urn:obra:OTRA'


@pytest.fixture
def api(monkeypatch):
    monkeypatch.setenv('APP_SECRET', 'secreto-de-prueba')
    monkeypatch.setenv('AUTH_POLICY_MODE', 'sombra')
    import routes.transmittals as rt
    importlib.reload(rt)

    # id -> (obra, destinatarios, acuses)
    filas = {
        7: (OBRA, [{'email': 'supervision@cliente.pe', 'name': 'Supervisión'}], []),
        9: (AJENA, [{'email': 'otro@cliente.pe', 'name': 'Otro'}], []),
    }
    guardado = {'acuses': None, 'id': None}

    class Cursor:
        def __init__(self):
            self._u = None

        def execute(self, sql, params=None):
            s = ' '.join(sql.split()).upper()
            if s.startswith('SELECT MODEL_URN, RECIPIENTS, ACUSES'):
                f = filas.get(params[0])
                self._u = f if f else None
            elif s.startswith('UPDATE TRANSMITTALS SET ACUSES'):
                guardado['acuses'] = json.loads(params[0])
                guardado['id'] = params[1]
                f = filas[params[1]]
                filas[params[1]] = (f[0], f[1], guardado['acuses'])
            elif s.startswith('SELECT NUMBER FROM TRANSMITTALS'):
                self._u = (4,)
            else:
                self._u = None

        def fetchone(self):
            return self._u

    class Conn:
        def cursor(self): return Cursor()
        def commit(self): pass
        def __enter__(self): return self
        def __exit__(self, *a): return False

    monkeypatch.setattr(rt, 'get_db_connection', lambda: Conn())
    monkeypatch.setattr(rt, 'log_activity', lambda *a, **k: None)
    import routes.documents as rd
    monkeypatch.setattr(rd, 'verify_project_access', lambda usuario, urn: urn == OBRA)

    app = Flask(__name__)
    app.register_blueprint(rt.transmittals_bp)

    @app.before_request
    def _sesion():
        from flask import request
        quien = request.headers.get('X-Quien', 'supervision')
        if quien == 'anonimo':
            return
        gente = {
            'supervision': {'email': 'supervision@cliente.pe', 'name': 'Supervisión', 'role': 'user'},
            'ajeno': {'email': 'nadie@otra.pe', 'name': 'Nadie', 'role': 'user'},
            'admin': {'email': 'jefe@obra.pe', 'name': 'Jefe de obra', 'role': 'admin'},
        }
        g.current_user = {'id': 3, **gente[quien]}

    return app.test_client(), guardado, filas


def _acusar(cli, tid=7, quien='supervision'):
    return cli.post(f'/api/transmittals/{tid}/acuse', headers={'X-Quien': quien})


# ── Lo esencial ─────────────────────────────────────────────────────────────

def test_el_destinatario_puede_acusar_recibo(api):
    cli, guardado, _f = api
    r = _acusar(cli)
    assert r.status_code == 200
    assert guardado['acuses'][0]['por'] == 'Supervisión'


def test_queda_registrado_cuando(api):
    """Sin fecha, un acuse no sirve para discutir un plazo."""
    cli, guardado, _f = api
    _acusar(cli)
    assert guardado['acuses'][0]['en']       # ISO-8601 del servidor


def test_la_fecha_la_pone_el_servidor_no_el_cliente(api):
    cli, guardado, _f = api
    cli.post('/api/transmittals/7/acuse', json={'en': '1999-01-01T00:00:00Z'})
    assert not guardado['acuses'][0]['en'].startswith('1999')


def test_un_tercero_NO_puede_acusar(api):
    """Si acusa cualquiera, el acuse deja de probar nada."""
    cli, guardado, _f = api
    r = _acusar(cli, quien='ajeno')
    assert r.status_code == 403
    assert guardado['acuses'] is None


def test_sin_sesion_no_se_acusa(api):
    cli, guardado, _f = api
    assert _acusar(cli, quien='anonimo').status_code == 401
    assert guardado['acuses'] is None


# ── El administrador que registra por otra vía ──────────────────────────────

def test_un_admin_puede_registrar_el_acuse(api):
    """Pasa constantemente: el contratista avisa por teléfono."""
    cli, guardado, _f = api
    assert _acusar(cli, quien='admin').status_code == 200
    assert guardado['acuses'][0]['por'] == 'Jefe de obra'


def test_el_acuse_del_admin_se_distingue_del_del_destinatario(api):
    """Quien lea el expediente tiene que poder saber cuál es cuál."""
    cli, guardado, _f = api
    _acusar(cli, quien='admin')
    assert guardado['acuses'][0]['via'] == 'admin'


def test_el_acuse_del_destinatario_se_marca_como_tal(api):
    cli, guardado, _f = api
    _acusar(cli, quien='supervision')
    assert guardado['acuses'][0]['via'] == 'destinatario'


# ── Solo suma: es evidencia, no un interruptor ──────────────────────────────

def test_acusar_dos_veces_no_duplica(api):
    cli, guardado, _f = api
    _acusar(cli)
    r = _acusar(cli)
    assert r.get_json()['ya_estaba'] is True
    assert len(r.get_json()['acuses']) == 1


def test_dos_personas_distintas_suman_dos_acuses(api):
    cli, guardado, _f = api
    _acusar(cli, quien='supervision')
    _acusar(cli, quien='admin')
    assert len(guardado['acuses']) == 2


def test_no_hay_forma_de_retirar_un_acuse(api):
    """Un acuse que se puede borrar no prueba nada: la ruta no admite DELETE."""
    cli, _g, _f = api
    assert cli.delete('/api/transmittals/7/acuse').status_code == 405


# ── El perímetro de obra ────────────────────────────────────────────────────

def test_no_se_acusa_un_transmittal_de_otra_obra(api):
    cli, guardado, _f = api
    assert _acusar(cli, tid=9, quien='admin').status_code == 403
    assert guardado['acuses'] is None


def test_un_transmittal_que_no_existe_da_404(api):
    cli, _g, _f = api
    assert _acusar(cli, tid=999).status_code == 404


def test_un_fallo_del_encargo_NO_tumba_el_acuse(api, monkeypatch):
    """La proyeccion no puede tumbar la transicion del objeto.

    Lo encontro esta misma suite: al conectar el motor de encargo, el acuse se
    registraba correctamente y la respuesta pasaba de 200 a 500 porque fallaba
    la actualizacion de la tabla auxiliar.

    Es al reves de como tiene que ser. `encargos` es una PROYECCION de lo que el
    objeto ya sabe: un encargo que se queda abierto de mas es molesto y VISIBLE
    --sale en la bandeja, y `encargos.huerfanos()` lo encuentra--. Un acuse que
    no se registra porque fallo una tabla auxiliar es informacion contractual
    perdida.
    """
    import encargos
    cli, guardado, _filas = api

    def revienta(*a, **k):
        raise RuntimeError('la base dijo que no')

    monkeypatch.setattr(encargos, 'cerrar_los_de', revienta)

    r = _acusar(cli)
    assert r.status_code == 200, 'un fallo de la proyeccion tumbo el acuse'
    assert guardado.get('acuses'), 'el acuse no llego a registrarse'
