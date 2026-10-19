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
import { PageHeader, ErrorState, Loading, fmtTime } from '@/components/sa/common';
export function Connect() {
  const keys = useKeys(),
    qc = useQueryClient();
  const [name, setName] = useState(''),
    [created, setCreated] = useState<CreatedApiKey | null>(null);
  const create = useMutation({
    gcTime: 0,
    mutationFn: () => createApiKey(name),
    onSuccess: (result) => {
      setCreated(result);
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
        title="Connect agent"
        description="Claude Code or Codex · one active key, one active task"
      />
      <section className="mb-8 border-b pb-7">
        <h2 className="mb-4 text-lg font-semibold">1. Create your agent key</h2>
        {keys.isPending ? (
          <Loading />
        ) : keys.error ? (
          <ErrorState error={keys.error} onRetry={() => void keys.refetch()} />
        ) : active.length ? (
          <div className="space-y-3">
            {active.map((k) => (
              <div key={k.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
                <div className="min-w-0">
                  <p className="break-words font-semibold">
                    {k.name} <span className="text-sm text-success">· Active</span>
                  </p>
                  <p className="mt-1 break-all font-mono text-sm text-muted-foreground">
                    {k.prefix}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Created {fmtTime(k.createdAt, true)}
                    {k.lastUsedAt && ` · Last used ${fmtTime(k.lastUsedAt, true)}`}
                  </p>
                </div>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline">Revoke</Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Revoke this agent key?</AlertDialogTitle>
                      <AlertDialogDescription>
                        The agent loses access and its active task closes. Already-issued payments
                        may still complete.
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
            ))}
            <p className="text-sm text-muted-foreground">
              Revoke the existing key before creating another.
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
          Agent keys cannot approve intents or purchase reviews. The secret stays in this screen's
          memory until hidden or you navigate away.
        </p>
      </section>
      <section className="min-w-0 border-b pb-7">
        <h2 className="mb-3 text-lg font-semibold">2. Configure your existing agent</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          The gateway provides Streamable HTTP MCP at http://localhost:8787/mcp. Store the key
          securely in your agent's environment.
        </p>
        <h3 className="mb-2 text-sm font-medium">Codex · ~/.codex/config.toml</h3>
        <Code>{`[mcp_servers.semanticauth]\nurl = "http://localhost:8787/mcp"\nbearer_token_env_var = "SEMANTICAUTH_API_KEY"`}</Code>
        <h3 className="mb-2 mt-5 text-sm font-medium">Claude Code</h3>
        <Code>{`claude mcp add --transport http semanticauth http://localhost:8787/mcp \\\n  --header "Authorization: Bearer $SEMANTICAUTH_API_KEY"`}</Code>
      </section>
      <section className="pt-7">
        <h2 className="mb-3 text-lg font-semibold">3. Propose a task, then wait for approval</h2>
        <dl className="grid gap-4 sm:grid-cols-2">
          {[
            ['get_intent_template', 'Read the required intent fields.'],
            ['submit_intent', 'Propose a structured purpose and purchase limits.'],
            ['get_intent_status', 'Wait for the owner’s approval, then read the created task.'],
            ['get_task', 'Read the active task.'],
            ['paid_fetch', 'Fetch a compatible service through the gateway.'],
            ['check_review', 'Poll a purchase review. This service is not implemented yet.'],
          ].map(([tool, text]) => (
            <div key={tool}>
              <dt className="font-mono text-sm font-medium">{tool}</dt>
              <dd className="mt-1 text-sm text-muted-foreground">{text}</dd>
            </div>
          ))}
        </dl>
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
