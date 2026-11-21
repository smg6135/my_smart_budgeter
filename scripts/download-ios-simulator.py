"""Fetch an EAS simulator artifact for JS-only native integration checks."""
import os
from pathlib import Path
import shutil
import tarfile
import urllib.parse
import urllib.request

url = os.environ['POCKET_SIMULATOR_URL']
parsed = urllib.parse.urlparse(url)
if parsed.scheme != 'https' or not any(
    parsed.hostname == host or parsed.hostname.endswith('.' + host)
    for host in ('eascdn.net', 'expo.dev', 'expo.io')
):
    raise ValueError('Expected an HTTPS EAS artifact URL.')
archive = Path('/tmp/pocket-simulator.tar.gz')
request = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
with urllib.request.urlopen(request, timeout=180) as response, archive.open('wb') as file:
    shutil.copyfileobj(response, file)
directory = Path('/tmp/pocket-native')
directory.mkdir(parents=True, exist_ok=True)
with tarfile.open(archive) as file:
    file.extractall(directory, filter='data')
app = next(directory.rglob('PocketBudget.app'))
target = directory / 'PocketBudget.app'
if app != target:
    shutil.move(app, target)
print('Downloaded native simulator app.')
