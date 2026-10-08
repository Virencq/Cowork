import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import {
  Archive, CalendarClock, ChevronLeft, ChevronRight, FolderKanban, History,
  Lightbulb, Menu, Plus, Search, Settings, Sparkles, X, SlidersHorizontal,
  PanelRight, Clock3
} from 'lucide-react'
import { ChatView } from './components/chat'
import { SettingsModal } from './components/settings'
import { TasksPage } from './components/tasks'
import { GoalPage } from './components/goal/GoalPage'
import { ExtensionsPage } from './components/extensions/ExtensionsPage'
import { useAppStore } from './stores'
import { useTaskScheduler, useTelegramChatSync } from './hooks'
import { useMCPStore } from './stores/mcpStore'
import { useSkillStore } from './stores/skillStore'
import { useAgentStore } from './stores/agentStore'
import { initDatabase } from './utils/database'
import { getAllSessions, createSession as dbCreateSession, saveMessage as dbSaveMessage } from './utils/database'
import { status as jcodeStatus } from './utils/jcodeClient'
import { getActiveTokens } from './themes'

export type Page = 'chat' | 'tasks' | 'projects' | 'ideas' | 'extensions'

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
  const [query, setQuery] = useState('')
  const recent = sessions
    .filter(s => !query || s.title.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 8)

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
        {item(<SlidersHorizontal size={16} />, 'Customize', 'extensions')}
        {item(<FolderKanban size={16} />, 'Projects', 'projects')}
      </nav>

      <div className="mt-5 px-4 flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-[.12em] text-[#928b84]">Recents</span>
        <History size={13} className="text-[#a39c94]" />
      </div>
      <div className="px-2 mt-1 overflow-auto min-h-0">
        {recent.map(s => (
          <button key={s.id} onClick={() => { onPage('chat'); setActiveSession(s.id) }} className={`w-full text-left rounded-lg px-3 py-2 text-[12px] truncate transition-colors ${activeSessionId === s.id ? 'bg-white text-[#292622] shadow-sm' : 'text-[#6e6861] hover:bg-white/70'}`}>
            {s.title || 'Untitled task'}
          </button>
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

function RightPanel({ width, onWidth }: { width: number; onWidth: (n: number) => void }) {
  const [section, setSection] = useState<'context' | 'instructions' | 'schedule' | 'memory'>('context')
  const sections = [
    ['context', 'Context'], ['instructions', 'Instructions'], ['schedule', 'Scheduled'], ['memory', 'Memory']
  ] as const
  return (
    <aside style={{ width }} className="relative shrink-0 h-full border-l border-[#e7e2dc] bg-[#fbfaf8] pt-11">
      <ResizeHandle side="right" onDrag={(d) => onWidth(Math.max(260, Math.min(440, width + d)))} />
      <div className="h-14 px-4 flex items-center justify-between border-b border-[#ebe6e0]">
        <div>
          <div className="text-[11px] uppercase tracking-[.12em] font-semibold text-[#9a938c]">Task</div>
          <div className="text-[14px] font-semibold text-[#302c28]">Workspace</div>
        </div>
        <button className="h-8 w-8 rounded-md hover:bg-[#f0ece7] grid place-items-center text-[#817a72]"><PanelRight size={16}/></button>
      </div>
      <div className="p-3 flex gap-1 border-b border-[#ebe6e0]">
        {sections.map(([key, label]) => (
          <button key={key} onClick={() => setSection(key)} className={`flex-1 rounded-md px-2 py-2 text-[10px] font-semibold ${section === key ? 'bg-[#eee9e3] text-[#302c28]' : 'text-[#89827a] hover:bg-[#f3f0ec]'}`}>
            {label}
          </button>
        ))}
      </div>
      <div className="p-4">
        {section === 'context' && <PanelCard icon={<Sparkles size={16}/>} title="Context" text="Files, folders, and task context used by the agent will appear here." />}
        {section === 'instructions' && <PanelCard icon={<Archive size={16}/>} title="Instructions" text="Add persistent instructions for this workspace or task." />}
        {section === 'schedule' && <PanelCard icon={<CalendarClock size={16}/>} title="Scheduled tasks" text="Create recurring tasks and background work from here." />}
        {section === 'memory' && <PanelCard icon={<History size={16}/>} title="Memory" text="Relevant workspace memory will be available here." />}
        <div className="mt-4 rounded-xl border border-[#e6e0d9] bg-white p-4">
          <div className="text-[11px] font-semibold text-[#514a44]">JCode</div>
          <div className="mt-1 text-[11px] leading-5 text-[#8a837c]">JCode CLI is the agent runtime. Provider and model selection stay with JCode.</div>
        </div>
      </div>
    </aside>
  )
}

function PanelCard({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return <div className="rounded-xl border border-[#e6e0d9] bg-white p-4">
    <div className="flex items-center gap-2 text-[#6f675f]">{icon}<span className="text-[12px] font-semibold">{title}</span></div>
    <p className="mt-3 text-[11px] leading-5 text-[#918a83]">{text}</p>
  </div>
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
          {page === 'chat' && <ChatView />}
          {page === 'tasks' && <TasksPage />}
          {page === 'projects' && <div className="flex-1 grid place-items-center"><div className="text-center max-w-md"><FolderKanban className="mx-auto mb-4 text-[#b0a79e]" size={30}/><h2 className="text-xl font-semibold">Projects</h2><p className="mt-2 text-sm text-[#8c847c]">Projects will group related Cowork tasks and workspaces.</p></div></div>}
          {page === 'ideas' && <div className="flex-1 grid place-items-center"><div className="text-center max-w-md"><Lightbulb className="mx-auto mb-4 text-[#b0a79e]" size={30}/><h2 className="text-xl font-semibold">Ideas</h2><p className="mt-2 text-sm text-[#8c847c]">Capture ideas here and turn them into tasks when ready.</p></div></div>}
          {page === 'extensions' && <ExtensionsPage />}
          {page === 'chat' && rightOpen && <RightPanel width={rightWidth} onWidth={setRightWidth} />}
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
