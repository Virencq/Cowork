import { lazy, Suspense, useCallback, useEffect, ChevronRight, FolderKanban, History, Lightbulb, Menu, Plus, Settings, X, Pencil, Columns2, ArrowLeft, ArrowRight } from 'lucide-react'
import { ChatView } from './components/chat'
import { LeftNav, ResizeHandle } from './components/layout/LeftNav'

// Keep the primary chat eager, but load secondary workspaces on demand.
const SettingsModal = lazy(() => import('./components/settings').then((m) => ({ default: m.SettingsModal })))
const TasksPage = lazy(() => import('./components/tasks').then((m) => ({ default: m.TasksPage })))
const ExtensionsPage = lazy(() => import('./components/extensions/ExtensionsPage').then((m) => ({ default: m.ExtensionsPage })))
const WorkspaceLibraryPage = lazy(() => import('./components/workspace/WorkspaceLibraryPage').then((m) => ({ default: m.WorkspaceLibraryPage })))
const ProjectsPage = lazy(() => import('./components/workspace/ProjectsPage').then((m) => ({ default: m.ProjectsPage })))
const ArtifactsPage = lazy(() => import('./components/workspace/ArtifactsPage').then((m) => ({ default: m.ArtifactsPage })))
const CodeWorkspace = lazy(() => import('./components/workspace/CodeWorkspace').then((m) => ({ default: m.CodeWorkspace })))
import { useAppStore } from './stores'
import { useTaskScheduler, useTelegramChatSync } from './hooks'
import { useMCPStore } from './stores/mcpStore'
import { useSkillStore } from './stores/skillStore'
import { useAgentStore } from './stores/agentStore'
import { useWorkspaceStore } from './stores/workspaceStore'
import { activateCodeProject } from './utils/codeProjectActions'
import { projectPathsEqual } from './utils/projectPaths'
import { initDatabase } from './utils/database'
import { getAllSessions, createSession as dbCreateSession, saveMessage as dbSaveMessage } from './utils/database'
import { status as jcodeStatus } from './utils/jcodeClient'
import { getActiveTokens } from './themes'

import type { Page } from './types/navigation'
export type { Page } from './types/navigation'

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
    <header onMouseDown={drag} className="fixed top-0 left-0 right-0 z-[100] h-11 bg-surface border-b border-border flex items-center justify-between select-none">
      <div className="flex items-center h-full gap-1 px-3 text-[#5d5852]">
        <button onClick={onToggleSidebar} className="title-icon" title="Toggle sidebar" aria-label="Toggle sidebar"><Menu size={16}/></button>
        <button onClick={onToggleRightPanel} className="title-icon" title="Toggle project panel" aria-label="Toggle project panel"><Columns2 size={16}/></button>
        <button onClick={onBack} className="title-icon" title="Back" aria-label="Back"><ArrowLeft size={17}/></button>
        <button onClick={onForward} className="title-icon" title="Forward" aria-label="Forward"><ArrowRight size={17}/></button>
        <div className="ml-2 flex h-7 items-center rounded-md border border-border bg-surface-secondary p-0.5" aria-label="Workspace mode">
          <button onClick={onCowork} aria-pressed={!codeMode} className={`h-6 rounded px-2.5 text-[11px] font-medium transition-colors ${!codeMode ? 'bg-surface text-text shadow-sm' : 'text-text-secondary hover:text-text'}`}>Cowork</button>
          <button onClick={onCode} aria-pressed={codeMode} className={`h-6 rounded px-2.5 text-[11px] font-medium transition-colors ${codeMode ? 'bg-surface text-text shadow-sm' : 'text-text-secondary hover:text-text'}`}>Code / JCode</button>
        </div>
      </div>
      <WindowControls />
    </header>
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
  const project = projects.find((p) => p.path && workspaceDir && projectPathsEqual(p.path, workspaceDir))
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
    <aside style={{ width }} className="relative shrink-0 h-full border-l border-border bg-surface pt-11 overflow-auto">
      <ResizeHandle side="right" onDrag={(d) => onWidth(Math.max(280, Math.min(440, width + d)))} />
      <div className="h-14 px-5 flex items-center justify-between border-b border-border">
        <div>
          <div className="text-[11px] uppercase tracking-[.12em] font-semibold text-text-tertiary">Project</div>
          <div className="text-[14px] font-semibold text-text truncate max-w-[210px]">{project?.name || 'Workspace'}</div>
        </div>
        <button onClick={onClose} className="h-8 w-8 rounded-md hover:bg-surface-hover grid place-items-center text-text-secondary" title="Close panel"><X size={16}/></button>
      </div>

      <section className="border-b border-border">
        <div className="px-5 py-4 flex items-center justify-between">
          <div>
            <div className="text-[13px] font-semibold text-text">Instructions</div>
            <div className="mt-1 text-[11px] text-text-tertiary">Instructions for this project</div>
          </div>
          <button onClick={() => { setDraftInstructions(project?.instructions || ''); setEditingInstructions(true) }} className="h-8 w-8 rounded-md hover:bg-surface-hover grid place-items-center text-text-secondary" title={project?.instructions ? 'Edit instructions' : 'Add instructions'}>
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
                className="w-full min-h-[130px] resize-y rounded-lg border border-border bg-surface-secondary p-3 text-[12px] leading-5 text-text outline-none focus:border-[#d97745]/60"
              />
              <div className="mt-2 flex justify-end gap-2">
                <button onClick={() => setEditingInstructions(false)} className="rounded-lg px-3 py-1.5 text-[11px] text-text-secondary hover:bg-surface-hover">Cancel</button>
                <button onClick={saveInstructions} className="rounded-lg bg-accent px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-accent-light">Save</button>
              </div>
            </div>
          ) : (
            <p className="text-[12px] leading-5 text-text-secondary whitespace-pre-wrap">
              {project?.instructions || 'Add instructions to guide JCode on goals, style, constraints, and project conventions.'}
            </p>
          )}
        </div>
      </section>

      <section className="border-b border-border">
        <div className="px-5 py-4">
          <div className="text-[13px] font-semibold text-text">Memory</div>
          <div className="mt-1 text-[11px] text-text-tertiary">Project memory</div>
        </div>
        <div className="px-5 pb-5 text-[12px] leading-5 text-[#777068]">
          JCode manages persistent memory for its sessions. Use /memory in chat to inspect or change memory behavior.
        </div>
      </section>

      <section className="border-b border-border">
        <div className="px-5 py-4 flex items-center justify-between">
          <div>
            <div className="text-[13px] font-semibold text-text">Context</div>
            <div className="mt-1 text-[11px] text-text-tertiary">Files and folders available to JCode</div>
          </div>
          <button
            onClick={async () => {
              const selected = await openDialog({ directory: true, multiple: false, title: 'Add project context folder' })
              if (typeof selected === 'string') {
                useAppStore.getState().setWorkspaceDir(selected)
              }
            }}
            className="h-7 w-7 rounded-md hover:bg-surface-hover grid place-items-center text-text-secondary"
            title="Add context folder"
          ><Plus size={15}/></button>
        </div>
        <div className="px-5 pb-5">
          <div className="rounded-lg border border-border bg-surface-secondary px-3 py-2.5 flex items-center gap-2">
            <FolderKanban size={15} className="text-text-tertiary"/>
            <span className="text-[11px] truncate text-text-secondary">{project?.path || workspaceDir || 'No project folder selected'}</span>
          </div>
        </div>
      </section>

      <section>
        <div className="px-5 py-4 flex items-center justify-between">
          <div>
            <div className="text-[13px] font-semibold text-text">Scheduled</div>
            <div className="mt-1 text-[11px] text-text-tertiary">Recurring tasks for this project</div>
          </div>
          <button onClick={onAddScheduled} className="h-7 w-7 rounded-md hover:bg-surface-hover grid place-items-center text-text-secondary" title="Add scheduled task"><Plus size={15}/></button>
        </div>
      </section>
    </aside>
  )
}

function App() {
  const theme = useAppStore((s) => s.theme)
  const colorScheme = useAppStore((s) => s.colorScheme)
  const createSession = useAppStore((s) => s.createSession)
  const setActiveSession = useAppStore((s) => s.setActiveSession)
  const setWorkspaceDir = useAppStore((s) => s.setWorkspaceDir)
  const workspaceDir = useAppStore((s) => s.workspaceDir)
  const activeSessionId = useAppStore((s) => s.activeSessionId)
  const activeSessionMessageCount = useAppStore((s) => activeSessionId ? (s.sessionMessages[activeSessionId]?.length ?? 0) : 0)
  const [page, setPage] = useState<Page>('chat')
  const [showSettings, setShowSettings] = useState(false)
  const [leftWidth, setLeftWidth] = useState(() => Number(localStorage.getItem('cowork-left-width')) || 262)
  const [rightWidth, setRightWidth] = useState(() => Number(localStorage.getItem('cowork-right-width')) || 330)
  const [rightOpen, setRightOpen] = useState(() => localStorage.getItem('cowork-right-open') !== 'false')
  const [sidebarOpen, setSidebarOpen] = useState(() => localStorage.getItem('cowork-sidebar-open') !== 'false')
  const [codeMode, setCodeMode] = useState(() => localStorage.getItem('cowork-code-mode') === 'true')
  const [hasVisitedCode, setHasVisitedCode] = useState(() => localStorage.getItem('cowork-code-mode') === 'true')
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
      // If the persisted active project pointed to a session that no longer
      // exists in SQLite, reconcile it by creating one fresh session for that
      // project after the database is ready.
      const workspaceState = useWorkspaceStore.getState()
      const activeCodeProject = workspaceState.codeProjects.find(
        (project) => project.id === workspaceState.activeCodeProjectId,
      )
      if (activeCodeProject && !activeCodeProject.sessionId) {
        activateCodeProject(activeCodeProject)
      }
      const state = useAppStore.getState()
      if (state.activeSessionId) await state.loadMessages(state.activeSessionId)
      // Code sessions are independent of Cowork selection and must hydrate after
      // SQLite is initialized, even if CodeWorkspace mounted before startup finished.
      if (state.codeActiveSessionId) await state.loadMessages(state.codeActiveSessionId)
    }).catch(console.warn)
  }, [])

  const newTask = () => {
    const state = useAppStore.getState()
    const currentId = state.activeSessionId
    // Do not persist a blank task. Create a session only when the first prompt is sent.
    if (currentId && (state.sessionMessages[currentId]?.length ?? 0) === 0) {
      state.deleteSession(currentId)
    }
    setActiveSession(null)
    navigateToPage('chat')
  }

  return (
    <div className="h-screen w-screen overflow-hidden bg-bg text-text">
      <CoworkTitleBar
        codeMode={codeMode}
        onCode={() => { setHasVisitedCode(true); setCodeMode(true); setPage('chat') }}
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
        <LeftNav width={sidebarOpen ? leftWidth : 0} onWidth={setLeftWidth} page={page} onPage={navigateToPage} onNew={newTask} onSettings={() => setShowSettings(true)} codeMode={codeMode} onCode={() => { setHasVisitedCode(true); setCodeMode(true); setPage('chat') }} onCowork={() => { setCodeMode(false); setPage('chat') }} />
        <main className="relative min-w-0 flex-1 pt-11 flex flex-col bg-bg">
          <Suspense fallback={<div className="min-h-0 flex-1 grid place-items-center text-[12px] text-text-tertiary">Loading workspace…</div>}>
          <div className="min-h-0 flex-1 flex">
            <div className="min-w-0 flex-1 flex flex-col">
              {page === 'chat' && (
                <div className={codeMode ? 'hidden' : 'min-w-0 flex-1 flex flex-col'}>
                  <ChatView />
                </div>
              )}
              {hasVisitedCode && (
                <div className={page === 'chat' && codeMode ? 'min-w-0 flex-1 flex flex-col' : 'hidden'}>
                  <CodeWorkspace />
                </div>
              )}

              {page === 'tasks' && <TasksPage />}
              {page === 'projects' && <ProjectsPage onOpenProject={(project) => {
                if (project.path) setWorkspaceDir(project.path)
                // Reopen this project's existing chat instead of creating a new
                // session on every click. Associate a session on first open only.
                const workspaceState = useWorkspaceStore.getState()
                const storedProject = workspaceState.projects.find((item) => item.id === project.id)
                const storedSessionId = storedProject?.sessionId
                const appState = useAppStore.getState()
                const sessions = appState.sessions
                const linkedSessionIds = new Set(
                  workspaceState.projects
                    .filter((item) => item.id !== project.id && item.sessionId)
                    .map((item) => item.sessionId as string),
                )

                // Prefer the project's saved session. For projects created before
                // session linking existed, recover a likely existing chat rather
                // than silently creating "New Chat" on every project click.
                let sessionId = storedSessionId
                if (!sessionId || !sessions.some((session) => session.id === sessionId)) {
                  const projectName = project.name.trim().toLowerCase()
                  const namedMatch = sessions
                    .filter((session) => !linkedSessionIds.has(session.id))
                    .find((session) => session.title?.toLowerCase().includes(projectName))
                  const activeWithHistory = appState.activeSessionId
                    ? sessions.find((session) => session.id === appState.activeSessionId &&
                        (appState.sessionMessages[session.id]?.length ?? 0) > 0 &&
                        !linkedSessionIds.has(session.id))
                    : undefined
                  const mostRecentWithHistory = [...sessions]
                    .filter((session) => !linkedSessionIds.has(session.id) &&
                      (appState.sessionMessages[session.id]?.length ?? 0) > 0)
                    .sort((a, b) => b.updatedAt - a.updatedAt)[0]
                  sessionId = namedMatch?.id ?? activeWithHistory?.id ?? mostRecentWithHistory?.id
                }

                if (!sessionId) {
                  sessionId = createSession()
                }
                workspaceState.updateProject(project.id, { sessionId })
                setActiveSession(sessionId)
                void useAppStore.getState().loadMessages(sessionId)
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
          </Suspense>
        </main>
      </div>
      {page === 'chat' && !codeMode && !rightOpen && (
        <button onClick={() => setRightOpen(true)} className="fixed right-4 top-14 z-40 h-9 w-9 rounded-lg border border-border bg-surface shadow-sm grid place-items-center text-text-secondary"><ChevronRight size={16}/></button>
      )}
      <div style={{ display: showSettings ? 'contents' : 'none' }} aria-hidden={!showSettings}>
        <Suspense fallback={null}>
          <SettingsModal open={showSettings} initialTab="provider" onClose={() => setShowSettings(false)} />
        </Suspense>
      </div>
    </div>
  )
}

export default App
