import { TaskIdSchema, type ListResponse, type Task } from '@semanticauth/contracts';
import { Hono } from 'hono';
import type { UserEnv } from '../../auth/request-context';
import type { TaskService } from '../../services/task/task-service';
import { parse } from '../validate';

/** /api/tasks */
export function createTasksRoutes(tasks: TaskService) {
  return new Hono<UserEnv>()
    .get('/', (c) => c.json<ListResponse<Task>>({ items: tasks.listForUser(c.var.auth.userId) }))
    .get('/:id', (c) =>
      c.json(tasks.getForUser(c.var.auth.userId, parse(TaskIdSchema, c.req.param('id')))),
    )
    .post('/:id/close', (c) =>
      c.json(tasks.close(c.var.auth.userId, parse(TaskIdSchema, c.req.param('id')))),
    );
}
