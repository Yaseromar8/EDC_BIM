# -*- coding: utf-8 -*-
"""Comprueba --y si hace falta repara-- una base RESTAURADA desde una copia.

PARA QUE SIRVE, Y POR QUE NO BASTA CON ARREGLAR EL VERIFICADOR
--------------------------------------------------------------
El acto P1 del 8-sep-2026 midio esto: una copia de produccion restaurada con
`pg_dump | pg_restore` es fiel --mismos datos, mismas reglas, cotejado tabla a
tabla-- y aun asi `bootstrap_esquema.py --verificar` la rechazaba, porque el
viaje de ida y vuelta reescribe la forma deparseada de algunos CHECK sin cambiar
lo que significan. Como `start` es `--verificar && gunicorn`, el servicio NO
levantaba sobre su propia copia.

El verificador ya esta corregido (`canonico_sql.py`), y con el codigo nuevo una
restauracion pasa. **Pero eso no arregla la vuelta atras.** Si la recuperacion
consiste en volver al baseline `3e413cd`, el codigo que corre es el ANTIGUO, con
el verificador antiguo, que compara texto exacto y volveria a rechazarla. Fiarse
de que el candidato nuevo lleva el verificador arreglado seria declarar
recuperabilidad sobre una condicion que precisamente no se cumple cuando hace
falta recuperar.

De ahi esta herramienta. Hace dos cosas, y la segunda es la que importa para el
rollback:

    --verificar   dice que restricciones estan, cuales son equivalentes pese a
                  escribirse distinto, y cuales FALTAN de verdad. Solo lectura.

    --reparar     reescribe en la base restaurada las restricciones que son
                  equivalentes pero no identicas, hasta que su texto vuelve a
                  ser EXACTAMENTE el del manifiesto. Con eso, un verificador
                  antiguo --el del baseline, sin tocar-- tambien pasa.

COMO REPARA, Y POR QUE NO SE FIA DE SI MISMA
--------------------------------------------
No reconstruye la DDL desde el manifiesto: el manifiesto esta en minusculas y
usarlo cambiaria los literales ('FOLDER' pasaria a 'folder'). Reconstruye desde
la restriccion REAL de la base, que tiene los literales buenos, y solo le cambia
la FORMA: `= ANY (ARRAY[...])` vuelve a escribirse `IN (...)`, que es la escritura
de la que salio la forma original. Medido sobre PostgreSQL 18: `IN` con literales
desnudos reproduce exactamente la forma de produccion; el texto deparseado no.

Y despues de reescribir, COMPRUEBA que el texto resultante es identico al del
manifiesto. Si no lo es, deshace esa restriccion y lo dice. No hay reparacion a
ciegas: o queda igual que el manifiesto, o no se toca.

No hay lista de restricciones concretas en ningun sitio. La transformacion es
una regla general sobre la forma, y su unico criterio de aceptacion es el cotejo
posterior.

KIT DE RECUPERACION -- SON DOS FICHEROS, NO UNO
-----------------------------------------------
Esta herramienta necesita `canonico_sql.py`, que vive en `backend/`. Si se lleva
a una recuperacion, van los dos:

    backend/canonico_sql.py
    backend/herramientas/verificar_restauracion.py

y el manifiesto contra el que se quiera comprobar --normalmente el
`esquema_objetos.txt` de la version que se va a levantar, que NO tiene por que
ser la actual--. Se dice aqui para que no sea una sorpresa el dia que haga falta.

USO
---
    python herramientas/verificar_restauracion.py --host 127.0.0.1 --port 5433 \\
        --dbname copia --user ecd_migrator [--manifiesto ruta/esquema_objetos.txt]
    ... y para reparar, lo mismo con --reparar

La clave se toma de PGPASSWORD o de --clave-fichero. Nunca se imprime.
NO se ejecuta contra produccion: la herramienta se niega si no se le pasa
--acepto-escribir junto con --reparar, y reparar exige ser dueno de la tabla.
"""
import argparse
import io
import os
import sys

import psycopg2

_AQUI = os.path.dirname(os.path.abspath(__file__))
_BACKEND = os.path.dirname(_AQUI)
if _BACKEND not in sys.path:
    sys.path.insert(0, _BACKEND)
try:
    from canonico_sql import canonico, fichas
except ImportError:
    sys.exit('FALTA canonico_sql.py: el kit son DOS ficheros, no uno.\n'
             '  backend/canonico_sql.py\n'
             '  backend/herramientas/verificar_restauracion.py')

CONSULTA = """SELECT c.conrelid::regclass::text, c.conname,
                     pg_get_constraintdef(c.oid), c.contype
                FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
               WHERE n.nspname IN ('public','ai_brain')"""


def manifiesto(ruta):
    """Las restricciones que el codigo de destino espera, en minusculas."""
    esperadas = set()
    for linea in io.open(ruta, encoding='utf-8'):
        linea = linea.strip()
        if not linea or linea.startswith('#'):
            continue
        partes = linea.split('\t', 1)
        if len(partes) == 2 and partes[0] == 'restriccion':
            esperadas.add(partes[1].strip().lower())
    return esperadas


def _a_in(definicion):
    """`... = ANY (ARRAY[a, b])` reescrito como `... IN (a, b)`, sobre la forma
    canonica --sin casts ni parentesis sobrantes-- y conservando los literales
    tal cual estan en la base."""
    entrada = fichas(canonico(definicion))
    salida, i, n, tocado = [], 0, len(entrada), False
    while i < n:
        if (entrada[i].lower() == 'any' and i + 2 < n and entrada[i + 1] == '('
                and entrada[i + 2].lower() == 'array' and i + 3 < n
                and entrada[i + 3] == '['):
            cierra_corchete = _cierre(entrada, i + 3, '[', ']')
            cierra_paren = _cierre(entrada, i + 1, '(', ')')
            if cierra_corchete is not None and cierra_paren == cierra_corchete + 1:
                if salida and salida[-1] == '=':
                    salida.pop()
                    salida.append('in')
                    salida.append('(')
                    salida.extend(entrada[i + 4:cierra_corchete])
                    salida.append(')')
                    i = cierra_paren + 1
                    tocado = True
                    continue
        salida.append(entrada[i])
        i += 1
    return (' '.join(salida) if tocado else None)


def _cierre(entrada, inicio, abre, cierra):
    profundidad = 0
    for i in range(inicio, len(entrada)):
        if entrada[i] == abre:
            profundidad += 1
        elif entrada[i] == cierra:
            profundidad -= 1
            if profundidad == 0:
                return i
    return None


def _cuerpo(definicion):
    """`CHECK (X)` -> `X`, conservando los parentesis internos."""
    texto = definicion.strip()
    if not texto.upper().startswith('CHECK ('):
        return None
    texto = texto[len('CHECK ('):]
    sufijo = ''
    if texto.upper().endswith('NOT VALID'):
        texto, sufijo = texto[:-len('NOT VALID')].rstrip(), ' NOT VALID'
    if not texto.endswith(')'):
        return None
    return texto[:-1], sufijo


def revisar(cur, esperadas):
    cur.execute(CONSULTA)
    presentes = [(t, n, d, c) for t, n, d, c in cur.fetchall()]
    por_forma = {}
    exactas = set()
    for tabla, nombre, definicion, tipo in presentes:
        linea = ('%s %s' % (tabla, definicion)).lower()
        exactas.add(linea)
        por_forma.setdefault(canonico(linea), []).append(
            (tabla, nombre, definicion, tipo))

    iguales, equivalentes, ausentes = [], [], []
    for esperada in sorted(esperadas):
        if esperada in exactas:
            iguales.append(esperada)
        elif canonico(esperada) in por_forma:
            equivalentes.append((esperada, por_forma[canonico(esperada)]))
        else:
            ausentes.append(esperada)
    return iguales, equivalentes, ausentes


def reparar(conn, equivalentes):
    """Devuelve (reparadas, no_reparadas). Cada una en su savepoint."""
    reparadas, fallidas = [], []
    cur = conn.cursor()
    for esperada, candidatas in equivalentes:
        tabla, nombre, definicion, tipo = candidatas[0]
        if tipo != b'c' and tipo != 'c':
            fallidas.append((esperada, 'no es un CHECK, no se reescribe'))
            continue
        partido = _cuerpo(definicion)
        if not partido:
            fallidas.append((esperada, 'no se reconoce la forma CHECK (...)'))
            continue
        cuerpo, sufijo = partido
        intentos = [c for c in (_a_in(cuerpo), cuerpo) if c]
        logrado = None
        for intento in intentos:
            cur.execute('SAVEPOINT reparacion')
            try:
                cur.execute('ALTER TABLE %s DROP CONSTRAINT "%s"' % (tabla, nombre))
                cur.execute('ALTER TABLE %s ADD CONSTRAINT "%s" CHECK (%s)%s'
                            % (tabla, nombre, intento, sufijo))
                cur.execute("SELECT c.conrelid::regclass::text || ' ' || "
                            "pg_get_constraintdef(c.oid) FROM pg_constraint c "
                            "WHERE c.conname = %s", (nombre,))
                ahora = cur.fetchone()[0].lower()
            except Exception as e:
                cur.execute('ROLLBACK TO SAVEPOINT reparacion')
                fallidas.append((esperada, str(e).splitlines()[0][:120]))
                break
            if ahora == esperada:
                cur.execute('RELEASE SAVEPOINT reparacion')
                logrado = intento
                break
            cur.execute('ROLLBACK TO SAVEPOINT reparacion')
        if logrado:
            reparadas.append((tabla, nombre))
        elif not any(e[0] == esperada for e in fallidas):
            fallidas.append((esperada, 'ninguna escritura reprodujo el manifiesto'))
    return reparadas, fallidas


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument('--host', required=True)
    ap.add_argument('--port', type=int, required=True)
    ap.add_argument('--dbname', required=True)
    ap.add_argument('--user', required=True)
    ap.add_argument('--clave-fichero', help='fichero con la clave; no se imprime')
    ap.add_argument('--manifiesto',
                    default=os.path.join(_BACKEND, 'esquema_objetos.txt'))
    ap.add_argument('--reparar', action='store_true')
    ap.add_argument('--acepto-escribir', action='store_true',
                    help='obligatorio junto con --reparar')
    a = ap.parse_args()

    if a.reparar and not a.acepto_escribir:
        sys.exit('--reparar escribe en la base: exige tambien --acepto-escribir.')
    clave = (io.open(a.clave_fichero, encoding='utf-8').read().strip()
             if a.clave_fichero else os.environ.get('PGPASSWORD'))
    if not clave:
        sys.exit('Sin clave: usa PGPASSWORD o --clave-fichero. No se pide por pantalla.')

    conn = psycopg2.connect(host=a.host, port=a.port, dbname=a.dbname,
                            user=a.user, password=clave, connect_timeout=30)
    conn.autocommit = False
    cur = conn.cursor()
    cur.execute('SET LOCAL search_path TO public,pg_catalog,pg_temp')
    esperadas = manifiesto(a.manifiesto)
    iguales, equivalentes, ausentes = revisar(cur, esperadas)

    print('manifiesto            : %s' % a.manifiesto)
    print('restricciones exigidas: %d' % len(esperadas))
    print('  identicas           : %d' % len(iguales))
    print('  equivalentes        : %d  (mismo significado, otra escritura)' % len(equivalentes))
    print('  AUSENTES            : %d' % len(ausentes))
    for e in ausentes[:20]:
        print('     ·', e[:150])
    for esperada, _ in equivalentes[:20]:
        print('     ~', esperada[:150])

    if not a.reparar:
        conn.rollback()
        conn.close()
        if ausentes:
            print('\nFALTAN RESTRICCIONES: no es una diferencia de escritura.')
            return 1
        print('\nEsquema de restricciones COMPLETO'
              '%s.' % (' (con %d equivalencias)' % len(equivalentes) if equivalentes else ''))
        if equivalentes:
            print('Un verificador que compare texto exacto --el del baseline--'
                  ' seguira rechazandola.\nPara que la acepte: --reparar --acepto-escribir.')
        return 0

    if ausentes:
        conn.rollback()
        conn.close()
        print('\nNo se repara nada: faltan restricciones de verdad. Eso no se'
              ' arregla reescribiendo.')
        return 1
    reparadas, fallidas = reparar(conn, equivalentes)
    if fallidas:
        conn.rollback()
        conn.close()
        print('\nNO SE CONFIRMA NADA. Sin reparar:')
        for esperada, motivo in fallidas[:20]:
            print('   ·', motivo, '::', esperada[:100])
        return 1
    conn.commit()
    cur = conn.cursor()
    iguales, equivalentes, ausentes = revisar(cur, esperadas)
    conn.rollback()
    conn.close()
    print('\nreparadas             : %d' % len(reparadas))
    for tabla, nombre in reparadas:
        print('   ·', tabla, nombre)
    print('cotejo posterior      : identicas %d · equivalentes %d · ausentes %d'
          % (len(iguales), len(equivalentes), len(ausentes)))
    if equivalentes or ausentes:
        print('\nQUEDAN DIFERENCIAS. No se declara compatible.')
        return 1
    print('\nTODAS coinciden LITERALMENTE con el manifiesto: un verificador que'
          ' compare texto exacto ya la acepta.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
