"""Auditoria de cambios sobre obras.

Existe por un incidente real: el 2026-08-07 alguien con sesion creo una obra y,
cinco segundos despues, renombro y archivo PQT8_TALARA. No hubo forma de saber
quien, porque la auditoria solo registraba entradas y salidas. Estos tests fijan
que ese punto ciego queda cerrado.
"""
import importlib

import pytest
from flask import Flask


@pytest.fixture
def entorno(monkeypatch):
    monkeypatch.setenv('APP_SECRET', 'secreto-de-prueba')
    monkeypatch.setenv('AUTH_POLICY_MODE', 'sombra')
    import routes.projects as rp
    importlib.reload(rp)

    registrados = []
    estado = {'antes': ('PQT8_TALARA', 'active', 'urn:viejo')}

    class Cursor:
        def __init__(self): self.ultimo = None
        def execute(self, sql, params=None): self.ultimo = (sql, params)
        def fetchone(self):
            s = ' '.join((self.ultimo or ('',))[0].split()).upper()
            if 'SELECT NAME, STATUS, MODEL_URN' in s:
                return estado['antes']
            if s.startswith('SELECT NAME FROM PROJECTS'):
                return (estado['antes'][0],)
            return None

    class Conn:
        def cursor(self): return Cursor()
        def commit(self): pass
        def __enter__(self): return self
        def __exit__(self, *a): return False

    monkeypatch.setattr(rp, 'get_db_connection', lambda: Conn())
    import routes.auth as ra
    monkeypatch.setattr(ra, 'registrar_evento',
                        lambda evento, email=None, user_id=None, detalle=None:
                        registrados.append({'evento': evento, 'email': email, 'detalle': detalle}))

    app = Flask(__name__)
    app.register_blueprint(rp.projects_bp)

    @app.before_request
    def _sesion():
        from flask import g, request
        rol = request.headers.get('X-Rol')
        if rol:
            g.current_user = {'id': 2, 'role': rol, 'email': f'{rol}@obra.com', 'name': rol}

    return app.test_client(), registrados, estado


ADMIN = {'X-Rol': 'admin'}
USUARIO = {'X-Rol': 'user'}


def test_archivar_una_obra_deja_rastro_de_quien(entorno):
    c, registrados, _ = entorno
    assert c.delete('/api/projects/1', headers=ADMIN).status_code == 200
    evento = next(e for e in registrados if e['evento'] == 'obra_archivada')
    assert evento['email'] == 'admin@obra.com'
    assert 'obra=1' in evento['detalle']
    assert 'PQT8_TALARA' in evento['detalle']   # queda el nombre que tenía


def test_renombrar_registra_el_valor_ANTERIOR(entorno):
    """"Alguien modificó la obra" no sirve para reconstruir nada: hace falta
    saber de qué a qué."""
    c, registrados, _ = entorno
    c.put('/api/projects/1', json={'name': 'renombrada'}, headers=ADMIN)
    evento = next(e for e in registrados if e['evento'] == 'obra_modificada')
    assert "'PQT8_TALARA' -> 'renombrada'" in evento['detalle']


def test_archivar_via_put_tambien_se_registra(entorno):
    """Es lo que pasó de verdad: se archivó con un PUT status=archived, no con
    el DELETE."""
    c, registrados, _ = entorno
    c.put('/api/projects/1', json={'status': 'archived'}, headers=ADMIN)
    evento = next(e for e in registrados if e['evento'] == 'obra_modificada')
    assert "estado: 'active' -> 'archived'" in evento['detalle']


def test_un_usuario_normal_ya_no_puede_archivar(entorno):
    """Hasta el incidente, un rol 'user' bastaba: @requiere_rol no bloquea en
    modo sombra y no había guard dentro de la vista."""
    c, registrados, _ = entorno
    assert c.delete('/api/projects/1', headers=USUARIO).status_code == 403
    assert c.put('/api/projects/1', json={'name': 'x'}, headers=USUARIO).status_code == 403
    assert not registrados, 'no debe registrarse un cambio que no ocurrió'


def test_sin_sesion_tampoco(entorno):
    c, registrados, _ = entorno
    assert c.delete('/api/projects/1').status_code == 401
    assert not registrados


def test_la_auditoria_no_puede_tumbar_la_peticion(entorno, monkeypatch):
    """Si el registro falla, la operación tiene que seguir funcionando."""
    c, _registrados, _ = entorno
    import routes.auth as ra
    monkeypatch.setattr(ra, 'registrar_evento',
                        lambda **kw: (_ for _ in ()).throw(RuntimeError('base caída')))
    assert c.delete('/api/projects/1', headers=ADMIN).status_code == 200
