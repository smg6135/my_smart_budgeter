# Pocket Budget — session handoff

Updated: **2026-11-22, Asia/Singapore**. Read this first in a new session.

This snapshot follows application commit **`4b91818`** on `main`. The working tree was clean and GitHub matched that commit before this documentation task. Later handoff-only commits do not change the shipped app. Repository: [smg6135/my_smart_budgeter](https://github.com/smg6135/my_smart_budgeter).

## Start here

- The current product is a **free, MIT-licensed, device-local budget controller**. No account, hosted backend, or paid AI key is required for its core features.
- Latest uploaded iOS release: **1.0.0 (12)**. It includes the downloadable local-model fallback and native response-framing fix.
- **Conserve build quota.** The user explicitly asked to minimize further build attempts. Native iOS/Android workflows are now manual. Do not start a build or dispatch native CI merely to refresh memory or verify docs.
- Local checks last passed: **67 unit tests**, lint/typecheck. **78 browser checks** passed in the recorded MVP run. Android native compilation passed. See the verification section for important iOS limits.
- The unresolved area is **real-phone acceptance and fallback receipt accuracy**, not missing cloud credentials. Android receipt OCR and bank connections are not implemented.
- Older sections in other docs describe paid cloud AI, cloud OCR fallback, mandatory sign-in, and earlier TestFlight builds. Those are history; do not restore them as current requirements.

## User preferences and constraints

| Area | Keep this behavior |
| --- | --- |
| Product | Budget controller, minimal wording/buttons, statistics-first Overview. Avoid promotional copy. |
| Platforms | Mobile first; physical iPhone testing matters. Check narrow screens, large text, safe areas, keyboard/caret visibility. |
| AI | OCR and AI are separate stages. Use on-device AI for classification/review. No cloud inference or keyword/rules category substitute. |
| Fallback | The later request allows a **downloaded local LLM** when the system model is unavailable. Install inside the running app, then work offline. This supersedes the earlier blanket “no fallback” instruction only for local models. |
| Money | Amounts, currencies, rates, dates, balances and projections stay validated/calculated in ordinary code. A model cannot overwrite financial fields. |
| Imports | Photos/Camera → immediate analysis. Clear validated receipts auto-add with Undo. Uncertain fields get one correction screen. Do not restore queue/process/save-ready steps. |
| Manual edits | Manual categories and newer descriptions win over late AI suggestions. Preserve saved entries and booked FX. |
| Quota | Reuse existing builds/artifacts and local checks. Do not create speculative native builds for each small fix. |
| Data | Update the existing installation; do not uninstall/reset budgets as a troubleshooting shortcut. Sign-in is not synchronization. |
| Operations | Do not delete legacy GCP resources, publish the repository, or create bank/provider accounts merely because the app is now free/open source. |
| Communication | Short updates and answers. Continue authorized work without repeated confirmation questions. |

## What has changed

| Phase / commits | Implemented result |
| --- | --- |
| Initial app and `61abc55`–`4ae8c34` | Budget/expense/savings UI and local ledger; FE/hooks/backend separation; Firebase email/Google auth; regional GKE, Gateway, Cloud Armor, Redis/Firestore limits, Secret Manager, LiteLLM, GitHub CI and Argo CD. Cloud version remains as optional legacy infrastructure. |
| Currency work | Original-currency entries and separate display currency; exact minor-unit arithmetic, retained booked conversion, cached/live FX and explicit manual rates. Currency favorites limit entry selectors. |
| `cd787fd`–`9006590` | HEIC/HEIF acceptance and live cloud codec checks; native OCR feasibility research. |
| `b6d552d`, `faa0220` | Separate Apple Vision OCR module, local field parsing, native Photos/camera and receipt processing. |
| `5d61b52`–`efba97e` | Reproduced TestFlight launch crash with a real Release launch. Fixed missing `RCTStatusBarAppearance` through compatible Expo/RN packages and retained startup linkage. Build 2 replaced the broken build 1. |
| `030ae33`, `77d2ee7`, `049e7a8` | Native spacing/clipped amounts fixed; concise Overview with horizontal income/spent/saved and navigable historical calendar; compact sign/amount/currency entry; today's date for new manual entries; preferred currencies; classic filters; aligned Settings and region list; plan list/details/draft/activate/deactivate with dated snapshots and goals. Builds 4 onward. |
| `e28c9e4`, `cf9b80a` | Chat has bounded history, a pinned capped multiline composer, native keyboard avoidance, hidden chrome while typing and restored navigation afterward. Web history uses `keyboardDismissMode="none"` so programmatic scrolling does not blur input. Build 5 onward. |
| `121402e`–`ee8d5a6` | Photos selection auto-analyzes; clear imports auto-add with stable IDs, exact-image deduplication and safe Undo; one batch correction for uncertainty. Build 7. Cloud-era paths in this phase were subsequently removed from the current client. |
| `3898661`, `a6d594c`, `ed4a930` | Separated OCR from AI classification; removed paid/cloud AI client paths and rules classification fallback; typed-entry category suggestions and local chat; account-free budgets; direct public Coinbase FX; preserved account namespaces and manual overrides. Build 8. |
| `a9d2b2e`–`8a1c20b` | On-demand Qwen3 fallback, shared native runtime, Android Gemini Nano detection/bridge, download verification/pause/retry/progress, backup exclusions, Android API 26 minimum and 64-bit architectures, native CI coverage. |
| `cadfee3`, `163228c`, `c9b7598`, `19965ce` | Explicitly disabled Qwen reasoning; prefer parsed answer content; normalize the native ChatML assistant envelope before JSON validation; added CI-only diagnostics and reusable simulator-artifact testing. Build 12 contains the complete response fix. |
| `4b91818` | User quota constraint persisted; native workflows made manual; conservative receipt smoke outcome accepted in source; TestFlight 12 and verification limits documented. This final smoke assertion change has not been rerun remotely. |

## Current architecture and code map

| Path | Responsibility |
| --- | --- |
| `apps/mobile/App.tsx` | Main app state, screens/forms, receipt import, keyboard layout, local/account entry point. Still a large component. |
| `apps/mobile/src/app` | Expo Router routes; old goals route redirects into Plan. |
| `apps/mobile/src/components` | UI, calendar, currency selector, auth and receipt correction screen. |
| `apps/mobile/src/hooks` | Auth, keyboard, FX, receipt workflow, AI availability and entry suggestions. |
| `apps/mobile/src/finance.ts`, `currency.ts`, `plans.ts`, `storage.ts` | Financial calculations, currency/FX validation, plan lifecycle/history and persistence. |
| `apps/mobile/src/api.ts` | Current client types and public FX fetch. Not a paid AI transport. |
| `apps/mobile/modules/pocket-receipt-ocr` | Apple Vision **OCR only**, including HEIC and native image validation. |
| `apps/mobile/modules/pocket-device-ai` | Apple Foundation Models; Android Gemini Nano/AICore bridge; streamed native SHA-256 verification. |
| `apps/mobile/src/lib/device-ai.native.ts` | System/local provider selection, serialized local inference, classification, independent receipt reading and chat. |
| `apps/mobile/src/lib/device-ai.ts` | Browser/manual capability stub. Metro resolves `.native.ts` on iOS/Android. |
| `apps/mobile/src/classification.ts`, `local-ai-prompts.ts`, `local-model-output.ts` | Fixed category contract, prompts and strict output/protocol decoding. |
| `apps/mobile/src/local-model.ts`, `local-model-store.ts`, `lib/local-model.native.ts` | Pinned model manifest, testable acquisition state machine and native filesystem/network adapter. |
| `apps/mobile/src/receipt-text.ts`, `receipt-audit.ts`, `receipt-processor.ts`, `receipts.ts` | OCR financial parsing, confidence checks, AI integration, import/deduplication/Undo. |
| `apps/mobile/plugins/with-local-ai.js` | Android backup exclusions for model files and SecureStore. |
| `services/api`, `services/ai`, `infra` | Optional legacy FastAPI/LiteLLM/GCP platform. Not required by the current free app. |

### Budget, currency and account invariants

- Money is stored in integer minor units. JPY/KRW/VND are whole-unit currencies; conversion rounds once into destination units.
- Foreign entries keep original amount/currency, rate/source/time and their fixed booked budget amount. New market quotes never rewrite saved expenses.
- Display currency changes reports, not stored budget units. New foreign entries need a fresh quote or explicit rate; unavailable conversion must not merely relabel numbers.
- FX is fetched directly from `https://api.coinbase.com/v2/exchange-rates?currency=...`, with only a currency code. Quotes are fresh for five minutes; refresh occurs every minute while active and on foreground. Timestamp is fetch time, not a guaranteed market observation time.
- One active plan at a time. Plans define income/allocation/bills/goals; transactions remain in the shared ledger. New plan changes use dated snapshots; older pre-snapshot history uses the migrated budget.
- Guest/local storage: `pocket-budget.local.v1`. Account storage: `pocket-budget.v2.<encodeURIComponent(uid)>`. Never merge or rename these casually.
- Optional Firebase/Google sign-in opens that identity's device-local budget. There is no multi-device synchronization or automatic migration between guest and account data.

## OCR, AI and receipt flow

1. Native Photos/camera accepts up to **20 images**, **8 MB each**, processed serially. HEIC/HEIF are supported. Native PDF scanning is currently rejected.
2. Apple Vision returns text, confidence and bounds. It does not assign categories.
3. Ordinary code parses merchant, printed final total, explicit currency and printed date. Missing/ambiguous/conflicting evidence remains uncertain; do not infer today's date or a currency from a generic `$`.
4. Local AI categorizes the OCR text. It also reviews financial evidence; model-supplied money/date/currency fields never replace the parsed draft.
5. Auto-add requires high-confidence financial evidence, a valid category, successful review, valid FX and import validation. Exact-image hashes prevent duplicate imports. Otherwise show one correction screen.
6. Undo removes only the latest unchanged imported entries, preserving unrelated or subsequently edited expenses.

System iOS uses guided Foundation Models output. Downloaded-model receipt review **independently extracts merchant/total/currency/date from OCR text without seeing the draft**; code then requires matching fields. The earlier small-model `approved: true/false` prompt was unreliable and must not be restored. Date normalization reuses `printedReceiptDate`; amounts still use exact currency parsing.

The seven expense categories are Food & drinks, Groceries, Transport, Shopping, Health, Entertainment and Other. Invalid/unclear model results require input rather than keyword/default classification. Financial parsing is ordinary validation, not a category-classifier fallback.

Typed entry classification runs after 650 ms of inactivity, only on eligible new expenses. `categoryEdited` and request-text checks protect manual selections, newer text and non-expense forms. Availability refreshes on mount/foreground and every 15 seconds while active.

### Provider and download behavior

- Prefer **ready Apple Foundation Models** on supported iOS 26+ hardware, or **available Gemini Nano/AICore** on Android. Nano is not universally installable on unsupported phones.
- Otherwise use **Qwen3 0.6B Q4_K_M** through **`llama.rn@0.13.0-rc.12`**. Keep this pin unless deliberately validating an upgrade: 0.12.9 failed to compile with RN 0.88's removed `RCTCxxBridge` type.
- Model ID: `qwen3-06b-q4km-v1`; exact bytes: **484220320**; revision: `60b85c0e3d8fe0f6474f406922a26d12aca4550d`.
- SHA-256: `9acfc1e001311f34b4252001b626f2e466d592a42065f66571bff3790d4e1b14`. The complete pinned URL is in `src/local-model.ts`.
- Automatic download starts on Wi-Fi/Ethernet when needed. Settings offers progress, pause/retry and **Download now**, which permits mobile data. A receipt uploaded during installation waits for that same operation.
- One acquisition operation; `.part` staging; require HTTP 200, exact size and native streamed SHA-256 before installation. Interrupted partials restart rather than resume. Persist user pause; do not continuously retry errors on every poll.
- Cache weights in `Documents/pocket-models` / Android app files; exclude them from OS backup. Verify cached weights on a fresh process and reuse offline. The first installation requires internet and a native build containing the runtime; Expo Go cannot supply it.
- CPU inference, two threads, memory mapping, 2,048-token context and serialized work. Release context when idle/backgrounded. Actual older-phone latency/RAM remains unmeasured.
- Full model/runtime notices are bundled in `local-model-notices.json`: Qwen weights Apache 2.0, app/runtime source MIT. No account or AI API key is required to download weights.
- Missing network/storage/runtime, failed installation or uncertain inference preserves manual budgeting. No cloud inference and no rules category substitute.

### Native output bug: retain these fixes

The native runtime returned this valid answer with a protocol envelope:

```text
<|im_start|>assistant
{"category":"transport"}
```

Strict JSON parsing incorrectly reported “Choose a category.” `local-model-output.ts` now prefers `output.content`, strips only the known Qwen assistant/end envelope when using raw text, rejects interrupted/truncated output, and keeps category validation strict. Do not extract arbitrary JSON from reasoning text. Thinking must be disabled explicitly using **both** `enable_thinking: false` and the chat-template option; reasoning format is `auto`.

Chat uses recent bounded turns and returns no executable proposal or web sources. It has no live prices, internet tools, budget mutations or model-controlled arithmetic. Real-device conversational quality still needs acceptance testing.

## Verification: what is actually proven

Unless stated otherwise, these are recorded results from the previous implementation session. For this handoff, lint/typecheck, local Markdown links and whitespace checks passed. No unit/browser/native tests, CI dispatches or builds were started.

| Check | Recorded result / limit |
| --- | --- |
| Local TypeScript unit tests | **67 pass**, including download/corruption/cancellation/concurrency/offline reuse, response framing, manual override and financial boundaries. |
| Lint / typecheck | Passed again for this documentation handoff. |
| Expo compatibility | Passed in the implementation session. |
| Browser | **78 checks passed** in the [MVP run](https://github.com/smg6135/my_smart_budgeter/actions/runs/44896265160); latest native-only parsing changes also passed local checks. Do not call this a fresh browser run at the handoff commit. |
| Native OCR / integrity | Three real Vision fixture tests and one Swift SHA-256/truncation test passed. |
| Android | [Full native compilation passed](https://github.com/smg6135/my_smart_budgeter/actions/runs/44898067281). This is not physical Android/Nano inference verification. |
| iOS compile / launch | Release compilation and launch into account-free Overview succeeded; signed build 12's identity, model/parser/license content and lack of paid chat endpoint were verified. Earlier binary inspections retained the startup-crash fix and weak Foundation Models linkage. |
| Actual fallback inference | Simulator downloaded/verified real weights and correctly classified **taxi fare → Transport**, **dentist appointment → Health**, **movie tickets → Entertainment**. |
| Receipt fixture | Returned `unclear`, `approved: false`; held for review. [Run 44903504262](https://github.com/smg6135/my_smart_budgeter/actions/runs/44903504262) **failed** because the old smoke assertion required that exact receipt to auto-approve. It was not a crash or wrong-money auto-add. |
| Latest smoke source | `4b91818` accepts conservative manual review while still rejecting unavailable inference/wrong known categories. **Not rerun remotely**, respecting quota. Do not claim a fully green latest iOS integration run or proven automatic fallback receipt approval. |
| Phone behavior | Physical iPhone/Android performance, OS-model availability and the full acceptance checklist remain pending. Simulator screenshots do not operate the physical keyboard. |

The 17-description CPU comparison found Qwen3 0.6B 16/17, Qwen2.5 0.5B 13/17, Gemma 270M 12/17. This is a small English synthetic sample, not production accuracy evidence. See [LOCAL_AI.md](LOCAL_AI.md) for sources, sizes and limitations.

## Release and artifact memory

| Item | Identity / status |
| --- | --- |
| Latest TestFlight | **1.0.0 (12)**; [EAS build](https://expo.dev/accounts/mgsong19/projects/pocket-budget/builds/a6118fa8-f382-460d-bbd8-68e8edd710db) `a6118fa8-f382-460d-bbd8-68e8edd710db`; built from `19965ce`. |
| Submission | [Upload](https://expo.dev/accounts/mgsong19/projects/pocket-budget/submissions/22b8d33b-0a3f-4ae0-a839-e20992ba6795) `22b8d33b-0a3f-4ae0-a839-e20992ba6795`, **FINISHED**. Apple processing/tester availability was not separately confirmed. |
| App identity | Bundle `com.mingonsong.pocketbudget`; App Store Connect `6835131439`; minimum iOS **16.4**. |
| Expo | Owner `mgsong19`; slug `pocket-budget`; project `165287c3-0bf6-4bc7-9772-d80583c9df04`. |
| Reusable simulator | EAS validation artifact `57acdc26-a42d-4dfe-bd83-b457d7221e70`, built from `cadfee3`, simulator build version 1. Its native dependencies match the subsequent JS-only response fixes. This is not the customer build. |
| Earlier releases | 8 = free/local app before downloadable runtime; 7 = automatic import; 5 = keyboard; 4 = UI/plans/calendar; 2 = startup fix; 1 crashed. |
| Do not submit by mistake | Build 9 errored; **10/11 compiled but predate the complete response-framing fix**. Build 12 is the uploaded replacement. |

Submitting an **existing** finished build does not start another build; build 12 has already been submitted, so do not duplicate the submission by default. Update its existing phone installation to preserve budgets.

`.tools/local-ai/` contains ignored local evidence: `build12.ipa`, build/submission JSON, benchmark data, native logs and `ios-repack3-completed.log`. `.tools/pocket_github.py` is a local read/API helper using Git credentials. Older `.tools/check-free-ai-release.py` watches **build 8**, not 12. Do not confuse old monitoring helpers with current status. Temporary logs/JSON can contain signed artifact URLs or operator details; keep them ignored and avoid dumping them into chat/Git.

CI smoke flag: **`EXPO_PUBLIC_LOCAL_AI_SMOKE=1` is test-only**. It forces the downloaded provider, runs synthetic classifications and writes a marker/diagnostics; it does not change the ledger. `app.config.js` rejects this flag in the production EAS profile. Never enable it for a customer release.

## Remaining work, in priority order

1. **Physical iPhone acceptance using existing build 12.** Confirm startup and retained data; system-model mode and fallback mode; actual keyboard/caret/Send; Photos/Camera/HEIC batches; margins, horizontal stats, allowance, currency/sign wheels, filters, plan activation and historical calendar. Update rather than uninstall.
2. **Real fallback lifecycle/performance.** Test absent/disabled system AI, Wi-Fi installation, mobile-data consent, pause/retry/relaunch, first use offline, cached airplane-mode operation, low storage, memory pressure and older-phone latency. Confirm manual entry stays usable throughout. Do not buy more build attempts just to start this checklist.
3. **Receipt fallback quality.** The native test receipt was uncertain. Improve/test merchant/item classification without replacing labels with keyword rules or trusting an approval boolean. Consider separating semantic item text from financial metadata before classification; this is an idea, not implemented work. Retain exact financial guards and Undo. Do not claim full automatic fallback import is already proven on a phone.
4. **System models and Android device checks.** Verify Apple Foundation Models on eligible hardware and real Gemini Nano/AICore availability/generation. Android has compiled successfully but no recorded physical Nano/fallback acceptance run.
5. **Android receipt OCR.** Still unimplemented. A future ML Kit text-recognition bridge should produce text/confidence/bounds first, then use the existing AI/financial pipeline. Do not substitute image-to-cloud AI. Browser remains manual budgeting.
6. **Chat quality and account acceptance.** Exercise longer local conversations and optional native Google/email auth callbacks, Keychain and account/guest isolation on real phones. Chat currently has no web research or automatic plan/transaction proposal execution.
7. **Data portability/synchronization if requested.** No cross-device sync or implemented backup/export guarantee. Preserve current namespaces and recorded FX/history in any migration. Do not invent sync from the presence of Firebase sign-in.
8. **Banks if requested.** DBS/POSB, TD and Amex are research only; no live connector, credential collection, provider account or contract exists. Production coverage/cost/consent must be confirmed per country/product. A paid aggregator is a separate decision from the free app. See [BANK_CONNECTIONS.md](BANK_CONNECTIONS.md).
9. **Optional future local AI.** Merchant grouping, subscription labels and goal-intent tags were discussed, not implemented. Keep these as suggestions; calculations and recurrence logic stay in code.
10. **Legacy cloud operations if requested.** Audit current billing/health/retirement separately. Existing GCP resources were not deleted. Obtain current operational evidence before making changes; historical deployment checks are not current health guarantees.

## Local work and low-quota verification

Read [apps/mobile/AGENTS.md](../apps/mobile/AGENTS.md). The pinned stack is Expo **58.0.26**, React Native **0.88.1**, React **19.3.0**, Node **24**, npm and TypeScript **6.0.3**. Android requires API **26+**, arm64 devices or x86_64 emulators, with a current Android SDK/JDK 17 for local compilation.

This machine's default Node is older; select Node 24 before mobile commands:

```bash
export PATH="$HOME/.nvm/versions/node/v24.19.0/bin:$PATH"
cd apps/mobile
npm run web
```

Use `npm ci` if dependencies are missing. For code changes, run the checks appropriate to the change:

```bash
npm run typecheck
npm run lint
npm test
# When relevant, not for every documentation edit:
npm run test:e2e
npm run test:ios-ocr
npm run test:model-integrity
```

- Use `npx expo install <package> --npm` for dependencies. Consult matching Expo 58 docs before unfamiliar Expo/RN API changes; SDK behavior has changed.
- Generated `apps/mobile/ios` and `android` are ignored CNG output. Never hand-edit generated projects; use config plugins/local modules. `npm run prepare:local-ai` prepares native library artifacts before local native prebuild; EAS runs it through its post-install hook.
- Local Xcode was **14.1** in the last session and cannot build the current full SDK 58 app. Verify tools before assuming otherwise. Pure Swift core tests worked locally; full native builds used current cloud toolchains. Do not trigger those automatically.
- `ci.yml` still runs normal checks automatically. `ios-ocr.yml` and `android-local-ai.yml` are **workflow_dispatch only**. Docs-only commits should use `[skip ci]`; no native build is needed for a handoff.
- When native dependencies are unchanged, the iOS workflow's `simulator_url` accepts a matching EAS artifact and uses Expo `repack-app --js-bundle-only` to embed current JS without compiling native code again. This is CI testing, not production signing. Repacking still uses CI minutes; quota preference applies to dispatches too.
- Expo friendly artifact links returned HTTP 403 in CI. Resolve the artifact locally to its `wf-artifacts.eascdn.net` URL and pass that URL when appropriate; the downloader uses a browser User-Agent. Never expose signed URLs as public documentation. The extraction helper needs a Python version supporting tarfile's `filter='data'`.
- Simulator boot/Release startup can take 10–12 minutes. Do not repeatedly cancel/restart a slow valid run. Prefer host-only simulator architecture; the workflow already sets `ARCHS="$(uname -m)" ONLY_ACTIVE_ARCH=YES` for native compilation.
- Web chat history must keep `keyboardDismissMode="none"`; `on-drag` blurred the composer during programmatic scrolling. Web modals avoid animation for Safari focus; native animations remain enabled. Preserve the layout/font-settling assertions in browser tests.
- `services/api/.venv/bin/python` is the existing Python 3.11 virtual environment and was used for HTTP/tooling because the system Python SSL setup failed. This is separate from the mobile runtime. `scripts/dev.sh` starts the **legacy Docker stack**; it is not required for the free frontend.

## Legacy infrastructure memory

Last recorded configuration, **not live-reverified for this handoff**:

| Resource | Recorded setup |
| --- | --- |
| GCP project | `normies-main` |
| US | `us-central1`, GKE `pocket-us`, `https://backend.normiesai.com` |
| Singapore | `asia-southeast1`, GKE `pocket-sg`, `https://sg.backend.normiesai.com` |
| Canada | Removed from requested deployment scope; do not provision it based on older discussion. |
| CD / CI | Argo CD in clusters; GitHub WIF builds immutable images and opens digest PRs. Backend release is a manual workflow; merging its PR lets Argo sync. |
| Exposure/security | HTTPS Gateway, Cloud Armor SQLi/XSS/IP controls, private nodes/services, Workload Identity, namespace policies, Redis UID limits and Firestore daily quotas. |
| AI operations | Private LiteLLM routes Vertex OCR and OpenAI planning/chat; Secret Manager owns provider/internal credentials. Private Cloud SQL usage history in US; no prompt/response storage in recorded checks. |
| Scope/cost | Optional legacy stack can still incur hosting/provider charges. Regional compute did not establish regional data residency. The current free client does not call its paid routes. |

Use `scripts/gcloud.sh`, `scripts/kubectl.sh` and [DEPLOYMENT.md](DEPLOYMENT.md) only for relevant cloud tasks. GCP CLI/ADC had expired during the previous session; do not ask for login when doing purely local/mobile work. Terraform state/local inputs and credentials are ignored and sensitive. Do not print secret versions or commit plans/state/environment files. A local LiteLLM tunnel is available via `scripts/litellm-ui.sh`, but is unrelated to the current on-device model.

## Read order and memory maintenance

1. This handoff and applicable `AGENTS.md` files.
2. [LOCAL_AI.md](LOCAL_AI.md), [RECEIPT_OCR.md](RECEIPT_OCR.md), [TESTFLIGHT.md](TESTFLIGHT.md) for the current feature/release details.
3. [CURRENCIES.md](CURRENCIES.md) and [BANK_CONNECTIONS.md](BANK_CONNECTIONS.md) for those topics.
4. [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md), [MOBILE_REFINEMENT_PLAN.md](MOBILE_REFINEMENT_PLAN.md) and [DEPLOYMENT.md](DEPLOYMENT.md) for history/legacy context. Their older counts, build numbers, cloud fallback and sign-in statements are superseded by current sections above.

At the end of substantive work, update this file with the date, relevant commit/build IDs, actual checks and remaining work. Mark ideas as ideas, historical checks as historical, and unverified behavior as unverified. Keep credentials and temporary artifact URLs out of memory docs. Newer user instructions always take precedence.
