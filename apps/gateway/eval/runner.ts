// Runs cases through the production code (state builders, facts, Policy) and records Jev's raw
// answers. Verdicts are not decided here: predict.ts derives them from the answers, so thresholds
// and ablations can change without calling Jev again.
import type { Intent, NormalizedOffer, Task, TaskId } from '@semanticauth/contracts';
import type { JevClient } from '../src/adapters/jev/jev-client';
import { buildFacts, type Purchase } from '../src/domain/facts/facts';
import type { JudgeAnswers } from '../src/domain/jev/judge-questions';
import type { ScreenAnswers } from '../src/domain/jev/screen-questions';
import { toJudgeState, type ExtractedOffer, type JudgeState } from '../src/domain/jev/state';
import { defaultPolicy, type PolicyOutcome } from '../src/domain/policy/policy';
import type { EvalCase, EvalCaseOf, IntentFixture } from './cases';

/** Base Sepolia USDC; the token is never what a case is about. */
const USDC = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';
/** The default user allocation (USER_ALLOCATION_USDC=2). */
export const EVAL_ALLOCATION = 2_000_000n;
const TASK = 'task_eval' as TaskId;
const OTHER_TASK = 'task_eval_earlier' as TaskId;

export interface CaseRecord {
  id: string;
  suite: EvalCase['suite'];
  split: EvalCase['split'];
  group: string;
  source: string;
  /** Who wrote or checked the expected outcome; "draft:…" = an agent's draft, not reviewed yet. */
  author?: string;
  labels: EvalCase['labels'];
  expected: EvalCase['expected'];
  /** USDC atomic units, for amount-dependent thresholds (judge-pairs, e2e). */
  amount?: string;
  policy?: PolicyOutcome;
  screen?: ScreenAnswers;
  /** Judge on Screen's extraction (production path). */
  judge?: JudgeAnswers;
  /** Judge on the person-written extraction (judge-pairs only). */
  judgeOracle?: JudgeAnswers;
  /** Jev failed; production would fail closed. */
  error?: string;
}

function toIntent(fixture: IntentFixture): Intent {
  return {
    id: `int_${fixture.id}`,
    userId: 'usr_eval',
    apiKeyId: 'key_eval',
    status: 'approved',
    purpose: fixture.purpose,
    task: fixture.task,
    allowedPurchases: fixture.allowedPurchases,
    forbidden: fixture.forbidden,
    budget: fixture.budget,
    maxPerPurchase: fixture.maxPerPurchase,
    plannedPurchases: fixture.plannedPurchases,
    createdAt: '2026-10-19T00:00:00.000Z',
    expiresAt: '2026-10-19T00:00:00.000Z',
  } as Intent;
}

const toTask = (intent: Intent): Task =>
  ({ id: TASK, intentId: intent.id, budget: intent.budget, spent: '0', reserved: '0' }) as Task;

const toOffer = (offer: {
  amount: string;
  payTo: string;
  resourceUrl: string;
}): NormalizedOffer => ({
  scheme: 'exact',
  network: 'base-sepolia',
  asset: USDC,
  ...offer,
});

function context(c: EvalCaseOf<'judge-pairs'> | EvalCaseOf<'e2e'>) {
  const intent = toIntent(c.intent);
  const task = toTask(intent);
  const offer = toOffer(c.offer);
  const purchases: Purchase[] = (c.suite === 'e2e' ? c.purchases : []).map((p) => ({
    taskId: p.sameTask ? TASK : OTHER_TASK,
    payTo: p.payTo,
    amount: BigInt(p.amount),
  }));
  const facts = buildFacts({ offer, intent, task, purchases, requestedUrl: c.offer.resourceUrl });
  return { intent, task, offer, purchases, facts };
}

/** Judge state with a person-written extraction instead of Screen's. */
function oracleState(state: JudgeState, extraction: ExtractedOffer): JudgeState {
  return { ...state, offer_as_extracted_from_merchant_text: extraction };
}

export async function runCase(c: EvalCase, jev: JevClient): Promise<CaseRecord> {
  const record: CaseRecord = {
    id: c.id,
    suite: c.suite,
    split: c.split,
    group: c.group,
    source: c.source,
    author: c.author,
    labels: c.labels,
    expected: c.expected,
  };
  try {
    if (c.suite === 'screen-benign' || c.suite === 'screen-injection') {
      record.screen = await jev.screen(c.screenState);
      return record;
    }

    const { intent, task, offer, purchases, facts } = context(c);
    record.amount = c.offer.amount;
    if (c.suite === 'e2e') {
      // Production order: a Policy block means Jev is never asked.
      record.policy = defaultPolicy({
        offer,
        intent,
        task,
        purchases,
        allocation: EVAL_ALLOCATION,
      });
      if (!record.policy.ok) return record;
    }
    record.screen = await jev.screen(c.screenState);
    const state = toJudgeState({ intent, facts, screen: record.screen });
    record.judge = await jev.judge(state);
    if (c.suite === 'judge-pairs') {
      record.judgeOracle = await jev.judge(
        oracleState(state, c.oracleExtraction as ExtractedOffer),
      );
    }
  } catch (err) {
    record.error = err instanceof Error ? err.message : String(err);
  }
  return record;
}

/** Runs cases with bounded parallelism; order of the result follows `cases`. */
export async function runCases(
  cases: readonly EvalCase[],
  jev: JevClient,
  options: { concurrency?: number; onProgress?: (done: number) => void } = {},
): Promise<CaseRecord[]> {
  const results: CaseRecord[] = new Array(cases.length);
  let next = 0;
  let done = 0;
  const worker = async () => {
    while (next < cases.length) {
      const i = next++;
      results[i] = await runCase(cases[i]!, jev);
      options.onProgress?.(++done);
    }
  };
  await Promise.all(Array.from({ length: options.concurrency ?? 8 }, worker));
  return results;
}
