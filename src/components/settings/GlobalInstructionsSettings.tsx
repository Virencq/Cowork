import { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { RefreshCw, Save } from 'lucide-react'
import { ScrollShadow } from '@heroui/react'

export function GlobalInstructionsSettings() {
  const [content, setContent] = useState('')
  const [path, setPath] = useState('%USERPROFILE%\\.jcode\\AGENTS.md')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  const reload = async () => {
    setLoading(true)
    setMessage('')
    try {
      const result = await invoke<{ path: string; content: string }>('jcode_read_global_instructions')
      setPath(result.path)
      setContent(result.content)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
    } finally {
      setLoading(false)
    }
  }

  const save = async () => {
    setSaving(true)
    setMessage('')
    try {
      const result = await invoke<{ path: string }>('jcode_save_global_instructions', { content })
      setPath(result.path)
      setMessage('Global instructions saved.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
    } finally {
      setSaving(false)
    }
  }

  useEffect(() => { void reload() }, [])

  return (
    <ScrollShadow className="h-full px-8 py-7">
      <div className="mx-auto max-w-3xl space-y-5">
        <section className="rounded-xl border border-border bg-surface p-5">
          <h4 className="text-[15px] font-semibold text-text">Global instructions</h4>
          <p className="mt-1 text-[12px] leading-5 text-text-tertiary">
            Instructions for JCode across projects and sessions. Saved to JCode's global AGENTS.md file in your .jcode folder.
          </p>
          <div className="mt-4 rounded-lg border border-border bg-surface-secondary px-3 py-2.5">
            <div className="text-[10px] uppercase tracking-widest text-text-tertiary">File location</div>
            <div className="mt-1 break-all font-mono text-[12px] text-text-secondary">{path}</div>
          </div>
          <textarea
            value={content}
            onChange={(event) => setContent(event.target.value)}
            disabled={loading || saving}
            placeholder="Write your global instructions for JCode…"
            spellCheck={false}
            className="mt-4 min-h-[320px] w-full resize-y rounded-lg border border-border bg-bg px-4 py-3 font-mono text-[13px] leading-6 text-text outline-none focus:border-accent disabled:opacity-60"
          />
          {message && <p className={`mt-3 text-[12px] ${message.includes('saved') ? 'text-green-600' : 'text-red-500'}`}>{message}</p>}
          <div className="mt-4 flex justify-end gap-2">
            <button onClick={() => void reload()} disabled={loading || saving} className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2.5 text-[12px] font-semibold text-text-secondary hover:bg-surface-secondary disabled:opacity-50"><RefreshCw size={14}/>{loading ? 'Loading…' : 'Reload'}</button>
            <button onClick={() => void save()} disabled={loading || saving} className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-[12px] font-semibold text-accent-foreground hover:bg-accent-light disabled:opacity-50"><Save size={14}/>{saving ? 'Saving…' : 'Save instructions'}</button>
          </div>
        </section>
      </div>
    </ScrollShadow>
  )
}
