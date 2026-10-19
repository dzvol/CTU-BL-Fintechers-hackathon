import { z } from 'zod';
import type { JudgeAnswers } from '../../domain/jev/judge-questions';
import type { Question, Questions } from '../../domain/jev/questions';
import type { ScreenAnswers } from '../../domain/jev/screen-questions';
import type { JudgeState, ScreenState } from '../../domain/jev/state';
import { QUESTIONS_V1, type JevQuestionSets } from '../../domain/jev/variants';

/**
 * Semantic checks. Screen sees only untrusted merchant text; Judge never does.
 * Any thrown error is treated as "Jev unavailable" and blocks the operation.
 */
export interface JevClient {
  screen(state: ScreenState): Promise<ScreenAnswers>;
  judge(state: JudgeState): Promise<JudgeAnswers>;
}

export interface JevConfig {
  /** API base, e.g. https://api.typesafe.ai */
  url: string;
  apiKey: string;
  /** Pinned model version; aliases like jev-latest can change behaviour under us. */
  model: string;
  timeoutMs: number;
}

const probability = z.number().min(0).max(1);

function answerSchema(question: Question) {
  switch (question.type) {
    case 'noul':
      return z.object({ type: z.literal('noul'), noul: probability }).transform((a) => a.noul);
    case 'choice': {
      const option = z.enum(Object.keys(question.criteria) as [string, ...string[]]);
      return z
        .object({
          type: z.literal('choice'),
          choice: option,
          confidence: probability,
          probabilities: z.partialRecord(option, probability),
        })
        .transform(({ choice, confidence, probabilities }) => ({
          choice,
          confidence,
          probabilities,
        }));
    }
    case 'score':
      return z
        .object({
          type: z.literal('score'),
          score: z
            .number()
            .min(0)
            .max(question.criteria.length - 1),
        })
        .transform((a) => a.score);
  }
}

/** Every question must be answered with its own type and one of our own option keys. */
function responseSchema<Qs extends Questions>(questions: Qs) {
  const answers = Object.fromEntries(
    Object.entries(questions).map(([id, question]) => [id, answerSchema(question)]),
  );
  return z.object({ model: z.string(), answers: z.object(answers) });
}

/**
 * Jev over HTTP (TypeSafe `POST /v1/systemone`). One request per Screen and per Judge, asking the
 * variant's questions; every one of them must come back with its own type and option keys.
 */
export function createHttpJevClient(
  config: JevConfig,
  fetchFn: typeof fetch = fetch,
  questions: JevQuestionSets = QUESTIONS_V1,
): JevClient {
  const endpoint = new URL('/v1/systemone', config.url);
  const screenResponse = responseSchema(questions.screen);
  const judgeResponse = responseSchema(questions.judge);

  async function ask(
    state: ScreenState | JudgeState,
    questions: Questions,
    schema: typeof screenResponse | typeof judgeResponse,
  ): Promise<unknown> {
    const res = await fetchFn(endpoint, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${config.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ model: config.model, state, questions }),
      signal: AbortSignal.timeout(config.timeoutMs),
    });
    if (!res.ok) throw new Error(`Jev answered HTTP ${res.status}`);
    const parsed = schema.safeParse(await res.json());
    // Don't echo the body: it may repeat parts of the state.
    if (!parsed.success) throw new Error('Jev returned an invalid response');
    return parsed.data.answers;
  }

  return {
    screen: async (state) => (await ask(state, questions.screen, screenResponse)) as ScreenAnswers,
    judge: async (state) => (await ask(state, questions.judge, judgeResponse)) as JudgeAnswers,
  };
}

/** Used when JEV_API_KEY is missing: every paid offer is blocked with `jev_unavailable`. */
export function createUnconfiguredJev(): JevClient {
  const fail = async (): Promise<never> => {
    throw new Error('Jev is not configured (JEV_API_KEY)');
  };
  return { screen: fail, judge: fail };
}
