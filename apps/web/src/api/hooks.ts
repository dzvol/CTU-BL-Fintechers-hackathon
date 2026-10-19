import { useQuery } from '@tanstack/react-query';
import { fetchMe } from './auth';
import { fetchIntents, fetchIntent } from './intents';
import { fetchTasks } from './tasks';
import { fetchKeys } from './keys';
import { fetchOperations, fetchOperation } from './operations';
import { fetchReviews } from './reviews';
import { ApiError } from './http';

const retry = (count: number, error: unknown) =>
  count < 2 && !(error instanceof ApiError && [401, 403, 404, 501].includes(error.status));
const polling = { retry, refetchInterval: 3000, refetchOnWindowFocus: true } as const;
export const useMe = () =>
  useQuery({ queryKey: ['me'], queryFn: ({ signal }) => fetchMe(signal), ...polling });
export const useIntents = () =>
  useQuery({ queryKey: ['intents'], queryFn: ({ signal }) => fetchIntents(signal), ...polling });
export const useIntent = (id: string) =>
  useQuery({
    queryKey: ['intents', id],
    queryFn: ({ signal }) => fetchIntent(id, signal),
    ...polling,
  });
export const useTasks = () =>
  useQuery({ queryKey: ['tasks'], queryFn: ({ signal }) => fetchTasks(signal), ...polling });
export const useKeys = () =>
  useQuery({ queryKey: ['keys'], queryFn: ({ signal }) => fetchKeys(signal), retry });
export const useOperations = () =>
  useQuery({
    queryKey: ['operations'],
    queryFn: ({ signal }) => fetchOperations(signal),
    ...polling,
  });
export const useOperation = (id: string) =>
  useQuery({
    queryKey: ['operations', id],
    queryFn: ({ signal }) => fetchOperation(id, signal),
    ...polling,
  });
export const useReviews = () =>
  useQuery({
    queryKey: ['reviews'],
    queryFn: ({ signal }) => fetchReviews(signal),
    ...polling,
    refetchInterval: (query) =>
      query.state.error instanceof ApiError && query.state.error.status === 501 ? false : 3000,
  });
