"""Pure domain rules for the LOB Linear 1.0 planning standard."""
from __future__ import annotations

import math
import re


STANDARD_VERSION = 'LOB-LINEAR/1.0'
PROJECT_TYPES = ('road', 'rail', 'canal', 'pipeline', 'tunnel', 'transmission', 'other')


_TEMPLATES = {
    'road': [
        ('SURVEY', 'Topografia y replanteo', 1, 1200, 'm/dia', 'CREW_SURVEY', '#22d3ee'),
        ('CLEAR', 'Desbroce y limpieza', 2, 700, 'm/dia', 'CREW_EARTH', '#84cc16'),
        ('EARTH', 'Movimiento de tierras', 3, 250, 'm/dia', 'CREW_EARTH', '#f59e0b'),
        ('DRAIN', 'Drenaje y obras de arte', 4, 100, 'm/dia', 'CREW_DRAIN', '#14b8a6'),
        ('SUBGRADE', 'Subrasante', 5, 450, 'm/dia', 'CREW_PAVE', '#a3e635'),
        ('SUBBASE', 'Subbase granular', 6, 400, 'm/dia', 'CREW_PAVE', '#eab308'),
        ('BASE', 'Base granular', 7, 350, 'm/dia', 'CREW_PAVE', '#f97316'),
        ('PAVEMENT', 'Pavimento', 8, 300, 'm/dia', 'CREW_PAVE', '#3b82f6'),
        ('FINISH', 'Senalizacion y acabados', 9, 600, 'm/dia', 'CREW_FINISH', '#8b5cf6'),
    ],
    'canal': [
        ('SURVEY', 'Topografia y replanteo', 1, 1000, 'm/dia', 'CREW_SURVEY', '#22d3ee'),
        ('EXCAV', 'Excavacion', 2, 180, 'm/dia', 'CREW_EARTH', '#f59e0b'),
        ('FOUND', 'Preparacion de fundacion', 3, 220, 'm/dia', 'CREW_CIVIL', '#eab308'),
        ('LINING', 'Revestimiento del canal', 4, 100, 'm/dia', 'CREW_CONCRETE', '#3b82f6'),
        ('STRUCT', 'Estructuras y cruces', 5, 60, 'm/dia', 'CREW_STRUCT', '#8b5cf6'),
        ('BACKFILL', 'Relleno y conformacion', 6, 180, 'm/dia', 'CREW_EARTH', '#84cc16'),
        ('TEST', 'Pruebas y puesta en servicio', 7, 500, 'm/dia', 'CREW_TEST', '#22c55e'),
    ],
    'pipeline': [
        ('SURVEY', 'Topografia y replanteo', 1, 1500, 'm/dia', 'CREW_SURVEY', '#22d3ee'),
        ('ROW', 'Liberacion de derecho de via', 2, 800, 'm/dia', 'CREW_ROW', '#84cc16'),
        ('TRENCH', 'Excavacion de zanja', 3, 250, 'm/dia', 'CREW_TRENCH', '#f59e0b'),
        ('BED', 'Cama de apoyo', 4, 300, 'm/dia', 'CREW_PIPE', '#eab308'),
        ('LAY', 'Tendido y montaje de tuberia', 5, 220, 'm/dia', 'CREW_PIPE', '#3b82f6'),
        ('JOINT', 'Juntas y soldadura', 6, 180, 'm/dia', 'CREW_WELD', '#8b5cf6'),
        ('BACKFILL', 'Relleno de zanja', 7, 250, 'm/dia', 'CREW_TRENCH', '#84cc16'),
        ('TEST', 'Pruebas y puesta en servicio', 8, 800, 'm/dia', 'CREW_TEST', '#22c55e'),
    ],
    'rail': [
        ('SURVEY', 'Topografia y replanteo', 1, 1500, 'm/dia', 'CREW_SURVEY', '#22d3ee'),
        ('EARTH', 'Plataforma y movimiento de tierras', 2, 300, 'm/dia', 'CREW_EARTH', '#f59e0b'),
        ('DRAIN', 'Drenaje', 3, 180, 'm/dia', 'CREW_DRAIN', '#14b8a6'),
        ('SUBBALLAST', 'Subbalasto', 4, 450, 'm/dia', 'CREW_TRACK', '#eab308'),
        ('BALLAST', 'Balasto', 5, 500, 'm/dia', 'CREW_TRACK', '#f97316'),
        ('TRACK', 'Via, durmientes y rieles', 6, 350, 'm/dia', 'CREW_TRACK', '#3b82f6'),
        ('SYSTEMS', 'Sistemas y senalizacion', 7, 500, 'm/dia', 'CREW_SYSTEMS', '#8b5cf6'),
        ('TEST', 'Pruebas y puesta en servicio', 8, 1000, 'm/dia', 'CREW_TEST', '#22c55e'),
    ],
    'tunnel': [
        ('SURVEY', 'Topografia y control', 1, 100, 'm/dia', 'CREW_SURVEY', '#22d3ee'),
        ('EXCAV', 'Excavacion y avance', 2, 8, 'm/dia', 'CREW_TUNNEL', '#f59e0b'),
        ('SUPPORT', 'Sostenimiento primario', 3, 8, 'm/dia', 'CREW_SUPPORT', '#ef4444'),
        ('DRAIN', 'Drenaje e impermeabilizacion', 4, 15, 'm/dia', 'CREW_DRAIN', '#14b8a6'),
        ('LINING', 'Revestimiento definitivo', 5, 12, 'm/dia', 'CREW_CONCRETE', '#3b82f6'),
        ('SYSTEMS', 'Instalaciones y sistemas', 6, 25, 'm/dia', 'CREW_SYSTEMS', '#8b5cf6'),
        ('TEST', 'Pruebas y puesta en servicio', 7, 100, 'm/dia', 'CREW_TEST', '#22c55e'),
    ],
    'transmission': [
        ('SURVEY', 'Topografia y replanteo', 1, 3000, 'm/dia', 'CREW_SURVEY', '#22d3ee'),
        ('ACCESS', 'Accesos y plataformas', 2, 800, 'm/dia', 'CREW_ACCESS', '#84cc16'),
        ('FOUND', 'Cimentaciones', 3, 500, 'm/dia', 'CREW_CIVIL', '#f59e0b'),
        ('ERECT', 'Montaje de estructuras', 4, 700, 'm/dia', 'CREW_ERECT', '#3b82f6'),
        ('STRING', 'Tendido de conductor', 5, 1500, 'm/dia', 'CREW_STRING', '#8b5cf6'),
        ('TEST', 'Pruebas y energizacion', 6, 3000, 'm/dia', 'CREW_TEST', '#22c55e'),
    ],
}


def normalize_project_type(value):
    value = str(value or '').strip().lower()
    if value not in PROJECT_TYPES:
        raise ValueError(f"Tipo de proyecto no valido: {value or 'vacio'}")
    return value


def validate_station_range(start, end):
    try:
        start = float(start)
        end = float(end)
    except (TypeError, ValueError) as exc:
        raise ValueError('Las progresivas inicial y final deben ser numericas.') from exc
    if not math.isfinite(start) or not math.isfinite(end) or end <= start:
        raise ValueError('La progresiva final debe ser mayor que la inicial.')
    return start, end


def zone_code(index):
    return f'Z{index:03d}'


def build_zones(station_start, station_end, segment_length):
    station_start, station_end = validate_station_range(station_start, station_end)
    try:
        segment_length = float(segment_length)
    except (TypeError, ValueError) as exc:
        raise ValueError('La longitud de sector debe ser numerica.') from exc
    if not math.isfinite(segment_length) or segment_length <= 0:
        raise ValueError('La longitud de sector debe ser mayor que cero.')
    if segment_length > station_end - station_start:
        segment_length = station_end - station_start
    zones = []
    cursor = station_start
    index = 1
    while cursor < station_end - 1e-9:
        end = min(station_end, cursor + segment_length)
        code = zone_code(index)
        zones.append({
            'code': code,
            'name': f'Sector {code}',
            'station_start': round(cursor, 6),
            'station_end': round(end, 6),
            'sequence': index,
            'zone_type': 'production',
        })
        cursor = end
        index += 1
        if index > 10000:
            raise ValueError('La configuracion genera demasiados sectores.')
    return zones


def methodology_template(project_type):
    project_type = normalize_project_type(project_type)
    source = _TEMPLATES.get(project_type) or _TEMPLATES['pipeline']
    return [{
        'step_code': code,
        'name': name,
        'sequence': sequence,
        'relation_type': 'FS',
        'lag_days': 0,
        'production_rate': rate,
        'production_unit': unit,
        'crew_code': crew,
        'behavior': 'construct',
        'color': color,
    } for code, name, sequence, rate, unit, crew, color in source]


def resource_template(steps):
    resources = {}
    for step in steps:
        code = step.get('crew_code')
        if not code or code in resources:
            continue
        resources[code] = {
            'code': code,
            'name': re.sub(r'^CREW_', 'Cuadrilla ', code).replace('_', ' ').title(),
            'resource_type': 'crew',
            'capacity': 1,
            'unit': 'cuadrilla',
        }
    return list(resources.values())


def readiness(profile, counts, dataset=None):
    checks = [
        {'key': 'profile', 'label': 'Perfil lineal', 'ready': bool(profile)},
        {'key': 'zones', 'label': 'Sectores por progresiva', 'ready': counts.get('zones', 0) > 0},
        {'key': 'methodology', 'label': 'Metodologia constructiva', 'ready': counts.get('methodologies', 0) > 0 and counts.get('steps', 0) > 0},
        {'key': 'resources', 'label': 'Cuadrillas y recursos', 'ready': counts.get('resources', 0) > 0},
        {'key': 'dataset', 'label': 'Cronograma y metrados', 'ready': bool(dataset)},
        {'key': 'locations', 'label': 'Partidas con progresiva', 'ready': counts.get('locations', 0) > 0},
        {'key': 'bim_links', 'label': 'Elementos vinculados', 'ready': counts.get('links', 0) > 0},
        {'key': 'scenario', 'label': 'Escenario activo', 'ready': counts.get('scenarios', 0) > 0},
    ]
    completed = sum(1 for check in checks if check['ready'])
    return {
        'standard': STANDARD_VERSION,
        'score': round(completed * 100 / len(checks)),
        'ready': completed == len(checks),
        'checks': checks,
    }
