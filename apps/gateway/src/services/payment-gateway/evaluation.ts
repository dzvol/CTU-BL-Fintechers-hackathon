import type { Intent, NormalizedOffer, Task } from '@semanticauth/contracts';
import type { JevClient } from '../../adapters/jev/jev-client';
import { decide, type Decision } from '../../domain/decision/decide';
import { buildFacts } from '../../domain/facts/facts';
import type { Policy } from '../../domain/policy/policy';

/**
 * Policy → Screen → Judge → decision table. Policy runs first and a Policy block means Jev is
 * never called. Any Jev failure blocks (fail closed): there is no ALLOW without both checks.
 */
export async function evaluateOffer(
  deps: { policy: Policy; jev: JevClient },
  input: { offer: NormalizedOffer; merchantText: unknown; intent: Intent; task: Task },
): Promise<Decision> {
  const { offer, merchantText, intent, task } = input;

  const policy = deps.policy({ offer, intent, task });
  if (!policy.ok) return decide({ policy });

  try {
    // Only Screen sees merchant text; Judge gets the intent, code-computed facts and Screen's output.
    const screen = await deps.jev.screen({ merchantText });
    const judge = await deps.jev.judge({ intent, facts: buildFacts({ offer, task }), screen });
    return decide({ policy, screen, judge });
  } catch (err) {
    console.warn('Jev failed, blocking:', err instanceof Error ? err.message : err);
    return decide({ policy });
  }
}
