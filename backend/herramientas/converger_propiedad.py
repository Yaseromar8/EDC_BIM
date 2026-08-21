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
    """Reabre el pool con `SET ROLE ecd_migrator`, SIN perder las demas opciones.

    La autenticacion sigue siendo la administrativa --no se copia ni se almacena
    la contrasena del migrador-- pero PostgreSQL ejecuta todo el bootstrap con
    `current_user = ecd_migrator`.

    ANTES SE HACIA CON `PGOPTIONS` Y NO FUNCIONABA. libpq da precedencia al
    parametro `options` de la conexion sobre la variable de entorno, y `db.py`
    siempre pasa uno. Resultado medido: `current_user` seguia siendo `postgres`,
    la guardia del bootstrap lo detectaba y abortaba -- DESPUES de que la
    transaccion de propiedad hubiera confirmado, dejando la base a medio
    converger. Ahora la opcion se AÑADE a las que ya habia, en vez de competir
    con ellas.

    Esto solo afecta a ESTE proceso de mantenimiento. Ninguna conexion ordinaria
    del backend recibe `SET ROLE`: `init_db_pool()` sin argumento se comporta
    igual que siempre, y el ensayo lo comprueba.
    """
    _cerrar_pool()
    db.init_db_pool(opciones=db.OPCIONES_DE_CONEXION + ' -c role=ecd_migrator')

    # Y se DEMUESTRA, en vez de darlo por hecho.
    with db.get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute('SELECT session_user, current_user')
        sesion, actual = cur.fetchone()
    if sesion != 'postgres' or actual != 'ecd_migrator':
        raise RuntimeError(
            'la conexion de migracion no quedo como se esperaba: '
            'session_user=%s current_user=%s' % (sesion, actual))
    print('  identidad de migracion: session_user=%s · current_user=%s'
          % (sesion, actual))

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

    # POSTCONDICION: cero objetos APLICATIVOS fuera de ecd_migrator.
    #
    # La version anterior contaba «objetos de ecd_app», que es LO MISMO que
    # miraba el bucle: en una instancia sin identidades separadas no hay
    # ninguno, asi que daba 0 y se declaraba correcta habiendo dejado 95 tablas
    # de `postgres` donde estaban. Un control tiene que medir lo que persigue,
    # no repetir la pregunta del bucle.
    #
    # «Aplicativo» excluye a los miembros de extension por `pg_depend`
    # (deptype='e'): de las 38 funciones de `public`, 37 son de `pgcrypto` y no
    # se tocan -- ni siquiera se pueden tocar bien, porque `pg_dump` no emite
    # esos cambios de dueño.
    with db.get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute("""
            SELECT 'schema '||nspname||' -> '||pg_get_userbyid(nspowner)
              FROM pg_namespace WHERE nspname IN ('public','ai_brain')
               AND pg_get_userbyid(nspowner) IS DISTINCT FROM 'ecd_migrator'
            UNION ALL
            SELECT 'relacion '||n.nspname||'.'||c.relname||' -> '
                   ||pg_get_userbyid(c.relowner)
              FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
              LEFT JOIN pg_depend d ON d.classid='pg_class'::regclass
                                   AND d.objid=c.oid AND d.deptype='e'
             WHERE n.nspname IN ('public','ai_brain') AND d.refobjid IS NULL
               AND c.relkind IN ('r','p','v','m','f','S','i','I')
               AND pg_get_userbyid(c.relowner) IS DISTINCT FROM 'ecd_migrator'
            UNION ALL
            SELECT 'rutina '||n.nspname||'.'||p.proname||' -> '
                   ||pg_get_userbyid(p.proowner)
              FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
              LEFT JOIN pg_depend d ON d.classid='pg_proc'::regclass
                                   AND d.objid=p.oid AND d.deptype='e'
             WHERE n.nspname IN ('public','ai_brain') AND d.refobjid IS NULL
               AND pg_get_userbyid(p.proowner) IS DISTINCT FROM 'ecd_migrator'
        """)
        fuera = [r[0] for r in cur.fetchall()]
        cur.execute("""SELECT has_schema_privilege('ecd_app','public','CREATE'),
                              has_schema_privilege('ecd_app','ai_brain','CREATE')""")
        create_public, create_ai = cur.fetchone()
        # Y lo que SI tiene que conservar su dueño original.
        cur.execute("""SELECT count(*) FROM pg_proc p
                         JOIN pg_namespace n ON n.oid=p.pronamespace
                         JOIN pg_depend d ON d.classid='pg_proc'::regclass
                                         AND d.objid=p.oid AND d.deptype='e'
                        WHERE n.nspname IN ('public','ai_brain')""")
        de_extension = cur.fetchone()[0]
    if fuera or create_public or create_ai:
        raise RuntimeError(
            'postcondicion fallida: fuera_de_ecd_migrator=%s '
            'create_public=%s create_ai=%s'
            % (fuera[:10], create_public, create_ai))

    print('CONVERGENCIA DE PROPIEDAD COMPLETA')
    print('  objetos aplicativos fuera de ecd_migrator : 0')
    print('  rutinas de extension intactas             : %d' % de_extension)
    print('  CREATE de ecd_app                         : no')
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
    os.environ.pop('CONFIRMAR_CONVERGENCIA_PROPIEDAD', None)
    os.environ.pop('DB_PASS', None)
    os.environ.pop('DB_USER', None)

    puerto = int(os.getenv('PORT') or '10000')
    print('mantenimiento verificado en 0.0.0.0:%d' % puerto)
    ThreadingHTTPServer(('0.0.0.0', puerto), _Health).serve_forever()
