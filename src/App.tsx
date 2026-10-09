import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { open as openDialog } from '@tauri-apps/plugin-dialog'
import {
  Archive, CalendarClock, ChevronLeft, ChevronRight, FolderKanban, History, FileCode2,
  Lightbulb, Menu, Plus, Search, Settings, Sparkles, X, SlidersHorizontal,
  PanelRight, Clock3, MoreHorizontal, Pin, Pencil, Trash2, MailOpen, FolderPlus, Check, Columns2, ArrowLeft, ArrowRight
} from 'lucide-react'
import { ChatView } from './components/chat'
import { SettingsModal } from './components/settings'
import { TasksPage } from './components/tasks'
import { GoalPage } from './components/goal/GoalPage'
import { ExtensionsPage } from './components/extensions/ExtensionsPage'
import { WorkspaceLibraryPage } from './components/workspace/WorkspaceLibraryPage'
import { ProjectsPage } from './components/workspace/ProjectsPage'
import { ArtifactsPage } from './components/workspace/ArtifactsPage'
import { CodeWorkspace } from './components/workspace/CodeWorkspace'
import { FilePreviewPanel } from './components/preview/FilePreviewPanel'
import { useAppStore } from './stores'
import { useFilePreviewStore } from './stores/filePreviewStore'
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

function CoworkTitleBar({ onToggleSidebar, onToggleRightPanel, onBack, onForward, codeMode, onCode, onCowork }: {
  onToggleSidebar: () => void
  onToggleRightPanel: () => void
  onBack: () => void
  onForward: () => void
  codeMode: boolean
  onCode: () => void
  onCowork: () => void
}) {
  const appWindow = inTauri ? getCurrentWindow() : null
  const drag = useCallback((e: React.MouseEvent) => {
    if (e.detail === 2) { void appWindow?.toggleMaximize(); return }
    if (e.target === e.currentTarget) void appWindow?.startDragging()
  }, [appWindow])

  return (
    <header onMouseDown={drag} className="fixed top-0 left-0 right-0 z-[100] h-11 bg-white flex items-center justify-between select-none">
      <div className="flex items-center h-full gap-1 px-3 text-[#5d5852]">
        <button onClick={onToggleSidebar} className="title-icon" title="Toggle sidebar" aria-label="Toggle sidebar"><Menu size={16}/></button>
        <button onClick={onToggleRightPanel} className="title-icon" title="Toggle project panel" aria-label="Toggle project panel"><Columns2 size={16}/></button>
        <div className="ml-1 flex h-8 items-center rounded-lg border border-[#e7e2dc] bg-[#f5f3f0] p-0.5">
          <button onClick={onCowork} className={`h-7 rounded-md px-3 text-[11px] font-medium transition-colors ${!codeMode ? 'bg-white text-[#302c28] shadow-sm' : 'text-[#77716b] hover:text-[#302c28]'}`}>Cowork</button>
          <button onClick={onCode} className={`h-7 rounded-md px-3 text-[11px] font-medium transition-colors ${codeMode ? 'bg-white text-[#302c28] shadow-sm' : 'text-[#77716b] hover:text-[#302c28]'}`}>Code</button>
        </div>
        <button onClick={onBack} className="title-icon" title="Back" aria-label="Back"><ArrowLeft size={17}/></button>
        <button onClick={onForward} className="title-icon" title="Forward" aria-label="Forward"><ArrowRight size={17}/></button>
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

function LeftNav({ width, onWidth, page, onPage, onNew, onSettings, codeMode, onCode, onCowork }: {
  width: number; onWidth: (n: number) => void; page: Page; onPage: (p: Page) => void; onNew: () => void; onSettings: () => void; codeMode: boolean; onCode: () => void; onCowork: () => void
}) {
  const sessions = useAppStore((s) => s.sessions)
  const activeSessionId = useAppStore((s) => s.activeSessionId)
  const setActiveSession = useAppStore((s) => s.setActiveSession)
  const updateSessionTitle = useAppStore((s) => s.updateSessionTitle)
  const deleteSession = useAppStore((s) => s.deleteSession)
  const [menuId, setMenuId] = useState<string | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [filterPinned, setFilterPinned] = useState(false)
  const [taskQuery, setTaskQuery] = useState('')
  const [pinned, setPinned] = useState<Set<string>>(new Set())
  const [unread, setUnread] = useState<Set<string>>(new Set())
  const [archived, setArchived] = useState<Set<string>>(new Set())
  const [renaming, setRenaming] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')

  const allTasks = sessions
    .filter(s => !archived.has(s.id))
    .filter(s => !taskQuery || (s.title || '').toLowerCase().includes(taskQuery.toLowerCase()))
    .sort((a,b) => b.updatedAt-a.updatedAt)
  const tasks = allTasks.slice(0, 20)
  // Pinned is an independent collection: a pinned chat must remain visible
  // even when it is older than the 20 most-recent task rows.
  const pinnedTasks = allTasks.filter(s => pinned.has(s.id))
  const visibleTasks = filterPinned ? pinnedTasks : tasks

  const beginRename = (id: string, title: string) => { setRenaming(id); setRenameValue(title); setMenuId(null) }
  const commitRename = (id: string) => {
    const title = renameValue.trim()
    if (title) updateSessionTitle(id, title)
    setRenaming(null)
  }

  return (
    <aside style={{ width }} className="relative shrink-0 h-full border-r border-[#e5e2de] bg-white pt-11 flex flex-col text-[#3f3a35]">
      <ResizeHandle side="left" onDrag={(d) => onWidth(Math.max(262, Math.min(340, width + d)))} />

      <div className="px-3 pt-2 pb-3">
        <div className="grid grid-cols-2 h-8 rounded-md bg-[#f1f0ee] p-0.5">
          <button onClick={onCowork} className={`rounded-md text-[12px] font-semibold transition-colors ${!codeMode ? 'bg-white text-[#3d3833] shadow-sm' : 'text-[#77716b] hover:text-[#3d3833]'}`}>☷&nbsp; Cowork</button>
          <button onClick={onCode} className={`rounded-md text-[12px] font-medium transition-colors ${codeMode ? 'bg-white text-[#3d3833] shadow-sm' : 'text-[#77716b] hover:text-[#3d3833]'}`}>‹/&gt;&nbsp; Code</button>
        </div>
      </div>

      <div className="px-3 pb-3">
        <button onClick={onNew} className="w-full h-9 rounded-md border border-[#e4e1dd] bg-[#f4f3f1] hover:bg-[#eceae7] text-[#37322d] text-[12px] font-medium flex items-center gap-2 px-3">
          <Plus size={15}/> New
        </button>
      </div>

      {/* Global Cowork navigation */}
      <nav className="px-3 space-y-0.5">
        <button onClick={() => onPage('projects')} className={`home-nav-row ${page === 'projects' ? 'bg-[#f0eeeb] text-[#302c28]' : ''}`}>
          <span className="inline-flex items-center gap-2"><FolderKanban size={14}/>Projects</span>
        </button>
        <button onClick={() => onPage('artifacts')} className={`home-nav-row ${page === 'artifacts' ? 'bg-[#f0eeeb] text-[#302c28]' : ''}`}>
          <span className="inline-flex items-center gap-2"><FileCode2 size={14}/>Artifacts</span>
        </button>
        <button onClick={() => { setFilterPinned(false); onPage('tasks') }} className={`home-nav-row ${page === 'tasks' && !filterPinned ? 'bg-[#f0eeeb] text-[#302c28]' : ''}`}>
          <span className="inline-flex items-center gap-2"><CalendarClock size={14}/>Scheduled</span>
          <ChevronRight size={14}/>
        </button>
        <button onClick={() => onPage('customize')} className={`home-nav-row ${page === 'customize' ? 'bg-[#f0eeeb] text-[#302c28]' : ''}`}>
          <span className="inline-flex items-center gap-2"><Sparkles size={14}/>Customize</span>
        </button>
      </nav>

      {/* Task navigation */}
      <div className="mt-3 px-3">
        <button onClick={() => setFilterPinned(v => !v)} className={`home-nav-row ${filterPinned ? 'bg-[#f0eeeb] text-[#302c28]' : ''}`}>
          <span className="inline-flex items-center gap-2"><Pin size={14}/>Pinned</span>
          <ChevronRight size={14}/>
        </button>
      </div>

      <div className="mt-2 px-3">
        <div className="flex items-center justify-between">
          <button onClick={() => onPage('tasks')} className="home-nav-row flex-1 !px-0"><span>Tasks</span><ChevronRight size={14}/></button>
          <div className="flex items-center gap-1 text-[#8f8983]">
            <button onClick={() => setSearchOpen(v => !v)} className={`title-icon !h-7 !w-7 ${searchOpen ? 'bg-[#f0eeeb] text-[#302c28]' : ''}`} title="Search tasks"><Search size={14}/></button>
            <button onClick={() => setFilterPinned(v => !v)} className={`title-icon !h-7 !w-7 ${filterPinned ? 'bg-[#f0eeeb] text-[#302c28]' : ''}`} title="Show pinned tasks"><SlidersHorizontal size={14}/></button>
          </div>
        </div>
        {searchOpen && (
          <input
            autoFocus
            value={taskQuery}
            onChange={e => setTaskQuery(e.target.value)}
            placeholder="Search tasks"
            className="mb-1 w-full h-8 rounded-md border border-[#e2ded9] bg-white px-3 text-[11px] outline-none focus:border-[#d97745]/50"
          />
        )}
      </div>

      <div className="px-2 mt-1 overflow-auto min-h-0 pb-28">
        {visibleTasks.map(s => (
          <div key={s.id} className="relative group">
            {renaming === s.id ? (
              <div className="flex items-center gap-1 px-2 py-1">
                <input autoFocus value={renameValue} onChange={e=>setRenameValue(e.target.value)}
                  onKeyDown={e=>{if(e.key==='Enter')commitRename(s.id);if(e.key==='Escape')setRenaming(null)}}
                  className="min-w-0 flex-1 h-7 rounded-md border border-[#d8d3ce] px-2 text-[11px]"/>
                <button onClick={()=>commitRename(s.id)} className="h-7 w-7 grid place-items-center"><Check size={13}/></button>
              </div>
            ) : (
              <>
                <button onClick={()=>{onPage('chat');setActiveSession(s.id);setUnread(p=>{const n=new Set(p);n.delete(s.id);return n})}}
                  className={`w-full text-left rounded-md px-3 py-2 text-[11px] truncate hover:bg-[#f3f1ef] ${activeSessionId===s.id?'bg-[#f1efec] text-[#302c28]':''}`}>
                  <span className="inline-flex items-center gap-1.5 max-w-full">
                    <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${unread.has(s.id)?'bg-[#3b82f6]':'border border-[#bcb6b0]'}`}/>
                    <span className="truncate">{s.title || 'Untitled task'}</span>
                  </span>
                </button>
                <button onClick={e=>{e.stopPropagation();setMenuId(menuId===s.id?null:s.id)}} className="absolute right-1 top-1.5 h-7 w-7 rounded-md opacity-0 group-hover:opacity-100 hover:bg-[#eae7e3] grid place-items-center"><MoreHorizontal size={14}/></button>
                {menuId===s.id && (
                  <div className="absolute right-1 top-9 z-50 w-48 rounded-xl border border-[#ddd8d2] bg-white p-1.5 shadow-lg">
                    <button onClick={()=>{
                      setPinned(p=>{
                        const n=new Set(p)
                        if (n.has(s.id)) n.delete(s.id); else n.add(s.id)
                        return n
                      })
                      setMenuId(null)
                    }} className="menu-row"><Pin size={14}/>{pinned.has(s.id)?'Unpin':'Pin'}</button>
                    <button onClick={()=>beginRename(s.id,s.title)} className="menu-row"><Pencil size={14}/>Rename</button>
                    <button onClick={()=>{setUnread(p=>new Set(p).add(s.id));setMenuId(null)}} className="menu-row"><MailOpen size={14}/>Mark as unread</button>
                    <div className="my-1 border-t border-[#eeeae6]"/>
                    <button onClick={()=>{setArchived(p=>new Set(p).add(s.id));setMenuId(null)}} className="menu-row"><Archive size={14}/>Archive</button>
                    <button onClick={()=>{deleteSession(s.id);setMenuId(null)}} className="menu-row text-[#b54d40]"><Trash2 size={14}/>Delete</button>
                  </div>
                )}
              </>
            )}
          </div>
        ))}
        {visibleTasks.length===0 && <div className="px-3 py-3 text-[11px] text-[#a09a94]">{filterPinned ? 'No pinned tasks' : 'No tasks yet'}</div>}
      </div>

      <div className="mt-auto border-t border-[#ece9e5] px-3 py-2">
        <button onClick={onSettings} className="w-full flex items-center justify-between rounded-md px-1 py-2 text-left text-[11px] text-[#7d766f] hover:bg-[#f3f1ef] hover:text-[#302c28]" title="Open Settings">
          <span className="inline-flex items-center gap-2"><span className="h-4 w-4 rounded-full bg-[#e7e4e0] grid place-items-center text-[9px]">✦</span>Workspace</span>
          <Settings size={13}/>
        </button>
      </div>
    </aside>
  )
}

function RightPanel({ width, onWidth, onClose, onAddScheduled }: {
  width: number
  onWidth: (n: number) => void
  onClose: () => void
  onAddScheduled: () => void
}) {
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
          JCode manages persistent memory for its sessions. Use /memory in chat to inspect or change memory behavior.
        </div>
      </section>

      <section className="border-b border-[#ebe6e0]">
        <div className="px-5 py-4 flex items-center justify-between">
          <div>
            <div className="text-[13px] font-semibold text-[#302c28]">Context</div>
            <div className="mt-1 text-[11px] text-[#9a938c]">Files and folders available to JCode</div>
          </div>
          <button
            onClick={async () => {
              const selected = await openDialog({ directory: true, multiple: false, title: 'Add project context folder' })
              if (typeof selected === 'string') {
                useAppStore.getState().setWorkspaceDir(selected)
              }
            }}
            className="h-7 w-7 rounded-md hover:bg-[#eee9e3] grid place-items-center text-[#817a72]"
            title="Add context folder"
          ><Plus size={15}/></button>
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
          <button onClick={onAddScheduled} className="h-7 w-7 rounded-md hover:bg-[#eee9e3] grid place-items-center text-[#817a72]" title="Add scheduled task"><Plus size={15}/></button>
        </div>
      </section>
    </aside>
  )
}

function App() {
  const { theme, colorScheme } = useAppStore()
  const createSession = useAppStore((s) => s.createSession)
  const setActiveSession = useAppStore((s) => s.setActiveSession)
  const setWorkspaceDir = useAppStore((s) => s.setWorkspaceDir)
  const workspaceDir = useAppStore((s) => s.workspaceDir)
  const preview = useFilePreviewStore((s) => s.preview)
  const activeSessionId = useAppStore((s) => s.activeSessionId)
  const activeSessionMessageCount = useAppStore((s) => activeSessionId ? (s.sessionMessages[activeSessionId]?.length ?? 0) : 0)
  const [page, setPage] = useState<Page>('chat')
  const [showSettings, setShowSettings] = useState(false)
  const [leftWidth, setLeftWidth] = useState(() => Number(localStorage.getItem('cowork-left-width')) || 262)
  const [rightWidth, setRightWidth] = useState(() => Number(localStorage.getItem('cowork-right-width')) || 330)
  const [rightOpen, setRightOpen] = useState(() => localStorage.getItem('cowork-right-open') !== 'false')
  const [sidebarOpen, setSidebarOpen] = useState(() => localStorage.getItem('cowork-sidebar-open') !== 'false')
  const [codeMode, setCodeMode] = useState(() => localStorage.getItem('cowork-code-mode') === 'true')
  const [pageHistory, setPageHistory] = useState<Page[]>(['chat'])
  const [historyIndex, setHistoryIndex] = useState(0)

  const navigateToPage = useCallback((next: Page) => {
    if (next !== 'chat') setCodeMode(false)
    setPage((current) => {
      if (current === next) return current
      setPageHistory((history) => [...history.slice(0, historyIndex + 1), next])
      setHistoryIndex((index) => index + 1)
      return next
    })
  }, [historyIndex])

  useEffect(() => { localStorage.setItem('cowork-left-width', String(leftWidth)) }, [leftWidth])
  useEffect(() => { localStorage.setItem('cowork-right-width', String(rightWidth)) }, [rightWidth])
  useEffect(() => { localStorage.setItem('cowork-right-open', String(rightOpen)) }, [rightOpen])
  useEffect(() => { localStorage.setItem('cowork-sidebar-open', String(sidebarOpen)) }, [sidebarOpen])
  useEffect(() => { localStorage.setItem('cowork-code-mode', String(codeMode)) }, [codeMode])

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
    navigateToPage('chat')
  }

  return (
    <div className="h-screen w-screen overflow-hidden bg-[#faf9f7] text-[#302c28]">
      <CoworkTitleBar
        codeMode={codeMode}
        onCode={() => { setCodeMode(true); setPage('chat') }}
        onCowork={() => { setCodeMode(false); setPage('chat') }}
        onToggleSidebar={() => setSidebarOpen((open) => !open)}
        onToggleRightPanel={() => setRightOpen((open) => !open)}
        onBack={() => {
          if (historyIndex <= 0) return
          const next = historyIndex - 1
          setHistoryIndex(next)
          setPage(pageHistory[next])
        }}
        onForward={() => {
          if (historyIndex >= pageHistory.length - 1) return
          const next = historyIndex + 1
          setHistoryIndex(next)
          setPage(pageHistory[next])
        }}
      />
      <div className="h-full flex">
        <LeftNav width={sidebarOpen ? leftWidth : 0} onWidth={setLeftWidth} page={page} onPage={navigateToPage} onNew={newTask} onSettings={() => setShowSettings(true)} codeMode={codeMode} onCode={() => { setCodeMode(true); setPage('chat') }} onCowork={() => { setCodeMode(false); setPage('chat') }} />
        <main className="relative min-w-0 flex-1 pt-11 flex flex-col bg-[#faf9f7]">
          <div className="min-h-0 flex-1 flex">
            <div className="min-w-0 flex-1 flex flex-col">
              {page === 'chat' && !codeMode && <ChatView />}
              {page === 'chat' && codeMode && <CodeWorkspace />}

              {page === 'tasks' && <TasksPage />}
              {page === 'projects' && <ProjectsPage onOpenProject={(project) => {
                if (project.path) setWorkspaceDir(project.path)
                const id = createSession()
                setActiveSession(id)
                navigateToPage('chat')
              }} />}
              {page === 'ideas' && <div className="flex-1 grid place-items-center"><div className="text-center max-w-md"><Lightbulb className="mx-auto mb-4 text-[#b0a79e]" size={30}/><h2 className="text-xl font-semibold">Ideas</h2><p className="mt-2 text-sm text-[#8c847c]">Capture ideas here and turn them into tasks when ready.</p></div></div>}
              {page === 'extensions' && <ExtensionsPage />}
              {page === 'customize' && <WorkspaceLibraryPage initialSection="skills" />}
              {page === 'artifacts' && <ArtifactsPage onOpenArtifact={(artifactId) => {
                const artifact = useWorkspaceStore.getState().artifacts.find((a) => a.id === artifactId)
                if (!artifact) return
                let sessionId = artifact.sessionId
                const sessions = useAppStore.getState().sessions
                if (!sessionId || !sessions.some((s) => s.id === sessionId)) {
                  sessionId = createSession()
                  useWorkspaceStore.getState().upsertArtifact({ ...artifact, sessionId, updatedAt: Date.now() })
                }
                setActiveSession(sessionId)
                navigateToPage('chat')
              }} />}
            </div>
            {page === 'chat' && !codeMode && activeSessionId && activeSessionMessageCount > 0 && rightOpen && <RightPanel width={rightWidth} onWidth={setRightWidth} onClose={() => setRightOpen(false)} onAddScheduled={() => navigateToPage('tasks')} />}
          </div>
        </main>
      </div>
      {page === 'chat' && !codeMode && !rightOpen && (
        <button onClick={() => setRightOpen(true)} className="fixed right-4 top-14 z-40 h-9 w-9 rounded-lg border border-[#e4ded7] bg-white shadow-sm grid place-items-center text-[#6e675f]"><ChevronRight size={16}/></button>
      )}
      {showSettings && <SettingsModal initialTab="provider" onClose={() => setShowSettings(false)} />}
    </div>
  )
}

export default App
