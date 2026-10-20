import { formatUsdc, type PasskeyProof, type StepUpChallenge } from '@semanticauth/contracts';
import { useState } from 'react';
import { ApiRequestError } from '../api/http';
import { isPasskeyCancel, signStepUp, webAuthnErrorCode } from '../api/passkeys';

/** A confirmation waiting for the passkey: what the gateway will confirm and what to run then. */
export interface PendingConfirmation {
  challenge: StepUpChallenge;
  run: (proof: PasskeyProof) => Promise<unknown>;
}

/** User-facing text for errors around passkeys. */
export function passkeyErrorMessage(err: unknown): string {
  if (isPasskeyCancel(err)) return 'The passkey prompt was closed. Nothing was confirmed.';
  switch (webAuthnErrorCode(err)) {
    case 'ERROR_CEREMONY_ABORTED':
      return (
        'The passkey prompt was interrupted before it finished. A second click or a password ' +
        'manager extension can do this. Click once more and complete the prompt.'
      );
    case 'ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED':
      return 'This device already has a passkey for your account.';
    case 'ERROR_AUTHENTICATOR_MISSING_USER_VERIFICATION_SUPPORT':
      return "This device can't verify you with Touch ID or a PIN. Try your phone instead.";
    case 'ERROR_INVALID_DOMAIN':
    case 'ERROR_INVALID_RP_ID':
      return 'Passkeys work only at http://localhost:5173. Open the dashboard there.';
  }
  if (err instanceof ApiRequestError) {
    switch (err.code) {
      case 'passkey_not_registered':
        return 'Set up a passkey below before approving.';
      case 'passkey_required':
        return 'Confirm this with your passkey.';
      case 'reauth_required':
        return 'Sign in with Google again to set up your first passkey.';
      case 'challenge_expired':
        return 'The confirmation took too long. Click Approve again.';
      case 'approval_target_changed':
        return 'This changed in the meantime. Review it again before approving.';
    }
  }
  return err instanceof Error ? err.message : String(err);
}

function Summary({ challenge }: { challenge: StepUpChallenge }) {
  const { summary } = challenge;
  switch (summary.type) {
    case 'approve_intent':
      return (
        <dl>
          <dt>Purpose</dt>
          <dd>{summary.purpose}</dd>
          <dt>Total budget</dt>
          <dd>{formatUsdc(summary.budget)} USDC</dd>
          <dt>Max per purchase</dt>
          <dd>{formatUsdc(summary.maxPerPurchase)} USDC</dd>
          <dt>Planned purchases</dt>
          <dd>{summary.plannedPurchases}</dd>
        </dl>
      );
    case 'approve_review':
      return (
        <dl>
          <dt>Pay</dt>
          <dd>{formatUsdc(summary.amount)} USDC</dd>
          <dt>To</dt>
          <dd>
            <code>{summary.payTo}</code>
          </dd>
          <dt>For</dt>
          <dd>{summary.url}</dd>
          <dt>Why you are asked</dt>
          <dd>{summary.reason}</dd>
        </dl>
      );
    case 'add_passkey':
      return <p>Add another passkey to your account.</p>;
    case 'remove_passkey':
      return <p>Remove the passkey “{summary.name}”.</p>;
  }
}

/**
 * Second step of every passkey confirmation. The gateway computed the summary; the passkey signs
 * a challenge bound to exactly that, so check it before confirming.
 */
export function PasskeyConfirm({
  pending,
  onDone,
  onCancel,
}: {
  pending: PendingConfirmation;
  onDone: (error?: string) => void;
  onCancel: () => void;
}) {
  const [busy, setBusy] = useState(false);

  const confirm = () => {
    setBusy(true);
    // signStepUp runs first in the click handler, as Safari requires for WebAuthn.
    signStepUp(pending.challenge)
      .then(pending.run)
      .then(
        () => onDone(),
        (err: unknown) => onDone(passkeyErrorMessage(err)),
      )
      .finally(() => setBusy(false));
  };

  return (
    <section aria-label="Confirm with passkey">
      <h3>Check before you confirm</h3>
      <Summary challenge={pending.challenge} />
      <button onClick={confirm} disabled={busy}>
        Confirm with passkey
      </button>
      <button onClick={onCancel} disabled={busy}>
        Cancel
      </button>
    </section>
  );
}
