import json
import os
import subprocess
import tempfile
import unittest
import zipfile
from pathlib import Path

TOOL = Path(__file__).resolve().parents[1]


class ModCatalogTests(unittest.TestCase):
    def test_cached_versions_types_and_counts(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp) / 'pdx_mods'
            for name in ('100_2', '100_10', '101_1', '102_1', '103_1'):
                (root / name).mkdir(parents=True)
            (root / '100_2' / 'Earlier.cok').write_text('older copy', 'utf-8')
            (root / '100_10' / 'mod.json').write_text('{"displayName":"Buildings"}', 'utf-8')
            building = {'$type': 'Game.Prefabs.BuildingPrefab', 'name': 'Library',
                        'm_LotWidth': 2, 'm_LotDepth': 3, 'm_Meshes': {'$rcontent': [{}]}}
            road = {'$type': 'Game.Prefabs.RoadPrefab', 'name': 'Local Street'}
            with zipfile.ZipFile(root / '100_10' / 'Library.cok', 'w') as archive:
                archive.writestr('Library.Prefab', json.dumps(building))
                archive.writestr('SurfaceUpgrade.Prefab', json.dumps({
                    **building, 'name': 'Expansion', 'm_Meshes': {},
                    'components': {'$rcontent': [{'name': 'ServiceUpgrade'}]}
                }))
            with zipfile.ZipFile(root / '101_1' / 'Streets.cok', 'w') as archive:
                archive.writestr('LocalStreet.Prefab', json.dumps(road))
            (root / '102_1' / 'mod.json').write_text('{"displayName":"Editor Tool","isCodeMod":true}', 'utf-8')
            (root / '103_1' / 'Broken.cok').write_text('broken archive', 'utf-8')
            result = subprocess.check_output([os.environ.get('CS2_NODE', 'node'),
                                              str(TOOL / 'mod-catalog.mjs'), str(root)], encoding='utf-8')
            rows = {row['name']: row for row in map(json.loads, result.splitlines())}

            self.assertNotIn('Earlier', rows)
            self.assertEqual(rows['Buildings']['count'], 1)
            self.assertEqual(rows['Buildings']['buildings'], ['Library'])
            self.assertTrue(rows['Buildings']['eligible'])
            self.assertFalse(rows['Streets']['eligible'])
            self.assertEqual(rows['Streets']['assets'][0]['name'], 'Local Street')
            self.assertTrue(rows['Editor Tool']['code'])
            self.assertTrue(rows['Broken']['error'])
