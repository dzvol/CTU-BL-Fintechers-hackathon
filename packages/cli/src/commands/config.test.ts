import { describe, expect, it } from 'vitest';
import { CliError } from '../ui';
import { validateGatewayUrl } from './config';

describe('validateGatewayUrl', () => {
  it('accepts HTTPS anywhere and HTTP only on localhost', () => {
    expect(validateGatewayUrl('https://gw.example.com/mcp')).toBe('https://gw.example.com');
    expect(validateGatewayUrl('http://localhost:8787/')).toBe('http://localhost:8787');
    expect(() => validateGatewayUrl('http://gw.example.com')).toThrow(CliError);
    expect(() => validateGatewayUrl('ftp://localhost')).toThrow(CliError);
    expect(() => validateGatewayUrl('not a url')).toThrow(CliError);
  });
});
