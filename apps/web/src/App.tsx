import type { Me } from '@semanticauth/contracts';
import { useEffect, useState } from 'react';
import { fetchMe, LOGIN_URL, logout } from './api/auth';

export function App() {
  // undefined = still loading, null = logged out
  const [me, setMe] = useState<Me | null>();

  useEffect(() => {
    fetchMe().then(setMe, () => setMe(null));
  }, []);

  if (me === undefined) return null;
  if (me === null) return <a href={LOGIN_URL}>Sign in with Google</a>;

  return (
    <div>
      <p>{me.email}</p>
      <button onClick={() => logout().then(() => setMe(null))}>Logout</button>
    </div>
  );
}
