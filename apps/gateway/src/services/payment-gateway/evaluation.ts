import type { Intent, NormalizedOffer, Task } from '@semanticauth/contracts';
import type { JevClient } from '../../adapters/jev/jev-client';
import { decide, type Decision } from '../../domain/decision/decide';
import { buildFacts, type Purchase } from '../../domain/facts/facts';
import { toJudgeState, type ScreenState } from '../../domain/jev/state';
import type { Policy } from '../../domain/policy/policy';

/**
 * Policy → Screen → Judge → decision table. Policy runs first and a Policy block means Jev is
 * never called. Any Jev failure blocks (fail closed): there is no ALLOW without both checks.
 */
export async function evaluateOffer(
  deps: { policy: Policy; jev: JevClient },
  input: {
    offer: NormalizedOffer;
    /** Untrusted merchant text; goes to Screen only. */
    screenState: ScreenState;
    intent: Intent;
    task: Task;
    purchases: Purchase[];
    allocation: bigint;
    requestedUrl: string;
  },
): Promise<Decision> {
  const { offer, screenState, intent, task, purchases, allocation, requestedUrl } = input;
  const amount = BigInt(offer.amount);

  const policy = deps.policy({ offer, intent, task, purchases, allocation });
  if (!policy.ok) return decide({ policy, amount });

  try {
    const screen = await deps.jev.screen(screenState);
    // Judge gets the intent, code-computed facts and Screen's option keys, never merchant text.
    const facts = buildFacts({ offer, intent, task, purchases, requestedUrl });
    const judge = await deps.jev.judge(toJudgeState({ intent, facts, screen }));
    return decide({ policy, amount, screen, judge });
  } catch (err) {
    console.warn('Jev failed, blocking:', err instanceof Error ? err.message : err);
    return decide({ policy, amount });
  }
}
