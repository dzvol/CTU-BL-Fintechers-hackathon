import { useState, type ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ApiKey } from '@semanticauth/contracts';
import { KeyRound } from 'lucide-react';
import { toast } from 'sonner';
import { useKeys, useMe } from '@/api/hooks';
import { createApiKey, revokeApiKey } from '@/api/keys';
import { Code, CopyButton, ErrorState, Loading, PageHeader, Section } from '@/components/sa/common';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { fromNow, fullTime } from '@/lib/time';
import { cn } from '@/lib/utils';

/** Where agents reach the gateway: the Vite dev server proxies only the dashboard API. */
const GATEWAY_URL =
  window.location.port === '5173' ? 'http://localhost:8787' : window.location.origin;

const REPO_URL = 'https://github.com/dzvol/CTU-BL-Fintechers-hackathon.git';
// The CLI and the plugin ship in the repository; npx runs the CLI from its node_modules.
const CLONE = `git clone ${REPO_URL} semanticauth\ncd semanticauth\nnpm install`;

const HARNESSES = {
  'claude-code': {
    label: 'Claude Code',
    install: 'npx semanticauth install claude-code',
    run: 'claude',
  },
  codex: {
    label: 'Codex',
    install: 'npx semanticauth install codex',
    run: 'npx semanticauth run codex',
  },
} as const;
type Harness = keyof typeof HARNESSES;

function Confirm({
  trigger,
  title,
  description,
  action,
  onConfirm,
  destructive,
}: {
  trigger: ReactNode;
  title: string;
  description: string;
  action: string;
  onConfirm: () => void;
  destructive?: boolean;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className={cn(
              destructive && 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
            )}
            onClick={onConfirm}
          >
            {action}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function ActiveKey({
  apiKey,
  onReplace,
  onRevoke,
  busy,
  canCreate,
}: {
  apiKey: ApiKey;
  onReplace: () => void;
  onRevoke: () => void;
  busy: boolean;
  canCreate: boolean;
}) {
  return (
    <article className="flex flex-wrap items-center gap-4 rounded-xl border bg-card p-4 sm:p-5">
      <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-accent text-accent-foreground">
        <KeyRound className="size-5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-medium">{apiKey.name}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          <span className="font-mono">{apiKey.prefix}…</span> ·{' '}
          {apiKey.lastUsedAt ? (
            <time dateTime={apiKey.lastUsedAt} title={fullTime(apiKey.lastUsedAt)}>
              used {fromNow(apiKey.lastUsedAt)}
            </time>
          ) : (
            'not used yet'
          )}
        </p>
      </div>
      <div className="flex gap-2">
        <Confirm
          trigger={
            <Button variant="outline" size="sm" className="h-9" disabled={busy || !canCreate}>
              Replace
            </Button>
          }
          title="Replace this key?"
          description="The current key stops working right away and its active task ends. Your spending and allowance stay as they are."
          action="Replace key"
          onConfirm={onReplace}
        />
        <Confirm
          trigger={
            <Button
              variant="ghost"
              size="sm"
              className="h-9 text-destructive hover:bg-danger-soft hover:text-destructive"
              disabled={busy}
            >
              Revoke
            </Button>
          }
          title="Revoke this key?"
          description="Your agent loses access right away and its active task ends. Payments already on their way still finish."
          action="Revoke key"
          onConfirm={onRevoke}
          destructive
        />
      </div>
    </article>
  );
}

export function Agent() {
  const keys = useKeys(),
    me = useMe(),
    qc = useQueryClient();
  const [name, setName] = useState('');
  const [secret, setSecret] = useState<string | null>(null);
  const [harness, setHarness] = useState<Harness>('claude-code');
  const active = keys.data?.find((k) => !k.revokedAt);
  const canCreate = !me.data?.balance || BigInt(me.data.balance.remaining) > 0n;

  const create = useMutation({
    gcTime: 0,
    mutationFn: async (keyName: string) => {
      const result = await createApiKey(keyName);
      setSecret(result.key);
      // React Query keeps mutation results; give it the public metadata only, never the secret.
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
      setSecret(null);
      void qc.invalidateQueries();
      toast.success('Key revoked.');
    },
  });
  const h = HARNESSES[harness];

  return (
    <>
      <PageHeader title="Agent">
        Give your agent a key. It can only spend within tasks you approve.
      </PageHeader>

      <Section title="API key">
        {keys.isPending ? (
          <Loading />
        ) : keys.error ? (
          <ErrorState error={keys.error} onRetry={() => void keys.refetch()} />
        ) : active ? (
          <ActiveKey
            apiKey={active}
            busy={create.isPending || revoke.isPending}
            canCreate={canCreate}
            onReplace={() => create.mutate(active.name)}
            onRevoke={() => revoke.mutate(active.id)}
          />
        ) : (
          <form
            className="flex flex-wrap items-end gap-3 rounded-xl border bg-card p-4 sm:p-5"
            onSubmit={(e) => {
              e.preventDefault();
              create.mutate(name);
            }}
          >
            <div className="min-w-48 flex-1 space-y-1.5">
              <Label htmlFor="key-name">Agent name</Label>
              <Input
                id="key-name"
                required
                maxLength={100}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My laptop"
                disabled={!canCreate}
              />
            </div>
            <Button type="submit" disabled={!name.trim() || create.isPending || !canCreate}>
              Create key
            </Button>
            {!canCreate && (
              <p className="w-full text-sm text-destructive">
                Your allowance is used up, so no new keys.
              </p>
            )}
          </form>
        )}
        {(create.error ?? revoke.error) && (
          <div className="mt-3">
            <ErrorState error={create.error ?? revoke.error} />
          </div>
        )}
        {secret && (
          <div
            className="mt-3 rounded-xl border border-primary/30 bg-accent p-4 sm:p-5"
            role="status"
          >
            <p className="text-sm font-medium text-accent-foreground">
              Copy your key now. You won't see it again.
            </p>
            <div className="mt-3 flex items-center gap-2 rounded-lg border bg-card py-1 pl-3 pr-1">
              <code
                aria-label="New API key"
                className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap font-mono text-[13px]"
              >
                {secret}
              </code>
              <CopyButton value={secret} label="Copy key" />
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="mt-2 h-8"
              onClick={() => {
                setSecret(null);
                create.reset();
              }}
            >
              Done
            </Button>
          </div>
        )}
      </Section>

      <Section title="Connect">
        <div
          className="mb-4 inline-flex rounded-lg bg-muted p-1"
          role="tablist"
          aria-label="Agent app"
        >
          {(Object.keys(HARNESSES) as Harness[]).map((id) => (
            <button
              key={id}
              role="tab"
              aria-selected={harness === id}
              onClick={() => setHarness(id)}
              className={cn(
                'h-8 cursor-pointer rounded-md px-3 text-sm text-muted-foreground transition-colors',
                harness === id && 'bg-card font-medium text-foreground shadow-sm',
              )}
            >
              {HARNESSES[id].label}
            </button>
          ))}
        </div>
        <ol className="space-y-5" role="tabpanel">
          <Step n={1} title="Get the CLI" hint="Needs git and Node.js 22 or newer.">
            <Code>{CLONE}</Code>
          </Step>
          <Step
            n={2}
            title="Connect it to this gateway and store the key"
            hint="Paste the key when asked. It's kept out of your shell history."
          >
            <Code>{`npx semanticauth config set gateway_url ${GATEWAY_URL}\nnpx semanticauth auth`}</Code>
          </Step>
          <Step n={3} title={`Add SemanticAuth to ${h.label}`}>
            <Code>{h.install}</Code>
          </Step>
          <Step n={4} title="Check the connection">
            <Code>npx semanticauth doctor</Code>
          </Step>
          <Step
            n={5}
            title="Ask your agent for a task"
            hint="Start it, describe what you need, and approve its proposal on Overview."
          >
            <Code>{h.run}</Code>
          </Step>
        </ol>
        <details className="mt-6 text-sm">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
            Set up without the CLI
          </summary>
          <div className="mt-3 space-y-3">
            <p className="text-muted-foreground">MCP over HTTP, with the key as a bearer token:</p>
            <Code>{`${GATEWAY_URL}/mcp\nAuthorization: Bearer <your key>`}</Code>
            <p className="text-muted-foreground">
              <a
                href="/agent-skill.md"
                target="_blank"
                rel="noreferrer"
                className="text-primary hover:underline"
              >
                Onboarding guide for agents
              </a>
            </p>
          </div>
        </details>
      </Section>
    </>
  );
}

function Step({
  n,
  title,
  hint,
  children,
}: {
  n: number;
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <li className="grid grid-cols-[1.75rem_minmax(0,1fr)] gap-x-3">
      <span className="grid size-7 place-items-center rounded-full border text-xs font-medium tabular-nums text-muted-foreground">
        {n}
      </span>
      <div className="min-w-0">
        <p className="pt-0.5 text-sm font-medium">{title}</p>
        {hint && <p className="mt-0.5 text-sm text-muted-foreground">{hint}</p>}
        <div className="mt-2">{children}</div>
      </div>
    </li>
  );
}
