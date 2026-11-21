# Mobile testing

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

Run `npm run prepare:local-ai`, then `npx expo run:android` with a current Android SDK/JDK 17. The app requires Android 8+ (API 26), with 64-bit ARM devices or x86_64 emulators. Available Gemini Nano is preferred; otherwise the same local model installs inside the app. Receipt OCR remains iOS-only.

## TestFlight

Latest uploaded build: **1.0.0 (12)**. The [existing signed build](https://expo.dev/accounts/mgsong19/projects/pocket-budget/builds/a6118fa8-f382-460d-bbd8-68e8edd710db) was verified and its [TestFlight upload](https://expo.dev/accounts/mgsong19/projects/pocket-budget/submissions/22b8d33b-0a3f-4ae0-a839-e20992ba6795) finished. Update when Apple processing makes it available; keep the existing installation to preserve local data.

Build 12 adds the downloaded local-model fallback and native response parsing. Without system AI, connect to Wi-Fi and check Settings → On-device AI for installation progress. After installation, test in airplane mode. Native entry classification was exercised successfully; the receipt fixture was conservatively held for manual category review. Physical-phone performance still needs testing. Native CI is now manual and no further builds are scheduled to conserve quota.

Use the existing Expo project and App Store Connect app (`com.mingonsong.pocketbudget`, app ID `6835131439`):

```bash
cd apps/mobile
npx eas-cli@latest build --platform ios --profile production
npx eas-cli@latest submit --platform ios --profile production --latest
```

Build **1.0.0 (8)** adds the separate native AI module, typed-entry classification, no-fallback receipt classification, local chat and account-free budgets. Its [signed binary](https://expo.dev/accounts/mgsong19/projects/pocket-budget/builds/f45ee76f-0d45-48be-be41-d4b01987a6fa) was checked for both native modules, the classifier schema, weak Foundation Models linkage, local storage and the React startup symbol. Cloud AI route strings and the cloud OCR control are absent from its JavaScript bundle. Its [TestFlight upload](https://expo.dev/accounts/mgsong19/projects/pocket-budget/submissions/17af4d71-ff42-4d69-af81-e75093716e01) finished on 2026-11-21. [Native CI](https://github.com/smg6135/my_smart_budgeter/actions/runs/44885223534) passes compilation and account-free startup. Local verification passes 51 unit tests, 78 browser checks and three real Vision tests. Update the existing installation when its TestFlight build appears to retain device-local data.

Firebase/Google configuration is optional and only enables sign-in to existing account budgets. A normal local budget does not need it. Existing account storage keys are preserved; local budgets use a separate key. Sign-in does not sync data between devices.

## iPhone checks

- Launch directly into the budget without creating an account.
- Type “cinema tickets”, “taxi fare”, “groceries” and “coffee”; verify automatic categories on a supported device.
- Change a suggested category manually while inference is pending. Your choice must remain.
- Select receipt photos/HEIC batches in airplane mode. Check OCR → AI classification → auto-add and Undo.
- Disable Apple Intelligence: install the local fallback on Wi-Fi, then verify offline OCR/classification. Paused or failed installation must leave manual categories usable.
- Test missing dates/currencies, duplicate photos, exchange-rate overrides and edited expenses with Undo.
- Check chat keyboard/caret/Send, narrow widths and large text. Chat has no live web prices.
- Reopen existing local/account budgets and verify they remain separate.

[Detailed OCR/AI workflow](RECEIPT_OCR.md). System-model behavior and fallback latency/RAM still need physical-device checks; compilation, simulator startup and mocked browser tests do not prove those properties.
