import type { Logger, LoggerOptions } from 'pino'
import process from 'node:process'
import { dirname, join } from 'pathe'
import pino from 'pino'

// Core types
type LogLevel = 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace'
type LogMessage = string | Record<string, unknown>
type LogContext = Record<string, unknown>

// Stream configuration types
interface PinoDestination {
  level: string
  stream: NodeJS.WritableStream
  filter?: (obj: any) => boolean
}

/**
 * Log rotation configuration
 * @property interval - Time-based rotation (e.g. '1d', '12h')
 * @property size - Size-based rotation (e.g. '10M', '1G')
 * @property maxFiles - Maximum number of rotated files to keep
 */
interface RotationConfig {
  interval: string
  size: string
  maxFiles: number
}

/**
 * Configuration for level-specific log files
 * @property enabled - Whether to create a separate file for this level
 * @property destination - Custom file path (defaults to [level].log)
 */
interface LevelFileConfig {
  enabled: boolean
  destination?: string
}

/**
 * Redaction configuration for sensitive data
 * @property paths - Array of object paths to redact
 * @property censor - String to replace redacted values with
 */
interface RedactionConfig {
  paths: string[]
  censor?: string
}

/**
 * Main logger configuration
 */
interface LoggerConfig {
  /** Minimum log level to record */
  level?: LogLevel

  /** Enable human-readable output (default: true in development) */
  prettyPrint?: boolean

  /** Main log file path */
  destination?: string

  /** Log rotation settings */
  rotation?: Partial<RotationConfig>

  /** Level-specific log files configuration */
  levelFiles?: Partial<Record<LogLevel, LevelFileConfig>>

  /** Sensitive data redaction configuration */
  redaction?: RedactionConfig

  /** Base context to include with all logs */
  baseContext?: LogContext

  /** Custom serializers for specific object types */
  serializers?: Record<string, (value: any) => any>
}

interface DefaultConfig
  extends Omit<LoggerConfig, 'redaction' | 'baseContext' | 'serializers'> {
  level: LogLevel
  prettyPrint: boolean
  destination: string
  rotation: RotationConfig
  levelFiles: Record<LogLevel, LevelFileConfig>
  redaction?: RedactionConfig
  baseContext?: LogContext
  serializers?: Record<string, (value: any) => any>
}

/**
 * Default configuration values
 * These are merged with user-provided config
 */
const defaultConfig: DefaultConfig = {
  level: 'info',
  prettyPrint: process.env.NODE_ENV !== 'production',
  destination: join(process.cwd(), 'logs', 'app.log'),
  rotation: {
    interval: '1d',
    size: '10M',
    maxFiles: 5,
  },
  levelFiles: {
    fatal: { enabled: true, destination: undefined },
    error: { enabled: true, destination: undefined },
    warn: { enabled: false },
    info: { enabled: false },
    debug: { enabled: false },
    trace: { enabled: false },
  },
}

/**
 * Creates a pretty-print console stream
 * @param level - Minimum log level for this stream
 * @returns Configured stream object
 */
function createPrettyStream(level: LogLevel): PinoDestination {
  return {
    level,
    stream: pino.transport({
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
        ignore: 'pid,hostname',
        messageFormat: '{msg} {context}',
      },
    }),
  }
}

/**
 * Creates a file stream with rotation support
 * @param config - Logger configuration
 * @param level - Minimum log level for this stream
 * @returns Configured stream object
 */
function createRotationStream(
  config: LoggerConfig,
  level: LogLevel,
): PinoDestination {
  const mergedConfig = {
    ...defaultConfig,
    ...config,
    rotation: { ...defaultConfig.rotation, ...config.rotation },
  }

  const destination = config.destination ?? defaultConfig.destination

  // Ensure directory exists
  const dirPath = dirname(destination)

  return {
    level,
    stream: pino.transport({
      target: 'pino-roll',
      options: {
        file: destination,
        frequency: mergedConfig.rotation.interval,
        size: mergedConfig.rotation.size,
        maxFiles: mergedConfig.rotation.maxFiles,
        mkdir: true,
        dirname: dirPath,
      },
    }),
  }
}

/**
 * Creates a level-specific log file stream
 * @param level - Exact log level to filter for
 * @param destination - File path for this level's logs
 * @param rotation - Rotation configuration
 * @returns Configured stream object with level filter
 */
function createLevelStream(
  level: LogLevel,
  destination: string,
  rotation?: Partial<RotationConfig>,
): PinoDestination {
  const mergedRotation = { ...defaultConfig.rotation, ...rotation }

  return {
    level,
    stream: pino.transport({
      target: 'pino-roll',
      options: {
        file: destination,
        frequency: mergedRotation.interval,
        size: mergedRotation.size,
        maxFiles: mergedRotation.maxFiles,
        mkdir: true,
      },
    }),
    // Only include logs of exactly this level (not higher levels)
    filter: (obj: any) => obj.level === pino.levels.values[level],
  }
}

/**
 * Creates all configured output streams
 * @param config - Logger configuration
 * @returns Array of configured destinations
 */
function createStreams(config: LoggerConfig): PinoDestination[] {
  const streams: PinoDestination[] = []
  const level = config.level ?? defaultConfig.level

  // Add pretty console logger if enabled
  if (config.prettyPrint) {
    streams.push(createPrettyStream(level))
  }

  // Add main log file if destination specified
  if (config.destination) {
    streams.push(createRotationStream(config, level))
  }

  // Add level-specific log files if configured
  if (config.levelFiles) {
    Object.entries(config.levelFiles).forEach(([levelName, levelConfig]) => {
      if (levelConfig.enabled) {
        const baseDir = dirname(
          config.destination ?? defaultConfig.destination,
        )
        const destination
          = levelConfig.destination ?? join(baseDir, `${levelName}.log`)

        streams.push(
          createLevelStream(levelName as LogLevel, destination, config.rotation),
        )
      }
    })
  }

  return streams
}

// Singleton logger instance
let loggerInstance: Logger | null = null

/**
 * Initialize a new logger instance with the provided configuration
 *
 * @param config - Custom logger configuration
 * @returns Configured Pino logger instance
 */
function initLogger(config: LoggerConfig = {}): Logger {
  // Deep merge configs
  const mergedConfig = {
    ...defaultConfig,
    ...config,
    rotation: { ...defaultConfig.rotation, ...config.rotation },
    levelFiles: { ...defaultConfig.levelFiles, ...config.levelFiles },
  }

  // Build Pino options
  const options: LoggerOptions = {
    level: mergedConfig.level,
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      level: (label: string) => ({ level: label }),
    },
    base: mergedConfig.baseContext ? mergedConfig.baseContext : {},
  }

  // Add serializers if configured
  if (mergedConfig.serializers) {
    options.serializers = mergedConfig.serializers
  }

  // Add redaction if configured
  if (mergedConfig.redaction) {
    options.redact = {
      paths: mergedConfig.redaction.paths,
      censor: mergedConfig.redaction.censor ?? '[REDACTED]',
    }
  }

  return pino(options, pino.multistream(createStreams(mergedConfig)))
}

/**
 * Creates a logging function for a specific level
 * Handles both string messages with context and object messages
 *
 * @param level - Log level to create function for
 * @returns Configured logging function
 */
function createLogFunction(level: LogLevel) {
  return (message: LogMessage, context?: LogContext): void => {
    const logger = getLogger()

    if (typeof message === 'string') {
      // String message with optional context
      logger[level](context || {}, message)
    }
    else {
      // Object message merged with context
      logger[level]({ ...message, ...(context || {}) })
    }
  }
}

/**
 * Get or initialize the logger singleton
 *
 * @param config - Optional config to initialize logger if not already created
 * @returns Logger instance
 */
function getLogger(config?: LoggerConfig): Logger {
  if (!loggerInstance) {
    loggerInstance = initLogger(config)
  }
  return loggerInstance
}

/**
 * Log a fatal-level message (system is unusable)
 *
 * @param message - Log message string or object
 * @param context - Additional contextual data
 */
const fatal = createLogFunction('fatal')

/**
 * Log an error-level message (error conditions)
 *
 * @param message - Log message string or object
 * @param context - Additional contextual data
 */
const error = createLogFunction('error')

/**
 * Log a warning-level message (warning conditions)
 *
 * @param message - Log message string or object
 * @param context - Additional contextual data
 */
const warn = createLogFunction('warn')

/**
 * Log an info-level message (informational messages)
 *
 * @param message - Log message string or object
 * @param context - Additional contextual data
 */
const info = createLogFunction('info')

/**
 * Log a debug-level message (debug information)
 *
 * @param message - Log message string or object
 * @param context - Additional contextual data
 */
const debug = createLogFunction('debug')

/**
 * Log a trace-level message (detailed debug information)
 *
 * @param message - Log message string or object
 * @param context - Additional contextual data
 */
const trace = createLogFunction('trace')

/**
 * Dynamically change the logger's minimum level
 * Useful for toggling debug logging at runtime
 *
 * @param level - New minimum log level
 */
function setLevel(level: LogLevel): void {
  getLogger().level = level
}

/**
 * Create a child logger with bound context
 * All logs from the child will include this context
 *
 * @param bindings - Context to bind to all child logger messages
 * @returns Child logger instance
 */
function child(bindings: LogContext): Logger {
  return getLogger().child(bindings)
}

/**
 * Reset the logger instance
 * Useful for reconfiguring the logger or in tests
 */
function resetLogger(): void {
  loggerInstance = null
}

/**
 * Create a logger with specific configuration
 * Alternative to singleton pattern for multiple distinct loggers
 *
 * @param config - Logger configuration
 * @returns New logger instance (not the singleton)
 */
function createLogger(config: LoggerConfig): Logger {
  return initLogger(config)
}

/**
 * Log with custom level
 * Allows for dynamic level selection
 *
 * @param level - Log level to use
 * @param message - Log message string or object
 * @param context - Additional contextual data
 */
function log(level: LogLevel, message: LogMessage, context?: LogContext): void {
  const logger = getLogger()

  if (typeof message === 'string') {
    logger[level](context || {}, message)
  }
  else {
    logger[level]({ ...message, ...(context || {}) })
  }
}

export {
  child,
  createLogger,
  debug,
  error,
  fatal,
  getLogger,
  info,
  log,
  resetLogger,
  setLevel,
  trace,
  warn,
}

export type {
  LevelFileConfig,
  LogContext,
  LoggerConfig,
  LogLevel,
  LogMessage,
  RedactionConfig,
  RotationConfig,
}
