import unittest

from lob4d_linear_engine import (
    STANDARD_VERSION,
    build_zones,
    methodology_template,
    readiness,
    resource_template,
)


class Lob4DLinearEngineTests(unittest.TestCase):
    def test_build_zones_covers_full_alignment_without_gaps(self):
        zones = build_zones(100, 370, 100)
        self.assertEqual([(z['station_start'], z['station_end']) for z in zones], [
            (100.0, 200.0), (200.0, 300.0), (300.0, 370.0),
        ])
        self.assertEqual(zones[-1]['code'], 'Z003')

    def test_template_creates_reusable_crews(self):
        steps = methodology_template('pipeline')
        resources = resource_template(steps)
        self.assertGreaterEqual(len(steps), 6)
        self.assertEqual(len({r['code'] for r in resources}), len(resources))

    def test_readiness_is_explicit_and_versioned(self):
        report = readiness(
            {'name': 'Canal'},
            {'zones': 2, 'methodologies': 1, 'steps': 4, 'resources': 2,
             'locations': 3, 'links': 9, 'scenarios': 1},
            {'id': 'dataset'},
        )
        self.assertEqual(report['standard'], STANDARD_VERSION)
        self.assertEqual(report['score'], 100)
        self.assertTrue(report['ready'])


if __name__ == '__main__':
    unittest.main()
