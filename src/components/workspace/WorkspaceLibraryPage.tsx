import { useMemo, useState } from 'react'
import JSZip from 'jszip'
import { FolderKanban, FileCode2, Sparkles, PlugZap, Upload, FolderOpen, CheckCircle2 } from 'lucide-react'
import { open } from '@tauri-apps/plugin-dialog'
import { useWorkspaceStore } from '../../stores/workspaceStore'
import { useSkillStore } from '../../stores/skillStore'
import { useMCPStore } from '../../stores/mcpStore'
import { useAppStore } from '../../stores'

type Section = 'projects' | 'artifacts' | 'skills' | 'connectors'

export function WorkspaceLibraryPage({ initialSection = 'projects' }: { initialSection?: Section }) {
  const [section, setSection] = useState<Section>(initialSection)
  const [message, setMessage] = useState('')
  const projects = useWorkspaceStore((s) => s.projects)
  const artifacts = useWorkspaceStore((s) => s.artifacts)
  const skills = useSkillStore((s) => s.skills)
  const servers = useMCPStore((s) => s.servers)
  const importBundle = useWorkspaceStore((s) => s.importBundle)
  const addProject = useWorkspaceStore((s) => s.addProject)
  const setWorkspaceDir = useAppStore((s) => s.setWorkspaceDir)

  const chooseProject = async () => {
    const selected = await open({ directory: true, multiple: false, title: 'Choose project folder' })
    if (typeof selected !== 'string') return
    const name = selected.split(/[\\/]/).filter(Boolean).pop() || 'Project'
    addProject({ name, path: selected })
    setWorkspaceDir(selected)
    setMessage(`Project “${name}” added.`)
  }

  const importFile = async (file: File) => {
    try {
      let bundle: any
      if (file.name.toLowerCase().endsWith('.zip')) {
        const zip = await JSZip.loadAsync(await file.arrayBuffer())
        const jsonEntry = Object.values(zip.files).find((f: any) => !f.dir && /(^|[/\\])(cowork|s-loop|manifest).*\\.json$/i.test(f.name))
          || Object.values(zip.files).find((f: any) => !f.dir && f.name.toLowerCase().endsWith('.json'))
        if (!jsonEntry) throw new Error('No JSON manifest found in the archive.')
        bundle = JSON.parse(await (jsonEntry as any).async('text'))
      } else {
        bundle = JSON.parse(await file.text())
      }

      const counts = importBundle(bundle)
      if (Array.isArray(bundle.skills)) {
        for (const skill of bundle.skills) {
          if (skill?.name && (skill.content || skill.body)) {
            await useSkillStore.getState().addSkill(skill.name, skill.description || '', skill.content || skill.body)
          }
        }
      }
      if (Array.isArray(bundle.connectors)) {
        for (const connector of bundle.connectors) {
          if (connector?.name && connector?.type) {
            useMCPStore.getState().addServer(connector)
          }
        }
      }
      setMessage(`Imported ${counts.projects} projects, ${counts.artifacts} artifacts, ${bundle.skills?.length || 0} skills, and ${bundle.connectors?.length || 0} connectors.`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Import failed.')
    }
  }

  const sections = [
    ['projects', 'Projects', FolderKanban, projects.length],
    ['artifacts', 'Artifacts', FileCode2, artifacts.length],
    ['skills', 'Skills', Sparkles, skills.length],
    ['connectors', 'Connectors', PlugZap, servers.length],
  ] as const

  const title = useMemo(() => sections.find(([key]) => key === section)?.[1] || 'Library', [section])

  return (
    <div className="h-full overflow-auto bg-[#faf9f7] pt-11">
      <div className="mx-auto max-w-5xl px-10 py-10">
        <div className="flex items-end justify-between gap-6 mb-8">
          <div>
            <div className="text-[11px] uppercase tracking-[.16em] font-semibold text-[#9a938c]">Library</div>
            <h1 className="mt-1 text-[30px] font-serif tracking-tight text-[#302c28]">{title}</h1>
            <p className="mt-2 text-[13px] text-[#8b837b]">Projects, artifacts, skills, and connected tools in one place.</p>
          </div>
          <label className="cursor-pointer inline-flex items-center gap-2 rounded-lg bg-[#d97745] px-4 py-2.5 text-[12px] font-semibold text-white hover:bg-[#c96838]">
            <Upload size={15}/> Import
            <input type="file" className="hidden" accept=".json,.zip" onChange={(e) => { const f = e.target.files?.[0]; if (f) void importFile(f); e.currentTarget.value = '' }} />
          </label>
        </div>

        <div className="grid grid-cols-4 gap-2 mb-8">
          {sections.map(([key, label, Icon, count]) => (
            <button key={key} onClick={() => setSection(key as Section)} className={`rounded-xl border px-4 py-3 text-left transition ${section === key ? 'border-[#d97745]/35 bg-[#f4e8df]' : 'border-[#e5dfd8] bg-white hover:bg-[#f7f4f0]'}`}>
              <div className="flex items-center gap-2 text-[#6d665f]"><Icon size={15}/><span className="text-[11px] font-semibold">{label}</span><span className="ml-auto text-[11px] text-[#9b938a]">{count}</span></div>
            </button>
          ))}
        </div>

        {message && <div className="mb-5 flex items-center gap-2 rounded-lg border border-[#d97745]/20 bg-[#fff8f3] px-4 py-3 text-[12px] text-[#765b4c]"><CheckCircle2 size={15}/>{message}</div>}

        {section === 'projects' && (
          <div>
            <button onClick={() => void chooseProject()} className="mb-4 w-full rounded-xl border border-dashed border-[#d8cec4] bg-white px-5 py-5 text-left hover:border-[#d97745]/50">
              <div className="flex items-center gap-3"><FolderOpen size={18} className="text-[#d97745]"/><div><div className="text-[13px] font-semibold">Add a local project</div><div className="mt-1 text-[11px] text-[#958d84]">Choose a folder. Cowork will use it as the project workspace.</div></div></div>
            </button>
            <div className="space-y-2">{projects.map(p => <div key={p.id} className="rounded-xl border border-[#e5dfd8] bg-white p-4 flex items-center justify-between"><div><div className="text-[13px] font-semibold">{p.name}</div><div className="mt-1 text-[11px] text-[#978f87]">{p.path || 'No local folder'}</div></div><button onClick={() => { if (p.path) setWorkspaceDir(p.path); setMessage(`Workspace switched to “${p.name}”.`) }} className="rounded-lg border border-[#e4ddd6] px-3 py-2 text-[11px] font-semibold hover:bg-[#f5f1ed]">Open</button></div>)}</div>
            {projects.length === 0 && <div className="rounded-xl border border-[#e5dfd8] bg-white p-10 text-center text-[12px] text-[#978f87]">No projects yet. Add a folder or import a bundle.</div>}
          </div>
        )}

        {section === 'artifacts' && (
          <div className="space-y-2">{artifacts.map(a => <div key={a.id} className="rounded-xl border border-[#e5dfd8] bg-white p-4"><div className="text-[13px] font-semibold">{a.name}</div><div className="mt-1 text-[11px] text-[#978f87]">{a.type || 'Artifact'}{a.path ? ` · ${a.path}` : ''}</div></div>)}{artifacts.length === 0 && <div className="rounded-xl border border-[#e5dfd8] bg-white p-10 text-center text-[12px] text-[#978f87]">No artifacts yet. Artifacts created by JCode can be registered here as they are produced.</div>}</div>
        )}

        {section === 'skills' && (
          <div className="space-y-2">{skills.map(s => <div key={s.name} className="rounded-xl border border-[#e5dfd8] bg-white p-4 flex items-center justify-between"><div><div className="text-[13px] font-semibold">{s.name}</div><div className="mt-1 text-[11px] text-[#978f87]">{s.description || 'No description'}</div></div><button onClick={() => useSkillStore.getState().toggleSkill(s.name)} className={`rounded-full px-3 py-1.5 text-[10px] font-semibold ${s.enabled ? 'bg-[#e9f3e9] text-[#4c754c]' : 'bg-[#f0ece8] text-[#938b83]'}`}>{s.enabled ? 'Enabled' : 'Disabled'}</button></div>)}{skills.length === 0 && <div className="rounded-xl border border-[#e5dfd8] bg-white p-10 text-center text-[12px] text-[#978f87]">No skills discovered.</div>}</div>
        )}

        {section === 'connectors' && (
          <div className="space-y-2">{servers.map(s => <div key={s.name} className="rounded-xl border border-[#e5dfd8] bg-white p-4 flex items-center justify-between"><div><div className="text-[13px] font-semibold">{s.name}</div><div className="mt-1 text-[11px] text-[#978f87]">{s.type} connector</div></div><span className="rounded-full bg-[#f1eeea] px-3 py-1.5 text-[10px] font-semibold text-[#766e66]">{s.disabled ? 'Disabled' : 'Configured'}</span></div>)}{servers.length === 0 && <div className="rounded-xl border border-[#e5dfd8] bg-white p-10 text-center text-[12px] text-[#978f87]">No connectors configured.</div>}</div>
        )}
      </div>
    </div>
  )
}
