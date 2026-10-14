import { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { ScrollShadow } from '@heroui/react'
import { BookOpen, Brain, Save, RefreshCw } from 'lucide-react'

type Kind = 'instructions' | 'memory'
type Document = { kind: string; path: string; content: string; exists: boolean; nativeJcode: boolean }

export function InstructionsMemorySettings() {
  const [kind, setKind] = useState<Kind>('instructions')
  const [doc, setDoc] = useState<Document | null>(null)
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  const load = async (nextKind: Kind = kind) => {
    setLoading(true); setMessage('')
    try {
      const result = await invoke<Document>('jcode_read_instruction_document', { kind: nextKind })
      setDoc(result); setDraft(result.content)
    } catch (error) { setMessage(String(error)) }
    finally { setLoading(false) }
  }

  useEffect(() => { void load(kind) }, [kind])

  const save = async () => {
    setSaving(true); setMessage('')
    try {
      const result = await invoke<Document>('jcode_save_instruction_document', { kind, content: draft })
      setDoc(result); setDraft(result.content); setMessage('Saved successfully.')
    } catch (error) { setMessage(String(error)) }
    finally { setSaving(false) }
  }

  return <ScrollShadow className="h-full px-8 py-7">
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h4 className="text-lg font-semibold text-text">Instructions &amp; memory</h4>
        <p className="mt-1 text-sm leading-6 text-text-tertiary">Manage persistent guidance under your JCode home directory. Global instructions use JCode's documented AGENTS.md mechanism. Editable memory is an Orbito-managed note and is not automatically injected into JCode until a native memory integration is verified.</p>
      </div>
      <div className="flex gap-2">
        <button onClick={() => setKind('instructions')} className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${kind === 'instructions' ? 'border-accent bg-accent-subtle text-text' : 'border-border text-text-secondary'}`}><BookOpen size={15}/> Global instructions</button>
        <button onClick={() => setKind('memory')} className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${kind === 'memory' ? 'border-accent bg-accent-subtle text-text' : 'border-border text-text-secondary'}`}><Brain size={15}/> Editable memory</button>
      </div>
      <div className="rounded-xl border border-border bg-surface p-5">
        <div className="text-xs text-text-tertiary">File location</div>
        <div className="mt-1 break-all font-mono text-xs text-text-secondary">{doc?.path || '%USERPROFILE%\\.jcode\\' + (kind === 'instructions' ? 'AGENTS.md' : 'orbito-memory.md')}</div>
        {kind === 'instructions' && <p className="mt-3 text-xs leading-5 text-text-tertiary">JCode documents global instructions at <code>~/.jcode/AGENTS.md</code>. Project instructions are supported separately by JCode's project-level AGENTS.md and .local.md files; this editor currently edits only the global file.</p>}
        {kind === 'memory' && <p className="mt-3 text-xs leading-5 text-amber-600">This file is stored and editable, but JCode's official docs do not define it as an automatically loaded memory file. It is not represented as active model memory.</p>}
        <textarea value={draft} onChange={e => setDraft(e.target.value)} disabled={loading} spellCheck={false} placeholder={kind === 'instructions' ? 'Write persistent instructions for JCode…' : 'Write editable notes you want to keep…'} className="mt-4 min-h-[300px] w-full resize-y rounded-lg border border-border bg-surface-secondary p-3 font-mono text-sm leading-6 text-text outline-none focus:border-accent disabled:opacity-60"/>
        {message && <p className={`mt-3 text-xs ${message === 'Saved successfully.' ? 'text-green-600' : 'text-red-600'}`}>{message}</p>}
        <div className="mt-4 flex justify-between gap-3">
          <button onClick={() => void load()} disabled={loading || saving} className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs text-text-secondary disabled:opacity-50"><RefreshCw size={14}/> Reload</button>
          <button onClick={() => void save()} disabled={loading || saving} className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-accent-foreground disabled:opacity-50"><Save size={14}/>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
      <p className="text-xs leading-5 text-text-tertiary">Official reference: <a className="underline" href="https://github.com/cnjack/jcode" target="_blank" rel="noreferrer">JCode README and AGENTS.md documentation</a>. Precedence: system and safety constraints remain highest priority; project-level instructions should specialize global instructions and cannot override higher-priority constraints.</p>
    </div>
  </ScrollShadow>
}
