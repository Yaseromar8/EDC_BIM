"""Restaurar la base del ECD desde una copia. Y probarlo antes de necesitarlo.

Una copia que nunca se ha restaurado no es una copia, es una intencion. Este
guion es la otra mitad de copia_de_seguridad.py, y esta escrito para poder
correrlo EN FRIO, con prisa y con gente esperando.

COMO SE RESTAURA, DE PRINCIPIO A FIN
------------------------------------
1. Crear una base vacia (en Cloud SQL o donde sea).
2. Construir el esquema:  python bootstrap_esquema.py
   (En esta plataforma el esquema es codigo, asi que no hay que restaurar
   esquema, solo datos.)

   OJO: antes bastaba con arrancar el backend una vez, porque la aplicacion
   creaba las tablas sola al arrancar. Desde que existe DDL_EN_CALIENTE=false
   -- que es lo que impide que la aplicacion pueda alterar el esquema en
   caliente -- eso ya NO ocurre, y arrancar contra una base vacia deja la
   restauracion a medias sin decir nada. El bootstrap es ahora el paso
   explicito.
3. Correr este guion contra esa base.
4. Poner los secretos (APP_SECRET, SESSION_PEPPER, credenciales de Google). Sin
   ellos la base restaurada arranca pero no sirve: los enlaces firmados y las
   sesiones dejan de validar.
5. Los FICHEROS (planos, fotos, modelos) no estan aqui: viven en Google Cloud
   Storage y necesitan su propia copia.

    python backend/restaurar.py copias/ecd_2026....copia.gz --base ecd_prueba
    python backend/restaurar.py <copia> --base ecd_prueba --confirmar

EL SEGURO
---------
Por defecto NO escribe: ensena que haria. Y se niega a escribir sobre la base de
produccion salvo que se lo pidas con todas las letras, porque el dia que se use
esto de verdad va a ser un mal dia y las equivocaciones se pagan caras.
"""

import argparse
import gzip
import io
import json
import os
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))


def _entorno():
    from dotenv import load_dotenv
    load_dotenv(pathlib.Path(__file__).resolve().parent.parent / '.env')


def _conectar(base):
    import psycopg2
    return psycopg2.connect(
        host=os.environ.get('DB_HOST'),
        port=os.environ.get('DB_PORT', 5432),
        user=os.environ.get('DB_USER'),
        password=os.environ.get('DB_PASS'),
        dbname=base,
        connect_timeout=20,
    )


def leer_copia(fichero):
    """Devuelve [(tabla, bytes_csv)] leyendo el formato de copia_de_seguridad."""
    bloques = []
    with gzip.open(fichero, 'rb') as f:
        contenido = f.read()
    i = 0
    marca = b'--TABLA--'
    while True:
        j = contenido.find(marca, i)
        if j < 0:
            break
        fin_cab = contenido.find(b'\n', j)
        cab = json.loads(contenido[j + len(marca):fin_cab].decode())
        inicio = fin_cab + 1
        bloques.append((cab['tabla'], contenido[inicio:inicio + cab['bytes']], cab['filas']))
        i = inicio + cab['bytes']
    return bloques


def restaurar(fichero, base, confirmar=False, permitir_produccion=False,
              base_de_produccion=None):
    """Carga una copia en `base`.

    `base_de_produccion` existe porque el guardia de abajo preguntaba «¿la base
    de destino se llama igual que DB_NAME?», y DB_NAME es una variable que
    cualquiera puede haber cambiado por el camino. El ensayo de restauracion la
    apunta a su base desechable para construirle el esquema, asi que al llegar
    aqui el guardia veia destino == DB_NAME y gritaba «es PRODUCCION» sobre una
    base recien creada y vacia. Resultado: el ensayo completo NUNCA llego a
    cargar datos -- y era justo lo que decia demostrar.

    Quien sepa cual es la base de produccion de verdad la pasa por aqui. Quien no
    la pase se sigue midiendo contra DB_NAME, que es lo correcto para la linea de
    ordenes. El guardia no se afloja: se le da la referencia buena.
    """
    _entorno()
    produccion = base_de_produccion or os.environ.get('DB_NAME')
    if base == produccion and not permitir_produccion:
        raise SystemExit(
            f"NEGADO: '{base}' es la base de PRODUCCION.\n"
            f"Si de verdad quieres sobrescribirla, pasa --sobre-produccion.")

    bloques = leer_copia(fichero)
    manifiesto = pathlib.Path(str(fichero).replace('.copia.gz', '.manifiesto.json'))
    secuencias = {}
    if manifiesto.exists():
        secuencias = json.loads(manifiesto.read_text(encoding='utf-8')).get('secuencias', {})

    print(f"Copia : {pathlib.Path(fichero).name}")
    print(f"Base   : {base}" + ("  (PRODUCCION)" if base == produccion else ""))
    print(f"Tablas : {len(bloques)}")
    if not confirmar:
        print("\nEN SECO. Nada se ha escrito. Anade --confirmar para restaurar de verdad.")
        for t, _d, n in bloques[:10]:
            print(f"   {t:34} {n:>8} filas")
        print("   ...")
        return 0

    conn = _conectar(base)
    conn.autocommit = False
    cur = conn.cursor()

    # Las claves ajenas obligarian a cargar en un orden concreto, y hay tablas
    # que se referencian a si mismas (una carpeta dentro de otra carpeta), donde
    # ni siquiera hay un orden posible dentro del mismo fichero.
    #
    # Lo habitual es desactivar los disparadores con session_replication_role,
    # pero Cloud SQL no lo permite a un usuario normal. Asi que se quitan las
    # claves ajenas, se carga, y se vuelven a poner. Tiene una ventaja: si al
    # devolverlas alguna no entra, es que los datos no son consistentes, y eso es
    # justo lo que hay que saber ANTES de necesitar la copia de verdad.
    cur.execute("""
        SELECT conrelid::regclass::text, conname, pg_get_constraintdef(oid)
          FROM pg_constraint WHERE contype = 'f'
           AND connamespace = 'public'::regnamespace
    """)
    ajenas = cur.fetchall()
    for tabla, nombre, _def in ajenas:
        cur.execute(f'ALTER TABLE {tabla} DROP CONSTRAINT "{nombre}"')
    if ajenas:
        print(f"   ({len(ajenas)} claves ajenas retiradas durante la carga)")

    existentes = set()
    cur.execute("""SELECT table_name FROM information_schema.tables
                    WHERE table_schema='public' AND table_type='BASE TABLE'""")
    for (t,) in cur.fetchall():
        existentes.add(t)

    def columnas_de(tabla):
        cur.execute("""SELECT column_name FROM information_schema.columns
                        WHERE table_schema='public' AND table_name=%s""", (tabla,))
        return {c for (c,) in cur.fetchall()}

    cargadas, saltadas, desajustadas = 0, [], []
    en_cuarentena = {}                # tabla -> filas apartadas, anunciadas
    for tabla, datos, filas in bloques:
        if tabla not in existentes:
            # Falta la tabla: la crea la aplicacion al arrancar. Se avisa en vez
            # de reventar, para no perder el resto de la restauracion.
            saltadas.append(tabla)
            continue

        # Se carga POR NOMBRE DE COLUMNA, no por posicion. La base de produccion
        # fue creciendo con ALTER TABLE ADD COLUMN, que anade al final, mientras
        # que la aplicacion las crea en el orden de su CREATE TABLE: los ordenes
        # NO coinciden. Cargando por posicion, una fecha acaba en una columna de
        # JSON y la restauracion revienta -- o peor, no revienta y los datos
        # quedan cambiados de sitio.
        cabecera = datos.split(b'\n', 1)[0].decode('utf-8', 'replace').strip()
        nombres = [c.strip().strip('"') for c in cabecera.split(',')] if cabecera else []
        aqui = columnas_de(tabla)
        sobran = [c for c in nombres if c not in aqui]
        if sobran:
            # La copia trae columnas que esta base no tiene: cargarla dejaria
            # datos fuera en silencio, que es peor que no cargarla.
            desajustadas.append(f"{tabla}: la copia trae columnas que no existen aqui "
                                f"({', '.join(sobran[:4])})")
            continue

        cur.execute(f'TRUNCATE TABLE "{tabla}" CASCADE')
        if datos.strip() and nombres:
            if tabla == 'folder_permissions' and 'sujeto_id' not in nombres:
                # COPIA DEL MODELO ANTERIOR DE PERMISOS. El esquema nuevo exige
                # `sujeto_id NOT NULL` y estas filas no lo traen, asi que el
                # COPY las rechaza EN LA INSERCION -- no hay un «despues» donde
                # arreglarlo. Lo encontro el ensayo de restauracion el
                # 21-ago-2026, que para eso existe.
                #
                # Se les aplica LA MISMA migracion que aplico el producto
                # (`folder_permissions.py`): «lo que ya habia es, por
                # definicion, de tipo USER», y su sujeto es su `user_id`. No se
                # adivina nada -- es la regla ya escrita, aplicada al mismo
                # dato por otro camino de entrada. Y se aplica AL FLUJO: las
                # dos columnas se añaden a cada fila antes de que toque la
                # base.
                import csv as _csv
                entrada = io.StringIO(datos.decode('utf-8'))
                salida = io.StringIO()
                lector = _csv.reader(entrada)
                escritor = _csv.writer(salida, lineterminator='\n')
                idx_user = nombres.index('user_id') if 'user_id' in nombres else None
                for i, fila in enumerate(lector):
                    if i == 0:
                        escritor.writerow(fila + ['sujeto_tipo', 'sujeto_id'])
                        continue
                    u = fila[idx_user] if idx_user is not None else ''
                    if not u:
                        # Una concesion vieja SIN usuario no tiene a quien
                        # apuntar. No se inventa un sujeto: se deja fuera y se
                        # dice, igual que el aviso de la migracion en vivo.
                        print('   (folder_permissions: fila sin user_id, '
                              'no se carga: %s)' % fila[:3])
                        continue
                    escritor.writerow(fila + ['USER', u])
                datos = salida.getvalue().encode('utf-8')
                nombres = nombres + ['sujeto_tipo', 'sujeto_id']
            if (tabla in ('pdf_markups', 'pdf_calibrations')
                    and 'file_node_id' in nombres):
                # COPIA DEL MODELO INTEGER. La misma regla que la migracion en
                # vivo (`routes/pdf_tools.py`): solo convierte lo que ES un
                # UUID; lo demas no se adivina y no se borra -- va a CUARENTENA
                # al lado de la copia, y se dice.
                import csv as _csv
                import re as _re
                _es_uuid = _re.compile(r'^[0-9a-fA-F-]{36}$')
                idx = nombres.index('file_node_id')
                entrada = io.StringIO(datos.decode('utf-8'))
                salida, rebeldes = io.StringIO(), []
                lector = _csv.reader(entrada)
                escritor = _csv.writer(salida, lineterminator='\n')
                for i, fila in enumerate(lector):
                    if i == 0 or _es_uuid.match(fila[idx] or ''):
                        escritor.writerow(fila)
                    else:
                        rebeldes.append(fila)
                if rebeldes:
                    cuarentena = pathlib.Path(fichero).with_suffix(
                        '.cuarentena-%s.csv' % tabla)
                    with open(cuarentena, 'w', encoding='utf-8', newline='') as f:
                        _csv.writer(f).writerows(rebeldes)
                    print('   AVISO %s: %d fila(s) con file_node_id que no es '
                          'UUID. NO se cargan y NO se borran: quedan en %s '
                          'hasta que una persona decida.'
                          % (tabla, len(rebeldes), cuarentena.name))
                    en_cuarentena[tabla] = len(rebeldes)
                    datos = salida.getvalue().encode('utf-8')

            lista = ', '.join(f'"{c}"' for c in nombres)
            # CADA TABLA BAJO SU SAVEPOINT. Si una revienta, se anota y las
            # demas entran: el dia de la urgencia, 88 tablas restauradas y una
            # señalada valen mas que cero.
            cur.execute('SAVEPOINT tabla')
            try:
                cur.copy_expert(
                    f'COPY "{tabla}" ({lista}) FROM STDIN WITH (FORMAT csv, HEADER true)',
                    io.BytesIO(datos))
                cur.execute('RELEASE SAVEPOINT tabla')
            except Exception as e:
                cur.execute('ROLLBACK TO SAVEPOINT tabla')
                desajustadas.append('%s: %s' % (tabla, str(e).split(chr(10))[0][:90]))
                continue
        cargadas += 1
        print(f"   {tabla:34} {filas:>8} filas")

    # Los contadores de id automaticos, o la primera fila nueva choca con una vieja.
    for nombre, valor in secuencias.items():
        # Cada uno con su punto de retorno: sin esto, el primer contador que no
        # existe en el destino aborta la transaccion entera y se pierde toda la
        # restauracion por un detalle que no importa.
        try:
            cur.execute("SAVEPOINT sq")
            cur.execute(f"SELECT setval('\"{nombre}\"', %s, true)", (valor,))
            cur.execute("RELEASE SAVEPOINT sq")
        except Exception as e:
            cur.execute("ROLLBACK TO SAVEPOINT sq")
            print(f"   (contador {nombre}: {str(e)[:70]})")

    # Devolver las claves ajenas. Si alguna no entra, los datos restaurados no son
    # consistentes y hay que enterarse ahora, no el dia de la urgencia.
    incoherentes = []
    for tabla, nombre, definicion in ajenas:
        try:
            cur.execute("SAVEPOINT fk")
            cur.execute(f'ALTER TABLE {tabla} ADD CONSTRAINT "{nombre}" {definicion}')
            cur.execute("RELEASE SAVEPOINT fk")
        except Exception as e:
            cur.execute("ROLLBACK TO SAVEPOINT fk")
            incoherentes.append(f"{tabla}.{nombre}: {str(e)[:100]}")
    conn.commit()
    if incoherentes:
        print(f"\n  {len(incoherentes)} relaciones no se pudieron devolver (datos incoherentes):")
        for x in incoherentes[:8]:
            print("   -", x)

    print(f"\nComprobando lo restaurado...")
    fallos = []
    saltadas_todas = set(saltadas) | {d.split(':')[0] for d in desajustadas}
    for tabla, _d, esperadas in bloques:
        if tabla in saltadas_todas:
            continue
        cur.execute(f'SELECT count(*) FROM "{tabla}"')
        hay = cur.fetchone()[0]
        # Las filas EN CUARENTENA no son perdida silenciosa: estan apartadas en
        # un fichero, anunciadas, y esperando una decision humana. Se descuentan
        # de lo esperado y se dicen aparte.
        apartadas = en_cuarentena.get(tabla, 0)
        if hay != esperadas - apartadas:
            fallos.append(f"{tabla}: {hay} restauradas, {esperadas} en la copia"
                          + (f" ({apartadas} en cuarentena)" if apartadas else ""))
        elif apartadas:
            print(f"   {tabla}: {hay} restauradas + {apartadas} en cuarentena "
                  f"(decisión pendiente, ver el .cuarentena-*.csv)")
    conn.close()

    if saltadas:
        print(f"  {len(saltadas)} tablas no existian en el destino (arranca el backend "
              f"una vez y vuelve a correr): {', '.join(saltadas[:6])}"
              + ('...' if len(saltadas) > 6 else ''))
    if desajustadas:
        print(f"  {len(desajustadas)} tablas NO se cargaron por desajuste de columnas:")
        for x in desajustadas:
            print("   -", x)
    if fallos:
        print("  NO CUADRA:")
        for f in fallos:
            print("   -", f)
        return 1
    print(f"  Correcto: {cargadas} tablas restauradas y todas cuadran.")
    print("\nFalta todavia: los secretos (APP_SECRET, SESSION_PEPPER, credenciales de")
    print("Google) y los ficheros del bucket. Sin eso, esta base arranca pero no sirve.")
    return 0


def main():
    p = argparse.ArgumentParser(description='Restaurar la base del ECD desde una copia')
    p.add_argument('copia')
    p.add_argument('--base', required=True, help='base de datos destino')
    p.add_argument('--confirmar', action='store_true', help='escribir de verdad')
    p.add_argument('--sobre-produccion', action='store_true',
                   help='permitir que el destino sea la base de produccion')
    a = p.parse_args()
    return restaurar(a.copia, a.base, a.confirmar, a.sobre_produccion)


if __name__ == '__main__':
    raise SystemExit(main())
