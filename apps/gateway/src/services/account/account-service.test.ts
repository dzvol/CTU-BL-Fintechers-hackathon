import { describe, expect, it } from 'vitest';
import { createStore, openDatabase } from '../../adapters/store';
import { createAccountService } from './account-service';

function setup() {
  const store = createStore(openDatabase(':memory:'));
  const accounts = createAccountService({
    users: store.users,
    allocations: store.allocations,
    transaction: store.transaction,
    defaultAllocation: 2_000_000n,
  });
  return { accounts };
}

describe('AccountService.loginWithGoogle', () => {
  it('creates the user with the default allocation on first login', () => {
    const { accounts } = setup();
    const id = accounts.loginWithGoogle({ googleSub: 'g1', email: 'a@example.com' });

    expect(id).toMatch(/^usr_/);
    expect(accounts.getProfile(id)).toMatchObject({
      email: 'a@example.com',
      allocation: '2000000',
    });
  });

  it('reuses the user on later logins, refreshing the profile without a new allocation', () => {
    const { accounts } = setup();
    const first = accounts.loginWithGoogle({ googleSub: 'g1', email: 'old@example.com' });
    const second = accounts.loginWithGoogle({
      googleSub: 'g1',
      email: 'new@example.com',
      name: 'Alice',
    });

    expect(second).toBe(first);
    expect(accounts.getProfile(first)).toMatchObject({
      email: 'new@example.com',
      name: 'Alice',
      allocation: '2000000',
    });
  });
});
