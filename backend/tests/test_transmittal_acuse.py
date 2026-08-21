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
· Un administrador puede REGISTRAR una recepción -pasa constantemente: el
  contratista avisa por teléfono- pero eso NO es un acuse del destinatario, y
  desde el 21-ago-2026 tampoco lo parece: es un ADMIN_RECORDED_RECEIPT, dice de
  qué destinatario se trata y quién lo anotó, y no lleva los campos con los que
  se firma un acuse propio. Quien lea el expediente no puede confundirlos.
· Y salda al DESTINATARIO. Antes cerraba el encargo de quien registraba -que no
  tenía ninguno-, así que el destinatario seguía debiéndolo mientras la emisión
  mostraba un acuse.
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
        7: (OBRA, [{'user_id': 3, 'email': 'supervision@cliente.pe',
                    'name': 'Supervisión'}], []),
        # DOS destinatarios distintos: es el unico caso en que una emision reune
        # dos recepciones. Antes esa prueba usaba «destinatario + admin», que
        # bajo el modelo nuevo son la MISMA recepcion contada dos veces.
        8: (OBRA, [{'user_id': 3, 'email': 'supervision@cliente.pe',
                    'name': 'Supervisión'},
                   {'user_id': 6, 'email': 'contratista@cliente.pe',
                    'name': 'Contratista'}], []),
        9: (AJENA, [{'user_id': 9, 'email': 'otro@cliente.pe', 'name': 'Otro'}], []),
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
        # CADA PERSONA CON SU IDENTIDAD.
        #
        # Este doble daba `id: 3` a las TRES, asi que
        # `test_dos_personas_distintas_suman_dos_acuses` decia «dos personas
        # distintas» mientras usaba una sola identidad. Mientras el acuse se
        # cotejaba por texto no se notaba; en cuanto paso a cotejarse por
        # identidad, el segundo acuse quedaba --correctamente-- como repetido.
        # Una prueba que se llama «dos personas distintas» tiene que usarlas.
        gente = {
            'supervision': {'id': 3, 'email': 'supervision@cliente.pe',
                            'name': 'Supervisión', 'role': 'user'},
            'ajeno': {'id': 4, 'email': 'nadie@otra.pe', 'name': 'Nadie',
                      'role': 'user'},
            'admin': {'id': 5, 'email': 'jefe@obra.pe', 'name': 'Jefe de obra',
                      'role': 'admin'},
            'contratista': {'id': 6, 'email': 'contratista@cliente.pe',
                            'name': 'Contratista', 'role': 'user'},
        }
        g.current_user = dict(gente[quien])

    return app.test_client(), guardado, filas


def _acusar(cli, tid=7, quien='supervision', **cuerpo):
    return cli.post(f'/api/transmittals/{tid}/acuse',
                    headers={'X-Quien': quien}, json=(cuerpo or None))


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

def test_un_admin_puede_registrar_la_recepcion(api):
    """Pasa constantemente: el contratista avisa por teléfono.

    Pero tiene que decir DE QUIÉN es la recepción. Antes no hacía falta, y el
    resultado era una fila que decía «recibido» sin sujeto.
    """
    cli, guardado, _f = api
    assert _acusar(cli, quien='admin', destinatario_id=3).status_code == 200
    assert guardado['acuses'][0]['registrado_por'] == 'Jefe de obra'
    assert guardado['acuses'][0]['destinatario_id'] == 3


def test_registrar_sin_decir_de_quien_no_se_admite(api):
    """«Recibido» sin sujeto no es un registro: es una afirmación sin dueño."""
    cli, guardado, _f = api
    r = _acusar(cli, quien='admin')
    assert r.status_code == 400
    assert r.get_json()['code'] == 'FALTA_DESTINATARIO'
    assert guardado['acuses'] is None


def test_no_se_registra_por_quien_no_es_destinatario(api):
    cli, guardado, _f = api
    r = _acusar(cli, quien='admin', destinatario_id=4)
    assert r.status_code == 400
    assert r.get_json()['code'] == 'NO_ES_DESTINATARIO'
    assert guardado['acuses'] is None


def test_el_registro_del_admin_NO_se_confunde_con_un_acuse(api):
    """La distinción que pedía la Enmienda 2.

    Antes las dos vías producían la misma forma de fila y solo cambiaba el
    campo `via`; leído desde el expediente, el registro administrativo pasaba
    por un acuse del destinatario. Ahora lleva `tipo`, y NO lleva `por_id`: no
    hay forma de leerlo como si el destinatario hubiera actuado.
    """
    cli, guardado, _f = api
    _acusar(cli, quien='admin', destinatario_id=3)
    fila = guardado['acuses'][0]
    assert fila['tipo'] == 'ADMIN_RECORDED_RECEIPT'
    assert fila['via'] == 'admin'
    assert fila['destinatario'] == 'Supervisión'
    assert fila['registrado_por_id'] == 5
    assert 'por_id' not in fila and 'por' not in fila


def test_el_registro_administrativo_salda_al_DESTINATARIO(api):
    """Y no a quien lo registró, que no debía nada.

    `encargos._acuso` lee `destinatario_id`: quien queda saldado es la persona
    que recibió, no el administrador que lo anotó.
    """
    import encargos
    cli, guardado, _f = api
    _acusar(cli, quien='admin', destinatario_id=3)
    acuses = guardado['acuses']
    assert encargos._acuso(acuses, 'supervision@cliente.pe', 'Supervisión', 3)
    assert not encargos._acuso(acuses, 'jefe@obra.pe', 'Jefe de obra', 5)


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


def test_dos_destinatarios_distintos_suman_dos_acuses(api):
    """DOS DESTINATARIOS, no «destinatario + admin».

    Esta prueba usaba antes al administrador como segunda persona. Bajo el
    modelo nuevo eso no son dos recepciones: es la MISMA recepción --la del
    destinatario-- contada dos veces, y por eso ya no suma.
    """
    cli, guardado, _f = api
    _acusar(cli, tid=8, quien='supervision')
    _acusar(cli, tid=8, quien='contratista')
    assert len(guardado['acuses']) == 2


def test_el_admin_no_duplica_una_recepcion_ya_acusada(api):
    cli, guardado, _f = api
    _acusar(cli, quien='supervision')
    r = _acusar(cli, quien='admin', destinatario_id=3)
    assert r.get_json()['ya_estaba'] is True
    assert len(guardado['acuses']) == 1


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
