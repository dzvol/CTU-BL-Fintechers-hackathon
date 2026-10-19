import { lazy, Suspense } from 'react';
import { Loading } from './components/sa/common';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
  Link,
} from '@tanstack/react-router';
import { SessionBoundary } from './components/sa/session-boundary';
import { OwnerLayout } from './components/sa/owner-layout';
import { Activity, FILTERS, type ActivityFilter } from './pages/activity';
import { Faq, Contact } from './pages/information';
import { Administration } from './pages/admin';
import { Wallets, Plans } from './pages/account';
import { Toaster } from './components/ui/sonner';
import './styles.css';

const SignIn = lazy(() => import('./pages/sign-in').then((m) => ({ default: m.SignIn })));
const Overview = lazy(() => import('./pages/overview').then((m) => ({ default: m.Overview })));
const Tasks = lazy(() => import('./pages/tasks').then((m) => ({ default: m.Tasks })));
const TaskDetail = lazy(() =>
  import('./pages/task-detail').then((m) => ({ default: m.TaskDetail })),
);
const PurchaseDetail = lazy(() =>
  import('./pages/purchase-detail').then((m) => ({ default: m.PurchaseDetail })),
);
const Connect = lazy(() => import('./pages/connect').then((m) => ({ default: m.Connect })));
const root = createRootRoute({
  component: () => (
    <SessionBoundary>
      <Suspense fallback={<Loading />}>
        <Outlet />
      </Suspense>
    </SessionBoundary>
  ),
  notFoundComponent: () => (
    <main className="p-8">
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <Link to="/" className="text-primary underline">
        Go home
      </Link>
    </main>
  ),
  errorComponent: () => (
    <main className="p-8">
      <h1 className="text-2xl font-semibold">This page didn't load</h1>
      <a href="/" className="text-primary underline">
        Return to sign in
      </a>
    </main>
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
const tasks = createRoute({ getParentRoute: () => owner, path: '/mandates', component: Tasks });
const task = createRoute({
  getParentRoute: () => owner,
  path: '/mandates/$id',
  component: TaskDetail,
});
const activity = createRoute({
  getParentRoute: () => owner,
  path: '/activity',
  component: Activity,
  validateSearch: (s: Record<string, unknown>): { filter?: ActivityFilter } => ({
    filter: FILTERS.find((f) => f.id === s.filter)?.id ?? 'all',
  }),
});
const purchase = createRoute({
  getParentRoute: () => owner,
  path: '/activity/$id',
  component: PurchaseDetail,
});
const connect = createRoute({ getParentRoute: () => owner, path: '/connect', component: Connect });
const wallets = createRoute({ getParentRoute: () => owner, path: '/wallets', component: Wallets });
const plans = createRoute({ getParentRoute: () => owner, path: '/plans', component: Plans });
const faq = createRoute({
  getParentRoute: () => owner,
  path: '/faq',
  component: Faq,
  staticData: { public: true },
});
const contact = createRoute({
  getParentRoute: () => owner,
  path: '/contact',
  component: Contact,
  staticData: { public: true },
});
const admin = createRoute({
  getParentRoute: () => owner,
  path: '/admin',
  component: Administration,
});
const adminUsers = createRoute({
  getParentRoute: () => owner,
  path: '/admin/users',
  component: Administration,
});
const adminUser = createRoute({
  getParentRoute: () => owner,
  path: '/admin/users/$id',
  component: Administration,
});
const adminPlans = createRoute({
  getParentRoute: () => owner,
  path: '/admin/plans',
  component: Administration,
});
const adminActivity = createRoute({
  getParentRoute: () => owner,
  path: '/admin/activity',
  component: Administration,
});
export const router = createRouter({
  routeTree: root.addChildren([
    signIn,
    owner.addChildren([
      admin,
      adminUsers,
      adminUser,
      adminPlans,
      adminActivity,
      overview,
      tasks,
      task,
      activity,
      purchase,
      connect,
      wallets,
      plans,
      faq,
      contact,
    ]),
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
      <Toaster position="top-center" richColors />
    </QueryClientProvider>
  );
}
