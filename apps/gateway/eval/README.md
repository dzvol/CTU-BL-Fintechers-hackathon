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
| `fixtures/commerce-texts.json`                                                           | ours    | unpublished merchant-domain attacks and honest agent-facing wording |
| `fixtures/e2e.jsonl`                                                                     | ours    | hand-written end-to-end cases                                       |
| `fixtures/bazaar-labels.json` × `fixtures/intents.json`                                  | ours    | Judge pairs by construction                                         |

Only behaviour-based or construction-based labels are used. LLMail's LLM-judged labels are
ignored on purpose; no label anywhere comes from an LLM.

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
npm run eval:label -- --merge          # complete worksheet rows → fixtures/bazaar-labels.json
npm run eval:label -- --agreement f    # Cohen's κ against a second person's worksheet
npm run eval -- --suite screen-benign,screen-injection --split dev
npm run eval -- --suite e2e --split dev --offline      # only from cache, no key, no spend
npm run eval:tune -- data/results/<run>                # thresholds + question ablation (dev only)
npm run eval:compare -- <before> <after>              # two snapshots or run dirs
npm run eval:report -- data/results/<run> --thresholds data/results/<run>/best-thresholds.json
npm run eval -- --all --split test --final             # once, at the end
```

A final run writes `results/<run>/` with `records.json`, `summary.json`, `report.md`,
`manifest.json` (git commit, model, question hashes, thresholds, source hashes) and
`jev-cache.jsonl` (exactly the answers it used). Anyone can reproduce it without a Jev key:
`npm run eval -- --all --split test --final --offline --cache results/<run>/jev-cache.jsonl`.

## Snapshots: is a change better or worse?

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
- **People label, agents don't.** An agent may prepare worksheets and tools; every label in
  `fixtures/` has an `author` who is a person (or `construction`).
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

Phase 1 (people)

- [ ] **B:** review `fixtures/commerce-texts.json` and `fixtures/intents.json` (drafted by an
      agent, marked `draft:claude`); set `author` to the reviewer
- [ ] **B:** audit Bazaar offers that Screen flags in dev runs (are they really honest?)

Phase 2 (Judge)

- [ ] **B:** label ~200 Bazaar offers (`eval:label`), 50 of them by a second person → κ
- [ ] **A:** first `judge-pairs` dev run; compare Screen vs oracle extraction

Phase 3 (end to end)

- [ ] **A:** write 60 e2e cases; **B:** write 60 blind e2e cases; review each other's
- [ ] **A:** tune on dev (`eval:tune`), decide new `DEFAULT_THRESHOLDS` with the team

Phase 4 (final)

- [ ] Final test run together (`--final`), commit `results/<run>/`, hand numbers to member 2
