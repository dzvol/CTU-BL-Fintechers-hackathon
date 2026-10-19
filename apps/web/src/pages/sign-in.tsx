import { useEffect } from 'react';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { useMe } from '@/api/hooks';
import { LOGIN_URL } from '@/api/auth';
import { Logo } from '@/components/sa/logo';
import { Button } from '@/components/ui/button';
import { ErrorState, Loading } from '@/components/sa/common';

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="size-4">
      <path
        fill="#4285F4"
        d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.2-2.1 3.5-5.1 3.5-8.7Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1A12 12 0 0 0 12 24Z"
      />
      <path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6h-4a12 12 0 0 0 0 10.8l4-3.1Z" />
      <path
        fill="#EA4335"
        d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1c.9-2.9 3.6-4.9 6.7-4.9Z"
      />
    </svg>
  );
}

export function SignIn() {
  const me = useMe(),
    navigate = useNavigate(),
    search = useSearch({ strict: false });
  useEffect(() => {
    document.title = 'Sign in · SemanticAuth';
  }, []);
  useEffect(() => {
    if (me.data) void navigate({ to: '/overview', replace: true });
  }, [me.data, navigate]);
  return (
    <main className="grid min-h-screen place-items-center px-6 py-10">
      <div className="w-full max-w-sm">
        <Logo />
        <h1 className="mt-10 text-2xl font-semibold tracking-tight">
          Your agent asks. You decide.
        </h1>
        <p className="mt-2 text-muted-foreground">
          Approve what your AI agent may buy, and see every payment it makes.
        </p>
        {search.expired && (
          <p
            role="status"
            className="mt-6 rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning"
          >
            Your session ended. Sign in again.
          </p>
        )}
        <div className="mt-8">
          {me.isPending ? (
            <Loading label="Checking your session…" />
          ) : me.error ? (
            <ErrorState error={me.error} onRetry={() => void me.refetch()} />
          ) : (
            <Button asChild variant="outline" className="w-full">
              <a href={LOGIN_URL}>
                <GoogleMark />
                Continue with Google
              </a>
            </Button>
          )}
        </div>
        <nav aria-label="Information" className="mt-6 flex gap-4 text-sm">
          <Link to="/faq" className="text-muted-foreground hover:text-foreground">
            FAQ
          </Link>
          <Link to="/contact" className="text-muted-foreground hover:text-foreground">
            Contact
          </Link>
        </nav>
      </div>
    </main>
  );
}
