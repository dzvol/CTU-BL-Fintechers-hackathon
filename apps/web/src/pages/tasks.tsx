import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useIntents, useTasks, useKeys } from '@/api/hooks';
import { PageHeader, Empty, ErrorState, Loading, Money, fmtTime } from '@/components/sa/common';
import { StatusBadge } from '@/components/sa/status';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FilterField } from '@/components/sa/filter-field';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
export function Tasks() {
  const intents = useIntents(),
    tasks = useTasks(),
    keys = useKeys();
  const [search, setSearch] = useState(''),
    [status, setStatus] = useState('all'),
    [agent, setAgent] = useState('all'),
    [since, setSince] = useState('');
  if (intents.isPending || tasks.isPending) return <Loading />;
  if (intents.error)
    return <ErrorState error={intents.error} onRetry={() => void intents.refetch()} />;
  if (tasks.error) return <ErrorState error={tasks.error} onRetry={() => void tasks.refetch()} />;
  const rows = (intents.data ?? [])
    .map((intent) => ({ intent, task: tasks.data?.find((t) => t.intentId === intent.id) }))
    .filter(
      ({ intent, task }) =>
        intent.purpose.toLowerCase().includes(search.toLowerCase()) &&
        (status === 'all' || (task?.status ?? intent.status) === status) &&
        (agent === 'all' || intent.apiKeyId === agent) &&
        (!since || intent.createdAt.slice(0, 10) >= since),
    )
    .sort((a, b) => b.intent.createdAt.localeCompare(a.intent.createdAt));
  const filtered = !!search || status !== 'all' || agent !== 'all' || !!since;
  return (
    <>
      <PageHeader
        title="Tasks"
        description="Review what your agents can do, how much they can spend, and when access expires."
      />
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
          Search intents
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tasks"
          />
        </label>
        <FilterField label="Status" value={status} onChange={setStatus}>
          <option value="all">All statuses</option>
          {['pending_approval', 'active', 'approved', 'rejected', 'expired', 'closed'].map((s) => (
            <option key={s} value={s}>
              {s === 'pending_approval' ? 'Awaiting approval' : s.replaceAll('_', ' ')}
            </option>
          ))}
        </FilterField>
        <FilterField label="Agent" value={agent} onChange={setAgent}>
          <option value="all">All agents</option>
          {[...new Set(intents.data?.map((i) => i.apiKeyId))].map((id) => (
            <option value={id} key={id}>
              {keys.data?.find((k) => k.id === id)?.name ?? id}
            </option>
          ))}
        </FilterField>
        <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
          Created on or after
          <Input type="date" value={since} onChange={(e) => setSince(e.target.value)} />
        </label>
      </div>
      {filtered && (
        <Button
          className="mb-4"
          variant="ghost"
          onClick={() => {
            setSearch('');
            setStatus('all');
            setAgent('all');
            setSince('');
          }}
        >
          Clear filters
        </Button>
      )}
      {rows.length ? (
        <Table>
          <TableHeader>
            <TableRow>
              {['Intent', 'Agent', 'Status', 'Budget', 'Created', 'Expires', ''].map((h) => (
                <TableHead scope="col" key={h}>
                  {h || <span className="sr-only">Actions</span>}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(({ intent: i, task }) => (
              <TableRow key={i.id}>
                <TableCell className="min-w-48 max-w-80 whitespace-normal font-medium">
                  {i.purpose}
                </TableCell>
                <TableCell>
                  {keys.data?.find((k) => k.id === i.apiKeyId)?.name ?? 'Agent unavailable'}
                </TableCell>
                <TableCell>
                  <StatusBadge value={task?.status ?? i.status} />
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  <Money value={i.budget} />
                </TableCell>
                <TableCell className="text-xs">
                  <time dateTime={i.createdAt}>{fmtTime(i.createdAt, true)}</time>
                </TableCell>
                <TableCell className="text-xs">
                  <time dateTime={task?.expiresAt ?? i.expiresAt}>
                    {fmtTime(task?.expiresAt ?? i.expiresAt, true)}
                  </time>
                </TableCell>
                <TableCell>
                  <Button asChild variant="outline" size="sm">
                    <Link to="/mandates/$id" params={{ id: i.id }}>
                      View task
                    </Link>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <Empty title={filtered ? 'No tasks match your filters' : 'No tasks yet'}>
          {!filtered && 'Connect an agent and ask it to submit an intent.'}
        </Empty>
      )}
    </>
  );
}
