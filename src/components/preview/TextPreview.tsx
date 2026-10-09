import { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { Check, Save, RotateCcw } from 'lucide-react'
import CodeMirror from '@uiw/react-codemirror'
import { oneDark } from '@codemirror/theme-one-dark'
import type { Extension } from '@codemirror/state'
import { useAppStore } from '../../stores/appStore'

interface TextPreviewProps {
  filePath: string
  onLoaded: () => void
  onError: (msg: string) => void
}

function getLanguageExtension(ext: string): (() => Promise<Extension>) | null {
  const imports: Record<string, () => Promise<Extension>> = {
    ts: () => import('@codemirror/lang-javascript').then(m => m.javascript({ jsx: false, typescript: true })),
    tsx: () => import('@codemirror/lang-javascript').then(m => m.javascript({ jsx: true, typescript: true })),
    js: () => import('@codemirror/lang-javascript').then(m => m.javascript({ jsx: false })),
    mjs: () => import('@codemirror/lang-javascript').then(m => m.javascript({ jsx: false })),
    cjs: () => import('@codemirror/lang-javascript').then(m => m.javascript({ jsx: false })),
    jsx: () => import('@codemirror/lang-javascript').then(m => m.javascript({ jsx: true })),
    json: () => import('@codemirror/lang-json').then(m => m.json()),
    css: () => import('@codemirror/lang-css').then(m => m.css()),
    html: () => import('@codemirror/lang-html').then(m => m.html()),
    htm: () => import('@codemirror/lang-html').then(m => m.html()),
    py: () => import('@codemirror/lang-python').then(m => m.python()),
    sql: () => import('@codemirror/lang-sql').then(m => m.sql()),
    xml: () => import('@codemirror/lang-xml').then(m => m.xml()),
    md: () => import('@codemirror/lang-markdown').then(m => m.markdown()),
  }
  return imports[ext] || null
}

export function TextPreview({ filePath, onLoaded, onError }: TextPreviewProps) {
  const [content, setContent] = useState<string | null>(null)
  const [savedContent, setSavedContent] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [langExts, setLangExts] = useState<Extension[]>([])
  const dirty = content !== null && savedContent !== null && content !== savedContent

  const saveFile = async () => {
    if (content === null || !dirty || saving) return
    setSaving(true)
    setSaveError(null)
    try {
      await invoke('write_text_file', { path: filePath, content })
      setSavedContent(content)
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : String(error))
    } finally {
      setSaving(false)
    }
  }
  const theme = useAppStore((s) => s.theme)

  useEffect(() => {
    let cancelled = false
    const ext = filePath.split('.').pop()?.toLowerCase() || ''

    async function load() {
      try {
        const { invoke } = await import('@tauri-apps/api/core')
        const text = await invoke<string>('read_text_file', { path: filePath })
        if (!cancelled) {
          setContent(text)
          setSavedContent(text)
          setSaveError(null)

          const loader = getLanguageExtension(ext)
          if (loader) {
            try {
              const extension = await loader()
              if (!cancelled) setLangExts([extension])
            } catch {
              // ignore lang load errors
            }
          }

          onLoaded()
        }
      } catch (err) {
        if (!cancelled) {
          onError(err instanceof Error ? err.message : String(err))
        }
      }
    }

    load()
    return () => { cancelled = true }
  }, [filePath, onLoaded, onError])

  if (content === null) return null

  return (
    <div className="h-full min-h-0 flex flex-col">
      <div className="h-9 shrink-0 border-b border-border-light/60 px-3 flex items-center gap-2">
        <span className="mr-auto text-[10px] text-text-tertiary">
          {dirty ? 'Unsaved changes' : 'Read / edit file'}
        </span>
        {saveError && <span className="max-w-[45%] truncate text-[10px] text-red-500" title={saveError}>{saveError}</span>}
        <button
          type="button"
          onClick={() => { setContent(savedContent); setSaveError(null) }}
          disabled={!dirty || saving}
          className="h-7 px-2 rounded-md text-[10px] flex items-center gap-1.5 text-text-secondary hover:bg-surface-secondary disabled:opacity-40"
          title="Discard unsaved changes"
        ><RotateCcw size={12}/> Discard</button>
        <button
          type="button"
          onClick={saveFile}
          disabled={!dirty || saving}
          className="h-7 px-2.5 rounded-md bg-accent text-white text-[10px] font-medium flex items-center gap-1.5 disabled:opacity-40"
          title="Save file"
        >{saving ? 'Saving…' : savedContent === content ? <><Check size={12}/> Saved</> : <><Save size={12}/> Save</>}</button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
      <CodeMirror
        value={content}
        onChange={setContent}
        theme={theme === 'dark' ? oneDark : undefined}
        extensions={langExts}
        readOnly={false}
        editable={true}
        className="h-full text-[13px] [&_.cm-editor]:h-full [&_.cm-scroller]:font-mono"
        basicSetup={{
          lineNumbers: true,
          foldGutter: true,
          highlightActiveLine: false,
          highlightActiveLineGutter: false,
          bracketMatching: true,
          autocompletion: false,
          searchKeymap: false,
        }}
      />
      </div>
    </div>
  )
}
