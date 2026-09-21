# -*- coding: utf-8 -*-
"""Genera la piramide de mosaicos de una lamina en DISCO y la mide.

    backend/venv/Scripts/python.exe backend/herramientas/prueba_mosaicos.py [fichero.pdf ...]

No toca GCS ni la base: escribe en `dist-banco/__mosaico/<nombre>/z{z}/{x}_{y}.webp`
del banco del visor, para poder mirarlo en el navegador con la pagina de prueba.
Mide, por nivel: teselas, peso, tiempo, y el peso de lo que se baja de verdad
al abrir (el nivel 0 entero) frente a los 71,9 MB del PDF.
"""
import os
import sys
import time

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

import mosaicos                                      # noqa: E402

RAIZ = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
CARPETA_PDF = os.path.join(RAIZ, 'PDF')
DESTINO = os.path.join(RAIZ, 'frontend-react', 'dist-banco', '__mosaico')


def humano(n):
    return '%.1f MB' % (n / 1048576.0) if n >= 1048576 else '%.0f KB' % (n / 1024.0)


def main():
    nombres = sys.argv[1:] or sorted(f for f in os.listdir(CARPETA_PDF) if f.lower().endswith('.pdf'))[:1]
    for nombre in nombres:
        ruta = os.path.join(CARPETA_PDF, nombre)
        if not os.path.exists(ruta):
            print('%s: no esta en PDF/' % nombre)
            continue
        carpeta = os.path.join(DESTINO, os.path.splitext(nombre)[0])
        os.makedirs(carpeta, exist_ok=True)
        t = time.perf_counter()
        r = mosaicos.generar(ruta, mosaicos.escritor_de_disco(carpeta))
        print('\n%s  (%s, hoja %dx%d mm)' % (nombre, humano(os.path.getsize(ruta)), *r['hoja_mm']))
        print('  %-5s %-12s %-8s %8s %8s' % ('nivel', 'tamaño', 'teselas', 'peso', 'tiempo'))
        for n in r['niveles']:
            print('  z%-4d %-12s %-8d %8s %7d ms' % (
                n['z'], '%dx%d' % (n['ancho'], n['alto']), n['teselas'], humano(n['bytes']), n['ms']))
        print('  TOTAL %-12s %-8d %8s %7d ms' % ('', r['teselas'], humano(r['bytes']), r['ms']))
        nivel0 = r['niveles'][0]
        print('  al abrir se baja el nivel 0: %s en %d teselas (el PDF pesa %s)'
              % (humano(nivel0['bytes']), nivel0['teselas'], humano(os.path.getsize(ruta))))
        print('  escrito en %s' % carpeta)
        print('  (generar entero: %.1f s)' % (time.perf_counter() - t))


if __name__ == '__main__':
    main()
