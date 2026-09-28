import pino from 'pino'

export function createLogger(opts: { service: string; level: string; pretty: boolean }): pino.Logger {
  return pino({
    name: opts.service,
    level: opts.level,
    base: { service: opts.service },
    ...(opts.pretty ? { transport: { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } } } : {}),
  })
}
