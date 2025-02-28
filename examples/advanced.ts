import process from 'node:process'
import { join } from 'pathe'
import { child, createLogger, resetLogger } from '../src/index'

const logger = createLogger({
  level: 'debug',
  prettyPrint: true,
  destination: join(process.cwd(), 'logs', 'app.log'),
  levelFiles: {
    error: { enabled: true },
    warn: { enabled: true },
  },
  redaction: {
    paths: ['password', 'creditCard', '*.secret'],
    censor: '[REDACTED]',
  },
  baseContext: {
    app: 'my-service',
    version: '1.0.0',
  },
})

logger.info('Application initialized with custom configuration')

const userLogger = child({ component: 'user-service' })
userLogger.debug('Processing user data')

logger.info({
  user: 'john',
  password: 'secret123',
  data: {
    secret: 'hidden',
  },
})

resetLogger()
