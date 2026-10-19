import { randomBytes } from 'node:crypto';
import { parseUsdc, UsdcDecimalSchema } from '@semanticauth/contracts';
import { z } from 'zod';
import { loadChainReaderConfig, type ChainReaderConfig } from './adapters/chain-reader';
import type { JevConfig } from './adapters/jev/jev-client';
import { loadSignerConfig, type SignerConfig } from './adapters/signer';

const optional = z
  .string()
  .optional()
  .transform((value) => value || undefined);

/** Relative to apps/gateway, where npm runs the gateway scripts. */
export const DEFAULT_DATABASE_PATH = './data/semanticauth.db';

const EnvSchema = z.object({
  NODE_ENV: z.string().default('development'),
  PORT: z.coerce.number().int().positive().default(8787),
  WEB_BASE_URL: z.url().default('http://localhost:5173'),
  DATABASE_PATH: z.string().min(1).default(DEFAULT_DATABASE_PATH),
  GOOGLE_CLIENT_ID: optional,
  GOOGLE_CLIENT_SECRET: optional,
  GOOGLE_REDIRECT_URI: optional.pipe(z.url().optional()),
  SESSION_SECRET: optional.pipe(
    z.string().min(32, 'generate one with: openssl rand -hex 32').optional(),
  ),
  USER_ALLOCATION_USDC: UsdcDecimalSchema.default('5'),
  SPONSOR_POOL_USDC: UsdcDecimalSchema.default('20'),
  // Only whether it is set; the Signer reads the value itself and nothing else may.
  SPONSOR_PRIVATE_KEY: optional,
  X402_ALLOW_HTTP_LOCALHOST: z.stringbool().default(false),
  JEV_API_URL: optional.pipe(z.url().optional()),
  JEV_API_KEY: optional,
  JEV_MODEL: optional,
  JEV_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
});

const DEFAULT_JEV_API_URL = 'https://api.typesafe.ai';
const DEFAULT_JEV_MODEL = 'jev-1.13.0';

export interface GoogleConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export interface Config {
  port: number;
  webBaseUrl: string;
  databasePath: string;
  /** Undefined when GOOGLE_* env is missing; login then answers 503 so the rest still runs. */
  google: GoogleConfig | undefined;
  sessionSecret: string;
  secureCookies: boolean;
  userAllocation: bigint;
  /** Dev only: lets the gateway call merchants on http://localhost (tests/merchants). */
  x402AllowHttpLocalhost: boolean;
  /** Undefined without JEV_API_KEY; every paid offer is then blocked (fail closed). */
  jev: JevConfig | undefined;
  payments: PaymentsConfig;
}

export interface PaymentsConfig {
  /** Undefined without SPONSOR_PRIVATE_KEY; every paid offer is then blocked (fail closed). */
  signer: SignerConfig | undefined;
  chainReader: ChainReaderConfig;
  /** Total the sponsor pool hands out over all users (ledger reservation limit). */
  poolLimit: bigint;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    throw new Error(`Invalid environment:\n${z.prettifyError(parsed.error)}`);
  }
  const e = parsed.data;
  const isProduction = e.NODE_ENV === 'production';

  const google =
    e.GOOGLE_CLIENT_ID && e.GOOGLE_CLIENT_SECRET && e.GOOGLE_REDIRECT_URI
      ? {
          clientId: e.GOOGLE_CLIENT_ID,
          clientSecret: e.GOOGLE_CLIENT_SECRET,
          redirectUri: e.GOOGLE_REDIRECT_URI,
        }
      : undefined;

  if (!e.SESSION_SECRET && isProduction) {
    throw new Error('SESSION_SECRET is required in production');
  }
  if (!google) console.warn('GOOGLE_* env not set: Google login is disabled');
  if (!e.JEV_API_KEY) console.warn('JEV_API_KEY not set: every paid offer is blocked by Jev');
  if (!e.SPONSOR_PRIVATE_KEY) {
    console.warn('SPONSOR_PRIVATE_KEY not set: every paid offer is blocked, nothing can be paid');
  }
  if (!e.SESSION_SECRET) console.warn('SESSION_SECRET not set: using a random one per process');

  return {
    port: e.PORT,
    webBaseUrl: e.WEB_BASE_URL,
    databasePath: e.DATABASE_PATH,
    google,
    // Without a fixed secret, login cookies only survive until restart; fine for local dev.
    sessionSecret: e.SESSION_SECRET ?? randomBytes(32).toString('hex'),
    secureCookies: google ? new URL(google.redirectUri).protocol === 'https:' : isProduction,
    userAllocation: parseUsdc(e.USER_ALLOCATION_USDC),
    x402AllowHttpLocalhost: e.X402_ALLOW_HTTP_LOCALHOST,
    jev: e.JEV_API_KEY
      ? {
          url: e.JEV_API_URL ?? DEFAULT_JEV_API_URL,
          apiKey: e.JEV_API_KEY,
          model: e.JEV_MODEL ?? DEFAULT_JEV_MODEL,
          timeoutMs: e.JEV_TIMEOUT_MS,
        }
      : undefined,
    payments: {
      signer: e.SPONSOR_PRIVATE_KEY ? loadSignerConfig(env) : undefined,
      chainReader: loadChainReaderConfig(env),
      poolLimit: parseUsdc(e.SPONSOR_POOL_USDC),
    },
  };
}
