import { Link } from '@tanstack/react-router';
import { useKeys, useMe } from '@/api/hooks';
import { PageHeader, ErrorState, Loading, Money } from '@/components/sa/common';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';

export function Wallets() {
  const me = useMe(),
    keys = useKeys();
  if (me.isPending) return <Loading />;
  if (me.error) return <ErrorState error={me.error} onRetry={() => void me.refetch()} />;
  if (!me.data) return null;
  return (
    <>
      <PageHeader title="Wallets" description="Manage spending access for your agents." />
      <Table>
        <TableHeader>
          <TableRow>
            {['Wallet', 'Network', 'Assigned allowance', 'Connected agent', 'Actions'].map(
              (label) => (
                <TableHead key={label} scope="col">
                  {label}
                </TableHead>
              ),
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell className="min-w-40 font-medium">
              Hackathon wallet
              <span className="mt-1 block text-xs font-normal text-muted-foreground">
                Pre-funded
              </span>
            </TableCell>
            <TableCell className="whitespace-nowrap">Base Sepolia</TableCell>
            <TableCell className="whitespace-nowrap">
              <Money value={me.data.allocation} />
            </TableCell>
            <TableCell>
              {keys.isPending ? (
                <Loading label="Loading agents…" />
              ) : keys.error ? (
                <ErrorState error={keys.error} onRetry={() => void keys.refetch()} />
              ) : (
                keys.data
                  ?.filter((k) => !k.revokedAt)
                  .map((k) => k.name)
                  .join(', ') || 'No agent connected'
              )}
            </TableCell>
            <TableCell>
              <Button asChild variant="outline" size="sm">
                <Link to="/connect">Manage agents</Link>
              </Button>
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
      <p className="mt-4 text-sm text-muted-foreground">
        Assigned allowance is your allocation, not a live on-chain balance.
      </p>
      <section className="py-7" aria-labelledby="more-wallets">
        <h2 id="more-wallets" className="text-lg font-semibold">
          Bring your own wallet
        </h2>
        <p className="mt-2 max-w-xl text-sm text-muted-foreground">
          Wallet creation, imports, and connecting an agent to multiple wallets are coming soon.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Button variant="outline" disabled>
            Import wallet · Coming soon
          </Button>
          <Button variant="outline" disabled>
            Create wallet · Coming soon
          </Button>
        </div>
      </section>
    </>
  );
}
export function Plans() {
  const keys = useKeys();
  return (
    <>
      <PageHeader
        title="Plan & usage"
        description="One agent key is available today. Paid plans are coming soon."
      />
      <section className="mb-8 border-y py-5" aria-labelledby="current-plan">
        <h2 id="current-plan" className="text-sm font-semibold">
          Current access · Free
        </h2>
        {keys.isPending ? (
          <Loading />
        ) : keys.error ? (
          <ErrorState error={keys.error} onRetry={() => void keys.refetch()} />
        ) : (
          <p className="mt-2 text-sm">
            {keys.data?.filter((k) => !k.revokedAt).length ?? 0} of 1 active API key in use
          </p>
        )}
        <p className="mt-2 text-sm text-muted-foreground">
          Request metering and billing are coming soon.
        </p>
      </section>
      <div className="grid gap-6 lg:grid-cols-3">
        {[
          {
            name: 'Free',
            price: '$0',
            sub: 'Available today',
            items: [
              '1 active API key',
              'Hackathon wallet access',
              'Task approval and activity history',
            ],
            action: 'Current plan',
          },
          {
            name: 'Go',
            price: '$5 / month',
            sub: 'Proposed plan · Coming soon',
            items: [
              'Up to 3 active API keys',
              '10,000 requests / month',
              'Task approval and activity history',
            ],
            action: 'Go · Coming soon',
          },
          {
            name: 'Pro',
            price: 'To be announced',
            sub: 'Coming soon',
            items: [
              'Higher API key limits',
              'Higher request allowance',
              'Pricing and limits to be announced',
            ],
            action: 'Pro · Coming soon',
          },
        ].map((p) => (
          <section className="flex flex-col border-t pt-5" key={p.name}>
            <h2 className="text-lg font-semibold">{p.name}</h2>
            <p className="mt-3 font-mono text-2xl font-semibold">{p.price}</p>
            <p className="mt-2 text-xs text-muted-foreground">{p.sub}</p>
            <ul className="my-6 flex-1 space-y-3 text-sm">
              {p.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <Button variant="outline" disabled>
              {p.action}
            </Button>
          </section>
        ))}
      </div>
      <p className="mt-8 text-sm text-muted-foreground">
        Paid pricing and limits are a preview. Subscriptions, additional keys, and request quotas
        are not available yet.
      </p>
    </>
  );
}
