import type { Me } from '@semanticauth/contracts';
import { useEffect, useState } from 'react';
import { fetchMe, LOGIN_URL, logout } from './api/auth';
import { createApiKey } from './api/keys';

export function App() {
  // undefined = still loading, null = logged out
  const [me, setMe] = useState<Me | null>();
  const [newKey, setNewKey] = useState<string>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    fetchMe().then(setMe, () => setMe(null));
  }, []);

  if (me === undefined) return null;
  if (me === null) return <a href={LOGIN_URL}>Sign in with Google</a>;

  const onCreateKey = () => {
    setError(undefined);
    createApiKey(`key ${new Date().toISOString()}`).then(
      ({ key }) => setNewKey(key),
      (err: Error) => setError(err.message),
    );
  };

  return (
    <div>
      <p>{me.email}</p>
      <button onClick={onCreateKey}>Create API key</button>
      {newKey && <pre>{newKey}</pre>}
      {error && <p>{error}</p>}
      <button onClick={() => logout().then(() => setMe(null))}>Logout</button>
    </div>
  );
}
