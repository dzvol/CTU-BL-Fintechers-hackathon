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
import { OwnerLayout } from './components/sa/owner-layout';
import { Activity, FILTERS, type ActivityFilter } from './pages/activity';
import { Faq, Contact, AdminUnavailable } from './pages/information';
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
    <Suspense fallback={<Loading />}>
      <Outlet />
    </Suspense>
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
const faq = createRoute({ getParentRoute: () => root, path: '/faq', component: Faq });
const contact = createRoute({ getParentRoute: () => root, path: '/contact', component: Contact });
const admin = createRoute({
  getParentRoute: () => root,
  path: '/admin',
  component: AdminUnavailable,
});
export const router = createRouter({
  routeTree: root.addChildren([
    signIn,
    faq,
    contact,
    admin,
    owner.addChildren([overview, tasks, task, activity, purchase, connect]),
  ]),
  scrollRestoration: true,
});
declare module '@tanstack/react-router' {
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
