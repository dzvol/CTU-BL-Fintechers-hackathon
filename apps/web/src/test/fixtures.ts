import type { ApiKey, Intent, Me, Operation, Review, Task } from '@semanticauth/contracts';
const uuid = '11111111-1111-4111-8111-111111111111';
export const user: Me = {
  id: `usr_${uuid}`,
  email: 'owner@example.test',
  name: 'Local owner',
  allocation: '2000000',
  balance: { spent: '500000', reserved: '0', remaining: '1500000' },
};
export const key: ApiKey = {
  id: `key_${uuid}`,
  name: 'Research assistant',
  prefix: 'sa_example',
  createdAt: '2026-10-19T12:00:00Z',
};
export const intent: Intent = {
  id: `int_${uuid}`,
  userId: user.id,
  apiKeyId: key.id,
  status: 'pending_approval',
  purpose: 'Research API pricing',
  task: 'Compare API pricing for the project.',
  allowedPurchases: ['API data'],
  forbidden: ['Subscriptions'],
  budget: '1500000',
  maxPerPurchase: '100000',
  plannedPurchases: 3,
  createdAt: '2026-10-19T12:00:00Z',
  expiresAt: '2099-10-20T12:00:00Z',
};
export const task: Task = {
  id: `task_${uuid}`,
  intentId: intent.id,
  userId: user.id,
  apiKeyId: key.id,
  status: 'active',
  budget: intent.budget,
  spent: '0',
  reserved: '0',
  createdAt: intent.createdAt,
  expiresAt: intent.expiresAt,
};
export const operation: Operation = {
  id: `op_${uuid}`,
  taskId: task.id,
  url: 'https://merchant.example.test/data',
  state: 'unknown',
  verdict: 'ALLOW',
  offer: {
    scheme: 'exact',
    network: 'base-sepolia',
    asset: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
    payTo: '0x1111111111111111111111111111111111111111',
    amount: '100001',
    resourceUrl: 'https://merchant.example.test/data',
  },
  createdAt: intent.createdAt,
  updatedAt: intent.createdAt,
  message: 'Outcome unknown; do not retry.',
};
export const review: Review = {
  id: `rev_${uuid}`,
  operationId: operation.id,
  status: 'pending',
  reason: 'recipient_change',
  offer: operation.offer!,
  url: operation.url,
  detail: 'Pays a different address than before.',
  createdAt: intent.createdAt,
  expiresAt: intent.expiresAt,
};
