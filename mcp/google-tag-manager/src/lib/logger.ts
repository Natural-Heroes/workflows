/**
 * Simple logger for the GTM MCP server
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const currentLevel = LOG_LEVELS[(process.env.LOG_LEVEL as LogLevel) || 'info'];

function formatMessage(level: LogLevel, message: string, data?: object): string {
  const timestamp = new Date().toISOString();
  const dataStr = data ? ' ' + JSON.stringify(data) : '';
  return '[' + timestamp + '] [' + level.toUpperCase() + '] ' + message + dataStr;
}

export const logger = {
  debug(message: string, data?: object) {
    if (LOG_LEVELS.debug >= currentLevel) {
      console.debug(formatMessage('debug', message, data));
    }
  },
  info(message: string, data?: object) {
    if (LOG_LEVELS.info >= currentLevel) {
      console.info(formatMessage('info', message, data));
    }
  },
  warn(message: string, data?: object) {
    if (LOG_LEVELS.warn >= currentLevel) {
      console.warn(formatMessage('warn', message, data));
    }
  },
  error(message: string, data?: object) {
    if (LOG_LEVELS.error >= currentLevel) {
      console.error(formatMessage('error', message, data));
    }
  },
};
