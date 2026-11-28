# Mobile testing

Current source is fully device-local: Firebase/Google sign-in and the hosted backend have been removed. Android now has a bundled ML Kit OCR implementation, separate from local LLM classification. The iOS local-only changes, purchase-capture flow and screen-lock fix were built/uploaded as build 13 on November 26. Native iOS compilation/archive passed; phone acceptance and native Android verification remain pending. Do not start another native build merely to refresh documentation.

## Local browser

Use Node 24. No Docker, GCP project, sign-in or AI key is required:

```bash
cd apps/mobile
npm ci
npm run web
```

For a phone browser, run `npx expo start --web --host lan` and open the shown LAN address on the same Wi-Fi. Browsers offer manual budgeting. Native AI requires a mobile build.

## Native iOS

OCR and AI are separate local native modules. Expo Go cannot load them. Build a development client:

```bash
cd apps/mobile
npx eas-cli@latest login
npx eas-cli@latest build --platform ios --profile development
npx expo start --dev-client --lan
```

Apple Vision reads photos. Available Apple Foundation Models handles classification/chat on supported iOS 26+ devices. Otherwise Qwen3 0.6B downloads automatically on Wi-Fi (~484 MB), then runs offline. Check Settings → On-device AI for progress or pause/retry. Download now also allows mobile data. No restart, API key or cloud inference is needed. [Fallback details](LOCAL_AI.md).

## Native Android

Run `npm run prepare:local-ai`, then `npx expo run:android` with a current Android SDK/JDK 17. The app requires Android 8+ (API 26), with 64-bit ARM devices or x86_64 emulators. Available Gemini Nano is preferred; otherwise the same local model installs inside the app. Android receipt OCR uses bundled ML Kit; native Android acceptance remains pending.

## Direct Xcode release without EAS Build

Expo SDK is the app framework; EAS Build is an optional hosted build service. Keep Expo/native modules and use your own Mac/Xcode to avoid EAS Build quota. This Windows workstation cannot compile an iOS archive. A local Mac avoids hosted build-service usage; a hosted Mac CI runner has its own billing/quota. Apple developer membership, signing credentials and App Store Connect are still required.

On a Mac, install Node 24, Xcode (including its iOS SDK), CocoaPods and Python 3. Sign in to the existing Apple developer team in Xcode Settings and enable automatic signing. Use the same bundle ID `com.mingonsong.pocketbudget` and team `8X93YF2GHJ` to update the existing app without losing device budgets. Check App Store Connect for the latest build number first; select a higher unused number. Build 14 was uploaded as 1.0.1 on November 27; choose a higher unused number.

From a checkout containing all current changes:

```bash
# Archive only; 15 is an example, check the latest Apple build number first.
bash scripts/ios/release-testflight.sh 15 8X93YF2GHJ
# Or archive and upload directly to Apple in one invocation:
bash scripts/ios/release-testflight.sh 15 8X93YF2GHJ --upload
```

Choose one invocation, not both with the same output directory. The script checks source, runs native OCR/model-integrity tests, generates the native project from Expo configuration, installs pods and archives a signed Release device app. Optional upload uses `xcodebuild -exportArchive` with App Store Connect as destination, not EAS Submit. Archive/logs are under ignored `.tools/ios-release/<build>/`. It refuses to overwrite an archive or enable the synthetic AI smoke flag. `POCKET_IOS_BUILD_NUMBER` supplies the build number through app configuration rather than editing generated iOS files.

Without `--upload`, open the resulting `.xcarchive` in Xcode Organizer and choose Distribute App → App Store Connect → Upload. Apple processing and tester availability are separate from upload success. No direct Mac archive/upload has been run from this Windows session. Switching back to EAS later requires synchronizing its remote build number to avoid reusing a number already uploaded directly.

References: [Expo local releases](https://docs.expo.dev/guides/local-app-production/), [Apple build uploads](https://developer.apple.com/help/app-store-connect/manage-builds/upload-builds).

## TestFlight

Latest uploaded build: **1.0.1 (14)**, November 27. The [production build](https://expo.dev/accounts/mgsong19/projects/pocket-budget/builds/81995712-7509-4499-ae5b-0e07a917c954) and [TestFlight upload](https://expo.dev/accounts/mgsong19/projects/pocket-budget/submissions/7521b204-822a-4873-88c1-61887bf1da70) both finished successfully. The downloaded signed IPA contains the expected bundle/version, capture/dedup JavaScript and native OCR/AI modules. Apple processing/tester availability was not separately confirmed. Update the existing installation when available to preserve local budgets; do not upload build 14 again.

Build 14 adds per-budget category bubbles (add/? removal) in Settings, active-list local LLM classification for OCR text/typed entries/alerts and an updated native iOS generation bridge. Historical entries keep removed labels. All 97 TypeScript tests, lint/typecheck and 33 focused browser checks pass. Configurable-prompt accuracy remains a physical-device acceptance item. A post-snapshot correction to the download-status separator is in source only and does not warrant another native build.

Build 13 adds the local-only/sign-in removal, saved-budget selector, lock/background fix, iPhone Shortcut/paste purchase inbox and duplicate/receipt linking described in the handoff. Android native changes remain source-only until an Android build is validated. The direct Mac release helper was added after the build 13 upload snapshot; it affects future releases only. The EAS release used existing credentials without a paid-plan upgrade. Local typecheck/lint and all 94 TypeScript tests passed.

Build 12 adds the downloaded local-model fallback and native response parsing. Without system AI, connect to Wi-Fi and check Settings → On-device AI for installation progress. After installation, test in airplane mode. Native entry classification was exercised successfully; the receipt fixture was conservatively held for manual category review. Physical-phone performance still needs testing. Native CI is now manual and no further builds are scheduled to conserve quota.

Use the existing Expo project and App Store Connect app (`com.mingonsong.pocketbudget`, app ID `6835131439`):

```bash
cd apps/mobile
npx eas-cli@latest build --platform ios --profile production
npx eas-cli@latest submit --platform ios --profile production --latest
```

Build **1.0.0 (8)** adds the separate native AI module, typed-entry classification, no-fallback receipt classification, local chat and account-free budgets. Its [signed binary](https://expo.dev/accounts/mgsong19/projects/pocket-budget/builds/f45ee76f-0d45-48be-be41-d4b01987a6fa) was checked for both native modules, the classifier schema, weak Foundation Models linkage, local storage and the React startup symbol. Cloud AI route strings and the cloud OCR control are absent from its JavaScript bundle. Its [TestFlight upload](https://expo.dev/accounts/mgsong19/projects/pocket-budget/submissions/17af4d71-ff42-4d69-af81-e75093716e01) finished on 2026-11-21. [Native CI](https://github.com/smg6135/my_smart_budgeter/actions/runs/44885223534) passes compilation and account-free startup. Local verification passes 51 unit tests, 78 browser checks and three real Vision tests. Update the existing installation when its TestFlight build appears to retain device-local data.

No Firebase, Google OAuth, backend URL or AI API key is configured. Previously saved account budgets remain device-local data and must stay accessible offline without signing in; their original storage keys remain intact.

## iPhone checks

- Launch directly into the budget without creating an account.
- Type “cinema tickets”, “taxi fare”, “groceries” and “coffee”; verify automatic categories on a supported device.
- Change a suggested category manually while inference is pending. Your choice must remain.
- Select receipt photos/HEIC batches in airplane mode. Check OCR → AI classification → auto-add and Undo.
- Disable Apple Intelligence: install the local fallback on Wi-Fi, then verify offline OCR/classification. Paused or failed installation must leave manual categories usable.
- Test missing dates/currencies, duplicate photos, exchange-rate overrides and edited expenses with Undo.
- Check chat keyboard/caret/Send, narrow widths and large text. Chat has no live web prices.
- Reopen existing local and previously account-linked budgets offline and verify they remain separate.

[Detailed OCR/AI workflow](RECEIPT_OCR.md). System-model behavior and fallback latency/RAM still need physical-device checks; compilation, simulator startup and mocked browser tests do not prove those properties.
