import type { Passkey, PasskeyRegistrationOptions } from '@semanticauth/contracts';
import { useState } from 'react';
import { LOGIN_URL } from '../api/auth';
import { ApiRequestError } from '../api/http';
import {
  finishPasskeyRegistration,
  removePasskey,
  requestStepUp,
  startPasskeyRegistration,
} from '../api/passkeys';
import { PasskeyConfirm, passkeyErrorMessage, type PendingConfirmation } from './passkey-confirm';

/** Lists the user's passkeys and adds or removes them. Changes go through the passkey prompt. */
export function PasskeySettings({
  passkeys,
  onChanged,
}: {
  passkeys: Passkey[];
  onChanged: () => void;
}) {
  const [registration, setRegistration] = useState<PasskeyRegistrationOptions>();
  const [name, setName] = useState('This device');
  const [pending, setPending] = useState<PendingConfirmation>();
  const [error, setError] = useState<string>();
  const [needsLogin, setNeedsLogin] = useState(false);
  // A second WebAuthn call aborts the first one, so buttons stay disabled while one runs.
  const [busy, setBusy] = useState(false);

  const fail = (err: unknown) => {
    setNeedsLogin(err instanceof ApiRequestError && err.code === 'reauth_required');
    setError(passkeyErrorMessage(err));
  };

  const track = (work: Promise<unknown>) => {
    setBusy(true);
    void work.finally(() => setBusy(false));
  };

  // Step 1: the first passkey needs only a fresh login; another one needs an existing passkey.
  const add = () => {
    setError(undefined);
    if (passkeys.length === 0) {
      track(startPasskeyRegistration().then(setRegistration, fail));
      return;
    }
    track(
      requestStepUp({ type: 'add_passkey' }).then(
        (challenge) =>
          setPending({
            challenge,
            run: async (proof) => setRegistration(await startPasskeyRegistration(proof)),
          }),
        fail,
      ),
    );
  };

  // Step 2: a separate click, so the OS prompt opens directly from a user gesture.
  const create = () => {
    if (!registration || busy) return;
    setError(undefined);
    track(
      finishPasskeyRegistration(registration, name.trim() || 'Passkey').then(() => {
        setRegistration(undefined);
        onChanged();
      }, fail),
    );
  };

  const remove = (passkey: Passkey) => {
    setError(undefined);
    track(
      requestStepUp({ type: 'remove_passkey', passkeyId: passkey.id }).then(
        (challenge) =>
          setPending({
            challenge,
            run: async (proof) => {
              await removePasskey(passkey.id, proof);
              onChanged();
            },
          }),
        fail,
      ),
    );
  };

  return (
    <section aria-label="Passkeys">
      <h2>Passkeys</h2>
      <p>
        {passkeys.length === 0
          ? 'Add a passkey (Touch ID, Face ID, Windows Hello or your phone) to confirm approvals.'
          : 'Approving an intent or a purchase needs one of these passkeys.'}
      </p>
      <ul>
        {passkeys.map((passkey) => (
          <li key={passkey.id}>
            {passkey.name}
            {passkey.lastUsedAt &&
              ` · last used ${new Date(passkey.lastUsedAt).toLocaleString()}`}{' '}
            <button onClick={() => remove(passkey)} disabled={busy}>
              Remove
            </button>
          </li>
        ))}
      </ul>

      {registration ? (
        <div>
          <p>
            <strong>One more step:</strong> click “Create passkey” and confirm with Touch ID (or
            your device's screen lock). The passkey isn't saved until you do.
          </p>
          <label htmlFor="passkey-name">Name for this passkey</label>{' '}
          <input id="passkey-name" value={name} onChange={(e) => setName(e.target.value)} />{' '}
          <button onClick={create} disabled={busy}>
            {busy ? 'Waiting for the passkey prompt…' : 'Create passkey'}
          </button>{' '}
          <button onClick={() => setRegistration(undefined)} disabled={busy}>
            Cancel
          </button>
        </div>
      ) : (
        <button onClick={add} disabled={busy}>
          Add passkey
        </button>
      )}

      {pending && (
        <PasskeyConfirm
          pending={pending}
          onDone={(message) => {
            setPending(undefined);
            setError(message);
          }}
          onCancel={() => setPending(undefined)}
        />
      )}

      {error && (
        <p role="alert">
          {error} {needsLogin && <a href={LOGIN_URL}>Sign in again</a>}
        </p>
      )}
    </section>
  );
}
