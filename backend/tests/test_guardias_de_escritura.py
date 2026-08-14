# -*- coding: utf-8 -*-
"""Cuantos manejadores que escriben datos de obra siguen sin guardia propia.

BASELINE 0 · C8. La separacion entre obras colgaba ENTERA de una variable de
entorno: con ENFORCE_PROJECT_AUTHZ apagado -- que es como esta produccion -- se
demostro con peticiones reales que un usuario ajeno falsificaba puntos de
control geodesico, vaciaba el presupuesto de otra obra y borraba sus frentes.

El control central es necesario pero no suficiente: un control que depende de
una variable no es un control. Esto mide la defensa en profundidad y fija la
cifra para que SOLO PUEDA BAJAR.

Medido el 13-ago-2026: 55 manejadores de escritura tocaban datos de obra sin
guardia propia. De esos, 15 son de autenticacion y no tocan obra (login,
registro, empresas, cargos, segundo factor).
"""
import io
import os
import re

BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RUTAS = os.path.join(BACKEND, 'routes')

GUARDIAS = ('verify_project_access', 'check_folder_permission', '_hay_acceso', '_solo_admin',
            '_require_admin', '_check_project_access', '_guardia_del_conjunto',
            '_guardia_del_nodo', '_acceso_al_recurso', 'acceso_por_obra_id',
            'get_effective_permission', 'requiere_rol', '_obra_del_conjunto', 'obra_del_blob',
            'guardia_de_recurso', 'guardia_de_obra', '_filtro_de_obra', '_is_admin',
            # LOB 4D tiene la suya propia desde antes, y funciona: comprueba
            # project_users y levanta PermissionError, que los manejadores
            # convierten en 403. No reconocerla inflaba la cuenta de deuda con
            # nueve endpoints que SI estaban protegidos.
            '_assert_project_access')

CLAVES = ('model_urn', 'project_id', 'projectId', 'scope_urn', 'base_project_id',
          'project', 'urn')

# Ficheros que no manejan datos de obra por diseno.
FUERA = {'auth.py'}


def _sin_guardia():
    salida = []
    ficheros = [(n, os.path.join(RUTAS, n)) for n in sorted(os.listdir(RUTAS))
                if n.endswith('.py') and n not in FUERA]
    ficheros.append(('server.py', os.path.join(BACKEND, 'server.py')))
    for nombre, ruta in ficheros:
        lineas = io.open(ruta, encoding='utf-8', errors='ignore').read().split('\n')
        i = 0
        while i < len(lineas):
            m = re.match(r"@\w+\.route\(\s*['\"]([^'\"]+)['\"].*?(POST|PUT|PATCH|DELETE)",
                         lineas[i].strip())
            if not m:
                i += 1
                continue
            url = m.group(1)
            j = i + 1
            while j < len(lineas) and not re.match(r'^def ', lineas[j]):
                j += 1
            k, cuerpo = j + 1, ''
            while k < len(lineas) and not re.match(r'^(@|def )', lineas[k]):
                cuerpo += lineas[k] + '\n'
                k += 1
            escribe = re.search(r'INSERT INTO|UPDATE |DELETE FROM', cuerpo)
            clave = any(c in cuerpo for c in CLAVES)
            if escribe and clave and not any(g in cuerpo for g in GUARDIAS):
                salida.append(f'{nombre}  {m.group(2)}  {url}')
            i = k
    return salida


# Cifra medida hoy, DESPUES de la primera tanda de guardias. Solo puede bajar.
TOPE = 11


def test_la_defensa_en_profundidad_no_retrocede():
    sin = _sin_guardia()
    assert len(sin) <= TOPE, (
        f'suben a {len(sin)} los manejadores de escritura sin guardia propia '
        f'(el tope era {TOPE}):\n  ' + '\n  '.join(sin))


def test_los_manejadores_que_se_demostraron_explotables_estan_cerrados():
    """Estos cuatro se explotaron con peticiones reales el 13-ago-2026. No
    pueden volver a la lista pase lo que pase."""
    sin = '\n'.join(_sin_guardia())
    for ruta in ('/api/geo/control-points', '/api/frentes',
                 '/all/<path:model_urn>', '/api/project-pins'):
        assert ruta not in sin, f'{ruta} volvio a quedarse sin guardia propia'


def test_el_tope_esta_ajustado_a_la_realidad():
    """Si el numero real baja mucho por debajo del tope, hay que bajar el tope:
    un tope holgado deja de proteger."""
    sin = _sin_guardia()
    assert len(sin) >= TOPE - 6, (
        f'quedan {len(sin)} y el tope es {TOPE}: bajalo para que siga sirviendo')
