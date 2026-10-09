import { useMemo, useState } from 'react'
import JSZip from 'jszip'
import { FolderKanban, FileCode2, Sparkles, PlugZap, Upload, FolderOpen, CheckCircle2 } from 'lucide-react'
import { open } from '@tauri-apps/plugin-dialog'
import { useWorkspaceStore } from '../../stores/workspaceStore'
import { useSkillStore } from '../../stores/skillStore'
import { useMCPStore } from '../../stores/mcpStore'
import { useAppStore } from '../../stores'
import * as db from '../../utils/database'
import type { KiloMessage, MessagePart } from '../../types'

type Section = 'projects' | 'artifacts' | 'skills' | 'connectors'

export async function importWorkspaceFile(file: File): Promise<string> {
  let bundle: any
  let zip: JSZip | null = null
  let claudePortable = false
  let archiveSkills: { name: string; description: string; content: string }[] = []
  let archiveProjects: { id: string; name: string; instructions?: string; createdAt: number; updatedAt: number }[] = []
  let archiveArtifacts: { id: string; name: string; type: string; content: string; createdAt: number; updatedAt: number }[] = []
  let archiveConnectors: any[] = []
  if (file.name.toLowerCase().endsWith('.zip')) {
    zip = await JSZip.loadAsync(await file.arrayBuffer())
    const entries = Object.values(zip.files) as JSZip.JSZipObject[]
    const manifestEntry = entries.find((f) => !f.dir && f.name.toLowerCase() === 'manifest.json')
    if (manifestEntry) {
      try {
        const manifest = JSON.parse(await manifestEntry.async('text'))
        claudePortable = Number(manifest?.schemaVersion) > 0 && !!(manifest?.sourcePaths || manifest?.archiveTargets) && /claudeportable/i.test(file.name + ' ' + (manifest?.toolVersion || ''))
      } catch { /* not a ClaudePortable manifest */ }
    }
    const conversationEntry = entries.find((f) => !f.dir && /(^|[/\\\\])conversations\.json$/i.test(f.name))
    const bundleEntry = entries.find((f) => !f.dir && /(^|[/\\\\])(cowork|s-loop).*\.json$/i.test(f.name))
    const jsonEntry = conversationEntry || bundleEntry || (!claudePortable ? entries.find((f) => !f.dir && f.name.toLowerCase().endsWith('.json')) : undefined)
    if (jsonEntry) {
      try { bundle = JSON.parse(await jsonEntry.async('text')) } catch { bundle = {} }
    } else {
      bundle = {}
    }
    if (claudePortable && zip) {
      const allFiles = Object.values(zip.files) as JSZip.JSZipObject[]
      const skillFiles = allFiles.filter((f) => !f.dir && /(?:^|[/\\\\])skills?[/\\\\][^/\\\\]+[/\\\\]SKILL\.md$/i.test(f.name))
      for (const skillFile of skillFiles) {
        const text = await skillFile.async('text')
        const nameFromPath = skillFile.name.split('/').filter(Boolean).slice(-2, -1)[0] || 'Imported skill'
        const frontmatterName = text.match(/^---\s*[\s\S]*?^name:\s*['\"]?([^\r\n'\"]+)/m)?.[1]?.trim()
        const description = text.match(/^---\s*[\s\S]*?^description:\s*['\"]?([^\r\n'\"]+)/m)?.[1]?.trim() || ''
        const name = (frontmatterName || nameFromPath).replace(/[^a-zA-Z0-9 _-]/g, '').trim()
        if (name && text.trim()) archiveSkills.push({ name, description, content: text })
      }
      const projectRoots = new Set(allFiles.filter((f) => !f.dir && f.name.startsWith('cowork-projects/')).map((f) => f.name.split('/').slice(0, 2).join('/')))
      for (const root of projectRoots) {
        const hash = root.split('/')[1] || 'project'
        archiveProjects.push({ id: 'claudeportable-' + hash, name: 'Claude project ' + hash, createdAt: Date.now(), updatedAt: Date.now() })
      }
      const localJsons = allFiles.filter((f) => !f.dir && f.name.startsWith('claude-desktop/appdata/local-agent-mode-sessions/') && f.name.toLowerCase().endsWith('.json'))
      for (const entry of localJsons) {
        try {
          const data = JSON.parse(await entry.async('text'))
          const projectName = String(data.name || data.projectName || data.title || '')
          if (projectName && !archiveProjects.some((p) => p.name === projectName)) archiveProjects.push({ id: 'claude-session-' + entry.name.split('/').slice(-2, -1)[0], name: projectName, instructions: typeof data.instructions === 'string' ? data.instructions : undefined, createdAt: toTimestamp(data.createdAt || data.created_at) || Date.now(), updatedAt: toTimestamp(data.updatedAt || data.updated_at) || Date.now() })
          const messages = Array.isArray(data.chat_messages) ? data.chat_messages : Array.isArray(data.messages) ? data.messages : []
          if (messages.length) {
            const title = projectName || entry.name.split('/').pop() || 'Claude Cowork session'
            archiveArtifacts.push({ id: 'claude-session-export-' + entry.name.replace(/[^a-zA-Z0-9_-]/g, '-'), name: title + ' (session metadata)', type: 'session-metadata', content: JSON.stringify(data, null, 2), createdAt: Date.now(), updatedAt: Date.now() })
          }
          const mcpServers = data.mcpServers || data.mcp_servers
          if (mcpServers && typeof mcpServers === 'object') {
            for (const [name, config] of Object.entries(mcpServers as Record<string, any>)) {
              if (config && typeof config === 'object' && !archiveConnectors.some((c) => c.name === name)) archiveConnectors.push({ name, type: config.url ? (config.type === 'sse' ? 'sse' : 'http') : 'stdio', command: config.command, args: config.args || [], url: config.url, disabled: false })
            }
          }
        } catch { /* skip unrelated or non-JSON state */ }
      }
    }
  } else {
    bundle = JSON.parse(await file.text())
  }
  if (Array.isArray(bundle)) {
    if (bundle.some((item) => item && (Array.isArray(item.chat_messages) || Array.isArray(item.messages)))) bundle = { conversations: bundle }
    else throw new Error('This JSON file does not look like a Claude conversation export.')
  }
  if (!bundle || typeof bundle !== 'object') throw new Error('The selected file is not a supported Claude export or Cowork bundle.')
  const counts = useWorkspaceStore.getState().importBundle({
    projects: [...(Array.isArray(bundle.projects) ? bundle.projects : []), ...archiveProjects],
    artifacts: [...(Array.isArray(bundle.artifacts) ? bundle.artifacts : []), ...archiveArtifacts],
  })
  let importedSkills = 0
  const skills = [...(Array.isArray(bundle.skills) ? bundle.skills : []), ...archiveSkills]
  const seenSkillNames = new Set<string>()
  for (const skill of skills) {
    if (skill?.name && (skill.content || skill.body) && !seenSkillNames.has(String(skill.name).toLowerCase())) {
      seenSkillNames.add(String(skill.name).toLowerCase())
      await useSkillStore.getState().addSkill(skill.name, skill.description || '', skill.content || skill.body)
      importedSkills++
    }
  }
  let importedConnectors = 0
  const connectors = [...(Array.isArray(bundle.connectors) ? bundle.connectors : []), ...archiveConnectors]
  for (const connector of connectors) {
    if (connector?.name && connector?.type && !useMCPStore.getState().servers.some((s) => s.name === connector.name)) {
      useMCPStore.getState().addServer({ ...connector, env: undefined, headers: undefined })
      importedConnectors++
    }
  }
  const conversations: any[] = Array.isArray(bundle.conversations) ? bundle.conversations : Array.isArray(bundle.chats) ? bundle.chats : Array.isArray(bundle.chat_history) ? bundle.chat_history : []
  let importedChats = 0
  let importedMessages = 0
  const existingSessions = await db.getAllSessions()
  const existingIds = new Set(existingSessions.map((session) => session.id))
  for (const conversation of conversations) {
    if (!conversation || typeof conversation !== 'object') continue
    const originalId = String(conversation.uuid || conversation.id || conversation.conversation_id || '')
    const stableSourceId = originalId || String(conversation.name || conversation.title || 'chat') + '-' + String(conversation.created_at || '')
    const sessionId = 'claude-' + stableSourceId.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 80)
    if (existingIds.has(sessionId)) continue
    const rawMessages: any[] = Array.isArray(conversation.chat_messages) ? conversation.chat_messages : Array.isArray(conversation.messages) ? conversation.messages : []
    if (!rawMessages.length) continue
    const title = String(conversation.name || conversation.title || 'Imported Claude chat').trim() || 'Imported Claude chat'
    const createdAt = toTimestamp(conversation.created_at) || Date.now()
    await db.createSession(sessionId, title)
    for (let index = 0; index < rawMessages.length; index++) {
      const raw = rawMessages[index]
      const sender = String(raw.sender || raw.role || raw.author?.role || '').toLowerCase()
      const role: 'user' | 'assistant' = ['human', 'user'].includes(sender) ? 'user' : 'assistant'
      const textContent = extractClaudeMessageText(raw)
      if (!textContent) continue
      const messageId = ('claude-' + sessionId + '-' + index).slice(0, 120)
      const created = toTimestamp(raw.created_at || raw.updated_at) || createdAt + index
      const parts: MessagePart[] = [{ id: messageId + '-text', type: 'text', text: textContent, time: { created } }]
      const message: KiloMessage = { info: { id: messageId, sessionID: sessionId, role, time: { created } }, parts }
      await db.saveMessage(messageId, sessionId, role, parts, message.info as unknown as Record<string, unknown>)
      importedMessages++
    }
    importedChats++
    existingIds.add(sessionId)
  }
  await useAppStore.getState().loadFromDb()
  const sourceLabel = claudePortable ? 'ClaudePortable backup' : 'export/bundle'
  const note = claudePortable ? ' ClaudePortable stores most Desktop chat history in LevelDB; raw history is preserved in the archive but is not yet decoded into Cowork chats.' : ''
  return 'Import complete (' + sourceLabel + '): ' + counts.projects + ' projects, ' + importedChats + ' chats, ' + importedMessages + ' messages, ' + counts.artifacts + ' artifacts, ' + importedSkills + ' skills, and ' + importedConnectors + ' connectors.' + note
}
function toTimestamp(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value < 1e12 ? value * 1000 : value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Date.parse(value)
    if (Number.isFinite(parsed)) return parsed
    const numeric = Number(value)
    if (Number.isFinite(numeric)) return numeric < 1e12 ? numeric * 1000 : numeric
  }
  return null
}

function extractClaudeMessageText(message: any): string {
  if (typeof message.text === 'string' && message.text.trim()) return message.text
  if (typeof message.content === 'string') return message.content
  if (Array.isArray(message.content)) return message.content.map((part: any) => typeof part === 'string' ? part : (typeof part?.text === 'string' ? part.text : typeof part?.content === 'string' ? part.content : '')).filter(Boolean).join('\n')
  if (Array.isArray(message.message?.content)) return message.message.content.map((part: any) => typeof part === 'string' ? part : (part?.text || '')).filter(Boolean).join('\n')
  return ''
}
export function ImportLibraryButton({ className = '' }: { className?: string }) {
  const [message, setMessage] = useState('')
  return (
    <label className={`cursor-pointer inline-flex items-center justify-center gap-2 rounded-lg bg-[#d97745] px-4 py-2.5 text-[12px] font-semibold text-white hover:bg-[#c96838] ${className}`}>
      <Upload size={15}/> Import Claude Cowork
      <input type="file" className="hidden" accept=".json,.zip" onChange={async (e) => {
        const f = e.target.files?.[0]
        if (f) setMessage(await importWorkspaceFile(f).catch((err) => err instanceof Error ? err.message : 'Import failed.'))
        e.currentTarget.value = ''
      }} />
      {message && <span role="status" className="ml-2 max-w-[280px] text-[11px] font-medium text-text-secondary">{message}</span>}
    </label>
  )
}

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
          <ImportLibraryButton />
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
