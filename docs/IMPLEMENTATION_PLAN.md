# Implementation status

Deployed to `normies-main` on 2026-11-08.

| Step | Result |
| --- | --- |
| Repo structure | Frontend and hooks in `apps/mobile/src`; backend in `services/api`; AI routing in `services/ai`. |
| Authentication | Email/password and Google OAuth implemented. Existing project auth settings preserved. Live password login, token verification and disabled-account rejection pass. |
| AI | Four routes active through private LiteLLM: Vertex bulk/single OCR, OpenAI planning/conversation. Credentials mounted from Secret Manager. |
| GCP | US central and Singapore Autopilot clusters deployed. HTTPS certificates active; Cloud Armor attached; Redis limits and shared Firestore daily quotas enabled. |
| CI/CD | GitHub runner tests/builds immutable regional images. Release PR merged after CI. Argo CD reports Synced / Healthy in both clusters. |
| Dashboard | Private LiteLLM UI login verified. Both regions share Cloud SQL usage history. Prompt/response storage verified empty. |
| Validation | 38 backend tests, 21 TypeScript tests and 57 desktop/mobile/Safari browser checks pass. Lint, typecheck and native JS export pass. Terraform reports no changes. |

Live endpoints:

- US: https://backend.normiesai.com
- Singapore: https://sg.backend.normiesai.com
- LiteLLM: http://localhost:4000/ui while `./scripts/litellm-ui.sh us` runs.

Live checks passed for bulk OCR, single OCR, planning and conversation in both regions. Public HTTPS auth, FX, daily quota exhaustion and disabled-token rejection pass. A planning request with web search enabled also completed through the public Gateway.

Production Firebase/OAuth and regional API values are prepared in the ignored `apps/mobile/.env.production`. See [TestFlight](TESTFLIGHT.md) for signing and upload. No signed iOS build has been uploaded. Google consent/native callbacks, camera, Keychain and PDF/batch behavior still need device checks.

Budgets remain device-local. Identity is global; usage counters and shared LiteLLM Postgres are in the US. Cloud SQL and Redis use single-instance MVP configurations. Regional compute does not guarantee regional data residency.

Local services: frontend :8081, API :8000, Auth :9099, Firestore :8080, emulator UI :4001. Local LiteLLM/Redis have no host ports.

Dependency check: no high/critical npm advisories after compatible fixes; moderate Expo/ESLint tooling advisories remain.
