import { z } from 'zod';
import {
  X402JsonSchema,
  X402PaymentPayloadSchema,
  X402PaymentRequiredSchema,
  X402PaymentResponseSchema,
  X402RequestSchema,
} from './schemas';
import type { X402Json, X402PaymentRequired, X402PaymentResponse, X402Request } from './schemas';

export const PAYMENT_REQUIRED_HEADER = 'PAYMENT-REQUIRED';
export const PAYMENT_SIGNATURE_HEADER = 'PAYMENT-SIGNATURE';
export const PAYMENT_RESPONSE_HEADER = 'PAYMENT-RESPONSE';

export interface X402HttpResponse {
  url: string;
  status: number;
  headers: Record<string, string>;
  contentType?: string;
  rawBody: Uint8Array;
  body: X402Json;
  bodyFormat: 'json' | 'text' | 'base64' | 'empty';
  bodyText?: string;
}

export type X402PaymentMetadata =
  { status: 'absent' } | { status: 'valid'; value: X402PaymentResponse } | { status: 'invalid' };

interface ReceivedResponse {
  response: X402HttpResponse;
  /** Merchant claims only. ChainReader must independently verify settlement. */
  paymentResponse: X402PaymentMetadata;
  /** True once fetch was invoked with the authorization, even if no response arrived. */
  paymentAttempted: boolean;
}

export type X402TransportResult =
  | (ReceivedResponse & {
      kind: 'payment_required';
      paymentRequired: X402PaymentRequired;
      normalizerInput: X402PaymentRequired & { additionalContent: X402Json };
    })
  | (ReceivedResponse & {
      kind: 'content' | 'http_error';
      normalizerInput: { data: X402Json };
    })
  | (ReceivedResponse & {
      kind: 'invalid_response';
      reason: 'invalid_payment_required' | 'invalid_payment_response';
      normalizerInput: { data: X402Json };
    })
  | {
      kind: 'transport_error';
      reason: 'timeout' | 'network_error' | 'response_too_large';
      paymentAttempted: boolean;
    }
  | {
      kind: 'invalid_request';
      reason: 'invalid_request' | 'unsupported_url' | 'invalid_payment_signature';
      paymentAttempted: false;
    };

export interface X402Transport {
  fetchResource(request: X402Request): Promise<X402TransportResult>;
  /** Call only after approval, reservation, and persistence of this exact header as issued. */
  fetchWithPayment(request: X402Request, paymentSignature: string): Promise<X402TransportResult>;
}

export interface X402TransportConfig {
  fetch?: (url: string, init: RequestInit) => Promise<Response>;
  timeoutMs?: number;
  maxResponseBytes?: number;
  /** Explicit development opt-in for the HTTP merchants on localhost. */
  allowHttpLocalhost?: boolean;
}

const configSchema = z.object({
  timeoutMs: z.number().int().positive().max(2_147_483_647).default(15_000),
  maxResponseBytes: z
    .number()
    .int()
    .positive()
    .default(2 * 1024 * 1024),
  allowHttpLocalhost: z.boolean().default(false),
});

function decodeHeader(header: unknown): unknown {
  // Buffer's base64 decoder silently accepts malformed characters; require canonical base64.
  if (typeof header !== 'string' || header.length === 0 || header.length > 65_536) return undefined;
  const bytes = Buffer.from(header, 'base64');
  if (bytes.toString('base64') !== header) return undefined;
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

/** Encode once, persist this value as issued, and pass it unchanged to fetchWithPayment. */
export function encodePaymentSignature(payload: unknown): string {
  const parsed = X402PaymentPayloadSchema.parse(payload);
  return Buffer.from(JSON.stringify(parsed), 'utf8').toString('base64');
}

class ResponseTooLargeError extends Error {}

async function readBody(
  response: Response,
  signal: AbortSignal,
  limit: number,
): Promise<Uint8Array> {
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const cancel = () => {
    void reader.cancel().catch(() => undefined);
  };
  signal.addEventListener('abort', cancel, { once: true });
  try {
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      signal.throwIfAborted();
      const { done, value } = await reader.read();
      signal.throwIfAborted();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        cancel();
        throw new ResponseTooLargeError();
      }
      chunks.push(value);
    }
    return Buffer.concat(chunks, size);
  } finally {
    signal.removeEventListener('abort', cancel);
    reader.releaseLock();
  }
}

function describeResponse(response: Response, rawBody: Uint8Array, url: string): X402HttpResponse {
  const contentType = response.headers.get('content-type') ?? undefined;
  const mediaType = contentType?.split(';')[0]?.trim().toLowerCase();
  const base = {
    url: response.url || url,
    status: response.status,
    headers: Object.fromEntries(response.headers),
    ...(contentType !== undefined && { contentType }),
    rawBody,
  };
  if (rawBody.byteLength === 0) {
    return { ...base, body: null, bodyFormat: 'empty', bodyText: '' };
  }
  const isJson = mediaType === 'application/json' || mediaType?.endsWith('+json');
  const isText =
    !mediaType ||
    isJson ||
    mediaType.startsWith('text/') ||
    mediaType.endsWith('xml') ||
    mediaType === 'application/javascript' ||
    mediaType === 'application/x-www-form-urlencoded';
  if (!isText) {
    return { ...base, body: Buffer.from(rawBody).toString('base64'), bodyFormat: 'base64' };
  }
  const bodyText = new TextDecoder().decode(rawBody);
  if (isJson) {
    try {
      const json: unknown = JSON.parse(bodyText);
      const parsed = X402JsonSchema.safeParse(json);
      if (parsed.success) return { ...base, body: parsed.data, bodyFormat: 'json', bodyText };
    } catch {
      // Malformed JSON can itself contain an injection; retain it as text for Screen.
    }
  }
  return { ...base, body: bodyText, bodyFormat: 'text', bodyText };
}

function paymentMetadata(response: X402HttpResponse): X402PaymentMetadata {
  const header = response.headers[PAYMENT_RESPONSE_HEADER.toLowerCase()];
  if (header === undefined) return { status: 'absent' };
  const parsed = X402PaymentResponseSchema.safeParse(decodeHeader(header));
  return parsed.success ? { status: 'valid', value: parsed.data } : { status: 'invalid' };
}

function classify(response: X402HttpResponse, paymentAttempted: boolean): X402TransportResult {
  const paymentResponse = paymentMetadata(response);
  const received = { response, paymentResponse, paymentAttempted };
  const normalizerInput = { data: response.body };
  if (response.status === 402) {
    const header = response.headers[PAYMENT_REQUIRED_HEADER.toLowerCase()];
    // Body-only v2 messages support the documented templates; an invalid header never falls back.
    const parsed = X402PaymentRequiredSchema.safeParse(
      header !== undefined ? decodeHeader(header) : response.body,
    );
    if (!parsed.success) {
      return {
        ...received,
        kind: 'invalid_response',
        reason: 'invalid_payment_required',
        normalizerInput,
      };
    }
    return {
      ...received,
      kind: 'payment_required',
      paymentRequired: parsed.data,
      normalizerInput: { ...parsed.data, additionalContent: response.body },
    };
  }
  if (paymentResponse.status === 'invalid') {
    return {
      ...received,
      kind: 'invalid_response',
      reason: 'invalid_payment_response',
      normalizerInput,
    };
  }
  return {
    ...received,
    kind: response.status >= 200 && response.status < 300 ? 'content' : 'http_error',
    normalizerInput,
  };
}

/** HTTP x402 v2 transport. Each method performs at most one HTTP request. */
export function createHttpX402Transport(config: X402TransportConfig = {}): X402Transport {
  const options = configSchema.parse(config);
  const fetcher = config.fetch ?? globalThis.fetch;

  async function send(
    request: X402Request,
    paymentSignature?: string,
  ): Promise<X402TransportResult> {
    const parsed = X402RequestSchema.safeParse(request);
    if (!parsed.success) {
      return { kind: 'invalid_request', reason: 'invalid_request', paymentAttempted: false };
    }
    const input = parsed.data;
    const url = new URL(input.url);
    const localhost = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (
      url.username ||
      url.password ||
      url.hash ||
      (url.protocol !== 'https:' &&
        !(options.allowHttpLocalhost && localhost && url.protocol === 'http:'))
    ) {
      return { kind: 'invalid_request', reason: 'unsupported_url', paymentAttempted: false };
    }
    let headers: Headers;
    try {
      headers = new Headers(input.headers);
    } catch {
      return { kind: 'invalid_request', reason: 'invalid_request', paymentAttempted: false };
    }
    if (headers.has(PAYMENT_SIGNATURE_HEADER) || headers.has('X-PAYMENT')) {
      return { kind: 'invalid_request', reason: 'invalid_request', paymentAttempted: false };
    }
    if (paymentSignature !== undefined) {
      const payload = X402PaymentPayloadSchema.safeParse(decodeHeader(paymentSignature));
      if (
        !payload.success ||
        (payload.data.resource && payload.data.resource.url !== url.toString())
      ) {
        return {
          kind: 'invalid_request',
          reason: 'invalid_payment_signature',
          paymentAttempted: false,
        };
      }
      headers.set(PAYMENT_SIGNATURE_HEADER, paymentSignature);
    }
    const signal = AbortSignal.timeout(options.timeoutMs);
    const paymentAttempted = paymentSignature !== undefined;
    try {
      const response = await fetcher(url.toString(), {
        method: input.method,
        headers,
        body: input.body,
        redirect: 'manual',
        signal,
      });
      const bytes = await readBody(response, signal, options.maxResponseBytes);
      return classify(describeResponse(response, bytes, url.toString()), paymentAttempted);
    } catch (error) {
      return {
        kind: 'transport_error',
        reason: signal.aborted
          ? 'timeout'
          : error instanceof ResponseTooLargeError
            ? 'response_too_large'
            : 'network_error',
        paymentAttempted,
      };
    }
  }

  return {
    fetchResource: (request) => send(request),
    fetchWithPayment: (request, paymentSignature) => send(request, paymentSignature),
  };
}
