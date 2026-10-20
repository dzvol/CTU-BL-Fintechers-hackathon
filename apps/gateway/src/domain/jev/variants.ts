import { DEFAULT_THRESHOLDS, type Thresholds } from '../decision/decide';
import {
  JUDGE_QUESTIONS,
  JUDGE_QUESTIONS_DEMO,
  JUDGE_QUESTIONS_V2,
  JUDGE_QUESTIONS_V3,
} from './judge-questions';
import type { QuestionSetLike } from './questions';
import {
  SCREEN_QUESTIONS,
  SCREEN_QUESTIONS_DEMO,
  SCREEN_QUESTIONS_V2,
  SCREEN_QUESTIONS_V3,
} from './screen-questions';

/** The questions a variant asks; each set answers at least what the decision table reads. */
export interface JevQuestionSets {
  screen: QuestionSetLike<typeof SCREEN_QUESTIONS>;
  judge: QuestionSetLike<typeof JUDGE_QUESTIONS>;
}

export const QUESTIONS_V1: JevQuestionSets = { screen: SCREEN_QUESTIONS, judge: JUDGE_QUESTIONS };
export const QUESTIONS_V2: JevQuestionSets = {
  screen: SCREEN_QUESTIONS_V2,
  judge: JUDGE_QUESTIONS_V2,
};
export const QUESTIONS_V3: JevQuestionSets = {
  screen: SCREEN_QUESTIONS_V3,
  judge: JUDGE_QUESTIONS_V3,
};
/** Pitch demo only: v3 plus the country. */
export const QUESTIONS_DEMO: JevQuestionSets = {
  screen: SCREEN_QUESTIONS_DEMO,
  judge: JUDGE_QUESTIONS_DEMO,
};

/**
 * A named way of using Jev: which questions it asks and how the decision table reads the answers.
 * Production runs exactly one (JEV_VARIANT); the evaluation runs all of them on the same cases.
 * Change a variant only together with a new evaluation run, and never two things in one variant
 * that you want to judge separately.
 */
export interface JevVariant {
  id: string;
  /** What it trades for what, in one sentence. */
  description: string;
  questions: JevQuestionSets;
  thresholds: Thresholds;
}

export const JEV_VARIANTS = {
  baseline: {
    id: 'baseline',
    description: 'Production since the first version: v1 questions, default thresholds.',
    questions: QUESTIONS_V1,
    thresholds: DEFAULT_THRESHOLDS,
  },
  strict: {
    id: 'strict',
    description:
      'When in doubt, ask the user: flags earlier, needs a surer Judge, reviews unclear texts. Same questions as baseline.',
    questions: QUESTIONS_V1,
    thresholds: {
      ...DEFAULT_THRESHOLDS,
      yes: 0.35,
      severe: 1.5,
      support: { upTo10Cents: 0.75, upTo1Usdc: 0.85, above: 0.95 },
      rules: { deliverable: 'stated', deliverableBelow: 0.5, reviewUnclearConsistency: true },
    },
  },
  // Chosen on the dev split (snapshot drafts-v1): the fewest needless REVIEWs without more harmful
  // payments, except one oversized purchase that only the deliverable rule had caught by chance.
  // Confirm on test before production.
  balanced: {
    id: 'balanced',
    description:
      'Decide instead of asking: blocks clear manipulation earlier, accepts a less sure Judge on small amounts, reviews a missing deliverable only when Screen finds none. Same questions as baseline.',
    questions: QUESTIONS_V1,
    thresholds: {
      ...DEFAULT_THRESHOLDS,
      injection: 0.7,
      support: { upTo10Cents: 0.4, upTo1Usdc: 0.55, above: 0.75 },
      rules: { deliverable: 'kind' },
    },
  },
  'questions-v2': {
    id: 'questions-v2',
    description:
      'Different questions, baseline thresholds: Screen names the subject from a fixed list and Judge checks it against the task; deliverable and instruction questions reworded.',
    questions: QUESTIONS_V2,
    thresholds: { ...DEFAULT_THRESHOLDS, rules: { topicMismatch: 'block' } },
  },
  // Built from what the dev split (snapshot reviewed-v1) showed v2 could not see. Same settings
  // as questions-v2, so the comparison with it shows what the questions alone change.
  'questions-v3': {
    id: 'questions-v3',
    description:
      "v2 plus Screen's scale of the purchase, what the buyer receives and requests for secrets; Judge reads the approved purchase list and the scale. Same settings as questions-v2.",
    questions: QUESTIONS_V3,
    thresholds: { ...DEFAULT_THRESHOLDS, rules: { topicMismatch: 'block' } },
  },
  // questions-v3 plus the asset rule. With the rule catching tokens and NFTs, a cheap purchase
  // needs less certainty from Judge: 0.5 instead of 0.6 paid nothing harmful more on dev (snapshot
  // allq-dev) and stopped asking about honest small purchases Judge rated 0.54-0.6 "within purpose".
  'v3-assets': {
    id: 'v3-assets',
    description:
      'questions-v3; the user is always asked before buying a token, NFT or financial position, and small purchases need a less sure Judge.',
    questions: QUESTIONS_V3,
    thresholds: {
      ...DEFAULT_THRESHOLDS,
      support: { ...DEFAULT_THRESHOLDS.support, upTo10Cents: 0.5 },
      rules: { topicMismatch: 'block', assetPurchase: 'review' },
    },
  },
  // For the live pitch demo only (tests/merchants /datanest/*), not for evaluation: settings
  // picked so the honest Czech SME offer passes without asking. Never quote its numbers.
  demo: {
    id: 'demo',
    description:
      "Pitch demo only, not evaluated: v3 questions plus the country, the asset rule, a less sure Judge on small amounts, no review for a short description, and an on-topic offer passes Judge's purpose check.",
    questions: QUESTIONS_DEMO,
    thresholds: {
      ...DEFAULT_THRESHOLDS,
      support: { upTo10Cents: 0.4, upTo1Usdc: 0.6, above: 0.9 },
      rules: {
        topicMismatch: 'block',
        assetPurchase: 'review',
        deliverable: 'kind',
        purposeFromTopic: true,
      },
    },
  },
} as const satisfies Record<string, JevVariant>;

export type JevVariantId = keyof typeof JEV_VARIANTS;
export const JEV_VARIANT_IDS = Object.keys(JEV_VARIANTS) as JevVariantId[];
export const DEFAULT_VARIANT: JevVariantId = 'baseline';
