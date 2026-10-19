import type { UserId } from '@semanticauth/contracts';
import type { Db } from './db';

export interface AllocationRepository {
  insert(userId: UserId, amount: bigint, createdAt: string): void;
  findAmount(userId: UserId): bigint | undefined;
}

export function createAllocationRepository(db: Db): AllocationRepository {
  const insert = db.prepare(
    'INSERT INTO allocations (user_id, amount, created_at) VALUES (?, ?, ?)',
  );
  const findAmount = db
    .prepare<[string], string>('SELECT amount FROM allocations WHERE user_id = ?')
    .pluck();

  return {
    insert: (userId, amount, createdAt) => void insert.run(userId, amount.toString(), createdAt),
    findAmount: (userId) => {
      const amount = findAmount.get(userId);
      return amount === undefined ? undefined : BigInt(amount);
    },
  };
}
