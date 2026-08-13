"""Copia de seguridad de la base, y su comprobacion.

POR QUE ESTE GUION Y NO pg_dump
-------------------------------
Porque pg_dump no esta instalado en la maquina desde la que se opera, y una copia
que depende de que alguien instale algo el dia de la urgencia no es una copia.
Esto usa COPY de Postgres a traves de psycopg2, que ya es una dependencia de la
aplicacion: funciona en cualquier sitio donde funcione el backend.

Se puede permitir porque en esta plataforma EL ESQUEMA ES CODIGO: lo construye
bootstrap_esquema.py de una pasada. Asi que la copia solo tiene que llevar los
DATOS, y restaurar es: base vacia -> python bootstrap_esquema.py -> cargar los
datos. Menos piezas, menos formas de que falle.

(Antes el esquema lo creaba la aplicacion sola al arrancar. Con
DDL_EN_CALIENTE=false ya no puede, y por eso el bootstrap es un paso explicito.)

LO QUE ESTA COPIA **NO** CUBRE
------------------------------
Hay que decirlo antes que nada, porque una copia en la que confias de mas es peor
que no tenerla:

1. LOS FICHEROS. Los bytes de los planos, las fotos y los modelos viven en Google
   Cloud Storage, no en la base. Esta copia guarda la FICHA de cada documento
   (nombre, version, estado, idoneidad, quien y cuando), pero no el PDF. Para eso
   hace falta copia del bucket aparte.
2. LOS SECRETOS. Sin APP_SECRET no valen los enlaces firmados; sin SESSION_PEPPER
   no valen las sesiones; sin las credenciales de Google no se llega a los
   ficheros. Una base restaurada sin ellos arranca y no sirve. Guardalos donde
   guardas las cosas importantes, NO en el repositorio.
3. EL RADIO DE EXPLOSION. Si esta copia se queda en el mismo proyecto de Google
   que la base, no protege del caso que ya paso una vez: la facturacion en mora
   dejo el almacenamiento inaccesible. La copia tiene que salir de ahi.

    python backend/copia_de_seguridad.py                    # copia + comprobacion
    python backend/copia_de_seguridad.py --destino D:/copias
    python backend/copia_de_seguridad.py --retener 30       # dias que se conservan
"""

import argparse
import gzip
import io
import json
import os
import pathlib
import sys
from datetime import datetime, timezone

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))

# Tablas que NO hace falta copiar: se reconstruyen solas o son de un solo uso.
# Copiarlas engorda la copia y alarga la restauracion sin ganar nada.
PRESCINDIBLES = {
    'upload_sessions',      # subidas a medias; caducan
    'gemelo_ingestion_status',
}

DESTINO_POR_DEFECTO = pathlib.Path(__file__).resolve().parent.parent / 'copias'


def _conexion():
    from dotenv import load_dotenv
    raiz = pathlib.Path(__file__).resolve().parent.parent
    load_dotenv(raiz / '.env')
    from db import get_db_connection
    return get_db_connection()


def tablas(cursor):
    cursor.execute("""
        SELECT table_name FROM information_schema.tables
         WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
         ORDER BY table_name
    """)
    return [t for (t,) in cursor.fetchall() if t not in PRESCINDIBLES]


def _contar(cursor, tabla):
    cursor.execute(f'SELECT count(*) FROM "{tabla}"')
    return cursor.fetchone()[0]


def _secuencias(cursor):
    """Los contadores de los id automaticos. Sin ellos, tras restaurar la primera
    fila nueva choca con una que ya existe."""
    cursor.execute("""
        SELECT sequence_name FROM information_schema.sequences
         WHERE sequence_schema = 'public'
    """)
    valores = {}
    for (nombre,) in cursor.fetchall():
        cursor.execute(f"SELECT last_value FROM \"{nombre}\"")
        valores[nombre] = cursor.fetchone()[0]
    return valores


def copiar(destino=None, retener=30, silencioso=False):
    destino = pathlib.Path(destino or DESTINO_POR_DEFECTO)
    destino.mkdir(parents=True, exist_ok=True)
    marca = datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
    fichero = destino / f'ecd_{marca}.copia.gz'

    def hablar(msg):
        if not silencioso:
            print(msg, flush=True)

    manifiesto = {'creada': datetime.now(timezone.utc).isoformat(),
                  'formato': 'csv-por-tabla-v1', 'tablas': {}}

    with _conexion() as conn:
        cur = conn.cursor()
        lista = tablas(cur)
        manifiesto['secuencias'] = {k: int(v) for k, v in _secuencias(cur).items()}
        hablar(f'Copiando {len(lista)} tablas...')

        with gzip.open(fichero, 'wb') as salida:
            for tabla in lista:
                filas = _contar(cur, tabla)
                manifiesto['tablas'][tabla] = filas
                buf = io.BytesIO()
                cur.copy_expert(
                    f'COPY "{tabla}" TO STDOUT WITH (FORMAT csv, HEADER true)', buf)
                datos = buf.getvalue()
                # Cada tabla va precedida de una cabecera con su nombre y su
                # tamano, para poder leer la copia sin cargarla entera en memoria.
                cabecera = json.dumps({'tabla': tabla, 'bytes': len(datos),
                                       'filas': filas}).encode()
                salida.write(b'--TABLA--' + cabecera + b'\n')
                salida.write(datos)
                if filas:
                    hablar(f'   {tabla:34} {filas:>8} filas')

    (destino / f'ecd_{marca}.manifiesto.json').write_text(
        json.dumps(manifiesto, indent=2, ensure_ascii=False), encoding='utf-8')

    tam = fichero.stat().st_size
    hablar(f'\nCopia: {fichero.name}  ({tam/1024/1024:.1f} MB)')
    return fichero, manifiesto


def comprobar(fichero, manifiesto):
    """Vuelve a leer la copia y cuenta. Una copia sin comprobar no es una copia.

    Comprueba lo que se puede comprobar sin restaurar: que el fichero se abre,
    que estan todas las tablas, y que cada una trae exactamente las filas que
    decia el manifiesto. Si esto pasa, la copia esta completa y es legible.
    """
    vistas, problemas = {}, []
    with gzip.open(fichero, 'rb') as f:
        actual, pendientes = None, 0
        for linea in f:
            if pendientes <= 0 and linea.startswith(b'--TABLA--'):
                cab = json.loads(linea[len(b'--TABLA--'):].decode())
                actual, pendientes = cab['tabla'], cab['bytes']
                vistas[actual] = -1        # la cabecera CSV no cuenta como fila
                continue
            if actual:
                vistas[actual] += 1
            pendientes -= len(linea)

    for tabla, esperadas in manifiesto['tablas'].items():
        leidas = vistas.get(tabla)
        if leidas is None:
            problemas.append(f'{tabla}: no aparece en la copia')
        elif leidas != esperadas:
            problemas.append(f'{tabla}: {leidas} filas en la copia, {esperadas} en la base')
    return problemas


def podar(destino, retener):
    """Borra las copias mas viejas. Retener es en NUMERO de copias, no en dias:
    si el guion no corrio tres dias, no se quiere perder la ultima que hay."""
    destino = pathlib.Path(destino)
    copias = sorted(destino.glob('ecd_*.copia.gz'))
    sobran = copias[:-retener] if retener > 0 else []
    for c in sobran:
        c.unlink(missing_ok=True)
        c.with_name(c.name.replace('.copia.gz', '.manifiesto.json')).unlink(missing_ok=True)
    return len(sobran)


def main():
    p = argparse.ArgumentParser(description='Copia de seguridad de la base del ECD')
    p.add_argument('--destino', default=None, help='carpeta donde dejar la copia')
    p.add_argument('--retener', type=int, default=30, help='cuantas copias conservar')
    args = p.parse_args()

    fichero, manifiesto = copiar(args.destino, args.retener)

    print('\nComprobando la copia...')
    problemas = comprobar(fichero, manifiesto)
    if problemas:
        print('  LA COPIA NO CUADRA:')
        for x in problemas:
            print('   -', x)
        return 1
    total = sum(manifiesto['tablas'].values())
    print(f'  Correcta: {len(manifiesto["tablas"])} tablas, {total} filas, todas cuadran.')

    borradas = podar(args.destino or DESTINO_POR_DEFECTO, args.retener)
    if borradas:
        print(f'  {borradas} copias antiguas retiradas.')

    print('\nRECUERDA: esto NO incluye los ficheros de Google Cloud Storage ni los')
    print('secretos (APP_SECRET, SESSION_PEPPER, credenciales). Y la copia tiene que')
    print('salir del mismo proyecto de Google, o no protege de lo que ya paso una vez.')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
