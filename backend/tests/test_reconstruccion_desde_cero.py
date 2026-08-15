# -*- coding: utf-8 -*-
"""¿Se puede volver a levantar el ECD desde una base vacia? (hallazgo N2)

Es la pregunta que sostiene todas las demas. Un expediente del que no se puede
demostrar que se restaura no esta respaldado: esta guardado, que no es lo mismo.

LO QUE SE MIDIO EL 15-ago-2026
------------------------------
Reconstruyendo el esquema completo en un espacio vacio (pg_temp, que es lo mas
cerca de una base vacia a lo que se puede llegar sin permisos que la aplicacion
no debe tener):

    ANTES   33 de 37 rutinas · 13 tablas sin crear
    DESPUES 37 de 37 rutinas ·  4 tablas sin crear (y esas 4 por un permiso del
                                usuario de prueba, no por el codigo)

Nueve de las trece faltaban por UNA linea mal colocada: dentro de
`ensure_file_nodes_table`, la seccion «1.5» hacia `ALTER TABLE activity_log`
cien lineas ANTES de que esa misma funcion creara `activity_log`. Sobre una base
que ya tiene datos no se nota -- la tabla existe de antes -- pero sobre una
vacia el ALTER revienta, se lleva la transaccion entera, y la funcion no llega a
crear NADA: ni file_nodes, ni file_versions, ni el propio activity_log, ni
document_shares, ni upload_sessions, ni app_tokens, ni project_settings.

O sea: el arbol documental del ECD -- el ECD -- no se podia construir desde cero.

Estas pruebas no levantan una base: fijan el ORDEN, que es lo que se rompio. Son
estaticas a proposito, para que corran siempre y no solo cuando hay Postgres.
"""
import io
import os
import re

BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _fuente(nombre):
    return io.open(os.path.join(BACKEND, nombre), encoding='utf-8').read()


def _cuerpo_de(fuente, funcion):
    i = fuente.index('def %s(' % funcion)
    j = fuente.find('\ndef ', i + 1)
    return fuente[i:j if j > 0 else len(fuente)]


def test_la_cadena_de_auditoria_se_pone_DESPUES_de_crear_activity_log():
    """Esta es la linea que impedia reconstruir el ECD. Si alguien la vuelve a
    subir, esta prueba lo dice antes de que nadie intente una restauracion."""
    cuerpo = _cuerpo_de(_fuente('db.py'), 'ensure_file_nodes_table')
    crea = cuerpo.index('CREATE TABLE IF NOT EXISTS activity_log')
    altera = cuerpo.index('asegurar_columnas(cursor)')
    assert crea < altera, (
        'asegurar_columnas() hace ALTER TABLE activity_log y va ANTES de que '
        'esta funcion cree la tabla: sobre una base vacia aborta la transaccion '
        'y no se crea ni file_nodes ni file_versions ni activity_log')


def test_lo_que_toca_tablas_ajenas_va_al_final_del_bootstrap():
    """`ensure_project_identity_columns` añade columnas e indices a tablas que
    crean OTRAS rutinas. Estaba antes que `tracking_pins`, y su indice se perdia
    en silencio porque la rutina se traga el error."""
    boot = _fuente('bootstrap_esquema.py')
    orden = [m.group(1) for m in re.finditer(r"\(\s*'([a-z0-9_]+)'\s*,\s*\w+\)", boot)]
    assert 'project_identity' in orden and 'tracking_pins' in orden
    assert orden.index('project_identity') > orden.index('tracking_pins'), (
        'project_identity indexa tracking_pins: no puede correr antes de que '
        'exista')


def test_las_columnas_pendientes_siguen_siendo_las_ultimas():
    boot = _fuente('bootstrap_esquema.py')
    orden = [m.group(1) for m in re.finditer(r"\(\s*'([a-z0-9_]+)'\s*,\s*\w+\)", boot)]
    assert orden[-1] == 'columnas_pendientes'


def test_el_bootstrap_cubre_las_tablas_que_el_codigo_sabe_crear():
    """Una tabla que solo se crea «cuando alguien entra por su ruta» deja la
    base recien restaurada incompleta hasta que se usa -- y asi es como se
    descubre tarde, el dia que hace falta.

    Se compara contra `esquema_manifiesto.txt`, que NO esta escrito a mano: se
    genera midiendo una reconstruccion de verdad en un espacio vacio. Si alguien
    añade una familia de tablas y no la enchufa al arranque, esto lo dice aqui.
    """
    manifiesto = set()
    for linea in _fuente('esquema_manifiesto.txt').splitlines():
        linea = linea.strip()
        if linea and not linea.startswith('#'):
            manifiesto.add(linea.lower())
    assert len(manifiesto) > 80, 'el manifiesto parece vacio o truncado'

    declaradas = set()
    for raiz, _dirs, ficheros in os.walk(BACKEND):
        if any(x in raiz for x in ('venv', 'tests', '__pycache__')):
            continue
        for f in ficheros:
            if not f.endswith('.py'):
                continue
            src = io.open(os.path.join(raiz, f), encoding='utf-8', errors='ignore').read()
            for m in re.finditer(r'CREATE TABLE IF NOT EXISTS\s+([A-Za-z_][\w.]*)', src):
                declaradas.add(m.group(1).split('.')[-1].lower())

    # Las del esquema `ai_brain`: el bootstrap SI las crea, pero hacen falta
    # permisos de CREATE SCHEMA que el usuario de aplicacion no tiene ni debe
    # tener, asi que no aparecen al medir con el. Se declaran, no se ocultan.
    del_esquema_ai = {'feedback_buffer', 'global_knowledge', 'semantic_triples',
                      'ia_documentos_preparados'}

    huerfanas = sorted(declaradas - manifiesto - del_esquema_ai)
    assert not huerfanas, (
        'estas tablas no las construye el bootstrap, asi que una base '
        'restaurada se queda sin ellas hasta que alguien entre por su ruta: '
        + ', '.join(huerfanas))
