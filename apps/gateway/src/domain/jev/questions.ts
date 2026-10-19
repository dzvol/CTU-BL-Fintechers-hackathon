// Question shapes of the Jev API (POST /v1/systemone) and the answers we keep from them.

export interface NoulQuestion {
  type: 'noul';
  instructions: string;
  criteria?: { true?: string; false?: string };
}

export interface ChoiceQuestion<Option extends string = string> {
  type: 'choice';
  instructions: string;
  criteria: Record<Option, string>;
}

export interface ScoreQuestion {
  type: 'score';
  instructions: string;
  /** Ordered levels; the answer is a probability-weighted level index. */
  criteria: readonly string[];
}

export type Question = NoulQuestion | ChoiceQuestion | ScoreQuestion;
export type Questions = Record<string, Question>;

export interface ChoiceAnswer<Option extends string> {
  /** The most likely option. */
  choice: Option;
  /** Jev's own certainty measure; not the probability of `choice`. */
  confidence: number;
  /** Probability of each option (missing = 0). */
  probabilities: Partial<Record<Option, number>>;
}

/** noul → probability of "yes" (0..1); choice → top option + confidence; score → level (0..n-1). */
export type AnswerOf<Q> = Q extends { type: 'noul' }
  ? number
  : Q extends { type: 'choice'; criteria: infer C }
    ? ChoiceAnswer<Extract<keyof C, string>>
    : Q extends { type: 'score' }
      ? number
      : never;

export type Answers<Qs extends Questions> = { [K in keyof Qs]: AnswerOf<Qs[K]> };

/** Any question with the same answer type as Q: the wording may differ, the option keys may not. */
export type SameAnswerAs<Q extends Question> = Q extends ChoiceQuestion
  ? ChoiceQuestion<Extract<keyof Q['criteria'], string>>
  : Q extends NoulQuestion
    ? NoulQuestion
    : ScoreQuestion;

/**
 * A question set that answers at least everything `Base` asks, with the same answer types, plus
 * any extra questions. Lets a variant reword or add questions without breaking the decision table.
 */
export type QuestionSetLike<Base extends Questions> = {
  [K in keyof Base]: SameAnswerAs<Base[K]>;
} & Questions;
