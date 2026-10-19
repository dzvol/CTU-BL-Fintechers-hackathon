import { newId, type Me, type UserId } from '@semanticauth/contracts';
import type { GoogleIdentity } from '../../adapters/google-oauth/google-oauth-client';
import type { AllocationRepository, Transaction, UserRepository } from '../../adapters/store';

export interface AccountService {
  /** Finds or creates the user; the first login also assigns the sponsored allocation. */
  loginWithGoogle(identity: GoogleIdentity): UserId;
  getProfile(userId: UserId): Me | undefined;
}

export function createAccountService(deps: {
  users: UserRepository;
  allocations: AllocationRepository;
  transaction: Transaction;
  defaultAllocation: bigint;
  now?: () => Date;
}): AccountService {
  const now = deps.now ?? (() => new Date());

  return {
    loginWithGoogle(identity) {
      const timestamp = now().toISOString();
      const profile = {
        email: identity.email,
        name: identity.name ?? null,
        picture: identity.picture ?? null,
        lastLoginAt: timestamp,
      };

      return deps.transaction(() => {
        const existing = deps.users.findByGoogleSub(identity.googleSub);
        if (existing) {
          deps.users.updateProfile(existing.id, profile);
          return existing.id;
        }
        const id = newId('usr');
        deps.users.insert({ id, googleSub: identity.googleSub, createdAt: timestamp, ...profile });
        deps.allocations.insert(id, deps.defaultAllocation, timestamp);
        return id;
      });
    },

    getProfile(userId) {
      const user = deps.users.findById(userId);
      if (!user) return undefined;
      return {
        id: user.id,
        email: user.email,
        name: user.name ?? undefined,
        picture: user.picture ?? undefined,
        allocation: (deps.allocations.findAmount(userId) ?? 0n).toString(),
      };
    },
  };
}
