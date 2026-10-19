# Naive failure reconciliation

`createReconciliationWorker({ tasks })` accepts the existing `TaskService` and
exposes `closeFailedTask(userId, taskId)`. Invoke it immediately after a payment,
verification, or content-delivery failure. It calls `TaskService.close()`, which
atomically changes an active task to `closed` and writes the current UTC ISO
timestamp to `tasks.closed_at` using the service's clock.

```ts
import { createReconciliationWorker } from './workers/reconciliation-worker';

const reconciliation = createReconciliationWorker({ tasks: services.tasks });

// In PaymentGateway's failure path, with the task/user from the authenticated context:
// reconciliation.closeFailedTask(userId, taskId);
```

This replaces automatic recovery with task closure. There is no polling loop,
payment resubmission, or refund. It never rewrites an operation to `closed` and
never releases issued funds or changes ledger/accounting entries. Receipt absence
and timeouts remain uncertain payment outcomes even after the task is closed.

The handler is idempotent for already closed tasks and preserves their original
`closed_at`. Already expired tasks retain their existing terminal state. It closes
the specified task ID, not whichever task happens to be active later. TaskService
continues to enforce ownership and database transactions. Unknown tasks, wrong
owners, and database failures are propagated instead of reported as successful closure.

Call it for transport errors/invalid responses/HTTP errors, a repeated HTTP 402
after payment, unsuccessful or unknown ChainReader verification, missing paid
content, or failure while delivering content to the agent. Initial HTTP 402 is
normal offer discovery, not a failure. Since these adapters return structured
results, their failure results must be checked explicitly; a `catch` alone is
insufficient. No service is automatically retried by this handler.

`PaymentGateway` is still an orchestration stub. The owner implementing that
workflow should inject the ChainReader and call this handler from its failure
paths. Current schemas already include `status` and `closed_at`, so no database
migration or shared-contract change is needed.

```bash
npm test -w @semanticauth/gateway -- reconciliation
```
