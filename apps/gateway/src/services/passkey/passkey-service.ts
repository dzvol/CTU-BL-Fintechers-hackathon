import { randomBytes } from 'node:crypto';
import {
  newId,
  type ChallengeId,
  type Passkey,
  type PasskeyId,
  type PasskeyProof,
  type PasskeyRegistrationInput,
  type PasskeyRegistrationOptions,
  type StepUpAction,
  type StepUpChallenge,
  type StepUpSummary,
  type UserId,
} from '@semanticauth/contracts';
import { z } from 'zod';
import type {
  ChallengeRepository,
  IntentRepository,
  OperationRepository,
  PasskeyRecord,
  PasskeyRepository,
  ReviewRepository,
  Transaction,
  UserRepository,
} from '../../adapters/store';
import type { StoredCredential, WebAuthnVerifier } from '../../adapters/webauthn/webauthn-verifier';
import { canonicalJson, deriveChallenge, type StepUpFacts } from '../../domain/step-up/step-up';
import type { UserContext } from '../context';
import { ConflictError, ForbiddenError, NotFoundError, UnauthorizedError } from '../errors';

/** How long a step-up challenge (Approve → Touch ID) stays valid. */
export const STEP_UP_TTL_MS = 2 * 60 * 1000;
/** How long the user has to finish registering a passkey. */
export const REGISTRATION_TTL_MS = 5 * 60 * 1000;
/** The first passkey needs a Google login at most this old, so a stolen session can't add one. */
export const FRESH_LOGIN_MS = 10 * 60 * 1000;

export interface PasskeyService {
  list(userId: UserId): Passkey[];
  /** Approvals need a passkey when the gateway requires it for everyone or the user has one. */
  isRequired(userId: UserId): boolean;
  /** A one-time challenge bound to `action`, plus what the dashboard shows the user. */
  createStepUp(userId: UserId, action: StepUpAction): Promise<StepUpChallenge>;
  /**
   * The first passkey needs a fresh Google login; any further one needs a proof from an
   * existing passkey.
   */
  startRegistration(user: UserContext, proof?: PasskeyProof): Promise<PasskeyRegistrationOptions>;
  finishRegistration(userId: UserId, input: PasskeyRegistrationInput): Promise<Passkey>;
  remove(userId: UserId, passkeyId: PasskeyId, proof: PasskeyProof): Promise<void>;
  /**
   * Verifies `proof` for `action`, then runs `run` in one transaction with the challenge consumed
   * and the passkey's counter updated. Without a proof `run` gets null, which is allowed only
   * while passkeys aren't required for this user. Anything wrong throws; `run` never runs then.
   */
  confirm<T>(
    userId: UserId,
    action: StepUpAction,
    proof: PasskeyProof | undefined,
    run: (passkeyId: PasskeyId | null) => T,
  ): Promise<T>;
}

interface VerifiedProof {
  challengeId: ChallengeId;
  action: string;
  passkeyId: PasskeyId;
  expectedCounter: number;
  newCounter: number;
}

// Only to find the passkey; the verifier checks the rest of the assertion.
const AssertionIdSchema = z.looseObject({ id: z.string().min(1) });

const toPasskey = (record: PasskeyRecord): Passkey => ({
  id: record.id,
  name: record.name,
  createdAt: record.createdAt,
  lastUsedAt: record.lastUsedAt ?? undefined,
});

const toCredential = (record: PasskeyRecord): StoredCredential => ({
  id: record.credentialId,
  publicKey: record.publicKey,
  counter: record.counter,
  transports: record.transports,
});

const randomToken = () => randomBytes(32).toString('base64url');

export function createPasskeyService(deps: {
  passkeys: PasskeyRepository;
  challenges: ChallengeRepository;
  users: UserRepository;
  intents: IntentRepository;
  reviews: ReviewRepository;
  operations: OperationRepository;
  verifier: WebAuthnVerifier;
  transaction: Transaction;
  /** PASSKEY_REQUIRED: every approval needs a passkey, even for users without one. */
  required: boolean;
  now?: () => Date;
}): PasskeyService {
  const now = deps.now ?? (() => new Date());
  const later = (ms: number) => new Date(now().getTime() + ms).toISOString();

  /** What the action confirms, from the gateway's own records; never from the request. */
  function load(
    userId: UserId,
    action: StepUpAction,
  ): { facts: StepUpFacts; summary: StepUpSummary } {
    switch (action.type) {
      case 'approve_intent': {
        const intent = deps.intents.findById(action.intentId);
        if (!intent) throw new NotFoundError('Intent');
        if (intent.userId !== userId) throw new ForbiddenError('Intent');
        if (intent.status !== 'pending_approval') {
          throw new ConflictError('intent_not_pending', `Intent is already ${intent.status}`);
        }
        const shown = {
          purpose: intent.purpose,
          budget: intent.budget.toString(),
          maxPerPurchase: intent.maxPerPurchase.toString(),
          plannedPurchases: intent.plannedPurchases,
        };
        return {
          facts: { type: action.type, intentId: intent.id, ...shown },
          summary: { type: action.type, ...shown },
        };
      }
      case 'approve_review': {
        const review = deps.reviews.findById(action.reviewId);
        if (!review) throw new NotFoundError('Review');
        if (review.userId !== userId) throw new ForbiddenError('Review');
        if (review.status !== 'pending') {
          throw new ConflictError('review_not_pending', `Review is already ${review.status}`);
        }
        const url = deps.operations.findById(review.operationId)?.url ?? review.offer.resourceUrl;
        const { amount, asset, network, payTo } = review.offer;
        return {
          facts: {
            type: action.type,
            reviewId: review.id,
            operationId: review.operationId,
            url,
            amount,
            asset,
            network,
            payTo,
          },
          summary: { type: action.type, url, amount, payTo, reason: review.reason },
        };
      }
      case 'add_passkey':
        return { facts: { type: action.type, userId }, summary: { type: action.type } };
      case 'remove_passkey': {
        const passkey = deps.passkeys.findById(action.passkeyId);
        if (!passkey) throw new NotFoundError('Passkey');
        if (passkey.userId !== userId) throw new ForbiddenError('Passkey');
        return {
          facts: { type: action.type, passkeyId: passkey.id },
          summary: { type: action.type, name: passkey.name },
        };
      }
    }
  }

  /** Checks the proof without writing anything but a burned challenge on failure. */
  async function verify(
    userId: UserId,
    action: StepUpAction,
    proof: PasskeyProof,
  ): Promise<VerifiedProof> {
    const record = deps.challenges.findById(proof.challengeId);
    if (!record || record.userId !== userId || record.purpose !== 'step_up') {
      throw new UnauthorizedError('passkey_invalid', 'Unknown passkey confirmation');
    }
    if (record.usedAt) {
      throw new UnauthorizedError('challenge_used', 'This passkey confirmation was already used');
    }
    try {
      if (record.expiresAt <= now().toISOString()) {
        throw new UnauthorizedError('challenge_expired', 'The passkey confirmation expired');
      }
      const actionJson = canonicalJson(load(userId, action).facts);
      if (actionJson !== record.action) {
        throw new ConflictError(
          'approval_target_changed',
          'This passkey confirmation was made for something else; start again',
        );
      }
      const assertion = AssertionIdSchema.safeParse(proof.assertion);
      const passkey = assertion.success
        ? deps.passkeys.findByCredentialId(assertion.data.id)
        : undefined;
      if (!passkey || passkey.userId !== userId) {
        throw new UnauthorizedError('passkey_invalid', 'Unknown passkey');
      }
      const verified = await deps.verifier.verifyAuthentication({
        response: proof.assertion,
        expectedChallenge: record.challenge,
        credential: toCredential(passkey),
      });
      if (!verified) {
        throw new UnauthorizedError('passkey_invalid', 'The passkey confirmation is not valid');
      }
      return {
        challengeId: record.id,
        action: actionJson,
        passkeyId: passkey.id,
        expectedCounter: passkey.counter,
        newCounter: verified.newCounter,
      };
    } catch (err) {
      // A failed attempt uses up the challenge, so it can't be retried or brute-forced.
      deps.challenges.consume(record.id, now().toISOString());
      throw err;
    }
  }

  /** Call inside the transaction of the confirmed action. */
  function consume(userId: UserId, action: StepUpAction, proof: VerifiedProof): PasskeyId {
    const at = now().toISOString();
    if (!deps.challenges.consume(proof.challengeId, at)) {
      throw new UnauthorizedError('challenge_used', 'This passkey confirmation was already used');
    }
    // The target may have changed while the signature was being checked.
    if (canonicalJson(load(userId, action).facts) !== proof.action) {
      throw new ConflictError(
        'approval_target_changed',
        'This passkey confirmation was made for something else; start again',
      );
    }
    if (!deps.passkeys.recordUse(proof.passkeyId, proof.expectedCounter, proof.newCounter, at)) {
      throw new UnauthorizedError('passkey_invalid', 'The passkey was used at the same time');
    }
    return proof.passkeyId;
  }

  const isRequired = (userId: UserId) => deps.required || deps.passkeys.countByUser(userId) > 0;

  return {
    list: (userId) => deps.passkeys.listByUser(userId).map(toPasskey),

    isRequired,

    async createStepUp(userId, action) {
      const passkeys = deps.passkeys.listByUser(userId);
      if (passkeys.length === 0) {
        throw new UnauthorizedError('passkey_not_registered', 'Set up a passkey first');
      }
      const { facts, summary } = load(userId, action);
      const actionJson = canonicalJson(facts);
      const challenge = deriveChallenge(randomToken(), actionJson);
      const id = newId('chl');
      const expiresAt = later(STEP_UP_TTL_MS);
      deps.challenges.insert({
        id,
        userId,
        purpose: 'step_up',
        action: actionJson,
        challenge,
        createdAt: now().toISOString(),
        expiresAt,
        usedAt: null,
      });
      const options = await deps.verifier.authenticationOptions({
        challenge,
        allow: passkeys.map((p) => ({ id: p.credentialId, transports: p.transports })),
      });
      return { challengeId: id, expiresAt, summary, options };
    },

    async startRegistration({ userId, loggedInAt }, proof) {
      const existing = deps.passkeys.listByUser(userId);
      if (existing.length > 0) {
        if (!proof) {
          throw new UnauthorizedError(
            'passkey_required',
            'Confirm adding a passkey with one you already have',
          );
        }
        const action: StepUpAction = { type: 'add_passkey' };
        const verified = await verify(userId, action, proof);
        deps.transaction(() => consume(userId, action, verified));
      } else if (now().getTime() - Date.parse(loggedInAt) > FRESH_LOGIN_MS) {
        throw new UnauthorizedError(
          'reauth_required',
          'Sign in with Google again to set up your first passkey',
        );
      }

      const user = deps.users.findById(userId);
      if (!user) throw new NotFoundError('User');
      const challenge = randomToken();
      const id = newId('chl');
      deps.challenges.insert({
        id,
        userId,
        purpose: 'registration',
        action: null,
        challenge,
        createdAt: now().toISOString(),
        expiresAt: later(REGISTRATION_TTL_MS),
        usedAt: null,
      });
      const options = await deps.verifier.registrationOptions({
        userHandle: userId,
        userName: user.email,
        challenge,
        exclude: existing.map((p) => ({ id: p.credentialId, transports: p.transports })),
      });
      return { registrationId: id, options };
    },

    async finishRegistration(userId, { registrationId, name, response }) {
      const at = now().toISOString();
      const record = deps.challenges.findById(registrationId);
      if (!record || record.userId !== userId || record.purpose !== 'registration') {
        throw new UnauthorizedError('passkey_invalid', 'Unknown passkey registration');
      }
      if (!deps.challenges.consume(record.id, at)) {
        throw new UnauthorizedError('challenge_used', 'This registration was already used');
      }
      if (record.expiresAt <= at) {
        throw new UnauthorizedError('challenge_expired', 'The registration expired; start again');
      }
      const credential = await deps.verifier.verifyRegistration({
        response,
        expectedChallenge: record.challenge,
      });
      if (!credential) {
        throw new UnauthorizedError('passkey_invalid', 'The passkey could not be verified');
      }
      const passkey: PasskeyRecord = {
        id: newId('pk'),
        userId,
        credentialId: credential.id,
        publicKey: credential.publicKey,
        counter: credential.counter,
        transports: credential.transports,
        name,
        createdAt: now().toISOString(),
        lastUsedAt: null,
      };
      deps.transaction(() => {
        if (deps.passkeys.findByCredentialId(credential.id)) {
          throw new ConflictError('passkey_exists', 'This passkey is already registered');
        }
        deps.passkeys.insert(passkey);
      });
      return toPasskey(passkey);
    },

    async remove(userId, passkeyId, proof) {
      const action: StepUpAction = { type: 'remove_passkey', passkeyId };
      const verified = await verify(userId, action, proof);
      deps.transaction(() => {
        consume(userId, action, verified);
        deps.passkeys.delete(passkeyId);
      });
    },

    async confirm(userId, action, proof, run) {
      if (!proof) {
        if (deps.passkeys.countByUser(userId) > 0) {
          throw new UnauthorizedError('passkey_required', 'Confirm this with your passkey');
        }
        if (isRequired(userId)) {
          throw new UnauthorizedError('passkey_not_registered', 'Set up a passkey first');
        }
        return deps.transaction(() => run(null));
      }
      const verified = await verify(userId, action, proof);
      return deps.transaction(() => run(consume(userId, action, verified)));
    },
  };
}
