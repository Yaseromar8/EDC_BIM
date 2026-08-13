# -*- coding: utf-8 -*-
"""El ciclo completo del segundo factor, de extremo a extremo (sin base de datos).

Lo que se comprueba aqui no es que TOTP calcule bien -- eso lo cubre
test_segundo_factor.py con los vectores oficiales del RFC 6238 -- sino que el
ciclo de la aplicacion no tenga atajos:

  · la contrasena correcta NO da sesion si la cuenta tiene segundo factor
  · el desafio esta firmado, caduca y no vale para otro proposito
  · un codigo de recuperacion sirve UNA vez
  · tener la sesion NO basta para quitarse el segundo factor
  · con EXIGIR_2FA_ESTRICTO se cierra la puerta al admin que no lo tiene puesto

DB-free: se mockea get_db_connection.
"""
import importlib

import pytest
from flask import Flask, g
from werkzeug.security import generate_password_hash

SECRETO = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP'
CLAVE = 'Obra-Talara-2026!'


@pytest.fixture
def entorno(monkeypatch):
    monkeypatch.setenv('APP_SECRET', 'secreto-de-prueba')
    monkeypatch.setenv('SESSION_PEPPER', 'pimienta-de-prueba')
    monkeypatch.setenv('AUTH_POLICY_MODE', 'sombra')
    monkeypatch.setenv('ENFORCE_PROJECT_AUTHZ', 'false')
    monkeypatch.setenv('ALLOW_DEMO_TOKEN', 'false')
    monkeypatch.setenv('EXIGIR_2FA_ESTRICTO', 'false')

    # El limitador guarda sus contadores en memoria de proceso y sobrevive entre
    # modulos de test: con la suite entera, los logins de otros ficheros agotaban
    # la cuota y estas pruebas recibian 429 en vez de lo que comprueban.
    import rate_limit
    if rate_limit.limiter is not None:
        try:
            rate_limit.limiter.reset()
        except Exception:
            pass

    import enlaces_firmados
    importlib.reload(enlaces_firmados)
    import routes.auth as ra
    importlib.reload(ra)

    estado = {
        'id': 7, 'name': 'Ana Torres', 'email': 'ana@contratista.com',
        'rol': 'admin', 'activa': True,
        'hash': generate_password_hash(CLAVE),
        'secreto': SECRETO, 'totp_activo': True,
        'recuperacion': [],      # huellas sin usar
        'usadas': [],
        'sesion_actual': {'id': 7, 'email': 'ana@contratista.com', 'role': 'admin'},
        'sql': [],
    }

    class Cursor:
        rowcount = 1

        def __init__(self):
            self.ultimo = ('', None)
            self._devolver = None

        def execute(self, sql, params=None):
            self.ultimo = (sql, params)
            estado['sql'].append(sql)
            s = ' '.join(sql.split())
            self._devolver = None
            if s.startswith('UPDATE users SET totp_secreto = %s'):
                # el WHERE exige que NO este activo
                self.rowcount = 0 if estado['totp_activo'] else 1
                if self.rowcount:
                    estado['secreto'] = params[0]
                return
            self.rowcount = 1
            if 'UPDATE totp_recuperacion SET usado_en' in s:
                huella = params[1]
                if huella in estado['recuperacion']:
                    estado['recuperacion'].remove(huella)
                    estado['usadas'].append(huella)
                    self._devolver = (99,)
                return
            if s.startswith('INSERT INTO totp_recuperacion'):
                estado['recuperacion'].append(params[1])
                return
            if s.startswith('DELETE FROM totp_recuperacion'):
                estado['recuperacion'] = []
                return
            if 'totp_activo = TRUE' in s:
                estado['totp_activo'] = True
                return
            if 'totp_activo = FALSE' in s:
                estado['totp_activo'] = False
                estado['secreto'] = None
                return
            if 'u.password_hash' in s:
                self._devolver = (estado['id'], estado['name'], estado['email'],
                                  estado['hash'], estado['rol'], 'Contratista', 'BIM',
                                  estado['activa'])
            elif 'totp_activado_en,' in s:
                self._devolver = (estado['totp_activo'], None, len(estado['recuperacion']))
            elif 'SELECT totp_secreto, COALESCE(totp_activo' in s:
                self._devolver = (estado['secreto'], estado['totp_activo'])
            elif 'u.totp_secreto' in s:
                self._devolver = (estado['id'], estado['name'], estado['email'],
                                  estado['rol'], 'Contratista', 'BIM', estado['secreto'])
            elif 'COALESCE(totp_activo, FALSE) FROM users' in s:
                self._devolver = (estado['totp_activo'],)

        def fetchone(self):
            return self._devolver

    class Conn:
        def cursor(self): return Cursor()
        def commit(self): pass
        def rollback(self): pass
        def __enter__(self): return self
        def __exit__(self, *a): return False

    monkeypatch.setattr(ra, 'get_db_connection', lambda: Conn())
    monkeypatch.setattr(ra, 'create_session', lambda uid: f'sesion-de-{uid}')

    app = Flask(__name__)

    @app.before_request
    def _sesion_falsa():
        g.current_user = estado['sesion_actual']

    app.register_blueprint(ra.auth_bp)
    return app.test_client(), estado, ra


def _codigo_ahora():
    import segundo_factor
    return segundo_factor.codigo(SECRETO)


# ── La contrasena ya no basta ──────────────────────────────────────────────

def test_la_contrasena_correcta_no_da_sesion_si_hay_segundo_factor(entorno):
    c, _e, _ra = entorno
    r = c.post('/api/auth/login', json={'email': 'ana@contratista.com', 'password': CLAVE})
    assert r.status_code == 200
    assert r.get_json()['requiere_2fa'] is True
    # lo importante: NO viene el token de sesion
    assert 'session_token' not in r.get_json()
    assert r.get_json()['desafio']


def test_sin_segundo_factor_el_login_sigue_funcionando(entorno):
    c, e, _ra = entorno
    e['totp_activo'] = False
    r = c.post('/api/auth/login', json={'email': 'ana@contratista.com', 'password': CLAVE})
    assert r.status_code == 200
    assert r.get_json()['session_token'] == 'sesion-de-7'
    # ...pero se avisa de que a esta cuenta se le exige
    assert r.get_json()['segundo_factor_pendiente'] is True


def test_no_se_anota_login_ok_cuando_falta_el_segundo_factor(entorno):
    """Anotar como inicio de sesion una contrasena acertada sin segundo factor
    falsearia el registro de accesos, que es justo lo que se audita."""
    c, e, ra = entorno
    eventos = []
    ra.registrar_evento = lambda ev, **kw: eventos.append(ev)
    c.post('/api/auth/login', json={'email': 'ana@contratista.com', 'password': CLAVE})
    assert 'login_pide_2fa' in eventos
    assert 'login_ok' not in eventos


# ── El canje ───────────────────────────────────────────────────────────────

def test_el_codigo_correcto_canjea_el_desafio_por_una_sesion(entorno):
    c, _e, _ra = entorno
    desafio = c.post('/api/auth/login',
                     json={'email': 'ana@contratista.com', 'password': CLAVE}).get_json()['desafio']
    r = c.post('/api/auth/2fa/verify', json={'desafio': desafio, 'codigo': _codigo_ahora()})
    assert r.status_code == 200, r.get_json()
    assert r.get_json()['session_token'] == 'sesion-de-7'
    assert r.get_json()['email'] == 'ana@contratista.com'


def test_un_codigo_equivocado_no_abre(entorno):
    c, _e, _ra = entorno
    desafio = c.post('/api/auth/login',
                     json={'email': 'ana@contratista.com', 'password': CLAVE}).get_json()['desafio']
    r = c.post('/api/auth/2fa/verify', json={'desafio': desafio, 'codigo': '000000'})
    assert r.status_code == 401


def test_sin_desafio_no_hay_canje(entorno):
    """Presentar solo el codigo no vale: hace falta haber pasado por la contrasena."""
    c, _e, _ra = entorno
    r = c.post('/api/auth/2fa/verify', json={'codigo': _codigo_ahora()})
    assert r.status_code == 401


def test_un_desafio_manipulado_no_vale(entorno):
    c, _e, _ra = entorno
    desafio = c.post('/api/auth/login',
                     json={'email': 'ana@contratista.com', 'password': CLAVE}).get_json()['desafio']
    r = c.post('/api/auth/2fa/verify',
               json={'desafio': desafio[:-4] + 'aaaa', 'codigo': _codigo_ahora()})
    assert r.status_code == 401


def test_un_token_de_otro_proposito_no_sirve_de_desafio(entorno):
    """Misma firma, otra sal: un enlace de restablecimiento no puede saltarse el 2FA."""
    c, _e, _ra = entorno
    import enlaces_firmados as ef
    ajeno = ef.emitir(ef.PROPOSITO_RESET, {'uid': 7})
    r = c.post('/api/auth/2fa/verify', json={'desafio': ajeno, 'codigo': _codigo_ahora()})
    assert r.status_code == 401


def test_el_desafio_caduca(entorno):
    c, _e, _ra = entorno
    import enlaces_firmados as ef
    assert ef.CADUCIDAD[ef.PROPOSITO_2FA] <= 600, 'el desafio no puede vivir horas'


# ── Alta ───────────────────────────────────────────────────────────────────

def test_alta_completa_genera_secreto_uri_y_codigos_de_recuperacion(entorno):
    c, e, _ra = entorno
    import segundo_factor as dfa
    e['totp_activo'] = False

    alta = c.post('/api/auth/2fa/setup').get_json()
    assert alta['uri'].startswith('otpauth://totp/')
    assert alta['secreto'] in alta['uri']
    assert e['totp_activo'] is False, 'el setup NO debe activar por si solo'

    ok = c.post('/api/auth/2fa/activar', json={'codigo': dfa.codigo(alta['secreto'])})
    assert ok.status_code == 200, ok.get_json()
    assert e['totp_activo'] is True
    assert len(ok.get_json()['codigos_de_recuperacion']) == dfa.CODIGOS_RECUPERACION


def test_no_se_activa_con_un_codigo_que_no_cuadra(entorno):
    c, e, _ra = entorno
    e['totp_activo'] = False
    c.post('/api/auth/2fa/setup')
    r = c.post('/api/auth/2fa/activar', json={'codigo': '123456'})
    assert r.status_code == 400
    assert e['totp_activo'] is False


def test_el_setup_no_puede_pisar_un_segundo_factor_ya_activo(entorno):
    """Si pudiera, robar la sesion bastaria para cambiar el secreto por otro propio."""
    c, e, _ra = entorno
    r = c.post('/api/auth/2fa/setup')
    assert r.status_code == 409
    assert e['secreto'] == SECRETO


def test_el_alta_exige_sesion(entorno):
    c, e, _ra = entorno
    e['sesion_actual'] = None
    assert c.post('/api/auth/2fa/setup').status_code == 401
    assert c.post('/api/auth/2fa/activar', json={'codigo': '1'}).status_code == 401
    assert c.get('/api/auth/2fa/estado').status_code == 401


# ── Codigos de recuperacion ────────────────────────────────────────────────

def test_un_codigo_de_recuperacion_sirve_una_vez_y_solo_una(entorno):
    c, e, _ra = entorno
    import segundo_factor as dfa
    e['totp_activo'] = False
    alta = c.post('/api/auth/2fa/setup').get_json()
    codigos = c.post('/api/auth/2fa/activar',
                     json={'codigo': dfa.codigo(alta['secreto'])}).get_json()['codigos_de_recuperacion']
    uno = codigos[0]

    def entrar():
        d = c.post('/api/auth/login',
                   json={'email': 'ana@contratista.com', 'password': CLAVE}).get_json()['desafio']
        return c.post('/api/auth/2fa/verify', json={'desafio': d, 'codigo': uno})

    assert entrar().status_code == 200
    assert entrar().status_code == 401, 'un codigo de recuperacion no puede reutilizarse'


def test_los_codigos_de_recuperacion_no_se_guardan_en_claro(entorno):
    c, e, _ra = entorno
    import segundo_factor as dfa
    e['totp_activo'] = False
    alta = c.post('/api/auth/2fa/setup').get_json()
    codigos = c.post('/api/auth/2fa/activar',
                     json={'codigo': dfa.codigo(alta['secreto'])}).get_json()['codigos_de_recuperacion']
    guardado = ' '.join(e['recuperacion'])
    for uno in codigos:
        assert uno not in guardado
        assert dfa.huella_de_codigo(uno) in e['recuperacion']


# ── Baja ───────────────────────────────────────────────────────────────────

def test_tener_la_sesion_no_basta_para_quitarse_el_segundo_factor(entorno):
    c, e, _ra = entorno
    r = c.post('/api/auth/2fa/desactivar', json={})
    assert r.status_code == 400
    assert e['totp_activo'] is True, 'seguiria protegida'


def test_con_el_codigo_si_se_desactiva_y_se_borra_el_secreto(entorno):
    c, e, _ra = entorno
    r = c.post('/api/auth/2fa/desactivar', json={'codigo': _codigo_ahora()})
    assert r.status_code == 200
    assert e['totp_activo'] is False
    assert e['secreto'] is None
    assert e['recuperacion'] == []


# ── Obligatoriedad ─────────────────────────────────────────────────────────

def test_en_modo_estricto_el_admin_sin_segundo_factor_no_entra(entorno, monkeypatch):
    c, e, _ra = entorno
    e['totp_activo'] = False
    monkeypatch.setenv('EXIGIR_2FA_ESTRICTO', 'true')
    r = c.post('/api/auth/login', json={'email': 'ana@contratista.com', 'password': CLAVE})
    assert r.status_code == 403
    assert r.get_json()['code'] == 'SEGUNDO_FACTOR_OBLIGATORIO'


def test_en_modo_estricto_un_usuario_normal_sigue_entrando(entorno, monkeypatch):
    """Solo se exige a quien puede destruir el expediente."""
    c, e, _ra = entorno
    e['totp_activo'] = False
    e['rol'] = 'user'
    monkeypatch.setenv('EXIGIR_2FA_ESTRICTO', 'true')
    r = c.post('/api/auth/login', json={'email': 'ana@contratista.com', 'password': CLAVE})
    assert r.status_code == 200
    assert r.get_json()['segundo_factor_pendiente'] is False


def test_el_estado_dice_si_esta_activo_y_si_se_exige(entorno):
    c, _e, _ra = entorno
    d = c.get('/api/auth/2fa/estado').get_json()
    assert d['activo'] is True and d['exigido'] is True
