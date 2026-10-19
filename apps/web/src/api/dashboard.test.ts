import { describe, it, expect, vi } from 'vitest';
import { formatUsdc } from '@semanticauth/contracts';
import { fetchMe, logout } from './auth';
import { fetchKeys, createApiKey, revokeApiKey } from './keys';
import { fetchIntents, approveIntent, rejectIntent } from './intents';
import { fetchTasks, closeTask } from './tasks';
import { fetchOperations, fetchOperation } from './operations';
import { fetchReviews, approveReview, rejectReview } from './reviews';
import { ApiError } from './http';
import { intent, key, operation, review, task, user } from '../test/fixtures';

const answer = (body: unknown, status = 200) =>
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(body === undefined ? null : JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    }),
  );
describe('gateway dashboard boundary', () => {
  it('parses actual items envelopes using shared schemas and owner cookies', async () => {
    const cases = [
      ['/api/keys', fetchKeys, key],
      ['/api/intents', fetchIntents, intent],
      ['/api/tasks', fetchTasks, task],
      ['/api/operations', fetchOperations, operation],
      ['/api/reviews', fetchReviews, review],
    ] as const;
    for (const [path, read, item] of cases) {
      const fetch = answer({ items: [item] });
      expect(await read()).toEqual([item]);
      expect(fetch).toHaveBeenLastCalledWith(
        path,
        expect.objectContaining({ credentials: 'include', method: 'GET' }),
      );
    }
  });
  it('uses supported mutation paths and review IDs rather than operation IDs', async () => {
    const cases = [
      [
        '/api/keys',
        () => createApiKey('Research assistant'),
        { apiKey: key, key: 'synthetic-secret' },
        'POST',
      ],
      [`/api/keys/${key.id}`, () => revokeApiKey(key.id), key, 'DELETE'],
      [`/api/intents/${intent.id}/approve`, () => approveIntent(intent.id), intent, 'POST'],
      [`/api/intents/${intent.id}/reject`, () => rejectIntent(intent.id), intent, 'POST'],
      [`/api/tasks/${task.id}/close`, () => closeTask(task.id), task, 'POST'],
      [`/api/reviews/${review.id}/approve`, () => approveReview(review.id), review, 'POST'],
      [`/api/reviews/${review.id}/reject`, () => rejectReview(review.id), review, 'POST'],
    ] as const;
    for (const [path, mutate, response, method] of cases) {
      const fetch = answer(response);
      expect(await mutate()).toEqual(response);
      expect(fetch).toHaveBeenLastCalledWith(
        path,
        expect.objectContaining({ method, credentials: 'include' }),
      );
    }
  });
  it('reads operation details and sessions, handles 204 logout', async () => {
    answer(user);
    expect(await fetchMe()).toEqual(user);
    answer(operation);
    expect(await fetchOperation(operation.id)).toEqual(operation);
    const fetch = answer(undefined, 204);
    await logout();
    expect(fetch).toHaveBeenLastCalledWith(
      '/auth/logout',
      expect.objectContaining({ method: 'POST', credentials: 'include' }),
    );
  });
  it('distinguishes unauthenticated, offline and unimplemented responses', async () => {
    answer({ error: { code: 'unauthenticated', message: 'Login required' } }, 401);
    expect(await fetchMe()).toBeNull();
    answer(
      { error: { code: 'not_implemented', message: 'review.listForUser is not implemented yet' } },
      501,
    );
    await expect(fetchReviews()).rejects.toMatchObject({ status: 501, code: 'not_implemented' });
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('network'));
    await expect(fetchMe()).rejects.toMatchObject({ status: 0 });
  });
  it('rejects a draft Lovable response instead of silently showing an empty list', async () => {
    answer({ data: [operation] });
    await expect(fetchOperations()).rejects.toBeInstanceOf(ApiError);
  });
  it('preserves atomic-unit precision for micro-USDC and large balances', () => {
    expect(formatUsdc('100001')).toBe('0.100001');
    expect(formatUsdc('1')).toBe('0.000001');
    expect(formatUsdc('9007199254740993123456')).toBe('9007199254740993.123456');
  });
});
