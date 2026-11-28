#!/bin/bash
# Build on your own Mac with Xcode; no EAS Build or EAS Submit calls.
set -euo pipefail

if [[ $# -lt 2 || $# -gt 3 || ! "$1" =~ ^[1-9][0-9]{0,8}$ || ! "$2" =~ ^[A-Z0-9]{10}$ ]]; then
  echo 'Usage: bash scripts/ios/release-testflight.sh BUILD_NUMBER APPLE_TEAM_ID [--upload]' >&2
  exit 2
fi
if [[ $# == 3 && "$3" != '--upload' ]]; then
  echo 'The only optional argument is --upload.' >&2
  exit 2
fi
if [[ "$(uname -s)" != Darwin ]]; then
  echo 'A Mac with Xcode is required to archive an iOS app.' >&2
  exit 1
fi
for executable in node npm xcodebuild xcrun pod python3; do
  command -v "$executable" >/dev/null || { echo "Missing prerequisite: $executable" >&2; exit 1; }
done
if [[ -n "${EXPO_PUBLIC_LOCAL_AI_SMOKE:-}" ]]; then
  echo 'Remove EXPO_PUBLIC_LOCAL_AI_SMOKE before a customer release.' >&2
  exit 1
fi

release_root="$(cd "$(dirname "$0")/../.." && pwd)"
release_number="$1"
release_team="$2"
release_output="$release_root/.tools/ios-release/$release_number"
release_archive="$release_output/PocketBudget.xcarchive"
if [[ -e "$release_output" ]]; then
  echo "Output already exists: $release_output. Use a new build number or move the old archive." >&2
  exit 1
fi
mkdir -p "$release_output"
cd "$release_root/apps/mobile"
export POCKET_IOS_BUILD_NUMBER="$release_number"
export EAS_BUILD_PROFILE=production

npm ci
npm run typecheck
npm run lint
npm test
npm run prepare:local-ai
npm run test:ios-ocr
npm run test:model-integrity
# Generate configuration from app.config.js; never patch the generated native project.
npx --no-install expo prebuild --platform ios --no-install
(cd ios && pod install)
xcodebuild -workspace ios/PocketBudget.xcworkspace -scheme PocketBudget \
  -configuration Release -destination 'generic/platform=iOS' \
  -archivePath "$release_archive" -derivedDataPath "$release_output/DerivedData" \
  DEVELOPMENT_TEAM="$release_team" CODE_SIGN_STYLE=Automatic \
  -allowProvisioningUpdates archive 2>&1 | tee "$release_output/archive.log"

if [[ "${3:-}" == '--upload' ]]; then
  python3 - "$release_output/ExportOptions.plist" "$release_team" <<'PY'
import plistlib, sys
with open(sys.argv[1], 'wb') as stream:
    plistlib.dump({
        'method': 'app-store-connect', 'destination': 'upload',
        'signingStyle': 'automatic', 'teamID': sys.argv[2],
        'manageAppVersionAndBuildNumber': False, 'uploadSymbols': True,
    }, stream)
PY
  xcodebuild -exportArchive -archivePath "$release_archive" \
    -exportOptionsPlist "$release_output/ExportOptions.plist" \
    -exportPath "$release_output/export" -allowProvisioningUpdates \
    2>&1 | tee "$release_output/upload.log"
  echo 'Upload command completed. Check Apple processing and TestFlight tester availability separately.'
else
  echo "Archive ready: $release_archive"
  echo 'Open it in Xcode Organizer to distribute to App Store Connect.'
fi
