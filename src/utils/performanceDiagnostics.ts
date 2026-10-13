/**
 * Lightweight, local-only performance diagnostics.
 * Records timings without prompt text, message contents, credentials, or file paths.
 * Entries are kept in localStorage so production timings survive app restarts.
 */
const STORAGE_KEY = 'cowork-performance-diagnostics'
const MAX_ENTRIES = 250

export function recordPerformance(
  phase: string,
  details: Record<string, string | number | boolean | null> = {},
) {
  const entry = { at: new Date().toISOString(), elapsedMs: Math.round(performance.now()), phase, ...details }
  try {
    const previous = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
    const entries = Array.isArray(previous) ? previous : []
    entries.push(entry)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(-MAX_ENTRIES)))
  } catch {
    // Diagnostics must never interfere with app startup or chat.
  }
  console.info('[Cowork performance]', entry)
}

export function startPerformanceTimer() {
  return performance.now()
}

export function elapsedPerformanceMs(startedAt: number) {
  return Math.round(performance.now() - startedAt)
}
