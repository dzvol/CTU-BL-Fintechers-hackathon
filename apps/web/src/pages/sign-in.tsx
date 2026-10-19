import { useEffect } from 'react';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { useMe } from '@/api/hooks';
import { LOGIN_URL } from '@/api/auth';
import { Logo } from '@/components/sa/logo';
import { Button } from '@/components/ui/button';
import { ErrorState, Loading, Unsupported } from '@/components/sa/common';
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
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-10">
      <Logo />
      <h1 className="mb-2 mt-9 text-2xl font-semibold">Sign in to SemanticAuth</h1>
      <p className="mb-7 text-muted-foreground">Human-approved tasks. Controlled agent spending.</p>
      {search.expired && (
        <p role="status" className="mb-4 bg-warning-soft p-3 text-sm">
          Your session expired. Sign in again.
        </p>
      )}
      {me.isPending ? (
        <Loading label="Checking your session…" />
      ) : me.error ? (
        <ErrorState error={me.error} onRetry={() => void me.refetch()} />
      ) : (
        <Button asChild variant="outline" className="w-full">
          <a href={LOGIN_URL}>Continue with Google</a>
        </Button>
      )}
      <Unsupported>
        Email magic links and demo admission codes are not supported. This app uses the gateway's
        Google session.
      </Unsupported>
      <div className="mt-7 border-t pt-5 text-sm text-muted-foreground">
        <nav aria-label="Information" className="mt-4 flex gap-4">
          <Link to="/faq" className="text-primary">
            FAQ
          </Link>
          <Link to="/contact" className="text-primary">
            Contact
          </Link>
        </nav>
      </div>
    </main>
  );
}
