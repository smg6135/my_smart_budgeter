# Bank connections: DBS, TD and American Express

Researched 24 October 2026. This is an integration assessment and implementation plan. Pocket does not currently connect to banks, collect bank credentials, or pretend to offer a live connection. No bank-provider account or contract has been created.

## Recommended routes

| Institution / region | Practical route | What is established and what still needs confirmation |
| --- | --- | --- |
| TD Bank, United States | Plaid Link + Transactions | TD has announced a North American data-access agreement with Plaid. Confirm the exact US institution and Transactions coverage in your production Plaid account. |
| TD Canada Trust, Canada | Plaid Link + Transactions | The TD/Plaid agreement includes Canada. Treat Canada as a separate institution and consent flow; verify current API/OAuth availability and supported account products instead of assuming the US integration applies. |
| American Express, United States | Plaid Link with Amex OAuth | Plaid lists Amex among OAuth institutions and documents consent renewal. Confirm your exact card/account product supports Transactions; account connectivity alone does not establish every product entitlement. |
| American Express outside the US | Country-specific aggregator or approved Amex direct integration | The Amex developer portal describes account APIs and regulated UK/France access. US coverage is not evidence of Singapore, Canadian or other international card coverage. Obtain country/product confirmation. |
| DBS/POSB, Singapore | Discuss approved DBS partner access; evaluate Singapore-specific aggregation only after confirming coverage | DBS publishes deposit-account APIs. Its public catalogue does not establish that this app can immediately obtain a retail, transaction-level feed. SGFinDex includes DBS but is a consent-based participating ecosystem, not proof of an unrestricted transaction API for any app. |

Sources: [TD's data-access agreement](https://td.mediaroom.com/2023-12-14-TD-Bank-Group-and-Plaid-enter-into-North-American-data-access-agreement), [Plaid OAuth requirements and institution behavior](https://plaid.com/docs/link/oauth/), [Plaid institution/product lookup](https://plaid.com/docs/api/institutions/), [Amex developer portal](https://developer.americanexpress.com/open-banking), [DBS API catalogue](https://www.dbs.com/dbsdevelopers/discover/index.html), and [MAS SGFinDex description](https://www.mas.gov.sg/development/fintech/sgfindex).

Plaid's documented institution country codes include US and CA and do not include Singapore. Therefore, I would not design DBS Singapore connectivity around an assumed Plaid integration. Identity verification coverage in a country does not mean transaction aggregation is available there. [Plaid Institutions API](https://plaid.com/docs/api/institutions/)

## First proof of access

Start with Plaid Sandbox for TD/US Amex workflows, then request production access and check the actual institution catalogue for the specific market and account. Sandbox success does not establish live bank access. Use `/institutions/search` with the relevant `country_codes` and the `transactions` product filter. Request only the data the budgeting feature needs; payments and bank transfers are outside this feature. [Plaid Quickstart](https://plaid.com/docs/quickstart/), [institution search](https://plaid.com/docs/api/institutions/)

For DBS, send a partner enquiry describing a consumer personal-finance app that needs read-only, customer-consented account balances and posted transaction history in Singapore. Ask specifically about retail versus business accounts, credit-card coverage, consent/login flow, refresh limits, history depth, production eligibility, onboarding and price. The catalogue alone does not answer these questions. The next useful deliverable is written confirmation of product access, rather than coding against an assumed endpoint. [DBS catalogue](https://www.dbs.com/dbsdevelopers/discover/index.html)

## How it would fit this app

The following is a proposed architecture, not an implemented connector:

1. Add authenticated app users/device sessions before allowing access to a reusable bank connection. A local connection ID alone is not authorization.
2. FastAPI creates a short-lived Plaid Link token using operator-owned provider credentials stored on the server. The app opens the official Link SDK; bank authentication happens through the provider/bank consent flow, not a Pocket password form.
3. The app returns Link's one-time public token to FastAPI. FastAPI exchanges it for the bank connection access token and returns an opaque connection ID. Keep provider secrets and reusable access tokens server-side.
4. Store only small connection records: authenticated owner, encrypted provider token, institution/account IDs, consent state and synchronization cursor. Keep the imported budgeting ledger on the user's device. This introduces limited backend persistence, which is a deliberate change from today's stateless backend.
5. Fetch transaction changes on app open or a user-initiated refresh, then normalize and review them before adding to the local ledger. For background synchronization, add verified provider webhooks and a durable work queue; a completely stateless backend cannot maintain reliable background sync.
6. Add disconnect/revoke and consent-renewal flows. Native Link requires a new EAS development/TestFlight build; it is not an Expo Go module. Configure the appropriate OAuth redirects and platform registrations before production testing.

Plaid documents the [client/server Link flow](https://plaid.com/docs/quickstart/), [React Native installation requirements](https://plaid.com/docs/link/react-native/) and [OAuth setup](https://plaid.com/docs/link/oauth/). Token encryption, minimal persistence and authenticated ownership above are recommendations for Pocket's architecture.

## Import rules needed for correct budgets

These are proposed Pocket reconciliation rules:

- Keep provider transaction/account identifiers locally so repeated syncs update entries instead of duplicating them.
- Apply added, modified and removed transactions; finish all pages before committing the new cursor. Link pending and posted versions of the same purchase. Plaid's [Transactions Sync guide](https://plaid.com/docs/transactions/sync-migration/) describes this cursor-based update model.
- Let the user match imported rent/subscription payments to existing bill reservations so the budget does not count them twice.
- Exclude internal transfers and credit-card repayments from ordinary spending when the underlying purchases are already imported.
- Match salary deposits to planned monthly income instead of treating them as additional income automatically.
- Prefer the settled amount in the budget currency when supplied by the bank. Preserve original foreign amount/currency separately. Use Pocket's market estimate only when the settled conversion is unavailable, and show it as estimated.
- Preserve user edits/category choices when an upstream transaction changes. Allow review and deletion of imported data without silently re-importing a dismissed item.

## What this means for costs and next work

For this MVP, use manual entries and the existing receipt/PDF review while obtaining actual provider access. My implementation recommendation is to validate TD and US Amex with one Plaid integration first, while pursuing DBS separately. Pricing and production approval must be confirmed with the chosen provider; there is no claim of free or universally available live bank sync.

No bank integration was added during the layout/currency work. The implemented currency service is a public market-rate lookup and has no access to bank accounts.
