# -*- coding: utf-8 -*-
"""¿La proyeccion `encargos` coincide con el estado real de sus objetos?

POR QUE EXISTE
--------------
Se acepto --y con razon-- que un fallo de la proyeccion nunca impida una
transicion contractual del objeto: un acuse, una respuesta o una aprobacion
tienen que sobrevivir aunque `encargos` falle. Eso abre exactamente un caso:

    RFI = RESPONDIDO   con su   encargo = ABIERTO

Alguien seguiria viendo en su bandeja una deuda que ya salda. `huerfanos()` no
lo detectaba: solo miraba si el objeto existia, no en que estado esta.

Esta herramienta responde la pregunta de forma determinista y, si se le pide,
repara. Es idempotente: correrla dos veces seguidas no cambia nada la segunda.

POR QUE AQUI SI SE PUEDE REPARAR
--------------------------------
`conciliacion_almacen.py` no borra nunca, porque borrar bytes es irreversible.
Aqui es distinto: el objeto sigue siendo la fuente de verdad y esto solo ajusta
su reflejo. Cerrar un encargo sobrante o abrir uno que falta no pierde nada.
Aun asi, por defecto solo informa.

QUE NO PUEDE COMPROBAR, Y POR QUE
---------------------------------
De un RFI o un Redline se puede detectar que SOBRA un encargo (el objeto ya esta
respondido), pero no que FALTE. Su responsable es TEXTO LIBRE --en los datos
reales, 'Ing. Valeria Barrenechea'--, asi que del objeto no se puede deducir a
que usuario habria que abrirselo. Es la consecuencia aceptada de la semantica
congelada, no un descuido: el objeto guarda el responsable contractual y el
encargo la responsabilidad operativa estructurada, y no se exige que sean el
mismo dato.

    python herramientas/conciliar_encargos.py             # informe
    python herramientas/conciliar_encargos.py --aplicar   # y repara
"""
import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

import pathlib
from dotenv import load_dotenv
load_dotenv(pathlib.Path(__file__).resolve().parent.parent.parent / '.env')
load_dotenv()

from db import init_db_pool, get_db_connection
import encargos as enc


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--aplicar', action='store_true', help='repara, no solo informa')
    a = ap.parse_args()

    init_db_pool()
    print()
    print('=' * 74)
    print('CONCILIACION DE ENCARGOS   %s' % ('REPARANDO' if a.aplicar else 'SOLO INFORME'))
    print('=' * 74)

    with get_db_connection() as conn:
        cur = conn.cursor()
        try:
            cerrados, abiertos, d = enc.conciliar(cur, aplicar=a.aplicar)
        except enc.TipoNoInterpretable as e:
            print()
            print('  NO SE CONCILIA: %s' % e)
            conn.rollback()
            return 2

        print()
        print('SOBRAN (%d) -- hay encargo abierto y el objeto dice que ya no se debe:'
              % len(d['sobrantes']))
        for eid, tipo, oid, motivo, uid in d['sobrantes']:
            print('  #%-6s %-12s objeto %-38s %s%s'
                  % (eid, tipo, str(oid)[:38], motivo,
                     ('  (usuario %s)' % uid) if uid else ''))

        print()
        print('FALTAN (%d) -- el objeto dice que se debe y no hay encargo:'
              % len(d['faltantes']))
        for tipo, oid, uid, asunto, vence in d['faltantes']:
            print('  %-12s objeto %-26s usuario %-5s %-38s %s'
                  % (tipo, str(oid)[:26], uid, (asunto or '')[:38],
                     ('vence %s' % vence.strftime('%d/%m/%Y')) if vence else 'sin plazo'))

        # Las BLOQUEADAS no son divergencias reparables: son asuntos que
        # necesitan a una persona. Contarlas como «falta un encargo» hacia que
        # la conciliacion intentara repararlas, `abrir()` se negara --un encargo
        # no da acceso-- y el informe dijera «no converge» sin decir por que.
        print()
        print('BLOQUEADAS (%d) -- nadie puede actuar; NO se reparan solas:'
              % len(d.get('bloqueadas') or []))
        for tipo, oid, titulo, motivo in (d.get('bloqueadas') or []):
            print('  %-12s objeto %-26s %-30s' % (tipo, str(oid)[:26], (titulo or '')[:30]))
            print('               %s' % motivo)
        if d.get('bloqueadas'):
            print()
            print('  Reasignar a un revisor que se fue es una decision de obra, no un')
            print('  automatismo: hacerlo solo romperia la regla de independencia.')

        if a.aplicar:
            conn.commit()
            print()
            print('Reparado: %d cerrados, %d abiertos.' % (cerrados, abiertos))
            # Idempotencia comprobada en el sitio: tras reparar no debe quedar nada.
            resto = enc.divergencias(cur)
            quedan = len(resto['sobrantes']) + len(resto['faltantes'])
            print('Comprobacion inmediata: quedan %d divergencias.' % quedan)
            if quedan:
                print('  OJO: la conciliacion no converge. Eso es un fallo, no ruido.')
                return 1
        else:
            conn.rollback()
            total = len(d['sobrantes']) + len(d['faltantes'])
            print()
            if total:
                print('%d divergencia(s). Para repararlas:' % total)
                print('  python herramientas/conciliar_encargos.py --aplicar')
            else:
                print('La proyeccion coincide con el estado real de sus objetos.')
    print()
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
