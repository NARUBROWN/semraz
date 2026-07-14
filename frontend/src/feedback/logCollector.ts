// Keeps a ring buffer of recent console output and runtime errors so a
// feedback report can include what was happening in the app at the time.

export type CollectedLog = {
  time: string
  level: string
  message: string
}

const MAX_ENTRIES = 200
const MAX_MESSAGE_LENGTH = 1000

const entries: CollectedLog[] = []
let installed = false

function toText(value: unknown): string {
  if (typeof value === 'string') return value
  if (value instanceof Error) return `${value.name}: ${value.message}`
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function push(level: string, args: unknown[]) {
  const message = args.map(toText).join(' ').slice(0, MAX_MESSAGE_LENGTH)
  entries.push({ time: new Date().toISOString(), level, message })
  if (entries.length > MAX_ENTRIES) {
    entries.splice(0, entries.length - MAX_ENTRIES)
  }
}

export function installLogCollector() {
  if (installed) return
  installed = true

  const levels = ['log', 'info', 'warn', 'error', 'debug'] as const
  for (const level of levels) {
    const original = console[level].bind(console)
    console[level] = (...args: unknown[]) => {
      push(level, args)
      original(...args)
    }
  }

  window.addEventListener('error', (event) => {
    push('window.error', [event.message, `(${event.filename}:${event.lineno})`])
  })

  window.addEventListener('unhandledrejection', (event) => {
    push('unhandledrejection', [event.reason])
  })
}

export function getCollectedLogs(): string {
  return entries
    .map((entry) => `[${entry.time}] [${entry.level}] ${entry.message}`)
    .join('\n')
}
