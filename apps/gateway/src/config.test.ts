import { describe, expect, it, vi } from 'vitest';
import { loadConfig } from './config';

describe('loadConfig', () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});

  it('runs the baseline Jev variant unless told otherwise', () => {
    expect(loadConfig({}).jevVariant.id).toBe('baseline');
    expect(loadConfig({ JEV_VARIANT: 'strict' }).jevVariant.id).toBe('strict');
  });

  it('refuses an unknown Jev variant', () => {
    expect(() => loadConfig({ JEV_VARIANT: 'yolo' })).toThrow('JEV_VARIANT');
  });
});

describe('payment network', () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  const SPONSOR = '0x1111111111111111111111111111111111111111';

  it('pays on Base Sepolia unless mainnet is switched on explicitly', () => {
    for (const env of [{}, { PAYMENT_NETWORK: '' }]) {
      const { payments } = loadConfig(env);
      expect(payments.network).toBe('base-sepolia');
      expect(payments.chainReader.network).toBe('base-sepolia');
    }
  });

  it('moves the Signer and the ChainReader to mainnet together', () => {
    const { payments } = loadConfig({
      PAYMENT_NETWORK: 'base-mainnet',
      SPONSOR_PRIVATE_KEY: 'set',
      SPONSOR_ADDRESS: SPONSOR,
    });
    expect(payments.network).toBe('base-mainnet');
    expect(payments.signer?.network).toBe('base-mainnet');
    expect(payments.chainReader.network).toBe('base-mainnet');
  });

  it('refuses a ChainReader on another network than the payments', () => {
    expect(() =>
      loadConfig({ PAYMENT_NETWORK: 'base-mainnet', CHAIN_READER_NETWORK: 'base-sepolia' }),
    ).toThrow('must match PAYMENT_NETWORK');
  });

  it('requires the expected sponsor address before paying real USDC', () => {
    expect(() =>
      loadConfig({ PAYMENT_NETWORK: 'base-mainnet', SPONSOR_PRIVATE_KEY: 'set' }),
    ).toThrow('SPONSOR_ADDRESS');
  });

  it('refuses an unknown network', () => {
    expect(() => loadConfig({ PAYMENT_NETWORK: 'ethereum' })).toThrow('PAYMENT_NETWORK');
  });
});
