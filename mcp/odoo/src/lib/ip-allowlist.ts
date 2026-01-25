/**
 * IP Allowlist Middleware
 *
 * Provides CIDR parsing/matching and Express middleware that allows
 * trusted IPs to bypass authentication.
 */

import { Request, Response, NextFunction, RequestHandler } from 'express';
import { logger } from './logger.js';

/**
 * Parsed CIDR block for efficient matching
 */
interface CidrBlock {
  /** Network address as 32-bit integer */
  network: number;
  /** Subnet mask as 32-bit integer */
  mask: number;
  /** Original string representation */
  original: string;
}

/**
 * Parse an IPv4 address string to a 32-bit integer
 */
function ipToInt(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;

  let result = 0;
  for (const part of parts) {
    const num = parseInt(part, 10);
    if (isNaN(num) || num < 0 || num > 255) return null;
    result = (result << 8) | num;
  }
  return result >>> 0; // Convert to unsigned 32-bit
}

/**
 * Parse a CIDR notation string (e.g., "192.168.1.0/24" or "10.0.0.1")
 * Returns null if invalid
 */
export function parseCidr(cidr: string): CidrBlock | null {
  const trimmed = cidr.trim();
  const slashIndex = trimmed.indexOf('/');

  let ip: string;
  let prefixLen: number;

  if (slashIndex === -1) {
    // Single IP address, treat as /32
    ip = trimmed;
    prefixLen = 32;
  } else {
    ip = trimmed.substring(0, slashIndex);
    prefixLen = parseInt(trimmed.substring(slashIndex + 1), 10);

    if (isNaN(prefixLen) || prefixLen < 0 || prefixLen > 32) {
      return null;
    }
  }

  const ipInt = ipToInt(ip);
  if (ipInt === null) return null;

  // Create mask: prefixLen 1s followed by (32-prefixLen) 0s
  const mask = prefixLen === 0 ? 0 : (~0 << (32 - prefixLen)) >>> 0;
  const network = (ipInt & mask) >>> 0;

  return { network, mask, original: trimmed };
}

/**
 * Check if an IP address matches a CIDR block
 */
export function ipMatchesCidr(ip: string, cidr: CidrBlock): boolean {
  const ipInt = ipToInt(ip);
  if (ipInt === null) return false;

  return ((ipInt & cidr.mask) >>> 0) === cidr.network;
}

/**
 * Check if an IP address matches any entry in an allowlist
 */
export function ipMatchesAllowlist(ip: string, allowlist: CidrBlock[]): boolean {
  return allowlist.some((cidr) => ipMatchesCidr(ip, cidr));
}

/**
 * Extract the client IP from a request, handling X-Forwarded-For header
 * from reverse proxies.
 *
 * X-Forwarded-For format: "client, proxy1, proxy2"
 * We take the leftmost (original client) IP.
 */
export function getClientIp(req: Request): string {
  const forwardedFor = req.headers['x-forwarded-for'];

  if (forwardedFor) {
    // Can be string or string[]
    const headerValue = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor;
    // Take the first (leftmost) IP which is the original client
    const clientIp = headerValue.split(',')[0].trim();
    if (clientIp) return clientIp;
  }

  // Fall back to direct connection IP
  return req.ip || req.socket.remoteAddress || '';
}

/**
 * Parse an allowlist of IP/CIDR strings into CidrBlock objects.
 * Invalid entries are logged and skipped.
 */
export function parseAllowlist(allowlist: string[]): CidrBlock[] {
  const parsed: CidrBlock[] = [];

  for (const entry of allowlist) {
    const cidr = parseCidr(entry);
    if (cidr) {
      parsed.push(cidr);
    } else {
      logger.warn('Invalid IP/CIDR in allowlist, skipping', { entry });
    }
  }

  return parsed;
}

/**
 * Create middleware that checks if client IP is in allowlist.
 * If allowed, skips authentication. Otherwise, delegates to fallback auth middleware.
 *
 * @param allowlist - Array of IP/CIDR strings (e.g., ["10.0.0.1", "192.168.0.0/16"])
 * @param fallbackAuth - Middleware to use when IP is not in allowlist
 */
export function createIpAllowlistMiddleware(
  allowlist: string[],
  fallbackAuth: RequestHandler,
): RequestHandler {
  const parsedAllowlist = parseAllowlist(allowlist);

  if (parsedAllowlist.length === 0) {
    // No allowlist configured, always use fallback auth
    return fallbackAuth;
  }

  logger.info('IP allowlist configured', {
    entries: parsedAllowlist.map((c) => c.original),
  });

  return (req: Request, res: Response, next: NextFunction) => {
    const clientIp = getClientIp(req);

    if (ipMatchesAllowlist(clientIp, parsedAllowlist)) {
      logger.debug('IP allowlisted, bypassing auth', { clientIp });
      next();
      return;
    }

    // Not in allowlist, use fallback authentication
    fallbackAuth(req, res, next);
  };
}
