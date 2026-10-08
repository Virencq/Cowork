import { useMemo, useState } from 'react'
import { FolderOpen, FolderKanban, MoreHorizontal, Pin, Plus, Search, ArrowUpDown } from 'lucide-react'
import { open } from '@tauri-apps/plugin-dialog'
import { useWorkspaceStore } from '../../stores/workspaceStore'
import { useAppStore } from '../../stores'

export function ProjectsPage({ onOpenProject }: { onOpenProject?: (project: { id: string; name: string; path?: string }) => void }) {
  const projects = useWorkspaceStore(s => s.projects)
  const addProject = useWorkspaceStore(s => s.addProject)
  const setWorkspaceDir = useAppStore(s => s.setWorkspaceDir)
  const [query, setQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [sort, setSort] = useState<'updated' | 'name'>('updated')
  const [pinned, setPinned] = useState<Set<string>>(new Set())

  const visible = useMemo(() => [...projects]
    .filter(p => p.name.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => {
      if (pinned.has(a.id) !== pinned.has(b.id)) return pinned.has(a.id) ? -1 : 1
      return sort === 'name' ? a.name.localeCompare(b.name) : b.updatedAt - a.updatedAt
    }), [projects, query, sort, pinned])

  const createProject = async () => {
    const selected = await open({ directory: true, multiple: false, title: 'Choose project folder' })
    if (typeof selected !== 'string') return
    const name = selected.split(/[\\/]/).filter(Boolean).pop() || 'Project'
    addProject({ name, path: selected })
    setWorkspaceDir(selected)
  }

  return (
    <div className="h-full overflow-auto bg-white pt-11">
      <div className="mx-auto max-w-[980px] px-10 py-9">
        <div className="flex items-center justify-between mb-8">
          <h1 className="font-serif text-[30px] tracking-[-0.03em] text-[#171411]">Projects</h1>
          <div className="flex items-center gap-3">
            <button onClick={() => setSearchOpen(v => !v)} className="h-9 w-9 grid place-items-center rounded-lg hover:bg-[#f3f1ee] text-[#554f49]" title="Search projects"><Search size={18}/></button>
            <button onClick={() => setSort(v => v === 'updated' ? 'name' : 'updated')} className="h-9 w-9 grid place-items-center rounded-lg hover:bg-[#f3f1ee] text-[#554f49]" title="Sort projects"><ArrowUpDown size={17}/></button>
            <button onClick={() => void createProject()} className="h-9 rounded-lg bg-[#171717] px-4 text-[13px] font-semibold text-white hover:bg-black inline-flex items-center gap-2"><Plus size={15}/> New project</button>
          </div>
        </div>
        {searchOpen && (
          <div className="mb-5 relative max-w-sm">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9b948d]"/>
            <input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="Search projects" className="w-full h-9 rounded-lg border border-[#ded8d2] px-9 text-[12px] outline-none"/>
          </div>
        )}
        {visible.length ? (
          <div className="grid grid-cols-2 gap-6">
            {visible.map(project => (
              <div key={project.id} className="group relative h-[78px] rounded-xl border border-[#e2ded9] bg-white px-4 py-3 hover:border-[#cfc8c0] hover:shadow-sm transition">
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
                    <div className="flex items-center gap-2 text-[14px] font-semibold text-[#191613]">
                      <span className="truncate">{project.name}</span>
                      {pinned.has(project.id) && <Pin size={13} className="fill-current text-[#5e5852]"/>}
                    </div>
                    <div className="mt-2 text-[11px] text-[#958e87]">{new Date(project.updatedAt).toLocaleDateString(undefined, {month:'short', day:'numeric'})}</div>
                  </div>
                </div>
                <button onClick={(e) => { e.stopPropagation(); setPinned(s => { const n = new Set(s); n.has(project.id) ? n.delete(project.id) : n.add(project.id); return n })} className="absolute right-3 top-3 h-7 w-7 grid place-items-center rounded-md hover:bg-[#f2efec] text-[#7b746d]" title="Pin project"><MoreHorizontal size={16}/></button>
                <div className="absolute right-4 bottom-3 flex items-center gap-1 text-[11px] text-[#6f6861] pointer-events-none"><FolderOpen size={13}/><span className="max-w-[160px] truncate">{project.name}</span></div>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-28 text-center">
            <FolderKanban size={32} className="mx-auto text-[#c5beb7]"/>
            <h2 className="mt-4 text-[18px] font-semibold text-[#28231f]">No projects yet</h2>
            <p className="mt-1 text-[12px] text-[#8d857d]">Create a project by choosing a local folder.</p>
          </div>
        )}
      </div>
    </div>
  )
}
