# -*- coding: utf-8 -*-
"""Puebla `project_ref` con los alias que YA existen en los datos.

QUE HACE
--------
Recorre todas las columnas de alcance de la base (`model_urn`, `scope_urn`), mas
`lob_datasets.project_id`, recoge los valores distintos, y para cada uno propone
una obra usando las MISMAS reglas que hasta hoy resolvian en caliente:

    - el alcance ES el id de una obra
    - el alcance ES el nombre de una obra, con o sin 'proyectos/' delante
    - el alcance ES el model_urn registrado de una obra
    - el alcance empieza por '<id de obra>_'  (prefijo mas largo)

La diferencia con antes no es la regla: es CUANDO se aplica. Antes se aplicaba
en cada peticion, asi que el sistema decidia a que obra pertenecia un dato en el
momento de mirarlo, y podia decidir distinto manana. Ahora se aplica UNA VEZ,
queda escrita una fila, y a partir de ahi la respuesta es un dato.

LO QUE NO ESCRIBE
-----------------
1. Nombres duplicados. Hay CUATRO obras llamadas 'HOSPITAL_MATUCANA' y
   `projects` no tiene UNIQUE sobre `name`. Un alias derivado de ese nombre no
   pertenece a ninguna de las cuatro en particular, asi que no se inventa: se
   informa.
2. 'global'. Es el cajon sin obra, con miles de filas dentro. A que obra
   pertenecen es una decision de quien conoce la obra, no del programa. Se
   siembra solo si se pasa --global=<id de obra>, y entonces queda escrito quien
   lo decidio.
3. Cualquier alias que la regla no sepa traducir.

Nada de esto modifica una sola fila de datos. Solo INSERTA en `project_ref`.

    python herramientas/sembrar_referencias.py              (ensayo, no escribe)
    python herramientas/sembrar_referencias.py --aplicar
    python herramientas/sembrar_referencias.py --aplicar --global=1
"""
import argparse
import collections
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

import pathlib
from dotenv import load_dotenv
load_dotenv(pathlib.Path(__file__).resolve().parent.parent.parent / '.env')
load_dotenv()

from db import init_db_pool, get_db_connection
import referencias_de_obra as ref


def _columnas_de_alcance(cur):
    cur.execute("""SELECT c.relname, a.attname FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
         JOIN pg_attribute a ON a.attrelid = c.oid
        WHERE n.nspname = 'public' AND c.relkind = 'r'
          AND a.attnum > 0 AND NOT a.attisdropped
          AND a.attname IN ('model_urn', 'scope_urn')
        ORDER BY 1, 2""")
    return cur.fetchall()


def alias_observados(cur):
    """{alias: {tabla.columna: filas}} de todo lo que hay guardado."""
    vistos = collections.defaultdict(dict)
    for tabla, col in _columnas_de_alcance(cur):
        try:
            cur.execute('SELECT %s::text, count(*) FROM %s GROUP BY 1' % (col, tabla))
            for valor, n in cur.fetchall():
                if valor:
                    vistos[valor]['%s.%s' % (tabla, col)] = n
        except Exception:
            cur.connection.rollback()
    # `lob_datasets.project_id` es otro alcance mas: guarda el NOMBRE de la obra.
    try:
        cur.execute('SELECT project_id, count(*) FROM lob_datasets GROUP BY 1')
        for valor, n in cur.fetchall():
            if valor:
                vistos[valor]['lob_datasets.project_id'] = n
    except Exception:
        cur.connection.rollback()
    return vistos


def catalogo_de_obras(cur):
    """Los mapas de siembra, con los nombres ambiguos apartados."""
    cur.execute('SELECT id, name, model_urn FROM projects')
    filas = cur.fetchall()
    por_id = {f[0]: f[0] for f in filas}
    por_urn = {f[2]: f[0] for f in filas if f[2]}

    nombres = collections.defaultdict(set)
    for pid, nombre, _urn in filas:
        if nombre:
            nombres[nombre].add(pid)
    por_nombre = {n: list(p)[0] for n, p in nombres.items() if len(p) == 1}
    ambiguos = {n: sorted(p) for n, p in nombres.items() if len(p) > 1}
    return filas, por_id, por_nombre, por_urn, ambiguos


def proponer(alias, por_id, por_nombre, por_urn):
    """(obra, tipo, motivo) o (None, None, motivo de por que no se sabe)."""
    if alias in por_id:
        return alias, 'PROJECT', 'es el id de la obra'
    if alias in por_urn:
        tipo = 'EXTERNAL' if alias.startswith('b.') and '-' in alias else 'PROJECT'
        return por_urn[alias], tipo, 'es el model_urn registrado de la obra'
    if alias in por_nombre:
        return por_nombre[alias], 'LEGACY_NAME', 'es el nombre de la obra'
    cola = alias.split('/')[-1]
    if cola in por_nombre:
        return por_nombre[cola], 'LEGACY_PATH', 'es «proyectos/<nombre de la obra>»'
    candidatos = [pid for pid in por_id if alias.startswith(pid + '_')]
    if candidatos:
        obra = max(candidatos, key=len)
        return obra, 'FRONT', 'empieza por «%s_»' % obra
    return None, None, 'ninguna regla lo traduce'


# Las tablas cuyo `model_urn` define DONDE vive el expediente de una obra. Si
# lo nuevo se guardara con otro alcance, el arbol documental quedaria partido en
# dos, asi que el alcance de escritura se mide sobre estas y no se elige.
_TABLAS_DEL_EXPEDIENTE = ('file_nodes', 'doc_sets', 'doc_rfis', 'doc_redlines',
                          'transmittals', 'doc_reviews', 'plan_entregas', 'doc_partidas')


def medir_escritura(cur):
    """Que alcance usan HOY los documentos de cada obra. [(obra, alias, filas)]"""
    conteo = collections.defaultdict(collections.Counter)
    for tabla in _TABLAS_DEL_EXPEDIENTE:
        try:
            cur.execute('SELECT model_urn, count(*) FROM %s '
                        ' WHERE model_urn IS NOT NULL GROUP BY 1' % tabla)
            for alias, n in cur.fetchall():
                cur.execute('SELECT project_id FROM project_ref '
                            ' WHERE account_id = %s AND alias = %s',
                            (ref.CUENTA_DE_ESTA_INSTANCIA, alias))
                fila = cur.fetchone()
                if fila:
                    conteo[fila[0]][alias] += n
        except Exception:
            cur.connection.rollback()
    salida = []
    for obra, aliases in conteo.items():
        alias, n = aliases.most_common(1)[0]
        salida.append((obra, alias, n, len(aliases)))
    return salida


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--aplicar', action='store_true', help='escribe de verdad')
    ap.add_argument('--global', dest='globalmente', default=None,
                    help='obra a la que atribuir el alcance «global» (decision explicita)')
    a = ap.parse_args()

    init_db_pool()
    ref.ensure_tabla_referencias()

    escritos, ya_estaban, sin_resolver, choques = [], [], [], []
    with get_db_connection() as conn:
        cur = conn.cursor()
        filas, por_id, por_nombre, por_urn, ambiguos = catalogo_de_obras(cur)
        vistos = alias_observados(cur)

        # 1. Cada obra registra sus propios alias.
        for pid, nombre, urn in filas:
            nombre_seguro = nombre if nombre and nombre not in ambiguos else None
            for alias in ref.registrar_obra(cur, pid, nombre=nombre_seguro,
                                            model_urn=urn, origen='siembra: catalogo de obras'):
                escritos.append((alias, pid, 'catalogo de obras'))

        # 2. Los alias que aparecen en los datos.
        for alias in sorted(vistos):
            filas_totales = sum(vistos[alias].values())
            if alias == 'global':
                if a.globalmente:
                    if ref.anotar(cur, alias, a.globalmente, 'GLOBAL',
                                  'siembra: decision explicita --global'):
                        escritos.append((alias, a.globalmente, 'decision explicita'))
                else:
                    sin_resolver.append((alias, filas_totales,
                                         'cajon sin obra: exige --global=<obra>'))
                continue

            obra, tipo, motivo = proponer(alias, por_id, por_nombre, por_urn)
            if not obra:
                cola = alias.split('/')[-1]
                if cola in ambiguos or alias in ambiguos:
                    motivo = 'nombre compartido por %d obras: %s' % (
                        len(ambiguos.get(cola) or ambiguos.get(alias)),
                        ', '.join(ambiguos.get(cola) or ambiguos.get(alias)))
                    choques.append((alias, filas_totales, motivo))
                else:
                    sin_resolver.append((alias, filas_totales, motivo))
                continue
            # `anotar` no pisa lo que ya hay: si devuelve False, el alias ya
            # estaba atribuido y esa atribucion manda sobre la propuesta.
            if ref.anotar(cur, alias, obra, tipo, 'siembra: ' + motivo):
                escritos.append((alias, obra, motivo))
            else:
                ya_estaban.append((alias, obra))

        # 3. El alcance de escritura: se MIDE sobre el expediente que ya existe.
        escrituras = medir_escritura(cur)
        for obra, alias, _n, _cuantos in escrituras:
            ref.marcar_escritura(cur, obra, alias)

        if a.aplicar:
            conn.commit()
        else:
            conn.rollback()

    print()
    print('=' * 78)
    print('SIEMBRA DE `project_ref`   %s' % ('APLICADA' if a.aplicar else 'ENSAYO (no se escribio nada)'))
    print('=' * 78)
    print()
    print('ESCRITOS (%d):' % len(escritos))
    for alias, obra, motivo in escritos:
        print('  %-48s -> %-34s %s' % (alias[:48], obra[:34], motivo))
    if ya_estaban:
        print()
        print('YA ESTABAN (%d): %s' % (len(ya_estaban), ', '.join(x[0] for x in ya_estaban[:6])))
    if escrituras:
        print()
        print('ALCANCE DE ESCRITURA (medido sobre el expediente que ya existe):')
        for obra, alias, n, cuantos in sorted(escrituras):
            aviso = '  <- la obra usa %d alcances distintos' % cuantos if cuantos > 1 else ''
            print('  %-34s escribe en  %-30s (%d filas)%s' % (obra[:34], alias[:30], n, aviso))
        print()
        print('  El servidor le dice este alcance al cliente; el navegador ya no lo')
        print('  deriva del nombre visible de la obra. Renombrarla deja de mover nada.')
        print('  Las obras NUEVAS escriben con su `projects.id`, que es inmutable.')
    if ambiguos:
        print()
        print('OBRAS QUE COMPARTEN NOMBRE (%d) -- no se les registra alias por nombre:' % len(ambiguos))
        for nombre, obras in sorted(ambiguos.items()):
            print('  «%s» lo usan %d obras: %s' % (nombre, len(obras), ', '.join(obras)))
        print()
        print('  `projects` no tiene UNIQUE sobre `name`, asi que esto esta permitido.')
        print('  Consecuencia: los alias «<nombre>» y «proyectos/<nombre>» no pertenecen')
        print('  a ninguna de ellas en particular y NO se siembran. Si alguna de esas')
        print('  obras llega a tener datos guardados bajo un alias por nombre, habra que')
        print('  renombrarla o anotar el alias a mano.')
    if choques:
        print()
        print('NO SE ESCRIBEN -- NOMBRE COMPARTIDO POR VARIAS OBRAS (%d):' % len(choques))
        for alias, n, motivo in choques:
            print('  %-40s %7d filas   %s' % (alias[:40], n, motivo))
    if sin_resolver:
        print()
        print('NO SE ESCRIBEN -- SIN TRADUCCION (%d):' % len(sin_resolver))
        for alias, n, motivo in sin_resolver:
            print('  %-40s %7d filas   %s' % (alias[:40], n, motivo))
        print()
        print('  Estos alcances NO resolveran. Con ENFORCE_PROJECT_AUTHZ=true las')
        print('  peticiones dirigidas a ellos reciben 403 PROJECT_UNRESOLVED, que es')
        print('  lo correcto: el sistema no sabe de que obra son. Se resuelven')
        print('  decidiendo su obra y anotandola, no relajando la comprobacion.')
    print()
    if not a.aplicar:
        print('Ensayo. Para escribir:  python herramientas/sembrar_referencias.py --aplicar')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
