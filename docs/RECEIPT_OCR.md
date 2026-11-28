# OCR and on-device AI

These are separate stages and native modules.

1. **Apple Vision OCR (iOS) / bundled ML Kit (Android)** reads a local image into text, confidence scores and text bounds. It does not assign spending categories.
2. **Local LLM extraction** reads OCR text in a fresh request and produces title, quick detail, printed merchant, final payable amount, currency and date. Ordinary OCR field parsing runs independently as a financial cross-check.
3. **Separate local LLM categorization** receives only extracted title/detail plus the active Settings categories. It never receives the first conversation, raw OCR, amount, currency or date fields. Both inference jobs use the same bounded runtime sequentially; there is no second simultaneous model copy. iOS uses available Foundation Models or Qwen3 0.6B; Android uses available Gemini Nano or Qwen3.
4. Valid, confidently read, AI-classified receipts auto-add with **Undo**. Uncertain receipts open one correction screen.

There is no cloud upload or rules classifier. If system AI is unavailable, the app installs local Qwen3 weights on Wi-Fi. A receipt uploaded during installation waits for that download. If offline before installation, paused, failed or unable to decide, category selection remains manual. OCR may still populate financial fields. Parsed fields never authorize automatic addition without successful AI classification/review.

The category pass returns only an active category ID. The extraction pass may propose financial fields, but auto-add requires agreement with independently parsed high-confidence OCR, valid FX and successful category validation. Missing/conflicting financial evidence stays in review; a currency is never combined with an unrelated parsed amount. Manual category choices and saved entries are never overwritten by later suggestions. Greedy generation reduces sampling variation; OS/model updates can still change future classifications.

## Code

| Stage | Location |
| --- | --- |
| Photo/camera workflow | `apps/mobile/src/hooks/use-receipts.ts` |
| OCR bridge | `apps/mobile/modules/pocket-receipt-ocr` |
| OCR field parsing | `apps/mobile/src/receipt-text.ts` |
| LLM extraction and separate category job | `apps/mobile/src/receipt-extraction.ts` |
| Active-category prompt/output validation | `apps/mobile/src/category-prompt.ts` |
| AI bridge and Foundation Models engine | `apps/mobile/modules/pocket-device-ai` |
| Shared AI adapter | `apps/mobile/src/lib/device-ai.native.ts` |
| Download, integrity and local runtime | `apps/mobile/src/local-model-store.ts`, `src/lib/local-model.native.ts` |
| Entry suggestions | `apps/mobile/src/hooks/use-entry-classification.ts` |
| Receipt pipeline and financial validation | `apps/mobile/src/receipt-processor.ts`, `src/receipts.ts` |

Photos opens the native gallery; Camera captures a photo. Up to 20 images, 8 MB each, process serially on-device. Exact image hashes prevent duplicate imports. Undo removes the latest unchanged import and preserves unrelated/edited entries. Images and OCR text stay transient; the ledger stores the expense and its hash.

The review screen exposes title, quick detail, merchant and financial fields. New listings display and persist title/detail; the printed merchant is stored separately for wallet/bank/receipt duplicate suggestions even when the generated title differs. Undo preserves later detail/merchant edits. Progress distinguishes reading text, extracting receipt details and choosing a category. This revised extraction-first flow is source-only after build 14, not yet uploaded to TestFlight; actual model accuracy/latency and native phone UI need acceptance.

Possible matches to an existing purchase now stay in review instead of auto-adding. Link the receipt to that expense or confirm a separate purchase. Linking preserves its booked money and category and attaches another image fingerprint; Undo preserves entries with subsequently linked evidence. This also covers receipts scanned after a bank/Wallet alert was added. See [purchase capture and duplicate handling](NOTIFICATION_CAPTURE.md).

## Requirements and testing

OCR is implemented for native iOS and Android builds containing the module. Apple system AI requires iOS 26+, eligible hardware, enabled Apple Intelligence and ready assets. Other iOS/Android devices use downloaded Qwen3 through the bundled llama.cpp runtime. A new native build is required once to include that runtime; subsequent model installation happens inside the running app. Browser AI stays unavailable. See [fallback details](LOCAL_AI.md).

### Android implementation and verification (2026-11-22)

The local Expo module registers `PocketReceiptOcr` on Android, using **`com.google.mlkit:text-recognition:16.0.1`**, the bundled **Latin-script** recognizer. OCR needs no first-use model download, cloud OCR, AI key or Gemini availability. Chinese, Japanese, Korean and Devanagari models are **not bundled**; receipts in those scripts are not supported by this Android OCR implementation. The app minimum remains API 26. Existing installed builds and Expo Go cannot gain this native module through a JavaScript update.

The Android adapter returns `RecognizedReceipt` with engine `mlkit`. Lines carry ML Kit's actual confidence and normalized, top-left bounds; invalid confidence becomes zero rather than a fabricated high score. Existing 0.6 parsing and 0.85 financial evidence thresholds still apply. AI approval alone cannot authorize low-confidence imports. Confidence calibration and accuracy on real receipts remain unmeasured.

Only `file:` URIs resolving canonically beneath the app's internal cache/files directories are accepted. Arbitrary readable files, traversal outside those roots, remote URLs and content-provider URIs are rejected. Native Photos/Camera must supply a cached local image. Actual reads are bounded to 8 MB; headers must describe at most 50 megapixels. Decoding uses power-of-two sampling to at most 4096 pixels per side and 4 million decoded pixels (about 15.3 MiB ARGB per bitmap), then AndroidX EXIF orientation/mirroring before recognition. A distinct transformed bitmap causes immediate recycling of the original, bounding the transformation overlap to about 30.6 MiB of pixel buffers, excluding encoded bytes, ML Kit and LLM memory. All file I/O, decoding and blocking ML Kit waits run on a module-owned single-thread executor; the shared Expo queue only enqueues. Teardown rejects queued/new work while letting an active read finish without interruption. Even an unexpected thread interruption is deferred until ML Kit settles; no timeout frees a bitmap still in use. Each recognizer is closed and remaining bitmaps recycled after settlement. Empty text and results over 1,000 lines / 64,000 UTF-16 units are rejected. PDFs remain unsupported. HEIC decoding depends on the Android OS/device codec; use JPEG/PNG if unavailable.

Local verification: **24 receipt tests passed**, including ML Kit engine parity and low/zero-confidence review guards. Expo Android autolinking resolves the new module. Kotlin unit tests were added for canonical directory restrictions, dimension/pixel limits, normalized bounds, invalid confidence, worker teardown/queued rejection and interruption-safe task settlement, but **were not executed**: Java, Kotlin, Gradle and Android SDK tools were unavailable on PATH. No native compile, emulator/phone OCR, native fixture execution or cloud build was performed. Typecheck and lint passed after concurrent auth edits settled. The complete TypeScript unit suite passes 78 tests; current browser verification is recorded in the handoff.

Pending native acceptance: compile the module with the project's Expo 58 toolchain, run its `ReceiptOcrPolicyTest` and `ReceiptOcrWorkerTest`, then test real Latin receipts in airplane mode from Photos/Camera, rotated/mirrored images, JPEG/PNG/device-supported HEIC, corrupt/oversized/no-text photos, and low-confidence financial fields. Verify the complete OCR → AI → review/import/Undo flow and batches across lock/unlock on a physical Android device. These are pending checks, not evidence that native OCR has run successfully.

Implementation references: [Expo 58](https://docs.expo.dev/versions/v58.0.0/), [Expo module API](https://docs.expo.dev/modules/module-api/), [module registration](https://docs.expo.dev/modules/module-config/), [ML Kit Android bundled recognition](https://developers.google.com/ml-kit/vision/text-recognition/v2/android), [ML Kit line confidence/bounds](https://developers.google.com/android/reference/com/google/mlkit/vision/text/Text.Line), [AndroidX EXIF releases](https://developer.android.com/jetpack/androidx/releases/exifinterface).

On a supported iPhone:

1. Enter descriptions such as “cinema tickets”, “supermarket groceries”, “taxi fare” and “coffee”. Check automatic categories.
2. Choose a category manually while classification is pending; verify the later result does not replace your choice.
3. Select clear receipt photos in airplane mode. Verify OCR then classification, auto-add and Undo.
4. Select a duplicate photo, an ambiguous date/currency and a blurry total. Verify no duplicate or invented financial field.
5. Disable Apple Intelligence. On Wi-Fi, check local-model download progress in Settings, then repeat entry classification and scanning offline.
6. Test pause/retry, first use offline and mobile data. Manual budgets remain usable throughout. Automatic downloads wait for Wi-Fi; Download now permits mobile data.

Apple/Gemini system inference requires an eligible physical device. The downloaded fallback also works on supported simulators. Browser tests cover manual behavior/capability gating; unit tests cover acquisition, verification, offline reuse, classification boundaries and financial validation.

## Other small AI tasks

Future uses of the same local service: merchant-name grouping, subscription labels and goal-intent tags (travel/purchase/emergency). These should suggest labels only. Recurrence schedules, balances, limits and savings calculations stay in code.

References: [Apple Vision](https://developer.apple.com/documentation/vision/recognizing-text-in-images), [Foundation Models availability](https://developer.apple.com/documentation/foundationmodels/systemlanguagemodel), [guided generation](https://developer.apple.com/documentation/foundationmodels/generating-swift-data-structures-with-guided-generation), [content tagging](https://developer.apple.com/documentation/foundationmodels/categorizing-and-organizing-data-with-content-tags).
