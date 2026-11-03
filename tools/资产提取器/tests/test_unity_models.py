import unittest,struct,importlib.util
from pathlib import Path
spec=importlib.util.spec_from_file_location('unity_models',Path(__file__).resolve().parents[1]/'read-unity-models.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class UnityReferences(unittest.TestCase):
 def fixture(self):
  keys=['a'*32,'b'*32];header=bytearray(44);struct.pack_into('<i',header,28,10);header[32:42]=b'PrefabsMap'
  return bytes(header)+struct.pack('<I',2)+b''.join(struct.pack('<I',32)+k.encode() for k in keys)+struct.pack('<I',2)+struct.pack('<iqiq',0,86922,0,87235)
 def test_real_layout_guid_to_pointer(self):
  self.assertEqual(m.prefab_references(self.fixture()),{'a'*32:(0,86922),'b'*32:(0,87235)})
 def test_rejects_truncated_and_oversized(self):
  for b in [self.fixture()[:-1],self.fixture()+b'x',b'']:
   with self.assertRaises((ValueError,struct.error)):m.prefab_references(b)
if __name__=='__main__':unittest.main()
