"""ISO 19650-5: el triaje de la obra manda, y sin clasificar no es sinonimo de publico.

LO QUE ESTOS TESTS FIJAN
------------------------
La parte 5 no empieza por controles, empieza por el triaje. De ahi salen las dos
reglas que no se pueden relajar sin darse cuenta:

  - Una obra SIN triaje no comparte nada hacia fuera. Es incomodo a proposito: si
    "sin evaluar" dejara pasar, la parte 5 no serviria de nada, que es justo la
    situacion de la que se viene.
  - Un documento sin nivel propio HEREDA el de su carpeta, y si nadie lo declara
    en toda la rama, cae en el nivel de uso interno, no en abierto.
"""
import pytest

import sensibilidad as s


class CursorFalso:
    """Cursor de mentira: responde por patron de SQL y apunta lo que le piden."""

    def __init__(self, triaje=None, nivel=None, catalogo=None):
        self.triaje = triaje          # tupla como la devuelve la BD, o None
        self.nivel = nivel            # nivel que "encuentra" la consulta recursiva
        self.catalogo = catalogo      # filas del catalogo, o None -> el por defecto
        self._ultima = None
        self.sql = []

    def execute(self, sql, params=None):
        self.sql.append(sql)
        if 'CREATE TABLE' in sql or 'ALTER TABLE' in sql or 'INSERT INTO' in sql:
            self._ultima = []
        elif 'FROM triaje_seguridad' in sql:
            self._ultima = [self.triaje] if self.triaje else []
        elif 'sensibilidad_catalogo' in sql:
            self._ultima = self.catalogo if self.catalogo is not None else [
                (c, e, o, p) for c, e, o, p in s.NIVELES_POR_DEFECTO]
        elif 'RECURSIVE arriba' in sql:
            self._ultima = [(self.nivel,)] if self.nivel else []
        else:
            self._ultima = []

    def fetchone(self):
        return self._ultima[0] if self._ultima else None

    def fetchall(self):
        return self._ultima or []


def _triaje(requiere=True, revisar=None):
    from datetime import datetime, timezone
    return (requiere, 'justificado', 'Ana', datetime.now(timezone.utc), revisar)


# ── El triaje manda ────────────────────────────────────────────────────────

def test_obra_sin_triaje_no_comparte_nada():
    """Sin evaluar NO puede significar 'adelante'."""
    cur = CursorFalso(triaje=None)
    permitido, _nivel, motivo = s.puede_salir_del_ecd(cur, 'nodo', 'obra')
    assert permitido is False
    assert 'triaje' in motivo.lower()


def test_triaje_caducado_no_comparte():
    from datetime import date, timedelta
    cur = CursorFalso(triaje=_triaje(revisar=date.today() - timedelta(days=1)))
    permitido, _n, motivo = s.puede_salir_del_ecd(cur, 'nodo', 'obra')
    assert permitido is False
    assert 'caducado' in motivo.lower()


def test_obra_evaluada_sin_informacion_delicada_no_estorba():
    """Si el triaje dice que no hace falta, no se penaliza al equipo."""
    cur = CursorFalso(triaje=_triaje(requiere=False))
    permitido, _n, _m = s.puede_salir_del_ecd(cur, 'nodo', 'obra')
    assert permitido is True


# ── La clasificacion del documento ─────────────────────────────────────────

def test_sin_clasificar_no_es_publico():
    cur = CursorFalso(triaje=_triaje(), nivel=None)
    permitido, nivel, _m = s.puede_salir_del_ecd(cur, 'nodo', 'obra')
    assert nivel == s.NIVEL_SIN_EVALUAR
    assert permitido is False


def test_nivel_abierto_si_sale():
    cur = CursorFalso(triaje=_triaje(), nivel='N0')
    permitido, nivel, _m = s.puede_salir_del_ecd(cur, 'nodo', 'obra')
    assert (permitido, nivel) == (True, 'N0')


def test_nivel_critico_no_sale():
    cur = CursorFalso(triaje=_triaje(), nivel='N3')
    permitido, nivel, motivo = s.puede_salir_del_ecd(cur, 'nodo', 'obra')
    assert permitido is False and nivel == 'N3'
    assert 'crítico' in motivo.lower()


def test_nivel_que_no_esta_en_el_catalogo_se_deniega():
    """Un codigo que nadie reconoce no vale como autorizacion."""
    cur = CursorFalso(triaje=_triaje(), nivel='INVENTADO')
    permitido, _n, motivo = s.puede_salir_del_ecd(cur, 'nodo', 'obra')
    assert permitido is False
    assert 'catálogo' in motivo.lower()


def test_nivel_efectivo_cae_a_uso_interno_sin_nodo():
    assert s.nivel_efectivo(CursorFalso(), None, 'obra') == s.NIVEL_SIN_EVALUAR


# ── El triaje se justifica siempre ─────────────────────────────────────────

def test_no_se_puede_decidir_que_no_hace_falta_sin_motivo():
    """El 'no hace falta' es la decision que mas se cuestiona: va justificada."""
    with pytest.raises(ValueError):
        s.guardar_triaje(CursorFalso(), 'obra', requiere_enfoque=False, justificacion='  ')


def test_el_orden_de_los_niveles_no_se_toca_sin_querer():
    """Se comparan con >=; reordenarlos cambia en silencio quien ve que."""
    ordenes = [o for _c, _e, o, _p in s.NIVELES_POR_DEFECTO]
    assert ordenes == sorted(ordenes)
    assert [c for c, _e, _o, _p in s.NIVELES_POR_DEFECTO] == ['N0', 'N1', 'N2', 'N3']
    # Solo el nivel mas bajo puede salir del ECD.
    assert [p for _c, _e, _o, p in s.NIVELES_POR_DEFECTO] == [True, False, False, False]
    assert s.NIVEL_SIN_EVALUAR != 'N0'


# ── Que el control ESTE PUESTO donde la informacion sale ──────────────────
#
# `puede_salir_del_ecd` existia y NADIE la llamaba: solo estas pruebas. Un
# control que no se invoca no es un control, es documentacion. Es la tercera vez
# que aparece este patron en la plataforma -- el @requiere_rol que no bloqueaba
# a nadie, el modo estricto de nomenclatura -- asi que aqui se fija por escrito.

def _fuente(*partes):
    import io as _io
    import os
    return _io.open(os.path.join(os.path.dirname(os.path.dirname(
        os.path.abspath(__file__))), *partes), encoding='utf-8').read()


def test_el_enlace_publico_pregunta_si_el_documento_puede_salir():
    """Un enlace publico saca el fichero del alcance de cualquier permiso: quien
    lo tenga, lo abre. Tener acceso y permiso de carpeta no es lo mismo que
    poder sacarlo."""
    fuente = _fuente('routes', 'documents.py')
    cuerpo = fuente[fuente.index('def share_document'):]
    cuerpo = cuerpo[:cuerpo.index('\ndef ', 1)]
    assert 'puede_salir_del_ecd' in cuerpo
    assert cuerpo.index('puede_salir_del_ecd') < cuerpo.index('INSERT INTO document_shares'), \
        'se emite el enlace antes de preguntar si el documento puede salir'


def test_el_transmittal_tambien_pregunta():
    """Pregunta, pero POR SU CANAL. Usar la funcion estricta aqui bloqueaba las
    entregas de la obra entera en cuanto el triaje decia «si», porque ningun
    documento tiene nivel declarado todavia."""
    fuente = _fuente('routes', 'transmittals.py')
    assert 'puede_salir_por_canal' in fuente
    assert "canal='transmittal'" in fuente


def test_pero_el_transmittal_no_se_para_por_falta_de_triaje():
    """Un enlace publico sin triaje se deniega: es distribucion incontrolada y
    la parte 5 existe para que no salga lo que nadie ha mirado.

    Un transmittal es el canal FORMAL -- destinatarios con nombre, numero de
    serie, acuse de recibo y registro. Aplicarle la misma regla pararia las
    entregas de la obra entera el dia del despliegue, por no haber hecho un
    triaje que nadie ha pedido todavia. La clasificacion manda cuando EXISTE."""
    fuente = _fuente('routes', 'transmittals.py')
    cuerpo = fuente[fuente.index('def _items_emisibles'):]
    cuerpo = cuerpo[:cuerpo.index('\ndef ', 1)]
    assert 'triaje_de_obra' in cuerpo
    assert "triaje.get('requiere_enfoque')" in cuerpo


def test_un_fallo_leyendo_el_catalogo_no_tumba_una_entrega():
    """Tumbar el camino formal de entrega por un fallo de lectura seria peor que
    el riesgo que evita."""
    fuente = _fuente('routes', 'transmittals.py')
    cuerpo = fuente[fuente.index('def _items_emisibles'):]
    cuerpo = cuerpo[:cuerpo.index('\ndef ', 1)]
    assert 'except Exception' in cuerpo


# ── Canal: enlace publico vs transmittal ──────────────────────────────────
#
# EL CASO REAL, medido el 17-ago-2026. `nivel_efectivo` devuelve N1 tanto si
# alguien clasifico el documento como «uso interno» como si NADIE lo ha mirado
# nunca. La columna `file_nodes.sensibilidad` es nueva y NINGUNA pantalla la
# escribe, asi que los ~3.000 documentos de la plataforma resuelven a N1, y N1
# no puede salir.
#
# Consecuencia: en cuanto una obra contesta «si» en el triaje -- en la pantalla
# que se construyo justamente para desbloquear la regresion anterior -- se le
# bloquean de golpe TODOS los enlaces Y TODOS los transmittals, sin haber
# clasificado nada y sin sitio donde hacerlo. La pantalla ademas promete lo
# contrario: «contestar las dos preguntas lo desbloquea».
#
# El arreglo no es aflojar el control: es dejar de tratar igual dos canales que
# no son el mismo riesgo, que es lo que el propio comentario de transmittals.py
# ya defendia antes de aplicar la regla estricta a los dos.

class CursorDeCanal:
    """Triaje que exige enfoque + un nodo con (o sin) nivel declarado."""

    def __init__(self, nivel_declarado=None):
        self.nivel = nivel_declarado
        self._r = []

    def execute(self, sql, params=None):
        s = ' '.join(sql.split()).upper()
        if 'FROM TRIAJE_SEGURIDAD' in s:
            self._r = [(True, 'obra con informacion delicada', 'ana', None, None)]
        elif 'FROM SENSIBILIDAD_CATALOGO' in s:
            self._r = [(c, e, o, p) for c, e, o, p in s_mod.NIVELES_POR_DEFECTO]
        elif 'RECURSIVE' in s or 'SENSIBILIDAD FROM ARRIBA' in s:
            self._r = [(self.nivel,)] if self.nivel else []
        else:
            self._r = []

    def fetchone(self):
        return self._r[0] if self._r else None

    def fetchall(self):
        return self._r


import sensibilidad as s_mod  # noqa: E402


def test_sin_clasificar_NO_para_un_transmittal():
    """Es el caso de los ~3.000 documentos de hoy. Bloquear la entrega formal de
    la obra entera por algo que nadie ha mirado, y sin pantalla para mirarlo, no
    protege nada: para la obra."""
    cur = CursorDeCanal(nivel_declarado=None)
    permitido, _n, _m = s_mod.puede_salir_por_canal(cur, 'nodo', 'obra', canal='transmittal')
    assert permitido is True


def test_sin_clasificar_SI_para_un_enlace_publico():
    """Un enlace es distribucion incontrolada: quien tenga la URL abre, y ningun
    permiso del ECD alcanza a un fichero que ya salio. Aqui «nadie lo ha mirado»
    tiene que bloquear."""
    cur = CursorDeCanal(nivel_declarado=None)
    permitido, _n, motivo = s_mod.puede_salir_por_canal(cur, 'nodo', 'obra',
                                                        canal='enlace_publico')
    assert permitido is False
    assert 'Clasifícalo' in motivo, 'la negativa tiene que decir la salida'


def test_un_nivel_DECLARADO_como_interno_si_para_el_transmittal():
    """La clasificacion manda cuando EXISTE: si alguien miro el documento y dijo
    «uso interno», mandarlo fuera por el canal formal tambien esta mal."""
    cur = CursorDeCanal(nivel_declarado='N1')
    permitido, nivel, _m = s_mod.puede_salir_por_canal(cur, 'nodo', 'obra',
                                                        canal='transmittal')
    assert permitido is False and nivel == 'N1'


def test_un_nivel_declarado_abierto_pasa_por_los_dos_canales():
    cur = CursorDeCanal(nivel_declarado='N0')
    for canal in ('transmittal', 'enlace_publico'):
        assert s_mod.puede_salir_por_canal(cur, 'nodo', 'obra', canal=canal)[0] is True


def test_el_canal_por_defecto_es_el_mas_estricto():
    """`puede_salir_del_ecd` conserva su nombre y su criterio: quien lo llame sin
    pensar se lleva la regla dura, no la blanda."""
    cur = CursorDeCanal(nivel_declarado=None)
    assert s_mod.puede_salir_del_ecd(cur, 'nodo', 'obra')[0] is False


def test_hay_una_sola_copia_de_la_decision():
    """Dos copias del criterio es como se llega a tener una viva y otra muerta."""
    import io
    import os
    ruta = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                        'sensibilidad.py')
    fuente = io.open(ruta, encoding='utf-8').read()
    cuerpo = fuente[fuente.index('def puede_salir_del_ecd'):]
    assert 'puede_salir_por_canal' in cuerpo
    assert 'triaje_de_obra' not in cuerpo, 'esta reimplementando la decision'
