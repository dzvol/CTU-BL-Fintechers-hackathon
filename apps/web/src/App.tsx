import {
  formatUsdc,
  type Intent,
  type Me,
  type Passkey,
  type PasskeyProof,
  type Review,
  type StepUpAction,
  type Task,
} from '@semanticauth/contracts';
import { useCallback, useEffect, useState } from 'react';
import { fetchMe, LOGIN_URL, logout } from './api/auth';
import { approveIntent, fetchPendingIntent, rejectIntent } from './api/intents';
import { createApiKey } from './api/keys';
import { fetchPasskeys, requestStepUp } from './api/passkeys';
import { approveReview, fetchPendingReviews, rejectReview } from './api/reviews';
import { closeTask, fetchActiveTask } from './api/tasks';
import {
  PasskeyConfirm,
  passkeyErrorMessage,
  type PendingConfirmation,
} from './components/passkey-confirm';
import { PasskeySettings } from './components/passkey-settings';

export function App() {
  // undefined = still loading, null = logged out
  const [me, setMe] = useState<Me | null>();
  const [newKey, setNewKey] = useState<string>();
  const [intent, setIntent] = useState<Intent>();
  const [task, setTask] = useState<Task>();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [passkeys, setPasskeys] = useState<Passkey[]>([]);
  const [confirming, setConfirming] = useState<PendingConfirmation>();
  const [error, setError] = useState<string>();

  const refresh = useCallback(() => {
    Promise.all([
      fetchMe(),
      fetchPendingIntent(),
      fetchActiveTask(),
      fetchPendingReviews(),
      fetchPasskeys(),
    ]).then(
      ([profile, pendingIntent, activeTask, pendingReviews, userPasskeys]) => {
        setMe(profile);
        setIntent(pendingIntent);
        setTask(activeTask);
        setReviews(pendingReviews);
        setPasskeys(userPasskeys);
      },
      (err: Error) => setError(err.message),
    );
  }, []);

  useEffect(() => {
    fetchMe().then(setMe, () => setMe(null));
  }, []);

  // Once per login; `refresh` itself replaces `me` with the current balance.
  const signedIn = Boolean(me);
  useEffect(() => {
    if (signedIn) refresh();
  }, [signedIn, refresh]);

  if (me === undefined) return null;
  if (me === null) return <a href={LOGIN_URL}>Sign in with Google</a>;

  /** Runs an action, shows its error if any, then reloads balance, intent, task and reviews. */
  const act = (action: () => Promise<unknown>) => () => {
    setError(undefined);
    action().then(refresh, (err: unknown) => setError(passkeyErrorMessage(err)));
  };

  /**
   * Approve with a passkey: fetch a challenge bound to this approval and show what it confirms;
   * the passkey prompt opens on the next click. Without a passkey the gateway decides whether a
   * plain approve is still allowed.
   */
  const approve = (action: StepUpAction, run: (proof?: PasskeyProof) => Promise<unknown>) =>
    passkeys.length === 0
      ? act(() => run())
      : act(async () => setConfirming({ challenge: await requestStepUp(action), run }));

  return (
    <div>
      <p>{me.email}</p>
      {me.balance && (
        <p>
          Remaining: {formatUsdc(me.balance.remaining)} of {formatUsdc(me.allocation)} USDC
          {me.balance.remaining === '0' && ' (used up: API keys no longer work)'}
        </p>
      )}
      <button
        onClick={act(() =>
          createApiKey(`key ${new Date().toISOString()}`).then(({ key }) => setNewKey(key)),
        )}
      >
        Create API key
      </button>
      {newKey && <pre>{newKey}</pre>}

      <button onClick={act(async () => {})}>Refresh</button>

      {intent && (
        <div>
          <pre>{JSON.stringify(intent, null, 2)}</pre>
          <button
            onClick={approve({ type: 'approve_intent', intentId: intent.id }, (proof) =>
              approveIntent(intent.id, proof),
            )}
          >
            Approve intent
          </button>
          <button onClick={act(() => rejectIntent(intent.id))}>Reject intent</button>
        </div>
      )}

      {task && (
        <div>
          <pre>{JSON.stringify(task, null, 2)}</pre>
          <button onClick={act(() => closeTask(task.id))}>Close task</button>
        </div>
      )}

      {reviews.map((review) => (
        <div key={review.id}>
          <pre>{JSON.stringify(review, null, 2)}</pre>
          <button
            onClick={approve({ type: 'approve_review', reviewId: review.id }, (proof) =>
              approveReview(review.id, proof),
            )}
          >
            Approve purchase
          </button>
          <button onClick={act(() => rejectReview(review.id))}>Reject purchase</button>
        </div>
      ))}

      {confirming && (
        <PasskeyConfirm
          pending={confirming}
          onDone={(message) => {
            setConfirming(undefined);
            setError(message);
            refresh();
          }}
          onCancel={() => setConfirming(undefined)}
        />
      )}

      {error && <p role="alert">{error}</p>}

      <PasskeySettings passkeys={passkeys} onChanged={refresh} />

      <button onClick={() => logout().then(() => setMe(null))}>Logout</button>
    </div>
  );
}
