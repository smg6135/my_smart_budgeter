# Repository scripts

Run commands from the repository root unless noted. Cloud deployment and Firebase emulator scripts have been retired. These helpers do not start an EAS build or deploy a backend.

## iOS simulator helpers

For a signed device archive and optional direct Apple upload, use [ios/release-testflight.sh](ios/release-testflight.sh) on a Mac signed into the Apple developer account in Xcode. It does not call EAS Build/Submit. See [release instructions](../docs/TESTFLIGHT.md#direct-xcode-release-without-eas-build).

Requires macOS and current Xcode command-line tools. Reuse a matching native artifact when native dependencies have not changed; do not dispatch native CI merely to check documentation.

| Script | Purpose |
| --- | --- |
| [ios/download-ios-simulator.py](ios/download-ios-simulator.py) | Download an existing HTTPS EAS simulator artifact from `POCKET_SIMULATOR_URL` into `/tmp/pocket-native`; requires Python 3.12+ for safe tar extraction. |
| [ios/smoke-ios-launch.py](ios/smoke-ios-launch.py) | Boot an available iPhone simulator, install the supplied `.app`, and verify the local Overview. Optional `--local-ai` waits for the test-only AI marker. |
| [ios/check-ios-screen.swift](ios/check-ios-screen.swift) | Use Vision to check a simulator screenshot for Overview, budget and spent labels; called by the launch helper. |

```bash
POCKET_SIMULATOR_URL='<matching HTTPS artifact URL>' python3 scripts/ios/download-ios-simulator.py
python3 scripts/ios/smoke-ios-launch.py /path/to/PocketBudget.app
```

The launch helper replaces the simulator installation and relaunches it; use a test simulator. AI smoke mode requires an artifact with the test-only flag; never enable that flag for a customer release. Keep signed artifact URLs out of committed files.

## Asset generation

[assets/generate-icons.mjs](assets/generate-icons.mjs) rasterizes the code-authored leaf mark to the mobile SVG, icon and favicon assets. Requires Node 24, installed mobile dependencies and Playwright Chromium:

```bash
node scripts/assets/generate-icons.mjs
```

This intentionally rewrites files in `apps/mobile/assets`; review generated changes before committing. It is not run by normal CI.
