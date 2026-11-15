# Receipt formats and device OCR

## HEIC / HEIF

The scanner accepts `.heic` and `.heif` in single and batch uploads, alongside JPG, PNG, WEBP and PDF. Missing/generic file MIME types fall back to the filename extension.

Deployed to US central and Singapore on 2026-11-15. Real HEIC single/bulk OCR passed through both public HTTPS APIs; both Argo applications are synced and healthy.

The API decodes the primary HEIF image to JPEG before cloud OCR. It applies container rotation/mirroring, strips metadata, limits the longest edge to 4096 pixels and rejects corrupt or mismatched files before charging AI quota. Limits: 8 MB input/output, 50 megapixels before decoding, one HEIF decode at a time per API worker. Conversion runs outside the async request loop. The source file is not saved by the backend.

Server conversion also works for browsers without a HEIC decoder; no browser preview or customer conversion step is needed. This changes file support, not the OCR provider. Current scanning still uploads images for cloud OCR.

## Device OCR assessment

| Platform | Recommended engine | Integration |
| --- | --- | --- |
| iOS | Apple Vision `VNRecognizeTextRequest`, accurate mode | System framework; extract text from selected/camera images. VisionKit can add a native capture UI later. |
| Android | Google ML Kit Text Recognition v2 | On-device SDK. Bundle Latin and Chinese models for US/Singapore receipts; add other scripts as needed. |
| Web | Existing cloud OCR | Native Vision/ML Kit modules are unavailable in a browser. |

[Apple Vision](https://developer.apple.com/documentation/vision/recognizing-text-in-images) processes images on-device, including offline. [VisionKit](https://developer.apple.com/documentation/visionkit/scanning-data-with-the-camera) provides a camera scanning UI with device-availability checks. Vision is sufficient for the existing still-image upload flow.

[ML Kit](https://developers.google.com/ml-kit) also processes text on-device. It is an SDK to include, rather than a universal Android OS text API. Its [Android installation options](https://developers.google.com/ml-kit/vision/text-recognition/v2/android) are bundled models (available immediately/offline, about 4 MB per script per architecture) or Play Services downloads (smaller app, unavailable until downloaded). Bundled models avoid first-use downloads and suit offline receipt scans. HEIC decoding depends on the Android device; retain a conversion/cloud fallback.

Both engines return recognized text and layout, not a complete validated receipt. The app must identify the final total rather than tax/subtotal, resolve ambiguous `$` currency/date formats and assign a category. Local OCR has no per-image cloud inference call; end-to-end cost and accuracy need receipt evaluation.

## Proposed integration

1. Add a local [Expo native module](https://docs.expo.dev/modules/get-started/) exposing `recognize(uri)` for Vision/ML Kit. Return ordered text lines, bounds and optional confidence. Check engine availability and selected script; do not silently upload failed local scans.
2. Parse clear merchant/total/currency/date fields on-device and show the existing review form. Keep incomplete fields editable; category can default to Other.
3. Offer text-only cloud parsing for ambiguous receipts through an authenticated, quota-limited endpoint and a cheap LiteLLM route. This endpoint is not implemented yet.
4. Offer image cloud OCR for unreadable files, unsupported devices/scripts and PDFs. Preserve batch progress, retry and review behavior.
5. Evaluate real English/French/Chinese receipts, mixed scripts, tax/tip/subtotal distractors, ambiguous currencies, rotation and poor lighting on iPhone/Android before enabling device OCR by default.

The native module requires a new development/TestFlight/Android build; an Expo Go session or JavaScript-only update cannot add it. PDFs need page rasterization or the existing cloud route.

## Verification

HEIC conversion has API tests using a real synthetic receipt container, including MIME aliases, metadata removal, rotation, corrupt inputs and size limits. Browser tests cover HEIC/HEIF batch selection on desktop, phone viewport and WebKit. These do not replace testing the iPhone/Android file pickers.

An Apple Vision probe on the development Mac recognized the merchant and `TOTAL USD 5.00` in both PNG and HEIC synthetic fixtures. This validates the framework with these files on macOS; iOS native integration, Android execution and real receipt accuracy are not yet tested. Device OCR remains a proposed integration; current app scans use cloud OCR.
