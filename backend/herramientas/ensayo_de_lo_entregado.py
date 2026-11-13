# -*- coding: utf-8 -*-
"""ENSAYO · «Mi trabajo» dice tambien lo que la persona YA ENTREGO, con la aplicacion real contra PostgreSQL LOCAL.

docs/archivos/31_RESUMEN_AL_ENTRAR_Y_NUBES_RESUELTAS.md. Monta una obra con dos personas (quien aporta y quien
revisa), un plano y sus incidencias y nubes en cada estado, y pregunta `GET /api/mi-trabajo` como cada una.

    DB_HOST=127.0.0.1 DB_PORT=<puerto> DB_NAME=ecd_ensayo DB_USER=ecd_app python herramientas/ensayo_de_lo_entregado.py

Se niega a arrancar si la base no esta en esta maquina o no es desechable. No lee ningun `.env` ni llama a ningun
servicio externo. Deja sus filas (prefijo `zz_entregado_`), como los demas ensayos.
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
    return ok


def main():
    if (os.getenv('DB_HOST') or '') not in ('127.0.0.1', 'localhost', '::1'):
        print('ME NIEGO A ARRANCAR: DB_HOST=%r no es esta maquina.' % (os.getenv('DB_HOST'),))
        return 2
    if not re.search(r'(test|ensayo|prueba|banco)', os.getenv('DB_NAME') or '', re.I):
        print('ME NIEGO A ARRANCAR: DB_NAME=%r no parece una base desechable.' % (os.getenv('DB_NAME'),))
        return 2
    if os.getenv('DATABASE_URL'):
        print('ME NIEGO A ARRANCAR: DATABASE_URL esta definida y podria mandar sobre DB_NAME.')
        return 2
    for clave in ('RESEND_API_KEY', 'GOOGLE_APPLICATION_CREDENTIALS', 'APS_CLIENT_ID', 'APS_CLIENT_SECRET',
                  'REDIS_URL'):
        os.environ[clave] = ''
    os.environ.update({'AUTH_POLICY_MODE': 'estricto', 'ENFORCE_PROJECT_AUTHZ': 'true', 'DDL_EN_CALIENTE': 'false',
                       'FLASK_SKIP_DOTENV': '1'})
    os.environ.setdefault('APP_SECRET', secrets.token_hex(24))

    import db
    db.init_db_pool()
    import server
    import auth_middleware as am
    import referencias_de_obra as ref

    run = time.strftime('%H%M%S')
    obra, otra = 'zz_entregado_%s' % run, 'zz_entregado_otra_%s' % run
    doc = '0b5a3c52-7f1e-4d1a-9c3e-%012d' % int(run)
    U = {}
    with db.get_db_connection() as conn:
        cur = conn.cursor()
        for pid in (obra, otra):
            cur.execute("INSERT INTO projects (id, name, model_urn, status) VALUES (%s,%s,%s,'active')",
                        (pid, 'ZZ ' + pid, pid))
            ref.registrar_obra(cur, pid, nombre='ZZ ' + pid, model_urn=pid, origen='ensayo de lo entregado')
        for clave, obras in (('aporta', (obra,)), ('revisa', (obra, otra)), ('ajeno', (obra,))):
            cur.execute("INSERT INTO users (name, email, password_hash, role, is_active, activated_at) "
                        "VALUES (%s,%s,'x','editor',TRUE,CURRENT_TIMESTAMP) RETURNING id",
                        ('ZZ Entregado ' + clave, 'zz_entregado_%s_%s@ensayo.test' % (clave, run)))
            U[clave] = cur.fetchone()[0]
            for pid in obras:
                cur.execute('INSERT INTO project_users (project_id, user_id) VALUES (%s,%s)', (pid, U[clave]))

        evidencia = json.dumps([{'tipo': 'plano', 'documento': doc, 'version_id': None}])
        numero = [0]

        def incidencia(pid, estado, responsable, titulo, history='[]'):
            numero[0] += 1
            corregida = estado in ('Corregido', 'Verificado')
            cur.execute("""INSERT INTO doc_issues
                               (project_id, model_urn, codigo, tipo, titulo, autor_id, responsable_id, verificador_id,
                                verificado_por, created_by, estado, evidencia, evidencia_correccion, corregido_en,
                                origen_tipo, origen_id, history)
                           VALUES (%s,%s,%s,'OBSERVACION',%s,%s,%s,%s,%s,'zz',%s,%s::jsonb,%s::jsonb,%s,'PLANO',%s,
                                   %s::jsonb) RETURNING id""",
                        (pid, pid, 'ZZ-%03d' % numero[0], titulo, U['revisa'], responsable, U['revisa'],
                         U['revisa'] if estado == 'Verificado' else None, estado, evidencia,
                         '[{"nota": "ensayo"}]' if corregida else '[]',
                         'now' if corregida else None, doc, history))
            return cur.fetchone()[0]

        def nube(iid, pid, estado, destino, pedido, entregas):
            cur.execute("""INSERT INTO doc_issue_nubes (issue_id, model_urn, clase, destino_usuario, pedido, estado,
                                                        ronda, rondas, creado_por)
                           VALUES (%s,%s,'observacion',%s,%s,%s,1,%s::jsonb,%s) RETURNING id""",
                        (iid, pid, destino, pedido, estado, json.dumps([{'n': 1, 'entregas': entregas}]), U['revisa']))
            return cur.fetchone()[0]

        viva = incidencia(obra, 'Abierto', U['aporta'], 'Plano de planta')
        n_nota = nube(viva, obra, 'entregada', U['aporta'], 'Mover el cuadro de areas',
                      [{'tipo': 'nota', 'texto': 'Movido'}])
        n_doc = nube(viva, obra, 'entregada', U['aporta'], 'Fotos de la junta',
                     [{'tipo': 'documento', 'documento': doc, 'nombre': 'foto.jpg'}])
        nube(viva, obra, 'pedida', U['aporta'], 'Todavia sin entregar', [])
        nube(viva, obra, 'aceptada', U['aporta'], 'Ya aceptada', [{'tipo': 'nota', 'texto': 'x'}])
        nube(viva, obra, 'entregada', U['ajeno'], 'De otra persona', [{'tipo': 'nota', 'texto': 'x'}])
        corregida = incidencia(obra, 'Corregido', U['aporta'], 'La cota de fondo no cuadra')
        incidencia(obra, 'Verificado', U['aporta'], 'Ya verificada')
        cerrada = incidencia(obra, 'Verificado', U['aporta'], 'Cerrada con una nube que quedo entregada')
        nube(cerrada, obra, 'entregada', U['aporta'], 'De una incidencia cerrada', [{'tipo': 'nota', 'texto': 'x'}])
        descartada = incidencia(obra, 'Abierto', U['aporta'], 'Descartada',
                                history='[{"event": "discarded"}]')
        nube(descartada, obra, 'entregada', U['aporta'], 'De una descartada', [{'tipo': 'nota', 'texto': 'x'}])
        # En una obra de la que quien aporta NO es miembro: no puede salir.
        fuera = incidencia(otra, 'Abierto', U['aporta'], 'De otra obra')
        nube(fuera, otra, 'entregada', U['aporta'], 'Entregada en otra obra', [{'tipo': 'nota', 'texto': 'x'}])
        conn.commit()
    db._project_resolver_cache['map'] = None

    cli = server.app.test_client()

    def mi_trabajo(quien, consulta=''):
        r = cli.get('/api/mi-trabajo' + consulta, headers={'Authorization': 'Bearer ' + am.create_session(U[quien])})
        return r.status_code, (r.get_json() or {})

    print()
    print('── quien aporta ve lo que entrego y espera respuesta')
    s, b = mi_trabajo('aporta')
    filas = {f['id']: f for f in b.get('entregados') or []}
    _paso(s == 200 and sorted(filas) == sorted(['nube-%s' % n_nota, 'nube-%s' % n_doc, 'incidencia-%s' % corregida]),
          'salen sus dos nubes entregadas y su incidencia corregida, y nada mas', (s, sorted(filas)))
    _paso((filas.get('nube-%s' % n_nota) or {}).get('asunto', '').startswith('Resuelto en ZZ-001: Mover el cuadro'),
          'la que solo llevaba una nota se dice «Resuelto»', (filas.get('nube-%s' % n_nota) or {}).get('asunto'))
    _paso((filas.get('nube-%s' % n_doc) or {}).get('asunto', '').startswith('Entregado en ZZ-001: Fotos'),
          'la que llevaba un documento, «Entregado»', (filas.get('nube-%s' % n_doc) or {}).get('asunto'))
    f = filas.get('nube-%s' % n_nota) or {}
    _paso(f.get('documento') == doc and f.get('incidencia') == viva and f.get('espera') == 'que lo acepten'
          and f.get('project_id') == obra, 'cada fila lleva su plano y su incidencia, para abrirla, y a que espera', f)
    f = filas.get('incidencia-%s' % corregida) or {}
    _paso(f.get('asunto') == 'Corregido en ZZ-002: La cota de fondo no cuadra' and f.get('espera') == 'que lo verifiquen',
          'la incidencia corregida espera a que la verifiquen', f)
    _paso(isinstance(b.get('pendientes'), list) and b.get('total') == len(b['pendientes']),
          'y lo pendiente sale como siempre')

    print()
    print('── los demas no ven lo de otro')
    s, b = mi_trabajo('revisa')
    _paso(s == 200 and b.get('entregados') == [], 'quien revisa no tiene nada entregado', b.get('entregados'))
    s, b = mi_trabajo('ajeno')
    _paso(s == 200 and [x['asunto'] for x in b.get('entregados') or []] == ['Resuelto en ZZ-001: De otra persona'],
          'cada cual ve solo lo suyo', b.get('entregados'))

    print()
    print('── por obra')
    s, b = mi_trabajo('aporta', '?project_id=' + obra)
    _paso(s == 200 and len(b.get('entregados') or []) == 3, 'con la obra, lo de esa obra', (s, len(b.get('entregados') or [])))

    bien = sum(1 for ok, _ in _pasos if ok)
    print()
    print('RESULTADO: %d/%d' % (bien, len(_pasos)))
    return 0 if bien == len(_pasos) else 1


if __name__ == '__main__':
    sys.exit(main())
