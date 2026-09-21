# -*- coding: utf-8 -*-
"""SERVIDOR DE MOSAICOS EN LOCAL (paso B de docs/archivos/15) -- NO ES PRODUCCION.

Hace en local, con los PDF de una carpeta, las tres cosas que en produccion hara
el backend contra el almacen:

  1. PREPARAR una lamina: los niveles de arriba (z0 y z1) al pedirse por primera
     vez su manifiesto -- lo que en produccion pasara al subirla.
  2. LA TESELA A DEMANDA: la primera vez que se pide una tesela que no esta (los
     niveles profundos), se dibuja en ese momento, se guarda y se sirve.
  3. PONERSE AL DIA con los que ya estan subidos: `--ponerse-al-dia` prepara todas
     las laminas de la carpeta, las mas pesadas primero, y dice cuanto costo.

El «almacen» es una carpeta con la MISMA forma que tendra en el almacen real
(`<lamina>/mosaico.json`, `<lamina>/z<z>/<x>_<y>.webp`), asi que lo que se mide
aqui vale para alla. No toca GCS, ni la base de datos, ni Render.

    backend/venv/Scripts/python.exe backend/herramientas/servidor_mosaicos_local.py \\
        --pdf frontend-docs/public/_probar --almacen <carpeta> --puerto 5190

    ... --ponerse-al-dia            (prepara todas y sale)

    ... --backend https://visor-ecd-backend-va.onrender.com
        ademas, el PUENTE: la ruta /api/docs/mosaico de produccion para los
        documentos REALES del portal en local (ver `Puente`).
"""
import argparse
import hashlib
import json
import os
import re
import shutil
import sys
import threading
import time
import urllib.error
import urllib.request
from collections import OrderedDict
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import unquote, urlencode, urlparse

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

import mosaicos                                      # noqa: E402

NOMBRE_VALIDO = re.compile(r'^[A-Za-z0-9._@ ()-]+$')

# ── LOS DIBUJANTES: VARIOS PROCESOS ─────────────────────────────────────────
# Medido el 20-sep-2026: cada tesela a demanda son 150-250 ms de dibujo, pero de
# una en una la sexta esperaba a las cinco anteriores (393 -> 1.246 ms) y un
# acercon en frio tardaba 2,7 s en ponerse nitido. PyMuPDF no dibuja en paralelo
# dentro de un mismo proceso, asi que se reparten entre procesos; cada uno guarda
# sus laminas abiertas (con su display list) para no reinterpretarlas.
_DIBUJANTE = {}


def _dibujar_en_proceso(ruta_pdf, man, z, x, y):
    par = _DIBUJANTE.get(ruta_pdf)
    if par is None:
        motor = mosaicos._motor()
        doc = motor.open(ruta_pdf)
        par = (doc, doc.load_page(0).get_displaylist())
        if len(_DIBUJANTE) >= 4:                      # las ultimas cuatro laminas
            viejo = next(iter(_DIBUJANTE))
            try:
                _DIBUJANTE.pop(viejo)[0].close()
            except Exception:
                pass
        _DIBUJANTE[ruta_pdf] = par
    return mosaicos.tesela_a_demanda(par[1], man, z, x, y)
RUTA_TESELA = re.compile(r'^/mosaico/([^/]+)/z(\d+)/(\d+)_(\d+)\.webp$')
RUTA_MANIFIESTO = re.compile(r'^/mosaico/([^/]+)/mosaico\.json$')


class Almacen:
    """Las laminas: su PDF de origen, su carpeta de teselas y un candado cada una."""

    def __init__(self, carpeta_pdf, carpeta_almacen, abiertas=4, dibujantes=4):
        from concurrent.futures import ProcessPoolExecutor
        self.grupo = ProcessPoolExecutor(max_workers=dibujantes) if dibujantes > 1 else None
        self._en_marcha = {}                          # (lamina, z, x, y) -> futuro
        self.pdf = os.path.abspath(carpeta_pdf)
        self.almacen = os.path.abspath(carpeta_almacen)
        os.makedirs(self.almacen, exist_ok=True)
        # Los PDF de los documentos REALES que baja el puente (ver `Puente`).
        self.remotos = os.path.join(self.almacen, '_pdf')
        os.makedirs(self.remotos, exist_ok=True)
        self._candados = {}
        self._candado_global = threading.Lock()
        # Documentos abiertos (PyMuPDF), los ultimos usados: abrir el de 72 MB
        # cuesta ~50 ms, pero su foto aerea tarda en decodificarse la primera
        # vez, y conviene no repetirlo en cada tesela.
        self._abiertos = OrderedDict()
        self._max_abiertos = abiertas
        self.cuentas = {'preparadas': 0, 'a_demanda': 0, 'del_almacen': 0}

    def candado(self, nombre):
        with self._candado_global:
            if nombre not in self._candados:
                self._candados[nombre] = threading.Lock()
            return self._candados[nombre]

    def ruta_pdf(self, nombre):
        if not NOMBRE_VALIDO.match(nombre):
            return None
        for carpeta in (self.pdf, self.remotos):
            ruta = os.path.join(carpeta, nombre + '.pdf')
            if os.path.isfile(ruta):
                return ruta
        return None

    def carpeta(self, nombre):
        return os.path.join(self.almacen, nombre)

    def _documento(self, nombre):
        """(doc, pagina) abiertos, reutilizados. Llamar con el candado de la lamina."""
        if nombre in self._abiertos:
            self._abiertos.move_to_end(nombre)
            return self._abiertos[nombre]
        motor = mosaicos._motor()
        doc = motor.open(self.ruta_pdf(nombre))
        # La «display list»: la hoja interpretada una vez; cada tesela solo se pinta.
        par = (doc, doc.load_page(0).get_displaylist())
        self._abiertos[nombre] = par
        while len(self._abiertos) > self._max_abiertos:
            _, (viejo, _p) = self._abiertos.popitem(last=False)
            try:
                viejo.close()
            except Exception:
                pass
        return par

    def manifiesto(self, nombre):
        """El manifiesto; si la lamina no esta preparada, se prepara (z0 y z1)."""
        ruta_man = os.path.join(self.carpeta(nombre), 'mosaico.json')
        if os.path.isfile(ruta_man):
            with open(ruta_man, encoding='utf-8') as f:
                return json.load(f), 'almacen'
        with self.candado(nombre):
            if os.path.isfile(ruta_man):                       # otro hilo la preparo
                with open(ruta_man, encoding='utf-8') as f:
                    return json.load(f), 'almacen'
            man, resumen = mosaicos.preparar(self.ruta_pdf(nombre), mosaicos.escritor_de_disco(self.carpeta(nombre)))
            # El manifiesto, DESPUES de las teselas (ver `mosaicos.preparar`).
            with open(ruta_man, 'w', encoding='utf-8') as f:
                json.dump(man, f)
            self.cuentas['preparadas'] += 1
            print('[preparada] %s: %d teselas, %d KB, %d ms' % (nombre, resumen['teselas'], resumen['bytes'] // 1024, resumen['ms']), flush=True)
            return man, 'preparada'

    def tesela(self, nombre, z, x, y):
        """(bytes, origen) de la tesela; la dibuja si no esta. None si no existe."""
        ruta = os.path.join(self.carpeta(nombre), 'z%d' % z, '%d_%d.webp' % (x, y))
        if os.path.isfile(ruta):
            self.cuentas['del_almacen'] += 1
            with open(ruta, 'rb') as f:
                return f.read(), 'almacen'
        man, _ = self.manifiesto(nombre)
        if self.grupo is None:                        # sin procesos: de una en una
            with self.candado(nombre):
                if os.path.isfile(ruta):
                    with open(ruta, 'rb') as f:
                        return f.read(), 'almacen'
                _doc, pagina = self._documento(nombre)
                datos = mosaicos.tesela_a_demanda(pagina, man, z, x, y)
        else:
            clave = (nombre, z, x, y)
            with self._candado_global:
                futuro = self._en_marcha.get(clave)
                if futuro is None:
                    futuro = self.grupo.submit(_dibujar_en_proceso, self.ruta_pdf(nombre), man, z, x, y)
                    self._en_marcha[clave] = futuro
            try:
                datos = futuro.result()
            finally:
                with self._candado_global:
                    self._en_marcha.pop(clave, None)
            if os.path.isfile(ruta):                  # otra peticion ya la guardo
                with open(ruta, 'rb') as f:
                    return f.read(), 'almacen'
        if datos is None:
            return None, None
        os.makedirs(os.path.dirname(ruta), exist_ok=True)
        with open(ruta, 'wb') as f:
            f.write(datos)
        self.cuentas['a_demanda'] += 1
        return datos, 'a demanda'


class Puente:
    """LA RUTA /api/docs/mosaico DE PRODUCCION, EN LOCAL, PARA LOS DOCUMENTOS REALES.

    Para ver el portal de verdad (su sesion, sus laminas) con el lector nuevo
    ANTES de desplegar: el `vite preview` del portal en local reenvia /api a
    produccion, pero esta ruta alli todavia no existe; la resuelve este puente.

      - LA PUERTA ES LA DE PRODUCCION. Para cada documento que se abre pregunta
        a produccion la URL del PDF (/api/docs/signed-url, la misma que usa el
        lector), reenviando la cabecera Authorization del navegador tal cual: si
        produccion dice que no, aqui tampoco. Ni la cabecera ni la URL firmada
        se guardan en disco ni se escriben en el registro.
      - Baja el PDF y prepara el mosaico EN SEGUNDO PLANO: la primera vez
        contesta `pendiente`, como produccion con una lamina sin preparar, y el
        lector vuelve a mirar. Despues, las teselas salen de aqui.
      - En produccion no se escribe nada.
    """

    MAX_PDF = 120 * 1024 * 1024           # el mismo tope que en produccion

    def __init__(self, backend, almacen, puerto):
        self.backend = backend.rstrip('/')
        self.almacen = almacen
        self.base = 'http://127.0.0.1:%d/mosaico' % puerto
        self._vistos = {}                 # (node_id, version_id) -> clave, tras pasar la puerta
        self._preparando = set()
        self._candado = threading.Lock()

    def _url_del_pdf(self, node_id, version_id, autorizacion):
        """(200, url) o (codigo, cuerpo) tal como lo contesta produccion."""
        consulta = {'id': node_id}
        if version_id:
            consulta['version_id'] = version_id
        peticion = urllib.request.Request(self.backend + '/api/docs/signed-url?' + urlencode(consulta))
        if autorizacion:
            peticion.add_header('Authorization', autorizacion)
        try:
            with urllib.request.urlopen(peticion, timeout=30) as r:
                return 200, (json.loads(r.read().decode('utf-8')) or {}).get('url')
        except urllib.error.HTTPError as e:
            return e.code, e.read()
        except Exception:
            return 503, json.dumps({'success': False, 'error': 'Produccion no contesta'}).encode()

    def _preparar(self, clave, url):
        try:
            destino = os.path.join(self.almacen.remotos, clave + '.pdf')
            if not os.path.isfile(destino):
                t0 = time.perf_counter()
                parte = destino + '.parte'
                with urllib.request.urlopen(url, timeout=900) as r:
                    if int(r.headers.get('Content-Length') or 0) > self.MAX_PDF:
                        print('[puente] %s pasa de 120 MB: sin mosaico, como en produccion' % clave, flush=True)
                        return
                    with open(parte, 'wb') as f:
                        shutil.copyfileobj(r, f, 1024 * 1024)
                os.replace(parte, destino)
                print('[puente] PDF %s bajado: %.1f MB en %.1f s'
                      % (clave, os.path.getsize(destino) / 1048576, time.perf_counter() - t0), flush=True)
            self.almacen.manifiesto(clave)
        except Exception as e:
            # Solo el tipo del error: su texto podria llevar la direccion firmada.
            print('[puente] no se pudo preparar %s: %s' % (clave, type(e).__name__), flush=True)
        finally:
            with self._candado:
                self._preparando.discard(clave)

    def _manifiesto(self, clave):
        ruta = os.path.join(self.almacen.carpeta(clave), 'mosaico.json')
        if not os.path.isfile(ruta):
            return None
        with open(ruta, encoding='utf-8') as f:
            return json.load(f)

    def atender(self, cuerpo, autorizacion):
        """(codigo, dict | bytes): el contrato de POST /api/docs/mosaico."""
        node_id = str(cuerpo.get('node_id') or '').strip()
        version_id = str(cuerpo.get('version_id') or '').strip()
        if not node_id and not version_id:
            return 400, {'success': False, 'error': 'Falta el documento'}
        documento, z = (node_id, version_id), cuerpo.get('z')
        url_pdf = None
        with self._candado:
            clave = self._vistos.get(documento) if z is not None else None
        if clave is None:
            # Cada apertura pasa por la puerta de produccion.
            codigo, respuesta = self._url_del_pdf(node_id, version_id, autorizacion)
            if codigo != 200:
                return codigo, respuesta
            if not respuesta:
                return 404, {'success': False, 'error': 'Documento no encontrado'}
            ruta = urlparse(respuesta).path          # unica por version
            if not ruta.lower().endswith(('.pdf', '.pdfx')):
                return 200, {'success': True, 'manifiesto': None, 'urls': {}, 'pendiente': False}
            clave = hashlib.sha1(ruta.encode('utf-8')).hexdigest()[:20]
            url_pdf = respuesta
            with self._candado:
                self._vistos[documento] = clave
        man = self._manifiesto(clave)
        if man is None:
            if url_pdf:
                with self._candado:
                    nueva = clave not in self._preparando
                    self._preparando.add(clave)
                if nueva:
                    threading.Thread(target=self._preparar, args=(clave, url_pdf), daemon=True).start()
                    print('[puente] %s: se prepara (primera vez)' % clave, flush=True)
            return 200, {'success': True, 'manifiesto': None, 'urls': {}, 'pendiente': True}

        def url(zz, x, y):
            return '%s/%s/z%d/%d_%d.webp' % (self.base, clave, zz, x, y)
        if z is None:
            # Como el servidor real: con el manifiesto, las URL de los niveles
            # preparados que caben ENTEROS en 64 teselas (z0 y z1).
            urls, cuantas = {}, 0
            for zz in sorted(man.get('preparados') or []):
                n = man['niveles'][zz]
                if cuantas + n['columnas'] * n['filas'] > 64:
                    break
                cuantas += n['columnas'] * n['filas']
                for y in range(n['filas']):
                    for x in range(n['columnas']):
                        urls['%d/%d_%d' % (zz, x, y)] = url(zz, x, y)
            return 200, {'success': True, 'manifiesto': man, 'urls': urls, 'pendiente': False}
        try:
            z = int(z)
        except (TypeError, ValueError):
            return 400, {'success': False, 'error': 'Nivel inexistente'}
        if not (0 <= z < len(man['niveles'])):
            return 400, {'success': False, 'error': 'Nivel inexistente'}
        n, urls = man['niveles'][z], {}
        for par in (cuerpo.get('teselas') or [])[:64]:
            try:
                x, y = int(par[0]), int(par[1])
            except (TypeError, ValueError, IndexError):
                continue
            if 0 <= x < n['columnas'] and 0 <= y < n['filas']:
                # Las profundas se dibujan al pedirlas (GET de la tesela).
                urls['%d/%d_%d' % (z, x, y)] = url(z, x, y)
        return 200, {'success': True, 'urls': urls, 'pendiente': False}


def crear_manejador(almacen, puente=None):
    class Manejador(BaseHTTPRequestHandler):
        protocol_version = 'HTTP/1.1'

        def log_message(self, *a):          # el registro lo hacemos nosotros, mas corto
            return

        def _responder(self, codigo, datos, tipo, cache, origen=''):
            self.send_response(codigo)
            self.send_header('Content-Type', tipo)
            self.send_header('Content-Length', str(len(datos)))
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Cache-Control', cache)
            if origen:
                self.send_header('X-Mosaico-Origen', origen)
            self.end_headers()
            self.wfile.write(datos)

        def do_OPTIONS(self):
            self.send_response(204)
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
            self.send_header('Content-Length', '0')
            self.end_headers()

        def do_POST(self):
            ruta = urlparse(self.path).path
            if ruta != '/api/docs/mosaico' or puente is None:
                return self._responder(404, b'', 'text/plain', 'no-store')
            t0 = time.perf_counter()
            try:
                largo = min(int(self.headers.get('Content-Length') or 0), 1 << 20)
                cuerpo = json.loads(self.rfile.read(largo).decode('utf-8') or '{}')
            except Exception:
                return self._responder(400, b'{"success": false}', 'application/json', 'no-store')
            if not isinstance(cuerpo, dict):
                cuerpo = {}
            codigo, respuesta = puente.atender(cuerpo, self.headers.get('Authorization'))
            datos = respuesta if isinstance(respuesta, bytes) else json.dumps(respuesta).encode()
            que = 'abrir' if cuerpo.get('z') is None else 'teselas z%s' % cuerpo.get('z')
            if codigo != 200:
                estado = codigo
            else:
                estado = 'pendiente' if b'"pendiente": true' in datos else 'ok'
            print('[puente] %s %s -> %s %.0f ms' % (que, str(cuerpo.get('node_id') or '')[:8], estado,
                                                   (time.perf_counter() - t0) * 1000), flush=True)
            return self._responder(codigo, datos, 'application/json', 'no-store')

        def do_GET(self):
            t0 = time.perf_counter()
            ruta = unquote(urlparse(self.path).path)      # sin la marca `?frio=`
            if ruta == '/estado':
                return self._responder(200, json.dumps(almacen.cuentas).encode(), 'application/json', 'no-store')
            m = RUTA_MANIFIESTO.match(ruta)
            if m:
                nombre = m.group(1)
                if not almacen.ruta_pdf(nombre):
                    return self._responder(404, b'{}', 'application/json', 'no-store')
                man, origen = almacen.manifiesto(nombre)
                print('[manifiesto] %s (%s) %.0f ms' % (nombre, origen, (time.perf_counter() - t0) * 1000), flush=True)
                return self._responder(200, json.dumps(man).encode(), 'application/json', 'max-age=60', origen)
            m = RUTA_TESELA.match(ruta)
            if m:
                nombre, z, x, y = m.group(1), int(m.group(2)), int(m.group(3)), int(m.group(4))
                if not almacen.ruta_pdf(nombre):
                    return self._responder(404, b'', 'text/plain', 'no-store')
                datos, origen = almacen.tesela(nombre, z, x, y)
                if datos is None:
                    return self._responder(404, b'', 'text/plain', 'no-store')
                if origen != 'almacen':
                    print('[tesela] %s z%d %d_%d (%s) %.0f ms, %d KB' % (nombre, z, x, y, origen, (time.perf_counter() - t0) * 1000, len(datos) // 1024), flush=True)
                # Cada lamina es una version con nombre propio: su tesela no cambia nunca.
                return self._responder(200, datos, 'image/webp', 'public, max-age=31536000, immutable', origen)
            return self._responder(404, b'', 'text/plain', 'no-store')

    return Manejador


def ponerse_al_dia(almacen):
    """Prepara (z0 y z1) todas las laminas de la carpeta, las mas pesadas primero."""
    nombres = [f[:-4] for f in os.listdir(almacen.pdf) if f.lower().endswith('.pdf')]
    nombres.sort(key=lambda n: -os.path.getsize(os.path.join(almacen.pdf, n + '.pdf')))
    print('%-46s %9s %8s %8s %8s' % ('lamina', 'PDF', 'teselas', 'peso', 'tiempo'))
    t0 = time.perf_counter()
    total_bytes = total_teselas = hechas = 0
    for nombre in nombres:
        ruta_man = os.path.join(almacen.carpeta(nombre), 'mosaico.json')
        pdf_mb = os.path.getsize(os.path.join(almacen.pdf, nombre + '.pdf')) / 1048576
        if os.path.isfile(ruta_man):
            print('%-46s %7.1f MB %8s %8s %8s' % (nombre[:46], pdf_mb, '-', '-', 'ya estaba'))
            continue
        try:
            man, r = mosaicos.preparar(os.path.join(almacen.pdf, nombre + '.pdf'),
                                       mosaicos.escritor_de_disco(almacen.carpeta(nombre)))
            with open(ruta_man, 'w', encoding='utf-8') as f:
                json.dump(man, f)
            hechas += 1
            total_bytes += r['bytes']
            total_teselas += r['teselas']
            print('%-46s %7.1f MB %8d %6d KB %6.1f s' % (nombre[:46], pdf_mb, r['teselas'], r['bytes'] // 1024, r['ms'] / 1000), flush=True)
        except Exception as e:                    # una lamina rota no para las demas
            print('%-46s %7.1f MB  FALLO: %s' % (nombre[:46], pdf_mb, str(e)[:80]), flush=True)
    s = time.perf_counter() - t0
    print('\n%d laminas preparadas, %d teselas, %.1f MB, %.1f s (%.1f s por lamina)'
          % (hechas, total_teselas, total_bytes / 1048576, s, s / max(1, hechas)))


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--pdf', required=True, help='carpeta con los PDF (el nombre sin .pdf es la lamina)')
    ap.add_argument('--almacen', required=True, help='carpeta donde se guardan las teselas')
    ap.add_argument('--puerto', type=int, default=5190)
    ap.add_argument('--dibujantes', type=int, default=4, help='procesos que dibujan teselas a demanda')
    ap.add_argument('--ponerse-al-dia', action='store_true', help='preparar todas las laminas y salir')
    ap.add_argument('--backend', help='backend de produccion para el PUENTE (https://...)')
    args = ap.parse_args()
    if args.backend and not re.match(r'^https://[a-z0-9.-]+$', args.backend, re.I):
        ap.error('--backend tiene que ser https://<servidor>')
    almacen = Almacen(args.pdf, args.almacen, dibujantes=1 if args.ponerse_al_dia else args.dibujantes)
    if args.ponerse_al_dia:
        return ponerse_al_dia(almacen)
    puente = Puente(args.backend, almacen, args.puerto) if args.backend else None
    servidor = ThreadingHTTPServer(('127.0.0.1', args.puerto), crear_manejador(almacen, puente))
    print('Mosaicos en http://127.0.0.1:%d  (PDF: %s · almacen: %s)' % (args.puerto, almacen.pdf, almacen.almacen), flush=True)
    if puente:
        print('Puente /api/docs/mosaico -> la puerta de %s' % puente.backend, flush=True)
    servidor.serve_forever()


if __name__ == '__main__':
    main()
