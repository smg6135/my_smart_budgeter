# OCR and on-device AI

These are separate stages and native modules.

1. **Apple Vision OCR** reads a local image into text, confidence scores and text bounds. It does not assign spending categories.
2. **Field parsing** extracts printed amounts, explicit currencies and dates. Validation/conversion use ordinary code.
3. **Local AI** classifies the OCR text and checks the extracted draft: available Apple Foundation Models first, otherwise downloaded Qwen3 0.6B. The same service classifies typed expense descriptions. Android uses available Gemini Nano or Qwen3 for entry classification/chat.
4. Valid, confidently read, AI-classified receipts auto-add with **Undo**. Uncertain receipts open one correction screen.

There is no cloud upload or rules classifier. If system AI is unavailable, the app installs local Qwen3 weights on Wi-Fi. A receipt uploaded during installation waits for that download. If offline before installation, paused, failed or unable to decide, category selection remains manual. OCR may still populate financial fields. Parsed fields never authorize automatic addition without successful AI classification/review.

The classifier returns only fixed category labels. It cannot change amounts, currencies or dates. Manual category choices and saved entries are never overwritten by later suggestions. Greedy generation reduces sampling variation; OS/model updates can still change future classifications.

## Code

| Stage | Location |
| --- | --- |
| Photo/camera workflow | `apps/mobile/src/hooks/use-receipts.ts` |
| OCR bridge | `apps/mobile/modules/pocket-receipt-ocr` |
| OCR field parsing | `apps/mobile/src/receipt-text.ts` |
| AI bridge and Foundation Models engine | `apps/mobile/modules/pocket-device-ai` |
| Shared AI adapter | `apps/mobile/src/lib/device-ai.native.ts` |
| Download, integrity and local runtime | `apps/mobile/src/local-model-store.ts`, `src/lib/local-model.native.ts` |
| Entry suggestions | `apps/mobile/src/hooks/use-entry-classification.ts` |
| Receipt pipeline and financial validation | `apps/mobile/src/receipt-processor.ts`, `src/receipts.ts` |

Photos opens the native gallery; Camera captures a photo. Up to 20 images, 8 MB each, process serially on-device. Exact image hashes prevent duplicate imports. Undo removes the latest unchanged import and preserves unrelated/edited entries. Images and OCR text stay transient; the ledger stores the expense and its hash.

## Requirements and testing

OCR works in the native iOS build. Apple system AI requires iOS 26+, eligible hardware, enabled Apple Intelligence and ready assets. Other iOS/Android devices use downloaded Qwen3 through the bundled llama.cpp runtime. A new native build is required once to include that runtime; subsequent model installation happens inside the running app. Android OCR remains unimplemented. Browser AI stays unavailable. See [fallback details](LOCAL_AI.md).

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
