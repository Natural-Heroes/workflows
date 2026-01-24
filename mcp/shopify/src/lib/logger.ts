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

export const logger = {
  debug(msg: string, data?: LogData): void {
    console.error(formatMessage('debug', msg, data));
  },

  info(msg: string, data?: LogData): void {
    console.error(formatMessage('info', msg, data));
  },

  warn(msg: string, data?: LogData): void {
    console.error(formatMessage('warn', msg, data));
  },

  error(msg: string, data?: LogData): void {
    console.error(formatMessage('error', msg, data));
  },
};

export type { LogLevel, LogData };
