# -*- coding: utf-8 -*-
"""Base de juguete para las rutas de la Planilla (routes/planilla.py): las dos tablas
(planilla_itemizados y planilla_criterios_medida) y el registro de frentes (project_frentes).

Imita lo que importa de PostgreSQL para estas rutas:
  - `con_frente=False` es la base ANTES de la migración 42: la columna `frente` no existe y la
    sentencia que la nombra falla como en la base real; el índice es «una vigente por obra»;
  - `con_frente=True` es la base con la 42: «una vigente por obra y frente»;
  - una tabla que no existe falla con el texto de la base real;
  - `frentes` = los front_id registrados por obra (vacío = la obra no registra frentes).
No es un intérprete de SQL: reconoce las sentencias de la ruta y falla con la que no conoce.
"""
import contextlib
import json
import re

ITEMIZADOS = 'planilla_itemizados'
CRITERIOS = 'planilla_criterios_medida'


class Base:
    def __init__(self, principal=ITEMIZADOS, con_frente=True, frentes=None):
        self.principal = principal
        self.con_frente = con_frente
        self.existe = {ITEMIZADOS: True, CRITERIOS: True}
        self.tablas = {ITEMIZADOS: [], CRITERIOS: []}
        self.frentes = frentes if frentes is not None else {}
        self.registro_de_frentes = True
        self.locks, self.commits, self.rollbacks = [], 0, 0

    @property
    def filas(self):
        return self.tablas[self.principal]

    def conexion(self):
        return contextlib.nullcontext(Conn(self))


class Conn:
    def __init__(self, base):
        self.base = base

    def cursor(self):
        return Cursor(self.base)

    def commit(self):
        self.base.commits += 1

    def rollback(self):
        self.base.rollbacks += 1


def _filtra(filas, obra, frente=None, solo_vigentes=False):
    return [f for f in filas if f['project_id'] == obra and (frente is None or f['frente'] == frente)
            and (f['vigente'] or not solo_vigentes)]


class Cursor:
    def __init__(self, base):
        self.b, self.res = base, []

    def execute(self, sql, params=()):
        s = ' '.join(sql.split())
        b = self.b
        if s == "SELECT to_regclass('public.project_frentes')":
            self.res = [('project_frentes' if b.registro_de_frentes else None,)]
            return
        if s.startswith('SELECT front_id FROM project_frentes'):
            self.res = [(f,) for f in b.frentes.get(params[0], [])]
            return
        if s.startswith('SELECT pg_advisory_xact_lock'):
            b.locks.append(params[0])
            self.res = [(None,)]
            return
        tabla = ITEMIZADOS if ITEMIZADOS in s else CRITERIOS if CRITERIOS in s else None
        if tabla is None:
            raise AssertionError(s)
        if not b.existe[tabla]:
            raise RuntimeError(f'relation "{tabla}" does not exist')
        nombra_frente = re.search(r'\bfrente\b', s) is not None
        if nombra_frente and not b.con_frente:
            raise RuntimeError('column "frente" does not exist')
        filas = b.tablas[tabla]
        p = list(params)
        frente_en_where = bool(re.search(r'\.frente = %s', s))

        if s.startswith(('SELECT i.version, i.archivo, i.hoja', 'SELECT c.version, c.criterios')):
            obra = p[0]
            frente = p[1] if frente_en_where else None
            v = _filtra(filas, obra, frente, solo_vigentes=True)
            if tabla == ITEMIZADOS:
                self.res = [(f['version'], f['archivo'], f['hoja'], f['columnas'], f['items'], f['n_items'], f['huella'],
                             None, 'Ana') for f in v]
            else:
                self.res = [(f['version'], f['criterios'], f['n'], f['huella'], None, 'Ana') for f in v]
        elif s.startswith(('SELECT i.version, i.archivo, i.n_items', 'SELECT c.version, c.n_criterios')):
            obra, limite = p[0], p[-1]
            frente = p[1] if frente_en_where else None
            v = sorted(_filtra(filas, obra, frente), key=lambda f: -f['version'])[:limite]
            if tabla == ITEMIZADOS:
                self.res = [(f['version'], f['archivo'], f['n_items'], None, 'Ana', f['vigente'], f['retirado_en']) for f in v]
            else:
                self.res = [(f['version'], f['n'], None, 'Ana', f['vigente']) for f in v]
        elif s.startswith(('SELECT i.version, i.huella', 'SELECT c.version, c.huella')):
            frente = p[1] if frente_en_where else None
            self.res = [(f['version'], f['huella']) for f in _filtra(filas, p[0], frente, solo_vigentes=True)]
        elif s.startswith('UPDATE'):
            uid, obra = p[0], p[1]
            frente = p[2] if frente_en_where else None
            hechas = []
            for f in _filtra(filas, obra, frente, solo_vigentes=True):
                f.update(vigente=False, retirado_por=uid, retirado_en='ahora')
                hechas.append((f['version'],))
            self.res = hechas if 'RETURNING' in s else []
        elif s.startswith('SELECT COALESCE(MAX(version), 0) + 1'):
            self.res = [(max([f['version'] for f in filas if f['project_id'] == p[0]], default=0) + 1,)]
        elif s.startswith('INSERT INTO'):
            frente = p[-1] if nombra_frente else ''
            if tabla == ITEMIZADOS:
                obra, version, archivo, hoja, columnas, items, n, huella, uid = p[:9]
                fila = {'archivo': archivo, 'hoja': hoja, 'columnas': json.loads(columnas), 'items': json.loads(items),
                        'n_items': n}
            else:
                obra, version, criterios, n, huella, uid = p[:6]
                fila = {'criterios': json.loads(criterios), 'n': n}
            # Los índices únicos de la base real.
            if b.con_frente:
                assert not _filtra(filas, obra, frente, solo_vigentes=True), 'dos vigentes en la misma obra y frente'
            else:
                assert not _filtra(filas, obra, solo_vigentes=True), 'dos vigentes en la misma obra'
            assert not any(f['project_id'] == obra and f['version'] == version for f in filas), 'versión repetida'
            fila.update(project_id=obra, frente=frente, version=version, huella=huella, creado_por=uid,
                        vigente=True, retirado_por=None, retirado_en=None)
            filas.append(fila)
            self.res = []
        else:
            raise AssertionError(s)

    def fetchone(self):
        return self.res[0] if self.res else None

    def fetchall(self):
        return list(self.res)
