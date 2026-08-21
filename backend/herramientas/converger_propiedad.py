# -*- coding: utf-8 -*-
"""Convergencia administrativa UNICA de una instancia heredada.

Este programa no es el migrador ordinario. Su unica tarea es sacar del proceso
web la propiedad que adquirio cuando el DDL se ejecutaba en caliente:

1. exige la identidad administrativa ``postgres`` y una confirmacion explicita;
2. toma invariantes de documentos, versiones, SHA-256 y alcances;
3. ejecuta ``05_convergencia_propiedad.sql`` dentro de una transaccion;
4. cierra la conexion administrativa y abre las siguientes sesiones con
   ``SET ROLE ecd_migrator``;
5. construye, verifica y concede permisos al runtime como migrador;
6. demuestra que ninguna invariante historica cambio;
7. publica un health check de mantenimiento para que Render pueda marcar verde
   esta ejecucion antes de volver a arrancar como ``ecd_app``.

Nunca arranca la aplicacion y no necesita guardar la clave del migrador en el
servicio web. La pertenencia administrativa concedida por el SQL permite usar
``SET ROLE`` unicamente durante este proceso de mantenimiento.
"""
import json
import os
import pathlib
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

import db  # noqa: E402
from herramientas.invariantes import tomar  # noqa: E402


def _sql_convergencia():
    ruta = pathlib.Path(__file__).resolve().parent.parent / 'sql' / '05_convergencia_propiedad.sql'
    lineas = ruta.read_text(encoding='utf-8').splitlines()
    # ``\\set`` es una orden de psql, no SQL. ON_ERROR_STOP lo sustituye aqui
    # el manejo de excepciones de psycopg2: cualquier fallo aborta el proceso.
    return '\n'.join(l for l in lineas if not l.lstrip().startswith('\\'))


def _identidad_administrativa():
    with db.get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute('SELECT session_user, current_user')
        sesion, actual = cur.fetchone()
    if sesion != 'postgres' or actual != 'postgres':
        raise RuntimeError(
            'convergencia rechazada: PostgreSQL autentico como %s/%s; '
            'se exige postgres/postgres' % (sesion, actual))


def _cerrar_pool():
    if db.db_pool is not None:
        db.db_pool.closeall()
        db.db_pool = None


def _invariantes_preservadas(antes, despues):
    """Acepta objetos/columnas nuevos, nunca reescritura historica."""
    for clave in ('file_nodes', 'file_versions', 'versiones_con_sha256',
                  'activity_log', 'auth_events'):
        if antes.get(clave) != despues.get(clave):
            raise RuntimeError('la invariante %s cambio durante la migracion' % clave)
    for alcance, huella in antes.get('alcances', {}).items():
        if despues.get('alcances', {}).get(alcance) != huella:
            raise RuntimeError('el alcance historico %s fue reescrito' % alcance)


def _migrar_como_rol():
    # libpq aplica esta opcion a CADA conexion nueva del pool. La autenticacion
    # sigue siendo la administrativa, pero PostgreSQL ejecuta todo el bootstrap
    # con current_user=ecd_migrator. No se copia ni almacena su contrasena.
    _cerrar_pool()
    os.environ['PGOPTIONS'] = '-c role=ecd_migrator'
    db.init_db_pool()

    import bootstrap_esquema as bootstrap
    bootstrap.exigir_identidad_migrador()
    fallos = bootstrap.construir()
    completo, faltan = bootstrap.verificar()
    if not completo:
        raise RuntimeError('el esquema sigue incompleto: %d objetos' % len(faltan))
    bootstrap.aplicar_grants_aplicacion()
    if fallos:
        print('  rutinas con aviso durante bootstrap: %d' % len(fallos))


def converger():
    if os.getenv('CONFIRMAR_CONVERGENCIA_PROPIEDAD') != 'SI_UNA_VEZ':
        raise RuntimeError(
            'falta CONFIRMAR_CONVERGENCIA_PROPIEDAD=SI_UNA_VEZ')
    db.init_db_pool()
    _identidad_administrativa()

    antes = tomar()
    with db.get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute(_sql_convergencia())
        conn.commit()

    despues_propiedad = tomar()
    _invariantes_preservadas(antes, despues_propiedad)

    _migrar_como_rol()
    despues = tomar()
    _invariantes_preservadas(antes, despues)

    with db.get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute("""SELECT count(*)
                         FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                        WHERE n.nspname IN ('public','ai_brain')
                          AND pg_get_userbyid(c.relowner)='ecd_app'
                          AND c.relkind IN ('r','p','v','m','f','S')""")
        propios = cur.fetchone()[0]
        cur.execute("""SELECT count(*)
                         FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                        WHERE n.nspname IN ('public','ai_brain')
                          AND pg_get_userbyid(p.proowner)='ecd_app'""")
        rutinas_propias = cur.fetchone()[0]
        cur.execute("""SELECT has_schema_privilege('ecd_app','public','CREATE'),
                              has_schema_privilege('ecd_app','ai_brain','CREATE')""")
        create_public, create_ai = cur.fetchone()
    if propios or rutinas_propias or create_public or create_ai:
        raise RuntimeError(
            'postcondicion fallida: propios=%s rutinas=%s '
            'create_public=%s create_ai=%s'
            % (propios, rutinas_propias, create_public, create_ai))

    print('CONVERGENCIA DE PROPIEDAD COMPLETA')
    print('  objetos de ecd_app : 0')
    print('  rutinas de ecd_app : 0')
    print('  CREATE de ecd_app  : no')
    print('  file_nodes         : %d · %s' %
          (despues['file_nodes']['filas'], despues['file_nodes']['huella'][:16]))
    print('  file_versions      : %d · %s' %
          (despues['file_versions']['filas'], despues['file_versions']['huella'][:16]))
    print('  versiones SHA-256  : %d' % despues['versiones_con_sha256'])
    print('  esquema obligatorio: COMPLETO')
    return despues


class _Health(BaseHTTPRequestHandler):
    def do_GET(self):
        cuerpo = json.dumps({
            'status': 'ok',
            'mode': 'convergencia_propiedad_completa',
        }).encode('utf-8')
        self.send_response(200)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(cuerpo)))
        self.end_headers()
        self.wfile.write(cuerpo)

    def log_message(self, formato, *args):
        print('health: ' + (formato % args))


if __name__ == '__main__':
    converger()

    # El proceso de mantenimiento que queda escuchando no conserva secretos ni
    # conexiones. Render puede comprobarlo y sustituir la version anterior.
    _cerrar_pool()
    os.environ.pop('PGOPTIONS', None)
    os.environ.pop('CONFIRMAR_CONVERGENCIA_PROPIEDAD', None)
    os.environ.pop('DB_PASS', None)
    os.environ.pop('DB_USER', None)

    puerto = int(os.getenv('PORT') or '10000')
    print('mantenimiento verificado en 0.0.0.0:%d' % puerto)
    ThreadingHTTPServer(('0.0.0.0', puerto), _Health).serve_forever()
