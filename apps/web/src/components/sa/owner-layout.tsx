import { useEffect, useState } from 'react';
import { Link, Outlet, useMatches, useNavigate } from '@tanstack/react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { formatUsdc, type Me } from '@semanticauth/contracts';
import {
  Activity,
  Bot,
  CircleHelp,
  Home,
  Hourglass,
  ListChecks,
  LogOut,
  Mail,
  Menu,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../ui/button';
import { Sheet, SheetContent, SheetTitle, SheetDescription, SheetTrigger } from '../ui/sheet';
import { useMe, usePending } from '@/api/hooks';
import { logout } from '@/api/auth';
import { ApiError } from '@/api/http';
import { Loading, ErrorState, Hint, Meter, Money } from './common';
import { Logo } from './logo';
import { PublicShell } from './public-shell';

const NAV = [
  { to: '/overview', label: 'Overview', icon: Home },
  { to: '/activity', label: 'Activity', icon: Activity },
  { to: '/tasks', label: 'Tasks', icon: ListChecks },
  { to: '/agent', label: 'Agent', icon: Bot },
] as const;
const HELP = [
  { to: '/faq', label: 'FAQ', icon: CircleHelp },
  { to: '/contact', label: 'Contact', icon: Mail },
] as const;
const LINK =
  'flex h-10 items-center gap-3 rounded-lg px-3 text-sm text-sidebar-foreground/75 transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-foreground';
const ACTIVE = {
  className: '!bg-sidebar-accent !text-sidebar-foreground font-medium',
  'aria-current': 'page',
} as const;

function NavLinks({ pending, onClick }: { pending: number; onClick?: () => void }) {
  return (
    <nav aria-label="Primary">
      <ul className="space-y-0.5">
        {NAV.map((n) => (
          <li key={n.to}>
            <Link to={n.to} onClick={onClick} className={LINK} activeProps={ACTIVE}>
              <n.icon className="size-4 shrink-0" aria-hidden />
              <span className="flex-1">{n.label}</span>
              {n.to === '/overview' && pending > 0 && (
                <span
                  className="rounded-full bg-warning px-1.5 text-xs font-semibold text-sidebar tabular-nums"
                  aria-label={`${pending} waiting for you`}
                >
                  {pending}
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>
      <ul className="mt-4 space-y-0.5 border-t border-sidebar-border pt-4">
        {HELP.map((n) => (
          <li key={n.to}>
            <Link to={n.to} onClick={onClick} className={LINK} activeProps={ACTIVE}>
              <n.icon className="size-4 shrink-0" aria-hidden />
              {n.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** What the sponsored allowance has left; always in view because every purchase draws on it. */
function Allowance({ me }: { me: Me }) {
  const balance = me.balance;
  const remaining = balance?.remaining ?? me.allocation;
  const empty = balance !== undefined && BigInt(remaining) <= 0n;
  return (
    <div className="rounded-lg bg-sidebar-accent/50 p-3" aria-label="Allowance">
      <p className="text-xs text-sidebar-foreground/60">
        {empty ? 'Allowance used up' : 'Left to spend'}
      </p>
      <p className="mt-0.5 text-sidebar-foreground">
        <Money value={remaining} className="text-lg font-semibold" unit={false} />
        <span className="text-xs text-sidebar-foreground/60"> of {formatUsdc(me.allocation)}</span>
      </p>
      {balance && (
        <>
          <Meter
            dark
            className="mt-2"
            total={me.allocation}
            spent={balance.spent}
            reserved={balance.reserved}
          />
          {BigInt(balance.reserved) > 0n && (
            <p className="mt-1.5 flex items-center gap-1.5 text-xs text-sidebar-foreground/60">
              <Hint label="On hold for payments in progress">
                <Hourglass className="size-3.5 text-warning" aria-hidden />
              </Hint>
              <Money value={balance.reserved} unit={false} />
            </p>
          )}
        </>
      )}
    </div>
  );
}

function Account({ me, onSignOut, busy }: { me: Me; onSignOut: () => void; busy: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      {me.picture ? (
        <img src={me.picture} alt="" className="size-8 rounded-full" referrerPolicy="no-referrer" />
      ) : (
        <span className="grid size-8 place-items-center rounded-full bg-sidebar-accent text-sm font-medium uppercase">
          {(me.name ?? me.email).slice(0, 1)}
        </span>
      )}
      <div className="min-w-0 flex-1 text-sm">
        <p className="truncate">{me.name ?? me.email}</p>
        {me.name && <p className="truncate text-xs text-sidebar-foreground/60">{me.email}</p>}
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="size-8 text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
        disabled={busy}
        onClick={onSignOut}
        aria-label="Sign out"
        title="Sign out"
      >
        <LogOut aria-hidden />
      </Button>
    </div>
  );
}

function Sidebar({
  me,
  pending,
  onNavigate,
  signOut,
}: {
  me: Me;
  pending: number;
  onNavigate?: () => void;
  signOut: { mutate: () => void; isPending: boolean };
}) {
  return (
    <div className="flex h-full flex-col gap-6 p-3">
      <div className="px-3 pt-3">
        <Logo />
      </div>
      <div className="flex-1">
        <NavLinks pending={pending} onClick={onNavigate} />
      </div>
      <Allowance me={me} />
      <div className="border-t border-sidebar-border px-1 pt-3">
        <Account me={me} onSignOut={() => signOut.mutate()} busy={signOut.isPending} />
      </div>
    </div>
  );
}

export function OwnerLayout() {
  // FAQ and Contact are readable without signing in.
  const publicPage = useMatches({
    select: (matches) => matches.some((match) => match.staticData.public === true),
  });
  const me = useMe(),
    navigate = useNavigate();
  const expired = me.data === null || (me.error instanceof ApiError && me.error.status === 401);
  useEffect(() => {
    if (expired && !publicPage)
      void navigate({ to: '/', search: { expired: true }, replace: true });
  }, [expired, publicPage, navigate]);

  if (me.isPending)
    return (
      <main className="grid min-h-screen place-items-center">
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
      <main className="mx-auto max-w-md p-8">
        <ErrorState error={me.error} onRetry={() => void me.refetch()} />
      </main>
    );
  if (!me.data) return null;
  return <Dashboard me={me.data} />;
}

/** The signed-in shell. Owner data is only queried from here, never for anonymous visitors. */
function Dashboard({ me }: { me: Me }) {
  const pending = usePending(),
    navigate = useNavigate(),
    qc = useQueryClient();
  const [mobile, setMobile] = useState(false);
  const signOut = useMutation({
    mutationFn: logout,
    onSuccess: async () => {
      await qc.cancelQueries();
      qc.clear();
      await navigate({ to: '/', replace: true });
    },
    onError: (e) => toast.error(e.message),
  });
  const exhausted = me.balance !== undefined && BigInt(me.balance.remaining) <= 0n;
  return (
    <div className="flex min-h-screen w-full">
      <a
        href="#main-content"
        className="sr-only z-50 rounded bg-card p-3 focus:not-sr-only focus:fixed focus:left-2 focus:top-2"
      >
        Skip to content
      </a>
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 bg-sidebar text-sidebar-foreground md:block">
        <Sidebar me={me} pending={pending.count} signOut={signOut} />
      </aside>
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-background/90 px-4 backdrop-blur md:hidden">
          <Logo />
          <Sheet open={mobile} onOpenChange={setMobile}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="relative" aria-label="Open navigation">
                <Menu aria-hidden />
                {pending.count > 0 && (
                  <span
                    aria-hidden
                    className="absolute right-2.5 top-2.5 size-2 rounded-full bg-warning"
                  />
                )}
              </Button>
            </SheetTrigger>
            <SheetContent
              side="left"
              className="w-64 border-sidebar-border bg-sidebar p-0 text-sidebar-foreground"
            >
              <SheetTitle className="sr-only">Navigation</SheetTitle>
              <SheetDescription className="sr-only">Dashboard navigation</SheetDescription>
              <Sidebar
                me={me}
                pending={pending.count}
                signOut={signOut}
                onNavigate={() => setMobile(false)}
              />
            </SheetContent>
          </Sheet>
        </header>
        {exhausted && (
          <p
            role="alert"
            className="bg-danger-soft px-4 py-2.5 text-center text-sm text-destructive sm:px-8"
          >
            Your allowance is used up. Agent keys no longer work.
          </p>
        )}
        <main
          id="main-content"
          tabIndex={-1}
          className="mx-auto w-full max-w-[880px] px-4 py-8 outline-none sm:px-8 sm:py-12"
        >
          <Outlet />
        </main>
      </div>
    </div>
  );
}
