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
    void refresh()
    void tick()
    const id = window.setInterval(() => { void tick() }, 30_000)
    return () => window.clearInterval(id)
  }, [refresh, tick])

  return { loading }
}
