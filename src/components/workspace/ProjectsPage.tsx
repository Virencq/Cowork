import { useMemo, useState } from 'react'
import { FolderOpen, FolderKanban, Pin, Plus, Search, ArrowUpDown, Trash2 } from 'lucide-react'
import { open } from '@tauri-apps/plugin-dialog'
import { useWorkspaceStore } from '../../stores/workspaceStore'
import { useAppStore } from '../../stores'

export function ProjectsPage({ onOpenProject, onOpenChat, onNewProjectChat }: { onOpenProject?: (project: { id: string; name: string; path?: string }) => void; onOpenChat?: (sessionId: string) => void; onNewProjectChat?: (projectId: string) => void }) {
  const projects = useWorkspaceStore(s => s.projects)
  const sessions = useAppStore(s => s.sessions)
  const sessionMessages = useAppStore(s => s.sessionMessages)
  const setActiveSession = useAppStore(s => s.setActiveSession)
  const setActiveProject = useWorkspaceStore(s => s.setActiveProject)
  const addProject = useWorkspaceStore(s => s.addProject)
  const removeProject = useWorkspaceStore(s => s.removeProject)
  const toggleProjectPin = useWorkspaceStore(s => s.toggleProjectPin)
  const pinnedProjectIds = useWorkspaceStore(s => s.pinnedProjectIds)
  const setWorkspaceDir = useAppStore(s => s.setWorkspaceDir)
  const [query, setQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [sort, setSort] = useState<'updated' | 'name'>('updated')

  const visible = useMemo(() => [...projects]
    .filter(p => p.name.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => {
      if (pinnedProjectIds.includes(a.id) !== pinnedProjectIds.includes(b.id)) return pinnedProjectIds.includes(a.id) ? -1 : 1
      return sort === 'name' ? a.name.localeCompare(b.name) : b.updatedAt - a.updatedAt
    }), [projects, query, sort, pinnedProjectIds])

  const createProject = async () => {
    const selected = await open({ directory: true, multiple: false, title: 'Choose project folder' })
    if (typeof selected !== 'string') return
    const name = selected.split(/[\\/]/).filter(Boolean).pop() || 'Project'
    addProject({ name, path: selected })
    setWorkspaceDir(selected)
  }

  return (
    <div className="h-full overflow-auto pt-11" style={{ backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}>
      <div className="mx-auto max-w-[980px] px-10 py-9">
        <div className="flex items-center justify-between mb-8">
          <h1 className="font-serif text-[30px] tracking-[-0.03em]" style={{ color: 'var(--color-text)' }}>Projects</h1>
          <div className="flex items-center gap-3">
            <button onClick={() => setSearchOpen(v => !v)} className="h-9 w-9 grid place-items-center rounded-lg hover:bg-surface-hover" style={{ color: 'var(--color-text-secondary)' }} title="Search projects"><Search size={18}/></button>
            <button onClick={() => setSort(v => v === 'updated' ? 'name' : 'updated')} className="h-9 w-9 grid place-items-center rounded-lg hover:bg-surface-hover" style={{ color: 'var(--color-text-secondary)' }} title="Sort projects"><ArrowUpDown size={17}/></button>
            <button onClick={() => void createProject()} className="h-9 rounded-lg px-4 text-[13px] font-semibold hover:opacity-90 inline-flex items-center gap-2" style={{ backgroundColor: 'var(--color-text)', color: 'var(--color-bg)' }}><Plus size={15}/> New project</button>
          </div>
        </div>
        {searchOpen && (
          <div className="mb-5 relative max-w-sm">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9b948d]"/>
            <input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="Search projects" className="w-full h-9 rounded-lg border px-9 text-[12px] outline-none" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)', color: 'var(--color-text)' }}/>
          </div>
        )}
        {visible.length ? (
          <div className="grid grid-cols-2 gap-6">
            {visible.map(project => (
              <div key={project.id} className="group relative min-h-[100px] rounded-xl border px-4 py-3 hover:shadow-sm transition" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)', color: 'var(--color-text)' }}>
                <button
                  onClick={() => {
                    if (onOpenProject) onOpenProject(project)
                    else if (project.path) setWorkspaceDir(project.path)
                  }}
                  className="absolute inset-0 z-0 rounded-xl text-left"
                  aria-label={`Open project ${project.name}`}
                />
                <div className="relative z-10 pointer-events-none flex items-start justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-[14px] font-semibold" style={{ color: 'var(--color-text)' }}>
                      <span className="truncate">{project.name}</span>
                      {pinnedProjectIds.includes(project.id) && <Pin size={13} className="fill-current" style={{ color: 'var(--color-text-secondary)' }}/>}
                    </div>
                    <div className="mt-2 text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>{new Date(project.updatedAt).toLocaleDateString(undefined, {month:'short', day:'numeric'})}</div>
                  </div>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    toggleProjectPin(project.id)
                  }}
                  className="absolute right-3 top-3 h-7 w-7 grid place-items-center rounded-md hover:bg-surface-hover" style={{ color: 'var(--color-text-secondary)' }}
                  title={pinnedProjectIds.includes(project.id) ? 'Unpin project' : 'Pin project'}
                >
                  <Pin size={15} className={pinnedProjectIds.includes(project.id) ? 'fill-current' : ''}/>
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    if (window.confirm('Remove project "' + project.name + '" from Cowork?')) removeProject(project.id)
                  }}
                  className="absolute right-12 top-3 h-7 w-7 grid place-items-center rounded-md opacity-0 group-hover:opacity-100 hover:bg-red-500/10 text-red-400"
                  title="Remove project"
                >
                  <Trash2 size={14}/>
                </button>
                {(() => {
                  const ids = project.sessionIds || (project.sessionId ? [project.sessionId] : [])
                  const projectChats = ids.map(id => sessions.find(session => session.id === id)).filter((session): session is NonNullable<typeof session> => !!session)
                  return (
                    <div className="relative z-10 mt-3 space-y-1">
                      {projectChats.slice().reverse().slice(0, 4).map(chat => (
                        <button key={chat.id}
                          onClick={(e) => { e.stopPropagation(); setActiveProject(project.id); setActiveSession(chat.id); onOpenChat?.(chat.id) }}
                          className="relative z-20 flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-[11px] hover:bg-surface-hover">
                          <span className="truncate">{chat.title || 'Untitled chat'}</span>
                          <span className="shrink-0 opacity-60">{(sessionMessages[chat.id]?.length || 0) > 0 ? 'Open' : 'Empty'}</span>
                        </button>
                      ))}
                      <button onClick={(e) => { e.stopPropagation(); setActiveProject(project.id); onNewProjectChat?.(project.id) }}
                        className="relative z-20 inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-[11px] font-semibold hover:bg-surface-hover">
                        <Plus size={12}/> New project chat
                      </button>
                    </div>
                  )
                })()}
                <div className="absolute right-4 bottom-3 flex items-center gap-1 text-[11px] pointer-events-none" style={{ color: 'var(--color-text-secondary)' }}><FolderOpen size={13}/><span className="max-w-[160px] truncate">{project.name}</span></div>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-28 text-center">
            <FolderKanban size={32} className="mx-auto" style={{ color: 'var(--color-text-tertiary)' }}/>
            <h2 className="mt-4 text-[18px] font-semibold" style={{ color: 'var(--color-text)' }}>No projects yet</h2>
            <p className="mt-1 text-[12px]" style={{ color: 'var(--color-text-secondary)' }}>Create a project by choosing a local folder.</p>
          </div>
        )}
      </div>
    </div>
  )
}
