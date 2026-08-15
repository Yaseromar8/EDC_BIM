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
            '_assert_project_access',
            # La guardia del DOCUMENTO: resuelve la obra desde el nodo o desde
            # la ruta del objeto. Es la que necesitan los manejadores que
            # reciben un fichero y no una obra, como los de la IA.
            'guardia_del_documento')

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


# Los que quedan fuera de la cuenta, escritos UNO A UNO con su motivo. Una
# excepcion sin justificar es una guardia que falta con otro nombre.
EXCEPCIONES = {
    # Borra solo el ambito temporal del comparador, un valor fijo ('__cmp__')
    # que no es de ninguna obra. Residual: es un ambito COMPARTIDO, asi que un
    # usuario puede tirar la comparacion en curso de otro. Molesta, no filtra.
    'compare.py  POST  /api/compare/cleanup',
    # Uno se inscribe A SI MISMO con el codigo de invitacion. Exigir pertenecer
    # ya a la obra haria imposible entrar en ella: es la puerta de entrada, no
    # un agujero. Se protege con limite de intentos y codigo de `secrets`.
    'projects.py  POST  /api/projects/join',
    # Estos dos NO van por obra: van por external_id, y el limite esta metido en
    # el propio SQL contra project_users. Ponerles ademas una guardia por obra
    # seria pedirles un dato que el cuerpo de la peticion no trae.
    'server.py  PATCH  /api/inventory',
    'server.py  PATCH  /api/inventory/bulk',
}

# Cifra medida hoy, DESPUES de la segunda tanda de guardias. Solo puede bajar.
TOPE = 0


def test_todas_las_excepciones_siguen_existiendo():
    """Si una excepcion deja de aparecer es que la ruta cambio o se guardo. En
    cualquiera de los dos casos hay que revisar el motivo escrito, no dejar la
    lista criando polvo."""
    sin = set(_sin_guardia())
    huerfanas = EXCEPCIONES - sin
    assert not huerfanas, (
        'estas excepciones ya no hacen falta o la ruta cambio, revisalas: '
        + ', '.join(sorted(huerfanas)))


def test_la_defensa_en_profundidad_no_retrocede():
    sin = [x for x in _sin_guardia() if x not in EXCEPCIONES]
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
    """Con el tope en 0, cualquier manejador de escritura nuevo que toque datos
    de obra sin guardia rompe la prueba. Es lo que se queria desde el principio:
    que la separacion entre obras no dependa de una variable de entorno."""
    assert TOPE == 0, 'el tope ya no puede subir'
