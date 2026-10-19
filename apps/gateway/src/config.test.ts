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
