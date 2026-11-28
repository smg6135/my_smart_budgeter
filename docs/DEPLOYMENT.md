# Cloud retirement

Pocket Budget now runs on the device without authentication, a hosted API, cloud OCR or cloud AI inference. Live public FX and initial local-model downloads are optional network operations, not a deployed application backend.

## Repository retirement

Tracked legacy FastAPI, LiteLLM and Firebase emulator services, Docker Compose, Terraform, GitOps/Argo CD configuration, cloud operations scripts and the backend release workflow have been removed. Ignored or untracked local files, including operator state and environments, are preserved. Removing repository files alone does not delete remote resources.

CI checks the current app only. iOS and Android native workflows are manually dispatched validation jobs; no EAS build or cloud deployment is started by this cleanup. The retained [scripts](../scripts/README.md) support simulator artifact reuse and asset generation.

## Verified GCP status

Live gcloud verification returned these results on **2026-11-22** for the named project **`normies-main`**:

- Project describe returned **`DELETE_REQUESTED`**. Deletion was requested successfully; final deletion completion has not been verified.
- Billing describe returned **`billingEnabled: false`** and an empty **`billingAccountName`**. A standalone billing unlink attempt failed with HTTP 429; the subsequent successful project deletion request removed the billing link.
- Compute commitments were empty.

Past usage charges may still arrive. No billed-cost verification was performed, and these checks do not establish a zero balance or zero charges across the billing account.

The user subsequently explicitly authorized retiring **`krago-canada`** as well. No domain registrations or compute commitments were listed. Billing was successfully unlinked, deletion succeeded, and subsequent verification returned **`DELETE_REQUESTED`**, **`billingEnabled: false`**, and an empty billing-account link. Its project number is `101632154678`. Final resource deletion and historical charges remain separate from these verified shutdown results.

After that shutdown, the checked billing account's project-list request returned **`[]`**: no linked projects remained. This does not establish a zero outstanding balance or audit other billing accounts.

## Staging retirement with domain retained (2026-11-22)

The user subsequently authorized shutting down `krago-canada-staging` (project number `656800289954`). No compute commitments were found. Auto-renewal for its `krago.info` registration was disabled and verified as `RENEWAL_DISABLED`. Billing was successfully unlinked; project deletion succeeded and was verified as `DELETE_REQUESTED` with `billingEnabled: false` and an empty billing-account link.

**The user then changed the scope: keep `krago.info` for future use, while retiring the app.** The project was immediately restored to preserve domain management. Resource Manager confirms `ACTIVE`; billing remains disabled with no linked billing account. Do not delete the project or domain registration again, or re-enable billing, without a new explicit request. The production `krago-canada` project was not changed.

The public authoritative registry, reached through RDAP, confirms that `krago.info` remains registered through **2027-06-01 16:09:25 UTC**, with transfer/delete protection and no hold status. Auto-renewal was disabled before restoration; keep the expiry visible to the user rather than implying indefinite retention.

**2026-11-23 renewal request:** the user explicitly requested auto-renewal ON while retaining billing OFF. The attempted `automatic-renewal` management update was rejected by Cloud Domains with a billing-access denial. Auto-renewal has therefore **not** been enabled; its last verified state remains OFF. Billing was rechecked and remains disabled with no linked account. Do not report renewal enabled or silently reactivate billing to complete it.

**Latest configuration:** the user asked to repurpose the restored project as a domain-only core container. Its display name is now **`normiesai-core`**, verified after update. Underscores are not allowed in GCP project display names, so the suggested `normiesai_core` was normalized to a hyphen. The permanent project ID remains **`krago-canada-staging`**; project IDs cannot be renamed. Resource Manager reports ACTIVE, with billing disabled and no billing-account link.

**Verification limit:** earlier restore-propagation errors have now become explicit **BILLING_DISABLED** errors from Compute/Scheduler and a billing-access denial from Cloud Domains. Waiting for propagation alone does not resolve the current management restriction. Detailed post-restore registration access and deletion of individual old app resources remain pending. Billing was not re-enabled to bypass these errors. Preserve the domain and the project container, keep app services off, and do not claim a verified domain-only resource inventory. Any future billing reactivation needs a cleanup plan first so old app resources do not resume billing.

Before retirement, staging contained an HTTP/HTTPS load balancer, an external address, 23 enabled Scheduler jobs whose last attempts failed, Firestore databases, BigQuery datasets, image repositories and storage buckets. Do not claim that those resources were individually deleted: billing is disabled, but resource-level post-restore cleanup has not been verified.

The former deployment used GKE clusters `pocket-us` in `us-central1` and `pocket-sg` in `asia-southeast1`. These names are historical context, not a current deployment recipe or a claim of individually verified resource deletion. Confirm final project deletion and subsequent billing statements separately if needed.

References: [Google project shutdown](https://docs.cloud.google.com/resource-manager/docs/delete-restore-projects), [disabling billing and outstanding charges](https://docs.cloud.google.com/billing/docs/how-to/modify-project).
