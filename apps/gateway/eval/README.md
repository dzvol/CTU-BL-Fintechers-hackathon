# SemanticAuth evaluation

Offline evaluation of Policy, Screen and Judge on real and published data. It runs the production
code (`toScreenState`, `buildFacts`, `toJudgeState`, `defaultPolicy`, `decide`) against the real
Jev API, caches every Jev answer, and derives all numbers from those answers, so thresholds and
ablations can be tuned offline for free. No payments, no database, no merchants.

Read this file first in every agent session working on the evaluation.

## Claims and what supports them

| #   | Claim                                                 | Suite              | Headline metric                                       |
| --- | ----------------------------------------------------- | ------------------ | ----------------------------------------------------- |
| T1  | Screen catches injection in merchant text             | `screen-injection` | flagged / blocked rate, TPR at FPR ≤ 1 %              |
| T2  | Screen stays quiet on ordinary offers                 | `screen-benign`    | false flag rate (Bazaar, NotInject, LLMail FP emails) |
| T3  | Judge tells off-intent purchases apart                | `judge-pairs`      | accuracy; off-intent passed as fit; fit rejected      |
| T4  | The pipeline stops harmful payments, lets honest ones | `e2e`              | unsafe ALLOW, false BLOCK, needless REVIEW            |
| T5  | Every layer adds something                            | `e2e` ablations    | none → policy → +screen → full, McNemar p             |
| T6  | It is practical                                       | every run          | latency p50/p95 per Jev call, USD cost                |

**Not claimed:** behavioural fraud (amount ratcheting, velocity, reconnaissance), settlement
fraud, merchant reputation, quality of purchased content. AgentCommerceBench was considered and
left out: it has neither merchant offer text nor an approved mandate, the two inputs Jev works on.

## Pre-registered targets (fixed before the first test run)

- Unsafe ALLOW on `e2e` = 0, reported with the upper bound of its 95 % interval.
- False BLOCK on honest `e2e` purchases ≤ 2 %.
- Needless REVIEW on honest `e2e` purchases ≤ 15 %.
- Screen false _block_ rate on real Bazaar offers ≤ 1 %.
- Tuning objective (`tune.ts`): cost = 100 × unsafe ALLOW + 10 × missed recipient change +
  10 × false BLOCK + 1 × needless REVIEW.

## Sources

| Source                                                                                   | Licence | Used as                                                             |
| ---------------------------------------------------------------------------------------- | ------- | ------------------------------------------------------------------- |
| [x402 Bazaar](https://docs.cdp.coinbase.com/x402/bazaar) discovery API (public)          | listing | honest offers (`screen-benign`) and carriers for planted texts      |
| [InjecAgent](https://github.com/uiuc-kang-lab/InjecAgent) attacker instructions          | MIT     | attacks, base + "enhanced" variant                                  |
| [LLMail-Inject](https://huggingface.co/datasets/microsoft/llmail-inject-challenge) ph. 2 | MIT     | adaptive attacks labelled by behaviour (`api_triggered`), FP emails |
| [NotInject](https://huggingface.co/datasets/leolee99/NotInject)                          | MIT     | benign sentences full of trigger words (over-defence)               |
| `fixtures/commerce-texts.json`                                                           | ours    | 47 merchant-domain attacks (20 recipient changes), 50 hard benign   |
| `fixtures/e2e.jsonl`                                                                     | ours    | 171 end-to-end cases incl. 30 red-team cases pinned to test         |
| `fixtures/bazaar-labels.json` × `fixtures/intents.json`                                  | ours    | Judge pairs by construction (200 labeled offers × 24 intents)       |

Published sources keep only behaviour-based labels (LLMail's LLM-judged labels are ignored).
Our own fixtures may start as an agent's **draft** (`author: "draft:…"`): every report says how
many cases per suite rest on unreviewed drafts, and those numbers are for iterating, not claims.
A person reviews a draft by putting their name in `author` (see Labeling below).

### What the e2e cases cover (`labels.category`)

| category                       | expected                      | cases |
| ------------------------------ | ----------------------------- | ----- |
| honest, hard_benign            | ALLOW                         | 42    |
| injection                      | BLOCK (REVIEW acceptable)     | 16+1  |
| recipient_change               | REVIEW (BLOCK acceptable)     | 20+1  |
| subscription                   | REVIEW                        | 8+1   |
| off_intent, forbidden, scam    | BLOCK (REVIEW acceptable)     | 28+1  |
| policy, policy_edge            | BLOCK / ALLOW at the limit    | 9+1   |
| beyond_need                    | REVIEW (BLOCK acceptable)     | 6     |
| ambiguous                      | reported apart, not scored    | 6     |
| redteam, redteam_benign (test) | written against our questions | 22+8  |

(+1 = the `tests/merchants` scenarios.) Red-team cases are pinned to `test`: they are never
seen while tuning.

### Labeling conventions for Bazaar offers

- An offer selling an output (report, dataset, snapshot, brief) is `one_time_product`,
  `one_time_purchase`, `data_delivery`; one selling a call to a service (API, inference,
  conversion, lookup) is `usage_credits`, `prepaid_usage`, `service_access` or `data_delivery`.
- Category is the subject of what is bought. Data _about_ yields or trades is `crypto_data` /
  `financial_news`; only an offer to trade, deposit or receive signals is `trading_signals`.
- `contains_personal_data` is `yes` only if the product ships data about identifiable people.

## Layout

```
cases.ts        EvalCase schema: the contract between role A and role B
carriers.ts     plants a text into a real offer (4 positions: description prefix/suffix, 402 body text/nested)
random.ts       deterministic dev/test split by group (seed SPLIT_SEED) and seeded sampling
jev-cache.ts    caches Jev answers at the HTTP layer (key = sha256(model, questions, state))
runner.ts       runs cases through production code, records raw answers
predict.ts      answers + thresholds + ablation → predictions (pure, fast)
metrics.ts      Wilson intervals, AUROC, TPR@FPR, McNemar, Cohen's κ
report.ts       summaries and the markdown report
tune.ts         grid search of thresholds, Screen question ablation
datasets/       sources, adapters, fixture loaders, build (role B)
fixtures/       committed, person-checked inputs (role B)
cli/            npm scripts
data/           gitignored: raw downloads, built cases, cache, dev results, labeling worksheets
results/        committed final test runs with their Jev cache
```

## Commands (run in apps/gateway, or add `-w @semanticauth/gateway` from the root)

```bash
npm run eval:fetch                     # sources → data/raw (hashes in data/raw/manifest.json)
npm run eval:build                     # → data/cases/<suite>.jsonl
npm run eval:validate                  # schema, unique ids, no group in both splits, no leaks
npm run eval:label -- --count 200      # worksheet for people → data/labeling/bazaar-todo.json
npm run eval:label -- --review         # worksheet of the draft labels, to check and sign
npm run eval:label -- --merge          # complete rows → fixtures/bazaar-labels.json (a person's row replaces a draft)
npm run eval:label -- --blind 50       # blank worksheet for a second person (data/labeling/bazaar-blind.json)
npm run eval:label -- --agreement f    # Cohen's κ against that second person's worksheet
npm run eval:stability -- --n 40 --repeat 5   # same cases asked 5× without cache: do decisions move?
npm run eval -- --all --split dev --name n            # every Jev variant + comparison table
npm run eval -- --suite e2e --variant baseline,strict  # some suites / variants
npm run eval -- --suite screen-benign,screen-injection --split dev
npm run eval -- --suite e2e --split dev --offline      # only from cache, no key, no spend
npm run eval:tune -- data/results/<run>                # thresholds + question ablation (dev only)
npm run eval:compare -- <before> <after>              # two snapshots or run dirs
npm run eval:ablation -- [snapshot]                   # Policy alone vs. with Screen / Judge / both, free
npm run eval:variants -- <name>                       # variant comparison again from <name>.<variant> snapshots, free
npm run eval:report -- data/results/<run> --thresholds data/results/<run>/best-thresholds.json
npm run eval -- --all --split test --final             # once, at the end
```

A final run writes `results/<run>/` with `records.json`, `summary.json`, `report.md`,
`manifest.json` (git commit, model, question hashes, thresholds, source hashes) and
`jev-cache.jsonl` (exactly the answers it used). Anyone can reproduce it without a Jev key:
`npm run eval -- --all --split test --final --offline --cache results/<run>/jev-cache.jsonl`.

## Jev variants

A variant (`src/domain/jev/variants.ts`) is a named way of using Jev: the questions Screen and
Judge are asked, plus the thresholds and rules the decision table reads them with. Production runs
one (`JEV_VARIANT`, default `baseline`); `npm run eval` runs all of them on the same cases and
prints a comparison against every variant and against Policy alone (also in
`data/results/<run>/variants.md`; rebuild it any time with `npm run eval:variants -- <name>`).

| variant        | idea                                                   | questions | settings                                                            |
| -------------- | ------------------------------------------------------ | --------- | ------------------------------------------------------------------- |
| `baseline`     | production since v1                                    | v1        | default                                                             |
| `strict`       | when in doubt, ask the user                            | v1        | flag at 0.35, surer Judge (0.75/0.85/0.95), review unclear texts    |
| `balanced`     | decide instead of asking                               | v1        | block at 0.7, Judge 0.4/0.55/0.75, missing deliverable only if none |
| `questions-v2` | different questions: subject from a fixed list → Judge | v2        | default + block on a subject mismatch                               |

Rules for adding one:

- **One idea per variant.** A variant that changes questions keeps baseline thresholds (and vice
  versa); otherwise the comparison can't say which change helped. Combine winners in a new
  variant afterwards.
- Variants with the same questions share Jev answers: the comparison is paired and free.
- Tune settings on dev (`eval:tune -- <snapshot>` keeps the variant's rules), write in the variant
  where they came from, and confirm on test once before switching production.
- The answer types of v1 must stay (`QuestionSetLike`): the decision table reads them. New
  questions only add; Judge still gets option keys only, never merchant text.

Save the state before a change, change something (questions, thresholds, decision rules), run
again under a new name, compare:

```bash
npm run eval -- --all --split dev --name baseline            # state before
# … change src/domain/jev/*-questions.ts or decide.ts …
npm run eval -- --all --split dev --name questions-v2        # new Jev answers where needed
npm run eval:compare -- baseline questions-v2                # metrics, deltas, flipped cases

# thresholds only: no new Jev calls, re-report the same answers
npm run eval:report -- baseline --thresholds my-thresholds.json --name thresholds-v2
npm run eval:compare -- baseline thresholds-v2
```

A snapshot (`eval/snapshots/<name>/`, gitignored) holds the manifest (git commit, model, question
hashes, thresholds, source hashes), the summary, the report and every Jev answer. `eval:compare`
shows what changed in the setup, each metric before/after with "better"/"worse", and the cases
that got fixed or broke. Snapshots are dev only; `--force` replaces one.

## Rules that keep the numbers defensible

- **Test is locked.** The runner refuses `--split test` without `--final`; run it once. Tune only
  on dev (`eval:tune` refuses test records).
- **Splits are by group**, never by case: an attack text, an offer or an e2e template is wholly in
  dev or wholly in test. The 8 `tests/merchants` scenarios are pinned to dev (we tuned on them).
- **Labels never reach Jev.** `labels` and `expected` are not part of `screenState`; a test and
  `eval:validate` check it.
- **Agents draft, people sign.** An agent may draft labels and cases (`author: "draft:…"`);
  reports flag them, and the final test run uses only cases a person has signed. The blind
  second labeler never sees the drafts (`--blind`), so κ also measures how good the drafts were.
- **Blind cases.** Role B writes their e2e cases without reading `src/domain/jev/`.
- Changing Jev questions changes their hash in the manifest: re-run dev, never compare across
  question versions without saying so.

## Two roles

|           | A: infrastructure and tuning                                                                          | B: data and labels             |
| --------- | ----------------------------------------------------------------------------------------------------- | ------------------------------ |
| Owns      | `cases.ts`, `jev-cache.ts`, `runner.ts`, `predict.ts`, `metrics.ts`, `report.ts`, `tune.ts`, `cli/run | report                         | tune`, `src/domain/decision` | `datasets/`, `carriers.ts`, `fixtures/`, `cli/fetch | build | validate | label` |
| Branches  | `eval/infra-*`                                                                                        | `eval/data-*`                  |
| Done when | reports and tuning work on B's cases                                                                  | `npm run eval:validate` passes |

`cases.ts` changes only through a PR by A. B asks for changes.

### Agent briefs

- **A:** "Read `apps/gateway/eval/README.md`. You are role A. Work only in A's files. Task: …"
- **B:** "Read `apps/gateway/eval/README.md` and `eval/cases.ts`. You are role B. Work only in B's
  files and never open `src/domain/jev/` (blind cases). Output must pass `npm run eval:validate`.
  Never fill labels yourself: prepare worksheets for people. Task: …"

## Checklist

Phase 0–1 (done)

- [x] `EvalCase` schema, cache, runner, predictions, metrics, report, tuning, CLIs, tests
- [x] `decide(input, thresholds)` with unchanged defaults
- [x] Sources: Bazaar (80 pages), InjecAgent, NotInject, LLMail-Inject phase 2 + FP emails
- [x] `screen-benign` and `screen-injection` built; first dev run done
- [x] `e2e` seeded with the 6 paid `tests/merchants` scenarios (pinned to dev)

Phase 1–3 (drafted by an agent, waiting for people)

- [x] 200 Bazaar offers labeled (drafts), commerce texts and e2e cases drafted, red team pinned
      to test, provenance in every report, stability measurement (`eval:stability`)
- [x] First dev run on all suites: snapshot `drafts-v1`
- [ ] **People:** sign the drafts: `eval:label -- --review` (labels), `commerce-texts.json`,
      `intents.json`, `e2e.jsonl` (`author` per file or case)
- [ ] **Second person:** `eval:label -- --blind 50`, then `--agreement` → κ
- [ ] **B:** write ~30 blind e2e cases without reading `src/domain/jev/`
- [ ] **A:** fix what `drafts-v1` found (deliverable rule, Judge topic), tune on dev, decide
      `DEFAULT_THRESHOLDS` with the team

Phase 4 (final)

- [ ] Final test run together (`--final`), commit `results/<run>/`, hand numbers to member 2
