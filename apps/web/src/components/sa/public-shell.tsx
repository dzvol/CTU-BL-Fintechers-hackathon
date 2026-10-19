import type { ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { Logo } from './logo';

/** FAQ and Contact for visitors who aren't signed in. */
export function PublicShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between gap-2 px-4 sm:px-8">
          <Link to="/" aria-label="SemanticAuth home">
            <Logo />
          </Link>
          <nav aria-label="Information" className="flex items-center gap-1">
            <Button asChild variant="ghost" size="sm" className="h-9">
              <Link to="/faq">FAQ</Link>
            </Button>
            <Button asChild variant="ghost" size="sm" className="h-9">
              <Link to="/contact">Contact</Link>
            </Button>
            <Button asChild variant="outline" size="sm" className="h-9">
              <Link to="/">Sign in</Link>
            </Button>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-8 sm:py-12">{children}</main>
    </div>
  );
}
