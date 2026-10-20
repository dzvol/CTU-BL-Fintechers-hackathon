# Jev vs. general LLMs on Bedrock: results for charts

Data from the dev split (never test), default production thresholds, same questions for every
model. Rebuild from local snapshots: `cd apps/gateway/eval && python3 comparison/build.py`.

| File                 | What                                                                                                  | Chart                                                    |
| -------------------- | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `screen.csv`         | Screen alone per model: AUROC, TPR at ≤ 1 % FPR, attacks flagged/blocked, false alarms, latency, cost | bars (AUROC, attacks flagged), scatter latency vs. AUROC |
| `screen-roc.csv`     | ROC curve points (manipulation score = max of the manipulation questions)                             | line, fpr on x, tpr on y                                 |
| `e2e.csv`            | Whole pipeline (Policy → Screen → Judge): correct, harmful paid, honest blocked / sent to REVIEW      | grouped bars                                             |
| `e2e-layers.csv`     | Same, switching layers on one by one (none → policy → +Screen → +Judge)                               | line or stacked bars per model                           |
| `e2e-categories.csv` | E2E correct per scenario category                                                                     | heatmap or grouped bars                                  |

Read with care:

- **case_set.** `dev (901)` is every Screen case. Sonnet ran out of the team's daily Bedrock token
  quota, so it is compared with Jev on `common (497)`: the cases both answered. That subset lost
  most of the hard benign texts (NotInject, llmail-fp), so false alarms there are lower than on
  the full set.
- **Prompts.** `v1` gives the LLM exactly Jev's input. `v2` adds x402 context, attack descriptions,
  examples and a reasoning field (separate prompt for Judge). Jev takes no prompt.
- **Probabilities.** LLMs state probabilities in words (Bedrock exposes no logprobs); Jev returns
  real ones. AUROC compares the ranking and is independent of thresholds.
- **E2E** has 86 scored cases, 85 of 91 are unreviewed agent drafts: iterate, don't quote.
- **Cost.** Jev at TypeSafe input pricing; Claude at the hackathon Bedrock prices. Qwen ran on
  hackathon credits; its price is not recorded (tokens per call are).
- **Latency** is per Jev/LLM call (a payment makes two: Screen and Judge).
