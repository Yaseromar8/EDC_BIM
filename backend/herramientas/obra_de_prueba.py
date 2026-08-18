# -*- coding: utf-8 -*-
"""Crea en la base LOCAL una obra que se parece a la real, para poder probar.

POR QUE EXISTE
--------------
Al separar desarrollo de produccion, el entorno local se quedo sin datos: la
base de pruebas nace vacia. Y un entorno de desarrollo vacio no sirve para
desarrollar, asi que la tentacion es volver a apuntar local a produccion -- que
es exactamente lo que hacia que un experimento en el portatil archivara una obra
de verdad.

Esto genera la alternativa: una obra con la MISMA FORMA que la real -- la
nomenclatura del proyecto, las especialidades, los estados del ciclo ECD -- pero
con contenido inventado. Nada sale de produccion: ni un documento, ni un usuario,
ni una fotografia. Asi se puede probar de verdad sin meter datos personales ni
fotos con GPS en un entorno de pruebas.

QUE CREA
--------
Una obra con carpetas por especialidad y documentos en los cuatro estados del
ciclo, para que se vea funcionar el ECD entero:
  · documentos en WIP, algunos con la nomenclatura mal puesta a proposito
  · documentos COMPARTIDOS con su codigo de idoneidad
  · un documento PUBLICADO con dos versiones, para probar el historial
  · un documento ARCHIVADO

SE NIEGA A CORRER FUERA DE LOCAL, por lo mismo que clave_local.py.
"""

import os
import sys
import uuid

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

HOSTS_LOCALES = ('127.0.0.1', 'localhost', '::1')

# La nomenclatura real del paquete 8 de Talara: <proyecto>-<paquete>-<disciplina>
# -<tipo>-<correlativo>. Los documentos son inventados; el PATRON es el de verdad,
# que es lo que hay que poder probar.
CARPETAS = {
    '01_Gestion_de_Proyecto': [
        ('500125-PQ08-GEN-PLN-0001_Plan de Ejecucion BIM.pdf', 'PUBLISHED', 'A1'),
        ('500125-PQ08-GEN-ACT-0002_Acta de reunion semanal.pdf', 'SHARED', 'S3'),
    ],
    '02_Planos_Aprobados': [
        ('500125-PQ08-DRE-PLA-0010_Planta general de drenaje.pdf', 'PUBLISHED', 'A1'),
        ('500125-PQ08-DRE-PLA-0011_Perfil longitudinal PK 0+000 a 0+500.pdf', 'PUBLISHED', 'A1'),
        ('500125-PQ08-DRE-PLA-0012_Secciones tipo de zanja.pdf', 'SHARED', 'S3'),
    ],
    '03_Modelos': [
        ('500125-PQ08-DRE-MOD-0001_Modelo de drenaje.rvt', 'SHARED', 'S3'),
        ('500125-PQ08-CIV-MOD-0002_Modelo de movimiento de tierras.rvt', 'WIP', None),
    ],
    '04_Documentos_de_Trabajo': [
        ('500125-PQ08-DRE-MEM-0020_Memoria de calculo hidraulico.docx', 'WIP', None),
        ('borrador sin nomenclatura.docx', 'WIP', None),          # a proposito: no conforme
        ('500125-PQ08-DRE-PLA-0009_Planta general REEMPLAZADA.pdf', 'ARCHIVED', 'A1'),
    ],
}


def main():
    from dotenv import load_dotenv
    load_dotenv()
    load_dotenv(os.path.join(os.path.dirname(os.path.dirname(
        os.path.dirname(os.path.abspath(__file__)))), '.env'))

    host = (os.getenv('DB_HOST') or '').strip()
    if host not in HOSTS_LOCALES:
        raise SystemExit(f'NO. DB_HOST es {host!r}, que no es esta maquina. '
                         f'Esta herramienta solo crea datos en la base de desarrollo.')

    import db
    db.init_db_pool()
    import estados_ecd as ecd
    from file_system_db import create_file_record, resolve_path_to_node_id

    obra_id = 'p_talara_pruebas'
    nombre = 'PQT8 Talara (PRUEBAS)'
    autor = 'desarrollo@local.test'

    with db.get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute("""INSERT INTO projects (id, name, description, project_type, status)
                       VALUES (%s, %s, %s, 'Infraestructura', 'active')
                       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name""",
                    (obra_id, nombre,
                     'Obra de PRUEBAS con la forma de la real. Ningun dato viene de produccion.'))
        # Que la vea todo el mundo que exista en esta base de desarrollo.
        cur.execute('SELECT id FROM users')
        for (uid,) in cur.fetchall():
            cur.execute("""INSERT INTO project_users (project_id, user_id)
                           VALUES (%s, %s) ON CONFLICT DO NOTHING""", (obra_id, uid))
        conn.commit()
    print(f'obra: {nombre}  ({obra_id})')

    creados = 0
    for carpeta, documentos in CARPETAS.items():
        parent = resolve_path_to_node_id(carpeta + '/', obra_id,
                                         created_by=autor, auto_create=True)
        for nombre_doc, estado, idoneidad in documentos:
            gcs = f'multi-tenant/{obra_id}/{uuid.uuid4().hex}_{nombre_doc}'
            node_id, version = create_file_record(
                obra_id, parent, nombre_doc, 1024 * 250, gcs,
                mime_type='application/pdf', created_by=autor,
                # Huella de mentira pero con la forma correcta: asi la cobertura
                # de integridad no sale al 0% y se puede probar la comprobacion.
                sha256=uuid.uuid4().hex + uuid.uuid4().hex)
            creados += 1

            # Una segunda version en el plano publicado, para ver el historial.
            if nombre_doc.endswith('0010_Planta general de drenaje.pdf'):
                create_file_record(obra_id, parent, nombre_doc, 1024 * 310,
                                   f'multi-tenant/{obra_id}/{uuid.uuid4().hex}_v2',
                                   mime_type='application/pdf', created_by=autor,
                                   sha256=uuid.uuid4().hex + uuid.uuid4().hex)

            if estado == ecd.WIP:
                continue
            # Se pasa por la PUERTA UNICA, no con un UPDATE a mano: asi los datos
            # de prueba nacen con su rastro de auditoria, como los de verdad.
            with db.get_db_connection() as conn:
                cur = conn.cursor()
                camino = [ecd.SHARED] if estado == ecd.SHARED else \
                         [ecd.SHARED, ecd.PUBLISHED] if estado == ecd.PUBLISHED else \
                         [ecd.SHARED, ecd.PUBLISHED, ecd.ARCHIVED]
                for destino in camino:
                    # El codigo de idoneidad depende del DESTINO, no del documento:
                    # la familia S es para compartir y la A para publicar. La puerta
                    # lo comprueba, y con razon: 'A1, apto para construccion' en un
                    # documento que solo se compartio seria una autorizacion falsa.
                    codigo = {ecd.SHARED: 'S3', ecd.PUBLISHED: idoneidad or 'A1'}.get(destino)
                    try:
                        ecd.transicionar(
                            cur, obra_id, [node_id], destino,
                            {'email': autor, 'role': 'admin'},
                            motivo_del_cambio='datos de prueba',
                            # autorizar es una FUNCION que se pregunta por documento,
                            # no un si/no. Aqui, datos de prueba: siempre autorizado.
                            autorizar=lambda _nid: True,
                            codigo_idoneidad=codigo)
                    except Exception as e:
                        print(f'   (aviso) {nombre_doc} -> {destino}: {e}')
                        break
                conn.commit()

    print(f'documentos creados: {creados}')
    print('Entra en local y la veras entre tus obras.')


if __name__ == '__main__':
    main()
