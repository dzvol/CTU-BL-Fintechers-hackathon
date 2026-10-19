/**
 * Gateway client for the CLI (`auth`, `doctor`). It talks MCP over Streamable HTTP, the same
 * transport the harnesses use, plus the small `/v1` REST surface.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import {
  StreamableHTTPClientTransport,
  StreamableHTTPError,
} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {
  type ApiError,
  ApiErrorSchema,
  CheckReviewResultSchema,
  GetIntentStatusResultSchema,
  GetTaskResultSchema,
  IntentTemplateSchema,
  type McpToolName,
  PaidFetchResultSchema,
  SubmitIntentResultSchema,
  type WhoAmI,
  WhoAmISchema,
} from '@semanticauth/contracts';
import type { z } from 'zod';

export class GatewayAuthError extends Error {
  constructor(message = 'The gateway rejected the API key (invalid or revoked).') {
    super(message);
    this.name = 'GatewayAuthError';
  }
}

export class GatewayUnreachableError extends Error {
  constructor(url: string, cause?: unknown) {
    super(`The gateway at ${url} is not reachable.`, { cause });
    this.name = 'GatewayUnreachableError';
  }
}

/** The gateway answered, but not in the shape the contract promises. */
export class GatewayProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GatewayProtocolError';
  }
}

const TOOL_RESULT_SCHEMAS = {
  get_intent_template: IntentTemplateSchema,
  submit_intent: SubmitIntentResultSchema,
  get_intent_status: GetIntentStatusResultSchema,
  get_task: GetTaskResultSchema,
  paid_fetch: PaidFetchResultSchema,
  check_review: CheckReviewResultSchema,
} as const satisfies Record<McpToolName, z.ZodType>;

export type ToolResult<T extends McpToolName> = z.infer<(typeof TOOL_RESULT_SCHEMAS)[T]>;

/** Expected negative outcomes (no task, not implemented, …) are data, not exceptions. */
export type ToolOutcome<T extends McpToolName> =
  { ok: true; result: ToolResult<T> } | { ok: false; error: ApiError['error'] };

/** `https://gw.example.com/` → `https://gw.example.com` */
export function normalizeGatewayUrl(gatewayUrl: string): string {
  return gatewayUrl.replace(/\/+$/, '').replace(/\/mcp$/, '');
}

/** `https://gw.example.com/` → `https://gw.example.com/mcp` */
export function mcpEndpoint(gatewayUrl: string): string {
  return `${normalizeGatewayUrl(gatewayUrl)}/mcp`;
}

export interface GatewayClientOptions {
  gatewayUrl: string;
  apiKey: string;
  clientName?: string;
  /** Injected in tests. */
  fetch?: typeof fetch;
}

function errorText(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  const cause = err.cause instanceof Error ? ` ${err.cause.message}` : '';
  return `${err.message}${cause}`;
}

function isAuthError(err: unknown): boolean {
  if (err instanceof StreamableHTTPError && (err.code === 401 || err.code === 403)) return true;
  return /\b(401|403)\b|unauthorized|invalid_api_key/i.test(errorText(err));
}

function isNetworkError(err: unknown): boolean {
  return /fetch failed|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|ETIMEDOUT|ECONNRESET|network/i.test(
    errorText(err),
  );
}

/** `GET /v1/whoami`: the cheapest way to check a key and see whose it is. */
export async function whoami(opts: GatewayClientOptions): Promise<WhoAmI> {
  const url = `${normalizeGatewayUrl(opts.gatewayUrl)}/v1/whoami`;
  let res: Response;
  try {
    res = await (opts.fetch ?? fetch)(url, {
      headers: { authorization: `Bearer ${opts.apiKey}` },
    });
  } catch (err) {
    throw new GatewayUnreachableError(url, err);
  }
  const body: unknown = await res.json().catch(() => undefined);
  if (res.status === 401 || res.status === 403) throw new GatewayAuthError();
  if (!res.ok) {
    const error = ApiErrorSchema.safeParse(body);
    throw new GatewayProtocolError(
      error.success
        ? `whoami failed: ${error.data.error.code} (${error.data.error.message})`
        : `whoami failed with HTTP ${res.status}`,
    );
  }
  const parsed = WhoAmISchema.safeParse(body);
  if (!parsed.success) throw new GatewayProtocolError('whoami returned an unexpected body');
  return parsed.data;
}

export class GatewayClient {
  private constructor(
    private readonly client: Client,
    readonly endpoint: string,
  ) {}

  static async connect(opts: GatewayClientOptions): Promise<GatewayClient> {
    const endpoint = mcpEndpoint(opts.gatewayUrl);
    const client = new Client({ name: opts.clientName ?? 'semanticauth-cli', version: '0.0.0' });
    const transport = new StreamableHTTPClientTransport(new URL(endpoint), {
      requestInit: { headers: { authorization: `Bearer ${opts.apiKey}` } },
      fetch: opts.fetch,
    });
    try {
      await client.connect(transport);
    } catch (err) {
      await client.close().catch(() => {});
      if (isAuthError(err)) throw new GatewayAuthError();
      if (isNetworkError(err)) throw new GatewayUnreachableError(endpoint, err);
      throw err;
    }
    return new GatewayClient(client, endpoint);
  }

  /** Server instructions from the MCP handshake, if the gateway sends any. */
  get instructions(): string | undefined {
    return this.client.getInstructions();
  }

  async listToolNames(): Promise<string[]> {
    const { tools } = await this.client.listTools();
    return tools.map((t) => t.name);
  }

  /** Calls a gateway tool and checks the result against the contract. */
  async call<T extends McpToolName>(
    name: T,
    args: Record<string, unknown> = {},
  ): Promise<ToolOutcome<T>> {
    let res: Awaited<ReturnType<Client['callTool']>>;
    try {
      res = await this.client.callTool({ name, arguments: args });
    } catch (err) {
      if (isAuthError(err)) throw new GatewayAuthError();
      throw err;
    }
    const raw = res.structuredContent ?? parseTextContent(res.content);
    if (res.isError) {
      const error = ApiErrorSchema.safeParse(raw);
      if (!error.success) throw new GatewayProtocolError(`${name} failed without an error body`);
      return { ok: false, error: error.data.error };
    }
    const parsed = TOOL_RESULT_SCHEMAS[name].safeParse(raw);
    if (!parsed.success) {
      throw new GatewayProtocolError(`${name} result does not match the contract`);
    }
    return { ok: true, result: parsed.data as ToolResult<T> };
  }

  async close(): Promise<void> {
    await this.client.close();
  }
}

function parseTextContent(content: unknown): unknown {
  if (!Array.isArray(content)) return undefined;
  const text: unknown = content.find(
    (c: unknown) => typeof c === 'object' && c !== null && 'type' in c && c.type === 'text',
  );
  if (!text || typeof text !== 'object' || !('text' in text) || typeof text.text !== 'string') {
    return undefined;
  }
  try {
    return JSON.parse(text.text) as unknown;
  } catch {
    return undefined;
  }
}
