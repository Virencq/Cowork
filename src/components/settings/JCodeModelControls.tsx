import { useEffect, useId, useState } from 'react'
import { RefreshCw, Save, Cpu } from 'lucide-react'
import {
  getModelCatalog,
  setActiveModel,
  setModelEffort,
  type JCodeModelCatalog,
} from '../../utils/jcodeClient'

interface JCodeModelControlsProps {
  compact?: boolean
}

function splitModel(value: string) {
  const slash = value.indexOf('/')
  return slash > 0 ? { provider: value.slice(0, slash), model: value.slice(slash + 1) } : { provider: '', model: value }
}

export function JCodeModelControls({ compact = false }: JCodeModelControlsProps) {
  const listId = useId()
  const [catalog, setCatalog] = useState<JCodeModelCatalog | null>(null)
  const [provider, setProvider] = useState('')
  const [model, setModel] = useState('')
  const [effort, setEffort] = useState<'' | 'low' | 'medium' | 'high'>('')
  const [loading, setLoading] = useState(true)
  const [savingModel, setSavingModel] = useState(false)
  const [savingEffort, setSavingEffort] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = async () => {
    setLoading(true)
    setError(null)
    try {
      const next = await getModelCatalog()
      setCatalog(next)
      const active = splitModel(next.activeModel || '')
      const nextProvider = active.provider || next.providers[0]?.id || ''
      setProvider(nextProvider)
      setModel(active.model || next.providers.find((item) => item.id === nextProvider)?.models[0]?.id || '')
      setEffort((next.effortOverrides[active.provider + '/' + active.model] || '') as '' | 'low' | 'medium' | 'high')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
      setCatalog(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void refresh() }, [])

  const selectedProvider = catalog?.providers.find((item) => item.id === provider)
  const models = selectedProvider?.models ?? []
  const modelKey = provider && model ? provider + '/' + model : ''
  const currentModel = catalog?.activeModel || ''
  const currentEffort = modelKey ? catalog?.effortOverrides[modelKey] || '' : ''

  const saveModel = async () => {
    if (!provider.trim() || !model.trim()) return
    setSavingModel(true)
    setMessage(null)
    setError(null)
    try {
      const next = await setActiveModel(provider.trim(), model.trim())
      setCatalog(next)
      setMessage('Default model saved to JCode. New sessions will use this model.')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setSavingModel(false)
    }
  }

  const saveEffort = async () => {
    if (!provider.trim() || !model.trim()) return
    setSavingEffort(true)
    setMessage(null)
    setError(null)
    try {
      const next = await setModelEffort(provider.trim(), model.trim(), effort)
      setCatalog(next)
      setMessage(effort ? 'Reasoning effort saved for this model.' : 'Model-specific effort override cleared; JCode defaults apply.')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setSavingEffort(false)
    }
  }

  const fieldClass = compact ? 'min-w-0 max-w-[108px] rounded-md border border-border bg-surface-secondary px-1.5 py-1 text-[10px] text-text' : 'mt-1.5 w-full min-w-0 rounded-lg border border-border bg-surface-secondary px-3 py-2.5 text-[13px] text-text'
  return (
    <section className={compact ? 'min-w-0' : 'rounded-xl border border-border bg-surface p-5'}>
      {!compact && (
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <div className="text-[15px] font-semibold text-text">Provider, model and reasoning</div>
            <p className="mt-1 text-[12px] leading-5 text-text-tertiary">Changes are written to JCode's real config files. Model changes apply to newly created JCode sessions; effort is stored per model using JCode's model-state format.</p>
          </div>
          <button type="button" onClick={() => void refresh()} disabled={loading} aria-label="Refresh JCode model settings" className="rounded-lg border border-border p-2 text-text-secondary hover:bg-surface-secondary disabled:opacity-50">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      )}
      {loading ? (
        <div className="py-4 text-[12px] text-text-tertiary">Reading JCode provider configuration…</div>
      ) : !catalog ? (
        <div className="py-2 text-[12px] text-red-600">{error || 'Unable to read JCode model configuration.'}</div>
      ) : (
        <>
          <div className={compact ? 'flex min-w-0 items-center gap-1' : 'grid grid-cols-1 sm:grid-cols-2 gap-4'}>
            <label className="block text-[12px] font-medium text-text-secondary">
              {!compact && 'Provider'}
              <select aria-label="JCode provider" title="JCode provider" value={provider} onChange={(event) => {
                const nextProvider = event.target.value
                setProvider(nextProvider)
                const nextModels = catalog.providers.find((item) => item.id === nextProvider)?.models ?? []
                const nextModel = nextModels[0]?.id ?? ''
                setModel(nextModel)
                setEffort('')
                if (compact && nextModel) {
                  void setActiveModel(nextProvider, nextModel).then(setCatalog).catch((reason) => setError(reason instanceof Error ? reason.message : String(reason)))
                }
              }} className={fieldClass} disabled={catalog.providers.length === 0}>
                {catalog.providers.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.id})</option>)}
              </select>
            </label>
            <label className="block text-[12px] font-medium text-text-secondary">
              {!compact && 'Model ID'}
              <input aria-label="JCode model ID" title="JCode model ID (type an exact provider model ID)" list={listId} value={model} onChange={(event) => setModel(event.target.value)} onBlur={() => { if (compact && model.trim() && provider) void saveModel() }} placeholder={compact ? 'Model ID' : 'Enter an exact JCode model ID'} className={fieldClass} disabled={!provider} />
              <datalist id={listId}>
                {models.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </datalist>
              {!compact && <span className="mt-1 block text-[10px] text-text-tertiary">Suggestions come only from models already present in JCode config. You can enter another exact model ID supported by that provider.</span>}
            </label>
            <label className="block text-[12px] font-medium text-text-secondary">
              {!compact && 'Reasoning effort'}
              <select aria-label="JCode reasoning effort" title="JCode reasoning effort" value={effort} onChange={(event) => {
                const value = event.target.value as '' | 'low' | 'medium' | 'high'
                setEffort(value)
                if (compact && provider && model.trim()) {
                  void setModelEffort(provider, model, value).then(setCatalog).catch((reason) => setError(reason instanceof Error ? reason.message : String(reason)))
                }
              }} className={fieldClass} disabled={!provider || !model.trim()}>
                <option value="">Default (no per-model override)</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
              {!compact && <span className="mt-1 block text-[10px] text-text-tertiary">JCode supports low, medium and high per-model effort overrides.</span>}
            </label>
          </div>
          {!compact && currentModel && <div className="mt-3 text-[11px] text-text-tertiary">Active default: <span className="font-mono font-semibold text-text-secondary">{currentModel}</span>{currentEffort ? <span> · effort {currentEffort}</span> : null}</div>}
          {!compact && <div className="mt-3 flex flex-wrap justify-end gap-2">
            <button type="button" onClick={() => void saveEffort()} disabled={savingEffort || !provider || !model.trim()} className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-[11px] font-semibold text-text-secondary hover:bg-surface-secondary disabled:opacity-50">
              <Cpu size={13} />{savingEffort ? 'Saving…' : 'Save reasoning'}
            </button>
            <button type="button" onClick={() => void saveModel()} disabled={savingModel || !provider || !model.trim()} className="inline-flex items-center gap-2 rounded-lg bg-accent px-3 py-2 text-[11px] font-semibold text-accent-foreground hover:bg-accent-light disabled:opacity-50">
              <Save size={13} />{savingModel ? 'Saving…' : 'Set default model'}
            </button>
          </div>}
        </>
      )}
      {!compact && message && <p role="status" className="mt-3 text-[11px] text-green-600">{message}</p>}
      {error && <p role="alert" className="mt-3 text-[11px] text-red-600">{error}</p>}
    </section>
  )
}
