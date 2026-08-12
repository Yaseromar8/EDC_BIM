"""El listado de una carpeta no puede repartir descargas a quien no puede descargar.

EL FALLO QUE ESTOS TESTS FIJAN
------------------------------
GET /api/docs/list firmaba una URL de GCS para CADA fichero listado, sin mirar
permisos:

    for f in contents['files']:
        if f.get('gcs_urn'):
            f['mediaLink'] = generate_signed_url(f['gcs_urn'])

Ese enlace SALE de la plataforma: funciona sin sesion, se reenvia por WhatsApp y
no aparece en el registro de descargas. Medido contra la base real el 12-ago-2026:
11.238 enlaces entregados a los 4 usuarios no administradores, ninguno de los
cuales tenia derecho de descarga en ninguna carpeta (el rol 'user' cae a 'none'
en GLOBAL_ROLE_TO_PERMISSION).

Quien solo puede mirar no pierde nada: sigue viendo y previsualizando por
/api/docs/proxy, que si comprueba el permiso y si deja rastro.
"""
import routes.documents as doc


def test_sin_sesion_no_hay_enlace():
    assert doc._puede_descargar(None, 'nodo', 'obra') is False


def test_admin_siempre_puede():
    assert doc._puede_descargar({'id': 1, 'role': 'admin'}, 'nodo', 'obra') is True


def test_solo_ver_no_recibe_enlace(monkeypatch):
    """viewer = puede mirar, NO puede llevarse los bytes."""
    monkeypatch.setattr('folder_permissions.get_effective_permission',
                        lambda *a, **k: 'viewer')
    assert doc._puede_descargar({'id': 7, 'role': 'user'}, 'nodo', 'obra') is False


def test_permiso_de_descarga_si_recibe_enlace(monkeypatch):
    monkeypatch.setattr('folder_permissions.get_effective_permission',
                        lambda *a, **k: 'view_download')
    assert doc._puede_descargar({'id': 7, 'role': 'user'}, 'nodo', 'obra') is True


def test_edit_y_admin_de_carpeta_tambien(monkeypatch):
    for nivel in ('view_markup', 'edit', 'admin'):
        monkeypatch.setattr('folder_permissions.get_effective_permission',
                            lambda *a, **k: nivel)
        assert doc._puede_descargar({'id': 7, 'role': 'user'}, 'nodo', 'obra') is True, nivel


def test_sin_permiso_ninguno_no_recibe_enlace(monkeypatch):
    monkeypatch.setattr('folder_permissions.get_effective_permission',
                        lambda *a, **k: 'none')
    assert doc._puede_descargar({'id': 7, 'role': 'user'}, 'nodo', 'obra') is False


def test_si_la_comprobacion_revienta_se_deniega(monkeypatch):
    """Fail-closed: un fallo al comprobar no puede regalar una descarga."""
    def explota(*a, **k):
        raise RuntimeError('base caida')
    monkeypatch.setattr('folder_permissions.get_effective_permission', explota)
    assert doc._puede_descargar({'id': 7, 'role': 'user'}, 'nodo', 'obra') is False
