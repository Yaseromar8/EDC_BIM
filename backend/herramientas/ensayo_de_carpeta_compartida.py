# -*- coding: utf-8 -*-
"""ENSAYO · el enlace público de una CARPETA, con la aplicación real contra PostgreSQL LOCAL.

docs/archivos/32. Monta una carpeta compartida como las fichas del sustento de metrados de PQT8 —con una subcarpeta,
un documento enlazado desde fuera, una carpeta en la papelera y algo de fuera— y la recorre SIN SESIÓN, como quien
abre el enlace desde el correo.

    DB_HOST=127.0.0.1 DB_PORT=<puerto> DB_NAME=ecd_ensayo DB_USER=ecd_app python herramientas/ensayo_de_carpeta_compartida.py

Se niega a arrancar si la base no está en esta máquina o no es desechable. No lee ningún `.env`. No llama al
almacenamiento de Google: la URL firmada se sustituye por una de mentira. Deja sus filas (prefijo `zz_ccomp_`).
"""
import json
import os
import re
import secrets
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import dotenv  # noqa: E402
dotenv.load_dotenv = lambda *a, **k: False

_pasos = []


def _paso(ok, texto, detalle=''):
    _pasos.append((bool(ok), texto))
    print('  %s  %s%s' % ('OK   ' if ok else 'FALLA', texto,
                          ('   -- ' + str(detalle)) if detalle not in ('', None) else ''))


def _titulo(t):
    print('\n── %s %s' % (t, '─' * max(0, 70 - len(t))))


def main():
    if (os.getenv('DB_HOST') or '') not in ('127.0.0.1', 'localhost', '::1'):
        print('ME NIEGO A ARRANCAR: DB_HOST=%r no es esta maquina.' % (os.getenv('DB_HOST'),))
        return 2
    if not re.search(r'(test|ensayo|prueba|banco)', os.getenv('DB_NAME') or '', re.I):
        print('ME NIEGO A ARRANCAR: DB_NAME=%r no parece una base desechable.' % (os.getenv('DB_NAME'),))
        return 2
    if os.getenv('DATABASE_URL'):
        print('ME NIEGO A ARRANCAR: DATABASE_URL esta definida.')
        return 2
    for clave in ('RESEND_API_KEY', 'GOOGLE_APPLICATION_CREDENTIALS', 'APS_CLIENT_ID', 'APS_CLIENT_SECRET', 'REDIS_URL'):
        os.environ[clave] = ''
    os.environ.update({'AUTH_POLICY_MODE': 'estricto', 'ENFORCE_PROJECT_AUTHZ': 'true', 'DDL_EN_CALIENTE': 'false',
                       'FLASK_SKIP_DOTENV': '1'})
    os.environ.setdefault('APP_SECRET', secrets.token_hex(24))

    import db
    db.init_db_pool()
    import server
    import file_system_db as fsd
    import gcs_manager
    import sensibilidad
    import referencias_de_obra as ref

    # Sin Google: la URL firmada es de mentira, y se ve qué fichero se firmó.
    firmados = []
    gcs_manager.generate_signed_url = lambda urn, *a, **k: firmados.append(urn) or 'https://firmada.ensayo/' + urn
    de_verdad = sensibilidad.puede_salir_del_ecd
    sensibilidad.puede_salir_del_ecd = lambda cur, nodo, urn: (True, None, '')

    run = time.strftime('%H%M%S')
    obra = 'zz_ccomp_%s' % run

    def carpeta(nombre, padre, borrada=False):
        with db.get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute("INSERT INTO file_nodes (model_urn, parent_id, node_type, name, status, is_deleted) "
                        "VALUES (%s,%s,'FOLDER',%s,'WIP',%s) RETURNING id::text", (obra, padre, nombre, borrada))
            nid = cur.fetchone()[0]
            conn.commit()
        return nid

    def archivo(nombre, padre):
        fsd.create_file_record(obra, padre, nombre, 1000, 'zz_ccomp/%s/%s' % (run, nombre), 'application/pdf',
                               'zz@ensayo.test', None)
        with db.get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute("SELECT id::text FROM file_nodes WHERE model_urn=%s AND parent_id=%s AND name=%s",
                        (obra, padre, nombre))
            return cur.fetchone()[0]

    def enlace(nodo, revocado=False, caducado=False):
        with db.get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute("INSERT INTO document_shares (file_node_id, model_urn, shared_by, role, access_type, expires_at,"
                        " revoked) VALUES (%s,%s,'zz@ensayo.test','viewer','public',"
                        " CASE WHEN %s THEN NOW() - INTERVAL '1 day' ELSE NULL END, %s) RETURNING id::text",
                        (nodo, obra, caducado, revocado))
            sid = cur.fetchone()[0]
            conn.commit()
        return sid

    _titulo('MONTAJE · una ficha como las del sustento de metrados')
    with db.get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute("INSERT INTO projects (id, name, model_urn, status) VALUES (%s,%s,%s,'active')",
                    (obra, 'ZZ CCOMP ' + run, obra))
        ref.registrar_obra(cur, obra, nombre='ZZ CCOMP ' + run, model_urn=obra, origen='ensayo de carpeta compartida')
        conn.commit()
    raiz_obra = fsd.ensure_project_root_node(obra)
    ficha = carpeta('1. ACCESO 01', raiz_obra)
    planos = carpeta('PLANOS', ficha)
    papelera = carpeta('VIEJA', ficha, borrada=True)
    fuera = carpeta('OTRA FICHA', raiz_obra)
    hoja = archivo('METRADO.pdf', ficha)
    plano = archivo('PLANTA.pdf', planos)
    en_papelera = archivo('BORRADOR.pdf', papelera)
    de_fuera = archivo('AJENO.pdf', fuera)
    enlazado = archivo('COMUN.pdf', fuera)
    with db.get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute('INSERT INTO doc_enlaces (model_urn, documento_id, carpeta_id) VALUES (%s,%s,%s)',
                    (obra, enlazado, planos))
        conn.commit()
    s_ficha, s_plano = enlace(ficha), enlace(plano)
    s_revocado, s_caducado = enlace(ficha, revocado=True), enlace(ficha, caducado=True)
    _paso(True, 'ficha con PLANOS (y un documento enlazado desde otra ficha), una carpeta en la papelera y otra ficha')

    cli = server.app.test_client()          # SIN sesión: como quien abre el enlace desde el correo

    def pide(ruta):
        r = cli.get(ruta)
        return r.status_code, (r.get_json() or {})

    _titulo('E · el enlace de la carpeta dice que es una carpeta, sin pedir sesión')
    s, b = pide('/api/docs/shared/%s' % s_ficha)
    _paso(s == 200 and (b.get('data') or {}).get('es_carpeta') is True and b['data'].get('name') == '1. ACCESO 01',
          'antes decía «El archivo físico no existe»; ahora, que es la carpeta «1. ACCESO 01»', (s, b))
    s, b = pide('/api/docs/shared/%s' % s_plano)
    _paso(s == 200 and (b.get('data') or {}).get('url') and not b['data'].get('es_carpeta'),
          'el enlace de un archivo suelto sigue igual', (s, b.get('error')))

    _titulo('C · lo que hay dentro, y solo eso')
    s, b = pide('/api/docs/shared/%s/contenido' % s_ficha)
    d = b.get('data') or {}
    _paso(s == 200 and [c['name'] for c in d.get('carpetas') or []] == ['PLANOS']
          and [a['name'] for a in d.get('archivos') or []] == ['METRADO.pdf'],
          'la ficha: la carpeta PLANOS y METRADO.pdf; la carpeta de la papelera no sale', (s, d))
    _paso([m['name'] for m in d.get('migas') or []] == ['1. ACCESO 01'] and d.get('compartida', {}).get('id') == ficha,
          'el camino empieza en la carpeta compartida, no en la raíz de la obra', d.get('migas'))
    s, b = pide('/api/docs/shared/%s/contenido?carpeta=%s' % (s_ficha, planos))
    d = b.get('data') or {}
    _paso(s == 200 and sorted(a['name'] for a in d.get('archivos') or []) == ['COMUN.pdf', 'PLANTA.pdf']
          and [m['name'] for m in d.get('migas') or []] == ['1. ACCESO 01', 'PLANOS'],
          'PLANOS: su plano y el documento enlazado desde otra ficha, con el camino completo', (s, d.get('archivos')))
    for nombre, nodo in (('otra ficha', fuera), ('la carpeta de la papelera', papelera),
                         ('la raíz de la obra', raiz_obra), ('un id inventado', '0b5a3c52-7f1e-4d1a-9c3e-4e6f2a9b8d01'),
                         ('basura', 'abc')):
        s, b = pide('/api/docs/shared/%s/contenido?carpeta=%s' % (s_ficha, nodo))
        _paso(s == 404 and 'data' not in b, 'no se lista %s: 404' % nombre, (s, b))

    _titulo('A · abrir un documento: solo los de dentro')
    for nombre, nodo in (('METRADO.pdf, en la ficha', hoja), ('PLANTA.pdf, en una subcarpeta', plano),
                         ('COMUN.pdf, enlazado en una subcarpeta', enlazado)):
        antes = len(firmados)
        s, b = pide('/api/docs/shared/%s/archivo/%s' % (s_ficha, nodo))
        _paso(s == 200 and (b.get('data') or {}).get('url', '').startswith('https://firmada.ensayo/')
              and len(firmados) == antes + 1, 'abre %s' % nombre, (s, b.get('error')))
    for nombre, nodo in (('un documento de otra ficha', de_fuera), ('un documento de la papelera', en_papelera),
                         ('una carpeta en vez de un documento', planos), ('un id inventado',
                                                                         '0b5a3c52-7f1e-4d1a-9c3e-4e6f2a9b8d01')):
        antes = len(firmados)
        s, b = pide('/api/docs/shared/%s/archivo/%s' % (s_ficha, nodo))
        _paso(s == 404 and len(firmados) == antes, 'no abre %s: 404, y no se firma nada' % nombre, (s, b))

    _titulo('V · el enlace tiene que valer')
    for nombre, sid, codigo in (('revocado', s_revocado, 410), ('caducado', s_caducado, 410)):
        for ruta in ('/contenido', '/archivo/%s' % hoja):
            s, b = pide('/api/docs/shared/%s%s' % (sid, ruta))
            _paso(s == codigo, 'enlace %s, %s: %s' % (nombre, ruta.split('/')[1], codigo), (s, b.get('error')))
    s, b = pide('/api/docs/shared/%s/contenido' % s_plano)
    _paso(s == 404 and 'carpeta' in (b.get('error') or ''), 'el enlace de un archivo no lista nada', (s, b))
    s, b = pide('/api/docs/shared/no-es-un-id/contenido')
    _paso(s == 404, 'un enlace inventado: 404', s)

    _titulo('S · la regla de salida del ECD manda en cada documento')
    sensibilidad.puede_salir_del_ecd = de_verdad      # esta obra no tiene triaje: un enlace público no deja salir nada
    s, b = pide('/api/docs/shared/%s/contenido' % s_ficha)
    a = ((b.get('data') or {}).get('archivos') or [{}])[0]
    _paso(s == 200 and a.get('name') == 'METRADO.pdf' and a.get('disponible') is False and a.get('motivo'),
          'se ve en la lista, marcado como no disponible y con el motivo', a)
    antes = len(firmados)
    s, b = pide('/api/docs/shared/%s/archivo/%s' % (s_ficha, hoja))
    _paso(s == 403 and b.get('code') == 'SENSIBILIDAD_NO_PERMITE_SALIDA' and len(firmados) == antes,
          'y no se abre: 403, sin firmar nada', (s, b))

    bien = sum(1 for ok, _ in _pasos if ok)
    print('\nRESULTADO: %d/%d' % (bien, len(_pasos)))
    for ok, texto in _pasos:
        if not ok:
            print('  FALLA  ' + texto)
    return 0 if bien == len(_pasos) else 1


if __name__ == '__main__':
    sys.exit(main())
