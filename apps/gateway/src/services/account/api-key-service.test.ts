import { describe, expect, it } from 'vitest';
import { createStore, openDatabase } from '../../adapters/store';
import { createAccountService } from './account-service';
import { createApiKeyService } from './api-key-service';

function setup() {
  const store = createStore(openDatabase(':memory:'));
  const accounts = createAccountService({
    users: store.users,
    allocations: store.allocations,
    transaction: store.transaction,
    defaultAllocation: 0n,
  });
  const apiKeys = createApiKeyService({ apiKeys: store.apiKeys, transaction: store.transaction });
  const alice = accounts.loginWithGoogle({ googleSub: 'alice', email: 'alice@example.com' });
  const bob = accounts.loginWithGoogle({ googleSub: 'bob', email: 'bob@example.com' });
  return { apiKeys, alice, bob };
}

describe('ApiKeyService', () => {
  it('returns the key once and authenticates it to its owner', () => {
    const { apiKeys, alice } = setup();
    const { key, apiKey } = apiKeys.create(alice, 'laptop');

    expect(key).toMatch(/^sa_[\w-]{43}$/);
    expect(key.startsWith(apiKey.prefix)).toBe(true);
    expect(apiKeys.list(alice)).toEqual([apiKey]);
    expect(JSON.stringify(apiKeys.list(alice))).not.toContain(key);
    expect(apiKeys.authenticate(key)).toEqual({ userId: alice, apiKeyId: apiKey.id });
  });

  it('rejects unknown and revoked keys', () => {
    const { apiKeys, alice } = setup();
    const { key, apiKey } = apiKeys.create(alice, 'laptop');

    expect(apiKeys.authenticate('sa_unknown')).toBeUndefined();
    expect(apiKeys.authenticate('not-even-a-key')).toBeUndefined();

    expect(apiKeys.revoke(alice, apiKey.id).revokedAt).toBeDefined();
    expect(apiKeys.authenticate(key)).toBeUndefined();
  });

  it("refuses to revoke another user's key and unknown keys", () => {
    const { apiKeys, alice, bob } = setup();
    const { apiKey } = apiKeys.create(alice, 'laptop');

    expect(() => apiKeys.revoke(bob, apiKey.id)).toThrow(expect.objectContaining({ status: 403 }));
    expect(() => apiKeys.revoke(alice, 'key_00000000-0000-0000-0000-000000000000')).toThrow(
      expect.objectContaining({ status: 404 }),
    );
  });

  it('keeps one active key per user: a new key revokes the old one', () => {
    const { apiKeys, alice, bob } = setup();
    const old = apiKeys.create(alice, 'old');
    const bobs = apiKeys.create(bob, 'bob');
    const fresh = apiKeys.create(alice, 'new');

    expect(apiKeys.authenticate(old.key)).toBeUndefined();
    expect(apiKeys.authenticate(fresh.key)).toMatchObject({ apiKeyId: fresh.apiKey.id });
    expect(apiKeys.authenticate(bobs.key)).toMatchObject({ userId: bob });
    expect(apiKeys.list(alice).filter((k) => !k.revokedAt)).toHaveLength(1);
  });
});
