# -*- coding: utf-8 -*-
"""UNA SOLA descripcion de como arranca el backend.

POR QUE EXISTE ESTA PRUEBA
--------------------------
Habia dos, y decian cosas distintas:

  render.yaml          ->  alembic upgrade head && gunicorn --workers 4 --threads 2
  backend/package.json ->  bootstrap_esquema.py && gunicorn --workers 1 --threads 4

La diferencia no era cosmetica. NINGUNA migracion de alembic crea el esquema del
segundo factor -- lo crea `bootstrap_esquema.py` --, asi que aprovisionar una
instancia desde el descriptor obsoleto la habria dejado SIN 2FA desde el dia uno
y con cuatro veces el consumo de memoria, justo lo que ya mato un servicio.

`render.yaml` era ademas anterior al perfil portal: ni lo mencionaba. Se retiro.
La fuente de verdad es `backend/package.json`. Si alguien vuelve a introducir un
descriptor de despliegue, esta prueba exige que delegue en el, no que lo repita.
"""
import io
import json
import os

RAIZ = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
BACKEND = os.path.join(RAIZ, 'backend')


def _package_json():
    with io.open(os.path.join(BACKEND, 'package.json'), encoding='utf-8') as f:
        return json.load(f)


def test_el_arranque_construye_el_esquema_antes_de_servir():
    """Si gunicorn arranca sin haber pasado por el bootstrap, la instancia sirve
    peticiones sobre un esquema que nadie ha comprobado."""
    start = _package_json()['scripts']['start']
    assert 'bootstrap_esquema.py' in start, (
        'el arranque tiene que construir/verificar el esquema antes de servir')
    assert start.index('bootstrap_esquema.py') < start.index('gunicorn'), (
        'el bootstrap va ANTES de gunicorn, no despues')


def test_no_hay_un_segundo_descriptor_que_diga_otra_cosa():
    """Un descriptor de despliegue que repita el comando acaba divergiendo."""
    candidatos = [os.path.join(RAIZ, n) for n in
                  ('render.yaml', 'render.yml', 'Procfile', 'app.yaml')]
    for ruta in candidatos:
        if not os.path.exists(ruta):
            continue
        texto = io.open(ruta, encoding='utf-8', errors='ignore').read()
        assert 'gunicorn' not in texto, (
            '%s define su propio comando de arranque: o delega en `npm start` '
            '(backend/package.json) o se retira. Dos descripciones divergen.'
            % os.path.basename(ruta))
        assert 'alembic upgrade' not in texto, (
            '%s arranca con alembic, que NO crea el esquema del segundo factor. '
            'Lo crea bootstrap_esquema.py.' % os.path.basename(ruta))


def test_un_solo_worker_y_varios_hilos():
    """Medido: ~70 MB residentes por proceso. Con 4 workers no cabe en 512 MB, y
    asi es como el servicio se quedo sin memoria."""
    start = _package_json()['scripts']['start']
    assert '--workers 1' in start, (
        'mas de un worker multiplica la memoria; el paralelismo va por hilos')
    assert '--threads' in start
