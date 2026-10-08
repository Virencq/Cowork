import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import {
  Archive, CalendarClock, ChevronLeft, ChevronRight, FolderKanban, History, FileCode2,
  Lightbulb, Menu, Plus, Search, Settings, Sparkles, X, SlidersHorizontal,
  PanelRight, Clock3, MoreHorizontal, Pin, Pencil, Trash2, MailOpen, FolderPlus, Check
} from 'lucide-react'
import { ChatView } from './components/chat'
import { SettingsModal } from './components/settings'
import { TasksPage } from './components/tasks'
import { GoalPage } from './components/goal/GoalPage'
import { ExtensionsPage } from './components/extensions/ExtensionsPage'
import { WorkspaceLibraryPage } from './components/workspace/WorkspaceLibraryPage'
import { useAppStore } from './stores'
import { useTaskScheduler, useTelegramChatSync } from './hooks'
import { useMCPStore } from './stores/mcpStore'
import { useSkillStore } from './stores/skillStore'
import { useAgentStore } from './stores/agentStore'
import { useWorkspaceStore } from './stores/workspaceStore'
import { initDatabase } from './utils/database'
import { getAllSessions, createSession as dbCreateSession, saveMessage as dbSaveMessage } from './utils/database'
import { status as jcodeStatus } from './utils/jcodeClient'
import { getActiveTokens } from './themes'

export type Page = 'chat' | 'tasks' | 'projects' | 'ideas' | 'extensions' | 'artifacts' | 'customize'

const inTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
const APP_STORAGE_KEY = 'snotra-storage'

function WindowControls() {
  const appWindow = inTauri ? getCurrentWindow() : null
  return (
    <div className="flex h-full">
      <button onClick={() => appWindow?.minimize()} className="title-control">—</button>
      <button onClick={() => appWindow?.toggleMaximize()} className="title-control">□</button>
      <button onClick={() => appWindow?.close()} className="title-control hover:bg-[#e81123] hover:text-white">×</button>
    </div>
  )
}

function CoworkTitleBar() {
  const appWindow = inTauri ? getCurrentWindow() : null
  const drag = useCallback((e: React.MouseEvent) => {
    if (e.detail === 2) { void appWindow?.toggleMaximize(); return }
    if (e.target === e.currentTarget) void appWindow?.startDragging()
  }, [appWindow])
  return (
    <header onMouseDown={drag} className="fixed top-0 left-0 right-0 z-[100] h-11 border-b border-[#e7e2dc] bg-[#faf9f7]/95 backdrop-blur-xl flex items-center justify-between select-none">
      <div className="flex items-center gap-2 px-4 pointer-events-none">
        <div className="h-6 w-6 rounded-full bg-[#d97745] text-white grid place-items-center text-[13px] font-semibold">C</div>
        <span className="text-[13px] font-semibold tracking-tight text-[#292622]">Cowork</span>
      </div>
      <WindowControls />
    </header>
  )
}

function ResizeHandle({ side, onDrag }: { side: 'left' | 'right'; onDrag: (delta: number) => void }) {
  const start = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    const x = e.clientX
    const move = (ev: PointerEvent) => onDrag(side === 'left' ? ev.clientX - x : x - ev.clientX)
    const end = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end)
  }
  return <div onPointerDown={start} className={`absolute top-0 bottom-0 w-1 cursor-col-resize hover:bg-[#d97745]/25 z-30 ${side === 'left' ? 'right-0' : 'left-0'}`} />
}

function LeftNav({ width, onWidth, page, onPage, onNew }: {
  width: number; onWidth: (n: number) => void; page: Page; onPage: (p: Page) => void; onNew: () => void
}) {
  const sessions = useAppStore((s) => s.sessions)
  const activeSessionId = useAppStore((s) => s.activeSessionId)
  const setActiveSession = useAppStore((s) => s.setActiveSession)
  const updateSessionTitle = useAppStore((s) => s.updateSessionTitle)
  const deleteSession = useAppStore((s) => s.deleteSession)
  const [query, setQuery] = useState('')
  const [menuId, setMenuId] = useState<string | null>(null)
  const [pinned, setPinned] = useState<Set<string>>(new Set())
  const [unread, setUnread] = useState<Set<string>>(new Set())
  const [archived, setArchived] = useState<Set<string>>(new Set())
  const [renaming, setRenaming] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')

  const recent = sessions
    .filter(s => !archived.has(s.id))
    .filter(s => !query || s.title.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => {
      const ap = pinned.has(a.id) ? 1 : 0
      const bp = pinned.has(b.id) ? 1 : 0
      if (ap !== bp) return bp - ap
      return b.updatedAt - a.updatedAt
    })
    .slice(0, 12)

  const beginRename = (id: string, title: string) => {
    setRenaming(id)
    setRenameValue(title)
    setMenuId(null)
  }

  const commitRename = (id: string) => {
    const title = renameValue.trim()
    if (title) updateSessionTitle(id, title)
    setRenaming(null)
  }

  const item = (icon: ReactNode, label: string, target: Page, badge?: string) => (
    <button onClick={() => onPage(target)} className={`cowork-nav-item ${page === target ? 'active' : ''}`}>
      {icon}<span>{label}</span>{badge && <span className="ml-auto text-[10px] text-[#8d877f]">{badge}</span>}
    </button>
  )

  return (
    <aside style={{ width }} className="relative shrink-0 h-full border-r border-[#e7e2dc] bg-[#f5f3f0] pt-11 flex flex-col text-[#38342f]">
      <ResizeHandle side="left" onDrag={(d) => onWidth(Math.max(220, Math.min(380, width + d)))} />
      <div className="p-3">
        <button onClick={onNew} className="w-full h-10 rounded-lg bg-[#d97745] text-white text-[13px] font-semibold flex items-center justify-center gap-2 hover:bg-[#c96838] transition-colors shadow-sm">
          <Plus size={17} /> New task
        </button>
      </div>

      <div className="px-3 pb-2">
        <div className="relative">
          <Search size={15} className="absolute left-3 top-2.5 text-[#918b84]" />
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search" className="w-full h-9 rounded-lg bg-white border border-[#e4dfd9] pl-9 pr-3 text-[12px] outline-none focus:border-[#d97745]/50" />
        </div>
      </div>

      <nav className="px-2 space-y-0.5">
        {item(<Clock3 size={16} />, 'Scheduled', 'tasks')}
        {item(<Lightbulb size={16} />, 'Ideas', 'ideas')}
        {item(<SlidersHorizontal size={16} />, 'Customize', 'customize')}
        {item(<FileCode2 size={16} />, 'Artifacts', 'artifacts')}
        {item(<FolderKanban size={16} />, 'Projects', 'projects')}
      </nav>

      <div className="mt-5 px-4 flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-[.12em] text-[#928b84]">Recents</span>
        <History size={13} className="text-[#a39c94]" />
      </div>

      <div className="px-2 mt-1 overflow-auto min-h-0">
        {recent.map(s => (
          <div key={s.id} className={`relative group rounded-lg ${activeSessionId === s.id ? 'bg-white shadow-sm' : 'hover:bg-white/70'}`}>
            {renaming === s.id ? (
              <div className="flex items-center gap-1 px-2 py-1.5">
                <input
                  autoFocus
                  value={renameValue}
                  onChange={e => setRenameValue(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') commitRename(s.id); if (e.key === 'Escape') setRenaming(null) }}
                  className="min-w-0 flex-1 h-7 rounded-md border border-[#d8d0c8] bg-white px-2 text-[11px] outline-none"
                />
                <button onClick={() => commitRename(s.id)} className="h-7 w-7 rounded-md hover:bg-[#eee9e3] grid place-items-center"><Check size={13}/></button>
                <button onClick={() => setRenaming(null)} className="h-7 w-7 rounded-md hover:bg-[#eee9e3] grid place-items-center"><X size={13}/></button>
              </div>
            ) : (
              <>
                <button
                  onClick={() => { onPage('chat'); setActiveSession(s.id); setUnread(prev => { const n = new Set(prev); n.delete(s.id); return n }) }}
                  className="w-full text-left rounded-lg pl-3 pr-9 py-2 text-[12px] truncate text-[#6e6861]"
                >
                  <span className="inline-flex items-center gap-1.5 max-w-full">
                    {pinned.has(s.id) && <Pin size={10} className="shrink-0 text-[#d97745]" fill="currentColor" />}
                    {unread.has(s.id) && <span className="h-1.5 w-1.5 rounded-full bg-[#d97745] shrink-0" />}
                    <span className="truncate">{s.title || 'Untitled task'}</span>
                  </span>
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); setMenuId(menuId === s.id ? null : s.id) }}
                  className="absolute right-1.5 top-1.5 h-7 w-7 rounded-md opacity-0 group-hover:opacity-100 hover:bg-[#eee9e3] grid place-items-center text-[#777069]"
                  title="Task options"
                >
                  <MoreHorizontal size={15}/>
                </button>

                {menuId === s.id && (
                  <div className="absolute right-1 top-9 z-50 w-48 rounded-xl border border-[#ddd5cd] bg-white p-1.5 shadow-[0_10px_30px_rgba(50,40,30,.12)]">
                    <button onClick={() => { setPinned(prev => { const n = new Set(prev); n.has(s.id) ? n.delete(s.id) : n.add(s.id); return n }); setMenuId(null) }} className="menu-row">
                      <Pin size={14}/> {pinned.has(s.id) ? 'Unpin' : 'Pin'} <span className="ml-auto text-[10px] text-[#aaa29a]">P</span>
                    </button>
                    <button onClick={() => beginRename(s.id, s.title)} className="menu-row"><Pencil size={14}/> Rename</button>
                    <button onClick={() => { setUnread(prev => { const n = new Set(prev); n.add(s.id); return n }); setMenuId(null) }} className="menu-row"><MailOpen size={14}/> Mark as unread <span className="ml-auto text-[10px] text-[#aaa29a]">U</span></button>
                    <button onClick={() => { onPage('projects'); setMenuId(null) }} className="menu-row"><FolderPlus size={14}/> Add to project</button>
                    <div className="my-1 border-t border-[#eee9e3]"/>
                    <button onClick={() => { setArchived(prev => new Set(prev).add(s.id)); setMenuId(null) }} className="menu-row"><Archive size={14}/> Archive <span className="ml-auto text-[10px] text-[#aaa29a]">A</span></button>
                    <button onClick={() => { deleteSession(s.id); setMenuId(null) }} className="menu-row text-[#b44b3c] hover:bg-[#fff1ee]"><Trash2 size={14}/> Delete <span className="ml-auto text-[10px]">D</span></button>
                  </div>
                )}
              </>
            )}
          </div>
        ))}
        {recent.length === 0 && <div className="px-3 py-3 text-[11px] text-[#9b948d]">No recent tasks</div>}
      </div>

      <div className="mt-auto p-3 flex items-center gap-2">
        <button onClick={() => window.dispatchEvent(new CustomEvent('s-loop:open-settings'))} className="flex-1 h-9 rounded-lg hover:bg-white text-[#6e6861] flex items-center gap-2 px-3 text-[12px]">
          <Settings size={15} /> Settings
        </button>
        <button className="h-9 w-9 rounded-lg hover:bg-white grid place-items-center text-[#6e6861]" title="Collapse sidebar"><ChevronLeft size={16} /></button>
      </div>
    </aside>
  )
}

function RightPanel({ width, onWidth, onClose }: { width: number; onWidth: (n: number) => void; onClose: () => void }) {
  const workspaceDir = useAppStore((s) => s.workspaceDir)
  const projects = useWorkspaceStore((s) => s.projects)
  const updateProject = useWorkspaceStore((s) => s.updateProject)
  const project = projects.find((p) => p.path && workspaceDir && p.path === workspaceDir)
  const [editingInstructions, setEditingInstructions] = useState(false)
  const [draftInstructions, setDraftInstructions] = useState(project?.instructions || '')

  useEffect(() => {
    setDraftInstructions(project?.instructions || '')
    setEditingInstructions(false)
  }, [project?.id, project?.instructions])

  const saveInstructions = () => {
    if (project) {
      updateProject(project.id, { instructions: draftInstructions.trim() })
    }
    setEditingInstructions(false)
  }

  return (
    <aside style={{ width }} className="relative shrink-0 h-full border-l border-[#e7e2dc] bg-[#fbfaf8] pt-11 overflow-auto">
      <ResizeHandle side="right" onDrag={(d) => onWidth(Math.max(280, Math.min(440, width + d)))} />
      <div className="h-14 px-5 flex items-center justify-between border-b border-[#ebe6e0]">
        <div>
          <div className="text-[11px] uppercase tracking-[.12em] font-semibold text-[#9a938c]">Project</div>
          <div className="text-[14px] font-semibold text-[#302c28] truncate max-w-[210px]">{project?.name || 'Workspace'}</div>
        </div>
        <button onClick={onClose} className="h-8 w-8 rounded-md hover:bg-[#f0ece7] grid place-items-center text-[#817a72]" title="Close panel"><X size={16}/></button>
      </div>

      <section className="border-b border-[#ebe6e0]">
        <div className="px-5 py-4 flex items-center justify-between">
          <div>
            <div className="text-[13px] font-semibold text-[#302c28]">Instructions</div>
            <div className="mt-1 text-[11px] text-[#9a938c]">Instructions for this project</div>
          </div>
          <button onClick={() => { setDraftInstructions(project?.instructions || ''); setEditingInstructions(true) }} className="h-8 w-8 rounded-md hover:bg-[#eee9e3] grid place-items-center text-[#817a72]" title={project?.instructions ? 'Edit instructions' : 'Add instructions'}>
            {project?.instructions ? <Pencil size={15}/> : <Plus size={16}/>}
          </button>
        </div>
        <div className="px-5 pb-5">
          {editingInstructions ? (
            <div>
              <textarea
                autoFocus
                value={draftInstructions}
                onChange={e => setDraftInstructions(e.target.value)}
                placeholder="Tell JCode how to work in this project..."
                className="w-full min-h-[130px] resize-y rounded-lg border border-[#d8d0c8] bg-white p-3 text-[12px] leading-5 text-[#403a35] outline-none focus:border-[#d97745]/60"
              />
              <div className="mt-2 flex justify-end gap-2">
                <button onClick={() => setEditingInstructions(false)} className="rounded-lg px-3 py-1.5 text-[11px] text-[#746c64] hover:bg-[#eee9e3]">Cancel</button>
                <button onClick={saveInstructions} className="rounded-lg bg-[#302c28] px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-black">Save</button>
              </div>
            </div>
          ) : (
            <p className="text-[12px] leading-5 text-[#6f675f] whitespace-pre-wrap">
              {project?.instructions || 'Add instructions to guide JCode on goals, style, constraints, and project conventions.'}
            </p>
          )}
        </div>
      </section>

      <section className="border-b border-[#ebe6e0]">
        <div className="px-5 py-4">
          <div className="text-[13px] font-semibold text-[#302c28]">Memory</div>
          <div className="mt-1 text-[11px] text-[#9a938c]">Project memory</div>
        </div>
        <div className="px-5 pb-5 text-[12px] leading-5 text-[#777068]">
          Ask JCode to remember project-specific information. Saved memory will appear here.
        </div>
      </section>

      <section className="border-b border-[#ebe6e0]">
        <div className="px-5 py-4 flex items-center justify-between">
          <div>
            <div className="text-[13px] font-semibold text-[#302c28]">Context</div>
            <div className="mt-1 text-[11px] text-[#9a938c]">Files and folders available to JCode</div>
          </div>
          <button className="h-7 w-7 rounded-md hover:bg-[#eee9e3] grid place-items-center text-[#817a72]" title="Add context"><Plus size={15}/></button>
        </div>
        <div className="px-5 pb-5">
          <div className="rounded-lg border border-[#e7e0d9] bg-white px-3 py-2.5 flex items-center gap-2">
            <FolderKanban size={15} className="text-[#8c837b]"/>
            <span className="text-[11px] truncate text-[#5f5851]">{project?.path || workspaceDir || 'No project folder selected'}</span>
          </div>
        </div>
      </section>

      <section>
        <div className="px-5 py-4 flex items-center justify-between">
          <div>
            <div className="text-[13px] font-semibold text-[#302c28]">Scheduled</div>
            <div className="mt-1 text-[11px] text-[#9a938c]">Recurring tasks for this project</div>
          </div>
          <button className="h-7 w-7 rounded-md hover:bg-[#eee9e3] grid place-items-center text-[#817a72]" title="Add scheduled task"><Plus size={15}/></button>
        </div>
      </section>
    </aside>
  )
}

function App() {
  const { theme, colorScheme } = useAppStore()
  const createSession = useAppStore((s) => s.createSession)
  const setActiveSession = useAppStore((s) => s.setActiveSession)
  const [page, setPage] = useState<Page>('chat')
  const [showSettings, setShowSettings] = useState(false)
  const [leftWidth, setLeftWidth] = useState(250)
  const [rightWidth, setRightWidth] = useState(330)
  const [rightOpen, setRightOpen] = useState(true)

  useTaskScheduler()
  useTelegramChatSync()

  useEffect(() => {
    const openSettings = () => setShowSettings(true)
    window.addEventListener('s-loop:open-settings', openSettings)
    return () => window.removeEventListener('s-loop:open-settings', openSettings)
  }, [])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    const tokens = getActiveTokens(colorScheme || 'terracotta', theme)
    for (const [key, value] of Object.entries(tokens)) document.documentElement.style.setProperty(key, value)
  }, [theme, colorScheme])

  useEffect(() => {
    if (!inTauri) return
    void jcodeStatus().catch(() => {})
    useMCPStore.getState().refreshAllServers().catch(() => {})
    useSkillStore.getState().refreshSkills().catch(() => {})
    initDatabase().then(async () => {
      const storedState = localStorage.getItem(APP_STORAGE_KEY)
      if (storedState) {
        try {
          const parsed = JSON.parse(storedState)
          const { sessions, sessionMessages } = parsed?.state || {}
          if (sessions?.length > 0 && (await getAllSessions()).length === 0) {
            for (const s of sessions) await dbCreateSession(s.id, s.title || '', s.model || '', s.piId || undefined)
            if (sessionMessages) for (const [sessionId, msgs] of Object.entries(sessionMessages)) {
              if (Array.isArray(msgs)) for (const msg of msgs as any[]) await dbSaveMessage(msg.info?.id || msg.id, sessionId, msg.info?.role || 'assistant', msg.parts || [], msg.info || {})
            }
          }
        } catch {}
      }
      await useAppStore.getState().loadFromDb()
      const state = useAppStore.getState()
      if (state.activeSessionId) await state.loadMessages(state.activeSessionId)
    }).catch(console.warn)
  }, [])

  const newTask = () => {
    const id = createSession()
    setActiveSession(id)
    setPage('chat')
  }

  return (
    <div className="h-screen w-screen overflow-hidden bg-[#faf9f7] text-[#302c28]">
      <CoworkTitleBar />
      <div className="h-full flex">
        <LeftNav width={leftWidth} onWidth={setLeftWidth} page={page} onPage={setPage} onNew={newTask} />
        <main className="relative min-w-0 flex-1 pt-11 flex flex-col bg-[#faf9f7]">
          <div className="min-h-0 flex-1 flex">
            <div className="min-w-0 flex-1 flex flex-col">
              {page === 'chat' && <ChatView />}
              {page === 'tasks' && <TasksPage />}
              {page === 'projects' && <WorkspaceLibraryPage initialSection="projects" />}
              {page === 'ideas' && <div className="flex-1 grid place-items-center"><div className="text-center max-w-md"><Lightbulb className="mx-auto mb-4 text-[#b0a79e]" size={30}/><h2 className="text-xl font-semibold">Ideas</h2><p className="mt-2 text-sm text-[#8c847c]">Capture ideas here and turn them into tasks when ready.</p></div></div>}
              {page === 'extensions' && <ExtensionsPage />}
              {page === 'customize' && <WorkspaceLibraryPage initialSection="skills" />}
              {page === 'artifacts' && <WorkspaceLibraryPage initialSection="artifacts" />}
            </div>
            {page === 'chat' && rightOpen && <RightPanel width={rightWidth} onWidth={setRightWidth} onClose={() => setRightOpen(false)} />}
          </div>
        </main>
      </div>
      {page === 'chat' && !rightOpen && (
        <button onClick={() => setRightOpen(true)} className="fixed right-4 top-14 z-40 h-9 w-9 rounded-lg border border-[#e4ded7] bg-white shadow-sm grid place-items-center text-[#6e675f]"><ChevronRight size={16}/></button>
      )}
      {showSettings && <SettingsModal initialTab="provider" onClose={() => setShowSettings(false)} />}
    </div>
  )
}

export default App
