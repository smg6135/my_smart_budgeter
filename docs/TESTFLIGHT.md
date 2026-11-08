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

1. The US and Singapore APIs are deployed. Production public values are prepared in the ignored `apps/mobile/.env.production`.
2. Create the App Store Connect app for bundle ID `com.mingonsong.pocketbudget`.
3. Add the prepared public values in Expo project settings → Environment variables → production. Include Firebase configuration, Google web/iOS client IDs, reversed iOS URL scheme and both HTTPS API origins. Keep `EXPO_PUBLIC_AUTH_EMULATOR_URL` empty, including in local production builds, so the local `.env` cannot enable emulators. [Expo environment setup](https://docs.expo.dev/eas/environment-variables/manage/).
4. Build and upload:

```bash
cd apps/mobile
npx eas-cli@latest login
npx eas-cli@latest init
npx eas-cli@latest build --platform ios --profile production
npx eas-cli@latest submit --platform ios --profile production --latest
```

Use your Apple Developer account when prompted. Let EAS manage signing or select your existing credentials. Optionally set `submit.production.ios.ascAppId` in `eas.json`. No signed build or upload has been made yet.

After processing, open App Store Connect → TestFlight → add the build to an internal test group. Install TestFlight on your phone and accept the invitation. External groups require Beta App Review. Uploading a build does not publish it to the App Store. [Expo submission](https://docs.expo.dev/submit/ios/), [TestFlight distribution](https://docs.expo.dev/submit/testflight/).

## Device checks

- Signup, verification, Google login, refresh, sign-out and account separation.
- Expense CRUD, goals, currency conversion and persistence after reopening.
- Camera, multi-file upload, PDF, retry and receipt review.
- Region selection through HTTPS Gateways.
- No provider-key field; AI works with server credentials.
- Signed-in offline budgets remain available; AI reports connection failures.

Browser tests do not validate native Google callbacks, camera, Keychain or Apple signing. Budgets are device-local and do not move from browser to native app.
