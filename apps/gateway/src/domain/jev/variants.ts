import { DEFAULT_THRESHOLDS, type Thresholds } from '../decision/decide';
import { JUDGE_QUESTIONS, JUDGE_QUESTIONS_V2 } from './judge-questions';
import type { QuestionSetLike } from './questions';
import { SCREEN_QUESTIONS, SCREEN_QUESTIONS_V2 } from './screen-questions';

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
} as const satisfies Record<string, JevVariant>;

export type JevVariantId = keyof typeof JEV_VARIANTS;
export const JEV_VARIANT_IDS = Object.keys(JEV_VARIANTS) as JevVariantId[];
export const DEFAULT_VARIANT: JevVariantId = 'baseline';
