"""Ciclo de vida del usuario: desactivar, cambiar rol y auditoria de accesos.

Antes la UNICA accion sobre un usuario era el DELETE fisico, que arrastraba en
cascada sus sesiones, accesos y permisos: retirar a quien deja la obra borraba
tambien el rastro de quien hizo que. Y no habia forma de cambiar un rol salvo
borrar y reinvitar.
"""
import importlib

import pytest
from flask import Flask


@pytest.fixture
def entorno(monkeypatch):
    monkeypatch.setenv('APP_SECRET', 'secreto-de-prueba')
    monkeypatch.setenv('AUTH_POLICY_MODE', 'sombra')
    import routes.auth as ra
    importlib.reload(ra)

    estado = {
        'usuario': ('user', True),      # (rol, activo)
        'admins_activos': 2,
        'updates': [],
        'deletes': [],
        'eventos': [],
    }

    class Cursor:
        def __init__(self): self.ultimo = None
        def execute(self, sql, params=None):
            self.ultimo = (sql, params)
            s = ' '.join(sql.split()).upper()
            if s.startswith('UPDATE USERS'):
                estado['updates'].append((sql, params))
            elif s.startswith('DELETE FROM USERS'):
                estado['deletes'].append(params)
            elif 'INSERT INTO AUTH_EVENTS' in s:
                estado['eventos'].append(params[0])
        def fetchone(self):
            s = ' '.join((self.ultimo or ('',))[0].split()).upper()
            if 'COUNT(*) FROM USERS' in s:
                return (estado['admins_activos'],)
            if 'SELECT ROLE, COALESCE(IS_ACTIVE' in s:
                return estado['usuario']
            if s.startswith('SELECT ROLE FROM USERS'):
                return (estado['usuario'][0],)
            return None

    class Conn:
        def cursor(self): return Cursor()
        def commit(self): pass
        def __enter__(self): return self
        def __exit__(self, *a): return False

    monkeypatch.setattr(ra, 'get_db_connection', lambda: Conn())
    revocadas = []
    monkeypatch.setattr(ra, 'revoke_all_sessions',
                        lambda uid, excepto=None: revocadas.append(uid) or 1)

    app = Flask(__name__)
    app.register_blueprint(ra.auth_bp)

    @app.before_request
    def _sesion_admin():
        from flask import g, request
        if request.headers.get('X-Admin') == '1':
            g.current_user = {'id': 1, 'role': 'admin', 'name': 'Admin', 'email': 'a@b.c'}

    return app.test_client(), estado, revocadas


ADMIN = {'X-Admin': '1'}


def test_retirar_acceso_desactiva_en_vez_de_borrar(entorno):
    c, estado, revocadas = entorno
    r = c.delete('/api/users/5', headers=ADMIN)
    assert r.status_code == 200
    assert estado['deletes'] == [], 'borro la fila en vez de desactivarla'
    assert any('IS_ACTIVE = FALSE' in u[0].upper() for u in estado['updates'])
    # Desactivar sin cerrar sesiones no retira nada: su token viviria 7 dias.
    assert 5 in revocadas


def test_purgar_explicito_si_borra(entorno):
    c, estado, _ = entorno
    r = c.delete('/api/users/5?purgar=1', headers=ADMIN)
    assert r.status_code == 200
    assert estado['deletes'], 'con ?purgar=1 debe borrar de verdad'


def test_no_puedes_retirarte_a_ti_mismo(entorno):
    c, _, _ = entorno
    assert c.delete('/api/users/1', headers=ADMIN).status_code == 400


def test_no_se_puede_dejar_la_plataforma_sin_admin(entorno):
    c, estado, _ = entorno
    estado['usuario'] = ('admin', True)
    estado['admins_activos'] = 1
    r = c.delete('/api/users/5', headers=ADMIN)
    assert r.status_code == 400
    assert 'único' in r.get_json()['error'].lower() or 'unico' in r.get_json()['error'].lower()


def test_sin_sesion_no_se_retira_a_nadie(entorno):
    c, estado, _ = entorno
    assert c.delete('/api/users/5').status_code == 401
    assert not estado['updates'] and not estado['deletes']


# ── Cambio de rol ──────────────────────────────────────────────────────────

def test_cambiar_rol_revoca_las_sesiones(entorno):
    c, estado, revocadas = entorno
    r = c.patch('/api/users/5/role', json={'role': 'editor'}, headers=ADMIN)
    assert r.status_code == 200
    # El rol viaja dentro de la sesion cacheada: sin revocar seguiria con el viejo.
    assert 5 in revocadas


def test_rol_invalido_se_rechaza(entorno):
    c, estado, _ = entorno
    r = c.patch('/api/users/5/role', json={'role': 'superadmin'}, headers=ADMIN)
    assert r.status_code == 400
    assert not estado['updates']


def test_ultimo_admin_no_puede_degradarse(entorno):
    c, estado, _ = entorno
    estado['usuario'] = ('admin', True)
    estado['admins_activos'] = 1
    assert c.patch('/api/users/5/role', json={'role': 'user'}, headers=ADMIN).status_code == 400


def test_cambiar_rol_exige_admin(entorno):
    c, _, _ = entorno
    assert c.patch('/api/users/5/role', json={'role': 'admin'}).status_code == 401


def test_al_unico_admin_activo_no_se_le_degrada(entorno):
    """La otra mitad de la regla del unico administrador.

    Estaba probada para BORRARLO y no para degradarlo por rol -- y degradar deja
    la instancia igual de acefala que borrar: nadie puede administrar miembros,
    obras ni configuracion, y en una instancia de entidad no hay nadie por
    encima que lo arregle.
    """
    c, estado, _ = entorno
    estado['usuario'] = ('admin', True)
    estado['admins_activos'] = 1
    r = c.patch('/api/users/5/role', json={'role': 'viewer'}, headers=ADMIN)
    assert r.status_code == 400
    assert 'nico' in r.get_json()['error'].lower()   # "único administrador"
