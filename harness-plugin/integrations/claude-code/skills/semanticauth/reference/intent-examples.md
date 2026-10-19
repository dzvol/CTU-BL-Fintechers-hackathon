# Intent examples

The gateway's Judge compares every purchase with the approved intent. A precise intent means
fewer blocked or reviewed purchases; a vague one means the user cannot judge what they approve.

## Good: one-off market snapshot

```json
{
  "purpose": "Buy one snapshot of today's crypto market (top coins, prices, 24h change) for a short research note.",
  "task": "Write me a short note about today's crypto market.",
  "allowedPurchases": ["market data snapshot"],
  "forbidden": ["subscriptions"],
  "budgetUsdc": "0.50",
  "maxPerPurchaseUsdc": "0.20",
  "plannedPurchases": 2
}
```

## Good: news research

```json
{
  "purpose": "Buy up to three paywalled news articles about this week's ECB rate decision to summarise them.",
  "task": "Summarise what the media wrote about the ECB decision.",
  "allowedPurchases": ["news articles"],
  "forbidden": ["subscriptions"],
  "budgetUsdc": "1.00",
  "maxPerPurchaseUsdc": "0.40",
  "plannedPurchases": 3
}
```

## Good: dataset for analysis

```json
{
  "purpose": "Buy a CSV of daily EUR/CZK rates for 2025 from a data API to compute monthly volatility.",
  "task": "Compute the monthly EUR/CZK volatility for 2025.",
  "allowedPurchases": ["FX rate datasets"],
  "forbidden": ["subscriptions", "real-time trading feeds"],
  "budgetUsdc": "0.30",
  "maxPerPurchaseUsdc": "0.30",
  "plannedPurchases": 1
}
```

## Bad: do not do this

```json
{
  "purpose": "Buy whatever is needed.",
  "task": "...",
  "allowedPurchases": ["anything"],
  "budgetUsdc": "5.00",
  "maxPerPurchaseUsdc": "5.00"
}
```

Why it is bad: the purpose says nothing the Judge can check, the allowed purchases cover
everything, the limits are a maximum instead of what the task needs, and the task is missing.

## Rules of thumb

- The limits come from the user. If they did not give them, ask; these rules only help you
  suggest values for the user to confirm.
- Suggested `maxPerPurchaseUsdc` ≈ the highest price you actually saw, rounded up a little.
- Suggested `budgetUsdc` ≈ `maxPerPurchaseUsdc` × `plannedPurchases`.
- Investments, trading, deposits, gambling, payments to individuals and "unlock / verify your
  account" fees are always forbidden by the mandate; no need to list them.
