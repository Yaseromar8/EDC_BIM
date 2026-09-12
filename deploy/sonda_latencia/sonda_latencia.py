# -*- coding: utf-8 -*-
"""SONDA DE LATENCIA · TEMPORAL · GATE 05.2

PARA QUE EXISTE
---------------
Una sola pregunta: cuanto tarda el viaje de ida y vuelta hasta PostgreSQL desde
una region de Render, y cuanto desde otra. GATE 04 midio `SELECT current_user`
--una consulta que no lee ninguna tabla-- en 54,7 ms desde Oregon, contra una
instancia de Cloud SQL en Virginia. Esto comprueba si esa cifra es la distancia
o es otra cosa.

POR QUE NO ES ALEPHIA RECORTADO
-------------------------------
Porque un recorte se puede equivocar. Arrancar el backend ejecuta ~40 rutinas
de esquema en el import, y tres de ellas no respetan la variable que las
apagaria. Un programa que no importa nada del repositorio no puede ejecutarlas:
el aislamiento es una propiedad del fichero, comprobable leyendolo entero, no
una configuracion que pueda estar mal puesta.

LO QUE HACE, COMPLETO
---------------------
Abre UNA conexion, mide la apertura fisica, lanza un `SELECT current_user` de
calentamiento que descarta, mide diez mas sobre esa misma conexion ya abierta, y
la cierra. Devuelve milisegundos. No hay una segunda sentencia en el fichero.

LO QUE NO HACE
--------------
No importa `server.py`, ni `db.py`, ni ningun modulo de ALEPHIA. No crea pool.
No escribe: ni INSERT, ni UPDATE, ni DELETE, ni DDL, ni commit. No abre
ficheros. No registra peticiones. No toca documentos, ni APS, ni almacenamiento.

Las credenciales llegan por entorno y no salen por ninguna parte: la respuesta
lleva numeros y una etiqueta de region. Nada mas.

SE DESTRUYE AL TERMINAR LA MEDICION.
"""
import json
import os
import statistics
import time
from http.server import BaseHTTPRequestHandler, HTTPServer

import psycopg2

# La ruta no adivinable la decide quien despliega. Es oscuridad, no una
# credencial: protege de un rastreador que pase por ahi, no de alguien
# decidido. Para un servicio que vive diez minutos y cuya unica capacidad es
# preguntar quien soy, es proporcionado.
RUTA = '/' + os.environ['RUTA_SECRETA']

# LA UNICA SENTENCIA DEL PROGRAMA. No lee ninguna tabla, no toca ningun indice,
# no planifica nada: devuelve un nombre. Por eso mide el viaje y no el trabajo.
CONSULTA = 'SELECT current_user'

MUESTRAS = 10


def medir():
    inicio = time.perf_counter()
    conn = psycopg2.connect(
        user=os.environ['DB_USER'],
        password=os.environ['DB_PASS'],
        host=os.environ['DB_HOST'],
        port=os.environ.get('DB_PORT', '5432'),
        dbname=os.environ['DB_NAME'],
        connect_timeout=10,
        # Las mismas opciones que produccion: no cambian la latencia, pero
        # mantienen la comparacion honesta.
        options='-c statement_timeout=30000 -c lock_timeout=5000',
        keepalives=1, keepalives_idle=30, keepalives_interval=10, keepalives_count=3,
    )
    apertura = (time.perf_counter() - inicio) * 1000.0
    try:
        # Sin transacciones: no hay nada que confirmar ni que deshacer.
        conn.autocommit = True
        cur = conn.cursor()

        cur.execute(CONSULTA)          # calentamiento, se descarta
        cur.fetchone()

        tiempos = []
        for _ in range(MUESTRAS):
            t = time.perf_counter()
            cur.execute(CONSULTA)
            cur.fetchone()
            tiempos.append((time.perf_counter() - t) * 1000.0)
        cur.close()
    finally:
        conn.close()

    ordenados = sorted(tiempos)
    return {
        'region_etiqueta': os.environ.get('REGION_ETIQUETA', 'sin-etiqueta'),
        'apertura_fisica_ms': round(apertura, 1),
        'muestras_ms': [round(x, 2) for x in tiempos],
        'n': len(tiempos),
        'min': round(ordenados[0], 2),
        'mediana': round(statistics.median(ordenados), 2),
        'max': round(ordenados[-1], 2),
    }


class Manejador(BaseHTTPRequestHandler):

    def do_GET(self):
        if self.path != RUTA:
            self.send_response(404)
            self.end_headers()
            return
        try:
            cuerpo = json.dumps(medir()).encode('utf-8')
            codigo = 200
        except Exception as e:
            # El tipo de error, nunca el mensaje: un fallo de conexion puede
            # llevar el host dentro, y esto sale por HTTP.
            cuerpo = json.dumps({'error': type(e).__name__}).encode('utf-8')
            codigo = 500
        self.send_response(codigo)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(cuerpo)))
        self.end_headers()
        self.wfile.write(cuerpo)

    def log_message(self, *args):
        return                          # no se registra ninguna peticion


if __name__ == '__main__':
    puerto = int(os.environ.get('PORT', '10000'))
    HTTPServer(('0.0.0.0', puerto), Manejador).serve_forever()
