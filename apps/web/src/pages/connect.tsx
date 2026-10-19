import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { CreatedApiKey } from '@semanticauth/contracts';
import { Copy, KeyRound } from 'lucide-react';
import { toast } from 'sonner';
import { useKeys } from '@/api/hooks';
import { createApiKey, revokeApiKey } from '@/api/keys';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { PageHeader, ErrorState, Loading, fmtTime } from '@/components/sa/common';
export function Connect() {
  const keys = useKeys(),
    qc = useQueryClient();
  const [name, setName] = useState(''),
    [created, setCreated] = useState<CreatedApiKey | null>(null);
  const create = useMutation({
    gcTime: 0,
    mutationFn: async () => {
      const result = await createApiKey(name);
      setCreated(result);
      // React Query retains mutation results; only return public metadata to that cache.
      return result.apiKey;
    },
    onSuccess: () => {
      setName('');
      void qc.invalidateQueries();
    },
  });
  const revoke = useMutation({
    mutationFn: revokeApiKey,
    onSuccess: () => {
      setCreated(null);
      void qc.invalidateQueries();
      toast.success('Agent key revoked.');
    },
  });
  const active = keys.data?.filter((k) => !k.revokedAt) ?? [];
  return (
    <>
      <PageHeader
        title="Agents"
        description="Connect an agent, manage its key, and revoke access anytime."
        actions={
          active.length ? (
            <Button asChild variant="outline">
              <Link to="/plans">Add API key</Link>
            </Button>
          ) : undefined
        }
      />
      <section className="mb-8 border-b pb-7">
        <h2 className="mb-4 text-lg font-semibold">
          {active.length ? 'Connected agents' : 'Connect your first agent'}
        </h2>
        {keys.isPending ? (
          <Loading />
        ) : keys.error ? (
          <ErrorState error={keys.error} onRetry={() => void keys.refetch()} />
        ) : active.length ? (
          <div>
            <Table>
              <TableHeader>
                <TableRow>
                  {['Agent', 'Wallet', 'API key', 'Last used', 'Status', 'Actions'].map((h) => (
                    <TableHead
                      scope="col"
                      key={h}
                      className={
                        ['Wallet', 'Last used', 'Status'].includes(h)
                          ? 'hidden md:table-cell'
                          : undefined
                      }
                    >
                      {h}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {active.map((k) => (
                  <TableRow key={k.id}>
                    <TableCell className="max-w-48 break-words font-medium">
                      {k.name}
                      <span className="mt-1 block text-xs font-normal text-muted-foreground md:hidden">
                        Active
                      </span>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <Link to="/wallets" className="text-primary hover:underline">
                        Hackathon wallet
                      </Link>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{k.prefix}…</TableCell>
                    <TableCell className="hidden text-xs md:table-cell">
                      {k.lastUsedAt ? fmtTime(k.lastUsedAt, true) : 'Not used yet'}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">Active</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-2">
                        <Button asChild variant="ghost" size="sm">
                          <a href="#agent-setup">Setup</a>
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="outline">Revoke</Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Revoke this agent key?</AlertDialogTitle>
                              <AlertDialogDescription>
                                The agent loses access and its active task closes. Already-issued
                                payments may still complete.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Keep key</AlertDialogCancel>
                              <AlertDialogAction
                                disabled={revoke.isPending}
                                onClick={() => revoke.mutate(k.id)}
                              >
                                Revoke key
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <p className="mt-4 text-sm text-muted-foreground">
              1 of 1 active API key in use. Additional keys are coming soon with paid plans. To
              replace a lost key, revoke it and create a new one.
            </p>
          </div>
        ) : (
          <form
            className="grid max-w-xl gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"
            onSubmit={(e) => {
              e.preventDefault();
              create.mutate();
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="key-name">Agent name</Label>
              <Input
                id="key-name"
                required
                maxLength={100}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Research assistant"
              />
            </div>
            <Button type="submit" disabled={!name.trim() || create.isPending}>
              <KeyRound aria-hidden />
              Create key
            </Button>
          </form>
        )}
        {create.error && (
          <div className="mt-3">
            <ErrorState error={create.error} />
          </div>
        )}
        {revoke.error && (
          <div className="mt-3">
            <ErrorState error={revoke.error} />
          </div>
        )}
        {created && (
          <div className="mt-5 max-w-2xl border-l-4 border-primary bg-accent p-4">
            <p className="font-semibold">Copy now — shown only once</p>
            <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] gap-2">
              <code
                aria-label="New agent key"
                className="block overflow-x-auto rounded border bg-card p-3 text-xs"
              >
                {created.key}
              </code>
              <Button
                variant="outline"
                aria-label="Copy key"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(created.key);
                    toast.success('Key copied.');
                  } catch {
                    toast.error('Select and copy the key manually.');
                  }
                }}
              >
                <Copy aria-hidden />
                Copy
              </Button>
            </div>
            <Button
              variant="ghost"
              className="mt-2"
              onClick={() => {
                setCreated(null);
                create.reset();
              }}
            >
              I've stored it — hide
            </Button>
          </div>
        )}
        <p className="mt-4 text-sm text-muted-foreground">
          You approve tasks and purchase reviews in the dashboard. Agents cannot approve their own
          spending.
        </p>
      </section>
      <section id="agent-setup" className="scroll-mt-24" aria-labelledby="setup-title">
        <h2 id="setup-title" className="text-lg font-semibold">
          Give your agent the skill. It handles setup.
        </h2>
        <ol className="mt-4 max-w-2xl list-inside list-decimal space-y-3 text-sm">
          <li>Create your agent key above and store it securely.</li>
          <li>Give your agent the onboarding skill link below.</li>
          <li>Let it guide you through connecting, then approve its first task here.</li>
        </ol>
        <div className="mt-5 flex flex-wrap gap-3">
          <Button
            variant="outline"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(
                  new URL('/agent-skill.md', window.location.origin).href,
                );
                toast.success('Skill link copied.');
              } catch {
                toast.error('Open the skill and copy its link manually.');
              }
            }}
          >
            <Copy aria-hidden />
            Copy skill link
          </Button>
          <Button asChild variant="ghost">
            <a href="/agent-skill.md" target="_blank" rel="noreferrer">
              Read onboarding skill
            </a>
          </Button>
        </div>
        <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
          The skill link contains no credentials. Let your agent guide you to store the key in its
          local environment; never put it in a URL or commit it to Git. A localhost link works only
          on this computer.
        </p>
        <details className="mt-7 border-t pt-4">
          <summary className="min-h-11 cursor-pointer text-sm font-medium">Manual setup</summary>
          <p className="mb-4 text-sm text-muted-foreground">
            For local development, the gateway MCP endpoint is http://localhost:8787/mcp. Store the
            key as SEMANTICAUTH_API_KEY in your agent environment.
          </p>
          <h3 className="mb-2 text-sm font-medium">Codex · ~/.codex/config.toml</h3>
          <Code>{`[mcp_servers.semanticauth]\nurl = "http://localhost:8787/mcp"\nbearer_token_env_var = "SEMANTICAUTH_API_KEY"`}</Code>
          <p className="mt-4 text-sm text-muted-foreground">
            The skill includes Claude Code setup and the task approval workflow.
          </p>
        </details>
      </section>
    </>
  );
}
function Code({ children }: { children: string }) {
  return (
    <pre className="max-w-full overflow-x-auto rounded-md bg-sidebar p-4 font-mono text-xs leading-relaxed text-sidebar-foreground">
      {children}
    </pre>
  );
}
