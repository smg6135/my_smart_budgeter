#!/bin/bash
set -euo pipefail
umask 077
: "${P12_BASE64:?Missing distribution certificate}" "${P12_PASSWORD:?Missing certificate password}" "${PROFILE_BASE64:?Missing provisioning profile}"
keychain="$RUNNER_TEMP/pocket-release.keychain-db"
keychain_password="$(uuidgen)"
printf '::add-mask::%s\n' "$keychain_password"
printf '%s' "$P12_BASE64" | base64 --decode > "$RUNNER_TEMP/pocket-cert.p12"
printf '%s' "$PROFILE_BASE64" | base64 --decode > "$RUNNER_TEMP/pocket-profile.mobileprovision"
security create-keychain -p "$keychain_password" "$keychain"
security set-keychain-settings -lut 21600 "$keychain"
security unlock-keychain -p "$keychain_password" "$keychain"
security import "$RUNNER_TEMP/pocket-cert.p12" -P "$P12_PASSWORD" -A -t cert -f pkcs12 -k "$keychain" >/dev/null
security set-key-partition-list -S apple-tool:,apple:,codesign: -k "$keychain_password" "$keychain" >/dev/null
security list-keychains -d user -s "$keychain" "$HOME/Library/Keychains/login.keychain-db"
security cms -D -i "$RUNNER_TEMP/pocket-profile.mobileprovision" > "$RUNNER_TEMP/pocket-profile.plist"
python3 - <<'PY'
import os, plistlib, pathlib, shutil
p=plistlib.loads(pathlib.Path(os.environ['RUNNER_TEMP'],'pocket-profile.plist').read_bytes())
assert p['TeamIdentifier'][0]==os.environ['POCKET_APPLE_TEAM']
assert p['Entitlements']['application-identifier']==os.environ['POCKET_APPLE_TEAM']+'.com.mingonsong.pocketbudget'
profile=p['UUID']
for folder in ['Library/MobileDevice/Provisioning Profiles','Library/Developer/Xcode/UserData/Provisioning Profiles']:
    target=pathlib.Path.home()/folder;target.mkdir(parents=True,exist_ok=True)
    shutil.copyfile(pathlib.Path(os.environ['RUNNER_TEMP'],'pocket-profile.mobileprovision'),target/(profile+'.mobileprovision'))
with open(os.environ['GITHUB_ENV'],'a') as stream:
    stream.write('POCKET_IOS_PROVISIONING_PROFILE='+profile+'\n')
    stream.write('POCKET_KEYCHAIN_PATH='+os.environ['RUNNER_TEMP']+'/pocket-release.keychain-db\n')
print('Installed matching Apple signing assets')
PY
