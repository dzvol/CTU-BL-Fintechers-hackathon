// Runs Policy, Screen and Judge with the real Jev API over every test-merchant scenario and prints
// expected vs actual verdicts. Pays nothing and needs no gateway, login or offer selection: the
// offer is read straight from the 402, which is fine for tuning questions and thresholds only.
//
// Usage: npm run jev:eval -- [merchants url] [--answers]
//   merchants url defaults to $MERCHANTS_BASE_URL or http://localhost:4021
//   --answers     also prints every Screen and Judge answer
// Needs JEV_API_KEY in .env.
import { newId, parseUsdc, type Intent, type Task } from '@semanticauth/contracts';
import { createHttpJevClient, type JevClient } from '../src/adapters/jev/jev-client';
import { createHttpX402Transport } from '../src/adapters/x402';
import { loadConfig } from '../src/config';
import { toScreenState } from '../src/domain/jev/state';
import { mapPaymentRequired } from '../src/domain/normalizer';
import { defaultPolicy } from '../src/domain/policy/policy';
import { evaluateOffer } from '../src/services/payment-gateway/evaluation';

/** Base Sepolia USDC, the only token the gateway pays with. */
const USDC = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';

const args = process.argv.slice(2);
const showAnswers = args.includes('--answers');
const merchantsUrl =
  args.find((a) => !a.startsWith('--')) ??
  process.env.MERCHANTS_BASE_URL ??
  'http://localhost:4021';

const config = loadConfig();
if (!config.jev) {
  console.error('Set JEV_API_KEY in .env first.');
  process.exit(1);
}

// The same intent the demo agent submits.
const at = new Date().toISOString();
const intent: Intent = {
  id: newId('int'),
  userId: newId('usr'),
  apiKeyId: newId('key'),
  status: 'approved',
  purpose: 'Buy crypto market data for a research note',
  task: 'Get a snapshot of the crypto market today (top coins, prices, 24h change)',
  allowedPurchases: ['crypto market data APIs'],
  forbidden: ['trading, investments or deposits', 'gambling', 'payments to individuals'],
  budget: parseUsdc('1.00').toString(),
  maxPerPurchase: parseUsdc('0.25').toString(),
  plannedPurchases: 8,
  createdAt: at,
  expiresAt: at,
};
const task: Task = {
  id: newId('task'),
  intentId: intent.id,
  userId: intent.userId,
  apiKeyId: intent.apiKeyId,
  status: 'active',
  budget: intent.budget,
  spent: '0',
  reserved: '0',
  createdAt: at,
  expiresAt: at,
};

const http = createHttpJevClient(config.jev);
const answers: Record<string, unknown> = {};
const jev: JevClient = {
  screen: async (state) => (answers.screen = await http.screen(state)),
  judge: async (state) => (answers.judge = await http.judge(state)),
};
const transport = createHttpX402Transport({ allowHttpLocalhost: true });

interface Scenario {
  path: string;
  expected: string;
  decidedBy: string;
}

async function main() {
  const scenarios = (await (await fetch(new URL('/scenarios', merchantsUrl))).json()) as Scenario[];
  console.log(`Jev ${config.jev!.model} over ${scenarios.length} scenarios at ${merchantsUrl}\n`);

  const rows = [];
  for (const scenario of scenarios) {
    const url = new URL(scenario.path, merchantsUrl).toString();
    const row = {
      path: scenario.path,
      expected: scenario.expected,
      'decided by': scenario.decidedBy,
    };
    const result = await transport.fetchResource({ url });
    if (result.kind !== 'payment_required') {
      rows.push({ ...row, verdict: result.kind });
      continue;
    }
    const screenInput = mapPaymentRequired(result.normalizerInput);
    const option = result.paymentRequired.accepts[0]!;
    if (!screenInput.success || option.network !== 'eip155:84532' || option.asset !== USDC) {
      rows.push({ ...row, verdict: 'BLOCK', reason: 'unsupported_offer' });
      continue;
    }

    delete answers.screen;
    delete answers.judge;
    const decision = await evaluateOffer(
      { policy: defaultPolicy, jev },
      {
        offer: {
          scheme: 'exact',
          network: 'base-sepolia',
          asset: option.asset,
          payTo: option.payTo,
          amount: option.amount,
          resourceUrl: result.paymentRequired.resource.url,
        },
        screenState: toScreenState(screenInput.queries[0]!),
        intent,
        task,
        purchases: [],
        allocation: config.userAllocation,
        requestedUrl: url,
      },
    );
    rows.push({
      ...row,
      verdict: decision.verdict,
      reason: decision.reason,
      detail: decision.detail,
    });
    if (showAnswers) console.log(scenario.path, JSON.stringify(answers, null, 2), '\n');
  }
  console.table(rows);
}

main().catch((err: Error) => {
  console.error(err.message);
  process.exitCode = 1;
});
