# -*- coding: utf-8 -*-
"""Recuerda por correo los encargos vencidos o a punto de vencer.

ESTO NO ES UN «RECORDATORIO AUTOMATICO», Y NO DEBE VENDERSE COMO TAL
--------------------------------------------------------------------
Es una CAPACIDAD DISPONIBLE que alguien tiene que programar. Mientras no exista
una ejecucion programada cuya salida se pueda comprobar, decir «el sistema
recuerda solo» seria prometer algo que nadie puede demostrar -- y un recordatorio
que se para en silencio es peor que no tenerlo, porque la gente deja de vigilar
sus plazos confiando en el.

POR QUE UN GUION Y NO UN PROCESO RESIDENTE
------------------------------------------
Un proceso en segundo plano dentro del backend traeria su propia caja de
problemas --que pasa con varios workers, que pasa si se reinicia a mitad, como se
sabe que corrio-- y ninguno hace falta todavia. Un guion hace lo mismo, se puede
ejecutar a mano, y deja su salida a la vista.

COMO SE PROGRAMA, SI SE DECIDE HACERLO
--------------------------------------
Con la arquitectura de hoy, una tarea programada del proveedor (en Render, un
Cron Job) que ejecute una vez al dia:

    cd backend && ./venv/bin/python herramientas/recordatorios.py --enviar

No hace falta nada mas: ni demonio, ni cola, ni plano de control. Lo que SI hace
falta antes de llamarlo automatico es una forma de saber que corrio.

POR QUE ES SEGURO EJECUTARLO VARIAS VECES
-----------------------------------------
Porque recuerda a lo sumo UNA VEZ CADA `--cada-horas` (24 por defecto). Sin esa
memoria, programarlo cada hora enviaria un correo por hora a la misma persona
por el mismo encargo: el camino mas corto para que la gente filtre los avisos
del sistema a la papelera, y entonces ya no sirve ninguno.

QUE NO HACE
-----------
No cambia ningun encargo salvo la marca de aviso, y no toca ningun objeto. Un
recordatorio no reasigna, no escala y no cierra nada: solo avisa.

    python herramientas/recordatorios.py            # ensayo, no envia
    python herramientas/recordatorios.py --enviar
    python herramientas/recordatorios.py --enviar --dias 3   # y los que vencen en 3 dias
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


def pendientes_de_recordar(cur, dias, cada_horas=24):
    """Encargos abiertos vencidos, o que vencen dentro de `dias` calendario.

    Dos filtros, y los dos importan:

      - `avisado_en IS NOT NULL`: solo se recuerda lo que ya se anuncio. Recordar
        algo que nunca se anuncio no es un recordatorio, es un aviso tardio.
      - `recordado_en` mas antiguo que `cada_horas`: no se insiste dos veces
        seguidas. Sin esto, programarlo cada hora enviaria un correo por hora a
        la misma persona por el mismo encargo.

    `dias` son dias CALENDARIO: no hay calendario de feriados.
    """
    cur.execute("""
        SELECT id, project_id, objeto_tipo, asunto, vence_en, destino_usuario,
               destino_funcion, recordado_en
          FROM encargos
         WHERE estado = 'abierto'
           AND vence_en IS NOT NULL
           AND vence_en <= CURRENT_TIMESTAMP + (%s || ' days')::interval
           AND avisado_en IS NOT NULL
           AND (recordado_en IS NULL
                OR recordado_en <= CURRENT_TIMESTAMP - (%s || ' hours')::interval)
         ORDER BY vence_en
    """, (str(int(dias)), str(int(cada_horas))))
    return cur.fetchall()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--enviar', action='store_true', help='envia de verdad')
    ap.add_argument('--dias', type=int, default=0,
                    help='cuantos dias CALENDARIO por delante mirar (0 = solo lo vencido)')
    ap.add_argument('--cada-horas', type=int, default=24, dest='cada_horas',
                    help='no recordar el mismo encargo mas de una vez cada N horas')
    a = ap.parse_args()

    init_db_pool()
    with get_db_connection() as conn:
        cur = conn.cursor()
        filas = pendientes_de_recordar(cur, a.dias, a.cada_horas)
        print()
        print('%d encargo(s) %s, sin recordar en las ultimas %d h'
              % (len(filas),
                 'vencidos' if a.dias == 0
                 else 'vencidos o que vencen en %d dia(s) calendario' % a.dias,
                 a.cada_horas))
        enviados = 0
        for eid, obra, tipo, asunto, vence, uid, funcion, ya in filas:
            destino = ('usuario %s' % uid) if uid else ('funcion %s' % funcion)
            print('  #%-6s %-12s %-40s vence %s  -> %-16s %s'
                  % (eid, tipo, (asunto or '')[:40], vence.strftime('%d/%m/%Y'), destino,
                     ('ya recordado %s' % ya.strftime('%d/%m %H:%M')) if ya else 'sin recordar'))
            if a.enviar:
                enviados += enc.avisar(cur, eid, es_recordatorio=True)
        if a.enviar:
            conn.commit()
            print()
            print('%d correo(s) enviados.' % enviados)
        else:
            conn.rollback()
            print()
            print('Ensayo. Para enviar:  python herramientas/recordatorios.py --enviar')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
