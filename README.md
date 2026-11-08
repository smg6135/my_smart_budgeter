# Pocket Budget

Budget, expenses, goals, currencies and receipt scanning.

| Path | Purpose |
| --- | --- |
| `apps/mobile/src/app` | Frontend routes |
| `apps/mobile/src/components` | Frontend components |
| `apps/mobile/src/hooks` | React hooks |
| `apps/mobile/src/lib` | Auth and service configuration |
| `services/api` | FastAPI backend |
| `services/ai` | LiteLLM routes and secret loader |
| `services/emulators` | Local Firebase Auth / Firestore |
| `infra/terraform` | GCP resources |
| `infra/gitops` | Regional Kubernetes deployments |
| `infra/argocd` | CD applications |
| `.github/workflows` | GitHub runner CI and release |

## Local

Requires Node 24, Python 3.11+ and Docker Desktop.

```bash
./scripts/dev.sh
```

Open http://localhost:8081. Create an account. Emulator console: http://localhost:4001. Verification links appear in `docker compose logs emulators`.

AI credentials belong to the operator: export `OPENAI_API_KEY` before starting. Vertex OCR also needs GCP credentials mounted through `POCKET_ADC_DIR` and a billing-enabled `GOOGLE_CLOUD_PROJECT`. Customers never enter provider keys. Without provider credentials, budget features work and AI requests return service errors.

## Platform

Email/password + Google OAuth → Firebase ID token → regional HTTPS Gateway + Cloud Armor → API → private LiteLLM. Redis limits requests; Firestore coordinates daily AI allowances across regions. Secrets come from Secret Manager through Workload Identity.

| Task | Default provider/model |
| --- | --- |
| Bulk OCR | Vertex Gemini 3.5 Flash-Lite |
| Single OCR | Vertex Gemini 3.8 Flash |
| Planning | OpenAI GPT-6 Luna |
| Conversation | OpenAI GPT-6 Sol |

Models are operator-configurable in `services/ai/config.yaml`. Bulk upload uses two concurrent requests, up to 20 files, 8 MB each. Review extracted expenses before saving.

Budgets remain on each device, scoped by account. Sign-in does not sync ledgers. Existing unscoped budgets remain untouched in legacy storage. Native tokens use SecureStore; web tokens use sessionStorage. Never put AI keys in `EXPO_PUBLIC_` variables.

## Guides

- [Implementation status](docs/IMPLEMENTATION_PLAN.md)
- [GCP deployment and release](docs/DEPLOYMENT.md)
- [Mobile / TestFlight](docs/TESTFLIGHT.md)
- [Currencies](docs/CURRENCIES.md)
- [Bank connections](docs/BANK_CONNECTIONS.md)

## Checks

```bash
python3 -m venv services/api/.venv
services/api/.venv/bin/pip install -r services/api/requirements-dev.txt
services/api/.venv/bin/python -m pytest -q services/api/tests
services/api/.venv/bin/python scripts/validate-platform.py
cd apps/mobile
npm ci
npm run typecheck
npm run lint
npm test
EXPO_PUBLIC_FIREBASE_PROJECT_ID=demo-pocket EXPO_PUBLIC_FIREBASE_API_KEY=fake-emulator-api-key npm run test:e2e
```

With local services running, `FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 services/api/.venv/bin/python scripts/smoke-local.py` checks real emulator tokens. `node scripts/smoke-browser.cjs` checks the real frontend/backend flow.

Cloud provisioning and live provider/device tests require configured accounts. See the implementation status for completed checks.
