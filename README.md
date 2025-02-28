# pino-toolkit

A powerful, configurable logging toolkit built on top of Pino.

## Features

- 🚀 High Performance: Built on Pino

- 📂 Log Rotation: File rotation based on time, size, or both

- 🔄 Multiple Destinations: Route different log levels to separate files

- 🔒 Redaction: Automatically redact sensitive information

- 🎨 Pretty Printing: Human-readable logs during development

- 🧩 Contextual Logging: Add context to all logs or create child loggers

- 🛠️ Fully Configurable: Extensive options to customize behavior

## Quick Start

```ts
import { error, getLogger, info } from '#'

// Use default configuration
info('Application started')

// Log with context
info('User logged in', { userId: '12345', role: 'admin' })

// Log error objects
try {
  // Something that might throw
}
catch (err) {
  error('Operation failed', { err })
}

// Get logger instance for advanced usage
const logger = getLogger()
logger.info({ custom: 'data' }, 'Custom log with data')
```

## Configuration

Create a custom logger with preferred settings:

```ts
import { join } from 'node:path'
import { createLogger } from '#'

const logger = createLogger({
  level: 'debug',
  prettyPrint: process.env.NODE_ENV !== 'production',
  destination: join(process.cwd(), 'logs', 'application.log'),
  rotation: {
    interval: '1d',
    size: '100M',
    maxFiles: 10,
  },
  levelFiles: {
    error: { enabled: true },
    warn: { enabled: true },
  },
  redaction: {
    paths: ['password', 'secret', '*.token'],
    censor: '[REDACTED]'
  },
  baseContext: {
    service: 'user-service',
    version: '1.0.0'
  }
})
```

## API Reference

### Main Functions

- `getLogger(config?)`: Get or initialize the global logger

- `createLogger(config)`: Create a new logger instance

- `log(level, message, context?)`: Log with specified level

- `fatal/error/warn/info/debug/trace(message, context?)`: Level-specific logging

- `setLevel(level)`: Change log level dynamically

- `child(bindings)`: Create a child logger with additional context

- `resetLogger()`: Reset the global logger instance

### Configuration Options

| Option        | Type                                | Description                           |
| ------------- | ----------------------------------- | ------------------------------------- |
| `level`       | `LogLevel`                          | Minimum log level to record           |
| `prettyPrint` | `boolean`                           | Enable human-readable formatting      |
| `destination` | `string`                            | Path to log file                      |
| `rotation`    | `RotationConfig`                    | Log rotation settings                 |
| `levelFiles`  | `Record<LogLevel, LevelFileConfig>` | Level-specific file destinations      |
| `redaction`   | `RedactionConfig`                   | Sensitive data redaction config       |
| `baseContext` | `LogContext`                        | Default context added to all logs     |
| `serializers` | `Record<string, Function>`          | Custom serializers for log properties |

## License

MIT
