# -*- coding: utf-8 -*-
"""Resolver de alcance -> obra canonica. La traduccion es un DATO, no una regla.

QUE CAMBIO EL 20-ago-2026
-------------------------
El resolutor tenia tres heuristicas, y dos de ellas daban respuestas distintas
segun el estado de la base:

  by_name   Coincidencia por NOMBRE de obra. `projects` no tiene UNIQUE sobre
            `name`, y en la base real hay CUATRO obras llamadas
            'HOSPITAL_MATUCANA': el alias 'proyectos/HOSPITAL_MATUCANA'
            resolvia a una de las cuatro segun el orden en que la base
            devolviera las filas.

  default   «Si hay UNA sola obra activa, esa». Mientras hubiera una sola obra,
            CUALQUIER alcance desconocido acababa en ella y todo parecia
            funcionar. El dia que entrara la segunda, medio sistema cambiaba de
            comportamiento a la vez.

Las dos se han quitado. La traduccion la da ahora `project_ref`: una fila por
alias, decidida una vez y auditable. Lo que no esta en la tabla no se adivina.

Estas pruebas fijan justamente eso -- que lo retirado no vuelva. DB-free:
inyectan el mapa.
"""
import time

import db


def _inject(by_ref=None, by_id=None, by_urn=None, by_dataset=None, prefijables=None):
    """Inyecta el mapa de resolucion en el cache para evitar la BD."""
    by_id = by_id or {}
    db._project_resolver_cache['map'] = {
        'by_ref': by_ref or {},
        'by_id': by_id,
        'by_urn': by_urn or {},
        'by_dataset': by_dataset or {},
        # Los alias que pueden actuar de prefijo en '<obra>_<FRENTE>': los ids
        # de obra, mas los alias de tipo PROJECT de `project_ref`.
        'prefijables': prefijables if prefijables is not None else dict(by_id),
    }
    db._project_resolver_cache['ts'] = time.time()


def test_resuelve_por_prefijo():
    """'<obra>_<FRENTE>'. Se busca el prefijo MAS LARGO porque los ids reales
    ('b.proj_<slug>_<sufijo>') ya contienen guiones bajos."""
    _inject(by_id={'1': '1'})
    assert db.resolve_project_id('1_CANAL') == '1'
    assert db.resolve_project_id('1_DRENAJE') == '1'
    assert db.resolve_project_id('1_INFRAWORKS') == '1'


def test_el_prefijo_mas_largo_gana():
    """Si dos obras son prefijo del mismo alcance, manda la mas especifica."""
    _inject(by_id={'b.proj_x': 'b.proj_x', 'b.proj_x_2024': 'b.proj_x_2024'})
    assert db.resolve_project_id('b.proj_x_2024_DRENAJE') == 'b.proj_x_2024'


def test_la_tabla_de_referencias_manda_sobre_todo():
    """`project_ref` es la autoridad: si dice algo, no se consulta nada mas."""
    _inject(by_ref={'proyectos/PQT8_TALARA': '1'}, by_id={'1': '1'})
    assert db.resolve_project_id('proyectos/PQT8_TALARA') == '1'


def test_global_YA_NO_resuelve_por_defecto():
    """Era el atajo mas peligroso: con una sola obra activa, TODO lo desconocido
    acababa en ella y el sistema parecia saber de quien era cada dato.

    Hay mas de 4.000 filas guardadas bajo 'global' en la base real. Esa deuda no
    se salda adivinando: se salda atribuyendolas a su obra en `project_ref`, que
    es una decision y queda escrita.
    """
    _inject(by_id={'1': '1'})
    assert db.resolve_project_id('global') is None
    assert db.resolve_project_id(None) is None


def test_global_resuelve_SOLO_si_alguien_lo_decidio():
    """Y entonces resuelve porque hay una fila, no porque sea la unica obra."""
    _inject(by_ref={'global': '1'}, by_id={'1': '1'})
    assert db.resolve_project_id('global') == '1'


def test_el_nombre_de_la_obra_ya_no_resuelve_por_si_solo():
    """Cuatro obras se llaman 'HOSPITAL_MATUCANA' en la base real. Un alias
    derivado del nombre no pertenece a ninguna en particular, asi que resolverlo
    era elegir una al azar y presentarlo como un hecho."""
    _inject(by_id={'b.proj_hospital_matucana_60633': 'b.proj_hospital_matucana_60633'})
    assert db.resolve_project_id('HOSPITAL_MATUCANA') is None
    assert db.resolve_project_id('proyectos/HOSPITAL_MATUCANA') is None


def test_un_nombre_resuelve_si_esta_anotado():
    """Los nombres que SI son de una sola obra se anotan en la siembra, uno a
    uno. Entonces resuelven -- porque hay una fila que lo dice."""
    _inject(by_ref={'PQT8_TALARA': '1', 'proyectos/PQT8_TALARA': '1'}, by_id={'1': '1'})
    assert db.resolve_project_id('PQT8_TALARA') == '1'
    assert db.resolve_project_id('proyectos/PQT8_TALARA') == '1'


def test_el_uuid_de_un_dataset_4d_resuelve():
    """Once tablas del 4D LOB no tienen ninguna columna de obra: solo
    `dataset_id`. Sin esta traduccion, con ENFORCE encendido el modulo entero
    contestaba 403 PROJECT_UNRESOLVED."""
    _inject(by_id={'1': '1'}, by_dataset={'653fea31-fad8-43ab-9ad2-7b597153e574': '1'})
    assert db.resolve_project_id('653fea31-fad8-43ab-9ad2-7b597153e574') == '1'


def test_desconocido_no_resuelve():
    _inject(by_id={'1': '1'})
    assert db.resolve_project_id('ZZZ_DESCONOCIDO') is None
    assert db.resolve_project_id('basura_inventada_xyz') is None
