# Multi-currency expenses and reports

## Add a foreign-currency expense

1. Choose **Add expense** or scan a receipt in Tools.
2. Enter the original amount and choose **Entry currency**, for example USD or JPY.
3. Review the conversion into your budget currency. A current estimate is fetched through the authenticated backend.
4. If you know the rate your bank charged, enter it as **budget currency per one entry-currency unit**. Example: an SGD budget and USD expense at 1.35 means USD 1 = SGD 1.35. Log a separate bank fee if needed.
5. Save. The original amount, currency, rate, provider/manual source and fetch/entry time remain with the expense. Its converted budget amount is fixed; future rate changes do not rewrite your ledger.

The same entry form supports extra income and savings contributions in foreign currencies. Monthly income, planned bills and savings-goal targets remain in the fixed budget currency.

## Choose the currency for reports

Open **Settings → Currencies → Display currency**, or tap **Viewing … · Budget …** above any screen.

Dashboard totals, spending, remaining budget, daily allowance and goal projections convert from the budget currency into the selected display currency using the latest available quote. This does not change the stored budget or expense conversions. Activity shows the original foreign amount alongside the converted report amount.

The budget currency can be changed only before financial data is added. Existing installations keep their original budget currency. Changing the display currency performs conversion rather than relabeling existing values.

## Live estimates and offline behavior

The app asks `GET /v1/fx/rates?base=SGD` on its configured FastAPI backend. The backend fetches [Coinbase's current public exchange rates](https://docs.cdp.coinbase.com/coinbase-app/track-apis/exchange-rates), validates them and caches public quotes for 60 seconds. The app refreshes every minute while active and when returning to the foreground. **Refresh rates** allows an immediate request, subject to that shared cache.

The UI shows the provider and the time the backend fetched the rates. Coinbase does not provide a market quote timestamp in this endpoint, so this is a fetch timestamp, not a guaranteed market observation time. These are indicative estimates, not guaranteed tick-by-tick or bank/card settlement rates; card spreads and fees can differ.

Saved rates are retained on the device for offline report conversion and marked as cached. A new foreign entry requires a fresh quote or an explicit rate. If no usable conversion is available for the chosen display currency, totals explicitly stay in the budget currency instead of showing an incorrect currency label. Saving an unchanged existing foreign entry preserves its original booked conversion even offline.

No expense, merchant, balance, conversation or OpenAI key is sent with the exchange-rate lookup. The backend sends only a currency code to the provider. Rates require a signed-in app account and backend internet access; no provider key or Coinbase account is needed.

## Supported currencies

SGD, USD, CAD, EUR, GBP, AUD, HKD, JPY, KRW, CNY, INR, MYR, THB, IDR, PHP, VND, NZD and CHF.

Values use integer currency units internally. JPY, KRW and VND use whole units; the other supported currencies use hundredths. Conversion rounds once into the destination currency's unit. The recorded rate stores its precision separately from the rounded amount.

## Examples

- SGD budget, USD 75 expense, quoted SGD→USD rate 0.75: recorded budget expense = SGD 100.00. Original USD 75.00 is kept.
- SGD 600 remaining, USD display at 0.75: displayed remaining = USD 450.00. The underlying SGD budget is unchanged.
- JPY 1,000 expense, quoted SGD→JPY rate 110: recorded budget expense = SGD 9.09.

These examples are arithmetic illustrations, not current market quotes.
