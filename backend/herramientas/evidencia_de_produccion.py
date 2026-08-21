# -*- coding: utf-8 -*-
"""E1 + E2 + E3 — evidencia de produccion, en UNA pasada y SOLO LECTURA.

QUE ES
------
Las lecturas del gate tecnico que exigen credenciales de produccion, empaquetadas
para que las ejecute EL PROPIETARIO tecleando la contrasena. No cambia nada: ni
una fila, ni una variable, ni un rol.

  E1  esquema real contra el manifiesto del arbol actual
  E2  roles / propiedad / grants (tolerante a que ecd_app no exista)
  E3  que punto de la postura de seguridad falla (pide sesion de administrador)

E4 (variables de Render) no se puede leer desde aqui: es el panel. El informe
deja la tabla para rellenar a mano.

COMO SE USA
-----------
    cd backend
    python herramientas/evidencia_de_produccion.py --db-host <IP> --db-name <base> --db-user postgres
    python herramientas/evidencia_de_produccion.py --web https://<servicio>.onrender.com

Las contrasenas se TECLEAN (getpass): no van por argumento, no quedan en el
historial ni en la lista de procesos, y NO se escriben en el informe.

El resultado queda en docs/entidad/evidencias/, sin ningun secreto dentro.
"""
import argparse
import datetime
import getpass
import json
import os
import pathlib
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

RAIZ = pathlib.Path(__file__).resolve().parent.parent
EVID = RAIZ.parent / 'docs' / 'entidad' / 'evidencias'

_lineas = []


def _p(texto=''):
    print(texto)
    _lineas.append(texto)


def _guardar(nombre):
    EVID.mkdir(parents=True, exist_ok=True)
    ruta = EVID / ('%s-%s.txt' % (nombre, datetime.date.today().isoformat()))
    ruta.write_text('\n'.join(_lineas) + '\n', encoding='utf-8')
    print('\nevidencia: %s' % ruta)


# ── E1 + E2 · contra la base ─────────────────────────────────────────────

def contra_la_base(host, puerto, base, usuario, solo_e1=False):
    import psycopg2
    clave = getpass.getpass('contraseña de %s en %s:%s (no se muestra): '
                            % (usuario, host, puerto))
    try:
        conn = psycopg2.connect(host=host, port=puerto, dbname=base,
                                user=usuario, password=clave, connect_timeout=15)
    except Exception as e:
        print('NO SE PUDO CONECTAR: %s' % str(e).split('\n')[0])
        return 2
    conn.set_session(readonly=True)   # el candado: esta sesion NO puede escribir
    cur = conn.cursor()

    _p('EVIDENCIA %s · %s · base %s · %s'
       % ('E1' if solo_e1 else 'E1/E2',
          datetime.datetime.now().strftime('%Y-%m-%d %H:%M'), base, host))
    _p('sesion de SOLO LECTURA (set_session readonly)')
    _p()

    # ── E1 · el esquema contra el manifiesto del arbol actual ────────────
    _p('── E1 · ESQUEMA REAL vs MANIFIESTO DEL ARBOL ACTUAL ──')
    os.environ.update({'DB_HOST': host, 'DB_PORT': str(puerto),
                       'DB_NAME': base, 'DB_USER': usuario})
    # verificar() abre su propia conexion: se le presta la contrasena por el
    # entorno SOLO durante la llamada, y despues se borra del entorno y de la
    # variable. Nunca se imprime ni se escribe.
    import bootstrap_esquema as boot   # verificar() solo lee el catalogo
    os.environ['DB_PASS'] = clave
    try:
        import db as _db
        if getattr(_db, 'db_pool', None) is not None:
            _db.db_pool.closeall()
            _db.db_pool = None
        completo, faltan = boot.verificar()
    finally:
        os.environ.pop('DB_PASS', None)
        del clave
    _p('esquema completo contra el manifiesto: %s' % ('SI' if completo else 'NO'))
    if faltan:
        _p('objetos que el manifiesto exige y NO existen (%d):' % len(faltan))
        for f in faltan[:60]:
            _p('   FALTA  %s' % f)
        if len(faltan) > 60:
            _p('   … y %d mas' % (len(faltan) - 60))
    _p()

    # Y LA OTRA DIRECCION: lo que la base tiene y el manifiesto no exige.
    # `verificar()` no lo mira --el manifiesto es un MINIMO-- pero para
    # clasificar el estado real de produccion importa: una tabla sobrante
    # cuenta la historia de que se construyo ahi y cuando.
    presente = boot._objetos_presentes(cur)
    esperado = boot._objetos_esperados()
    if esperado:
        # Los MIEMBROS DE EXTENSION van con su extension: listarlos uno a uno
        # seria 30 lineas de ruido tapando lo que importa. Se leen del catalogo
        # (pg_depend, deptype='e'), nunca del nombre.
        cur.execute("""SELECT lower(p.proname), e.extname
                         FROM pg_proc p
                         JOIN pg_depend d ON d.classid='pg_proc'::regclass
                                         AND d.objid=p.oid AND d.deptype='e'
                         JOIN pg_extension e ON e.oid=d.refobjid""")
        de_extension = {}
        for nombre, ext in cur.fetchall():
            de_extension.setdefault(ext, set()).add(nombre)
        todas_ext = set().union(*de_extension.values()) if de_extension else set()

        sobran_total = 0
        for tipo in boot._TIPOS:
            sobran = sorted(presente[tipo] - esperado[tipo])
            if tipo == 'funcion':
                sobran = [x for x in sobran if x not in todas_ext]
            if tipo == 'extension':
                for ext in sobran:
                    _p('   SOBRA  extension   %s (+%d funciones suyas, van con ella)'
                       % (ext, len(de_extension.get(ext, ()))))
                sobran_total += len(sobran)
                continue
            sobran_total += len(sobran)
            for x in sobran[:15]:
                _p('   SOBRA  %-11s %s' % (tipo, x))
            if len(sobran) > 15:
                _p('   … y %d %s mas' % (len(sobran) - 15, boot._PLURAL[tipo]))
        if not sobran_total:
            _p('objetos que sobren respecto al manifiesto: NINGUNO')
    _p()

    # Los tres objetos que deciden la compatibilidad con el codigo viejo/nuevo.
    _p('los tres que deciden la ventana:')
    for tabla, columna in (('folder_permissions', 'sujeto_tipo'),
                           ('folder_permissions', 'sujeto_id'),
                           ('project_users', 'es_admin')):
        cur.execute("SELECT is_nullable FROM information_schema.columns "
                    " WHERE table_name=%s AND column_name=%s", (tabla, columna))
        f = cur.fetchone()
        _p('   %-40s %s' % (tabla + '.' + columna,
                            ('EXISTE (nullable=%s)' % f[0]) if f else 'NO EXISTE'))
    cur.execute("SELECT is_nullable FROM information_schema.columns "
                " WHERE table_name='folder_permissions' AND column_name='user_id'")
    f = cur.fetchone()
    _p('   %-40s %s' % ('folder_permissions.user_id',
                        ('existe (nullable=%s)' % f[0]) if f else 'no existe'))
    _p()

    # ── EL ESTADO, CLASIFICADO ───────────────────────────────────────────
    # El backend que sirve es el que diga /api/health; lo que clasifica esta
    # lectura es EL ESQUEMA. Importa porque esta demostrado que el backend
    # viejo no puede escribir en el modelo nuevo de folder_permissions.
    def _col(tabla, columna):
        cur.execute("SELECT is_nullable FROM information_schema.columns "
                    " WHERE table_name=%s AND column_name=%s", (tabla, columna))
        f = cur.fetchone()
        return None if not f else f[0]          # None = no existe

    st = _col('folder_permissions', 'sujeto_tipo')
    si = _col('folder_permissions', 'sujeto_id')
    ea = _col('project_users', 'es_admin')
    nuevo_completo = (st == 'NO' and si == 'NO' and ea == 'NO' and completo)
    viejo_puro = (st is None and si is None and ea is None)
    _p('── CLASIFICACION DEL ESQUEMA ──')
    if nuevo_completo:
        _p('ESTADO B — ESQUEMA NUEVO (sujetos NOT NULL, es_admin presente,')
        _p('           manifiesto completo). Con el backend viejo sirviendo,')
        _p('           CONCEDER PERMISOS DE CARPETA FALLA desde que se')
        _p('           construyo este esquema: la ventana ya esta abierta.')
    elif viejo_puro:
        _p('ESTADO A — ESQUEMA VIEJO (sin columnas de sujeto ni es_admin).')
        _p('           Coherente con el backend viejo; la migracion entera')
        _p('           esta pendiente y se hace en la ventana.')
    else:
        _p('ESTADO C — PARCIALMENTE MIGRADO:')
        _p('   sujeto_tipo: %s' % ('no existe' if st is None else 'nullable=' + st))
        _p('   sujeto_id  : %s' % ('no existe' if si is None else 'nullable=' + si))
        _p('   es_admin   : %s' % ('no existe' if ea is None else 'nullable=' + ea))
        _p('   Antes de la ventana hay que entender COMO llego aqui.')
    if si == 'NO':
        cur.execute('SELECT count(*) FROM folder_permissions')
        _p('   (folder_permissions tiene %d fila(s) hoy)' % cur.fetchone()[0])
    _p()

    if solo_e1:
        conn.close()
        _guardar('evidencia-e1')
        return 0

    # ── E2 · roles, propiedad, grants (tolerante) ────────────────────────
    _p('── E2 · ROLES / PROPIEDAD / GRANTS ──')
    cur.execute("""SELECT r.esperado,
                          (SELECT count(*) FROM pg_roles p WHERE p.rolname=r.esperado)=1
                     FROM (VALUES ('ecd_app'),('ecd_migrator'),('postgres'))
                          AS r(esperado)""")
    for rol, existe in cur.fetchall():
        _p('rol %-14s existe: %s' % (rol, existe))
    cur.execute("""SELECT rolname, rolsuper, rolcreatedb, rolcreaterole,
                          rolcanlogin, rolbypassrls
                     FROM pg_roles WHERE rolname NOT LIKE 'pg\\_%' ORDER BY 1""")
    _p('atributos (super/createdb/createrole/login/bypassrls):')
    for r in cur.fetchall():
        _p('   %-24s %s %s %s %s %s' % r)
    _p()

    cur.execute("""
        SELECT 'schema' AS clase, pg_get_userbyid(nspowner), count(*)
          FROM pg_namespace WHERE nspname IN ('public','ai_brain') GROUP BY 1,2
        UNION ALL
        SELECT CASE c.relkind WHEN 'S' THEN 'secuencia'
                              WHEN 'i' THEN 'indice' WHEN 'I' THEN 'indice'
                              WHEN 'v' THEN 'vista' WHEN 'm' THEN 'vista mat.'
                              ELSE 'tabla' END,
               pg_get_userbyid(c.relowner), count(*)
          FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
         WHERE n.nspname IN ('public','ai_brain')
           AND c.relkind IN ('r','p','v','m','f','S','i','I') GROUP BY 1,2
        UNION ALL
        SELECT 'funcion', pg_get_userbyid(p.proowner), count(*)
          FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
         WHERE n.nspname IN ('public','ai_brain') GROUP BY 1,2
        ORDER BY 1,2""")
    _p('propiedad por clase:')
    for clase, owner, n in cur.fetchall():
        _p('   %-11s %-24s %4d' % (clase, owner, n))
    _p()

    # Los privilegios que deciden la separacion, uno a uno y tolerantes:
    # `has_*_privilege` sobre un rol inexistente ABORTA la consulta entera,
    # asi que cada uno va tras su comprobacion de existencia.
    def _priv(expr):
        cur.execute("""SELECT CASE WHEN EXISTS
                          (SELECT 1 FROM pg_roles WHERE rolname='ecd_app')
                          THEN %s::text ELSE 'rol inexistente' END""" % expr)
        return cur.fetchone()[0]

    _p('ecd_app CREATE sobre public   : %s'
       % _priv("has_schema_privilege('ecd_app','public','CREATE')"))
    _p('ecd_app CREATE sobre ai_brain : %s'
       % _priv("has_schema_privilege('ecd_app','ai_brain','CREATE')"))
    for tabla in ('activity_log', 'auth_events'):
        for accion in ('UPDATE', 'DELETE'):
            _p('ecd_app %-6s %-12s : %s'
               % (accion, tabla,
                  _priv("has_table_privilege('ecd_app','%s','%s')" % (tabla, accion))))
    cur.execute("""SELECT grantee, privilege_type, count(*)
                     FROM information_schema.table_privileges
                    WHERE grantee IN ('ecd_app','ecd_migrator')
                    GROUP BY 1,2 ORDER BY 1,2""")
    filas = cur.fetchall()
    _p('grants a ecd_app / ecd_migrator: %s'
       % ('NINGUNO' if not filas else ''))
    for g, p_, n in filas:
        _p('   %-14s %-8s %4d' % (g, p_, n))

    conn.close()
    _p()
    _p('── E4 · VARIABLES DE RENDER (rellenar A MANO desde el panel) ──')
    for v in ('DB_USER', 'DDL_EN_CALIENTE', 'ESQUEMA_ESTRICTO',
              'ENFORCE_PROJECT_AUTHZ', 'AUTH_POLICY_MODE', 'DEPLOY_PROFILE',
              'CORS_ORIGINS', 'APP_URL', 'APP_SECRET (solo PRESENTE/AUSENTE)',
              'SESSION_PEPPER (solo PRESENTE/AUSENTE)',
              'DB_PASS (solo PRESENTE/AUSENTE)'):
        _p('   %-42s = ______________' % v)
    _guardar('evidencia-e1-e2')
    return 0


# ── E3 · contra el servicio ──────────────────────────────────────────────

def contra_el_servicio(url):
    import requests
    url = url.rstrip('/')
    correo = input('correo del administrador: ').strip()
    clave = getpass.getpass('contraseña (no se muestra): ')
    r = requests.post(url + '/api/auth/login',
                      json={'email': correo, 'password': clave}, timeout=40)
    del clave
    d = r.json() if r.headers.get('content-type', '').startswith('application/json') else {}
    if r.status_code != 200 and not d.get('requiere_2fa'):
        print('login rechazado (%s): %s' % (r.status_code, d.get('error', '')))
        return 2
    if d.get('requiere_2fa'):
        codigo = input('código del segundo factor: ').strip()
        r = requests.post(url + '/api/auth/2fa/verify',
                          json={'email': correo, 'code': codigo,
                                'pre_token': d.get('pre_token')}, timeout=40)
        d = r.json()
        if r.status_code != 200:
            print('2FA rechazado: %s' % d.get('error', ''))
            return 2
    token = d.get('session_token')
    if not token:
        print('el login no devolvió sesión')
        return 2

    r = requests.get(url + '/api/seguridad/postura',
                     headers={'Authorization': 'Bearer %s' % token}, timeout=40)
    if r.status_code != 200:
        print('postura: %s' % r.status_code)
        return 2
    d = r.json()
    _p('EVIDENCIA E3 · %s · %s'
       % (datetime.datetime.now().strftime('%Y-%m-%d %H:%M'), url))
    _p('resumen: %s' % json.dumps(d.get('resumen', {})))
    _p('detalle:')
    for punto in d.get('detalle', []):
        _p('   %-28s %s' % (punto.get('punto'),
                            'cumple' if punto.get('cumple') else '** FALLA **'))
    # Cerrar la sesion que abrio esta lectura: no se deja una sesion viva.
    try:
        requests.post(url + '/api/auth/logout',
                      headers={'Authorization': 'Bearer %s' % token}, timeout=20)
    except Exception:
        pass
    _guardar('evidencia-e3')
    return 0


if __name__ == '__main__':
    ap = argparse.ArgumentParser(description='Evidencia E1-E3, solo lectura.')
    ap.add_argument('--db-host')
    ap.add_argument('--db-port', default='5432')
    ap.add_argument('--db-name')
    ap.add_argument('--db-user', default='postgres')
    ap.add_argument('--web', help='URL del servicio para E3')
    ap.add_argument('--solo-e1', action='store_true',
                    help='solo el esquema contra el manifiesto; ni roles ni grants')
    a = ap.parse_args()
    if a.web:
        raise SystemExit(contra_el_servicio(a.web))
    if a.db_host and a.db_name:
        raise SystemExit(contra_la_base(a.db_host, a.db_port, a.db_name,
                                        a.db_user, solo_e1=a.solo_e1))
    ap.print_help()
    raise SystemExit(2)
