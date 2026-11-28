import json
import os
import pathlib
import plistlib
import sys
import zipfile

ipa, = pathlib.Path(sys.argv[1]).glob('*.ipa')
expected = json.loads(pathlib.Path('app.json').read_text())['expo']['version']
with zipfile.ZipFile(ipa) as archive:
    info_path = next(n for n in archive.namelist() if n.startswith('Payload/') and n.count('/') == 2 and n.endswith('/Info.plist'))
    info = plistlib.loads(archive.read(info_path))
    assert info['CFBundleIdentifier'] == 'com.mingonsong.pocketbudget'
    assert info['CFBundleVersion'] == os.environ['POCKET_IOS_BUILD_NUMBER']
    assert info['CFBundleShortVersionString'] == expected
    bundle = archive.read(info_path.rsplit('/', 1)[0] + '/main.jsbundle')
    for marker in [b'expenseText', b'receiptMerchant', b'Quick detail']:
        assert marker in bundle, marker
print('Verified signed release', expected, info['CFBundleVersion'])
