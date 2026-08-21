# -*- coding: utf-8 -*-
"""La identidad del revisor, el plazo del paso, y cuando una revision se para.

QUE SE ARREGLO
--------------
Un paso era `{email, name}` y quien podia actuar se decidia comparando
`u.email == paso.email` **o** `u.name == paso.name`. Con dos personas llamadas
igual --que en una obra con varias empresas no es raro-- las dos eran candidatas
a firmar el mismo paso, y un cambio de nombre dejaba a la buena fuera.

Los pasos NUEVOS llevan `user_id`. Los HISTORICOS no se reescriben: siguen
resolviendose por correo y por nombre, exactamente como antes.
"""
import datetime

import pytest

import flujo_de_revision as flujo


# ── LA GUARDIANA: dos personas con el mismo nombre ─────────────────────────

def test_dos_usuarios_con_EL_MISMO_NOMBRE_no_pueden_confundirse():
    """El motivo de esta pieza, en una sola prueba.

    Con `user_id` en el paso, el nombre NO se mira. Si se mirara «por si
    acaso», volveria exactamente la ambiguedad que el user_id viene a quitar.
    """
    paso = {'user_id': 7, 'email': 'jperez@contratista.pe', 'name': 'Juan Perez'}

    el_correcto = {'id': 7, 'email': 'jperez@contratista.pe', 'name': 'Juan Perez'}
    el_tocayo = {'id': 9, 'email': 'jperez@supervision.pe', 'name': 'Juan Perez'}

    assert flujo.puede_actuar(el_correcto, paso) is True
    assert flujo.puede_actuar(el_tocayo, paso) is False, (
        'una persona distinta con el mismo nombre puede firmar este paso')


def test_con_user_id_ni_el_correo_abre_la_puerta():
    """Tampoco por correo: si hay identidad, manda la identidad y nada mas."""
    paso = {'user_id': 7, 'email': 'a@obra.pe', 'name': 'Ana'}
    otro_con_ese_correo = {'id': 12, 'email': 'a@obra.pe', 'name': 'Otra'}
    assert flujo.puede_actuar(otro_con_ese_correo, paso) is False


def test_un_cambio_de_nombre_no_deja_fuera_al_revisor():
    """Antes, si la persona cambiaba de nombre y el paso solo tenia nombre, se
    quedaba sin poder firmar lo suyo."""
    paso = {'user_id': 7, 'email': 'a@obra.pe', 'name': 'Ana Perez'}
    la_misma_ya_casada = {'id': 7, 'email': 'a@obra.pe', 'name': 'Ana Perez de Lopez'}
    assert flujo.puede_actuar(la_misma_ya_casada, paso) is True


# ── Compatibilidad LEGACY: no se reescribe nada ───────────────────────────

def test_un_paso_legacy_con_correo_sigue_funcionando():
    paso = {'email': 'a@obra.pe', 'name': 'Ana'}          # sin user_id
    assert flujo.puede_actuar({'id': 3, 'email': 'a@obra.pe', 'name': 'X'}, paso) is True
    assert flujo.puede_actuar({'id': 4, 'email': 'b@obra.pe', 'name': 'Ana'}, paso) is False, (
        'en un paso legacy CON correo, el correo manda sobre el nombre')


def test_un_paso_legacy_SOLO_CON_NOMBRE_sigue_funcionando():
    """LEGACY, y queda dicho: es el unico caso en que el nombre decide.

    Se conserva a proposito. Quitarlo dejaria revisiones antiguas sin nadie que
    pueda actuar, y convertir esos nombres en usuarios de hoy seria adivinar
    sobre el expediente.
    """
    paso = {'name': 'Ana Perez'}
    assert flujo.puede_actuar({'id': 3, 'email': 'x@y.z', 'name': 'Ana Perez'}, paso) is True
    assert flujo.puede_actuar({'id': 4, 'email': 'x@y.z', 'name': 'Otro'}, paso) is False


def test_es_legacy_distingue_los_pasos_nuevos_de_los_viejos():
    assert flujo.es_legacy({'email': 'a@b.c', 'name': 'Ana'}) is True
    assert flujo.es_legacy({'user_id': 7, 'email': 'a@b.c'}) is False


def test_un_paso_sin_nada_no_deja_actuar_a_nadie():
    assert flujo.puede_actuar({'id': 1, 'email': 'a@b.c', 'name': 'Ana'}, {}) is False


# ── El plazo ──────────────────────────────────────────────────────────────

def test_el_plazo_se_cuenta_desde_que_EMPIEZA_el_turno():
    """Y no desde que se crea la revision: al crearla no se sabe cuando le
    tocara al paso 3."""
    arranque = datetime.datetime(2026, 3, 10, 9, 0, tzinfo=datetime.timezone.utc)
    assert flujo.vencimiento({'dias': 5}, arranque).date() == datetime.date(2026, 3, 15)


def test_sin_dias_no_hay_plazo():
    """Las revisiones historicas no tienen `dias`: siguen sin vencimiento, y su
    encargo se abre sin urgencia. Exactamente como hoy."""
    for paso in ({}, {'dias': None}, {'dias': ''}, {'dias': 0}, {'dias': -3},
                 {'dias': 'pronto'}):
        assert flujo.vencimiento(paso) is None


def test_la_etiqueta_del_paso_nunca_decide_nada():
    """Es para la pantalla. Si alguna vez decidiera, volveria la ambiguedad."""
    assert flujo.etiqueta_del_paso({'user_id': 7, 'name': 'Ana'}) == 'Ana'
    assert flujo.etiqueta_del_paso({'user_id': 7, 'email': 'a@b.c'}) == 'a@b.c'
    assert flujo.etiqueta_del_paso({'user_id': 7}) == 'usuario 7'


# ── El estado del flujo ───────────────────────────────────────────────────

class _Cur:
    """Cursor minimo: dice si el usuario existe y si es miembro."""

    def __init__(self, existe=True, es_miembro=True):
        self.existe, self.es_miembro = existe, es_miembro
        self._ultima = ''

    def execute(self, sql, params=None):
        self._ultima = sql

    def fetchone(self):
        if 'project_users' in self._ultima:
            return (1,) if self.es_miembro else None
        if 'FROM users' in self._ultima:
            return (7,) if self.existe else None
        return None


def test_una_revision_cerrada_no_esta_bloqueada():
    rev = {'status': 'approved', 'steps': [{'user_id': 7}], 'current_step': 0}
    assert flujo.estado_del_flujo(_Cur(), rev)[0] == 'CERRADA'


def test_una_revision_viva_con_su_revisor_dentro_esta_ACTIVA():
    rev = {'status': 'pending', 'steps': [{'user_id': 7}], 'current_step': 0,
           '_project_id': 'obra_a'}
    assert flujo.estado_del_flujo(_Cur(), rev)[0] == 'ACTIVA'


def test_si_el_revisor_SALE_DE_LA_OBRA_la_revision_queda_BLOQUEADA():
    """El defecto que motiva esta pieza.

    `abrir()` se niega a darle encargo --un encargo no da acceso--, esa persona
    tampoco puede actuar, y hasta ahora NADA lo decia: la revision se quedaba
    parada en silencio.
    """
    rev = {'status': 'pending', 'steps': [{'user_id': 7, 'name': 'Ana'}],
           'current_step': 0, '_project_id': 'obra_a'}
    estado, motivo = flujo.estado_del_flujo(_Cur(es_miembro=False), rev)
    assert estado == 'BLOQUEADA'
    assert 'Ana' in motivo and 'obra' in motivo, motivo


def test_si_la_cuenta_del_revisor_se_desactiva_tambien_queda_BLOQUEADA():
    rev = {'status': 'pending', 'steps': [{'user_id': 7}], 'current_step': 0,
           '_project_id': 'obra_a'}
    estado, motivo = flujo.estado_del_flujo(_Cur(existe=False), rev)
    assert estado == 'BLOQUEADA'
    assert 'activa' in motivo


def test_nadie_reescribe_los_pasos_de_una_revision():
    """No hay reasignacion automatica, y se comprueba donde importa: NADA en el
    producto modifica `steps` despues de crear la revision.

    Si algo lo hiciera, el sistema podria cambiar quien revisa sin que nadie lo
    decidiera -- y podria acabar poniendo de revisor a quien creo la revision,
    rompiendo la regla de independencia.

    Reasignar es una decision de obra. Cuando haga falta, sera una operacion
    explicita sobre el Review, con su entrada en el historial.
    """
    import io as _io
    import os as _os
    raiz = _os.path.dirname(_os.path.dirname(_os.path.abspath(__file__)))
    culpables = []
    for carpeta, _dirs, ficheros in _os.walk(raiz):
        if any(x in carpeta for x in ('venv', 'tests', '__pycache__', 'herramientas')):
            continue
        for f in ficheros:
            if not f.endswith('.py'):
                continue
            ruta = _os.path.join(carpeta, f)
            src = _io.open(ruta, encoding='utf-8', errors='ignore').read()
            for linea in src.splitlines():
                seco = linea.upper().replace(' ', '')
                if 'UPDATEDOC_REVIEWSSET' in seco and 'STEPS=' in seco:
                    culpables.append('%s: %s' % (f, linea.strip()[:80]))
    assert not culpables, (
        'algo reescribe los pasos de una revision ya creada: '
        + ' | '.join(culpables))
