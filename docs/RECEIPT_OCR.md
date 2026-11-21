# OCR and on-device AI

These are separate stages and native modules.

1. **Apple Vision OCR** reads a local image into text, confidence scores and text bounds. It does not assign spending categories.
2. **Field parsing** extracts printed amounts, explicit currencies and dates. Validation/conversion use ordinary code.
3. **Apple Foundation Models** classifies the OCR text and checks the extracted draft. The same AI service classifies typed expense descriptions.
4. Valid, confidently read, AI-classified receipts auto-add with **Undo**. Uncertain receipts open one correction screen.

There is no cloud upload or substitute classifier. If the model is disabled, missing, unsupported, fails, or cannot decide, the category stays blank for manual selection. OCR may still populate financial fields. Those parsed fields are not an AI fallback and never authorize automatic addition without a successful AI classification.

The classifier returns only fixed category labels. It cannot change amounts, currencies or dates. Manual category choices and saved entries are never overwritten by later suggestions. Greedy generation reduces sampling variation; OS/model updates can still change future classifications.

## Code

| Stage | Location |
| --- | --- |
| Photo/camera workflow | `apps/mobile/src/hooks/use-receipts.ts` |
| OCR bridge | `apps/mobile/modules/pocket-receipt-ocr` |
| OCR field parsing | `apps/mobile/src/receipt-text.ts` |
| AI bridge and Foundation Models engine | `apps/mobile/modules/pocket-device-ai` |
| Shared AI adapter | `apps/mobile/src/lib/device-ai.ios.ts` |
| Entry suggestions | `apps/mobile/src/hooks/use-entry-classification.ts` |
| Receipt pipeline and financial validation | `apps/mobile/src/receipt-processor.ts`, `src/receipts.ts` |

Photos opens the native gallery; Camera captures a photo. Up to 20 images, 8 MB each, process serially on-device. Exact image hashes prevent duplicate imports. Undo removes the latest unchanged import and preserves unrelated/edited entries. Images and OCR text stay transient; the ledger stores the expense and its hash.

## Requirements and testing

OCR works in the native iOS build. AI requires iOS 26+, eligible Apple Intelligence hardware, enabled Apple Intelligence and ready model assets. A fresh native binary is required for the separate AI module. Android/browser OCR and AI are not implemented; those platforms offer manual budgeting, never cloud AI.

On a supported iPhone:

1. Enter descriptions such as “cinema tickets”, “supermarket groceries”, “taxi fare” and “coffee”. Check automatic categories.
2. Choose a category manually while classification is pending; verify the later result does not replace your choice.
3. Select clear receipt photos in airplane mode. Verify OCR then classification, auto-add and Undo.
4. Select a duplicate photo, an ambiguous date/currency and a blurry total. Verify no duplicate or invented financial field.
5. Disable Apple Intelligence. OCR should still read the image; category selection becomes manual, with no upload option or cloud request.
6. Test disabled/not-ready models and a device without Apple Intelligence. Manual budgets and categories remain usable.

Real model inference requires an eligible physical device. Browser tests cover manual behavior/capability gating; unit tests inject model outputs to verify ordering, validation and no fallback.

## Other small AI tasks

Future uses of the same local service: merchant-name grouping, subscription labels and goal-intent tags (travel/purchase/emergency). These should suggest labels only. Recurrence schedules, balances, limits and savings calculations stay in code.

References: [Apple Vision](https://developer.apple.com/documentation/vision/recognizing-text-in-images), [Foundation Models availability](https://developer.apple.com/documentation/foundationmodels/systemlanguagemodel), [guided generation](https://developer.apple.com/documentation/foundationmodels/generating-swift-data-structures-with-guided-generation), [content tagging](https://developer.apple.com/documentation/foundationmodels/categorizing-and-organizing-data-with-content-tags).
