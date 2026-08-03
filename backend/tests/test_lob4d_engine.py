import io
import unittest

from lob4d_engine import merge_cost_items, normalize_scope, parse_p6_package, parse_p6_xml, quality_report


class Lob4DEngineTests(unittest.TestCase):
    def test_scope_requires_explicit_front(self):
        with self.assertRaises(ValueError):
            normalize_scope('global')
        self.assertEqual(normalize_scope('1_CANAL'), '1_CANAL')

    def test_merge_preserves_schedule_and_uses_replanted_quantity(self):
        durations = [{
            'codigo': '01.01', 'descripcion': 'Excavacion', 'unidad': 'm3',
            'metrado': 10, 'pu': 2, 'rendimiento': 4, 'duracion': 3,
            'activity_id': 'A100', 'frente_label': 'Canal', 'orden': 1, 'tipo': 'partida',
        }]
        quantities = {
            'control': {'01.01': {'descripcion': 'Excavacion', 'unidad': 'm3', 'metrado': 25, 'pu': 7}},
            'titulos': {'01': 'Movimiento de tierras'}, 'avance': {}, 'frentes': [],
        }
        merged = merge_cost_items(durations, quantities)
        self.assertEqual(merged['01.01']['metrado'], 25)
        self.assertEqual(merged['01.01']['pu'], 7)
        self.assertEqual(merged['01.01']['activity_id'], 'A100')
        self.assertEqual(merged['01']['tipo'], 'titulo')
        self.assertEqual(merged['01.01']['parent_codigo'], '01')

    def test_p6_parser_reads_any_version_and_actual_dates(self):
        namespace = 'http://xmlns.oracle.com/Primavera/P6Professional/V99.1/API/BusinessObjects'
        xml = f'''<?xml version="1.0"?>
        <Root xmlns="{namespace}">
          <Activity>
            <Id>A100</Id><Name>Excavacion</Name>
            <PlannedStartDate>2026-01-01T08:00:00</PlannedStartDate>
            <PlannedFinishDate>2026-01-10T17:00:00</PlannedFinishDate>
            <ActualStartDate>2026-01-02T08:00:00</ActualStartDate>
            <PercentComplete>35</PercentComplete><Status>In Progress</Status>
          </Activity>
        </Root>'''.encode()
        result = parse_p6_xml(io.BytesIO(xml))
        self.assertEqual(result['A100']['start'], '2026-01-01')
        self.assertEqual(result['A100']['finish'], '2026-01-10')
        self.assertEqual(result['A100']['actual_start'], '2026-01-02')
        self.assertEqual(result['A100']['percent'], 35)

    def test_quality_report_exposes_link_coverage_counts(self):
        items = {
            '01': {'codigo': '01', 'tipo': 'titulo'},
            '01.01': {'codigo': '01.01', 'tipo': 'partida', 'activity_id': 'A100'},
        }
        report = quality_report(items, {'A100': {}}, {'01.01': {1: 2}}, links=3, linked_elements=2)
        self.assertEqual(report['cobertura_p6_pct'], 100)
        self.assertEqual(report['cobertura_avance_pct'], 100)
        self.assertEqual(report['vinculos_bim'], 3)
        self.assertEqual(report['elementos_bim_vinculados'], 2)

    def test_p6_package_resolves_activity_relationships(self):
        xml = b'''<Root>
          <Activity><ObjectId>10</ObjectId><Id>A10</Id><Name>First</Name></Activity>
          <Activity><ObjectId>20</ObjectId><Id>A20</Id><Name>Second</Name></Activity>
          <Relationship>
            <PredecessorActivityObjectId>10</PredecessorActivityObjectId>
            <SuccessorActivityObjectId>20</SuccessorActivityObjectId>
            <Type>Start to Start</Type><Lag>16</Lag>
          </Relationship>
        </Root>'''
        package = parse_p6_package(io.BytesIO(xml))
        self.assertEqual(len(package['activities']), 2)
        self.assertEqual(package['relations'], [{
            'predecessor_id': 'A10', 'successor_id': 'A20',
            'relation_type': 'SS', 'lag_hours': 16.0, 'source': 'p6',
        }])


if __name__ == '__main__':
    unittest.main()
