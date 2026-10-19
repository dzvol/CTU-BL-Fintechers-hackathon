import { Link, useLocation } from '@tanstack/react-router';
import { PageHeader } from '@/components/sa/common';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

const sections = [
  { to: '/admin', label: 'Overview' },
  { to: '/admin/users', label: 'Users' },
  { to: '/admin/plans', label: 'Plans & usage' },
  { to: '/admin/activity', label: 'Activity' },
] as const;

function AdminTable({ columns, message }: { columns: string[]; message: string }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          {columns.map((label) => (
            <TableHead scope="col" key={label} className="whitespace-nowrap">
              {label}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          <TableCell
            colSpan={columns.length}
            className="py-10 text-center text-sm text-muted-foreground"
          >
            {message}
          </TableCell>
        </TableRow>
      </TableBody>
    </Table>
  );
}

export function Administration() {
  const path = useLocation({ select: (location) => location.pathname });
  const detail = path.startsWith('/admin/users/');
  const users = path === '/admin/users';
  const plans = path === '/admin/plans';
  const activity = path === '/admin/activity';
  const title = detail
    ? 'User details'
    : users
      ? 'Registered users'
      : plans
        ? 'Plans & usage'
        : activity
          ? 'All-user activity'
          : 'Administration';
  return (
    <>
      <PageHeader title={title} description="Read-only administration · Layout preview" />
      <nav aria-label="Administration" className="mb-6 flex flex-wrap gap-2">
        {sections.map((section) => (
          <Button
            asChild
            variant={
              path === section.to || (detail && section.to === '/admin/users')
                ? 'secondary'
                : 'ghost'
            }
            key={section.to}
          >
            <Link to={section.to} aria-current={path === section.to ? 'page' : undefined}>
              {section.label}
            </Link>
          </Button>
        ))}
      </nav>
      <div role="status" className="mb-6 rounded-md border bg-muted p-4 text-sm">
        <p className="font-medium">Administrator access is not enabled yet</p>
        <p className="mt-1 text-muted-foreground">
          This preview shows the planned layout. The gateway does not provide admin permissions or
          cross-user endpoints yet, so no registered-user data is loaded. Signing in does not grant
          administrator access.
        </p>
      </div>
      {detail ? (
        <>
          <Button asChild variant="outline" className="mb-5">
            <Link to="/admin/users">Back to users</Link>
          </Button>
          <AdminTable
            columns={[
              'User',
              'Registered',
              'Last login',
              'Assigned allowance',
              'Active keys',
              'Plan',
            ]}
            message="User profile unavailable until the admin user-detail endpoint is connected."
          />
          <h2 className="mb-3 mt-8 text-lg font-semibold">Agents and tasks</h2>
          <AdminTable
            columns={['Agent', 'Key prefix', 'Last used', 'Active task', 'Status']}
            message="User agents and tasks are not available in this preview."
          />
          <p className="mt-4 text-sm text-muted-foreground">
            Plan, request usage, wallet relationships, and spending aggregates · Coming soon
          </p>
        </>
      ) : users ? (
        <>
          <AdminTable
            columns={[
              'User',
              'Registered',
              'Last login',
              'Assigned allowance',
              'Active keys',
              'Plan',
              'Usage',
              'Actions',
            ]}
            message="Registered users are unavailable until the gateway provides the admin users endpoint."
          />
          <p className="mt-4 text-sm text-muted-foreground">
            Search, pagination, and View user will be available when user data is connected. Plan
            and usage · Coming soon
          </p>
        </>
      ) : plans ? (
        <>
          <AdminTable
            columns={[
              'User',
              'Plan',
              'Active keys / limit',
              'Requests / limit',
              'Reporting period',
            ]}
            message="Plan assignments, request metering, billing periods, and quotas · Coming soon"
          />
          <p className="mt-4 text-sm text-muted-foreground">
            The Free, Go, and Pro plans are product previews. No subscriptions or plan changes are
            enabled.
          </p>
        </>
      ) : activity ? (
        <>
          <AdminTable
            columns={[
              'Time',
              'User',
              'Agent',
              'Service',
              'Task',
              'Amount',
              'Decision',
              'Payment',
              'Delivery',
            ]}
            message="Cross-user activity is unavailable until the gateway provides an authorized admin activity endpoint."
          />
          <p className="mt-4 text-sm text-muted-foreground">
            User, task, date, decision, payment, and delivery filters will be available when
            activity is connected.
          </p>
        </>
      ) : (
        <>
          <h2 className="mb-3 text-lg font-semibold">Platform overview</h2>
          <AdminTable
            columns={['Metric', 'Value', 'Availability']}
            message="Registered-user and active-agent totals require the admin overview endpoint. Request usage and spending totals · Coming soon"
          />
          <div className="mt-6 flex flex-wrap gap-3">
            <Button asChild variant="outline">
              <Link to="/admin/users">View users layout</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/admin/plans">View plans & usage</Link>
            </Button>
          </div>
        </>
      )}
    </>
  );
}
