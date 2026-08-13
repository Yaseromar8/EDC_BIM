# -*- coding: utf-8 -*-
"""Tres fugas que no estaban en ninguna ruta de negocio.

Las tres se encontraron barriendo el proyecto contra el mandato de saneamiento,
y ninguna la habria visto una revision de las rutas de documentos:

  1. el enlace de restablecimiento de contrasena se escribia ENTERO en el log;
  2. dos rutas de auditoria declaradas rol:admin no bloqueaban a nadie, porque
     la politica corre en modo sombra;
  3. dos endpoints de diagnostico temporal servian datos de TODAS las obras sin
     comprobar nada, y uno de ellos ademas descargaba los bytes del almacen.
"""
import hashlib
import os

import pytest
from flask import Flask, g, jsonify

BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


# ── 1. El token de restablecimiento no puede acabar en el log ──────────────

def test_el_enlace_de_reset_nunca_se_escribe_en_el_log(monkeypatch, caplog):
    """En produccion falta RESEND_API_KEY, asi que este era el camino NORMAL:
    todos los enlaces emitidos pasaban por aqui y quedaban escritos enteros.
    Quien lea el log se queda con la cuenta, y ademas echa a la victima, porque
    restablecer revoca todas las sesiones."""
    import importlib
    monkeypatch.delenv('RESEND_API_KEY', raising=False)
    import mailer
    importlib.reload(mailer)

    enlace = 'https://ecd.example/reset?token=ESTE-TOKEN-ABRE-LA-CUENTA'
    with caplog.at_level('WARNING'):
        enviado, _detalle = mailer.enviar(
            destino='victima@obra.test', asunto='Restablece tu contraseña',
            titulo='t', cuerpo='c', enlace=enlace)
    texto = caplog.text
    assert enviado is False
    assert 'ESTE-TOKEN-ABRE-LA-CUENTA' not in texto
    assert enlace not in texto
    # Pero sigue habiendo rastro suficiente para saber que paso y correlacionarlo.
    assert 'victima@obra.test' in texto
    assert hashlib.sha256(enlace.encode()).hexdigest()[:8] in texto


def test_el_codigo_del_correo_no_vuelve_a_registrar_el_enlace():
    """Regresion sobre la linea concreta que lo hacia."""
    with open(os.path.join(BACKEND, 'mailer.py'), encoding='utf-8') as f:
        codigo = '\n'.join(l for l in f.read().splitlines() if not l.lstrip().startswith('#'))
    assert 'enlace={enlace}' not in codigo


# ── 2. Las rutas de auditoria exigen administrador de verdad ───────────────

@pytest.fixture
def app_auditoria(monkeypatch):
    monkeypatch.setenv('AUTH_POLICY_MODE', 'sombra')
    import importlib
    import routes.audit as ra
    importlib.reload(ra)
    monkeypatch.setattr(ra, 'capture_snapshot', lambda pid: {'x': 1}, raising=False)
    app = Flask(__name__)
    estado = {'usuario': {'id': 5, 'email': 'u@obra.test', 'role': 'user'}}

    @app.before_request
    def _sesion():
        g.current_user = estado['usuario']

    app.register_blueprint(ra.audit_bp)
    return app.test_client(), estado


def test_un_usuario_normal_no_saca_la_instantanea_de_una_obra(app_auditoria):
    """Medido antes del arreglo: 200 con la instantanea completa de una obra
    ajena, usando una sesion de rol 'user'."""
    c, _e = app_auditoria
    assert c.get('/api/audit/snapshot?project=obra_ajena').status_code == 403
    assert c.get('/api/audit/compare?project=obra_ajena').status_code == 403


def test_un_anonimo_tampoco(app_auditoria):
    c, e = app_auditoria
    e['usuario'] = None
    assert c.get('/api/audit/snapshot?project=x').status_code == 401


def test_el_administrador_si_puede(app_auditoria):
    """Lo que se comprueba es la GUARDIA, no las tripas de la instantanea: con
    un capture_snapshot de mentira la vista puede fallar mas adelante, pero lo
    que no puede es responder 401 ni 403."""
    c, e = app_auditoria
    e['usuario'] = {'id': 1, 'email': 'admin@obra.test', 'role': 'admin'}
    assert c.get('/api/audit/snapshot?project=x').status_code not in (401, 403)


# ── 3. Los endpoints de diagnostico no vuelven ─────────────────────────────

def test_no_hay_endpoints_de_diagnostico_sirviendo_datos_de_todas_las_obras():
    """`/api/diag/inventory-sample` devolvia inventario de CUALQUIER obra y
    `/api/debug/photos` leia tracking_pins de todas y bajaba los bytes del
    almacen. Ninguno comprobaba nada. Eran 'temporales' desde hacia meses."""
    for fichero in ('routes/diagnostics.py', 'routes/photo_diag.py'):
        assert not os.path.exists(os.path.join(BACKEND, fichero)), \
            f'{fichero} volvio: era un endpoint de diagnostico sin control de acceso'
    with open(os.path.join(BACKEND, 'server.py'), encoding='utf-8') as f:
        servidor = f.read()
    assert 'diag_bp' not in servidor
    assert 'photo_diag_bp' not in servidor


def test_ninguna_ruta_nueva_se_llama_debug_o_diag():
    """Un endpoint que se llama 'debug' o 'diag' casi nunca lleva control de
    acceso, porque nace para mirar rapido y se queda para siempre."""
    import re
    rutas = os.path.join(BACKEND, 'routes')
    sospechosas = []
    for nombre in sorted(os.listdir(rutas)):
        if not nombre.endswith('.py'):
            continue
        with open(os.path.join(rutas, nombre), encoding='utf-8', errors='ignore') as f:
            for n, linea in enumerate(f, 1):
                m = re.match(r"@\w+\.route\(\s*['\"]([^'\"]*(?:/debug/|/diag/)[^'\"]*)['\"]", linea.strip())
                if m:
                    sospechosas.append(f'{nombre}:{n} {m.group(1)}')
    assert not sospechosas, ('rutas de diagnostico vivas:\n  ' + '\n  '.join(sospechosas)
                             + '\nSi hace falta una, que exija admin y acote la obra.')
