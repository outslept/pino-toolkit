import { debug, error, info, warn } from '../src/index'

// Basic Usage
info('Application started')
debug('Debug information', { requestId: '12345' })
warn('Resource is running low', { resource: 'memory', available: '120MB' })
error('Failed to connect to database', {
  error: new Error('Connection timeout'),
  dbHost: 'localhost',
})

// With Context
const context = { userId: 'user-123', sessionId: 'sess-456' }
info('User logged in', context)
