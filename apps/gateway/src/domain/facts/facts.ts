import {
  formatUsdc,
  type Intent,
  type NormalizedOffer,
  type Task,
  type TaskId,
} from '@semanticauth/contracts';

/** Code-computed facts for Judge. Never contains merchant text. */
export type JudgeFacts = Record<string, string>;

/** An earlier operation of the user that reserved or spent money. */
export interface Purchase {
  taskId: TaskId;
  payTo: string;
  amount: bigint;
}

const sum = (purchases: Purchase[]) => purchases.reduce((total, p) => total + p.amount, 0n);
const sameAddress = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const usdc = (amount: bigint) => `${formatUsdc(amount)} USDC`;

/** Spent and reserved amounts of the user, overall and in the task. */
export function committed(task: Task, purchases: Purchase[]) {
  const inTask = purchases.filter((p) => p.taskId === task.id);
  return { task: sum(inTask), user: sum(purchases), purchasesInTask: inTask.length };
}

export function buildFacts(input: {
  offer: NormalizedOffer;
  intent: Intent;
  task: Task;
  /** The user's earlier purchases, over all tasks. */
  purchases: Purchase[];
  /** The URL the agent asked for, normalized. */
  requestedUrl: string;
}): JudgeFacts {
  const { offer, intent, task, purchases, requestedUrl } = input;
  const amount = BigInt(offer.amount);
  const budget = BigInt(task.budget);
  const inTask = purchases.filter((p) => p.taskId === task.id);
  const toRecipient = purchases.filter((p) => sameAddress(p.payTo, offer.payTo)).length;
  const inTaskToRecipient = inTask.filter((p) => sameAddress(p.payTo, offer.payTo)).length;

  return {
    amount: usdc(amount),
    within_task_budget: sum(inTask) + amount <= budget ? 'yes' : 'no',
    share_of_task_budget: budget > 0n ? `${(amount * 100n) / budget} %` : 'n/a',
    recipient_history:
      toRecipient === 0
        ? 'first payment to this recipient'
        : `${toRecipient} earlier payment(s) to this recipient`,
    matches_recorded_payment_request: sameUrl(offer.resourceUrl, requestedUrl) ? 'yes' : 'no',
    previous_purchases_for_task:
      inTask.length === 0
        ? 'none'
        : `${inTask.length} purchase(s), ${usdc(sum(inTask))} in total, ${inTaskToRecipient} of them to this recipient`,
    repeat_plan: `purchase ${inTask.length + 1} of ${intent.plannedPurchases} the task plans`,
  };
}

function sameUrl(a: string, b: string) {
  try {
    return new URL(a).toString() === new URL(b).toString();
  } catch {
    return false;
  }
}
