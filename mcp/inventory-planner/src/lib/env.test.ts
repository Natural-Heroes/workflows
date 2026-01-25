/**
 * Unit tests for environment variable validation.
 *
 * Tests INFRA-01: Environment validation with fail-fast behavior.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('env validation (INFRA-01)', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('missing required variables', () => {
    it('throws when INVENTORY_PLANNER_API_KEY is missing', async () => {
      delete process.env.INVENTORY_PLANNER_API_KEY;
      process.env.INVENTORY_PLANNER_ACCOUNT_ID = 'test-account';

      const { validateEnv } = await import('./env.js');
      expect(() => validateEnv()).toThrow('INVENTORY_PLANNER_API_KEY');
    });

    it('throws when INVENTORY_PLANNER_ACCOUNT_ID is missing', async () => {
      process.env.INVENTORY_PLANNER_API_KEY = 'test-key';
      delete process.env.INVENTORY_PLANNER_ACCOUNT_ID;

      const { validateEnv } = await import('./env.js');
      expect(() => validateEnv()).toThrow('INVENTORY_PLANNER_ACCOUNT_ID');
    });

    it('error message includes the missing variable name', async () => {
      delete process.env.INVENTORY_PLANNER_API_KEY;
      delete process.env.INVENTORY_PLANNER_ACCOUNT_ID;

      const { validateEnv } = await import('./env.js');
      expect(() => validateEnv()).toThrow(/INVENTORY_PLANNER_API_KEY.*|.*INVENTORY_PLANNER_ACCOUNT_ID/);
    });
  });

  describe('empty values rejected', () => {
    it('throws when API key is empty string', async () => {
      process.env.INVENTORY_PLANNER_API_KEY = '';
      process.env.INVENTORY_PLANNER_ACCOUNT_ID = 'test-account';

      const { validateEnv } = await import('./env.js');
      expect(() => validateEnv()).toThrow('INVENTORY_PLANNER_API_KEY');
    });

    it('throws when account ID is empty string', async () => {
      process.env.INVENTORY_PLANNER_API_KEY = 'test-key';
      process.env.INVENTORY_PLANNER_ACCOUNT_ID = '';

      const { validateEnv } = await import('./env.js');
      expect(() => validateEnv()).toThrow('INVENTORY_PLANNER_ACCOUNT_ID');
    });
  });

  describe('valid environment with defaults', () => {
    it('accepts valid API_KEY and ACCOUNT_ID', async () => {
      process.env.INVENTORY_PLANNER_API_KEY = 'test-key';
      process.env.INVENTORY_PLANNER_ACCOUNT_ID = 'test-account';
      delete process.env.PORT;
      delete process.env.NODE_ENV;

      const { validateEnv } = await import('./env.js');
      const env = validateEnv();

      expect(env.INVENTORY_PLANNER_API_KEY).toBe('test-key');
      expect(env.INVENTORY_PLANNER_ACCOUNT_ID).toBe('test-account');
    });

    it('PORT defaults to 3000', async () => {
      process.env.INVENTORY_PLANNER_API_KEY = 'test-key';
      process.env.INVENTORY_PLANNER_ACCOUNT_ID = 'test-account';
      delete process.env.PORT;

      const { validateEnv } = await import('./env.js');
      const env = validateEnv();

      expect(env.PORT).toBe(3000);
    });

    it('NODE_ENV defaults to development', async () => {
      process.env.INVENTORY_PLANNER_API_KEY = 'test-key';
      process.env.INVENTORY_PLANNER_ACCOUNT_ID = 'test-account';
      delete process.env.NODE_ENV;

      const { validateEnv } = await import('./env.js');
      const env = validateEnv();

      expect(env.NODE_ENV).toBe('development');
    });
  });

  describe('invalid PORT', () => {
    it('throws when PORT is not a number', async () => {
      process.env.INVENTORY_PLANNER_API_KEY = 'test-key';
      process.env.INVENTORY_PLANNER_ACCOUNT_ID = 'test-account';
      process.env.PORT = 'not-a-number';

      const { validateEnv } = await import('./env.js');
      expect(() => validateEnv()).toThrow('PORT');
    });

    it('throws when PORT is 0', async () => {
      process.env.INVENTORY_PLANNER_API_KEY = 'test-key';
      process.env.INVENTORY_PLANNER_ACCOUNT_ID = 'test-account';
      process.env.PORT = '0';

      const { validateEnv } = await import('./env.js');
      expect(() => validateEnv()).toThrow('PORT');
    });

    it('throws when PORT is greater than 65535', async () => {
      process.env.INVENTORY_PLANNER_API_KEY = 'test-key';
      process.env.INVENTORY_PLANNER_ACCOUNT_ID = 'test-account';
      process.env.PORT = '65536';

      const { validateEnv } = await import('./env.js');
      expect(() => validateEnv()).toThrow('PORT');
    });

    it('accepts valid port 8080', async () => {
      process.env.INVENTORY_PLANNER_API_KEY = 'test-key';
      process.env.INVENTORY_PLANNER_ACCOUNT_ID = 'test-account';
      process.env.PORT = '8080';

      const { validateEnv } = await import('./env.js');
      const env = validateEnv();

      expect(env.PORT).toBe(8080);
    });
  });

  describe('valid NODE_ENV values', () => {
    it('accepts development', async () => {
      process.env.INVENTORY_PLANNER_API_KEY = 'test-key';
      process.env.INVENTORY_PLANNER_ACCOUNT_ID = 'test-account';
      process.env.NODE_ENV = 'development';

      const { validateEnv } = await import('./env.js');
      const env = validateEnv();

      expect(env.NODE_ENV).toBe('development');
    });

    it('accepts production', async () => {
      process.env.INVENTORY_PLANNER_API_KEY = 'test-key';
      process.env.INVENTORY_PLANNER_ACCOUNT_ID = 'test-account';
      process.env.NODE_ENV = 'production';

      const { validateEnv } = await import('./env.js');
      const env = validateEnv();

      expect(env.NODE_ENV).toBe('production');
    });

    it('accepts test', async () => {
      process.env.INVENTORY_PLANNER_API_KEY = 'test-key';
      process.env.INVENTORY_PLANNER_ACCOUNT_ID = 'test-account';
      process.env.NODE_ENV = 'test';

      const { validateEnv } = await import('./env.js');
      const env = validateEnv();

      expect(env.NODE_ENV).toBe('test');
    });

    it('rejects invalid values like staging', async () => {
      process.env.INVENTORY_PLANNER_API_KEY = 'test-key';
      process.env.INVENTORY_PLANNER_ACCOUNT_ID = 'test-account';
      process.env.NODE_ENV = 'staging';

      const { validateEnv } = await import('./env.js');
      expect(() => validateEnv()).toThrow('NODE_ENV');
    });
  });
});
