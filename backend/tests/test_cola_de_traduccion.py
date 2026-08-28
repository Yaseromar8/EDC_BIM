# -*- coding: utf-8 -*-
"""La pre-traducción NO se desborda con una carga masiva.

Pregunta del dueño: «¿si jalo 100 archivos, aguantará?». La respuesta tiene
que ser medible, no una promesa: estas pruebas encolan 100 y comprueban que
nunca hay más de 2 traducciones a la vez, que las 100 se atienden, y que
ningún camino del código volvió a lanzar hilos sueltos.
"""
import io
import os
import re
import threading
import time

import routes.docs_cad as cad

AQUI = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def test_la_cola_esta_acotada_a_dos_obreros():
    assert cad._COLA_TRADUCCION._max_workers == 2, (
        'Cada pre-traducción baja el fichero entero a disco y lo reenvía a '
        'Autodesk. Subir el techo sin medir la instancia es repetir la caída '
        'del DWG de 260 MB, multiplicada.')


def test_CIEN_ficheros_a_la_vez_nunca_pasan_de_DOS_en_paralelo(monkeypatch):
    """El escenario del dueño, medido."""
    a_la_vez = 0
    pico = 0
    atendidos = []
    candado = threading.Lock()

    def falso_trabajo(node_id, forzar=False, master=False):
        nonlocal a_la_vez, pico
        with candado:
            a_la_vez += 1
            pico = max(pico, a_la_vez)
        time.sleep(0.01)          # el trabajo real dura minutos; aquí basta un pelo
        with candado:
            atendidos.append(node_id)
            a_la_vez -= 1

    monkeypatch.setattr(cad, 'pretraducir_en_fondo', falso_trabajo)

    for i in range(100):
        assert cad.encolar_pretraduccion('nodo-%d' % i) is True

    esperando = time.time()
    while len(atendidos) < 100 and time.time() - esperando < 30:
        time.sleep(0.05)

    assert len(atendidos) == 100, 'se perdieron %d' % (100 - len(atendidos))
    assert pico <= 2, 'hubo %d traducciones a la vez: la cola no acota' % pico


def test_ningun_camino_lanza_HILOS_SUELTOS_de_traduccion():
    """El tripwire: quien añada una vía nueva tiene que usar la cola.

    Lanzar `Thread(target=pretraducir_en_fondo)` desde cualquier ruta
    devuelve el problema entero — 100 ficheros, 100 hilos, instancia muerta.
    """
    for fichero in ('routes/docs_cad.py', 'routes/documents.py',
                    'routes/uploads.py', 'routes/sync.py'):
        texto = io.open(os.path.join(AQUI, fichero), encoding='utf-8').read()
        suelto = re.search(r'Thread\(\s*target\s*=\s*pretraducir_en_fondo', texto)
        assert not suelto, ('%s lanza un hilo suelto de pre-traducción: usa '
                            'encolar_pretraduccion()' % fichero)


def test_los_confirmadores_de_subida_encolan():
    """Las DOS vías de subida (planos grandes y multimedia) pasan por la cola."""
    for fichero in ('routes/uploads.py', 'routes/documents.py'):
        texto = io.open(os.path.join(AQUI, fichero), encoding='utf-8').read()
        assert 'encolar_pretraduccion' in texto, fichero


def test_encolar_nunca_revienta_la_peticion():
    """Si la cola fallara, la subida NO se cae: devuelve False y sigue."""
    fuente = io.open(os.path.join(AQUI, 'routes/docs_cad.py'),
                     encoding='utf-8').read()
    cuerpo = fuente[fuente.index('def encolar_pretraduccion'):]
    cuerpo = cuerpo[:cuerpo.index('\ndef ', 10)]
    assert 'try:' in cuerpo and 'except Exception' in cuerpo
    assert 'return False' in cuerpo
