import type { ConverseCommandInput, ConverseCommandOutput } from '@aws-sdk/client-bedrock-runtime';
import { describe, expect, it } from 'vitest';
import { createHttpJevClient } from '../src/adapters/jev/jev-client';
import { JUDGE_QUESTIONS } from '../src/domain/jev/judge-questions';
import type { Questions } from '../src/domain/jev/questions';
import { SCREEN_QUESTIONS } from '../src/domain/jev/screen-questions';
import { answerSchema, createBedrockFetch, extractJson, normalize, toJevAnswers } from './bedrock';

const config = { url: 'https://bedrock.invalid', apiKey: 'x', model: 'm', timeoutMs: 5_000 };

/** A model that puts all probability on the first option of every question. */
function confidentAnswer(questions: Questions) {
  const schema = answerSchema(questions) as {
    properties: Record<string, { required: string[] }>;
  };
  return Object.fromEntries(
    Object.entries(schema.properties).map(([id, q]) => [
      id,
      Object.fromEntries(q.required.map((o, i) => [o, i === 0 ? 1 : 0])),
    ]),
  );
}

const reply = (text: string): ConverseCommandOutput =>
  ({
    output: { message: { role: 'assistant', content: [{ text }] } },
    usage: { inputTokens: 1200, outputTokens: 300, totalTokens: 1500 },
    stopReason: 'end_turn',
    metrics: { latencyMs: 1 },
    $metadata: {},
  }) as ConverseCommandOutput;

describe('Bedrock stand-in for Jev', () => {
  it('produces answers that pass the production Jev response schema for Screen and Judge', async () => {
    const sent: ConverseCommandInput[] = [];
    const send = async (input: ConverseCommandInput) => {
      sent.push(input);
      const questions = input.messages![0]!.content![0]!.text!.includes('mandate_purpose')
        ? JUDGE_QUESTIONS
        : SCREEN_QUESTIONS;
      return reply(JSON.stringify(confidentAnswer(questions as Questions)));
    };
    const jev = createHttpJevClient(config, createBedrockFetch({ send }));

    const screen = await jev.screen({ merchant_text: 'Market data snapshot' } as never);
    const judge = await jev.judge({ mandate: 'research' } as never);

    expect(screen.offer_type.choice).toBe(Object.keys(SCREEN_QUESTIONS.offer_type.criteria)[0]);
    expect(screen.offer_type.probabilities).toBeDefined();
    expect(typeof judge.severity).toBe('number');
    // Structured output is requested, and merchant text only travels inside the user message.
    expect(sent[0]!.outputConfig?.textFormat?.type).toBe('json_schema');
    expect(sent[0]!.system![0]!.text).not.toContain('Market data snapshot');
  });

  it('falls back to plain JSON when a model rejects structured output, and remembers it', async () => {
    const sent: ConverseCommandInput[] = [];
    const send = async (input: ConverseCommandInput) => {
      sent.push(input);
      if (input.outputConfig)
        throw new Error('ValidationException: structured output not supported');
      return reply(
        `Here you go:\n${JSON.stringify(confidentAnswer(SCREEN_QUESTIONS as Questions))}`,
      );
    };
    const jev = createHttpJevClient(config, createBedrockFetch({ send }));

    await jev.screen({} as never);
    await jev.screen({ other: 1 } as never);

    expect(sent.map((s) => Boolean(s.outputConfig))).toEqual([true, false, false]);
  });

  it('fails (so the case fails closed) when the model returns no JSON', async () => {
    const jev = createHttpJevClient(
      config,
      createBedrockFetch({ send: async () => reply('I cannot help with that.') }),
    );
    await expect(jev.screen({} as never)).rejects.toThrow();
  });

  it('builds a schema without numeric bounds, which Bedrock structured output rejects', () => {
    const json = JSON.stringify(
      answerSchema({ ...SCREEN_QUESTIONS, ...JUDGE_QUESTIONS } as Questions),
    );
    expect(json).not.toMatch(/minimum|maximum/);
    expect(json).toContain('"additionalProperties":false');
  });

  it('normalizes out-of-range and missing probabilities', () => {
    expect(normalize({ a: 2, b: -1 }, ['a', 'b'])).toEqual({ a: 1, b: 0 });
    expect(normalize({ a: 0.2, b: 0.2 }, ['a', 'b'])).toEqual({ a: 0.5, b: 0.5 });
    expect(normalize({}, ['a', 'b', 'c', 'd'])).toEqual({ a: 0.25, b: 0.25, c: 0.25, d: 0.25 });
  });

  it('turns option probabilities into noul, choice and score answers', () => {
    const questions: Questions = {
      n: { type: 'noul', instructions: 'n?' },
      c: { type: 'choice', instructions: 'c?', criteria: { x: 'x', y: 'y' } },
      s: { type: 'score', instructions: 's?', criteria: ['low', 'mid', 'high'] },
    };
    const answers = toJevAnswers(questions, {
      n: { yes: 0.8, no: 0.2 },
      c: { x: 0.3, y: 0.7 },
      s: { level_0: 0, level_1: 0.5, level_2: 0.5 },
    });
    expect(answers.n).toEqual({ type: 'noul', noul: 0.8 });
    expect(answers.c).toMatchObject({ type: 'choice', choice: 'y', confidence: 0.7 });
    expect(answers.s).toEqual({ type: 'score', score: 1.5 });
  });

  it('extracts the JSON object from surrounding text', () => {
    expect(extractJson('```json\n{"a": {"b": 1}}\n```')).toEqual({ a: { b: 1 } });
    expect(() => extractJson('no json')).toThrow();
  });
});
