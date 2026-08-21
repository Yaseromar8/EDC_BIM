# -*- coding: utf-8 -*-
"""LA OPERACION IRREVERSIBLE, ENSAYADA ANTES DE HACERLA DE VERDAD.

QUE DEMUESTRA
-------------
Que `converger_propiedad.py` transforma un estado EQUIVALENTE AL DE PRODUCCION
--todo de `postgres`, sin `ecd_app`, sin `ecd_migrator`-- en el estado objetivo,
sin tocar lo que no es suyo y sin reescribir un solo dato.

POR QUE EXISTE
--------------
Porque el 21-ago-2026 se comprobo que NO lo hacia, y el guion se declaraba
correcto igualmente:

  D1  los tres bucles del SQL filtraban por `owner = 'ecd_app'`. En produccion
      no hay ni un objeto de `ecd_app`: los tiene `postgres`. Recorrian cero
      filas. Y la postcondicion preguntaba LO MISMO que el bucle, asi que daba
      0, la transaccion CONFIRMABA, y 95 tablas se quedaban donde estaban.
  D2  `_migrar_como_rol` ponia `PGOPTIONS`, que libpq ignora porque `db.py`
      pasa `options=` en la conexion. La migracion corria como `postgres`, la
      guardia lo detectaba y abortaba -- DESPUES del COMMIT de propiedad.

Un ensayo que se ejecuta a mano una vez no impide que vuelva a pasar. Este se
reejecuta.

QUE **NO** SE APROPIA, Y POR QUE
---------------------------------
De las 38 funciones de `public`, **37 son de la extension `pgcrypto`**. La
pertenencia se lee de `pg_depend` con `deptype='e'`, nunca de nombres. Cambiarles
el dueño romperia el modelo de extensiones: `pg_dump` no emite esos cambios y un
`DROP/CREATE EXTENSION` los deshace.

COMO SE USA
-----------
Necesita un cluster DESECHABLE cuyo superusuario se llame `postgres` --como
Cloud SQL-- y en el que se pueda crear y borrar bases y roles. NUNCA se ejecuta
contra produccion: se niega si la base de destino no lleva el prefijo de ensayo.

    ECD_ENSAYO_HOST=127.0.0.1 ECD_ENSAYO_PORT=5460 ECD_ENSAYO_PASS=... \\
        python herramientas/ensayo_de_convergencia.py

Lo que hace, tres veces medido:

    RONDA 1   fixture nuevo -> convergencia -> se comprueba todo
    RONDA 2   fixture NUEVO E INDEPENDIENTE -> lo mismo   (reproducibilidad)
    RONDA 3   sobre la base YA CONVERGIDA de la ronda 2   (idempotencia)
"""
import importlib
import os
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

import psycopg2

PREFIJO = 'zz_conv_'
HOST = os.getenv('ECD_ENSAYO_HOST', '127.0.0.1')
PUERTO = os.getenv('ECD_ENSAYO_PORT', '5460')
ADMIN = 'postgres'          # el guion de convergencia lo exige por nombre
CLAVE = os.getenv('ECD_ENSAYO_PASS', '')

_pasos = []


def _paso(ok, texto, detalle=''):
    _pasos.append((ok, texto))
    print('  %s  %s%s' % ('OK  ' if ok else 'FALLA', texto,
                          ('   -- ' + detalle) if detalle else ''))
    return ok


def _titulo(t):
    print()
    print(t.upper())


def _conn(base, autocommit=False, opciones=None):
    c = psycopg2.connect(host=HOST, port=PUERTO, dbname=base, user=ADMIN,
                         password=CLAVE, connect_timeout=10,
                         **({'options': opciones} if opciones else {}))
    c.autocommit = autocommit
    return c


def _suelto(base, *sentencias):
    """Sentencias que NO pueden ir dentro de una transaccion (CREATE DATABASE).

    Sin `with`: psycopg2 abre transaccion en `with conn` aunque `autocommit`
    sea True -- medido, el estado pasa a INTRANS tras la primera sentencia.
    """
    c = _conn(base, autocommit=True)
    try:
        cur = c.cursor()
        for sql in sentencias:
            cur.execute(sql)
    finally:
        c.close()


def _uno(base, sql, params=None):
    with _conn(base) as c:
        cur = c.cursor()
        cur.execute(sql, params)
        f = cur.fetchone()
        return f[0] if f else None


# ── El inventario, clasificado POR EL CATALOGO ───────────────────────────

_INVENTARIO = """
SELECT 'schema'::text AS clase, pg_get_userbyid(nspowner) AS owner,
       'APLICATIVO'::text AS tipo, count(*)::int
  FROM pg_namespace WHERE nspname IN ('public','ai_brain') GROUP BY 1,2,3
UNION ALL
SELECT CASE c.relkind WHEN 'r' THEN 'tabla' WHEN 'p' THEN 'tabla'
                      WHEN 'v' THEN 'vista' WHEN 'm' THEN 'vista'
                      WHEN 'S' THEN 'secuencia' WHEN 'f' THEN 'tabla'
                      WHEN 'i' THEN 'indice' WHEN 'I' THEN 'indice'
                      ELSE 'otra relacion' END,
       pg_get_userbyid(c.relowner),
       CASE WHEN d.refobjid IS NOT NULL THEN 'EXTENSION' ELSE 'APLICATIVO' END,
       count(*)::int
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  LEFT JOIN pg_depend d ON d.classid='pg_class'::regclass
                       AND d.objid=c.oid AND d.deptype='e'
 WHERE n.nspname IN ('public','ai_brain')
   AND c.relkind IN ('r','p','v','m','f','S','i','I')
 GROUP BY 1,2,3
UNION ALL
SELECT 'funcion', pg_get_userbyid(p.proowner),
       CASE WHEN d.refobjid IS NOT NULL THEN 'EXTENSION' ELSE 'APLICATIVO' END,
       count(*)::int
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  LEFT JOIN pg_depend d ON d.classid='pg_proc'::regclass
                       AND d.objid=p.oid AND d.deptype='e'
 WHERE n.nspname IN ('public','ai_brain')
 GROUP BY 1,2,3
ORDER BY 1,3,2
"""


def inventario(base):
    """{(clase, tipo, owner): n}. Nada se infiere de nombres."""
    with _conn(base) as c:
        cur = c.cursor()
        cur.execute(_INVENTARIO)
        return {(r[0], r[2], r[1]): r[3] for r in cur.fetchall()}


def pintar(inv, titulo):
    print('  %s' % titulo)
    for (clase, tipo, owner), n in sorted(inv.items()):
        print('    %-14s %-11s %-14s %4d' % (clase, tipo, owner, n))


def por_tipo(inv, tipo):
    """{(clase, owner): n} para APLICATIVO o EXTENSION."""
    return {(c, o): n for (c, t, o), n in inv.items() if t == tipo}


# ── Fixture: el estado de partida de produccion ──────────────────────────

def crear_fixture(base):
    """Base nueva con el esquema completo construido POR `postgres`."""
    _suelto('postgres',
            "DROP DATABASE IF EXISTS %s WITH (FORCE)" % base,
            "CREATE DATABASE %s" % base)

    entorno = dict(os.environ)
    entorno.update({
        'DB_HOST': HOST, 'DB_PORT': str(PUERTO), 'DB_NAME': base,
        'DB_USER': ADMIN, 'DB_PASS': CLAVE,
        'ROL_MIGRADOR': ADMIN,          # todavia NO hay identidades separadas
        'ESQUEMA_ESTRICTO': 'true', 'ECD_CANDADO_ESTADOS': 'true',
        'DEPLOY_PROFILE': 'completo', 'DDL_EN_CALIENTE': 'false',
        'APP_SECRET': 'x' * 40, 'SESSION_PEPPER': 'y' * 40,
    })
    raiz = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    r = subprocess.run([sys.executable, 'bootstrap_esquema.py'], cwd=raiz,
                       env=entorno, capture_output=True, text=True,
                       encoding='utf-8', errors='replace', timeout=900)
    salida = (r.stdout or '') + (r.stderr or '')
    completo = 'FALTAN' not in salida
    # `FALLO DE PERMISOS: role "ecd_app" does not exist` es ESPERADO aqui: es
    # exactamente lo que imprime produccion hoy, y parte del fixture.
    return completo, salida


def sembrar_historia(base):
    """Unas filas, para que las invariantes tengan algo que preservar."""
    c = _conn(base, autocommit=True)
    try:
        cur = c.cursor()
        cur.execute("INSERT INTO projects (id, name, model_urn, status) "
                    "VALUES ('zz_conv_obra','ZZ CONV','zz_conv_obra','active') "
                    "ON CONFLICT DO NOTHING")
        cur.execute("INSERT INTO users (name,email,password_hash,role,is_active) "
                    "VALUES ('Conv','zz_conv@t','x','editor',TRUE) "
                    "ON CONFLICT DO NOTHING RETURNING id")
        for i in range(5):
            cur.execute("INSERT INTO file_nodes (model_urn, node_type, name, "
                        "  is_deleted, status, gcs_urn, version_number) "
                        "VALUES ('zz_conv_obra','FILE',%s,FALSE,'SHARED',%s,1)",
                        ('DOC_%d.pdf' % i, 'zz_conv/obj/%d' % i))
        cur.execute("INSERT INTO activity_log (model_urn, action, entity_type, "
                    "  performed_by) VALUES ('zz_conv_obra','ensayo','test','zz')")
    finally:
        c.close()


def crear_roles(base):
    """`00_roles.sql`, con las contraseñas por STDIN y no por argv."""
    import secrets
    raiz = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    app_pw = secrets.token_urlsafe(20) + '#Aa1'
    mig_pw = secrets.token_urlsafe(20) + '#Bb2'
    guion = os.path.join(raiz, 'sql', '00_roles.sql')
    with open(guion, encoding='utf-8') as f:
        cuerpo = [l for l in f.read().splitlines()
                  if not l.lstrip().startswith('\\')]
    # `\prompt`, `\if` y `\set` son de psql; aqui los sustituyen dos literales.
    sql = ('\n'.join(cuerpo)
           .replace(":'app_pw'", "'%s'" % app_pw)
           .replace(":'mig_pw'", "'%s'" % mig_pw)
           .replace(':"DBNAME"', '"%s"' % base))
    c = _conn(base, autocommit=True)
    try:
        c.cursor().execute(sql)
    finally:
        c.close()
    return app_pw, mig_pw


def borrar_roles(base):
    c = _conn(base, autocommit=True)
    try:
        cur = c.cursor()
        for rol in ('ecd_app', 'ecd_migrator'):
            cur.execute("SELECT 1 FROM pg_roles WHERE rolname=%s", (rol,))
            if cur.fetchone():
                cur.execute('DROP OWNED BY %s CASCADE' % rol)
                cur.execute('DROP ROLE %s' % rol)
    finally:
        c.close()


def convergir(base):
    """La herramienta REAL, en un proceso propio, como en produccion."""
    entorno = dict(os.environ)
    entorno.update({
        'DB_HOST': HOST, 'DB_PORT': str(PUERTO), 'DB_NAME': base,
        'DB_USER': ADMIN, 'DB_PASS': CLAVE,
        'CONFIRMAR_CONVERGENCIA_PROPIEDAD': 'SI_UNA_VEZ',
        'ESQUEMA_ESTRICTO': 'true', 'ECD_CANDADO_ESTADOS': 'true',
        'DEPLOY_PROFILE': 'completo', 'DDL_EN_CALIENTE': 'false',
        'APP_SECRET': 'x' * 40, 'SESSION_PEPPER': 'y' * 40,
    })
    raiz = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    r = subprocess.run(
        [sys.executable, '-c',
         'import sys; sys.path.insert(0, ".");'
         ' from herramientas.converger_propiedad import converger; converger()'],
        cwd=raiz, env=entorno, capture_output=True, text=True,
        encoding='utf-8', errors='replace', timeout=900)
    return r.returncode, (r.stdout or '') + (r.stderr or '')


def invariantes(base):
    """Lo HISTORICO, que tiene que salir identico. Si cambia, se tocaron datos."""
    with _conn(base) as c:
        cur = c.cursor()
        cur.execute("""
            SELECT (SELECT count(*) FROM file_nodes),
                   (SELECT md5(coalesce(string_agg(id::text, '|' ORDER BY id), ''))
                      FROM file_nodes),
                   (SELECT count(*) FROM file_versions),
                   (SELECT count(*) FROM activity_log),
                   (SELECT md5(coalesce(string_agg(id::text||':'||action, '|' ORDER BY id), ''))
                      FROM activity_log),
                   (SELECT count(*) FROM auth_events),
                   (SELECT count(*) FROM projects),
                   (SELECT md5(coalesce(string_agg(id||':'||name, '|' ORDER BY id), ''))
                      FROM projects)""")
        return cur.fetchone()


def cuentas(base):
    """Las cuentas que existen, con su huella. NO es una invariante historica.

    El bootstrap SIEMBRA el administrador inicial, asi que `users` crece a
    proposito. Lo que no puede pasar es que una cuenta anterior desaparezca o
    cambie -- y eso si se comprueba.
    """
    with _conn(base) as c:
        cur = c.cursor()
        cur.execute("SELECT id, md5(coalesce(email,'')||':'||coalesce(role,'')) "
                    "  FROM users ORDER BY id")
        return {r[0]: r[1] for r in cur.fetchall()}


def privilegios(base, app_pw):
    """Lo que `ecd_app` PUEDE y lo que NO. Se mide intentandolo."""
    r = {}
    c = psycopg2.connect(host=HOST, port=PUERTO, dbname=base, user='ecd_app',
                         password=app_pw, connect_timeout=10)
    c.autocommit = False
    cur = c.cursor()

    def intento(clave, sql):
        try:
            cur.execute(sql)
            r[clave] = True
        except Exception as e:
            r[clave] = str(e).strip().splitlines()[0][:70]
        finally:
            c.rollback()

    intento('SELECT', 'SELECT count(*) FROM file_nodes')
    intento('INSERT', "INSERT INTO activity_log (model_urn, action, entity_type,"
                      " performed_by) VALUES ('zz_conv_obra','x','y','z')")
    intento('UPDATE_datos', "UPDATE projects SET name=name WHERE id='zz_conv_obra'")
    intento('ALTER_TABLE', 'ALTER TABLE project_users ADD COLUMN zz_probe boolean')
    intento('CREATE_TABLE', 'CREATE TABLE zz_probe_tabla (id int)')
    intento('UPDATE_auditoria', 'UPDATE activity_log SET action=action')
    intento('DELETE_auditoria', 'DELETE FROM activity_log')
    c.close()
    return r


# ── Una ronda ────────────────────────────────────────────────────────────

def ronda(base, etiqueta, ya_convergida=False, app_pw=None):
    _titulo(etiqueta)

    if not ya_convergida:
        completo, salida = crear_fixture(base)
        _paso(completo, 'fixture construido POR postgres: esquema completo')
        _paso('role "ecd_app" does not exist' in salida,
              'y sin identidades separadas -- el mismo mensaje que produccion')
        sembrar_historia(base)

    antes = inventario(base)
    inv_antes = invariantes(base)
    cuentas_antes = cuentas(base)
    pintar(antes, 'OWNER INICIAL' if not ya_convergida else 'OWNER ANTES DE REPETIR')

    if not ya_convergida:
        _paso(por_tipo(antes, 'APLICATIVO').get(('tabla', 'postgres'), 0) == 95,
              'las 95 tablas aplicativas son de postgres')
        _paso(not any(o == 'ecd_app' or o == 'ecd_migrator'
                      for (_c, o) in por_tipo(antes, 'APLICATIVO')),
              'ningun objeto es todavia de ecd_app ni de ecd_migrator')
        app_pw, _mig_pw = crear_roles(base)
        _paso(_uno(base, "SELECT count(*) FROM pg_roles "
                         " WHERE rolname IN ('ecd_app','ecd_migrator')") == 2,
              'los dos roles creados (contraseñas por stdin, nunca por argv)')

    codigo, salida = convergir(base)
    _paso(codigo == 0, 'la convergencia termina bien',
          salida.strip().splitlines()[-1][:90] if codigo else '')
    if codigo:
        print(salida[-2500:])
        return app_pw

    _paso('session_user=postgres · current_user=ecd_migrator' in salida,
          'DURANTE la migracion: session_user=postgres, current_user=ecd_migrator')

    despues = inventario(base)
    pintar(despues, 'OWNER FINAL')

    apl = por_tipo(despues, 'APLICATIVO')
    ext = por_tipo(despues, 'EXTENSION')
    fuera = {k: v for k, v in apl.items() if k[1] != 'ecd_migrator'}
    _paso(not fuera, 'CERO objetos aplicativos fuera de ecd_migrator', str(fuera))
    for clase, esperado in (('schema', 2), ('tabla', 95), ('secuencia', 36),
                            ('indice', 185), ('funcion', 1)):
        _paso(apl.get((clase, 'ecd_migrator'), 0) == esperado,
              '%s aplicativos -> ecd_migrator: %d' % (clase, esperado),
              str(apl.get((clase, 'ecd_migrator'), 0)))

    ext_antes = por_tipo(antes, 'EXTENSION')
    _paso(ext == ext_antes and ext.get(('funcion', 'postgres'), 0) == 37,
          'las 37 funciones de pgcrypto conservan su dueño original: INTACTAS',
          str(ext))
    _paso(_uno(base, """SELECT count(*) FROM pg_class c
                          JOIN pg_namespace n ON n.oid=c.relnamespace
                          LEFT JOIN pg_depend d ON d.classid='pg_class'::regclass
                                               AND d.objid=c.oid AND d.deptype='e'
                         WHERE n.nspname IN ('public','ai_brain')
                           AND d.refobjid IS NULL
                           AND c.relkind NOT IN ('r','p','v','m','f','S','i','I','t','c')""") == 0,
          'cero objetos OTHER / UNKNOWN')

    _paso(_uno(base, "SELECT has_schema_privilege('ecd_app','public','CREATE')") is False,
          'ecd_app NO puede crear en public')
    _paso(_uno(base, "SELECT has_table_privilege('ecd_app','activity_log','UPDATE')") is False,
          'ecd_app NO puede reescribir la auditoria')
    n_grants = _uno(base, "SELECT count(DISTINCT table_name) "
                          "  FROM information_schema.table_privileges "
                          " WHERE grantee='ecd_app' AND privilege_type='SELECT'")
    _paso(n_grants >= 95, 'ecd_app recibe lectura de las tablas: %s' % n_grants)

    inv_despues = invariantes(base)
    _paso(inv_antes == inv_despues, 'invariantes historicas IDENTICAS',
          '' if inv_antes == inv_despues else '%s vs %s' % (inv_antes, inv_despues))
    cuentas_despues = cuentas(base)
    perdidas = {k: v for k, v in cuentas_antes.items()
                if cuentas_despues.get(k) != v}
    _paso(not perdidas, 'ninguna cuenta anterior desaparece ni cambia',
          str(perdidas))
    nuevas = len(cuentas_despues) - len(cuentas_antes)
    _paso(nuevas >= 0, 'cuentas sembradas por el bootstrap: %d (creacion, no '
                       'reescritura)' % nuevas)

    p = privilegios(base, app_pw)
    _paso(p['SELECT'] is True, 'ecd_app: SELECT permitido')
    _paso(p['INSERT'] is True, 'ecd_app: INSERT permitido')
    _paso(p['UPDATE_datos'] is True, 'ecd_app: UPDATE de datos permitido')
    _paso(p['ALTER_TABLE'] is not True, 'ecd_app: ALTER TABLE DENEGADO',
          str(p['ALTER_TABLE'])[:60])
    _paso(p['CREATE_TABLE'] is not True, 'ecd_app: CREATE TABLE DENEGADO',
          str(p['CREATE_TABLE'])[:60])
    _paso(p['UPDATE_auditoria'] is not True, 'ecd_app: UPDATE de activity_log DENEGADO',
          str(p['UPDATE_auditoria'])[:60])
    _paso(p['DELETE_auditoria'] is not True, 'ecd_app: DELETE de activity_log DENEGADO',
          str(p['DELETE_auditoria'])[:60])

    # La conexion ORDINARIA no recibe el SET ROLE de la migracion.
    with _conn(base) as c:
        cur = c.cursor()
        cur.execute('SELECT session_user, current_user')
        _paso(cur.fetchone() == ('postgres', 'postgres'),
              'la conexion ORDINARIA no hereda el SET ROLE de la migracion')

    return app_pw


def ronda_fail_closed(base):
    """Se planta un objeto que el guion NO sabe clasificar. Tiene que pararse."""
    _titulo('4 · FAIL-CLOSED — ante lo desconocido, para; no se lo apropia')
    completo, salida = crear_fixture(base)
    _paso(completo, 'fixture nuevo construido POR postgres')
    sembrar_historia(base)
    app_pw, _mig = crear_roles(base)

    # Un tipo enum PROPIO: ownable, no pertenece a ninguna extension, y este
    # guion no lo transfiere. Es exactamente el caso «OTHER / UNKNOWN».
    _suelto(base, "CREATE TYPE public.zz_semaforo AS ENUM ('rojo','ambar','verde')")
    duenno_antes = _uno(base, "SELECT pg_get_userbyid(typowner) FROM pg_type t "
                              " JOIN pg_namespace n ON n.oid=t.typnamespace "
                              " WHERE t.typname='zz_semaforo'")
    inv_antes = inventario(base)

    codigo, salida = convergir(base)
    _paso(codigo != 0, 'la convergencia NO se declara correcta')
    _paso('CONVERGENCIA DETENIDA' in salida, 'y dice que se ha detenido')
    _paso('zz_semaforo' in salida, 'nombrando el objeto que no sabe clasificar')

    duenno_despues = _uno(base, "SELECT pg_get_userbyid(typowner) FROM pg_type t "
                                " JOIN pg_namespace n ON n.oid=t.typnamespace "
                                " WHERE t.typname='zz_semaforo'")
    _paso(duenno_despues == duenno_antes,
          'el objeto desconocido conserva su dueño: no se lo apropio',
          '%s -> %s' % (duenno_antes, duenno_despues))

    inv_despues = inventario(base)
    _paso(inv_antes == inv_despues,
          'y NADA cambio de dueño: la transaccion entera se deshizo')
    _paso(por_tipo(inv_despues, 'APLICATIVO').get(('tabla', 'postgres'), 0) == 95,
          'las 95 tablas siguen donde estaban')


def main():
    if not CLAVE:
        print('Falta ECD_ENSAYO_PASS: la contraseña del superusuario del '
              'cluster DESECHABLE. Nunca la de produccion.')
        return 2

    print()
    print('=' * 76)
    print('ENSAYO DE CONVERGENCIA DE PROPIEDAD — LA OPERACION IRREVERSIBLE')
    print('=' * 76)
    print('destino: %s:%s   (cluster desechable; las bases llevan «%s»)'
          % (HOST, PUERTO, PREFIJO))

    b1, b2 = PREFIJO + 'uno', PREFIJO + 'dos'
    for b in (b1, b2):
        if not b.startswith(PREFIJO):
            raise SystemExit('base sin prefijo de ensayo: %s' % b)

    def borrar_todo():
        # PRIMERO LA BASE, DESPUES EL ROL. `DROP ROLE` falla mientras exista una
        # base donde el rol tenga permisos concedidos: «140 objects depend on it».
        _suelto('postgres', *["DROP DATABASE IF EXISTS %s WITH (FORCE)" % b
                              for b in (b1, b2)])
        borrar_roles('postgres')


    borrar_todo()
    ronda(b1, '1 · PRIMERA RONDA — desde un estado nuevo')

    # Y se borra TODO antes de la segunda: el estado de partida tiene que ser
    # nuevo de verdad, no el de la ronda anterior con otro nombre.
    borrar_todo()
    pw2 = ronda(b2, '2 · SEGUNDA RONDA — desde OTRO estado nuevo e independiente')
    ronda(b2, '3 · TERCERA RONDA — IDEMPOTENCIA sobre la base YA convergida',
          ya_convergida=True, app_pw=pw2)

    borrar_todo()
    ronda_fail_closed(b1)

    borrar_todo()

    fallos = [p for p in _pasos if not p[0]]
    print()
    print('=' * 76)
    print('%d de %d comprobaciones pasan' % (len(_pasos) - len(fallos), len(_pasos)))
    print('=' * 76)
    return 1 if fallos else 0


if __name__ == '__main__':
    raise SystemExit(main())
