import { useEffect, useState } from 'react';
import { Link, Outlet, useNavigate, useMatches } from '@tanstack/react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Shield,
  Wallet,
  CreditCard,
  Clock3,
  FileText,
  Home,
  LogOut,
  Menu,
  PanelLeftClose,
  UserRound,
  CircleHelp,
  Mail,
  RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../ui/button';
import { Sheet, SheetContent, SheetTitle, SheetDescription, SheetTrigger } from '../ui/sheet';
import { useMe } from '@/api/hooks';
import { logout } from '@/api/auth';
import { ApiError } from '@/api/http';
import { Loading, ErrorState, Money } from './common';
import { Logo } from './logo';
import { PublicShell } from './public-shell';
const NAV = [
  { to: '/overview', label: 'Overview', icon: Home },
  { to: '/mandates', label: 'Tasks', icon: FileText },
  { to: '/activity', label: 'Activity', icon: Clock3 },
  { to: '/connect', label: 'Agents', icon: UserRound },
  { to: '/wallets', label: 'Wallets', icon: Wallet },
  { to: '/plans', label: 'Plan & usage', icon: CreditCard },
  { to: '/admin', label: 'Administration preview', icon: Shield },
  { to: '/faq', label: 'FAQ', icon: CircleHelp },
  { to: '/contact', label: 'Contact', icon: Mail },
] as const;
function NavLinks({ collapsed = false, onClick }: { collapsed?: boolean; onClick?: () => void }) {
  return (
    <nav aria-label="Primary">
      <ul className="space-y-2">
        {NAV.map((n) => (
          <li
            key={n.to}
            className={n.to === '/faq' ? 'mt-8 border-t border-sidebar-border pt-5' : undefined}
          >
            <Link
              to={n.to}
              onClick={onClick}
              title={collapsed ? n.label : undefined}
              className="flex min-h-11 items-center gap-3 rounded-md px-3 text-sidebar-foreground hover:bg-sidebar-accent"
              activeProps={{ className: 'bg-sidebar-accent font-semibold', 'aria-current': 'page' }}
            >
              <n.icon className="size-5 shrink-0" aria-hidden />
              {collapsed ? <span className="sr-only">{n.label}</span> : n.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
export function OwnerLayout() {
  const publicPage = useMatches({
    select: (matches) => matches.some((match) => match.staticData.public === true),
  });
  const me = useMe(),
    navigate = useNavigate(),
    qc = useQueryClient();
  const [collapsed, setCollapsed] = useState(false),
    [mobile, setMobile] = useState(false);
  const signOut = useMutation({
    mutationFn: logout,
    onSuccess: async () => {
      await qc.cancelQueries();
      qc.clear();
      await navigate({ to: '/', replace: true });
    },
    onError: (e) => toast.error(e.message),
  });
  const expired = me.data === null || (me.error instanceof ApiError && me.error.status === 401);
  useEffect(() => {
    if (expired && !publicPage)
      void navigate({ to: '/', search: { expired: true }, replace: true });
  }, [expired, publicPage, navigate]);
  if (me.isPending)
    return (
      <main className="p-8">
        <Loading />
      </main>
    );
  if (publicPage && !me.data)
    return (
      <PublicShell>
        <Outlet />
      </PublicShell>
    );
  if (me.error)
    return (
      <main className="p-8">
        <ErrorState error={me.error} onRetry={() => void me.refetch()} />
      </main>
    );
  if (!me.data) return null;
  return (
    <div className="flex min-h-screen w-full">
      <a
        href="#main-content"
        className="sr-only z-50 rounded bg-card p-3 focus:not-sr-only focus:fixed"
      >
        Skip to content
      </a>
      <aside
        className={`sticky top-0 hidden h-screen shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground md:flex ${collapsed ? 'w-16' : 'w-[220px]'}`}
      >
        <div className="h-20 px-5 pt-6">
          {collapsed ? <span className="font-mono font-bold">SA</span> : <Logo />}
        </div>
        <div className="flex-1 p-3">
          <NavLinks collapsed={collapsed} />
        </div>
        <Button
          variant="ghost"
          size="icon"
          aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
          onClick={() => setCollapsed(!collapsed)}
          className="m-2 hover:bg-sidebar-accent"
        >
          <PanelLeftClose aria-hidden />
        </Button>
      </aside>
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 border-b bg-card">
          <div className="flex min-h-[72px] items-center justify-between gap-2 px-4 py-2 sm:px-8">
            <div className="flex min-w-0 items-center gap-2">
              <Sheet open={mobile} onOpenChange={setMobile}>
                <SheetTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="md:hidden"
                    aria-label="Open navigation"
                  >
                    <Menu aria-hidden />
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-[220px] bg-sidebar text-sidebar-foreground">
                  <SheetTitle className="mb-6 text-sidebar-foreground">
                    <Logo />
                  </SheetTitle>
                  <SheetDescription className="sr-only">Dashboard navigation</SheetDescription>
                  <NavLinks onClick={() => setMobile(false)} />
                </SheetContent>
              </Sheet>
              <span className="sm:hidden">
                <Logo />
              </span>
              <span className="hidden truncate text-sm text-muted-foreground sm:inline">
                {me.data.name ?? me.data.email}
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <div className="hidden text-right sm:block">
                <p className="text-xs text-muted-foreground">Assigned allocation · Base Sepolia</p>
                <Money value={me.data.allocation} className="text-base font-semibold" />
              </div>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Refresh dashboard"
                onClick={() => void qc.invalidateQueries()}
              >
                <RefreshCw aria-hidden />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                disabled={signOut.isPending}
                onClick={() => signOut.mutate()}
                aria-label="Sign out"
              >
                <LogOut aria-hidden />
              </Button>
            </div>
          </div>
        </header>
        <main
          id="main-content"
          tabIndex={-1}
          className="mx-auto max-w-[1200px] px-5 py-6 outline-none sm:px-8 sm:py-8 lg:px-10"
        >
          <Outlet />
        </main>
      </div>
    </div>
  );
}
