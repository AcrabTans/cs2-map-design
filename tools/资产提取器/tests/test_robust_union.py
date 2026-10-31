import sys, unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import shapely
from shapely.errors import GEOSException
from robust_union import projection_union

class ProjectionUnionTest(unittest.TestCase):
    def setUp(self):
        self.triangles=shapely.polygons([[[0,0],[1,0],[1,1]],[[0,0],[1,1],[0,1]]])

    def test_normal_union_stays_exact(self):
        g, recovery=projection_union(self.triangles)
        self.assertEqual(g.area,1)
        self.assertIsNone(recovery)

    def test_failed_exact_union_uses_checked_precision(self):
        original=shapely.union_all
        def union(values, **kwargs):
            if not kwargs:raise GEOSException('simulated precision failure')
            return original(values, **kwargs)
        with patch.object(shapely,'union_all',side_effect=union):
            g, recovery=projection_union(self.triangles)
        self.assertEqual(g.area,1)
        self.assertEqual(recovery['gridMetres'],0.00001)

    def test_unrecoverable_failure_remains_an_error(self):
        with patch.object(shapely,'union_all',side_effect=GEOSException('broken')):
            with self.assertRaises(RuntimeError):projection_union(self.triangles)

if __name__=='__main__':unittest.main()
