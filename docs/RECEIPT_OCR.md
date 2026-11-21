# Receipt OCR

## iOS

New iOS builds use Apple Vision for image receipts, including HEIC/HEIF. **Photos** opens the native gallery with multiple selection; **Camera** captures a receipt. Selection immediately starts analysis; there is no queue or Process action. Vision runs on a serial background queue, without calling the backend or LiteLLM.

The native module is in `apps/mobile/modules/pocket-receipt-ocr`. It reads local files only, validates the 8 MB / 50 MP limits, applies image orientation and scales to a 4096-pixel longest edge before accurate text recognition. English, Chinese and French models are selected only when supported by the installed Vision revision; automatic language detection is enabled.

`src/receipt-text.ts` groups text observations into rows and extracts merchant, final total, explicit currency and printed date. Subtotals, taxes, cash tender, refunds and conflicting totals are not treated as the final expense. Ambiguous dollar signs, ambiguous numeric dates, missing fields and low-confidence text require review. Category defaults to Other. This is a conservative parser, not a claim of universal receipt accuracy.

Clear receipts are added automatically with **Undo**. Automatic addition requires merchant, positive exact amount, explicit currency and valid printed date; native OCR also requires the same fields to survive a stricter confidence cutoff. Cloud notes and a local model veto require correction. Only unclear receipts open one batch correction screen, with one **Add expenses** action. Missing fields stay blank. Failed scans allow Retry or manual details. Exact photo hashes prevent reimporting the same bytes; different photos of the same purchase still need user judgment. Undo removes the latest import's unchanged expenses and preserves edited or unrelated entries.

On eligible iOS 26+ devices, Apple Foundation Models reviews OCR text and classifies the expense locally. The module checks `SystemLanguageModel.default.availability`; disabled Apple Intelligence, unsupported hardware, unavailable model assets and inference errors fall back to deterministic Vision parsing. The model can approve/veto and select a category; it cannot change amounts, currencies or dates. It receives bounded OCR text, has no tools and never initiates a cloud request. On-device inference still needs physical-device acceptance; browser mocks cannot verify the real model.

No raw text is added to the saved ledger; files and recognized text stay in transient scanner state, which clears on sign-out. Picker cache files follow the OS/Expo cache lifecycle.

Budget-currency expenses can be saved offline. Foreign expenses still require a fresh cached exchange rate or a rate entered manually.

Cloud OCR is optional on iOS: tap **Try cloud analysis**, then confirm one upload for the unclear receipts. Failures never trigger automatic uploads. The app picker now selects photos only; PDF support remains available through the backend API. Missing native modules in an older build show an install-new-build message and preserve the cloud option.

## Build and test

A new native binary is required. JavaScript updates and Expo Go cannot add the module.

```bash
cd apps/mobile
npx eas-cli@latest build --platform ios --profile development
npx expo start --dev-client --lan
```

For TestFlight use the production build/submit steps in [TESTFLIGHT.md](TESTFLIGHT.md). Local `npm run ios` builds with Xcode; this workstation's Xcode 14.1 is below the project's native requirements. CI uses a current macOS/Xcode runner to compile the app and Expo bridge without Apple signing.

Local checks: `npm run test:ios-ocr` exercises the real Vision engine with PNG, HEIC and rotated JPEG fixtures, and rejects remote URLs, unreadable files and oversized files. The same core typechecks against the available iOS simulator SDK. TypeScript tests cover parsing, missing-field review, explicit cloud routing and failure without automatic fallback. Web tests cover automatic import, duplicate detection, Undo and the shared batch correction UI; they do not execute the iOS bridge.

On an iPhone:

1. Sign in once, then enable airplane mode and select photos already stored on the phone.
2. Confirm clear receipts auto-add without Process/Save/Review actions. Tap Undo and verify only the latest unchanged receipt expenses are removed.
3. Select the same photo again; confirm no duplicate expense. Select distinct photos with the same total; confirm they remain separate.
4. Select blurry photos or receipts with ambiguous `$`/dates. Confirm one correction screen, blank uncertain fields, scrollable controls above the keyboard, and one Add expenses action.
5. On an eligible iOS 26+ Apple Intelligence device, test with the model enabled and disabled. Both paths must remain local. Model classification/veto requires real-device testing.
6. Try a failed scan. Verify Retry/manual details and no automatic cloud call. Cancel cloud confirmation; then restore connectivity and confirm one cloud upload for all unclear receipts.

Real-device validation and a signed TestFlight build remain separate from the unsigned CI build.

Verified on 2026-11-21: 40 TypeScript tests, 78 browser checks, three real Vision tests and a Release simulator build/launch through sign-in pass. [iOS build run](https://github.com/smg6135/my_smart_budgeter/actions/runs/44862193891). Signed build 1.0.0 (4) is uploaded to TestFlight. Camera, gallery and wheel interactions still require a physical iPhone check.

## Android and web

These use automatic cloud scanning after photo selection. Android on-device OCR/LLM integration is not implemented yet. [ML Kit Text Recognition v2](https://developers.google.com/ml-kit/vision/text-recognition/v2/android) is the planned engine; bundled Latin/Chinese models avoid first-use downloads. [ML Kit GenAI Prompt API](https://developers.google.com/ml-kit/genai/prompt/android) exposes Gemini Nano through AICore on supported Android devices; availability and model downloads must be checked. It is a possible later local receipt reviewer after OCR, not a universal Android capability. A text-only cloud parser is also not implemented.

## HEIC / HEIF backend

The API supports HEIC/HEIF alongside JPG, PNG, WEBP and PDF. It converts the primary HEIF image to JPEG, applies container orientation, strips metadata and validates size before charging AI quota. Conversion runs outside the request loop and allows one HEIF decode per API worker. The source file is not saved by the backend.

This path is deployed in US central and Singapore and was live-tested for single/bulk HEIC OCR. Server conversion also supports browsers without a HEIC decoder.

References: [Apple Foundation Models availability](https://developer.apple.com/documentation/foundationmodels/systemlanguagemodel), [guided generation](https://developer.apple.com/documentation/foundationmodels/generating-swift-data-structures-with-guided-generation), [Apple Vision](https://developer.apple.com/documentation/vision/recognizing-text-in-images), [Expo local modules](https://docs.expo.dev/modules/get-started/).
