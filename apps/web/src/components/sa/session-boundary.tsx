import { useCallback, useEffect, useRef, type ReactNode } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { useMe } from '@/api/hooks';
import { ApiError } from '@/api/http';

/** Keep session cleanup mounted across public routes and lazy owner-page transitions. */
export function SessionBoundary({ children }: { children: ReactNode }) {
  const client = useQueryClient();
  const navigate = useNavigate();
  const me = useMe();
  const authenticated = useRef(false);
  const ending = useRef(false);
  const expire = useCallback(() => {
    if (ending.current) return;
    ending.current = true;
    authenticated.current = false;
    void client
      .cancelQueries()
      .then(async () => {
        client.clear();
        await navigate({ to: '/', search: { expired: true }, replace: true });
      })
      .finally(() => {
        ending.current = false;
      });
  }, [client, navigate]);

  useEffect(() => {
    const unauthorized = (error: unknown) => {
      if (error instanceof ApiError && error.status === 401) expire();
    };
    const stopQueries = client.getQueryCache().subscribe((event) => {
      if (event.type === 'updated' && event.action.type === 'error') {
        unauthorized(event.query.state.error);
      }
    });
    const stopMutations = client.getMutationCache().subscribe((event) => {
      if (event.type === 'updated' && event.action.type === 'error') {
        unauthorized(event.mutation.state.error);
      }
    });
    return () => {
      stopQueries();
      stopMutations();
    };
  }, [client, expire]);

  useEffect(() => {
    if (me.data) authenticated.current = true;
    else if (me.data === null && authenticated.current) expire();
  }, [me.data, expire]);
  return children;
}
