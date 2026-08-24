# -*- coding: utf-8 -*-
"""CAPA 9 · El contrato de la pantalla de permisos, sobre el fuente del portal.

Dos exigencias del propietario que son de PANTALLA, no de motor, y que por
tanto solo pueden romperse en el JSX — así que se fijan contra el JSX:

  punto 7   la regla se entiende visualmente: carpeta más cercana gana, y al
            mismo nivel PERSONA > EMPRESA > FUNCIÓN;
  punto 8   un permiso por FUNCIÓN advierte que alcanza también a futuros
            miembros que adopten esa función.

Mismo estilo que `test_contrato_rol_y_funcion`: tests de texto deliberadamente
simples. Si alguien borra la advertencia «alcanza a quien llegue después»
porque «ocupaba mucho», esto revienta y obliga a la conversación.
"""
import io
import os

PORTAL = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    'frontend-docs', 'src', 'components')


def _leer(nombre):
    return io.open(os.path.join(PORTAL, nombre), encoding='utf-8').read()


# ── Punto 8: el alcance futuro de una regla de FUNCIÓN ──────────────────────

def test_conceder_por_funcion_advierte_el_alcance_futuro():
    modal = _leer('AddPermissionModal.jsx')
    assert 'CONTRACTUAL_FUNCTION' in modal
    assert 'Alcanza también a quien llegue después' in modal, (
        'la advertencia de alcance futuro desapareció del modal de concesión')
    # Y está condicionada al sujeto FUNCIÓN: es SU peligro, no un aviso genérico.
    i = modal.index('Alcanza también a quien llegue después')
    contexto = modal[max(0, i - 600):i]
    assert "tipo === 'CONTRACTUAL_FUNCTION'" in contexto


def test_el_modal_ofrece_los_tres_sujetos_sin_texto_libre():
    modal = _leer('AddPermissionModal.jsx')
    for etiqueta in ("'USER'", "'COMPANY'", "'CONTRACTUAL_FUNCTION'"):
        assert etiqueta in modal
    # El cuadro de texto libre por correo se retiró: se elige de lo que existe.
    assert 'type="email"' not in modal, (
        'volvió el cuadro de correo libre: permite dirigir reglas a gente '
        'que no participa en la obra')


# ── Punto 7: la regla, visible donde se administra ──────────────────────────

def test_el_panel_explica_la_regla_completa():
    panel = _leer('FolderPermissionsPanel.jsx')
    assert 'Gana la carpeta más cercana' in panel
    assert 'las de más arriba ya no cuentan' in panel
    # La precedencia, como cadena visual Persona > Empresa > Función:
    assert panel.index('ChipSujeto tipo="USER"') < panel.index('ChipSujeto tipo="COMPANY"') \
        < panel.index('ChipSujeto tipo="CONTRACTUAL_FUNCTION"')
    # Y la aclaración que evita la confusión más cara:
    assert 'no</b> desplaza' in panel or 'no puede desplazar' in panel, (
        'falta aclarar que la precedencia no cruza carpetas')
    # «Restringido» explicado como denegación, no como ausencia:
    assert 'denegación' in panel


def test_el_panel_tiene_el_inspector_de_permiso_efectivo():
    panel = _leer('FolderPermissionsPanel.jsx')
    assert '/api/docs/permiso-efectivo' in panel, 'el inspector desapareció'
    assert 'carpeta_ganadora' in panel, 'ya no señala la carpeta ganadora'
    assert 'sujeto_ganador_label' in panel, 'ya no señala el sujeto ganador'


def test_la_tabla_dice_reglas_no_usuarios():
    """Una regla de función puede alcanzar a media obra: contar «usuarios»
    sería mentir. Se cuentan reglas."""
    panel = _leer('FolderPermissionsPanel.jsx')
    assert 'regla en esta carpeta' in panel
    assert 'usuario con acceso' not in panel


# ── Vista previa de adjuntos (RFI · Red Line) ────────────────────────────────
#
# Encontrado en producción el 22-ago-2026, minutos antes de una demo: NINGÚN
# PDF adjunto a un RFI o a un Red Line se previsualizaba. La causa no estaba
# en el visor de PDF sino en el NOMBRE: se guardaba «documento.pdf · versión
# actual», y la detección de tipo mira `name.endsWith('.pdf')`. Con el sufijo
# pegado, todo adjunto caía en «vista previa no disponible para este tipo de
# archivo» — incluidos los PDF, que son casi todos.

def _issue():
    return io.open(os.path.join(PORTAL, 'IssueModule.jsx'), encoding='utf-8').read()


def test_el_nombre_del_adjunto_no_lleva_la_etiqueta_de_version():
    s = _issue()
    assert "name: (adj.name || '') + etiqueta" not in s, (
        'la etiqueta de versión volvió a pegarse al nombre: rompe la '
        'detección de tipo y ningún PDF se previsualiza')
    assert "name: (adj.name || ''), etiqueta" in s, (
        'el nombre y la etiqueta deben viajar en campos separados')


def test_la_deteccion_de_tipo_mira_la_extension_real():
    s = _issue()
    assert "lowerName.endsWith('.pdf')" in s
    # Y la etiqueta se sigue viendo, en la cabecera, sin contaminar el nombre.
    assert 'previewFile.etiqueta' in s


# ── En permisos, «vacío» y «roto» no pueden verse igual ─────────────────────
#
# Las dos pantallas de control de acceso convertían un fallo de carga en una
# lista vacía. El administrador lee «no hay a quien conceder», da por bueno un
# reparto que nadie comprobó — o concede de más «por si acaso», que es
# exactamente como se pierde el control de un expediente.

def test_el_selector_del_inspector_distingue_fallo_de_vacio():
    panel = _leer('FolderPermissionsPanel.jsx')
    assert 'falloLista' in panel
    assert 'La lista está incompleta' in panel
    assert '.catch(() => setPersonas([]))' not in panel, (
        'volvió el catch que convierte un fallo en «no hay nadie»')


def test_el_modal_de_conceder_distingue_fallo_de_vacio():
    modal = _leer('AddPermissionModal.jsx')
    assert 'errorCatalogo' in modal
    assert 'La lista está incompleta' in modal
    # El texto vive en JSX multilinea: se normaliza el espacio antes de buscar.
    plano = ' '.join(modal.split())
    assert 'no concedas dando por hecho que no hay nadie' in plano
