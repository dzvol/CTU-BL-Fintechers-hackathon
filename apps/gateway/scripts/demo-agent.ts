// Fake agent for manual end-to-end testing: submits an intent over MCP like a real harness would,
// then waits until you approve or reject it in the dashboard and prints the resulting task.
//
// Usage: npm run demo:agent -- <api key> [gateway url]
//   gateway url defaults to $GATEWAY_URL or http://localhost:8787
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { IntentProposal } from '@semanticauth/contracts';

const POLL_INTERVAL_MS = 2000;

const proposal: IntentProposal = {
  purpose: 'Buy crypto market data for a research note',
  task: 'Get a snapshot of the crypto market today (top coins, prices, 24h change)',
  allowedPurchases: ['crypto market data APIs'],
  forbidden: ['trading, investments or deposits', 'payments to individuals'],
  budgetUsdc: '1.00',
  maxPerPurchaseUsdc: '0.25',
  plannedPurchases: 4,
};

const [key, gatewayUrl = process.env.GATEWAY_URL ?? 'http://localhost:8787'] =
  process.argv.slice(2);
if (!key) {
  console.error('Usage: npm run demo:agent -- <api key> [gateway url]');
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
      {
        cause: err,
      },
    );
  }
  log(`Connected to ${gatewayUrl}/mcp`);

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
    const result = await call('get_intent_status', { intentId: submitted.intentId });
    status = result.status;
  }
  log(`\n\nIntent ${status}`);

  if (status === 'approved') {
    const { task } = await call('get_task');
    log('\nActive task:', task);
  }
}

main()
  .catch((err: Error) => {
    console.error(`\n${err.message}`);
    process.exitCode = 1;
  })
  .finally(() => client.close());
