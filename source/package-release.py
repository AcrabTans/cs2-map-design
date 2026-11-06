"""Package a built Windows x64 Tauri executable as a portable ZIP."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import tomllib
import zipfile

SOURCE = Path(__file__).resolve().parent
REPO = SOURCE.parent


def copy_dependency_notices(cache, destination):
    if cache is None:
        return
    locked = tomllib.loads((SOURCE / 'src-tauri/Cargo.lock').read_text('utf-8'))
    notices = {}
    index = ['# Third-party licenses', '',
             'Each row maps an original component notice to an unchanged copy.',
             'Identical notices share one copy.', '',
             '| Component | Original file | License text |',
             '| --- | --- | --- |']
    for package in sorted(locked['package'], key=lambda p: (p['name'], p['version'])):
        label = f"{package['name']}-{package['version']}"
        crate = next(cache.glob(f'registry/src/*/{label}'), None)
        if crate is None:
            continue
        for notice in sorted(crate.iterdir()):
            if not notice.is_file() or not notice.name.upper().startswith(('LICENSE', 'COPYING', 'NOTICE')):
                continue
            contents = notice.read_bytes()
            digest = hashlib.sha256(contents).hexdigest()
            if digest not in notices:
                filename = f'{len(notices) + 1:03}.txt'
                output = destination / 'texts' / filename
                output.parent.mkdir(parents=True, exist_ok=True)
                output.write_bytes(contents)
                notices[digest] = filename
            filename = notices[digest]
            index.append(f'| {label} | {notice.name} | [{filename}](texts/{filename}) |')
    if notices:
        (destination / 'README.md').write_text('\n'.join(index) + '\n', 'utf-8')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--binary', type=Path, required=True)
    parser.add_argument('--output', type=Path, default=REPO.parent / 'releases')
    parser.add_argument('--cargo-cache', type=Path)
    args = parser.parse_args()
    binary = args.binary.resolve(strict=True)
    version = tomllib.loads((SOURCE / 'src-tauri/Cargo.toml').read_text('utf-8'))['package']['version']
    name = f'MapDesign-v{version}-win-x64'
    target, archive = args.output / name, args.output / (name + '.zip')
    if target.exists() or archive.exists():
        raise SystemExit('该版本的发布目录或 ZIP 已存在，请另选输出目录。')

    tests = sorted((SOURCE / 'tests').glob('*.test.mjs'))
    subprocess.run(['node', '--test', *map(str, tests)], cwd=SOURCE, check=True)
    target.mkdir(parents=True)
    shutil.copy2(binary, target / 'MapDesign.exe')
    loader = binary.with_name('WebView2Loader.dll')
    if loader.is_file():
        shutil.copy2(loader, target / loader.name)
    shutil.copytree(SOURCE / 'vendor/asset-codecs', target / 'asset-codecs')
    shutil.copy2(REPO / 'LICENSE', target / 'LICENSE')
    shutil.copy2(REPO / 'docs/USER_GUIDE.md', target / 'README.md')
    shutil.copy2(REPO / 'CHANGELOG.md', target / 'CHANGELOG.md')
    shutil.copy2(REPO / 'THIRD_PARTY_NOTICES.md', target / 'THIRD_PARTY_NOTICES.md')
    copy_dependency_notices(args.cargo_cache, target / 'licenses')
    (target / 'projects').mkdir()
    (target / 'release.json').write_text(json.dumps({
        'version': version, 'platform': 'win32-x64', 'desktop': 'Tauri',
        'webview2': 'system', 'builtInProjections': 6280,
    }, ensure_ascii=False, indent=2), 'utf-8')
    with zipfile.ZipFile(archive, 'x', zipfile.ZIP_DEFLATED, compresslevel=9, strict_timestamps=False) as bundle:
        for path in sorted(target.rglob('*')):
            bundle.write(path, Path(name) / path.relative_to(target))
    with zipfile.ZipFile(archive) as bundle:
        failed = bundle.testzip()
        if failed:
            raise RuntimeError('ZIP 校验失败：' + failed)
    with archive.open('rb') as file:
        digest = hashlib.file_digest(file, 'sha256').hexdigest()
    archive.with_suffix('.sha256').write_text(f'{digest}  {archive.name}\n', 'ascii')
    print(f'{archive.resolve()} · {archive.stat().st_size / 1048576:.2f} MiB')


if __name__ == '__main__':
    main()
