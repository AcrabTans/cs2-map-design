"""Build a clean portable release without changing user projects or cached data."""
from pathlib import Path
import hashlib, json, os, re, shutil, subprocess, sys, zipfile
from datetime import datetime, timezone

VERSION = '0.1.0'
SOURCE = Path(__file__).resolve().parent
APP = SOURCE.parent
OUT = APP.parent / 'releases'
NAME = f'MapDesign-v{VERSION}-win-x64'
TARGET = OUT / NAME
ARCHIVE = OUT / (NAME + '.zip')

def run(args, env=None, cwd=SOURCE):
    result = subprocess.run([str(a) for a in args], env=env, cwd=cwd,
                            capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=180)
    if result.returncode:
        print((result.stdout + result.stderr).encode('ascii', 'backslashreplace').decode())
        raise RuntimeError('Release check failed')
    return result.stdout + result.stderr

def digest(p):
    h = hashlib.sha256()
    with p.open('rb') as f:
        for block in iter(lambda: f.read(4 * 1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()

def copy_tree(src, dst):
    shutil.copytree(src, dst, ignore=shutil.ignore_patterns(
        '__pycache__', '*.pyc', '*.pyo', '*.log', 'tests', '.pytest_cache'))

def main():
    if TARGET.exists() or ARCHIVE.exists():
        raise RuntimeError('Release output already exists; use a new version or output location')
    node_env = {**os.environ, 'ELECTRON_RUN_AS_NODE': '1'}
    node = APP / 'MapDesign.exe'
    print('Checking and rebuilding map...', flush=True)
    run([node, 'build-offline.mjs', '--output', '../resources/app/index.html', '--storage-key', 'map-design-portable-v1'], node_env)
    tests = sorted((SOURCE / 'tests').glob('*.test.mjs'))
    report = run([node, '--test', '--test-reporter=tap', *tests], node_env)
    passed = int(re.search(r'# pass (\d+)', report)[1])
    if not re.search(r'# fail 0\b', report):
        raise RuntimeError('Map checks did not all pass')
    print(f'Map checks passed: {passed}', flush=True)
    tool = APP / 'tools' / '资产提取器'
    runtime = tool / 'runtime' / 'python'
    python_env = {**node_env, 'PYTHONHOME': str(runtime), 'PYTHONPATH': str(tool / '依赖' / 'python'),
                  'PYTHONNOUSERSITE': '1', 'CS2_PYTHON': str(runtime / 'python.exe'), 'CS2_NODE': str(node)}
    run([runtime / 'python.exe', '-c', 'import numpy,shapely,UnityPy,tkinter;print("Dependencies OK")'], python_env)
    run([runtime / 'python.exe', tool / '窗口.py', '--self-test'], python_env)
    run([runtime / 'python.exe', '-m', 'unittest', 'discover', '-s', tool / 'tests', '-p', 'test_*.py'], python_env)
    run([node, '--test', tool / 'tests/cok-reader.test.mjs', tool / 'tests/binary-prefab.test.mjs'], node_env)
    print('Extractor dependency, GUI self-test and 8 checks passed', flush=True)
    OUT.mkdir(exist_ok=True)
    TARGET.mkdir()
    runtime_names = ['MapDesign.exe', 'LICENSE', 'LICENSES.chromium.html', 'version', 'icudtl.dat',
                     'vk_swiftshader_icd.json']
    runtime_names += [p.name for p in APP.iterdir() if p.is_file() and p.suffix in ('.dll', '.pak', '.bin')]
    for name in sorted(set(runtime_names)):
        shutil.copy2(APP / name, TARGET / name)
    copy_tree(APP / 'locales', TARGET / 'locales')
    copy_tree(APP / 'resources', TARGET / 'resources')
    bundled_tool = TARGET / 'tools' / '资产提取器'
    bundled_tool.mkdir(parents=True)
    for name in ['依赖', 'runtime']:
        copy_tree(tool / name, bundled_tool / name)
    for p in tool.iterdir():
        if p.is_file() and p.suffix in ('.py', '.mjs'):
            shutil.copy2(p, bundled_tool / p.name)
    (bundled_tool / 'output').mkdir()
    (TARGET / 'projects').mkdir()
    (TARGET / 'userdata').mkdir()
    licenses = TARGET / 'docs' / 'licenses'
    licenses.mkdir(parents=True)
    shutil.copy2(SOURCE / 'src/vendor/three-LICENSE.txt', licenses / 'Three.js-LICENSE.txt')
    shutil.copy2(SOURCE / 'RELEASE_README.md', TARGET / 'README.md')
    (bundled_tool / '使用说明.md').write_text('# 内置资产提取器\n\n从地图程序“资产 → 资产提取器…”启动。\n完整说明见程序根目录 README.md 第 7 节。\n默认导出位置是本文件夹的 output，缓存和日志在工作缓存。\n', encoding='utf-8')
    (TARGET / 'CHANGELOG.md').write_text('''# 版本记录

## v0.1.0 · 2026-10-31

首次绿色版发布，支持 Windows x64。

- 独立桌面菜单、原生文件选择、手动工程保存及另存为。
- Area、Network、Building、Route、Terrain、Zoning 六大类图层。
- 多底图、Carto 文件夹与地形栅格导入，七组 Shapefile 和整图 PNG 导出。
- 二维节点编辑、吸附、测距、网格、道路层级交叉与立交预留范围。
- 小类统一配色、桥隧色阶、铁路组合线及运营细线路。
- 建筑资产投影摆放、来源编号、占地高度及容量信息。
- 内置本地资产提取器，按需输出投影、LOD2、LOD1。
- 资产包批量管理与未使用包选择，保护已摆放建筑。
- 三维只读地形与建筑预览，LOD 按需读取，关闭后释放图形资源。
- 二维视野更新与全图重建分离，关闭图层跳过绘制，红绿灯不显示。
- 空白、无个人数据的发布包，附第三方声明和文件校验清单。

已知限制见 README；本版不含游戏写回、自动更新或万栋建筑性能保证。
''', encoding='utf-8')
    components = []
    for metadata in sorted(bundled_tool.rglob('*.dist-info/METADATA')):
        text = metadata.read_text(encoding='utf-8', errors='replace')
        field = lambda key: (re.search('^' + key + ': (.*)$', text, re.M) or [None, ''])[1]
        components.append({'name': field('Name'), 'version': field('Version'),
                           'license': field('License-Expression') or field('License'),
                           'metadata': metadata.relative_to(TARGET).as_posix()})
    (TARGET / 'docs/THIRD_PARTY_COMPONENTS.json').write_text(json.dumps(components, ensure_ascii=False, indent=2), encoding='utf-8')
    (TARGET / 'THIRD_PARTY_NOTICES.md').write_text('''# 第三方组件说明

本文件为组件位置索引，不替代各组件原始许可证。

| 组件 | 位置与声明 |
| --- | --- |
| Electron 45.2.1 / Chromium / Node.js | 根目录 LICENSE、LICENSES.chromium.html；运行库随包携带 |
| Three.js | docs/licenses/Three.js-LICENSE.txt；代码合并在 resources/app/index.html |
| Python 3.13 运行环境及 Tcl/Tk | tools/资产提取器/runtime/python/LICENSE.txt，及 tcl、Lib 对应组件目录 |
| NumPy、Shapely | Python 运行环境 Lib/site-packages 下的 dist-info、licenses 等原始声明 |
| UnityPy 及其依赖 | tools/资产提取器/依赖/python 下的 dist-info、licenses 等原始声明 |
| Meshoptimizer 解码器 | tools/资产提取器/依赖/vendor 下源文件中的版权与许可证声明 |

Python 包名、版本、元数据位置见 docs/THIRD_PARTY_COMPONENTS.json。依赖目录中的原始声明文件一并保留。

根目录 LICENSE 是 Electron 的声明，不是本地图设计器全部源码的开源许可证。本发布未额外指定应用源码开源许可。发布包不含游戏或第三方模组资产。
''', encoding='utf-8')
    info = {'product': '天际线Ⅱ地图规划设计器', 'version': VERSION, 'platform': 'win32-x64',
            'releaseDate': '2026-10-31', 'builtAtUtc': datetime.now(timezone.utc).isoformat(),
            'electron': '45.2.1', 'personalDataIncluded': False, 'sourceIncluded': False,
            'checks': {'mapTestsPassed': passed, 'extractorTestsPassed': 8,
                       'extractorDependencies': 'passed', 'extractorWindowSelfTest': 'passed'},
            'validationLimits': ['No clean-machine end-to-end GUI test of this archive', 'No 10000-building stress test']}
    (TARGET / 'release.json').write_text(json.dumps(info, ensure_ascii=False, indent=2), encoding='utf-8')
    forbidden = {'.cs2map', '.cs2assets', '.cok', '.glb', '.tif', '.tiff', '.log', '.pyc'}
    for p in TARGET.rglob('*'):
        if p.is_file() and p.suffix.lower() in forbidden:
            raise RuntimeError('Unexpected project/cache/asset in release: ' + str(p.relative_to(TARGET)))
        if p.is_symlink():
            raise RuntimeError('Unexpected link in release')
    files = sorted(p for p in TARGET.rglob('*') if p.is_file())
    (TARGET / 'MANIFEST.sha256').write_text(''.join(digest(p) + '  ' + p.relative_to(TARGET).as_posix() + '\n' for p in files), encoding='utf-8')
    print('Creating ZIP...', flush=True)
    with zipfile.ZipFile(ARCHIVE, 'x', zipfile.ZIP_DEFLATED, compresslevel=6, allowZip64=True) as z:
        for p in sorted(TARGET.rglob('*')):
            z.write(p, NAME + '/' + p.relative_to(TARGET).as_posix())
    with zipfile.ZipFile(ARCHIVE) as z:
        bad = z.testzip()
        if bad:
            raise RuntimeError('ZIP verification failed: ' + bad)
    # Re-read every file after packaging, so copy/hash corruption is detected.
    for line in (TARGET / 'MANIFEST.sha256').read_text(encoding='utf-8').splitlines():
        expected, name = line.split('  ', 1)
        if digest(TARGET / name) != expected:
            raise RuntimeError('Manifest verification failed: ' + name)
    archive_hash = digest(ARCHIVE)
    (OUT / f'{NAME}.sha256').write_text(archive_hash + '  ' + ARCHIVE.name + '\n', encoding='utf-8')
    with (OUT / 'SHA256SUMS.txt').open('a',encoding='utf-8') as f:f.write(archive_hash + '  ' + ARCHIVE.name + '\n')
    shutil.copy2(TARGET / 'README.md', OUT / f'README-v{VERSION}.md')
    print(json.dumps({'archive': str(ARCHIVE), 'sizeMiB': round(ARCHIVE.stat().st_size / 1048576, 1),
                      'unpackedMiB': round(sum(p.stat().st_size for p in TARGET.rglob('*') if p.is_file()) / 1048576, 1),
                      'sha256': archive_hash, 'files': len(files) + 1}, ensure_ascii=True), flush=True)

if __name__ == '__main__':
    main()
