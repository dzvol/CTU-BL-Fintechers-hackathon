import { describe, expect, it } from 'vitest';
import { asUser, createTestApp, login } from './helpers';

const UNKNOWN = 'rev_00000000-0000-0000-0000-000000000000';

describe('Dashboard reviews API', () => {
  it('lists the user’s reviews and answers 404 for unknown ones', async () => {
    const app = createTestApp();
    const { sessionCookie } = await login(app);

    const list = await asUser(app, sessionCookie, '/api/reviews?status=pending');
    expect(list.status).toBe(200);
    expect(await list.json()).toEqual({ items: [] });

    for (const action of ['approve', 'reject']) {
      const res = await asUser(app, sessionCookie, `/api/reviews/${UNKNOWN}/${action}`, {
        method: 'POST',
      });
      expect(res.status).toBe(404);
    }
  });

  it('needs a dashboard session', async () => {
    const res = await createTestApp().request('/api/reviews');
    expect(res.status).toBe(401);
  });
});
