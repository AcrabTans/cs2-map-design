import unittest, tempfile, runpy, json
from pathlib import Path
from unittest.mock import patch

class ExportOptionsTest(unittest.TestCase):
 def test_selected_formats_only(self):
  module=runpy.run_path(str(Path(__file__).resolve().parents[1]/'提取.py'))
  extract=module['extract']
  tempRoot=Path.cwd()/'.scratch';tempRoot.mkdir(exist_ok=True)
  for selected in [['projection'],['lod2'],['lod1'],['projection','lod2','lod1']]:
   with self.subTest(selected=selected),tempfile.TemporaryDirectory(dir=tempRoot) as directory:
    root=Path(directory);source=root/'test.cok';source.write_bytes(b'test source');output=root/'output';calls=[]
    def run(cmd,log):
     tool=Path(cmd[1]).name;calls.append(tool)
     if tool=='inspect.mjs':
      work=Path(cmd[3]);(work/'index.json').write_text(json.dumps({'binaryPrefabs':1}));(work/'direct.json').write_text(json.dumps({'assets':[{'id':'one'}],'errors':[]}))
     elif tool=='finalize.py':(output/'test.cs2assets').write_text('projection')
     elif tool=='export-lod.mjs':
      for lod in cmd[7:]:(output/('test-'+lod+'.glb')).write_bytes(b'GLB')
    with patch.dict(extract.__globals__,ROOT=root,run=run),patch('builtins.print'):
     result=extract(source,output,formats=selected)
    self.assertTrue(result['ok'],result)
    self.assertTrue(result['sourceUnchanged'])
    self.assertEqual('project-all.mjs' in calls,'projection' in selected)
    self.assertEqual(len(list(output.iterdir())),len(selected))
    self.assertEqual(len(result['files']),len(selected))

class DlcPackagesTest(unittest.TestCase):
 def test_prefabs_and_blob_resolve_to_same_dlc_and_different_dlcs_do_not_collide(self):
  resolve=runpy.run_path(str(Path(__file__).resolve().parents[1]/'提取.py'))['resolve_package']
  with tempfile.TemporaryDirectory(dir=Path.cwd()/'.scratch') as directory:
   root=Path(directory)/'Content'
   for name in ['CityStations','ModernArchitecture','Game']:
    folder=root/name;folder.mkdir(parents=True);(folder/'Blob.cok').write_bytes(b'x');(folder/'Prefabs.cok').write_bytes(b'y')
    a=resolve(folder/'Blob.cok');b=resolve(folder/'Prefabs.cok');self.assertEqual(a,b)
    self.assertEqual(a[1],'Blob' if name=='Game' else name)

if __name__=='__main__':unittest.main()
