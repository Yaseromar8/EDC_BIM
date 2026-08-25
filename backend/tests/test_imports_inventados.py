# -*- coding: utf-8 -*-
"""NINGUNA RUTA IMPORTA UN MODULO O UN SIMBOLO QUE NO EXISTE.

ESTE DEFECTO HA MORDIDO DOS VECES, y las dos de la misma forma:

    25-ago, GAP 02   `from gcs_manager import descargar_bytes`
                     -> el simbolo no existia. `except ImportError` lo convirtio
                        en un 501 educado y la lectura de cajetin quedo MUERTA.

    25-ago, GAP 05   `from storage import get_blob_data`
                     -> el MODULO no existia. El `except` lo convirtio en un 500
                        educado y la lectura del encabezado quedo MUERTA.

La primera la cazo una prueba escrita para GAP 02 -- pero solo miraba
`routes/planos.py`, y ademas se saltaba los modulos inexistentes con un
`continue` etiquetado «de terceros o de un paquete». Justo el hueco por el que
entro la segunda.

    UN `except` QUE DEVUELVE UNA RESPUESTA AMABLE ES EL SITIO PERFECTO PARA QUE
    UN ERROR DE ESCRITURA VIVA PARA SIEMPRE.

Ni la suite lo nota --no carga esos modulos-- ni el usuario --el mensaje parece
una limitacion del despliegue--. Por eso se comprueba ESTATICAMENTE, sobre TODOS
los manejadores, y sin importar nada.

COMO SE DISTINGUE «no existe» DE «es de terceros»
-------------------------------------------------
Con `importlib.util.find_spec`. `flask` y `psycopg2` tienen spec aunque no haya
un `.py` en el backend; `storage` no lo tiene en ningun sitio. Un modulo sin
spec y sin fichero propio es un nombre inventado.
"""
import ast
import importlib.util
import io
import os

BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RUTAS = os.path.join(BACKEND, 'routes')


def _importaciones(camino):
    """(modulo, [nombres reales]) de cada `from X import a, b as c`.

    CON AST Y NO CON UNA EXPRESION REGULAR. La primera version usaba regex y
    tenia dos agujeros: `import x as y` la hacia comparar el ALIAS contra lo
    definido --15 falsos positivos de golpe-- y un import entre parentesis y
    partido en varias lineas no casaba en absoluto, asi que se saltaba en
    silencio. Un detector con huecos es peor que no tenerlo: da por vigilado lo
    que no lo esta.
    """
    arbol = ast.parse(io.open(camino, encoding='utf-8', errors='ignore').read())
    for n in ast.walk(arbol):
        if isinstance(n, ast.ImportFrom) and n.module and not n.level:
            yield n.module, [a.name for a in n.names if a.name != '*']


def _ficheros():
    for n in sorted(os.listdir(RUTAS)):
        if n.endswith('.py'):
            yield 'routes/' + n, os.path.join(RUTAS, n)
    yield 'server.py', os.path.join(BACKEND, 'server.py')


def _simbolos_de(camino):
    """Lo que un modulo del proyecto define en su nivel superior."""
    arbol = ast.parse(io.open(camino, encoding='utf-8').read())
    definidos = {n.name for n in ast.walk(arbol)
                 if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef))}
    definidos |= {t.id for n in ast.walk(arbol) if isinstance(n, ast.Assign)
                  for t in n.targets if isinstance(t, ast.Name)}
    # Lo que el modulo REEXPORTA tambien cuenta: `planos_de_obra` expone
    # `siguiente_revision` importandolo del motor comun.
    for n in ast.walk(arbol):
        if isinstance(n, ast.ImportFrom):
            definidos |= {a.asname or a.name for a in n.names}
        elif isinstance(n, ast.Import):
            definidos |= {(a.asname or a.name).split('.')[0] for a in n.names}
    return definidos


def _existe_fuera(modulo):
    """¿Es un modulo instalado (flask, psycopg2…) y no un nombre inventado?"""
    raiz = modulo.split('.')[0]
    try:
        return importlib.util.find_spec(raiz) is not None
    except (ImportError, ValueError, ModuleNotFoundError):
        return False


def test_ninguna_ruta_importa_modulos_ni_simbolos_INVENTADOS():
    fantasmas = []
    for relativo, camino in _ficheros():
        for modulo, simbolos in _importaciones(camino):
            propio = os.path.join(BACKEND, modulo.replace('.', os.sep) + '.py')
            paquete = os.path.join(BACKEND, modulo.replace('.', os.sep), '__init__.py')

            if not os.path.exists(propio) and not os.path.exists(paquete):
                # No es del proyecto. Solo vale si existe DE VERDAD fuera.
                if not _existe_fuera(modulo):
                    fantasmas.append('%s: el modulo «%s» no existe en ningun sitio'
                                     % (relativo, modulo))
                continue

            definidos = _simbolos_de(propio if os.path.exists(propio) else paquete)
            for s in simbolos:
                if s not in definidos:
                    fantasmas.append('%s: «%s» no esta en %s'
                                     % (relativo, s, modulo))

    assert not fantasmas, (
        'hay imports que apuntan a la nada; un `except` los convertiria en un '
        'error educado y la funcionalidad quedaria muerta sin que nadie lo '
        'notara:\n  ' + '\n  '.join(fantasmas))


def test_la_prueba_MISMA_detecta_un_modulo_inventado():
    """Sin esto, la prueba de arriba podria estar pasando por no mirar nada.

    Se comprueba con los dos nombres reales que fallaron.
    """
    assert not _existe_fuera('storage'), 'el modulo que mato el OCR de GAP 05'
    assert _existe_fuera('flask'), 'y flask SI tiene que pasar'
    assert _existe_fuera('psycopg2')

    definidos = _simbolos_de(os.path.join(BACKEND, 'gcs_manager.py'))
    assert 'get_blob_data' in definidos, 'el nombre bueno'
    assert 'descargar_bytes' not in definidos, 'el nombre que mato el cajetin'
