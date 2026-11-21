# Mobile testing

## Local browser

Use Node 24. No Docker, GCP project, sign-in or AI key is required:

```bash
cd apps/mobile
npm ci
npm run web
```

For a phone browser, run `npx expo start --web --host lan` and open the shown LAN address on the same Wi-Fi. Browser/Android currently offer manual budgeting. They do not call cloud AI when on-device AI is unavailable.

## Native iOS

OCR and AI are separate local native modules. Expo Go cannot load them. Build a development client:

```bash
cd apps/mobile
npx eas-cli@latest login
npx eas-cli@latest build --platform ios --profile development
npx expo start --dev-client --lan
```

Apple Vision reads photos. Apple Foundation Models classifies the text and typed expenses, and runs chat. AI requires iOS 26+, supported Apple Intelligence hardware, enabled Apple Intelligence and ready model assets. Unsupported devices keep OCR/manual categories and budgeting; there is no substitute classifier or cloud upload.

## TestFlight

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
- Disable Apple Intelligence: OCR should work, category selection should be manual, and no upload control should appear.
- Test missing dates/currencies, duplicate photos, exchange-rate overrides and edited expenses with Undo.
- Check chat keyboard/caret/Send, narrow widths and large text. Chat has no live web prices.
- Reopen existing local/account budgets and verify they remain separate.

[Detailed OCR/AI workflow](RECEIPT_OCR.md). Real model accuracy still requires an eligible physical iPhone; simulator startup and mocked browser tests do not prove inference quality.
