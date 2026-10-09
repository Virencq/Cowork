import { useMemo, useState } from 'react'
import { FileCode2, Pin, Plus, Search, ListFilter, Trash2, Pencil, MessageSquare } from 'lucide-react'
import { useWorkspaceStore } from '../../stores/workspaceStore'
import { useAppStore } from '../../stores/appStore'

interface ArtifactsPageProps { onOpenArtifact?: (artifactId: string) => void }

export function ArtifactsPage({ onOpenArtifact }: ArtifactsPageProps) {
  const artifacts = useWorkspaceStore(s => s.artifacts)
  const addArtifact = useWorkspaceStore(s => s.addArtifact)
  const updateArtifact = useWorkspaceStore(s => s.upsertArtifact)
  const removeArtifact = useWorkspaceStore(s => s.removeArtifact)
  const toggleArtifactPin = useWorkspaceStore(s => s.toggleArtifactPin)
  const pinnedArtifactIds = useWorkspaceStore(s => s.pinnedArtifactIds)
  const [query, setQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [filter, setFilter] = useState<'all' | 'pinned'>('all')
  const createSession = useAppStore(s => s.createSession)

  const createArtifact = () => {
    const sessionId = createSession()
    const artifactId = addArtifact({ name: 'Untitled artifact', type: 'document', content: 'New artifact', sessionId })
    onOpenArtifact?.(artifactId)
  }

  const openArtifact = (artifactId: string) => onOpenArtifact?.(artifactId)
  const visible = useMemo(() => artifacts.filter(a =>
    (filter === 'all' || pinnedArtifactIds.includes(a.id)) &&
    a.name.toLowerCase().includes(query.toLowerCase())
  ), [artifacts, query, filter, pinnedArtifactIds])

  return (
    <div className="h-full overflow-auto bg-white pt-11">
      <div className="mx-auto max-w-[1200px] px-10 py-9">
        <div className="flex items-center justify-between">
          <h1 className="font-serif text-[30px] tracking-[-0.03em] text-[#171411]">Artifacts</h1>
          <div className="flex items-center gap-3">
            <button onClick={() => setSearchOpen(v => !v)} className="h-9 w-9 grid place-items-center rounded-lg hover:bg-[#f3f1ee] text-[#554f49]" title="Search artifacts"><Search size={18}/></button>
            <button onClick={() => setFilter(v => v === 'all' ? 'pinned' : 'all')} className="h-9 w-9 grid place-items-center rounded-lg hover:bg-[#f3f1ee] text-[#554f49]" title="Filter artifacts"><ListFilter size={18}/></button>
            <button onClick={createArtifact} className="h-9 rounded-lg bg-[#171717] px-4 text-[13px] font-semibold text-white inline-flex items-center gap-2"><Plus size={15}/> New artifact</button>
          </div>
        </div>
        {searchOpen && (
          <div className="mt-5 relative max-w-sm">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9b948d]"/>
            <input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="Search artifacts" className="w-full h-9 rounded-lg border border-[#ded8d2] px-9 text-[12px] outline-none"/>
          </div>
        )}
        <div className="flex items-center gap-5 mt-5 mb-6 text-[13px]">
          <button onClick={() => setFilter('all')} className={`pb-2 border-b-2 ${filter === 'all' ? 'border-[#e5e1dd] font-semibold text-[#27231f]' : 'border-transparent text-[#777069]'}`}>All</button>
          <button onClick={() => setFilter('pinned')} className={`pb-2 border-b-2 ${filter === 'pinned' ? 'border-[#e5e1dd] font-semibold text-[#27231f]' : 'border-transparent text-[#777069]'}`}>Pinned</button>
        </div>
        {visible.length ? (
          <div className="grid grid-cols-3 gap-5">
            {visible.map(a => (
              <div key={a.id} className="overflow-hidden rounded-xl border border-[#e0dbd5] bg-white hover:shadow-sm transition">
                <div onClick={() => openArtifact(a.id)} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') openArtifact(a.id) }} className="block w-full text-left cursor-pointer"><div className="h-[170px] bg-[#f5f3f0] relative overflow-hidden">
                  {a.content && /<(!doctype|html|body|div|table|style|script)/i.test(a.content) ? (
                    <iframe title={a.name} srcDoc={a.content} className="h-full w-full border-0 pointer-events-none bg-white" sandbox="" />
                  ) : (
                    <div className="h-full p-4 font-mono text-[8px] leading-3 text-[#777069] overflow-hidden whitespace-pre-wrap">{a.content || 'Artifact preview'}</div>
                  )}
                  <button onClick={(e) => { e.stopPropagation(); toggleArtifactPin(a.id) }} className="absolute right-2 bottom-2 h-7 w-7 rounded-full bg-white/90 grid place-items-center shadow-sm" title={pinnedArtifactIds.includes(a.id) ? 'Unpin artifact' : 'Pin artifact'}>{pinnedArtifactIds.includes(a.id) ? <Pin size={13} className="fill-current"/> : <Pin size={13} className="text-[#8f8881}"/>}</button>
                </div></div>
                <div className="px-3.5 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <button onClick={() => openArtifact(a.id)} className="min-w-0 text-left text-[13px] font-semibold text-[#1e1a17] truncate hover:underline">{a.name}</button>
                    <div className="flex items-center shrink-0">
                      <button onClick={() => openArtifact(a.id)} className="h-7 w-7 grid place-items-center rounded-md hover:bg-[#f3f1ee]" title="Open artifact chat"><MessageSquare size={13}/></button>
                      <button onClick={() => {
                        const name = window.prompt('Artifact name', a.name)
                        if (name?.trim()) updateArtifact({ ...a, name: name.trim(), updatedAt: Date.now() })
                      }} className="h-7 w-7 grid place-items-center rounded-md hover:bg-[#f3f1ee]" title="Rename artifact"><Pencil size={13}/></button>
                      <button onClick={() => {
                        if (window.confirm('Delete artifact "' + a.name + '"?')) removeArtifact(a.id)
                      }} className="h-7 w-7 grid place-items-center rounded-md hover:bg-[#f3f1ee] text-[#9b5b52]" title="Delete artifact"><Trash2 size={13}/></button>
                    </div>
                  </div>
                  <div className="mt-1 text-[11px] text-[#8c847d]">{a.sessionId ? 'Persistent chat' : 'No chat linked'} · {a.createdAt ? `Created ${new Date(a.createdAt).toLocaleDateString(undefined, {month:'short',day:'numeric'})}` : 'Artifact'}</div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-28 text-center">
            <FileCode2 size={32} className="mx-auto text-[#c5beb7]"/>
            <h2 className="mt-4 text-[18px] font-semibold text-[#28231f]">No artifacts yet</h2>
            <p className="mt-1 text-[12px] text-[#8d857d]">Artifacts created by JCode will appear here.</p>
          </div>
        )}
      </div>
    </div>
  )
}
