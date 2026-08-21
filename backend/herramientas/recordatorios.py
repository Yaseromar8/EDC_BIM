# -*- coding: utf-8 -*-
"""Recuerda por correo los encargos vencidos o a punto de vencer.

POR QUE UN GUION Y NO UN PROCESO RESIDENTE
------------------------------------------
Un proceso en segundo plano dentro del backend traeria consigo su propia caja de
problemas -- que pasa con varios workers, que pasa si se reinicia a mitad, como
se sabe que corrio -- y ninguno de ellos hace falta todavia. Un guion que el
propietario programa una vez al dia hace exactamente lo mismo, se puede ejecutar
a mano cuando haga falta, y deja su salida a la vista.

Si algun dia hay decenas de entidades, esto se convierte en una tarea del plano
de control. Hoy no hay plano de control, y construirlo para esto seria empezar la
casa por el tejado.

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


def pendientes_de_recordar(cur, dias):
    """Encargos abiertos vencidos, o que vencen dentro de `dias`.

    Solo los que ya se avisaron una vez: recordar algo que nunca se anuncio no
    es un recordatorio, es un aviso que llega tarde.
    """
    cur.execute("""
        SELECT id, project_id, objeto_tipo, asunto, vence_en, destino_usuario, destino_funcion
          FROM encargos
         WHERE estado = 'abierto'
           AND vence_en IS NOT NULL
           AND vence_en <= CURRENT_TIMESTAMP + (%s || ' days')::interval
           AND avisado_en IS NOT NULL
         ORDER BY vence_en
    """, (str(int(dias)),))
    return cur.fetchall()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--enviar', action='store_true', help='envia de verdad')
    ap.add_argument('--dias', type=int, default=0,
                    help='cuantos dias por delante mirar (0 = solo lo vencido)')
    a = ap.parse_args()

    init_db_pool()
    with get_db_connection() as conn:
        cur = conn.cursor()
        filas = pendientes_de_recordar(cur, a.dias)
        print()
        print('%d encargo(s) %s' % (len(filas),
              'vencidos' if a.dias == 0 else 'vencidos o que vencen en %d dia(s)' % a.dias))
        enviados = 0
        for eid, obra, tipo, asunto, vence, uid, funcion in filas:
            destino = ('usuario %s' % uid) if uid else ('funcion %s' % funcion)
            print('  #%-6s %-12s %-46s vence %s  -> %s'
                  % (eid, tipo, (asunto or '')[:46], vence.strftime('%d/%m/%Y'), destino))
            if a.enviar:
                enviados += enc.avisar(cur, eid)
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
