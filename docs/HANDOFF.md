# Pocket Budget - session handoff

Updated: **2026-11-29, Asia/Seoul**. Read this before changing the app.

Repository: [smg6135/my_smart_budgeter](https://github.com/smg6135/my_smart_budgeter). Latest pulled commit: **38e1352**. Substantive app changes remain uncommitted in the working tree. Latest successful native build and Apple upload is **1.0.1 (14)** on November 27, including configurable categories. Apple processing/tester availability is not separately confirmed. The post-snapshot cosmetic download-label fix noted below is not in build 14.

## Current direction and user requirements

**November 29 minimal-copy cleanup and 1.0.2 release request:** user explicitly asked to eliminate obvious helper/instruction text, then build/upload **1.0.2**. Removed explanatory paragraphs from category Settings, currencies, AI, saved budgets, local data, receipt scanning, planning and empty states. Condensed alert/Shortcut help and platform limitations; kept actionable errors, destructive confirmations, FX/amount data and mobile-data consent information. Labels/actions/accessibility remain intact. Source app/package versions are 1.0.2. Lint/typecheck and **104 TypeScript tests** pass. All **99 browser scenarios** were verified across runs: the broad run passed 61 before the recurring Safari development-server network/symbolication error stopped it; the clean remaining-case rerun passed 36, and both interrupted mobile cases passed separately. No assertion was weakened. The authorized production build/upload command has been started and includes the extraction-first pipeline below and the prior download-label correction; build/upload results will be recorded after completion.

**EAS quota and direct fallback:** EAS reserved build number **15**, uploaded the source archive, then rejected build creation because the Free plan's monthly iOS allowance is exhausted until December 1. No EAS build/submission ID was created, and no plan upgrade was purchased. The repository is public, so standard GitHub-hosted macOS runners are free. A manual `testflight-direct.yml` workflow now builds/signs/uploads through Xcode and Apple directly. Existing Apple distribution/profile/ASC credentials were transferred in memory into encrypted GitHub **testflight environment** secrets, restricted to the `release/1.0.2` deployment branch. Private keys were not printed or written into the workspace/repository; no Expo login token was transferred. The app-only signing config plugin modifies generated Release signing through Expo configuration, not manual native-project edits. The local working tree/index will be preserved while publishing a release snapshot branch for this authorized build. Direct CI execution is pending.

**November 29 extraction-first fix, source only:** user clarified OCR → mini-LLM extraction (title, quick detail, amount) → separate mini-LLM category request using title/detail → listing. Previously the runtime categorized OCR first and only then cross-checked financial fields; there was no summary stage. New `src/receipt-extraction.ts` performs extraction before category inference with separate prompts. The second call receives only title/detail and category IDs, not OCR/history/financial fields. Jobs share the existing bounded serialized runtime to preserve memory/background safeguards, rather than allocating parallel model contexts. Extraction is schema/bounds validated; malformed output stops before categorization. Category failure keeps valid extraction for manual review. LLM financial proposals require independent parsed OCR agreement/high confidence before auto-add; missing/conflicting fields remain review-only, and amount/currency pairs are kept together. No extra model financial-review call follows classification.

Title/detail flow into receipt review and persisted listing rows. `receiptMerchant` preserves printed merchant identity for duplicate suggestions, separate from generated/edited titles; manual ledger edits and Undo preserve that metadata. Progress exposes OCR/extraction/category phases. Tests pass **104 TypeScript cases**, lint/typecheck and **30 focused browser checks** across desktop/mobile Chromium/Safari. Coverage includes two-call ordering, no raw OCR/financial fields in category input, malformed extraction, category failure retaining summary, cancellation, financial disagreement preventing auto-add, amount/currency pairing, summary persistence/manual edits and deduplication by printed merchant. Actual model accuracy/latency and native receipt-editor UI acceptance remain pending. These changes are not in uploaded 1.0.1 (14); no native build, EAS request or CI dispatch was started for this fix.

**1.0.1 requested November 27:** Settings now includes per-budget expense-category bubbles with add/× removal. Defaults migrate without changing old entries; retain 1–24 names of at most 32 characters and reject normalized duplicates. Removed categories stay visible on historical entries/filters and can be retained while editing an old entry. OCR → merchant/item text → local LLM uses the active list; typed and purchase-alert suggestions use that same list. Opaque category IDs and strict output membership prevent model-invented categories. Native iOS now exposes generic Foundation Models generation so the custom contract works with both system AI and downloaded Qwen. Financial parsing/review/confidence/FX checks remain separate. No cloud classifier or keyword category fallback was added.

Post-upload-snapshot source cleanup: fixed a stray `Â` before the separator in the model-download progress label in device-ai.native.ts. That cosmetic correction is not in build 14; it does not affect classification or finance. Do not trigger another native build solely for that label. All category features are included in the verified build 14 artifact.

The user explicitly requested release as **1.0.1**; source app/package versions are updated. Current checks: **97 TypeScript tests**, lint/typecheck and **33 browser cases** (category editor, receipt/manual flows and capture/dedup across desktop/mobile Chromium/Safari) pass. The initial browser recheck exposed a UTC/local-date error in the existing capture fixture after midnight Seoul; it now uses the intended local purchase date. Actual configurable-prompt accuracy still needs phone acceptance. Authorized production build **1.0.1 (14)**, ID **81995712-7509-4499-ae5b-0e07a917c954**, finished successfully, including the updated Swift bridge. Automatic submission **7521b204-822a-4873-88c1-61887bf1da70** is **FINISHED**, with no reported error: Apple upload completed. Apple processing/tester availability is not separately confirmed. Do not submit build 14 again. Signed IPA verification confirms bundle/version/build and the category editor/configurable-classification JavaScript; SHA-256 ed86bb3ede0681b6b4dab9ccb3dd2c9732002b1d5c905313c9e4e33b64da61cc. Ignored evidence/artifact: .tools/release-14/. No GCP billing or paid plan was enabled.

- Fully device-local budget controller, free and MIT-licensed. OCR and AI classification are separate stages. No hosted backend, Firebase/Google sign-in, paid model API, LiteLLM, cloud OCR or category keyword/rules fallback.
- The latest user instruction explicitly authorized removing legacy cloud services and deleting GCP project **normies-main** to stop spending. This supersedes prior instructions to preserve that infrastructure. Do not restore it from older implementation documents or Git history.
- Preserve saved budgets and booked FX. Update existing phone installations; never uninstall/reset data for troubleshooting. Existing account-namespaced device budgets must remain accessible offline without authenticating or merging ledgers.
- Conserve native-build quota. Native workflows remain manual. Prefer local lint/typecheck/unit/browser checks; do not dispatch EAS or CI builds speculatively.
- Minimal mobile UI, statistics-first Overview, concise wording, accessible keyboard/caret, narrow-screen and large-text behavior.
- Continue authorized work without repeated confirmation. Keep updates brief and distinguish implemented source, actual verification and pending phone acceptance.

## GCP shutdown: verified result

On 2026-11-22 the authenticated gcloud CLI verified the target name/ID normies-main and project number 785696345014. It was ACTIVE, billing-enabled, with running GKE clusters pocket-us/pocket-sg and the pocket-litellm SQL instance. Compute commitments list was empty.

A standalone billing-unlink attempt failed HTTP 429. Project deletion then succeeded. Subsequent reads confirmed:

| Check | Result |
| --- | --- |
| Project lifecycleState | DELETE_REQUESTED |
| billingEnabled | false |
| billingAccountName | empty |

The project is shut down and pending final deletion; individual underlying resource deletions and the final bill were not separately verified. Charges accrued before shutdown can still arrive. Local CLI evidence is in ignored .tools/cloud-retirement/. Do not restore/re-enable billing without a new explicit request.

The user later explicitly authorized shutting down **krago-canada** too. No domain registrations or compute commitments were listed. Billing unlink and project deletion succeeded; subsequent reads confirmed DELETE_REQUESTED, billingEnabled false and no billing-account link. Do not restore it without a new request. This confirms shutdown, not a zero historical billing balance.

The checked billing account's project list then returned an empty array: no linked projects remained. No outstanding-balance verification or audit of other billing accounts was performed.

**Staging scope changed afterward:** the user authorized retiring krago-canada-staging, then explicitly asked to keep only the krago.info domain for future use. Billing was unlinked, domain auto-renew disabled, project deletion succeeded, and the project was immediately restored after the user's correction to retain domain management. Resource Manager now reports ACTIVE while billing remains disabled/unlinked. **Do not delete that project or the krago.info registration, or re-enable billing, without a new explicit request.** The public domain registry confirms registration through 2027-06-01 16:09:25 UTC, transfer/delete protection, and no hold status. Last verified Cloud Domains renewal state before restoration was RENEWAL_DISABLED.

**Core project rename:** at the user's request, the restored project's display name is now **normiesai-core** (underscores are not allowed in GCP display names). Its permanent project ID remains **krago-canada-staging** and number 656800289954. ACTIVE and billing disabled/unlinked were verified. This is the domain-preservation container, not a revived staging app.

**2026-11-23:** user requested krago.info auto-renewal ON, explicitly keeping billing OFF. Cloud Domains rejected the attempted automatic-renewal update because billing access is unavailable. Renewal is **not enabled**; last verified state remains RENEWAL_DISABLED. Billing was rechecked OFF/unlinked. This requested change is pending, not complete. The same turn discussed a hypothetical Plaid connector/backend; no bank integration, provider account, backend deployment or billing reactivation was authorized or performed.

Cloud Domains now denies access because billing is disabled; Compute/Scheduler explicitly report BILLING_DISABLED. The earlier CONSUMER_INVALID/project-not-found restore errors are historical. Detailed domain management and individual app-resource cleanup remain pending; waiting for propagation alone does not fix the current billing gate. Billing was not re-enabled. Do not claim old load balancers, 23 schedulers, databases, repositories and buckets were individually deleted, or that the project inventory is verified domain-only. Preserve the domain and container, keep app services off, and plan cleanup before any future billing reactivation. See [retirement record](DEPLOYMENT.md).

## Purchase notifications: current implementation

User requested local notification capture on both platforms and protection against Wallet/bank duplicates. Implemented an opt-in Android NotificationListenerService in `modules/pocket-transaction-capture`, scoped to selected DBS/POSB/Amex/Google Wallet packages. A bounded native worker stores redacted alerts in an Android Keystore AES-GCM queue excluded from backup; it never starts the LLM. Alerts retain the budget owner selected when received. JavaScript imports while foregrounded and acknowledges only after successful ledger persistence, with replay-aware retries. Pending inbox and native queue each cap at 100; native overflow/errors are visible.

iOS cannot read other apps' bank notifications. Implemented `/capture` custom-scheme route for a user-configured Wallet Transaction Shortcut, plus manual paste. It validates fields and creates a pending draft only. This brings the app forward and may require unlocking; real Wallet automation fields/behavior are unverified. No AppIntent/background bank listener, Plaid integration, backend or webhook was added.

Tools → Purchase alerts provides review, local AI category suggestions, exact-source replay suppression, possible duplicate suggestions, combine alerts, link existing expense, ignore and explicit separate-purchase actions. Similarity never automatically discards two same-price real purchases. Card token last-four differences do not prevent suggestions. Linking preserves existing money/date/FX/category. Receipt imports now hold possible existing purchases for review and can attach multiple receipt hashes to one expense; Undo preserves subsequently linked evidence. Exact replay tombstones remain saved. See [notification setup and limitations](NOTIFICATION_CAPTURE.md).

Current capture source passes **91 TypeScript unit tests**, lint and typecheck. Android autolinking resolves the new module. All **90 browser scenarios** were verified across the broad run and targeted reruns: the broad run passed 57 before Safari development-server network/symbolication errors stopped it; a clean Safari run passed all 30 and the three remaining mobile layout checks passed. All 18 purchase-capture scenarios passed across desktop, mobile Chromium and Safari. Native compilation, JUnit execution and physical-device acceptance remain pending; no native build or CI dispatch was started.

**November 24 follow-through:** provider-scoped reference matches now survive edited/different merchant names and missing financial fields, always as review suggestions. Shortcut fingerprints normalize equivalent decimal amounts, currency case and time-zone representations. Combining a refund with a purchase is rejected so the refund guard cannot be bypassed. All **94 TypeScript tests**, lint and typecheck pass. All **18 browser capture cases** passed again across desktop, mobile Chromium and Safari, including the new equivalent-payload replay assertion. The broader 90-scenario regression evidence above remains the November 23 run. No new native build was dispatched.

## Compared with last uploaded build 12

Baseline for this November 24 comparison: application commit **19965ce**, TestFlight **1.0.0 (12)**. The app changes were subsequently built/uploaded as build 13 on November 26; installation on a phone and physical acceptance are not confirmed.

| Area | Build 12 | Current working tree |
| --- | --- | --- |
| Local OCR | iOS Apple Vision; Android unavailable | Bundled Android ML Kit implementation with bounded decoding/worker lifecycle; iOS CPU-only Vision request |
| Local LLM | System AI and downloaded Qwen3 0.6B already present | Same local models; improved receipt category input and lock/background cancellation. Qwen is not newly introduced |
| Lock during OCR/AI | Unsafe Promise assumption when stopping native completion | Void-or-Promise stop handling, lifecycle invalidation and foreground stage waits; physical crash reproduction pending |
| Purchase alerts | No capture/inbox | Opt-in Android listener/encrypted queue; iPhone Wallet Shortcut URL import/manual paste; review and local category suggestions |
| Duplicate handling | Exact receipt-image fingerprints | Persistent alert replay IDs, review suggestions, combine/link/separate actions, provider references, multiple receipt hashes and Undo evidence preservation |
| Accounts/cloud | Authentication and legacy cloud services/configuration remained | No sign-in/backend/LiteLLM dependency; saved account budgets separately selectable offline; legacy services/infra removed |
| Scripts | Mixed native/cloud helpers | Retained helpers grouped by usage; unused cloud scripts removed |

Not implemented: direct interception of other apps' iPhone notifications, guaranteed locked/background Shortcut import, automatic bank settlement/refund reconciliation, Plaid/open-banking connection, backend/webhooks or cross-device sync. Current-source Android compilation/JUnit, real bank alert formats/permission/process-death tests, iPhone Wallet automation fields and physical crash-fix acceptance remain unverified. iOS compilation/archive and Apple upload subsequently passed for build 13 on November 26. Windows has no Java/Android SDK or Swift/Xcode toolchain on PATH; the explicitly authorized release used EAS.

## Architecture paths

| Path | Responsibility |
| --- | --- |
| apps/mobile/App.tsx | Budget UI, state and receipt import |
| apps/mobile/src/app | Expo Router routes |
| apps/mobile/src/components and src/hooks | UI and workflows |
| src/finance.ts, currency.ts, plans.ts, storage.ts | Exact financial calculations, booked FX, plan history and device persistence |
| modules/pocket-receipt-ocr | iOS Apple Vision and Android bundled ML Kit image-to-text only |
| modules/pocket-transaction-capture | Opt-in Android notification listener and encrypted bounded queue |
| src/transaction-capture.ts, shortcut-capture.ts, capture-acknowledgements.ts | Capture validation, review/deduplication, Shortcut input and persistence-before-acknowledgement |
| modules/pocket-device-ai | Apple Foundation Models; Android Gemini Nano/AICore; native model-integrity verification |
| src/lib/device-ai.native.ts | System/local LLM selection, serialized inference, classification/review and chat |
| src/ai-lifecycle.ts | Generation invalidation, safe native stopping and foreground waits |
| src/local-model.ts, local-model-store.ts, lib/local-model.native.ts | Pinned weights, acquisition state machine and native download/filesystem adapter |
| src/local-ai-prompts.ts, local-model-output.ts, classification.ts | Prompts, strict response framing and fixed categories |
| src/receipt-text.ts, receipt-audit.ts, receipt-processor.ts, receipts.ts | OCR financial parsing, review guards, imports/deduplication/Undo |
| src/api.ts | Public FX and shared data types; no hosted app API |
| scripts/ios | Reusable simulator artifact download and Release launch/screenshot checks |
| scripts/assets | Native icon generation |

Legacy services, infra, Compose, backend release workflow and cloud/emulator scripts are removed from tracked source. Ignored/untracked operator files were preserved. Old implementation/refinement documents and initial.md are historical requirements, not a deployment recipe. The current app has no cloud deployment dependency.

## OCR and local LLM: two stages

1. Photos/Camera selects up to 20 images, 8 MB each; process serially. Native PDFs are rejected.
2. **OCR:** Apple Vision on iOS; bundled ML Kit Latin text recognizer on Android. OCR returns text, real confidence and normalized top-left bounds. No category decisions and no server upload. Android image validation, orientation, decode limits and unsupported-script behavior are described in [OCR details](RECEIPT_OCR.md).
3. Ordinary code extracts printed merchant, final payable total, explicit currency and date. Missing/conflicting evidence remains uncertain. A generic dollar sign never establishes a currency; missing dates never become today.
4. **LLM classification/review:** ready Apple Foundation Models on eligible iOS 26+ hardware, or available Android Gemini Nano/AICore; otherwise downloaded Qwen3 0.6B Q4_K_M through llama.rn. The independent fallback review reads original OCR without seeing the parsed draft; code requires matching fields. Models cannot replace money, date or currency.
5. Auto-add requires high-confidence financial evidence, valid category, successful review, valid FX and normal import validation. Otherwise show one correction screen. Exact-image hashes prevent duplicates; a possible existing purchase is held for linking or explicit separate import. Undo removes only unchanged entries from that import and preserves subsequently attached evidence.

Default categories: Food & drinks, Groceries, Transport, Shopping, Health, Entertainment, Other. Version 1.0.1 allows changing the per-budget list in Settings; the production classification contract is in src/category-prompt.ts. Unknown/unclear model output needs manual selection. Receipt category input removes numeric-only layout/date lines and complete labeled financial rows before its 1,600-character budget; this is input preparation, not category rules. Real-model accuracy improvement is unmeasured. Independent financial review retains original text.

Typed-entry suggestions debounce for 650 ms on eligible new expenses; manual selections and newer descriptions win over late responses. Chat is local, bounded and has no web research, executable budget changes or model-controlled arithmetic. Browser remains manual budgeting.

## Offline operation and remaining internet use

- No application server, Google Cloud account, Firebase configuration, Google OAuth or AI API key is needed.
- Qwen weights download once from the pinned public Hugging Face URL; automatic installation only on Wi-Fi/Ethernet, explicit Download now allows mobile data. Thereafter inference works offline. First installation needs internet and a native build containing the runtime; Expo Go cannot provide it.
- Live FX optionally uses the public Coinbase endpoint with only a currency code. Manual exchange rates work offline. This is not a hosted app backend.
- System AI assets are managed by the OS. Android receipt OCR uses a bundled model rather than a first-use cloud model download. The current Android recognizer covers Latin script; additional script models are not bundled.
- Local model files are excluded from backup. No cross-device sync, bank connection or guaranteed export/backup feature exists. Sign-in never provided synchronization.

## Model/runtime invariants

- Pin llama.rn **0.13.0-rc.12** for RN 0.88 compatibility; 0.12.9 failed on removed RCTCxxBridge. Do not upgrade without native validation.
- Qwen3 0.6B Q4_K_M model ID qwen3-06b-q4km-v1, exact bytes **484220320**, revision **60b85c0e3d8fe0f6474f406922a26d12aca4550d**.
- SHA-256 **9acfc1e001311f34b4252001b626f2e466d592a42065f66571bff3790d4e1b14**. URL/manifest in src/local-model.ts; licenses bundled in local-model-notices.json.
- Single acquisition, partial staging, HTTP 200 plus exact size and streamed native SHA-256 before installation. Fresh-process cached weights are verified; interrupted partials restart. Persist pause; do not continuously retry failures on polling.
- CPU inference, two threads, memory mapping, 2,048-token context, serialized work. Release on idle/background/memory pressure. Actual older-phone latency/RAM needs testing.
- Disable Qwen thinking both in completion and chat template. Prefer parsed answer content; strip only the known assistant/end protocol envelope. Never extract arbitrary JSON from reasoning or accept truncated/interrupted output.
- A prior 17-description synthetic CPU test found Qwen3 16/17, Qwen2.5 13/17, Gemma 270M 12/17. This is not production accuracy evidence. See [model details](LOCAL_AI.md).

## Screen-lock crash: evidence and fix

Uploaded local PocketBudget-2026-11-22-132432.ips is build 12, iOS 26.6.1, iPhone14,7, Apple Intelligence unavailable. It records EXC_CRASH/SIGABRT and an Objective-C exception rethrown from ObjCTurboModule::performVoidMethodInvocation while the main thread enters _applicationDidEnterBackground. It omits the original exception reason/JS stack. It does not record Jetsam, watchdog termination or a Vision/Metal fault.

Found a concrete matching bug: suspension called stopCompletion().catch(...), but the pinned native JSI binding returns undefined despite its Promise type. This deterministically throws TypeError whenever a loaded context is suspended. stopLocalCompletion now awaits void or Promise inside try/catch and contains synchronous native exceptions. Regression tests reproduce the old error. Phone reproduction of the fixed build remains pending; do not claim the missing exception reason was recovered from the report.

Additional lifecycle hardening: epoch checks after native awaits reject lock/unlock-interrupted and queued work; late initialization releases its context even if the original stop found none; release awaits stop; the native adapter owns lifecycle handling. Receipt stages/completion wait for foreground and cancel on unmount/clear. Interrupted AI output requires correction. Hashing buffers are isolated from the OCR/inference async frame. Already-running CPU OCR may finish while locked, but no next stage starts.

iOS Vision now requests CPU-only execution to avoid background GPU use during an in-flight OCR request. This uses the compatible usesCPUOnly API, deprecated in newer SDKs; native compilation and latency acceptance remain pending. GPU was an initial hypothesis, not confirmed by this crash report. Raw .ips files are Git-ignored and remain local.

## Verification and release memory

**November 26 authorized release:** user explicitly requested building and uploading the current app to TestFlight, superseding the no-speculative-build preference for this release. EAS authenticated as mgsong19, reserved **1.0.0 (13)** and finished production build **e9e69881-d54e-4d51-acc7-b70811646085** successfully (ARCHIVE SUCCEEDED). Automatic submission **8dd2013f-a255-4214-9fdc-87ef155eb242** is **FINISHED**, with no reported error: Apple upload completed. Apple processing/tester availability is not separately confirmed. This builds the working tree including uncommitted capture/local-only fixes; the EAS Git metadata still names HEAD 38e1352 and is not proof of a clean committed release. No GCP billing or paid plan was enabled. Local lint/typecheck and 94 unit tests pass. Downloaded signed IPA verification confirmed bundle ID, version/build 1.0.0/13, capture/receipt-dedup JavaScript and native OCR/AI modules. Its SHA-256 is dc19e0b3478acbb0f1846aecb7a6f03c4adbbca535ff94295a6885ec52baf6b7; ignored evidence is under .tools/release-13/. Do not submit build 13 again.

The user also asked about bypassing Expo limits. Expo SDK can remain while replacing EAS Build/Submit with Mac/Xcode archiving and direct Apple upload. Added `scripts/ios/release-testflight.sh`, a validated `POCKET_IOS_BUILD_NUMBER` app-config override and [direct release instructions](TESTFLIGHT.md#direct-xcode-release-without-eas-build). Argument/platform/smoke/build-number guards and shell syntax pass locally; a direct Mac archive/upload is unverified because this host is Windows with no configured Mac runner. These release-tool additions occurred after build 13's source upload and are not needed by that binary. Keep build numbers coordinated between direct Apple uploads and EAS remote versioning.

Latest uploaded customer release: **1.0.1 (14)** as recorded at the top. Build 13 was the previous local-only/capture release. Previous release **1.0.0 (12)** used application commit **19965ce**, EAS build **a6118fa8-f382-460d-bbd8-68e8edd710db**, submission **22b8d33b-0a3f-4ae0-a839-e20992ba6795** finished. Bundle com.mingonsong.pocketbudget; App Store Connect 6835131439; iOS minimum 16.4. Expo owner mgsong19, slug pocket-budget, project 165287c3-0bf6-4bc7-9772-d80583c9df04.

Historical validation before this local-only/Android OCR cleanup: 78 browser checks passed; Android native compiled; iOS Release compiled/launched; simulator downloaded verified weights and correctly categorized taxi fare/dentist/movie tickets. Receipt fixture was uncertain and held for review; the old exact-approval smoke assertion failed, later changed to accept conservative review, not rerun remotely. Do not call this a fully green current native integration run.

The Android OCR/cloud-removal/profile baseline passed 78 TypeScript tests and 72 browser scenarios before notification capture was added; current counts and rerun details are in the purchase-notifications section above. Expo Android autolinking resolves both new modules. Script syntax, workflow YAML/manual triggers and local documentation links pass. The statistics test awaits all three cards and font readiness before measuring; no layout assertion was weakened. Kotlin policy/worker tests are implemented and included in the manual Android validation workflow, but have not run locally. No new native build, EAS request or CI dispatch was started. Windows has no full Swift/iOS or Android SDK toolchain on PATH.

Reusable historical simulator artifact: **57acdc26-a42d-4dfe-bd83-b457d7221e70**, from cadfee3, build version 1. Native dependency removals in this working tree mean it is **not a matching artifact for current-source native acceptance**. Do not repack incompatible runtime artifacts. Builds 10/11 predate the complete response-framing fix; do not submit them. Build 12 is already submitted; do not duplicate submission.

EXPO_PUBLIC_LOCAL_AI_SMOKE=1 is synthetic CI-only, never production. It forces fallback and writes diagnostics without ledger mutation; production config rejects it. Native workflows remain workflow_dispatch only.

## Commands and next work

Stack: Expo **58.0.26**, React Native **0.88.1**, React **19.3.0**, Node **24**, npm, TypeScript **6.0.3**. Android API 26+, arm64 devices/x86_64 emulators. Read [mobile instructions](../apps/mobile/AGENTS.md) and matching Expo 58 docs before Expo/RN API changes. Generated apps/mobile/ios and android are ignored CNG output; edit local modules/config plugins instead.

From apps/mobile: npm ci; npm run typecheck; npm run lint; npm test; npm run test:e2e. Native module checks when toolchains exist: npm run test:ios-ocr; npm run test:model-integrity. npm run prepare:local-ai prepares native runtime artifacts before a local prebuild; installation in this Windows session used npm ci --ignore-scripts to avoid unnecessary native downloads. Retained helper usage is in [scripts/README.md](../scripts/README.md).

Priority acceptance:

1. Review/test current Android OCR native build: real Latin receipts, rotated/mirrored photos, HEIC support by device, invalid/oversized/low-confidence images, airplane mode from first launch, batch lock/unlock and memory pressure. Unsupported scripts or uncertain evidence stay manual.
2. Verify the screen-lock fix on the existing phone installation after an authorized build. Do not reset budgets. Check OCR, model loading/generation and unlock; inspect any new .ips report.
3. Verify offline access and isolation for existing local and previously account-linked saved budgets; no authentication, implicit merging or data loss.
4. Physical system-model/fallback acceptance, download pause/retry/offline reuse, older-device RAM/latency, receipt accuracy, keyboard/caret/large-text behavior.
   Notification acceptance also requires a matching native build: Android real bank payloads, permission revoke, locked/process-death delivery, bounded queue/overflow, profile switching and reset; iPhone real Wallet Shortcut fields and foreground/unlock behavior. See [capture acceptance](NOTIFICATION_CAPTURE.md).
5. Confirm final normies-main and krago-canada deletion and historical charges separately if requested. Keep krago.info in normiesai-core (ID krago-canada-staging), with billing disabled; domain management and individual app-resource cleanup currently require billing access. Do not reactivate billing or delete the core project/domain without a new explicit request.
6. Bank connections, synchronization/export, merchant grouping/subscription labels and web-assisted chat remain unimplemented ideas, not promised functionality.

Read [OCR](RECEIPT_OCR.md), [local AI](LOCAL_AI.md), [mobile release/testing](TESTFLIGHT.md), [currencies](CURRENCIES.md), [cloud retirement](DEPLOYMENT.md) for details. Update this handoff after substantive work and never add credentials or signed artifact URLs.
