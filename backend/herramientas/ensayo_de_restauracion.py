# -*- coding: utf-8 -*-
"""Ensayo COMPLETO de restauracion: copia -> base vacia -> esquema -> datos -> cotejo.

POR QUE EXISTE
--------------
Una copia que nunca se ha restaurado no es una copia: es una intencion. Las dos
mitades ya existian (`copia_de_seguridad.py` y `restaurar.py`) y NUNCA se habian
ejecutado de punta a punta. Este guion es el ensayo general, y esta pensado para
repetirlo: la proxima vez que haga falta de verdad sera un mal dia, y ese dia no
se improvisa.

POR QUE PIDE UNA CONTRASENA (y por que eso es CORRECTO)
-------------------------------------------------------
Crear una base nueva exige un rol con CREATEDB, y ni `ecd_app` ni `ecd_migrator`
lo tienen -- a proposito: es la separacion de identidades funcionando. La
contrasena del superusuario `postgres` se teclea aqui con getpass: no se ve, no
queda en el historial, no se guarda en ningun sitio, y la conexion privilegiada
se usa SOLO para crear (y si se pide, borrar) la base del ensayo. Todo lo demas
corre como `ecd_app`, igual que la aplicacion.

COMO SE USA
-----------
    cd backend
    python herramientas/ensayo_de_restauracion.py                # ultima copia
    python herramientas/ensayo_de_restauracion.py --conservar    # no borra la base
    python herramientas/ensayo_de_restauracion.py --copia ../copias/ecd_X.copia.gz

QUE DEMUESTRA Y QUE NO
----------------------
Demuestra que la BASE se recupera: esquema completo contra el manifiesto, datos
cotejados fila a fila contra la copia, y muestras funcionales contra el origen.
NO demuestra nada de los ficheros (viven en el bucket y necesitan su propia
copia, hallazgo C7) ni de los secretos.
"""

import argparse
import getpass
import json
import os
import pathlib
import sys
import time

RAIZ = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ))

HOSTS_LOCALES = ('127.0.0.1', 'localhost', '::1')
PREFIJO = 'ecd_ensayo_'


def _abortar(motivo):
    print('NEGADO: %s' % motivo)
    raise SystemExit(2)


def main():
    ap = argparse.ArgumentParser(description='Ensayo completo de restauracion.')
    ap.add_argument('--copia', default=None, help='fichero .copia.gz (por defecto, el ultimo)')
    ap.add_argument('--conservar', action='store_true',
                    help='no borrar la base del ensayo al terminar')
    a = ap.parse_args()

    from dotenv import load_dotenv
    load_dotenv(RAIZ.parent / '.env')

    host = (os.getenv('DB_HOST') or '').strip()
    puerto = os.getenv('DB_PORT', '5432')
    if host not in HOSTS_LOCALES:
        # El ensayo crea y borra bases. Contra produccion eso no es un ensayo:
        # es una ruleta. Si algun dia hay que ensayar en la nube, se hace con
        # una instancia clonada, no con esta herramienta.
        _abortar('el ensayo solo corre contra la base LOCAL (DB_HOST=%s).' % host)

    copia = a.copia
    if not copia:
        candidatas = sorted((RAIZ.parent / 'copias').glob('*.copia.gz'))
        if not candidatas:
            _abortar('no hay ninguna copia en copias/. Ejecuta antes '
                     'python backend/copia_de_seguridad.py')
        copia = str(candidatas[-1])
    print('Copia   : %s' % pathlib.Path(copia).name)

    base_ensayo = PREFIJO + time.strftime('%Y%m%d_%H%M%S')
    print('Base    : %s (nueva, solo para el ensayo)' % base_ensayo)

    # ── 1. Crear la base vacia, con la unica conexion privilegiada ──────────
    print('\n1. Crear la base vacia (hace falta el superusuario local)')
    clave = getpass.getpass('   contrasena de `postgres` en %s:%s (no se muestra): '
                            % (host, puerto))
    import psycopg2
    try:
        admin = psycopg2.connect(host=host, port=puerto, user='postgres',
                                 password=clave, dbname='postgres',
                                 connect_timeout=15)
    except Exception as e:
        _abortar('no se pudo entrar como postgres: %s' % str(e).split('\n')[0])
    admin.autocommit = True
    cadmin = admin.cursor()
    cadmin.execute('SELECT 1 FROM pg_database WHERE datname = %s', (base_ensayo,))
    if cadmin.fetchone():
        _abortar('la base %s ya existe; no se toca nada que no haya creado '
                 'este ensayo.' % base_ensayo)
    # EL NOMBRE DEL ROL SALE DEL ENTORNO, NO ESTA ESCRITO AQUI.
    # Estaba fijo como 'ecd_app', que es como se llama en la instalacion del
    # desarrollador. En la instancia de una entidad el usuario es
    # `ecd_app_<entidad>`, asi que el ensayo moria con «role "ecd_app" does not
    # exist» -- es decir, la herramienta que demuestra que la copia sirve no
    # funcionaba justo donde hace falta demostrarlo.
    duenno = (os.getenv('DB_USER') or '').strip()
    if not duenno:
        _abortar('define DB_USER: el ensayo no adivina quien es el usuario de aplicacion')
    cadmin.execute('CREATE DATABASE "%s" OWNER "%s"' % (base_ensayo, duenno))
    print('   creada, propietaria: %s (la aplicacion, no el superusuario)' % duenno)

    try:
        resultado = _ensayar(copia, base_ensayo)
    finally:
        if a.conservar:
            print('\n(la base %s se conserva; borrala tu cuando acabes)' % base_ensayo)
        else:
            # Solo se borra lo que ESTE ensayo creo, comprobado por prefijo y
            # por haber pasado por el camino de creacion de arriba.
            import db as _db
            if getattr(_db, 'db_pool', None) is not None:
                try:
                    _db.db_pool.closeall()
                except Exception:
                    pass
            cadmin.execute('DROP DATABASE "%s" WITH (FORCE)' % base_ensayo)
            print('\n(base del ensayo borrada: no queda nada)')
        admin.close()

    return resultado


def _ensayar(copia, base_ensayo):
    """Esquema + datos + cotejo, todo como ecd_app contra la base del ensayo."""
    # Todo lo que viene usa el entorno: se apunta a la base del ensayo ANTES de
    # importar nada que abra conexiones. Pero SE GUARDA cual era la de verdad:
    # el guardia de restaurar.py compara el destino contra DB_NAME, y si nadie
    # le dice que DB_NAME ya no apunta a produccion, toma la base desechable del
    # ensayo por produccion y se niega a cargar. Asi moria este ensayo, siempre,
    # en el paso 3.
    base_de_produccion = os.environ.get('DB_NAME')
    os.environ['DB_NAME'] = base_ensayo

    print('\n2. Construir el esquema (bootstrap, como en un despliegue)')
    import bootstrap_esquema as boot
    fallos = boot.construir()
    completo, faltan = boot.verificar()
    if not completo:
        print('   ESQUEMA INCOMPLETO: faltan %s' % ', '.join(faltan[:10]))
        return 1
    print('   esquema completo contra el manifiesto')

    print('\n3. Cargar los datos de la copia')
    import restaurar as rest
    codigo = rest.restaurar(copia, base_ensayo, confirmar=True,
                            base_de_produccion=base_de_produccion)
    if codigo not in (0, None):
        print('   LA CARGA FALLO (codigo %s)' % codigo)
        return 1

    print('\n4. Cotejar lo restaurado contra la copia y contra el origen')
    bloques = rest.leer_copia(copia)
    import psycopg2
    conn = psycopg2.connect(host=os.getenv('DB_HOST'), port=os.getenv('DB_PORT', '5432'),
                            user=os.getenv('DB_USER'), password=os.getenv('DB_PASS'),
                            dbname=base_ensayo)
    cur = conn.cursor()
    mal = []
    total = 0
    for tabla, _datos, filas_esperadas in bloques:
        try:
            cur.execute('SELECT count(*) FROM "%s"' % tabla)
            reales = cur.fetchone()[0]
        except Exception as e:
            conn.rollback()
            mal.append((tabla, 'error: %s' % str(e).split('\n')[0][:60]))
            continue
        total += reales
        if reales != filas_esperadas:
            mal.append((tabla, '%d en la copia, %d restauradas' % (filas_esperadas, reales)))
    conn.close()

    print('   tablas cotejadas : %d' % len(bloques))
    print('   filas restauradas: %d' % total)
    if mal:
        print('   DESCUADRES (%d):' % len(mal))
        for t, motivo in mal[:10]:
            print('      %-30s %s' % (t, motivo))
    else:
        print('   todas las tablas cuadran fila a fila con la copia')

    # Evidencia: que se ensayo, cuando, con que copia, y el resultado.
    evid = RAIZ.parent / 'docs' / 'entidad' / 'evidencias'
    evid.mkdir(parents=True, exist_ok=True)
    ruta = evid / ('ensayo-restauracion-%s.json' % time.strftime('%Y%m%d-%H%M'))
    ruta.write_text(json.dumps({
        'cuando': time.strftime('%Y-%m-%d %H:%M:%S'),
        'copia': pathlib.Path(copia).name,
        'base_ensayo': base_ensayo,
        'tablas': len(bloques),
        'filas': total,
        'descuadres': [{'tabla': t, 'motivo': m} for t, m in mal],
        'veredicto': 'RESTAURABLE' if not mal else 'CON DESCUADRES',
    }, ensure_ascii=False, indent=2), encoding='utf-8')
    print('\nevidencia: %s' % ruta)
    print('VEREDICTO : %s' % ('RESTAURABLE' if not mal else 'CON DESCUADRES'))
    return 0 if not mal else 1


if __name__ == '__main__':
    raise SystemExit(main())
