# -*- coding: utf-8 -*-
"""El acuse de una emision cierra el encargo DE QUIEN ACUSO, no del homonimo.

QUE CIERRA
----------
`_es_destinatario` ya usaba identidad estricta desde el 21-ago-2026, pero la
PROYECCION seguia cotejando por texto:

  - el acuse se firmaba con `por = nombre or correo`;
  - `_acuso` comparaba ese texto contra el nombre O el correo del usuario;
  - `_faltantes` resolvia al destinatario por CORREO, ignorando el `user_id`
    que la emision ya guardaba.

Consecuencia: el acuse de un HOMONIMO cerraba el encargo de otra persona. Y un
encargo cerrado por error desaparece de la bandeja de quien todavia lo debe --
la peor forma de perderlo, porque no hace ruido.

QUE DEMUESTRA
-------------
  1. Dos usuarios con el MISMO NOMBRE no se pisan el acuse.
  2. Dos identidades distintas con el mismo correo tampoco, si el modelo lo
     permite -- y se dice si no lo permite.
  3. Emision NUEVA: cierra por identidad.
  4. Emision LEGACY (sin `user_id`): sigue cerrando por texto, y no se convierte.
  5. La conciliacion es idempotente: la segunda pasada no mueve nada.
  6. Mi Trabajo enseña lo que corresponde a cada uno.
  7. Ninguna otra semantica de `encargos` cambia.

    python herramientas/ensayo_de_acuse_por_identidad.py
"""
import importlib
import json
import os
import sys
import datetime

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

import pathlib
from dotenv import load_dotenv
load_dotenv(pathlib.Path(__file__).resolve().parent.parent.parent / '.env')
load_dotenv()

PREFIJO = 'zz_acu_'
OBRA = PREFIJO + 'obra'

_pasos = []


def _paso(ok, texto, detalle=''):
    _pasos.append((ok, texto))
    print('  %s  %s%s' % ('OK  ' if ok else 'FALLA', texto,
                          ('   -- ' + detalle) if detalle else ''))
    return ok


def _titulo(t):
    print()
    print(t.upper())


def limpiar(cur):
    cur.execute("DELETE FROM encargos WHERE project_id LIKE %s", (PREFIJO + '%',))
    cur.execute("DELETE FROM transmittals WHERE model_urn LIKE %s", (PREFIJO + '%',))
    cur.execute("DELETE FROM folder_permissions WHERE folder_node_id IN "
                " (SELECT id FROM file_nodes WHERE model_urn LIKE %s)", (PREFIJO + '%',))
    cur.execute("DELETE FROM file_versions WHERE file_node_id IN "
                " (SELECT id FROM file_nodes WHERE model_urn LIKE %s)", (PREFIJO + '%',))
    cur.execute("DELETE FROM file_nodes WHERE model_urn LIKE %s", (PREFIJO + '%',))
    cur.execute("DELETE FROM project_users WHERE project_id LIKE %s", (PREFIJO + '%',))
    cur.execute("DELETE FROM project_ref WHERE project_id LIKE %s", (PREFIJO + '%',))
    cur.execute("DELETE FROM projects WHERE id LIKE %s", (PREFIJO + '%',))
    cur.execute("DELETE FROM users WHERE email LIKE %s", (PREFIJO + '%',))


def cliente(usuario, bp):
    from flask import Flask
    import auth_middleware as am
    app = Flask(__name__)
    am.validate_session = lambda t: usuario
    am.init_auth_middleware(app)
    app.register_blueprint(bp)
    c = app.test_client()
    c.environ_base['HTTP_AUTHORIZATION'] = 'Bearer ensayo'
    return c


def main():
    os.environ['ENFORCE_PROJECT_AUTHZ'] = 'true'
    os.environ.setdefault('AUTH_POLICY_MODE', 'sombra')
    os.environ.setdefault('APP_SECRET', 'x' * 32)

    import db
    importlib.reload(db)
    from db import init_db_pool, get_db_connection
    import referencias_de_obra as ref
    import encargos as enc
    import routes.transmittals as rt
    init_db_pool()

    print()
    print('=' * 76)
    print('ENSAYO DEL ACUSE POR IDENTIDAD')
    print('=' * 76)

    with get_db_connection() as conn:
        cur = conn.cursor()
        limpiar(cur)
        conn.commit()
        db._project_resolver_cache['map'] = None

        cur.execute("SELECT id FROM hubs LIMIT 1")
        hub = (cur.fetchone() or [None])[0]
        cur.execute("INSERT INTO projects (id, hub_id, name, model_urn, status) "
                    "VALUES (%s,%s,'ZZ ACUSE',%s,'active')", (OBRA, hub, OBRA))
        ref.registrar_obra(cur, OBRA, nombre='ZZ ACUSE', model_urn=OBRA,
                           origen='ensayo de acuse')

        def usuario(nombre, correo):
            cur.execute("INSERT INTO users (name, email, password_hash, role, "
                        "  is_active) VALUES (%s,%s,'x','editor',TRUE) RETURNING id",
                        (nombre, PREFIJO + correo))
            uid = cur.fetchone()[0]
            cur.execute("INSERT INTO project_users (project_id, user_id) VALUES (%s,%s)",
                        (OBRA, uid))
            return uid

        # DOS PERSONAS DISTINTAS CON EL MISMO NOMBRE. Es el caso real de una
        # obra publica: dos «Ana Torres» en empresas distintas.
        ana1 = usuario('Ana Torres', 'ana.torres@supervisora.test')
        ana2 = usuario('Ana Torres', 'a.torres@constructora.test')
        emisor = usuario('Residente', 'resi@t')

        # Un documento REAL: la emision exige items con nodo, y con razon --
        # emitir «algo» sin decir que es no es una emision.
        cur.execute("INSERT INTO file_nodes (model_urn, node_type, name, is_deleted, "
                    "  status, gcs_urn) VALUES (%s,'FOLDER','RAIZ',FALSE,NULL,NULL) "
                    "RETURNING id::text", (OBRA,))
        raiz = cur.fetchone()[0]
        cur.execute("INSERT INTO file_nodes (model_urn, parent_id, node_type, name, "
                    "  is_deleted, status, gcs_urn, version_number) "
                    "VALUES (%s,%s::uuid,'FILE','PLANO.pdf',FALSE,'PUBLISHED',%s,1) "
                    "RETURNING id::text", (OBRA, raiz, PREFIJO + 'obj/plano.pdf'))
        nodo = cur.fetchone()[0]
        cur.execute("INSERT INTO file_versions (file_node_id, version_number, gcs_urn, "
                    "  sha256) VALUES (%s::uuid,1,%s,%s) RETURNING id::text",
                    (nodo, PREFIJO + 'obj/plano.pdf.v1', '0' * 64))
        version = cur.fetchone()[0]
        cur.execute("UPDATE file_nodes SET current_version_id = %s::uuid "
                    " WHERE id = %s::uuid", (version, nodo))
        # Y permiso para el emisor, que ahora hace falta para emitir.
        for _uid in (emisor,):
            cur.execute("INSERT INTO folder_permissions (folder_node_id, user_id, "
                        "  sujeto_tipo, sujeto_id, permission_level) "
                        "VALUES (%s::uuid,%s,'USER',%s::text,'edit')",
                        (raiz, _uid, _uid))
        conn.commit()
        db._project_resolver_cache['map'] = None

        SES = {
            'ana1': {'id': ana1, 'email': PREFIJO + 'ana.torres@supervisora.test',
                     'name': 'Ana Torres', 'role': 'editor'},
            'ana2': {'id': ana2, 'email': PREFIJO + 'a.torres@constructora.test',
                     'name': 'Ana Torres', 'role': 'editor'},
            'emisor': {'id': emisor, 'email': PREFIJO + 'resi@t',
                       'name': 'Residente', 'role': 'editor'},
        }

        _titulo('0 · el modelo permite dos identidades con el mismo NOMBRE')
        cur.execute("SELECT count(*), count(DISTINCT id) FROM users WHERE name = 'Ana Torres' "
                    "  AND email LIKE %s", (PREFIJO + '%',))
        n, ids = cur.fetchone()
        _paso(n == 2 and ids == 2, 'dos usuarios distintos se llaman igual', '%d' % n)

        # ¿Y con el mismo CORREO? El modelo NO lo permite, y se comprueba en vez
        # de suponerlo: si algun dia lo permitiera, esta prueba lo diria.
        cur.execute('SAVEPOINT dup')
        mismo_correo = False
        try:
            cur.execute("INSERT INTO users (name, email, password_hash, role, is_active) "
                        "VALUES ('Otra',%s,'x','editor',TRUE)",
                        (PREFIJO + 'ana.torres@supervisora.test',))
            mismo_correo = True
            cur.execute('ROLLBACK TO SAVEPOINT dup')
        except Exception:
            cur.execute('ROLLBACK TO SAVEPOINT dup')
        _paso(not mismo_correo,
              'y el correo SI es unico: dos identidades no pueden compartirlo, '
              'asi que ese caso no existe en este modelo')
        conn.commit()

        # ── Emision NUEVA, por la ruta real ──────────────────────────────
        _titulo('1 · emision NUEVA: los destinatarios nacen con identidad')
        c = cliente(SES['emisor'], rt.transmittals_bp)
        r = c.post('/api/transmittals', json={
            'model_urn': OBRA, 'subject': 'Emision de planos',
            'recipients': [{'email': PREFIJO + 'ana.torres@supervisora.test',
                            'name': 'Ana Torres'},
                           {'email': PREFIJO + 'a.torres@constructora.test',
                            'name': 'Ana Torres'}],
            'items': [{'node_id': nodo, 'version_id': version,
                       'version_number': 1, 'name': 'PLANO.pdf'}]})
        ok = r.status_code in (200, 201)
        _paso(ok, 'se emite', str(r.get_json())[:70])
        if not ok:
            return 1
        cur.execute("SELECT id, recipients FROM transmittals WHERE model_urn=%s "
                    " ORDER BY id DESC LIMIT 1", (OBRA,))
        tid, recips = cur.fetchone()
        ids_dest = sorted(x.get('user_id') for x in recips)
        _paso(ids_dest == sorted([ana1, ana2]),
              'y cada destinataria queda con SU identidad, no con su nombre',
              str(ids_dest))

        for uid in (ana1, ana2):
            e = enc.abrir(cur, 'TRANSMITTAL', str(tid), 'Acusar recibo de TR',
                          destino_usuario=uid, creado_por=PREFIJO + 'resi@t')
        conn.commit()
        _paso(len(enc.mi_trabajo(cur, ana1)) == 1 and len(enc.mi_trabajo(cur, ana2)) == 1,
              'las dos lo tienen en Mi Trabajo')

        _titulo('2 · acusa UNA: el encargo de la otra NO se cierra')
        r = cliente(SES['ana1'], rt.transmittals_bp).post(
            '/api/transmittals/%s/acuse' % tid, json={})
        _paso(r.status_code == 200, 'la primera Ana acusa recibo',
              str(r.get_json())[:60])
        cur.execute("SELECT acuses FROM transmittals WHERE id=%s", (tid,))
        acuses = cur.fetchone()[0]
        _paso(len(acuses) == 1 and acuses[0].get('por_id') == ana1,
              'el acuse queda FIRMADO con su identidad, no solo con su nombre',
              str(acuses[0])[:70])
        _paso(len(enc.mi_trabajo(cur, ana1)) == 0,
              'su encargo se cierra')
        _paso(len(enc.mi_trabajo(cur, ana2)) == 1,
              'y el de su HOMONIMA sigue abierto: era el defecto exacto')

        _titulo('3 · la conciliacion tampoco confunde a las homonimas')
        d = enc.divergencias(cur)
        sobra_ana2 = [x for x in d['sobrantes']
                      if x[1] == 'TRANSMITTAL' and str(x[2]) == str(tid)]
        _paso(not sobra_ana2,
              'no declara sobrante el encargo de quien NO ha acusado',
              str(sobra_ana2)[:70])
        falta = [f for f in d['faltantes'] if f[0] == 'TRANSMITTAL' and f[2] == ana1]
        _paso(not falta, 'ni echa en falta el de quien SI acuso')
        c1, a1, _ = enc.conciliar(cur, aplicar=True, actor='ensayo')
        conn.commit()
        c2, a2, _ = enc.conciliar(cur, aplicar=True, actor='ensayo')
        conn.commit()
        _paso(c2 == 0 and a2 == 0,
              'IDEMPOTENTE: la segunda pasada no mueve nada',
              'primera: -%d +%d' % (c1, a1))
        _paso(len(enc.mi_trabajo(cur, ana1)) == 0 and len(enc.mi_trabajo(cur, ana2)) == 1,
              'y Mi Trabajo sigue diciendo lo mismo tras conciliar')

        _titulo('4 · acusa la segunda')
        r = cliente(SES['ana2'], rt.transmittals_bp).post(
            '/api/transmittals/%s/acuse' % tid, json={})
        _paso(r.status_code == 200, 'la segunda Ana acusa')
        _paso(len(enc.mi_trabajo(cur, ana2)) == 0, 'y ahora si se cierra el suyo')
        cur.execute("SELECT acuses FROM transmittals WHERE id=%s", (tid,))
        acuses = cur.fetchone()[0]
        _paso(len(acuses) == 2 and sorted(a['por_id'] for a in acuses) == sorted([ana1, ana2]),
              'los DOS acuses constan, cada uno con su identidad',
              str(sorted(a['por_id'] for a in acuses)))

        _titulo('5 · emision LEGACY: sigue funcionando por texto')
        cur.execute("INSERT INTO transmittals (model_urn, number, subject, items, "
                    "  recipients, acuses, created_by) "
                    "VALUES (%s,900,'Emision heredada',%s::jsonb,%s::jsonb,"
                    "  '[]'::jsonb,%s) RETURNING id",
                    (OBRA, json.dumps([{'node_id': nodo, 'name': 'VIEJO.pdf'}]),
                     json.dumps([{'email': PREFIJO + 'ana.torres@supervisora.test',
                                  'name': 'Ana Torres'}]),   # SIN user_id
                     PREFIJO + 'resi@t'))
        tid_v = cur.fetchone()[0]
        e = enc.abrir(cur, 'TRANSMITTAL', str(tid_v), 'Acusar recibo de TR-900',
                      destino_usuario=ana1, creado_por=PREFIJO + 'resi@t')
        conn.commit()
        cur.execute("SELECT recipients FROM transmittals WHERE id=%s", (tid_v,))
        _paso(not any(x.get('user_id') for x in cur.fetchone()[0]),
              'la emision heredada NO se convierte: sigue sin `user_id`')
        _paso(len(enc.mi_trabajo(cur, ana1)) == 1, 'y le corre a la primera Ana')
        # Un acuse LEGACY, escrito como se escribian antes: solo texto.
        cur.execute("UPDATE transmittals SET acuses = %s::jsonb WHERE id = %s",
                    (json.dumps([{'por': 'Ana Torres',
                                  'en': datetime.datetime.now().isoformat()}]), tid_v))
        conn.commit()
        _paso(not enc._sigue_debiendose(cur, 'TRANSMITTAL', str(tid_v), ana1),
              'un acuse legacy por TEXTO sigue saldando la emision heredada')
        d = enc.divergencias(cur)
        _paso(any(x[1] == 'TRANSMITTAL' and str(x[2]) == str(tid_v)
                  for x in d['sobrantes']),
              'y la conciliacion lo ve: su encargo sobra',
              str(d['sobrantes'])[:80])
        c1, a1_, _ = enc.conciliar(cur, aplicar=True, actor='ensayo')
        conn.commit()
        _paso(len(enc.mi_trabajo(cur, ana1)) == 0, 'y lo cierra')
        c2, a2_, _ = enc.conciliar(cur, aplicar=True, actor='ensayo')
        conn.commit()
        _paso(c2 == 0 and a2_ == 0, 'sin dejar de ser idempotente')

        _titulo('6 · el acuse legacy NO puede saldar una emision NUEVA')
        # Mismo texto, emision con identidad: el nombre ya no vale.
        cur.execute("SELECT acuses FROM transmittals WHERE id=%s", (tid,))
        _paso(enc._acuso([{'por': 'Ana Torres'}], SES['ana2']['email'],
                         'Ana Torres', ana2) is True,
              'un acuse SIN `por_id` se sigue cotejando por texto (legacy)')
        _paso(enc._acuso([{'por': 'Ana Torres', 'por_id': ana1}],
                         SES['ana2']['email'], 'Ana Torres', ana2) is False,
              'pero uno CON `por_id` no alcanza a la homonima: identidad estricta')
        _paso(enc._acuso([{'por': 'Ana Torres', 'por_id': ana1}],
                         SES['ana1']['email'], 'Ana Torres', ana1) is True,
              'y si alcanza a quien de verdad acuso')

        _titulo('7 · ninguna otra semantica de `encargos` cambia')
        _paso(enc.ESTADOS_DE_CIERRE == ('cerrado', 'respondido', 'closed', 'answered'),
              'los estados de cierre son los mismos')
        _paso(enc.TIPOS == ('REVIEW', 'RFI', 'REDLINE', 'TRANSMITTAL'),
              'y los cuatro tipos, tambien')
        sin_destino = enc.abrir(cur, 'TRANSMITTAL', str(tid), 'x',
                                destino_usuario=999999, creado_por='x')
        _paso(not sin_destino,
              'y un encargo a quien NO es miembro sigue sin abrirse: un encargo '
              'nunca da acceso')

        limpiar(cur)
        conn.commit()

    fallos = [p for p in _pasos if not p[0]]
    print()
    print('=' * 76)
    print('%d de %d comprobaciones pasan' % (len(_pasos) - len(fallos), len(_pasos)))
    print('=' * 76)
    return 1 if fallos else 0


if __name__ == '__main__':
    raise SystemExit(main())
