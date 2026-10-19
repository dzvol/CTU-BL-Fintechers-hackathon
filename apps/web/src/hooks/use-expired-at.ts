import { useEffect, useState } from 'react';

/** Expire an open confirmation even when polling is paused or the response is unchanged. */
export function useExpiredAt(deadline: string, enabled: boolean) {
  const [now, setNow] = useState(Date.now);
  const expires = Date.parse(deadline);
  useEffect(() => {
    if (!enabled || expires <= Date.now()) return;
    const timer = window.setTimeout(
      () => setNow(Date.now()),
      Math.min(expires - Date.now() + 1, 2_147_483_647),
    );
    return () => window.clearTimeout(timer);
  }, [expires, enabled, now]);
  return expires <= Date.now();
}
