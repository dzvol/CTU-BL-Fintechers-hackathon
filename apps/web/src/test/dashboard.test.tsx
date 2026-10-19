import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, cleanup, act, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ApiKey, Intent, Me, Operation, Review, Task } from '@semanticauth/contracts';
import { App, router, queryClient } from '../App';
import { intent, key, operation, review, task, user } from './fixtures';

let loggedIn = true;
let me: Me;
let intentRecord: Intent;
let taskRecords: Task[];
let keyRecords: ApiKey[];
let operations: Operation[];
let reviews: Review[];
let failApproval = false;
let unauthorizedApproval = false;
let requests: { path: string; method: string }[];
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const unauthenticated = () =>
  json({ error: { code: 'unauthenticated', message: 'Login required' } }, 401);

beforeEach(async () => {
  loggedIn = true;
  me = { ...user };
  intentRecord = { ...intent };
  taskRecords = [];
  keyRecords = [key];
  operations = [operation];
  reviews = [];
  failApproval = false;
  unauthorizedApproval = false;
  requests = [];
  await queryClient.cancelQueries();
  queryClient.clear();
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const path = String(input),
      method = init?.method ?? 'GET';
    requests.push({ path, method });
    if (path === '/api/me') return loggedIn ? json(me) : unauthenticated();
    if (!loggedIn) return unauthenticated();
    if (path === '/auth/logout') {
      loggedIn = false;
      return new Response(null, { status: 204 });
    }
    if (path === '/api/intents') return json({ items: [intentRecord] });
    if (path === `/api/intents/${intent.id}`) return json(intentRecord);
    if (path === `/api/intents/${intent.id}/approve`) {
      if (unauthorizedApproval) {
        loggedIn = false;
        return unauthenticated();
      }
      if (failApproval)
        return json(
          { error: { code: 'active_task_exists', message: 'Close the active task first' } },
          409,
        );
      intentRecord = { ...intentRecord, status: 'approved', taskId: task.id };
      taskRecords = [task];
      return json(intentRecord);
    }
    if (path === `/api/intents/${intent.id}/reject`) {
      intentRecord = { ...intentRecord, status: 'rejected' };
      return json(intentRecord);
    }
    if (path === '/api/tasks') return json({ items: taskRecords });
    if (path === `/api/tasks/${task.id}/close`) {
      taskRecords = [{ ...task, status: 'closed' }];
      return json(taskRecords[0]);
    }
    if (path === '/api/operations') return json({ items: operations });
    if (path === `/api/operations/${operation.id}`) return json(operations[0]);
    if (path === '/api/reviews') return json({ items: reviews });
    if (path === `/api/reviews/${review.id}/approve`) {
      reviews = [{ ...review, status: 'approved' }];
      return json(reviews[0]);
    }
    if (path === '/api/keys' && method === 'GET') return json({ items: keyRecords });
    if (path === '/api/keys' && method === 'POST') {
      const created = { ...key, id: `key_${'2'.repeat(8)}-1111-4111-8111-111111111111` };
      keyRecords = [
        ...keyRecords.map((k) => ({ ...k, revokedAt: k.revokedAt ?? k.createdAt })),
        created,
      ];
      return json({ apiKey: created, key: 'synthetic-test-secret' });
    }
    if (path.startsWith('/api/keys/') && method === 'DELETE') {
      keyRecords = keyRecords.map((k) => ({ ...k, revokedAt: '2026-10-19T19:00:00Z' }));
      return json(keyRecords[0]);
    }
    throw new Error(`Unexpected test request ${method} ${path}`);
  });
});
afterEach(async () => {
  cleanup();
  await queryClient.cancelQueries();
  queryClient.clear();
});
async function open(path: string) {
  render(<App />);
  await act(async () => {
    await router.navigate({ to: path });
  });
}

describe('sign-in and session', () => {
  it('offers the real Google endpoint without demo login', async () => {
    loggedIn = false;
    await open('/');
    const link = await screen.findByRole('link', { name: 'Continue with Google' });
    expect(link.getAttribute('href')).toBe('/auth/google/login');
  });

  it('clears private screens after sign-out and after a session expires', async () => {
    await open('/overview');
    await screen.findByRole('heading', { name: 'Overview' });
    await userEvent.click(screen.getAllByRole('button', { name: 'Sign out' })[0]!);
    await screen.findByRole('link', { name: 'Continue with Google' });
    expect(screen.queryByRole('heading', { name: 'Overview' })).toBeNull();
    loggedIn = true;
    await act(async () => {
      await queryClient.invalidateQueries();
    });
    await screen.findByRole('heading', { name: 'Overview' });
    loggedIn = false;
    await act(async () => {
      await queryClient.invalidateQueries();
    });
    await screen.findByRole('link', { name: 'Continue with Google' });
    expect(screen.queryByRole('navigation', { name: 'Primary' })).toBeNull();
    expect(queryClient.getQueryData(['operations'])).toBeUndefined();
  });

  it('clears owner data immediately when an approval loses its session', async () => {
    unauthorizedApproval = true;
    await open(`/tasks/${intent.id}`);
    await userEvent.click(await screen.findByRole('button', { name: 'Approve task' }));
    await screen.findByRole('link', { name: 'Continue with Google' });
    expect(queryClient.getQueryData(['intents', intent.id])).toBeUndefined();
  });
});

describe('allowance', () => {
  it('shows what is left to spend from the gateway balance', async () => {
    await open('/overview');
    const allowance = (await screen.findAllByLabelText('Allowance'))[0]!;
    expect(within(allowance).getByText('Left to spend')).toBeTruthy();
    expect(within(allowance).getByText('1.50')).toBeTruthy();
  });

  it('warns once the allowance is used up and refuses new keys in the UI', async () => {
    me = { ...user, balance: { spent: '2000000', reserved: '0', remaining: '0' } };
    keyRecords = [];
    await open('/agent');
    await screen.findByText('Your allowance is used up. Agent keys no longer work.');
    expect(await screen.findByRole('button', { name: 'Create key' })).toHaveProperty(
      'disabled',
      true,
    );
  });
});

describe('decisions', () => {
  it('approves a proposed task and shows it as active', async () => {
    await open(`/tasks/${intent.id}`);
    await userEvent.click(await screen.findByRole('button', { name: 'Approve task' }));
    await screen.findByRole('button', { name: 'Stop task' });
    expect(requests).toContainEqual({ path: `/api/intents/${intent.id}/approve`, method: 'POST' });
    expect(screen.queryByRole('button', { name: 'Approve task' })).toBeNull();
  });

  it('surfaces a refused approval instead of reporting success', async () => {
    failApproval = true;
    await open(`/tasks/${intent.id}`);
    await userEvent.click(await screen.findByRole('button', { name: 'Approve task' }));
    await screen.findByText('Close the active task first');
    expect(screen.getByRole('button', { name: 'Approve task' })).toBeTruthy();
  });

  it('rejects a proposal, then stops an active task only after confirmation', async () => {
    await open(`/tasks/${intent.id}`);
    await userEvent.click(await screen.findByRole('button', { name: 'Reject' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Reject' })).toBeNull());
    intentRecord = { ...intentRecord, status: 'approved', taskId: task.id };
    taskRecords = [task];
    await act(async () => {
      await queryClient.invalidateQueries();
    });
    await userEvent.click(await screen.findByRole('button', { name: 'Stop task' }));
    expect(requests.some((r) => r.path.endsWith('/close'))).toBe(false);
    const dialog = await screen.findByRole('alertdialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Stop task' }));
    await waitFor(() =>
      expect(requests).toContainEqual({ path: `/api/tasks/${task.id}/close`, method: 'POST' }),
    );
  });

  it('lists pending decisions on the overview and approves a payment by review ID', async () => {
    reviews = [review];
    await open('/overview');
    const waiting = await screen.findByRole('region', { name: 'Waiting for you' });
    await within(waiting).findByText('Recipient changed');
    expect(within(waiting).getByRole('link', { name: 'Review task' })).toBeTruthy();
    await userEvent.click(within(waiting).getByRole('button', { name: 'Approve payment' }));
    await waitFor(() =>
      expect(requests).toContainEqual({
        path: `/api/reviews/${review.id}/approve`,
        method: 'POST',
      }),
    );
    expect(requests.some((r) => r.path.includes(operation.id) && r.method === 'POST')).toBe(false);
  });

  it('refuses an expired payment review without calling the gateway', async () => {
    reviews = [{ ...review, expiresAt: '2020-01-01T00:00:00Z' }];
    await open(`/activity/${operation.id}`);
    await screen.findByText('Expired');
    expect(screen.getByRole('button', { name: 'Approve payment' })).toHaveProperty(
      'disabled',
      true,
    );
  });
});

describe('activity', () => {
  it('files an unconfirmed payment under problems and links settlements to Basescan', async () => {
    const settled: Operation = {
      ...operation,
      id: `op_${'2'.repeat(8)}-1111-4111-8111-111111111111`,
      url: 'https://paid.example.test/report',
      state: 'delivered',
      settlement: {
        txHash: `0x${'a'.repeat(64)}`,
        explorerUrl: `https://sepolia.basescan.org/tx/0x${'a'.repeat(64)}`,
      },
    };
    operations = [operation, settled];
    await open('/activity?filter=problems');
    await screen.findByRole('img', { name: 'Unconfirmed' });
    expect(screen.queryByText('paid.example.test')).toBeNull();
    await userEvent.click(screen.getByRole('link', { name: /^Paid/ }));
    await screen.findByText('paid.example.test');
    expect(screen.getByRole('link', { name: 'View on Basescan' }).getAttribute('href')).toBe(
      settled.settlement!.explorerUrl,
    );
  });

  it('never calls a delivered purchase without settlement paid', async () => {
    operations = [{ ...operation, state: 'delivered', reason: 'within_intent' }];
    await open('/activity');
    await screen.findByRole('img', { name: 'Delivered' });
    expect(screen.queryByRole('img', { name: 'Paid' })).toBeNull();
  });

  it('searches by merchant', async () => {
    await open('/activity');
    await screen.findByText('merchant.example.test');
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search activity' }), 'nothing');
    await screen.findByText('Nothing matches');
  });
});

describe('agent key', () => {
  it('shows a new key once, keeps it out of the query cache and hides it on Done', async () => {
    keyRecords = [];
    await open('/agent');
    await userEvent.type(await screen.findByLabelText('Agent name'), 'Laptop');
    await userEvent.click(screen.getByRole('button', { name: 'Create key' }));
    await screen.findByText('synthetic-test-secret');
    expect(
      JSON.stringify(
        queryClient
          .getMutationCache()
          .getAll()
          .map((m) => m.state.data),
      ),
    ).not.toContain('synthetic-test-secret');
    await userEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.queryByText('synthetic-test-secret')).toBeNull();
  });

  it('replaces and revokes the key only after confirmation', async () => {
    await open('/agent');
    await userEvent.click(await screen.findByRole('button', { name: 'Replace' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Replace key' }));
    await screen.findByText('synthetic-test-secret');
    expect(requests).toContainEqual({ path: '/api/keys', method: 'POST' });
    await userEvent.click(screen.getByRole('button', { name: 'Revoke' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Revoke key' }));
    await screen.findByLabelText('Agent name');
    expect(screen.queryByText('synthetic-test-secret')).toBeNull();
  });
});

describe('navigation', () => {
  it('guides a new account to connect an agent', async () => {
    keyRecords = [];
    operations = [];
    intentRecord = { ...intentRecord, status: 'rejected' };
    await open('/overview');
    await screen.findByText('Connect your agent to get started');
    await userEvent.click(screen.getByRole('link', { name: 'Connect agent' }));
    await screen.findByLabelText('Agent name');
  });

  it('keeps FAQ and Contact in the signed-in navigation', async () => {
    await open('/overview');
    const nav = (await screen.findAllByRole('navigation', { name: 'Primary' }))[0]!;
    await userEvent.click(within(nav).getByRole('link', { name: 'FAQ' }));
    await screen.findByRole('heading', { name: 'FAQ' });
    await userEvent.click(within(nav).getByRole('link', { name: 'Contact' }));
    await screen.findByRole('heading', { name: 'Contact' });
    expect(screen.queryByRole('link', { name: 'Sign in' })).toBeNull();
  });

  it('lets visitors read FAQ and Contact without signing in', async () => {
    loggedIn = false;
    await open('/');
    await userEvent.click(await screen.findByRole('link', { name: 'FAQ' }));
    await screen.findByRole('heading', { name: 'FAQ' });
    expect(screen.queryByRole('navigation', { name: 'Primary' })).toBeNull();
    await userEvent.click(screen.getByRole('link', { name: 'Contact' }));
    await screen.findByRole('heading', { name: 'Contact' });
    expect(screen.getByRole('link', { name: 'Sign in' })).toBeTruthy();
  });

  it('keeps links from before the redesign working', async () => {
    await open(`/mandates/${intent.id}`);
    await screen.findByRole('button', { name: 'Approve task' });
    expect(router.state.location.pathname).toBe(`/tasks/${intent.id}`);
  });
});
