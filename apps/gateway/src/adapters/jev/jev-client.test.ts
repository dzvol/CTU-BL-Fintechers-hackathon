import { describe, expect, it, vi } from 'vitest';
import { HONEST_JUDGE, HONEST_SCREEN } from '../../../test/fake-jev';
import { JUDGE_QUESTIONS } from '../../domain/jev/judge-questions';
import type { Questions } from '../../domain/jev/questions';
import { SCREEN_QUESTIONS } from '../../domain/jev/screen-questions';
import type { JudgeState, ScreenState } from '../../domain/jev/state';
import { createHttpJevClient, createUnconfiguredJev } from './jev-client';

const config = {
  url: 'https://jev.test',
  apiKey: 'jev-secret',
  model: 'jev-1.13.0',
  timeoutMs: 1000,
};
const screenState: ScreenState = { resource: { url: 'https://merchant.example/data' } };
const judgeState = { task: 'snapshot' } as JudgeState;

/** Renders our answers the way the Jev API returns them. */
function wire(questions: Questions, answers: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(questions).map(([id, q]) => {
      const a = answers[id];
      if (q.type === 'noul') return [id, { type: 'noul', noul: a }];
      if (q.type === 'score')
        return [id, { type: 'score', score: a, legend: {}, probabilities: {} }];
      const { choice, confidence } = a as { choice: string; confidence: number };
      return [id, { type: 'choice', choice, confidence, probabilities: { [choice]: confidence } }];
    }),
  );
}

const reply = (answers: unknown, status = 200) =>
  new Response(JSON.stringify({ model: 'jev-1.13.0', answers, usage: {} }), {
    status,
    headers: { 'content-type': 'application/json' },
  });

function client(respond: (body: any) => Response | Promise<Response>) {
  const fetchFn = vi.fn(async (_url: unknown, init?: RequestInit) =>
    respond(JSON.parse(init!.body as string)),
  );
  return { jev: createHttpJevClient(config, fetchFn as typeof fetch), fetchFn };
}

describe('HTTP Jev client', () => {
  it('sends state and questions to /v1/systemone and reads the answers', async () => {
    const { jev, fetchFn } = client(() => reply(wire(SCREEN_QUESTIONS, HONEST_SCREEN)));

    expect(await jev.screen(screenState)).toEqual(HONEST_SCREEN);

    const [url, init] = fetchFn.mock.calls[0]!;
    expect(String(url)).toBe('https://jev.test/v1/systemone');
    expect(init!.method).toBe('POST');
    expect(init!.headers).toMatchObject({ authorization: 'Bearer jev-secret' });
    expect(JSON.parse(init!.body as string)).toEqual({
      model: 'jev-1.13.0',
      state: screenState,
      questions: SCREEN_QUESTIONS,
    });
  });

  it('asks Judge its own questions', async () => {
    const { jev, fetchFn } = client(() => reply(wire(JUDGE_QUESTIONS, HONEST_JUDGE)));
    expect(await jev.judge(judgeState)).toEqual(HONEST_JUDGE);
    expect(JSON.parse(fetchFn.mock.calls[0]![1]!.body as string).questions).toEqual(
      JUDGE_QUESTIONS,
    );
  });

  it.each([
    [
      'a missing answer',
      () => {
        const { urgency: _, ...rest } = wire(SCREEN_QUESTIONS, HONEST_SCREEN);
        return reply(rest);
      },
    ],
    [
      'an option we did not offer',
      () =>
        reply({
          ...wire(SCREEN_QUESTIONS, HONEST_SCREEN),
          offer_type: { type: 'choice', choice: 'approve_now', confidence: 1 },
        }),
    ],
    [
      'a probability out of range',
      () => reply({ ...wire(SCREEN_QUESTIONS, HONEST_SCREEN), urgency: { type: 'noul', noul: 3 } }),
    ],
    ['an HTTP error', () => reply({}, 529)],
    ['a body that is not JSON', () => new Response('oops', { status: 200 })],
  ])('fails on %s', async (_name, respond) => {
    const { jev } = client(respond);
    await expect(jev.screen(screenState)).rejects.toThrow();
  });

  it('gives up after the timeout', async () => {
    const fetchFn = vi.fn(
      (_url: unknown, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) =>
          init!.signal!.addEventListener('abort', () => reject(init!.signal!.reason)),
        ),
    );
    const jev = createHttpJevClient({ ...config, timeoutMs: 10 }, fetchFn as typeof fetch);
    await expect(jev.screen(screenState)).rejects.toThrow();
  });

  it('refuses to work without configuration', async () => {
    await expect(createUnconfiguredJev().screen(screenState)).rejects.toThrow('JEV_API_KEY');
  });
});
