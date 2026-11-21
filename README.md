# Pocket Budget

A free, MIT-licensed budget controller. Budgets stay on your device. No account, paid AI API, or hosted backend is required.

## Run locally

Use Node 24:

```bash
cd apps/mobile
npm ci
npm run web
```

The browser supports manual budgeting. Native OCR and AI require an iOS development/TestFlight build; they are not included in Expo Go. [Mobile setup](docs/TESTFLIGHT.md).

## On-device features

- **OCR:** Apple Vision reads receipt photos, including HEIC/HEIF.
- **AI classification:** Apple Foundation Models categorizes OCR text and typed expenses into Food & drinks, Groceries, Transport, Shopping, Health, Entertainment or Other.
- **Receipts:** clear, AI-classified receipts auto-add with Undo. Uncertain fields open one correction screen.
- **Manual entry:** describing an expense suggests its category. A category you choose yourself takes priority.
- **Calculations:** amounts, currencies, balances and savings trajectories use ordinary code.
- **Chat:** runs locally, without web price research or cloud model calls.

AI requires iOS 26+ and an available Apple Intelligence model. When unavailable, categories stay manual; there is no cloud or rules classifier fallback. Android/web currently support manual budgeting. [OCR and AI workflow](docs/RECEIPT_OCR.md).

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

```bash
cd apps/mobile
npm run typecheck
npm run lint
npm test
npm run test:e2e
npm run test:ios-ocr
```

[Implementation](docs/IMPLEMENTATION_PLAN.md) · [Mobile / TestFlight](docs/TESTFLIGHT.md) · [Currencies](docs/CURRENCIES.md)
