import type { Intent } from '@semanticauth/contracts';
import type { JudgeOutcome, ScreenOutcome } from '../../domain/decision/decide';
import type { JudgeFacts } from '../../domain/facts/facts';

/**
 * Semantic checks. Screen sees only untrusted merchant text; Judge never does.
 * Any thrown error is treated as "Jev unavailable" and blocks the operation.
 */
export interface JevClient {
  screen(input: { merchantText: unknown }): Promise<ScreenOutcome>;
  judge(input: { intent: Intent; facts: JudgeFacts; screen: ScreenOutcome }): Promise<JudgeOutcome>;
}

// TODO(jev): real Jev API client (next step). This stub finds nothing and lets everything fit.
export function createPassThroughJev(): JevClient {
  return {
    screen: async () => ({ signals: [] }),
    judge: async () => ({ fitsIntent: true }),
  };
}
