# -*- coding: utf-8 -*-
"""MOSAICOS DE UNA LAMINA (paso 2 de docs/archivos/14).

El lector baja hoy el PDF ENTERO --71,9 MB en la lamina de paisajismo-- y lo
rasteriza con pdf.js. Hasta que ese fichero llega, lo unico que se puede
enseñar es una imagen de espera; y al acercar, el lector estira el mapa de bits
medio segundo hasta redibujar. ACC no hace nada de eso: baja ~1 MB de geometria
ya preparada por su servidor y dibuja con WebGL.

Esto es el equivalente razonable para nosotros: **una piramide de teselas**,
como un mapa. Cada nivel se DIBUJA DESDE EL PDF a su propia resolucion --por eso
sale nitido y no palido, ver §7 del informe-- y el navegador baja solo los
trozos que se ven.

    nivel 0   la hoja entera en PX_BASE px          (la vista de ajuste)
    nivel 1   el doble                              (un acercamiento)
    nivel 2   el cuadruple                          (leer el cajetin)

DOS DECISIONES QUE VIENEN DE SUSTOS ANTERIORES:

1. **Cada tesela se dibuja con RECORTE**, no se dibuja la hoja entera y luego se
   corta. El nivel 2 de un A1 son 6.000x4.243 px = 76 MB de pixeles en memoria;
   con recorte, cada tesela son 512x512 = 0,8 MB. Render ya reinicio el
   servicio por memoria el 28-ago-2026 rasterizando miniaturas.
2. **El nivel 0 lleva la misma mascara de enfoque que la vista previa**: a ese
   tamaño la linea fina se promedia con el blanco (medido en el informe 14). Los
   niveles altos no la necesitan --la linea ya ocupa su pixel-- y enfocarlos
   solo ensuciaria la foto aerea.

Aqui no hay GCS ni Flask a proposito: se prueba con
`backend/herramientas/prueba_mosaicos.py` sobre los PDF de `PDF/`.
"""
import io
import os
import time

PX_BASE = 1500          # nivel 0: lado mayor, como la vista previa
TESELA = 512            # lado de la tesela, en pixeles
NIVELES = 3             # 0, 1 y 2 (x1, x2 y x4)
CALIDAD = 82            # WEBP
# Esfuerzo del compresor WebP (0-6). Medido el 20-sep-2026 en la lamina pesada,
# por tesela: dibujarla 31-36 ms; comprimirla con 4, 37-38 ms; con 2, 13 ms y un
# 3 % mas de peso; con 0, 7 ms pero un 27 % mas. Con 2 una tesela a demanda
# cuesta un tercio menos, a la misma calidad.
METODO_WEBP = 2
ENFOQUE_NIVEL_0 = (1.0, 160, 2)     # el mismo de la vista previa


def plan(ancho_pt, alto_pt, base_px=PX_BASE, tesela=TESELA, niveles=NIVELES):
    """La piramide de una hoja de `ancho_pt` x `alto_pt` puntos.

    Devuelve [{z, escala, ancho, alto, columnas, filas, teselas}], donde
    `escala` es cuantos pixeles sale cada punto del PDF en ese nivel.
    """
    lado_mayor = max(ancho_pt, alto_pt, 1)
    salida = []
    for z in range(niveles):
        escala = (base_px * (2 ** z)) / lado_mayor
        ancho = max(1, int(round(ancho_pt * escala)))
        alto = max(1, int(round(alto_pt * escala)))
        columnas = (ancho + tesela - 1) // tesela
        filas = (alto + tesela - 1) // tesela
        salida.append({
            'z': z, 'escala': escala, 'ancho': ancho, 'alto': alto,
            'columnas': columnas, 'filas': filas, 'teselas': columnas * filas,
        })
    return salida


def _motor():
    """PyMuPDF con cualquiera de sus dos nombres (igual que gcs_manager)."""
    for nombre in ('pymupdf', 'fitz'):
        try:
            return __import__(nombre)
        except Exception:
            continue
    raise RuntimeError('sin PyMuPDF')


def _enfocar(imagen):
    from PIL import ImageFilter
    radio, fuerza, umbral = ENFOQUE_NIVEL_0
    return imagen.filter(ImageFilter.UnsharpMask(radius=radio, percent=fuerza, threshold=umbral))


MARGEN_ENFOQUE = 8      # px que se dibujan de mas a cada lado antes de enfocar


def una_tesela(pagina, nivel, col, fila, tesela=TESELA, calidad=CALIDAD, formato='WEBP', enfocar=False):
    """Los bytes de UNA tesela: la base de la tesela a demanda.

    `pagina` puede ser la pagina de PyMuPDF o, mejor, su `get_displaylist()`:
    las dos tienen `rect` y `get_pixmap(matrix, clip, alpha)`, y con la lista la
    hoja no se vuelve a interpretar en cada tesela.

    Mismas cuentas que `teselas_de_nivel` (pixeles primero, margen de enfoque),
    asi que una tesela hecha a demanda es identica a la del lote.
    """
    from PIL import Image
    motor = _motor()
    escala = nivel['escala']
    caja = pagina.rect
    margen = MARGEN_ENFOQUE if enfocar else 0
    px0, py0 = col * tesela, fila * tesela
    if px0 >= nivel['ancho'] or py0 >= nivel['alto'] or col < 0 or fila < 0:
        return None
    px1 = min(nivel['ancho'], px0 + tesela)
    py1 = min(nivel['alto'], py0 + tesela)
    mx0, my0 = max(0, px0 - margen), max(0, py0 - margen)
    mx1 = min(nivel['ancho'], px1 + margen)
    my1 = min(nivel['alto'], py1 + margen)
    recorte = motor.Rect(caja.x0 + mx0 / escala, caja.y0 + my0 / escala,
                         caja.x0 + mx1 / escala, caja.y0 + my1 / escala)
    pix = pagina.get_pixmap(matrix=motor.Matrix(escala, escala), clip=recorte, alpha=False)
    # Los pixeles, tal cual: antes se codificaban a PNG y se volvian a leer solo
    # para pasarlos a PIL (dos conversiones inutiles por tesela).
    imagen = Image.frombytes('RGB', (pix.width, pix.height), pix.samples)
    pix = None
    if enfocar:
        imagen = _enfocar(imagen)
        izq, arriba = px0 - mx0, py0 - my0
        imagen = imagen.crop((izq, arriba,
                              min(imagen.width, izq + (px1 - px0)),
                              min(imagen.height, arriba + (py1 - py0))))
    out = io.BytesIO()
    imagen.save(out, format=formato, quality=calidad, method=METODO_WEBP)
    imagen.close()
    return out.getvalue()


def teselas_de_nivel(pagina, nivel, tesela=TESELA, calidad=CALIDAD, formato='WEBP', enfocar=False):
    """Genera las teselas de un nivel, UNA A UNA. Devuelve (x, y, bytes).

    Es un generador: quien lo llama las sube o las escribe y las suelta, asi
    que en memoria no hay nunca mas de una tesela.

    LA COSTURA: la mascara de enfoque mira los pixeles VECINOS, y en el borde
    de una tesela esos vecinos no existen -- medido: en la union de dos teselas
    la diferencia con la hoja enfocada de una vez llegaba a 136 niveles de gris
    frente a 64 lejos de la union. Por eso, cuando se enfoca, cada tesela se
    dibuja con `MARGEN_ENFOQUE` px de mas a cada lado y el margen se recorta
    DESPUES: cada pixel ve a sus vecinos de verdad y la union no se nota.

    Las cuentas van en PIXELES y se pasan a puntos al final: asi la rejilla
    cuadra exactamente con la que espera el navegador. Cada tesela sale de
    `una_tesela`, la MISMA funcion que la tesela a demanda: el lote y la demanda
    no pueden dar teselas distintas.
    """
    for fila in range(nivel['filas']):
        for col in range(nivel['columnas']):
            datos = una_tesela(pagina, nivel, col, fila, tesela, calidad, formato, enfocar)
            if datos is not None:
                yield col, fila, datos


def generar(ruta_pdf, escribir, base_px=PX_BASE, tesela=TESELA, niveles=NIVELES,
            calidad=CALIDAD, formato='WEBP', pagina_n=0, al_avanzar=None):
    """Genera la piramide entera. `escribir(z, x, y, datos)` la guarda.

    Devuelve el resumen: niveles, teselas, bytes y tiempo. No sabe nada de
    donde se guarda --disco en las pruebas, GCS en produccion--, asi que se
    puede medir sin tocar el almacen real.
    """
    motor = _motor()
    t0 = time.perf_counter()
    doc = motor.open(ruta_pdf)
    try:
        pagina = doc.load_page(pagina_n)
        caja = pagina.rect
        piramide = plan(caja.width, caja.height, base_px, tesela, niveles)
        total_bytes = 0
        hechas = 0
        por_nivel = []
        for nivel in piramide:
            t1 = time.perf_counter()
            bytes_nivel = 0
            for x, y, datos in teselas_de_nivel(pagina, nivel, tesela, calidad, formato,
                                                enfocar=(nivel['z'] == 0)):
                escribir(nivel['z'], x, y, datos)
                bytes_nivel += len(datos)
                hechas += 1
                if al_avanzar:
                    al_avanzar(hechas, sum(n['teselas'] for n in piramide))
            total_bytes += bytes_nivel
            por_nivel.append({**nivel, 'bytes': bytes_nivel,
                              'ms': round((time.perf_counter() - t1) * 1000)})
        return {
            'hoja_mm': (round(caja.width / 72 * 25.4), round(caja.height / 72 * 25.4)),
            'niveles': por_nivel,
            'teselas': hechas,
            'bytes': total_bytes,
            'ms': round((time.perf_counter() - t0) * 1000),
        }
    finally:
        doc.close()


def escritor_de_disco(carpeta, extension='webp'):
    """Un `escribir` que guarda en `carpeta/z{z}/{x}_{y}.{ext}` (para probar)."""
    def escribir(z, x, y, datos):
        destino = os.path.join(carpeta, 'z%d' % z)
        os.makedirs(destino, exist_ok=True)
        with open(os.path.join(destino, '%d_%d.%s' % (x, y, extension)), 'wb') as f:
            f.write(datos)
    return escribir


# ── PREPARAR UNA LAMINA (al subir, y en la puesta al dia) ────────────────────
#
# 20-sep-2026, el propietario: «yo ya tengo archivos PDF subidos, cientos». Si se
# preparase la piramide entera de cada una, serian 2-6 horas de calculo (19-71 s
# por lamina) y miles de teselas que nadie va a mirar. Por eso se preparan solo
# los niveles de ARRIBA (ver la hoja entera y acercar x2: 5-7 s y <1 MB por
# lamina) y los profundos se dibujan A DEMANDA, tesela a tesela, la primera vez
# que alguien acerca esa zona (medido: 50-500 ms por tesela) y se guardan.
#
# Y SE PREPARA TAMBIEN z2 (20-sep-2026, medido de nuevo en su PC con la display
# list y WebP metodo 2, dos veces): z0+z1 cuesta 3,1-3,4 s la lamina de 71,9 MB
# y 1,6-1,8 s una corriente; z0+z1+z2, 7,4 s y 3,9-4,3 s, con 2,3-2,4 MB. Por
# esos segundos, el primer acercamiento hasta ~8 px/mm (x3,6 desde la hoja
# entera) no espera a que el servidor dibuje: a demanda, en un servidor de una
# CPU, una vista entera de z2 eran 28 teselas y ~3,4 s (medido en el banco a
# 110 ms por tesela). A demanda queda solo z3, el «muy de cerca».

NIVELES_TOTALES = 4          # z0..z3 (hasta 14,3 px/mm en un A1, mas que ACC)
NIVELES_AL_PREPARAR = (0, 1, 2)


def manifiesto(pagina, niveles_totales=NIVELES_TOTALES, preparados=(), extension='webp'):
    """El manifiesto de una lamina: su piramide y que niveles estan ya hechos."""
    caja = pagina.rect
    piramide = plan(caja.width, caja.height, niveles=niveles_totales)
    return {
        'tesela': TESELA,
        'extension': extension,
        'hoja_mm': [round(caja.width / 72 * 25.4, 1), round(caja.height / 72 * 25.4, 1)],
        'niveles': [{'z': n['z'], 'ancho': n['ancho'], 'alto': n['alto'],
                     'columnas': n['columnas'], 'filas': n['filas']} for n in piramide],
        'preparados': sorted(set(preparados)),
    }


def preparar(ruta_pdf, escribir, niveles=NIVELES_AL_PREPARAR, niveles_totales=NIVELES_TOTALES):
    """Dibuja los `niveles` pedidos y devuelve (manifiesto, resumen).

    `escribir(z, x, y, datos)` guarda cada tesela; el manifiesto lo guarda quien
    llama, DESPUES de las teselas: si el proceso se corta a medias, no queda un
    manifiesto que prometa teselas que no estan.
    """
    motor = _motor()
    t0 = time.perf_counter()
    doc = motor.open(ruta_pdf)
    try:
        pagina = doc.load_page(0)
        piramide = plan(pagina.rect.width, pagina.rect.height, niveles=niveles_totales)
        # LA HOJA SE INTERPRETA UNA SOLA VEZ. Pidiendo cada recorte a la pagina,
        # MuPDF volvia a leer TODO su contenido en cada tesela: 400-650 ms por
        # tesela fuera del tamaño que fuera (medido el 20-sep-2026, 19-24 s por
        # lamina). Con su «display list» se interpreta una vez y cada tesela solo
        # se pinta: 80-215 ms.
        fuente = pagina.get_displaylist()
        hechas, peso = 0, 0
        for nivel in piramide:
            if nivel['z'] not in niveles:
                continue
            for x, y, datos in teselas_de_nivel(fuente, nivel, enfocar=(nivel['z'] == 0)):
                escribir(nivel['z'], x, y, datos)
                hechas += 1
                peso += len(datos)
        man = manifiesto(pagina, niveles_totales, preparados=niveles)
        return man, {'teselas': hechas, 'bytes': peso, 'ms': round((time.perf_counter() - t0) * 1000)}
    finally:
        doc.close()


def tesela_a_demanda(pagina, man, z, x, y):
    """Los bytes de la tesela (z, x, y) de una lamina ya abierta, o None si no existe."""
    if not (0 <= z < len(man['niveles'])):
        return None
    caja = pagina.rect
    piramide = plan(caja.width, caja.height, niveles=len(man['niveles']))
    return una_tesela(pagina, piramide[z], x, y, enfocar=(z == 0))

