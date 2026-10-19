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
let requests: { path: string; method: string }[];
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
beforeEach(async () => {
  loggedIn = true;
  intentRecord = { ...intent };
  taskRecords = [];
  keyRecords = [];
  failApproval = false;
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
    await userEvent.click(screen.getByRole('button', { name: "I've stored it — hide" }));
    expect(screen.queryByText('synthetic-test-secret')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Revoke' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Revoke key' }));
    await screen.findByLabelText('Agent name');
  });
  it('filters unknown outcomes as pending and flags unimplemented reviews', async () => {
    await open('/activity?filter=pending_payment');
    await screen.findByRole('heading', { name: 'Activity' });
    await screen.findAllByText('Outcome unknown · counts as spent');
    await userEvent.click(screen.getByRole('link', { name: /Needs review/ }));
    await screen.findByText('Not supported by the backend yet');
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
