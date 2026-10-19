// Fake agent for manual end-to-end testing. Like a real harness it talks to the gateway over MCP:
//   1. reuses the key's active task, or submits an intent and waits for your dashboard decision,
//   2. calls paid_fetch on every test-merchant scenario and prints expected vs actual outcome,
//   3. for each REVIEW waits for your dashboard decision and, if approved, calls paid_fetch again.
//
// Usage: npm run demo:agent -- <api key> [gateway url] [merchants url]
//   gateway url   defaults to $GATEWAY_URL or http://localhost:8787
//   merchants url defaults to $MERCHANTS_BASE_URL or http://localhost:4021
//                 (local merchants need X402_ALLOW_HTTP_LOCALHOST=true in the gateway's .env;
//                  the deployed ones: https://fintechers-hackathon-production.up.railway.app)
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { IntentProposal } from '@semanticauth/contracts';

const POLL_INTERVAL_MS = 2000;

const proposal: IntentProposal = {
  purpose: 'Buy crypto market data for a research note',
  task: 'Get a snapshot of the crypto market today (top coins, prices, 24h change)',
  allowedPurchases: ['crypto market data APIs'],
  forbidden: ['trading, investments or deposits', 'gambling', 'payments to individuals'],
  budgetUsdc: '1.00',
  maxPerPurchaseUsdc: '0.25',
  plannedPurchases: 8,
};

const [
  key,
  gatewayUrl = process.env.GATEWAY_URL ?? 'http://localhost:8787',
  merchantsUrl = process.env.MERCHANTS_BASE_URL ?? 'http://localhost:4021',
] = process.argv.slice(2);
if (!key) {
  console.error('Usage: npm run demo:agent -- <api key> [gateway url] [merchants url]');
  process.exit(1);
}

class ToolError extends Error {}

const client = new Client({ name: 'semanticauth-demo-agent', version: '0.0.0' });

/** Calls an MCP tool and returns its structured result; tool errors become ToolError. */
async function call(name: string, args: Record<string, unknown> = {}) {
  const result = await client.callTool({ name, arguments: args });
  const text = (result.content as { type: string; text?: string }[])[0]?.text ?? '';
  if (result.isError) throw new ToolError(`${name} failed: ${text}`);
  return (result.structuredContent ?? JSON.parse(text)) as Record<string, any>;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const log = (message: string, data?: unknown) =>
  console.log(data === undefined ? message : `${message}\n${JSON.stringify(data, null, 2)}`);

/** Reuses the active task or gets a new one approved; returns false if none was approved. */
async function ensureTask(): Promise<boolean> {
  const { task: active } = await call('get_task');
  if (active) {
    log(`\nReusing the active task ${active.id} (close it in the dashboard to start over).`);
    return true;
  }

  const template = await call('get_intent_template');
  log(`\nTemplate requires: ${(template.schema.required as string[]).join(', ')}`);

  const submitted = await call('submit_intent', proposal);
  log('\nSubmitted intent:', proposal);
  log(`\nintentId: ${submitted.intentId}`);
  log(`Approve or reject it in the dashboard: ${submitted.approvalUrl} (click Refresh)`);

  let status = submitted.status as string;
  process.stdout.write('\nWaiting for your decision');
  while (status === 'pending_approval') {
    await sleep(POLL_INTERVAL_MS);
    process.stdout.write('.');
    status = (await call('get_intent_status', { intentId: submitted.intentId })).status;
  }
  log(`\n\nIntent ${status}`);
  if (status !== 'approved') return false;

  log('\nActive task:', (await call('get_task')).task);
  return true;
}

interface Scenario {
  path: string;
  expected: string;
  decidedBy: string;
}

/** Calls paid_fetch on every merchant scenario and prints expected vs actual. */
async function runScenarios() {
  let scenarios: Scenario[];
  try {
    scenarios = (await (await fetch(new URL('/scenarios', merchantsUrl))).json()) as Scenario[];
  } catch {
    log(`\nMerchants not reachable at ${merchantsUrl}/scenarios; skipping paid_fetch.`);
    log('Start them with `npm run dev:merchants` or pass the deployed URL as 3rd argument.');
    return;
  }

  log(`\nCalling paid_fetch on ${scenarios.length} scenarios at ${merchantsUrl} ...`);
  const rows = [];
  const settled: { path: string; explorerUrl: string }[] = [];
  const underReview: { path: string; url: string; operationId: string }[] = [];
  for (const scenario of scenarios) {
    const url = new URL(scenario.path, merchantsUrl).toString();
    try {
      const result = await call('paid_fetch', { url });
      rows.push({
        path: scenario.path,
        expected: scenario.expected,
        'decided by': scenario.decidedBy,
        state: result.state,
        verdict: result.verdict ?? '',
        reason: result.reason ?? '',
      });
      if (result.settlement) {
        settled.push({ path: scenario.path, explorerUrl: result.settlement.explorerUrl });
      }
      if (result.state === 'awaiting_review') {
        underReview.push({ path: scenario.path, url, operationId: result.operationId });
      }
    } catch (err) {
      rows.push({
        path: scenario.path,
        expected: scenario.expected,
        state: (err as Error).message,
      });
    }
  }
  console.table(rows);
  for (const { path, explorerUrl } of settled) log(`${path} paid: ${explorerUrl}`);
  log('\nFull messages are on the operations in the dashboard API (GET /api/operations).');
  for (const review of underReview) await resumeReview(review);
}

/** Waits for the user's decision on one REVIEW and resumes the purchase if approved. */
async function resumeReview(review: { path: string; url: string; operationId: string }) {
  process.stdout.write(`\n${review.path} needs your review in the dashboard (click Refresh)`);
  let check = await call('check_review', { operationId: review.operationId });
  while (check.status === 'pending') {
    await sleep(POLL_INTERVAL_MS);
    process.stdout.write('.');
    check = await call('check_review', { operationId: review.operationId });
  }
  log(`\nReview ${check.status}: ${check.message}`);
  if (check.status !== 'approved') return;
  const result = await call('paid_fetch', { url: review.url });
  log(`paid_fetch again → ${result.state}: ${result.message}`);
  if (result.settlement) log(`Transaction: ${result.settlement.explorerUrl}`);
}

async function main() {
  try {
    await client.connect(
      new StreamableHTTPClientTransport(new URL('/mcp', gatewayUrl), {
        requestInit: { headers: { authorization: `Bearer ${key}` } },
      }),
    );
  } catch (err) {
    throw new Error(
      `Cannot connect to ${gatewayUrl}/mcp (is the gateway running, is the key valid?)`,
      { cause: err },
    );
  }
  log(`Connected to ${gatewayUrl}/mcp`);

  if (await ensureTask()) await runScenarios();
}

main()
  .catch((err: Error) => {
    console.error(`\n${err.message}`);
    process.exitCode = 1;
  })
  .finally(() => client.close());
