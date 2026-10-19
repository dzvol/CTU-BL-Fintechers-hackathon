import type { ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { Logo } from './logo';

export function PublicShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2 px-5 py-4">
          <Link to="/" aria-label="SemanticAuth home">
            <Logo />
          </Link>
          <nav aria-label="Information" className="flex items-center gap-1">
            <Button asChild variant="ghost">
              <Link to="/faq">FAQ</Link>
            </Button>
            <Button asChild variant="ghost">
              <Link to="/contact">Contact</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/">Sign in</Link>
            </Button>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-5 py-10 sm:py-14">{children}</main>
    </div>
  );
}
