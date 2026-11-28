# Local purchase capture

Implemented source, November 2026. New native Android code still needs compilation and physical-device acceptance. No backend, Plaid credential, webhook or cloud model is involved.

## Platform behavior

**Android:** Tools → Purchase alerts lets the user select installed supported apps and open Android notification-access settings. The local listener accepts new purchase-like alerts from selected DBS, POSB, Amex Singapore/US and Google Wallet packages only. It skips group summaries, authentication codes, login notices and declined-payment alerts. It does not enumerate old notifications. Missing/redacted bank notifications cannot be recovered through this feature.

The listener uses a bounded native worker and an AES-GCM encrypted queue protected by Android Keystore, excluded from Android backup. The queue holds at most 100 alerts across saved budgets; overflow and capture errors are reported. Ownership is captured before asynchronous work so switching budgets cannot move an alert into another ledger. It does not start JavaScript or load the LLM in the background. Only the foreground app drains the queue. An alert is acknowledged after successful ledger persistence; failed acknowledgements retry, including exact OS replays after an earlier acknowledgement. Full card/account number patterns are redacted before queue storage. The ledger retains normalized purchase fields and source fingerprints, not the notification body. Existing budget storage is still the app's local AsyncStorage; this feature does not encrypt the whole ledger.

**iPhone:** iOS does not provide a general listener for other apps' bank/Wallet notifications. This release offers a Shortcuts URL import and manual paste. A user-created Wallet Transaction automation can pass available transaction fields to the app; this is a card-tap event, not proof of bank settlement. Support depends on available Wallet/Shortcuts fields and cards. Opening the URL brings the app forward and may require unlocking. There is no guaranteed background or locked-screen import, and no interception of DBS/Amex notifications on iOS.

In Shortcuts, configure the Wallet Transaction personal automation, construct the URL below using the transaction's fields, URL-encode each string field, and use Open URLs. Preserve the original purchase timestamp, including time zone, on retries. If currency is unavailable, explicitly supply the actual card/transaction currency; do not infer it from a generic dollar sign. Test the selected card on a real device before relying on the automation.

```text
pocketbudget://capture?merchant=MERCHANT_URL_ENCODED&amount=12.50&currency=SGD&timestamp=ISO_TIMESTAMP_URL_ENCODED
```

Optional fields: `card` (last four digits only), `reference` (bounded transaction identifier, never an account number). The link is untrusted input and creates only a review draft. Invalid fields are rejected. Financial query parameters leave the active route after staging. Custom-scheme URLs can be invoked by other apps, so they never authorize a financial write automatically.

## Duplicate handling

1. Exact source fingerprints suppress repeated delivery across reloads, queue retries, ignored alerts and ledger edits. Android fingerprints include source package, notification key, post time and payload hash. A revised bank notification is a new review event. Shortcut fingerprints normalize equivalent decimal amounts, currency case and time-zone representations; changing the actual purchase time or reference produces a new event.
2. Possible wallet/bank duplicates use matching normalized merchant plus amount/currency and nearby time/date. Nearby alerts with changed amounts/currencies are also surfaced for tips, FX and authorization changes. A matching reference within the same provider can suggest a match even after merchant edits or when financial fields are missing. Different last-four digits do not rule out a match: tokenized Wallet cards may differ from physical cards.
3. These are suggestions, never automatic merges. Review can combine two alerts into one draft, link an alert to an existing expense, ignore it, or explicitly add a separate purchase. Same-price purchases remain valid separate expenses. Manual selection of an existing expense handles merchant descriptions that do not match automatically.
4. Linking adds evidence only. It preserves the existing amount, original/booked FX, date and manual category. New purchases require valid exact amounts, explicit currency, date and category; local AI may suggest only the category. Refund/reversal notices require a manual ledger correction and cannot be combined into a purchase draft.
5. Receipt imports check existing purchases too. A matching receipt is held for review instead of auto-added; it can attach its image fingerprint to the existing expense or be confirmed as separate. Multiple image fingerprints and notification source IDs remain attached without changing the booked purchase. Exact-image checks still apply.

The pending review inbox holds 100 drafts. Resolve drafts regularly; Android retains unimported alerts in its bounded queue until there is room. This is a convenience capture tool, not a complete transaction feed or bank-statement reconciliation system. No charge is booked merely because a notification was received.

## Verification and phone acceptance

All 94 TypeScript tests, lint and typecheck pass. Tests exercise source replay, persistence-before-acknowledgement, acknowledgement retries, budget isolation, wallet/bank combinations, legitimate repeated purchases, financial validation, FX, manual edit preservation, Shortcut validation and receipt linking. All 90 browser scenarios were verified across the November 23 broad run and targeted reruns. The initial broad run stopped after 57 passes on Safari development-server network/symbolication errors; a clean Safari run passed all 30 and the remaining three mobile layout checks passed. On November 24, all 18 purchase-capture cases passed again across desktop, mobile Chromium and Safari, including equivalent-format replay protection. Android autolinking resolves `pocket-transaction-capture`; policy JUnit tests are included in the manual Android workflow.

Before release, compile a matching native build and check Android permission grant/revoke, all selected real bank formats, updated/grouped notifications, locked-screen/process-death delivery, queue overflow, profile switches, reset, Keystore recovery behavior and battery usage. On iPhone, verify a real Wallet automation's supplied fields, URL encoding, foreground/unlock behavior and repeat delivery. Native build and physical-device tests have not been performed for this feature. No EAS/CI build was dispatched.

Platform references: [Android NotificationListenerService](https://developer.android.com/reference/android/service/notification/NotificationListenerService), [Apple transaction triggers in Shortcuts](https://support.apple.com/en-ie/guide/shortcuts/apd65c67538a/ios).
