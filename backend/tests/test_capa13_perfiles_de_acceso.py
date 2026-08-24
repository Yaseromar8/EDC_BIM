# -*- coding: utf-8 -*-
"""CAPA 13 · PERMISSION PROFILES — configuración reutilizable, no autoridad.

LA PROPIEDAD QUE DEFINE LA CAPA, y que estas pruebas fijan:

    UN PERFIL SE APLICA; NO GOBIERNA.

Al aplicarlo escribe filas normales de `member_tool_access` (capa 08) y ahí
termina su papel. Después manda esa tabla. De ahí salen las tres cosas que
se comprueban abajo, todas queridas:

  · editar un perfil NO cambia a quien ya lo llevaba (sus accesos son suyos,
    no la proyección viva de una plantilla que alguien editó ayer);
  · borrarlo tampoco (se pierde la procedencia, no la configuración);
  · y no existen dos sitios que respondan a la misma pregunta — si el perfil
    fuera autoridad viva, cada consulta tendría que resolver un conflicto
    entre plantilla y excepción, y eso se resuelve distinto en cada pantalla.

Y la separación congelada:

    CONTRACTUAL FUNCTION ≠ PERMISSION PROFILE

La función dice quién es la empresa y en qué calidad viene — un hecho del
contrato. El perfil es una preferencia repetible del administrador. Dos
personas de la misma función pueden llevar perfiles distintos.
"""
import ast
import io
import os

import pytest


RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


# ── Normalización: un perfil no promete lo que no existe ────────────────────

def test_solo_se_guardan_herramientas_del_catalogo():
    """Un perfil que nombra una herramienta inexistente es una promesa
    incumplible. Se descarta AL GUARDAR — descubrirlo al aplicar dejaría a
    alguien mal configurado y sin aviso."""
    import perfiles_de_acceso as pa
    limpio = pa.normalizar({'rfi': True, 'redlines': False,
                            'teletransporte': True, 'docs': True})
    assert limpio == {'rfi': True, 'redlines': False}


def test_los_valores_quedan_booleanos():
    import perfiles_de_acceso as pa
    assert pa.normalizar({'rfi': 1, 'reviews': 0}) == {'rfi': True, 'reviews': False}


def test_un_perfil_vacio_es_valido():
    """Un perfil sin herramientas no configura nada: es legítimo (por ejemplo
    mientras se está montando) y no revienta al aplicarse."""
    import perfiles_de_acceso as pa
    assert pa.normalizar(None) == {} and pa.normalizar({}) == {}


# ── APLICAR escribe la capa 08 y nada más ───────────────────────────────────

class _Cur:
    def __init__(self):
        self.sql = []
        self._ultimo = ''
    def execute(self, sql, params=None):
        self._ultimo = ' '.join(sql.split()).upper()
        self.sql.append((self._ultimo, params))
    def fetchone(self):
        if 'RETURNING PERMITIDO' in self._ultimo:
            return (self.sql[-1][1][3],)     # el `permitido` que se escribió
        return None
    def fetchall(self):
        return []


def test_aplicar_escribe_la_capa_08():
    import perfiles_de_acceso as pa
    cur = _Cur()
    perfil = {'id': 3, 'nombre': 'Supervisión documental',
              'herramientas': {'rfi': True, 'redlines': False}}
    escrito = pa.aplicar(cur, perfil, 'b.proj_x', 7, 'admin@o.pe')
    assert escrito == {'rfi': True, 'redlines': False}
    tablas = ' '.join(s for s, _ in cur.sql)
    assert 'MEMBER_TOOL_ACCESS' in tablas, 'debe escribir la capa 08'
    # …y la PROCEDENCIA en la fila de membresía.
    assert 'PERFIL_APLICADO' in tablas


def test_aplicar_no_toca_permisos_de_carpeta_ni_membresia():
    """El perfil configura acceso a herramientas. No concede documentos
    (capa 09), no mete a nadie en la obra (capa 03) y no nombra
    administradores (capa 07)."""
    import perfiles_de_acceso as pa
    cur = _Cur()
    pa.aplicar(cur, {'id': 1, 'nombre': 'X', 'herramientas': {'rfi': True}},
               'b.proj_x', 7, 'admin@o.pe')
    escrituras = ' '.join(s for s, _ in cur.sql
                          if s.startswith(('INSERT', 'DELETE', 'UPDATE')))
    assert 'FOLDER_PERMISSIONS' not in escrituras
    assert 'ES_ADMIN' not in escrituras
    # El único UPDATE sobre project_users es la procedencia, no la membresía.
    for s, _ in cur.sql:
        if s.startswith('UPDATE PROJECT_USERS'):
            assert 'PERFIL_APLICADO' in s


# ── EL CONTRATO: el perfil NO es autoridad viva ─────────────────────────────

def test_el_motor_de_permisos_no_consulta_perfiles():
    """LA PRUEBA QUE IMPIDE LA SEGUNDA FUENTE DE VERDAD. Si alguien hiciera
    que el resolutor de acceso mirara el perfil, existirían dos respuestas
    para la misma pregunta y habría que arbitrar entre plantilla y excepción
    — y eso acaba arbitrándose distinto en cada pantalla.

    Se mira el ÁRBOL SINTÁCTICO: las menciones en la documentación explican
    justamente que NO se consulta."""
    for modulo in ('acceso_a_herramientas.py', 'permiso_documental.py',
                   'auth_middleware.py'):
        arbol = ast.parse(io.open(os.path.join(RAIZ, modulo), encoding='utf-8').read())
        importados = set()
        for nodo in ast.walk(arbol):
            if isinstance(nodo, ast.Import):
                importados.update(a.name for a in nodo.names)
            elif isinstance(nodo, ast.ImportFrom):
                importados.add(nodo.module or '')
        assert 'perfiles_de_acceso' not in importados, (
            '%s consulta los perfiles: el perfil dejaría de ser configuración '
            'y pasaría a competir con la autoridad real' % modulo)
        nombres = {n.id for n in ast.walk(arbol) if isinstance(n, ast.Name)}
        nombres |= {n.attr for n in ast.walk(arbol) if isinstance(n, ast.Attribute)}
        assert 'perfil_aplicado' not in nombres, (
            '%s decide algo leyendo la procedencia del perfil' % modulo)


def test_la_procedencia_se_declara_como_tal_en_el_esquema():
    """`perfil_aplicado` tiene que estar documentado como procedencia y su FK
    ser ON DELETE SET NULL: borrar un perfil no puede cambiarle el acceso a
    nadie."""
    sql = io.open(os.path.join(RAIZ, 'sql', '10_capa13_permission_profiles.sql'),
                  encoding='utf-8').read()
    assert 'ON DELETE SET NULL' in sql
    plano = ' '.join(sql.split())
    assert 'PROCEDENCIA, no autoridad' in plano


def test_la_capa_13_no_es_la_capa_05():
    """CONTRACTUAL FUNCTION ≠ PERMISSION PROFILE: el módulo de perfiles no
    lee ni escribe la función contractual de nadie."""
    arbol = ast.parse(io.open(os.path.join(RAIZ, 'perfiles_de_acceso.py'),
                              encoding='utf-8').read())
    codigo = [n for n in ast.walk(arbol) if isinstance(n, ast.Constant)
              and isinstance(n.value, str)]
    sql_del_modulo = ' '.join(c.value.upper() for c in codigo
                              if 'SELECT' in c.value.upper()
                              or 'UPDATE' in c.value.upper()
                              or 'INSERT' in c.value.upper())
    assert 'PROJECT_COMPANIES' not in sql_del_modulo
    assert 'FUNCION' not in sql_del_modulo
