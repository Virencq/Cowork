import { useEffect } from 'react'
import { useTaskStore } from '../stores'

/**
 * Keeps Cowork's local scheduler alive while the desktop app is running.
 * Task definitions and run history are persisted locally; execution uses
 * installed JCode through ACP rather than a legacy HTTP sidecar.
 */
export function useTaskScheduler() {
  const refresh = useTaskStore((s) => s.refresh)
  const tick = useTaskStore((s) => s.tick)
  const loading = useTaskStore((s) => s.loading)

  useEffect(() => {
    // Scheduler refresh/tick can touch SQLite and ACP. Delay it until the
    // initial workspace has had a chance to render and accept input.
    const startup = window.setTimeout(() => {
      void refresh()
      void tick()
    }, 1200)
    const id = window.setInterval(() => { void tick() }, 30_000)
    return () => {
      window.clearTimeout(startup)
      window.clearInterval(id)
    }
  }, [refresh, tick])

  return { loading }
}
