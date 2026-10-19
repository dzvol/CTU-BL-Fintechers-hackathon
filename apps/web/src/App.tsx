import type { Intent, Me, Task } from '@semanticauth/contracts';
import { useCallback, useEffect, useState } from 'react';
import { fetchMe, LOGIN_URL, logout } from './api/auth';
import { approveIntent, fetchPendingIntent, rejectIntent } from './api/intents';
import { createApiKey } from './api/keys';
import { closeTask, fetchActiveTask } from './api/tasks';

export function App() {
  // undefined = still loading, null = logged out
  const [me, setMe] = useState<Me | null>();
  const [newKey, setNewKey] = useState<string>();
  const [intent, setIntent] = useState<Intent>();
  const [task, setTask] = useState<Task>();
  const [error, setError] = useState<string>();

  const refresh = useCallback(() => {
    Promise.all([fetchPendingIntent(), fetchActiveTask()]).then(
      ([pendingIntent, activeTask]) => {
        setIntent(pendingIntent);
        setTask(activeTask);
      },
      (err: Error) => setError(err.message),
    );
  }, []);

  useEffect(() => {
    fetchMe().then(setMe, () => setMe(null));
  }, []);

  useEffect(() => {
    if (me) refresh();
  }, [me, refresh]);

  if (me === undefined) return null;
  if (me === null) return <a href={LOGIN_URL}>Sign in with Google</a>;

  /** Runs an action, shows its error if any, then reloads intent and task. */
  const act = (action: () => Promise<unknown>) => () => {
    setError(undefined);
    action().then(refresh, (err: Error) => setError(err.message));
  };

  return (
    <div>
      <p>{me.email}</p>
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
          <button onClick={act(() => approveIntent(intent.id))}>Approve intent</button>
          <button onClick={act(() => rejectIntent(intent.id))}>Reject intent</button>
        </div>
      )}

      {task && (
        <div>
          <pre>{JSON.stringify(task, null, 2)}</pre>
          <button onClick={act(() => closeTask(task.id))}>Close task</button>
        </div>
      )}

      {error && <p>{error}</p>}
      <button onClick={() => logout().then(() => setMe(null))}>Logout</button>
    </div>
  );
}
