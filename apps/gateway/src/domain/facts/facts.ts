import { formatUsdc, type NormalizedOffer, type Task } from '@semanticauth/contracts';

/** Code-computed facts for Judge. Never contains merchant text. */
export type JudgeFacts = Record<string, string>;

// TODO(facts): recipient history, previous purchases, repeat plan, matches recorded request.
export function buildFacts(input: { offer: NormalizedOffer; task: Task }): JudgeFacts {
  const { offer, task } = input;
  const budget = BigInt(task.budget);
  return {
    amount: `${formatUsdc(offer.amount)} USDC`,
    within_task_budget: BigInt(offer.amount) <= budget ? 'yes' : 'no',
    share_of_task_budget: budget > 0n ? `${(BigInt(offer.amount) * 100n) / budget} %` : 'n/a',
  };
}
