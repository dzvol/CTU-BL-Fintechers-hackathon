import type { Task } from '@semanticauth/contracts';
import { describe, expect, it, vi } from 'vitest';
import { ConflictError, ForbiddenError, NotFoundError } from '../services/errors';
import type { TaskService } from '../services/task/task-service';
import { createReconciliationWorker } from './reconciliation-worker';

const userId = 'usr_11111111-1111-1111-1111-111111111111';
const task: Task = {
  userId,
  id: 'task_22222222-2222-2222-2222-222222222222',
  intentId: 'int_33333333-3333-3333-3333-333333333333',
  apiKeyId: 'key_44444444-4444-4444-4444-444444444444',
  status: 'closed',
  budget: '1000000',
  spent: '10000',
  reserved: '0',
  createdAt: '2026-10-19T12:00:00.000Z',
  expiresAt: '2026-10-20T12:00:00.000Z',
  closedAt: '2026-10-19T12:05:00.000Z',
};

function setup() {
  const tasks = {
    close: vi.fn<TaskService['close']>().mockReturnValue(task),
    getForUser: vi.fn<TaskService['getForUser']>().mockReturnValue(task),
  };
  return { tasks, worker: createReconciliationWorker({ tasks }) };
}

describe('naive reconciliation', () => {
  it('closes the specific failed task through TaskService and preserves its spent accounting', () => {
    const { worker, tasks } = setup();
    expect(worker.closeFailedTask(userId, task.id)).toEqual(task);
    expect(tasks.close).toHaveBeenCalledExactlyOnceWith(userId, task.id);
    expect(tasks.getForUser).not.toHaveBeenCalled();
  });

  it('treats duplicate failure reports as idempotent without changing closedAt', () => {
    const { worker, tasks } = setup();
    tasks.close.mockImplementation(() => {
      throw new ConflictError('task_not_active', 'Already closed');
    });
    expect(worker.closeFailedTask(userId, task.id)).toEqual(task);
    expect(worker.closeFailedTask(userId, task.id).closedAt).toBe(task.closedAt);
    expect(tasks.getForUser).toHaveBeenCalledWith(userId, task.id);
  });

  it('preserves an already expired task rather than reopening or overwriting it', () => {
    const { worker, tasks } = setup();
    tasks.close.mockImplementation(() => {
      throw new ConflictError('task_not_active', 'Already expired');
    });
    tasks.getForUser.mockReturnValue({ ...task, status: 'expired', closedAt: task.expiresAt });
    expect(worker.closeFailedTask(userId, task.id)).toMatchObject({
      status: 'expired',
      closedAt: task.expiresAt,
    });
  });

  it.each([
    new ForbiddenError('Task'),
    new NotFoundError('Task'),
    new Error('Database unavailable'),
    new ConflictError('another_conflict', 'Different failure'),
  ])('does not swallow ownership, lookup, or infrastructure errors: %#', (error) => {
    const { worker, tasks } = setup();
    tasks.close.mockImplementation(() => {
      throw error;
    });
    expect(() => worker.closeFailedTask(userId, task.id)).toThrow(error);
    expect(tasks.getForUser).not.toHaveBeenCalled();
  });

  it('propagates a close conflict if the task is unexpectedly still active', () => {
    const { worker, tasks } = setup();
    const error = new ConflictError('task_not_active', 'Concurrent state change');
    tasks.close.mockImplementation(() => {
      throw error;
    });
    tasks.getForUser.mockReturnValue({ ...task, status: 'active', closedAt: undefined });
    expect(() => worker.closeFailedTask(userId, task.id)).toThrow(error);
  });
});
