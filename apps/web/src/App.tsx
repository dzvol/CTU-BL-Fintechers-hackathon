import { lazy, Suspense } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createRootRoute,
  createRoute,
  createRouter,
  Link,
  Outlet,
  redirect,
  RouterProvider,
} from '@tanstack/react-router';
import { Loading } from './components/sa/common';
import { OwnerLayout } from './components/sa/owner-layout';
import { SessionBoundary } from './components/sa/session-boundary';
import { Toaster } from './components/ui/sonner';
import { FILTERS, type ActivityFilter } from './lib/filters';
import './styles.css';

const page = <K extends string>(load: () => Promise<Record<K, React.ComponentType>>, name: K) =>
  lazy(() => load().then((m) => ({ default: m[name] })));
const SignIn = page(() => import('./pages/sign-in'), 'SignIn');
const Overview = page(() => import('./pages/overview'), 'Overview');
const Activity = page(() => import('./pages/activity'), 'Activity');
const PurchaseDetail = page(() => import('./pages/purchase-detail'), 'PurchaseDetail');
const Tasks = page(() => import('./pages/tasks'), 'Tasks');
const TaskDetail = page(() => import('./pages/task-detail'), 'TaskDetail');
const Agent = page(() => import('./pages/agent'), 'Agent');
const Contact = page(() => import('./pages/contact'), 'Contact');

function Message({ title, action }: { title: string; action: React.ReactNode }) {
  return (
    <main className="grid min-h-screen place-items-center p-8 text-center">
      <div>
        <h1 className="text-xl font-semibold">{title}</h1>
        <p className="mt-3 text-sm">{action}</p>
      </div>
    </main>
  );
}

const root = createRootRoute({
  component: () => (
    <SessionBoundary>
      <Suspense fallback={<Loading />}>
        <Outlet />
      </Suspense>
    </SessionBoundary>
  ),
  notFoundComponent: () => (
    <Message
      title="Page not found"
      action={
        <Link to="/overview" className="text-primary hover:underline">
          Go to overview
        </Link>
      }
    />
  ),
  errorComponent: () => (
    <Message
      title="This page didn't load"
      action={
        <a href="/overview" className="text-primary hover:underline">
          Reload the dashboard
        </a>
      }
    />
  ),
});
const signIn = createRoute({
  getParentRoute: () => root,
  path: '/',
  component: SignIn,
  validateSearch: (s: Record<string, unknown>): { expired?: boolean } =>
    s.expired === true ? { expired: true } : {},
});
const owner = createRoute({ getParentRoute: () => root, id: 'owner', component: OwnerLayout });
const overview = createRoute({
  getParentRoute: () => owner,
  path: '/overview',
  component: Overview,
});
const purchase = createRoute({
  getParentRoute: () => owner,
  path: '/activity/$id',
  component: PurchaseDetail,
});
const tasks = createRoute({ getParentRoute: () => owner, path: '/tasks', component: Tasks });
const task = createRoute({
  getParentRoute: () => owner,
  path: '/tasks/$id',
  component: TaskDetail,
});
const contact = createRoute({
  getParentRoute: () => owner,
  path: '/contact',
  component: Contact,
  staticData: { public: true },
});
const agent = createRoute({ getParentRoute: () => owner, path: '/agent', component: Agent });
const activity = createRoute({
  getParentRoute: () => owner,
  path: '/activity',
  component: Activity,
  validateSearch: (s: Record<string, unknown>): { filter?: ActivityFilter } => ({
    filter: FILTERS.find((f) => f.id === s.filter)?.id ?? 'all',
  }),
});
// Links from before the redesign (agent skill, bookmarks) keep working.
const moved = [
  createRoute({
    getParentRoute: () => root,
    path: '/mandates',
    beforeLoad: () => {
      throw redirect({ to: '/tasks' });
    },
  }),
  createRoute({
    getParentRoute: () => root,
    path: '/mandates/$id',
    beforeLoad: ({ params }) => {
      throw redirect({ to: '/tasks/$id', params });
    },
  }),
  createRoute({
    getParentRoute: () => root,
    path: '/connect',
    beforeLoad: () => {
      throw redirect({ to: '/agent' });
    },
  }),
];

export const router = createRouter({
  routeTree: root.addChildren([
    signIn,
    ...moved,
    owner.addChildren([overview, activity, purchase, tasks, task, agent, contact]),
  ]),
  scrollRestoration: true,
});
declare module '@tanstack/react-router' {
  interface StaticDataRouteOption {
    public?: boolean;
  }
  interface Register {
    router: typeof router;
  }
}
export const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 1000 }, mutations: { retry: false } },
});
export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      <Toaster position="bottom-right" />
    </QueryClientProvider>
  );
}
