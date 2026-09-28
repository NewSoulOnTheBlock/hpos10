import pino from 'pino'

export function createLogger(level: string, pretty: boolean): pino.Logger {
  return pino({
    name: 'api',
    level,
    ...(pretty ? { transport: { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } } } : {}),
  })
}
