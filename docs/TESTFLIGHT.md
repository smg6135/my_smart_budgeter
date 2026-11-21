# Mobile testing

## Phone browser

1. Start Docker Desktop.
2. Copy `apps/mobile/.env.example` to `apps/mobile/.env`.
3. Set API URL to `http://YOUR_MAC_IP:8000` and auth emulator URL to `http://YOUR_MAC_IP:9099`. Find the IP with `ipconfig getifaddr en0`.
4. Run from the repo root:

```bash
POCKET_BIND_ADDRESS=0.0.0.0 CORS_ORIGINS=http://YOUR_MAC_IP:8081,http://localhost:8081 ./scripts/dev.sh
```

Open `http://YOUR_MAC_IP:8081` on the same trusted Wi-Fi. Create an email/password account. Emulator verification links appear in `docker compose logs emulators`. The emulator admin console remains on localhost:4001.

Customers need no AI keys. Local AI testing requires operator credentials; see README. For Google sign-in, use a real configured Firebase project and its OAuth clients. The local emulator does not test the real Google consent flow.

## Native development build

Google sign-in uses a native module and requires a development build. Configure Firebase/OAuth values from [deployment](DEPLOYMENT.md), including the iOS URL scheme, then:

```bash
cd apps/mobile
npx eas-cli@latest login
npx eas-cli@latest init
npx eas-cli@latest build --platform ios --profile development
npx expo start --dev-client --lan
```

Install the resulting development build on a registered iPhone. The phone's `localhost` is the phone itself: use your Mac's LAN IP for local services.

## TestFlight

The first 1.0.0 build had a native launch crash: ExpoModulesCore required `RCTStatusBarAppearance`, absent from React Native 0.88.0. The fix aligns the Expo SDK packages with React Native 0.88.1. It requires a fresh native build; reinstalling build 1 or applying a JavaScript update cannot repair it. CI now checks dependency compatibility and launches a Release simulator build to verify the sign-in screen.

1. The US and Singapore APIs are deployed. Production public values are prepared in the ignored `apps/mobile/.env.production`.
2. Use the existing App Store Connect app for bundle ID `com.mingonsong.pocketbudget` (app ID `6835131439`).
3. Add the prepared public values in Expo project settings → Environment variables → production. Include Firebase configuration, Google web/iOS client IDs, reversed iOS URL scheme and both HTTPS API origins. Keep `EXPO_PUBLIC_AUTH_EMULATOR_URL` empty, including in local production builds, so the local `.env` cannot enable emulators. [Expo environment setup](https://docs.expo.dev/eas/environment-variables/manage/).
4. Build and upload:

```bash
cd apps/mobile
npx eas-cli@latest login
npx eas-cli@latest build --platform ios --profile production
npx eas-cli@latest submit --platform ios --profile production --latest
```

Use your Apple Developer account when prompted. Let EAS manage signing or select your existing credentials. The existing app is configured in `submit.production.ios.ascAppId` in `eas.json`.

Build **1.0.0 (7)** adds automatic receipt analysis, clear-receipt auto-add with Undo, exact-photo duplicate detection and one batch correction screen. Eligible iOS 26+ devices use Apple Foundation Models for local receipt review; other devices keep Vision parsing. It retains the chat keyboard fix and mobile redesign. The signed binary was checked for these JavaScript changes, native model schema/instructions, crypto module, weak Foundation Models linkage, bundle ID/version and React startup symbol. Its [TestFlight upload](https://expo.dev/accounts/mgsong19/projects/pocket-budget/submissions/8813b38e-731e-4136-9e07-f5905a2ddcca) finished on 2026-11-21. Update the existing installation when Apple processing finishes to preserve device-local budgets. See [mobile refinement](MOBILE_REFINEMENT_PLAN.md) for validation results.

After processing, open App Store Connect → TestFlight → add the build to an internal test group. Install TestFlight on your phone and accept the invitation. External groups require Beta App Review. Uploading a build does not publish it to the App Store. [Expo submission](https://docs.expo.dev/submit/ios/), [TestFlight distribution](https://docs.expo.dev/submit/testflight/).

## Device checks

The iOS receipt scanner includes a local Apple Vision module. Test automatic scans in airplane mode, clear-receipt auto-add, Undo, duplicate imports, uncertain-field batch correction and the explicit cloud-upload confirmation. Eligible iOS 26+ devices also use Apple Foundation Models for local text review; unsupported/disabled devices keep the Vision parser. Photos opens the native multi-select gallery; the app picker no longer selects PDF attachments. [OCR checks](RECEIPT_OCR.md).

- Signup, verification, Google login, refresh, sign-out and account separation.
- Entry sign/currency wheels, preferred currencies, expense CRUD and persistence after reopening.
- Camera/Photos, HEIC batch auto-add, Undo, duplicate imports, retry and one correction screen. On supported phones, test with Apple Intelligence enabled and disabled.
- Draft/activate/deactivate plans, Overview allocation and past calendar summaries.
- Bottom safe area, horizontal statistics and uncropped daily allowance.
- Chat: open the keyboard, type/edit a long multiline draft, scroll history, send a message and dismiss the keyboard. Input/caret/Send must remain visible; navigation should return after dismissal. Check a long AI proposal too.
- Region selection through HTTPS Gateways.
- No provider-key field; AI works with server credentials.
- Signed-in offline budgets remain available; AI reports connection failures.

Browser tests do not validate native Google callbacks, camera, Keychain or Apple signing. Budgets are device-local and do not move from browser to native app.
