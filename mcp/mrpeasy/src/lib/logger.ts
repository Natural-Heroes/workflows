/**
 * Logger module that writes ONLY to stderr.
 *
 * CRITICAL: Never use console.log in MCP servers - it corrupts the protocol.
 * All MCP communication happens over stdout, so logs must go to stderr.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogData {
  [key: string]: unknown;
}

function formatTimestamp(): string {
  return new Date().toISOString();
}

function formatMessage(level: LogLevel, msg: string, data?: LogData): string {
  const timestamp = formatTimestamp();
  const levelUpper = level.toUpperCase().padEnd(5);

  if (data && Object.keys(data).length > 0) {
    return `${timestamp} [${levelUpper}] ${msg} ${JSON.stringify(data)}`;
  }
  return `${timestamp} [${levelUpper}] ${msg}`;
}

/**
 * Logger instance - all output goes to stderr only.
 *
 * Usage:
 *   logger.debug('Processing request', { id: '123' });
 *   logger.info('Server started', { port: 3000 });
 *   logger.warn('Rate limit approaching');
 *   logger.error('Failed to connect', { error: err.message });
 */
export const logger = {
  /**
   * Debug level - verbose information for development
   */
  debug(msg: string, data?: LogData): void {
    console.error(formatMessage('debug', msg, data));
  },

  /**
   * Info level - general operational information
   */
  info(msg: string, data?: LogData): void {
    console.error(formatMessage('info', msg, data));
  },

  /**
   * Warn level - potential issues that don't prevent operation
   */
  warn(msg: string, data?: LogData): void {
    console.error(formatMessage('warn', msg, data));
  },

  /**
   * Error level - errors that affect operation
   */
  error(msg: string, data?: LogData): void {
    console.error(formatMessage('error', msg, data));
  },
};

export type { LogLevel, LogData };
