# Pocket Budget

A free, MIT-licensed, device-local budget controller. No authentication, hosted backend or paid AI API is required. Budgets and receipt processing stay on your device.

**New session:** read the [handoff and remaining work](docs/HANDOFF.md) first.

## Run locally

Use Node 24:

```bash
cd apps/mobile
npm ci
npm run web
```

The browser supports manual budgeting. Native OCR and AI require an iOS/Android development or release build; Expo Go cannot load these modules. Run `npm run prepare:local-ai` before local native prebuild. [Mobile setup](docs/TESTFLIGHT.md).

## On-device features

- **OCR:** Apple Vision on iOS and bundled ML Kit text recognition on Android read receipt images. Android OCR is implemented; native compilation and physical-device acceptance of the new bridge remain to be verified.
- **Separate AI stage:** available Apple Foundation Models or Android Gemini Nano/AICore classifies OCR text and typed expenses, and supports local chat. Otherwise, downloaded Qwen3 0.6B runs locally.
- **Receipts:** clear, AI-classified receipts auto-add with Undo. Uncertain fields open one correction screen.
- **Manual entry:** a category you choose takes priority over AI suggestions.
- **Editable categories:** Settings shows category bubbles with add and × removal. OCR text, typed entries and purchase alerts use the active list for local AI suggestions; historical categories remain unchanged.
- **Purchase alerts:** opt-in Android bank/Wallet notification capture; iPhone Shortcuts import. Alerts stay in a review inbox with replay protection and possible-duplicate linking. [Setup and platform limits](docs/NOTIFICATION_CAPTURE.md). New native capture code still needs a matching build and phone testing.
- **Calculations:** ordinary code validates amounts, currencies, balances and savings projections; AI cannot overwrite financial fields.

When system AI is unavailable, iOS/Android can install Qwen3 0.6B (~484 MB) on Wi-Fi and then run offline. Settings supports mobile-data download and pause/retry. Unavailable installation or inference preserves manual categories; there is no cloud or rules classifier. OCR and AI are independent stages; bundled Android OCR does not need a model download. Browsers support manual budgeting. [Model details](docs/LOCAL_AI.md) | [OCR workflow](docs/RECEIPT_OCR.md).

Exchange rates use Coinbase's public endpoint without authentication; manual rates work offline. Initial Qwen installation and live FX need internet. There is no sign-in or cross-device synchronization.

Existing budgets previously associated with accounts remain separate saved budgets on this device and can be selected offline in Settings.

## Repository

| Path | Purpose |
| --- | --- |
| `apps/mobile/src/app` | Frontend routes |
| `apps/mobile/src/components` | UI |
| `apps/mobile/src/hooks` | React workflows |
| `apps/mobile/modules/pocket-receipt-ocr` | Native OCR only |
| `apps/mobile/modules/pocket-device-ai` | System AI and model integrity bridge |
| `apps/mobile/src/lib` | Native/local AI adapters and client utilities |
| [scripts](scripts/README.md) | iOS simulator helpers and icon generation |

Legacy cloud services, emulators, Terraform, GitOps, Argo CD, Docker Compose and cloud release automation have been removed from tracked source. [Cloud retirement status](docs/DEPLOYMENT.md) records the verified project deletion request and billing limits.

## Checks

Automatic CI runs current app typecheck, lint, unit and browser checks only. iOS and Android native validation workflows remain manual to conserve quota. Prefer local checks and matching simulator artifacts. No cloud release workflow remains.

```bash
cd apps/mobile
npm run typecheck
npm run lint
npm test
npm run test:e2e
npm run test:ios-ocr
npm run test:model-integrity
```

[Implementation](docs/IMPLEMENTATION_PLAN.md) | [Mobile / TestFlight](docs/TESTFLIGHT.md) | [Currencies](docs/CURRENCIES.md)
