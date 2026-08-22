# -*- coding: utf-8 -*-
"""Invariante permanente del perímetro (doc 61 §3.a): SESIÓN VÁLIDA ⇒ ACTIVADA.

La sesión histórica: una cuenta que entró por Google antes de la migración G7
y quedara PENDIENTE conservaba una sesión de hasta 7 días que
`validate_session` seguía aceptando — identidad operativamente pendiente con
acceso efectivo. El cierre no es un barrido una sola vez: es una condición en
la MISMA consulta que ya practica defensa en profundidad con
`COALESCE(u.is_active, TRUE)`.

Ningún emisor legítimo crea sesión para una no-activada (login exige hash ⇒
activada; el reclamo y la primera entrada Google fijan `activated_at` en el
mismo acto), así que la condición no rechaza nada legítimo.

La suite es DB-free: aquí se captura la consulta que `validate_session` envía
y se comprueban las condiciones — el filtro vive en el SQL, no en Python.
"""
import importlib


def _entorno(monkeypatch, fila):
    import auth_middleware as am
    importlib.reload(am)
    capturado = {}

    class Cursor:
        def execute(self, sql, params=None):
            capturado['sql'] = ' '.join(sql.split())
        def fetchone(self):
            return fila

    class Conn:
        def cursor(self): return Cursor()
        def __enter__(self): return self
        def __exit__(self, *a): return False

    import db
    monkeypatch.setattr(db, 'get_db_connection', lambda: Conn())
    am._session_cache.clear()
    return am, capturado


def test_la_consulta_exige_cuenta_activada(monkeypatch):
    am, capturado = _entorno(monkeypatch, None)
    am.validate_session('token-de-prueba')
    sql = capturado['sql'].upper()
    # Las tres defensas conviven en la MISMA consulta:
    assert 'S.IS_ACTIVE = TRUE' in sql            # la sesión no fue revocada
    assert 'COALESCE(U.IS_ACTIVE, TRUE)' in sql   # la cuenta no fue retirada
    assert 'U.ACTIVATED_AT IS NOT NULL' in sql    # y la cuenta está ACTIVADA


def test_sin_fila_no_hay_usuario(monkeypatch):
    # La sesión histórica de una PENDIENTE: el SQL no devuelve fila → None,
    # sin caer a ningún camino permisivo en Python.
    am, _ = _entorno(monkeypatch, None)
    assert am.validate_session('token-histórico') is None


def test_con_fila_la_sesion_vive_y_se_cachea(monkeypatch):
    am, _ = _entorno(monkeypatch, (7, 7, 'Persona', 'p@obra.pe', 'user'))
    u = am.validate_session('token-vivo')
    assert u and u['id'] == 7 and u['role'] == 'user'
    assert 'token-vivo' in am._session_cache
