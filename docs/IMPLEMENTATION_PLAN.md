# Implementation status

| Step | Result |
| --- | --- |
| 1. Repo structure | Done: frontend routes/components/hooks/lib under `apps/mobile`; backend under `services/api`; AI under `services/ai`. |
| 2. Authentication | Implemented: email/password, Google OAuth, token refresh, revocation checks, account-scoped local budgets and secure native token storage. Local identity checks pass. Live Google consent/native callbacks need OAuth configuration. |
| 3. Platform AI | Implemented: private LiteLLM; bulk/single OCR, planning and conversation routes; operator-owned credentials; Redis limits and global Firestore quotas. Proxy startup and alias authentication verified. Paid provider calls await credentials. |
| 4. GCP foundation | Terraform validates: two GKE Autopilot clusters, networking, identity, secrets, registries, global usage counters, HTTPS Gateways and Cloud Armor. Not applied. |
| 5. CI/CD | Prepared: GitHub runner tests/builds image digests; release PR; Argo CD reconciles regional overlays. Manifests validate locally. GitHub/GKE execution awaits account setup. |
| 6. Verification | 37 backend tests, 21 finance/currency/queue tests, and 57 desktop/mobile/Safari browser checks pass. Typecheck and lint pass. Native JS bundle exports. Real emulator signup, verification, quota and account-deletion checks pass. LiteLLM runs non-root with a read-only filesystem. |
| 7. Provision and smoke test | Project `normies-main` selected; waiting for operator login, then apply infrastructure, configure DNS/OAuth/provider secrets, bootstrap Argo CD, and test live endpoints. |

Approved regions:

- US: `us-central1`, `https://backend.normiesai.com`.
- Singapore: `asia-southeast1`, `https://sg.backend.normiesai.com`.

Canada was removed before provisioning. Existing DNS must be inspected before changing the backend record.

The mobile app selects its service region. Identity is global, quota counters default to US Firestore `nam5`, and AI processing follows provider configuration. This is regional compute, not a data-residency guarantee.

Real frontend + backend browser smoke also passes signup, expense entry, reload persistence and sign-out, without API mocks.

Local Docker services run at API :8000, Auth emulator :9099, Firestore :8080 and emulator UI :4001. LiteLLM and Redis have no host port. Run `scripts/dev.sh` for the frontend.

`normies-main` inputs and DNS hosts are rendered. gcloud currently has no active account.

Remaining: this work has not created GCP resources, run GitHub releases, produced signed native builds, uploaded to Apple or made paid provider calls. Live Google OAuth, device camera/Keychain and provider schema/image/PDF/search compatibility require their target accounts.

Dependency check: no high/critical npm advisories remain after compatible fixes. Moderate advisories remain in Expo/ESLint tooling; forcing npm's suggested SDK downgrade was avoided.
