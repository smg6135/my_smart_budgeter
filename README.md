# Pocket Budget

A free, MIT-licensed budget controller. Budgets stay on your device. No account, paid AI API, or hosted backend is required.

**New session:** read the [handoff and remaining work](docs/HANDOFF.md) first.

## Run locally

Use Node 24:

```bash
cd apps/mobile
npm ci
npm run web
```

The browser supports manual budgeting. Native AI requires an iOS/Android development or release build; Expo Go cannot load it. Run `npm run prepare:local-ai` before local native prebuild (EAS does this automatically). [Mobile setup](docs/TESTFLIGHT.md).

## On-device features

- **OCR:** Apple Vision reads receipt photos, including HEIC/HEIF.
- **AI classification:** available Apple Intelligence/Gemini Nano first; otherwise a downloaded local model categorizes OCR text and typed expenses.
- **Receipts:** clear, AI-classified receipts auto-add with Undo. Uncertain fields open one correction screen.
- **Manual entry:** describing an expense suggests its category. A category you choose yourself takes priority.
- **Calculations:** amounts, currencies, balances and savings trajectories use ordinary code.
- **Chat:** runs locally, without web price research or cloud model calls.

Without system AI, iOS/Android automatically install Qwen3 0.6B (~484 MB) on Wi-Fi, without restarting or reinstalling the app. Then AI works offline. Settings supports download over mobile data and pause/retry. If installation/inference is unavailable, categories stay manual; there is no cloud or rules classifier. OCR is currently iOS-only; browsers support manual budgeting. [Model choice and testing](docs/LOCAL_AI.md) · [OCR workflow](docs/RECEIPT_OCR.md).

Exchange rates use Coinbase's public endpoint, without authentication; manual rates work offline. Optional sign-in opens an existing account's device-local budget. It does not sync data. Local and account budgets have separate storage keys.

## Repository

| Path | Purpose |
| --- | --- |
| `apps/mobile/src/app` | Frontend routes |
| `apps/mobile/src/components` | UI |
| `apps/mobile/src/hooks` | React workflows |
| `apps/mobile/modules/pocket-receipt-ocr` | Native OCR only |
| `apps/mobile/modules/pocket-device-ai` | Native classification and chat |
| `services`, `infra` | Legacy optional cloud services and deployments |

The previous GCP/LiteLLM deployment is separate from the free app and can incur hosting/provider charges while running. It is not required for local budgeting, OCR or AI classification. Existing infrastructure has not been deleted. [Legacy operations](docs/DEPLOYMENT.md).

## Checks

Native build workflows are manual to conserve quota. Prefer local checks and reuse matching simulator artifacts for JavaScript-only native verification.

```bash
cd apps/mobile
npm run typecheck
npm run lint
npm test
npm run test:e2e
npm run test:ios-ocr
npm run test:model-integrity
```

[Implementation](docs/IMPLEMENTATION_PLAN.md) · [Mobile / TestFlight](docs/TESTFLIGHT.md) · [Currencies](docs/CURRENCIES.md)
