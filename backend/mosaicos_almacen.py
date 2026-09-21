# -*- coding: utf-8 -*-
"""LOS MOSAICOS DE UNA LAMINA, EN EL ALMACEN (paso B de docs/archivos/15).

`mosaicos.py` sabe DIBUJAR teselas; este modulo sabe donde viven y cuando se
hacen:

  · AL SUBIR un PDF (y en la puesta al dia de los ya subidos) se preparan los
    niveles de arriba --la hoja entera y los dos primeros acercamientos, ver
    mosaicos.NIVELES_AL_PREPARAR--: `preparar(blob)`.
  · Los niveles profundos se dibujan A DEMANDA, tesela a tesela, la primera vez
    que alguien acerca esa zona, y se guardan para siempre:
    `asegurar_teselas(blob, man, z, lista)`.

Las teselas viven junto a su PDF y cuelgan de su nombre, que es unico por
version (`multi-tenant/{obra}/{tiempo}_{uuid8}_{fichero}`):

    <blob>__mosaico/mosaico.json          el manifiesto (se sube el ULTIMO)
    <blob>__mosaico/z<z>/<x>_<y>.webp     cada tesela

Asi una version nueva tiene su propio mosaico sin migrar nada, y una tesela no
cambia nunca: el navegador la puede conservar.

LO QUE CUIDA ESTE MODULO, porque el servidor es pequeño (1 CPU, 2 GB, un solo
proceso) y ya se cayo por memoria rasterizando miniaturas (28-ago-2026):
  · el PDF se baja a DISCO, nunca a memoria, y cada tesela se dibuja con
    recorte (512x512, 0,8 MB), nunca la hoja entera;
  · a demanda se dibujan como mucho `DIBUJOS_A_LA_VEZ` laminas a la vez, y cada
    lamina tiene su candado (PyMuPDF no dibuja en paralelo sobre un documento);
  · una lamina abierta para dibujar ocupa memoria --medido el 20-sep-2026: la de
    71,9 MB, 90 MB; una corriente, 33 MB--, asi que se tienen abiertas como
    mucho `LAMINAS_ABIERTAS`, y nunca se cierra una que se este usando;
  · los PDF bajados para dibujar a demanda se guardan en una cache de disco con
    tope (`CACHE_PDF_BYTES`), los mas usados. La cache es DE CADA PROCESO y se
    vacia al arrancar: el servidor se recicla cada ~300 peticiones, y una cache
    que sobreviviera sin nadie que la llevara llenaria el disco;
  · las teselas se suben al almacen a la vez y fuera del candado: con una ida y
    vuelta por tesela, en serie, la subida pesaba mas que el dibujo.
"""
import hashlib
import json
import os
import shutil
import tempfile
import threading
from collections import OrderedDict
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager

import mosaicos

SUFIJO = '__mosaico'
MAX_ORIGEN = 120 * 1024 * 1024        # como las miniaturas: por encima, no se rasteriza
DIBUJOS_A_LA_VEZ = 2                  # laminas dibujando a demanda a la vez, en todo el proceso
CACHE_PDF_BYTES = 400 * 1024 * 1024   # PDF guardados en disco para dibujar a demanda
LAMINAS_ABIERTAS = 2                  # documentos abiertos (con su display list): ~90 MB la pesada
MAX_TESELAS_POR_PETICION = 64
# Con el manifiesto van las URL de los niveles preparados que caben ENTEROS en
# este tope: z0 y z1 (un A1: 9 + 30), lo del primer gesto. Las de z2 (108) se
# piden al llegar a el, sin dibujar nada; asi la respuesta de abrir no carga
# cien firmas que quiza nadie use.
MAX_TESELAS_PREPARADAS = 64

_SUBIDAS = ThreadPoolExecutor(max_workers=8, thread_name_prefix='mosaico-subida')


def carpeta(blob):
    return blob + SUFIJO


def nombre_manifiesto(blob):
    return carpeta(blob) + '/mosaico.json'


def nombre_tesela(blob, z, x, y):
    return '%s/z%d/%d_%d.webp' % (carpeta(blob), int(z), int(x), int(y))


def _bucket():
    from gcs_manager import get_storage_client
    return get_storage_client().bucket(os.environ.get('GCS_BUCKET_NAME'))


def _subir(bucket, nombre, datos, tipo, inmutable):
    from gcs_manager import CACHE_INMUTABLE
    destino = bucket.blob(nombre)
    if inmutable:
        destino.cache_control = CACHE_INMUTABLE
    destino.upload_from_string(datos, content_type=tipo)


def leer_manifiesto(blob):
    """El manifiesto de esa version, o None si todavia no esta preparada."""
    from google.cloud.exceptions import NotFound
    try:
        return json.loads(_bucket().blob(nombre_manifiesto(blob)).download_as_text())
    except NotFound:
        return None


def _bajar_a_disco(bucket, blob, destino):
    """Baja el PDF a `destino`. False si no existe o pasa del tope."""
    from google.cloud.exceptions import NotFound
    origen = bucket.blob(blob)
    try:
        origen.reload()
    except NotFound:
        return False
    if (origen.size or 0) > MAX_ORIGEN:
        print('[mosaico] %s pesa %s: sin mosaico' % (blob, origen.size))
        return False
    with open(destino, 'wb') as f:
        origen.download_to_file(f)
    return True


def preparar(blob):
    """Prepara los niveles de arriba de esa version. True si quedo lista.

    Idempotente: si el manifiesto ya esta, no hace nada. El manifiesto se sube
    el ULTIMO, y solo si subieron todas las teselas: un corte a medias no deja
    uno que prometa teselas que no estan (y la siguiente llamada lo reintenta
    entero).
    """
    from gcs_manager import nombre_inmutable
    if not str(blob).lower().endswith(('.pdf', '.pdfx')):
        return False
    if leer_manifiesto(blob) is not None:
        return True
    bucket = _bucket()
    inmutable = nombre_inmutable(blob)
    ruta = None
    subidas = []
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix='.pdf') as t:
            ruta = t.name
        if not _bajar_a_disco(bucket, blob, ruta):
            return False

        # Cada tesela se sube mientras se dibuja la siguiente.
        def escribir(z, x, y, datos):
            subidas.append(_SUBIDAS.submit(_subir, bucket, nombre_tesela(blob, z, x, y),
                                           datos, 'image/webp', inmutable))

        man, resumen = mosaicos.preparar(ruta, escribir)
        for s in subidas:
            s.result()          # si una fallo, salta aqui y NO se sube el manifiesto
        _subir(bucket, nombre_manifiesto(blob), json.dumps(man).encode('utf-8'),
               'application/json', False)
        print('[mosaico] %s: %d teselas, %d KB, %d ms'
              % (blob, resumen['teselas'], resumen['bytes'] // 1024, resumen['ms']))
        return True
    except Exception as e:
        print('[mosaico] no se pudo preparar %s: %s' % (blob, str(e)[:160]))
        return False
    finally:
        for s in subidas:
            s.cancel()
        if ruta:
            try:
                os.unlink(ruta)
            except Exception:
                pass


# ── A DEMANDA ────────────────────────────────────────────────────────────────

class _Laminas:
    """PDF en disco (con tope) y documentos abiertos (los ultimos usados)."""

    def __init__(self):
        self.carpeta = os.path.join(tempfile.gettempdir(), 'alephia-mosaicos')
        # Vacia al arrancar: lo que dejo el proceso anterior no lo lleva nadie.
        shutil.rmtree(self.carpeta, ignore_errors=True)
        os.makedirs(self.carpeta, exist_ok=True)
        self._pdf = OrderedDict()         # blob -> (ruta, bytes)
        self._abiertas = OrderedDict()    # blob -> (doc, display list)
        self._en_uso = {}                 # blob -> hilos dibujando con ella ahora
        self._candados = {}
        self._candado = threading.Lock()
        self.dibujando = threading.BoundedSemaphore(DIBUJOS_A_LA_VEZ)

    def candado(self, blob):
        with self._candado:
            if blob not in self._candados:
                self._candados[blob] = threading.Lock()
            return self._candados[blob]

    def _ruta_pdf(self, bucket, blob):
        with self._candado:
            if blob in self._pdf:
                self._pdf.move_to_end(blob)
                return self._pdf[blob][0]
        # Nombre ESTABLE (`hash()` cambia en cada proceso) y la descarga a un
        # fichero aparte: uno cortado a medias nunca pasa por bueno.
        ruta = os.path.join(self.carpeta, hashlib.sha1(blob.encode('utf-8')).hexdigest()[:24] + '.pdf')
        if not os.path.isfile(ruta):
            parte = ruta + '.parte'
            if not _bajar_a_disco(bucket, blob, parte):
                return None
            os.replace(parte, ruta)
        tam = os.path.getsize(ruta)
        with self._candado:
            self._pdf[blob] = (ruta, tam)
            # Fuera los PDF menos usados. Solo se borra el fichero: un documento
            # que lo tenga abierto sigue valiendo (en Linux el fichero vive
            # hasta que se cierra), y se cerrara cuando salga de `_abiertas`.
            while sum(t for _r, t in self._pdf.values()) > CACHE_PDF_BYTES and len(self._pdf) > 1:
                _viejo, (r, _t) = self._pdf.popitem(last=False)
                try:
                    os.unlink(r)
                except Exception:
                    pass
        return ruta

    def _cerrar_sobrantes(self):
        """Cierra las que pasan del tope, de la menos usada a la mas, y NUNCA
        una que alguien este usando. Con el candado general puesto."""
        for viejo in list(self._abiertas):
            if len(self._abiertas) <= LAMINAS_ABIERTAS:
                break
            if viejo in self._en_uso:
                continue
            doc, _lista = self._abiertas.pop(viejo)
            try:
                doc.close()
            except Exception:
                pass

    @contextmanager
    def abierta(self, bucket, blob):
        """La display list de la lamina (la hoja interpretada una vez), mientras
        se dibuja con ella. Se usa con el candado de la lamina puesto."""
        with self._candado:
            par = self._abiertas.get(blob)
            if par is not None:
                self._abiertas.move_to_end(blob)
        if par is None:
            ruta = self._ruta_pdf(bucket, blob)
            if not ruta:
                yield None
                return
            doc = mosaicos._motor().open(ruta)
            par = (doc, doc.load_page(0).get_displaylist())
            with self._candado:
                self._abiertas[blob] = par
        with self._candado:
            self._en_uso[blob] = self._en_uso.get(blob, 0) + 1
        try:
            yield par[1]
        finally:
            with self._candado:
                self._en_uso[blob] -= 1
                if not self._en_uso[blob]:
                    del self._en_uso[blob]
                self._cerrar_sobrantes()


_LAMINAS = _Laminas()


def teselas_preparadas(man):
    """[(z, x, y)] de los niveles preparados, de arriba abajo, y solo los que
    caben ENTEROS en el tope (un nivel a medias obligaria a pedir el resto)."""
    todas = []
    for z in sorted(set(man.get('preparados') or [])):
        if not (0 <= z < len(man['niveles'])):
            continue
        n = man['niveles'][z]
        if len(todas) + n['columnas'] * n['filas'] > MAX_TESELAS_PREPARADAS:
            break
        todas.extend((z, x, y) for y in range(n['filas']) for x in range(n['columnas']))
    return todas


def teselas_validas(man, z, lista):
    """Filtra `lista` ([[x, y], ...]) a las teselas que existen en el nivel z."""
    try:
        z = int(z)
    except (TypeError, ValueError):
        return None, []
    if not man or not (0 <= z < len(man['niveles'])):
        return None, []
    n = man['niveles'][z]
    buenas = []
    for par in (lista or [])[:MAX_TESELAS_POR_PETICION]:
        try:
            x, y = int(par[0]), int(par[1])
        except (TypeError, ValueError, IndexError):
            continue
        if 0 <= x < n['columnas'] and 0 <= y < n['filas'] and (x, y) not in buenas:
            buenas.append((x, y))
    return z, buenas


def asegurar_teselas(blob, man, z, teselas):
    """Garantiza que esas teselas del nivel z esten en el almacen.

    Las de los niveles preparados ya estan; las de los profundos se dibujan
    aqui la primera vez (una lista del almacen por nivel, no una pregunta por
    tesela). Devuelve las que quedaron disponibles.
    """
    from gcs_manager import nombre_inmutable
    if int(z) in set(man.get('preparados') or []):
        return list(teselas)
    bucket = _bucket()
    prefijo = '%s/z%d/' % (carpeta(blob), int(z))
    existentes = {b.name for b in bucket.list_blobs(prefix=prefijo)}
    listas, faltan = [], []
    for (x, y) in teselas:
        (listas if nombre_tesela(blob, z, x, y) in existentes else faltan).append((x, y))
    if not faltan:
        return listas

    # Primero el candado de ESA lamina y despues el cupo general: asi las
    # peticiones que esperan a la misma lamina no ocupan el cupo de las demas.
    hechas = []
    with _LAMINAS.candado(blob), _LAMINAS.dibujando:
        with _LAMINAS.abierta(bucket, blob) as fuente:
            if fuente is None:
                return listas
            for (x, y) in faltan:
                datos = mosaicos.tesela_a_demanda(fuente, man, z, x, y)
                if datos is not None:
                    hechas.append((x, y, datos))

    # Se suben a la vez y fuera del candado: la siguiente peticion de esta
    # lamina ya puede dibujar mientras tanto.
    inmutable = nombre_inmutable(blob)

    def subir(t):
        try:
            _subir(bucket, nombre_tesela(blob, z, t[0], t[1]), t[2], 'image/webp', inmutable)
            return (t[0], t[1])
        except Exception as e:
            print('[mosaico] no se pudo subir %s z%d %d_%d: %s' % (blob, int(z), t[0], t[1], str(e)[:120]))
            return None

    listas.extend(par for par in _SUBIDAS.map(subir, hechas) if par)
    return listas
