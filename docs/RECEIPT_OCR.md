# Receipt OCR

## iOS

New iOS builds use Apple Vision for image receipts, including HEIC/HEIF. Camera and file uploads use the same queue; batches still process every selected receipt. Vision runs on a serial background queue, without calling the backend or LiteLLM.

The native module is in `apps/mobile/modules/pocket-receipt-ocr`. It reads local files only, validates the 8 MB / 50 MP limits, applies image orientation and scales to a 4096-pixel longest edge before accurate text recognition. English, Chinese and French models are selected only when supported by the installed Vision revision; automatic language detection is enabled.

`src/receipt-text.ts` groups text observations into rows and extracts merchant, final total, explicit currency and printed date. Subtotals, taxes, cash tender, refunds and conflicting totals are not treated as the final expense. Ambiguous dollar signs, ambiguous numeric dates, missing fields and low-confidence text require review. Category defaults to Other. This is a conservative parser, not a claim of universal receipt accuracy.

The receipt card shows **On-device** and lets users inspect recognized text. Missing amount/currency/date values stay blank in review. Failed scans allow manual entry. No raw text is added to the saved ledger; files and recognized text stay in the transient scan queue, which clears on sign-out. Picker cache files follow the OS/Expo cache lifecycle.

Budget-currency expenses can be saved offline. Foreign expenses still require a fresh cached exchange rate or a rate entered manually.

Cloud OCR is optional on iOS: tap **Use cloud OCR**, then confirm the upload. Failures and unsupported files never trigger automatic uploads. PDFs currently need this explicit cloud path or manual entry. Missing native modules in an older build show an install-new-build message and preserve the cloud option.

## Build and test

A new native binary is required. JavaScript updates and Expo Go cannot add the module.

```bash
cd apps/mobile
npx eas-cli@latest build --platform ios --profile development
npx expo start --dev-client --lan
```

For TestFlight use the production build/submit steps in [TESTFLIGHT.md](TESTFLIGHT.md). Local `npm run ios` builds with Xcode; this workstation's Xcode 14.1 is below the project's native requirements. CI uses a current macOS/Xcode runner to compile the app and Expo bridge without Apple signing.

Local checks: `npm run test:ios-ocr` exercises the real Vision engine with PNG, HEIC and rotated JPEG fixtures, and rejects remote URLs, unreadable files and oversized files. The same core typechecks against the available iOS simulator SDK. TypeScript tests cover parsing, missing-field review, explicit cloud routing and failure without automatic fallback. Web tests cover the shared receipt queue/review UI; they do not execute the iOS bridge.

On an iPhone:

1. Sign in once, then enable airplane mode and select receipts already stored on the phone.
2. Process one image and a batch. Confirm **On-device**, review totals/currencies/dates and save.
3. Test an ambiguous `$` currency/date and a blurry receipt. Verify manual correction and **Show text**.
4. Try a PDF or failed scan. Verify no automatic cloud call; cancel the cloud confirmation.
5. Restore connectivity and confirm cloud OCR for one receipt. Verify its **Cloud** label and normal quota/auth behavior.

Real-device validation and a signed TestFlight build remain separate from the unsigned CI build.

Verified implementation: 35 TypeScript tests, 63 browser checks, three real Vision tests and an unsigned simulator build of the full app/Expo bridge pass. [iOS build run](https://github.com/smg6135/my_smart_budgeter/actions/runs/43726488387). This does not validate camera/file-picker interaction on a physical iPhone.

## Android and web

These retain the existing cloud scanner. Android on-device OCR is not implemented yet. [ML Kit Text Recognition v2](https://developers.google.com/ml-kit/vision/text-recognition/v2/android) is the planned engine; bundled Latin/Chinese models avoid first-use downloads. A later text-only cloud parser could help with ambiguous local OCR without uploading an image; that endpoint is not implemented.

## HEIC / HEIF backend

The API supports HEIC/HEIF alongside JPG, PNG, WEBP and PDF. It converts the primary HEIF image to JPEG, applies container orientation, strips metadata and validates size before charging AI quota. Conversion runs outside the request loop and allows one HEIF decode per API worker. The source file is not saved by the backend.

This path is deployed in US central and Singapore and was live-tested for single/bulk HEIC OCR. Server conversion also supports browsers without a HEIC decoder.

References: [Apple Vision](https://developer.apple.com/documentation/vision/recognizing-text-in-images), [Expo local modules](https://docs.expo.dev/modules/get-started/).
