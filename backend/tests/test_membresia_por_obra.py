# -*- coding: utf-8 -*-
"""P5 · La membresía de la obra, operable desde la obra.

Incorporar y retirar personas con la AUTORIDAD DE LA OBRA
(`guardia_administrativa`: Entity Admin o administrador de esta obra), que es
la figura que en ACC/Procore gestiona el padrón de su proyecto. Reglas fijas:

  · el Entity Admin NO se incorpora: alcanza todas las obras sin membresía y
    una fila suya sería mentirosa;
  · una cuenta desactivada NO se incorpora: primero se reactiva/reinvita;
  · RETIRAR MEMBRESÍA ≠ RETIRAR IDENTIDAD — mueren la fila (y con ella la
    administración de obra: vive en la fila) y las concesiones de carpeta de
    ESTA obra; los actos históricos no se tocan;
  · nadie deja la obra sin administrador por descuido: retirar al último
    admin da el mismo 409 que quitarle la administración, salvo Entity Admin.
"""
import importlib
import io
import os

import pytest
from flask import Flask


@pytest.fixture
def entorno(monkeypatch):
    monkeypatch.setenv('APP_SECRET', 'secreto-de-prueba')
    import routes.administracion as ra
    importlib.reload(ra)

    estado = {
        # fila de users para incorporar: (role, is_active)
        'persona': ('user', True),
        # membresía existente al retirar: (es_admin,) o None
        'miembro': (False,),
        'admins_de_obra': 2,
        'permisos_carpeta': 3,
        'autorizado': True,      # lo que responde guardia_administrativa
        'es_entity': False,
        'candidatos': [(5, 'Ana', 'a@o.pe', 'SINOHYDRO', 4, False)],
        'sql': [], 'log': [],
    }

    class Cursor:
        def __init__(self): self.ultimo = ('', None); self.rowcount = 0
        def execute(self, sql, params=None):
            self.ultimo = (' '.join(sql.split()), params)
            estado['sql'].append(self.ultimo[0].upper())
            if 'DELETE FROM FOLDER_PERMISSIONS' in self.ultimo[0].upper():
                self.rowcount = estado['permisos_carpeta']
        def fetchone(self):
            s = self.ultimo[0].upper()
            if 'SELECT ROLE, COALESCE(IS_ACTIVE' in s:
                return estado['persona']
            if 'RETURNING USER_ID' in s and s.startswith('INSERT'):
                return None if estado.get('ya_estaba') else (5,)
            if 'SELECT COALESCE(ES_ADMIN, FALSE) FROM PROJECT_USERS' in s:
                return estado['miembro']
            if 'SELECT COUNT(*) FROM PROJECT_USERS' in s:
                return (estado['admins_de_obra'],)
            return None
        def fetchall(self):
            if 'PENDIENTE' in self.ultimo[0].upper():
                return estado['candidatos']
            return []

    class Conn:
        def cursor(self): return Cursor()
        def commit(self): pass
        def __enter__(self): return self
        def __exit__(self, *a): return False

    monkeypatch.setattr(ra, 'get_db_connection', lambda: Conn())
    monkeypatch.setattr(ra, 'resolve_project_id', lambda p: p)
    monkeypatch.setattr(ra, 'guardia_de_obra', lambda obra, accion: None)
    monkeypatch.setattr(ra._adm, 'guardia_administrativa',
                        lambda cur, u, obra, accion='': None if estado['autorizado']
                        else (__import__('flask').jsonify({'error': 'no'}), 403))
    monkeypatch.setattr(ra._adm, 'es_entity_admin',
                        lambda u: estado['es_entity'])

    import db
    monkeypatch.setattr(db, 'log_activity',
                        lambda *a, **k: estado['log'].append(a[1]), raising=False)

    app = Flask(__name__)
    app.register_blueprint(ra.administracion_bp)

    @app.before_request
    def _sesion():
        from flask import g
        g.current_user = {'id': 1, 'role': 'user', 'email': 'quien@obra.pe'}

    return app.test_client(), estado


def _escrituras(estado):
    return [s for s in estado['sql'] if s.startswith(('INSERT', 'DELETE', 'UPDATE'))]


# ── La autoridad ─────────────────────────────────────────────────────────────

def test_sin_autoridad_de_obra_nada_se_toca(entorno):
    c, estado = entorno
    estado['autorizado'] = False
    assert c.get('/api/projects/OBRA/candidatos').status_code == 403
    assert c.post('/api/projects/OBRA/miembros', json={'user_id': 5}).status_code == 403
    assert c.delete('/api/projects/OBRA/miembros/5').status_code == 403
    assert _escrituras(estado) == []


# ── Candidatos ───────────────────────────────────────────────────────────────

def test_candidatos_es_lo_incorporable(entorno):
    c, estado = entorno
    r = c.get('/api/projects/OBRA/candidatos')
    assert r.status_code == 200
    d = r.get_json()['candidatos']
    assert d == [{'id': 5, 'name': 'Ana', 'email': 'a@o.pe',
                  'empresa': 'SINOHYDRO', 'company_id': 4, 'pendiente': False}]
    # El filtro vive en el SQL: activos, sin Entity Admins, sin miembros ya.
    consulta = next(s for s in estado['sql'] if 'PENDIENTE' in s)
    assert "ROLE <> 'ADMIN'" in consulta
    assert 'NOT IN (SELECT USER_ID FROM PROJECT_USERS' in consulta
    assert 'COALESCE(U.IS_ACTIVE, TRUE)' in consulta


# ── Incorporar ───────────────────────────────────────────────────────────────

def test_incorporar_crea_la_fila_y_asienta(entorno):
    c, estado = entorno
    r = c.post('/api/projects/OBRA/miembros', json={'user_id': 5})
    assert r.status_code == 200, r.get_json()
    assert r.get_json()['ya_estaba'] is False
    assert any(s.startswith('INSERT INTO PROJECT_USERS') for s in estado['sql'])
    assert estado['log'] == ['miembro_incorporado']


def test_incorporar_dos_veces_no_es_error(entorno):
    c, estado = entorno
    estado['ya_estaba'] = True
    r = c.post('/api/projects/OBRA/miembros', json={'user_id': 5})
    assert r.status_code == 200
    assert r.get_json()['ya_estaba'] is True
    assert estado['log'] == [], 'asento una incorporacion que no ocurrio'


def test_el_entity_admin_no_se_incorpora(entorno):
    c, estado = entorno
    estado['persona'] = ('admin', True)
    r = c.post('/api/projects/OBRA/miembros', json={'user_id': 2})
    assert r.status_code == 409
    assert r.get_json()['code'] == 'ENTITY_ADMIN_SIN_MEMBRESIA'
    assert not any(s.startswith('INSERT') for s in estado['sql'])


def test_una_desactivada_no_se_incorpora(entorno):
    c, estado = entorno
    estado['persona'] = ('user', False)
    r = c.post('/api/projects/OBRA/miembros', json={'user_id': 7})
    assert r.status_code == 409
    assert r.get_json()['code'] == 'CUENTA_RETIRADA'
    assert not any(s.startswith('INSERT') for s in estado['sql'])


def test_incorporar_a_nadie_es_404(entorno):
    c, estado = entorno
    estado['persona'] = None
    assert c.post('/api/projects/OBRA/miembros',
                  json={'user_id': 99}).status_code == 404


# ── Retirar ──────────────────────────────────────────────────────────────────

def test_retirar_borra_membresia_y_concesiones_no_historia(entorno):
    c, estado = entorno
    r = c.delete('/api/projects/OBRA/miembros/5')
    assert r.status_code == 200, r.get_json()
    assert r.get_json()['permisos_de_carpeta_retirados'] == 3
    borra = [s for s in estado['sql'] if s.startswith('DELETE')]
    assert any('PROJECT_USERS' in s for s in borra)
    assert any('FOLDER_PERMISSIONS' in s for s in borra)
    # Y NADA más se borra: ni activity_log, ni RFIs, ni revisiones.
    assert all('PROJECT_USERS' in s or 'FOLDER_PERMISSIONS' in s for s in borra)
    assert estado['log'] == ['miembro_retirado']


def test_retirar_a_un_no_miembro_es_404(entorno):
    c, estado = entorno
    estado['miembro'] = None
    assert c.delete('/api/projects/OBRA/miembros/9').status_code == 404


def test_el_ultimo_admin_de_obra_no_sale_por_descuido(entorno):
    c, estado = entorno
    estado['miembro'] = (True,)
    estado['admins_de_obra'] = 1
    r = c.delete('/api/projects/OBRA/miembros/5')
    assert r.status_code == 409
    assert r.get_json()['code'] == 'ULTIMO_ADMIN_DE_OBRA'
    assert not any(s.startswith('DELETE') for s in estado['sql'])


def test_el_entity_admin_si_puede_retirar_al_ultimo(entorno):
    # Puede, porque puede volver a nombrar: la obra no queda huerfana de
    # verdad. Es la misma excepcion que en retirar la administracion.
    c, estado = entorno
    estado['miembro'] = (True,)
    estado['admins_de_obra'] = 1
    estado['es_entity'] = True
    assert c.delete('/api/projects/OBRA/miembros/5').status_code == 200


# ── El contrato de la pantalla ───────────────────────────────────────────────
#
# Este defecto NO lo vio la suite: lo vio la interfaz real. La lista de
# candidatos se pedia UNA vez al abrir el panel, asi que tras retirar a
# alguien seguia diciendo «no hay nadie incorporable» -- justo de la persona
# que acababa de volverse incorporable. Queda fijado aqui.

PORTAL = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    'frontend-docs', 'src')


def _participantes():
    return io.open(os.path.join(PORTAL, 'components', 'ParticipantesModule.jsx'),
                   encoding='utf-8').read()


def test_retirar_invalida_la_lista_de_candidatos():
    texto = _participantes()
    retirar = texto[texto.index('async function retirarPersona'):]
    retirar = retirar[:retirar.index('async function ponerAdminDeObra')]
    assert 'setCandidatos(null)' in retirar, (
        'retirar a alguien no invalida la lista de candidatos: el panel '
        'seguira diciendo que esa persona no es incorporable')


def test_el_panel_repide_la_lista_cuando_se_invalida():
    texto = _participantes()
    # El efecto que trae candidatos tiene que DEPENDER de `candidatos` y
    # guardarse contra el bucle -- si no, ponerla a null no la repide.
    assert 'candidatos !== null' in texto, 'sin guardia: el efecto se repetiria en bucle'
    assert '[addAbierto, obra, candidatos]' in texto, (
        'el efecto no depende de `candidatos`: invalidarla no la repide')
