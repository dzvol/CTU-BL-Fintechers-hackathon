import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, cleanup, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App, router, queryClient } from '../App';
import { intent, key, operation, task, user } from './fixtures';
import type { ApiKey, Intent, Task } from '@semanticauth/contracts';
let loggedIn = true;
let intentRecord: Intent;
let taskRecords: Task[];
let keyRecords: ApiKey[];
let failApproval = false;
let unauthorizedApproval = false;
let requests: { path: string; method: string }[];
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
beforeEach(async () => {
  loggedIn = true;
  intentRecord = { ...intent };
  taskRecords = [];
  keyRecords = [];
  failApproval = false;
  unauthorizedApproval = false;
  requests = [];
  await queryClient.cancelQueries();
  queryClient.clear();
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const path = String(input),
      method = init?.method ?? 'GET';
    requests.push({ path, method });
    if (path === '/api/me')
      return loggedIn
        ? json(user)
        : json({ error: { code: 'unauthenticated', message: 'Login required' } }, 401);
    if (path === '/auth/logout') {
      loggedIn = false;
      return new Response(null, { status: 204 });
    }
    if (path === '/api/intents') return json({ items: [intentRecord] });
    if (path === `/api/intents/${intent.id}`) return json(intentRecord);
    if (path === `/api/intents/${intent.id}/approve`) {
      if (unauthorizedApproval) {
        loggedIn = false;
        return json({ error: { code: 'unauthenticated', message: 'Login required' } }, 401);
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
    if (path === '/api/operations') return json({ items: [operation] });
    if (path === `/api/operations/${operation.id}`) return json(operation);
    if (path === '/api/reviews')
      return json(
        {
          error: { code: 'not_implemented', message: 'review.listForUser is not implemented yet' },
        },
        501,
      );
    if (path === '/api/keys' && method === 'GET') return json({ items: keyRecords });
    if (path === '/api/keys' && method === 'POST') {
      keyRecords = [key];
      return json({ apiKey: key, key: 'synthetic-test-secret' });
    }
    if (path === `/api/keys/${key.id}` && method === 'DELETE') {
      keyRecords = [{ ...key, revokedAt: '2026-10-19T19:00:00Z' }];
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
describe('dashboard user flows with gateway contract responses', () => {
  it('offers the real Google endpoint without demo login', async () => {
    loggedIn = false;
    await open('/');
    const link = await screen.findByRole('link', { name: 'Continue with Google' });
    expect(link.getAttribute('href')).toBe('/auth/google/login');
    expect(screen.queryByRole('button', { name: 'Sign in to demo' })).toBeNull();
  });
  it('approves the immutable intent and refreshes the active task', async () => {
    await open(`/mandates/${intent.id}`);
    await userEvent.click(await screen.findByRole('button', { name: 'Approve task' }));
    await screen.findByRole('button', { name: 'Stop task' });
    expect(requests).toContainEqual({ path: `/api/intents/${intent.id}/approve`, method: 'POST' });
    expect(screen.queryByRole('button', { name: 'Approve task' })).toBeNull();
  });
  it('surfaces a conflicting approval instead of reporting success', async () => {
    failApproval = true;
    await open(`/mandates/${intent.id}`);
    await userEvent.click(await screen.findByRole('button', { name: 'Approve task' }));
    await screen.findByText('Close the active task first');
    expect(screen.getByRole('button', { name: 'Approve task' })).toBeTruthy();
  });
  it('rejects an intent and closes a confirmed active task', async () => {
    await open(`/mandates/${intent.id}`);
    await userEvent.click(await screen.findByRole('button', { name: 'Reject intent' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Reject intent' })).toBeNull());
    intentRecord = { ...intentRecord, status: 'approved', taskId: task.id };
    taskRecords = [task];
    await queryClient.invalidateQueries();
    await userEvent.click(await screen.findByRole('button', { name: 'Stop task' }));
    await userEvent.click(screen.getByRole('button', { name: 'Stop task', hidden: false }));
    await waitFor(() =>
      expect(requests).toContainEqual({ path: `/api/tasks/${task.id}/close`, method: 'POST' }),
    );
  });
  it('creates a key once, hides its secret, and revokes it through confirmation', async () => {
    await open('/connect');
    await userEvent.type(await screen.findByLabelText('Agent name'), 'Research assistant');
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
    await userEvent.click(screen.getByRole('button', { name: "I've stored it — hide" }));
    expect(screen.queryByText('synthetic-test-secret')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Revoke' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Revoke key' }));
    await screen.findByLabelText('Agent name');
  });
  it('clears owner data immediately when an approval mutation loses its session', async () => {
    unauthorizedApproval = true;
    await open(`/mandates/${intent.id}`);
    await userEvent.click(await screen.findByRole('button', { name: 'Approve task' }));
    await screen.findByRole('link', { name: 'Continue with Google' });
    expect(queryClient.getQueryData(['intents', intent.id])).toBeUndefined();
    expect(screen.queryByRole('navigation', { name: 'Primary' })).toBeNull();
  });
  it('clears owner caches when the session expires while a public page is open', async () => {
    await open('/overview');
    await screen.findByRole('heading', { name: 'Overview' });
    await act(async () => {
      await router.navigate({ to: '/faq' });
    });
    await screen.findByRole('heading', { name: 'Frequently asked questions' });
    loggedIn = false;
    await act(async () => {
      await queryClient.invalidateQueries({ queryKey: ['me'] });
    });
    await screen.findByRole('link', { name: 'Continue with Google' });
    expect(queryClient.getQueryData(['operations'])).toBeUndefined();
  });
  it('keeps dashboard navigation on FAQ and Contact for signed-in users', async () => {
    await open('/overview');
    await userEvent.click(await screen.findByRole('link', { name: 'FAQ' }));
    await screen.findByRole('heading', { name: 'Frequently asked questions' });
    expect(screen.getByRole('navigation', { name: 'Primary' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Sign in' })).toBeNull();
    await userEvent.click(screen.getByRole('link', { name: 'Contact' }));
    await screen.findByRole('heading', { name: 'Contact' });
    expect(screen.getByRole('navigation', { name: 'Primary' })).toBeTruthy();
  });
  it('allows anonymous visitors to read FAQ and Contact without dashboard access', async () => {
    loggedIn = false;
    await open('/faq');
    await screen.findByRole('heading', { name: 'Frequently asked questions' });
    expect(screen.queryByRole('navigation', { name: 'Primary' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Sign in' })).toBeTruthy();
    await userEvent.click(screen.getByRole('link', { name: 'Contact' }));
    await screen.findByRole('heading', { name: 'Contact' });
    expect(screen.getByRole('link', { name: 'Sign in' })).toBeTruthy();
  });
  it('provides an actionable next step and treats unavailable reviews as service status', async () => {
    intentRecord = { ...intentRecord, status: 'rejected' };
    await open('/overview');
    const connect = await screen.findByRole('link', { name: 'Connect agent' });
    const notice = await screen.findByText('Purchase reviews are unavailable');
    expect(notice.closest('[role="status"]')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
    await userEvent.click(connect);
    await screen.findByLabelText('Agent name');
  });
  it('filters unknown outcomes as pending and flags unimplemented reviews', async () => {
    await open('/activity?filter=pending_payment');
    await screen.findByRole('heading', { name: 'Activity' });
    await screen.findAllByText('Outcome unknown · counts as spent');
    await userEvent.selectOptions(screen.getByLabelText('View'), 'needs_review');
    await screen.findByText('Purchase reviews are unavailable');
    expect(screen.queryByText('synthetic-test-secret')).toBeNull();
  });
  it('shows task limits in a table and filters by status and intent', async () => {
    keyRecords = [key];
    await open('/mandates');
    await screen.findByRole('link', { name: 'View task' });
    expect(screen.getByRole('columnheader', { name: 'Expires' })).toBeTruthy();
    await userEvent.selectOptions(screen.getByLabelText('Status'), 'active');
    await screen.findByText('No tasks match your filters');
    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search intents' }), 'pricing');
    await userEvent.click(screen.getByRole('link', { name: 'View task' }));
    await screen.findByRole('button', { name: 'Approve task' });
  });
  it('routes extra keys to the plans preview without replacing an active key', async () => {
    keyRecords = [key];
    await open('/connect');
    await userEvent.click(await screen.findByRole('link', { name: 'Add API key' }));
    await screen.findByRole('heading', { name: 'Plan & usage' });
    expect(screen.getByText('1 of 1 active API key in use')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Go · Coming soon' })).toHaveProperty(
      'disabled',
      true,
    );
    expect(requests.some((r) => r.path === '/api/keys' && r.method === 'POST')).toBe(false);
    await userEvent.click(screen.getByRole('link', { name: 'Wallets' }));
    await screen.findByRole('cell', { name: /Hackathon wallet/ });
    expect(screen.getByRole('columnheader', { name: 'Assigned allowance' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Import wallet · Coming soon' })).toHaveProperty(
      'disabled',
      true,
    );
  });
  it('combines activity filters and clears them without mixing decision and service', async () => {
    await open('/activity');
    await screen.findAllByText('Outcome unknown · counts as spent');
    await userEvent.selectOptions(screen.getByLabelText('Decision'), 'BLOCK');
    await screen.findByText('No activity matches your filters');
    await userEvent.click(screen.getByRole('link', { name: 'Clear filters' }));
    await screen.findAllByText('Outcome unknown · counts as spent');
    await userEvent.type(
      screen.getByRole('searchbox', { name: 'Search activity' }),
      'not-a-service',
    );
    await screen.findByText('No activity matches your filters');
    expect(screen.queryByText('synthetic-test-secret')).toBeNull();
  });
  it('clears private screens after logout and after a session expires', async () => {
    await open('/overview');
    await screen.findByRole('heading', { name: 'Overview' });
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    await screen.findByRole('link', { name: 'Continue with Google' });
    expect(screen.queryByRole('heading', { name: 'Overview' })).toBeNull();
    loggedIn = true;
    await router.navigate({ to: '/overview' });
    await queryClient.invalidateQueries();
    await screen.findByRole('heading', { name: 'Overview' });
    loggedIn = false;
    await queryClient.invalidateQueries();
    await screen.findByRole('link', { name: 'Continue with Google' });
    expect(screen.queryByRole('navigation', { name: 'Primary' })).toBeNull();
  });
});
