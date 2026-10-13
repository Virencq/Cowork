import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { open as openDialog } from '@tauri-apps/plugin-dialog'
import { ChevronRight, FolderKanban, History, Lightbulb, Menu, Plus, Settings, X, Pencil, Columns2, ArrowLeft, ArrowRight } from 'lucide-react'
import { ChatView } from './components/chat'
import { LeftNav, ResizeHandle } from './components/layout/LeftNav'

// Keep the primary chat eager, but load secondary workspaces on demand.
const SettingsModal = lazy(() => import('./components/settings').then((m) => ({ default: m.SettingsModal })))
const TasksPage = lazy(() => import('./components/tasks').then((m) => ({ default: m.TasksPage })))
const ExtensionsPage = lazy(() => import('./components/extensions/ExtensionsPage').then((m) => ({ default: m.ExtensionsPage })))
const WorkspaceLibraryPage = lazy(() => import('./components/workspace/WorkspaceLibraryPage').then((m) => ({ default: m.WorkspaceLibraryPage })))
const ProjectsPage = lazy(() => import('./components/workspace/ProjectsPage').then((m) => ({ default: m.ProjectsPage })))
const ProjectDetailPage = lazy(() => import('./components/workspace/ProjectDetailPage').then((m) => ({ default: m.ProjectDetailPage })))
const ArtifactsPage = lazy(() => import('./components/workspace/ArtifactsPage').then((m) => ({ default: m.ArtifactsPage })))
const CodeWorkspace = lazy(() => import('./components/workspace/CodeWorkspace').then((m) => ({ default: m.CodeWorkspace })))
import { useAppStore } from './stores'
import { useTaskScheduler, useTelegramChatSync } from './hooks'
import { useMCPStore } from './stores/mcpStore'
import { useSkillStore } from './stores/skillStore'
import { useAgentStore } from './stores/agentStore'
import { useWorkspaceStore, type CoworkProject } from './stores/workspaceStore'
import { activateCodeProject } from './utils/codeProjectActions'
import { projectPathsEqual } from './utils/projectPaths'
import { initDatabase } from './utils/database'
import { getAllSessions, createSession as dbCreateSession, saveMessage as dbSaveMessage } from './utils/database'
import { status as jcodeStatus } from './utils/jcodeClient'
import { getActiveTokens } from './themes'
import { recordPerformance, startPerformanceTimer, elapsedPerformanceMs } from './utils/performanceDiagnostics'

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
      </div>
      <WindowControls />
    </header>
  )
}

function RightPanel({ width, onWidth, onClose, onAddScheduled, codeMode }: {
  width: number
  onWidth: (n: number) => void
  onClose: () => void
  onAddScheduled: () => void
  codeMode: boolean
}) {
  const workspaceDir = useAppStore((s) => codeMode ? s.codeWorkspaceDir : s.workspaceDir)
  const projects = useWorkspaceStore((s) => s.projects)
  const codeProjects = useWorkspaceStore((s) => s.codeProjects)
  const activeCodeProjectId = useWorkspaceStore((s) => s.activeCodeProjectId)
  const updateProject = useWorkspaceStore((s) => s.updateProject)
  const updateCodeProject = useWorkspaceStore((s) => s.updateCodeProject)
  const project = codeMode
    ? codeProjects.find((p) => p.id === activeCodeProjectId)
    : projects.find((p) => p.path && workspaceDir && projectPathsEqual(p.path, workspaceDir))
  const [editingInstructions, setEditingInstructions] = useState(false)
  const [draftInstructions, setDraftInstructions] = useState(project?.instructions || '')

  useEffect(() => {
    setDraftInstructions(project?.instructions || '')
    setEditingInstructions(false)
  }, [codeMode, project?.id, project?.instructions])

  const saveInstructions = () => {
    if (project) {
      if (codeMode) updateCodeProject(project.id, { instructions: draftInstructions.trim() })
      else updateProject(project.id, { instructions: draftInstructions.trim() })
    }
    setEditingInstructions(false)
  }

  return (
    <aside data-project-properties-panel style={{ width, backgroundColor: '#1f1f1f', borderColor: '#333333' }} className="fixed right-0 top-11 bottom-0 z-[80] border-l pt-0 overflow-auto text-[#f2f2f2] shadow-2xl">
      <ResizeHandle side="right" onDrag={(d) => onWidth(Math.max(280, Math.min(360, width + d)))} />
      <div className="h-14 px-4 flex items-center justify-between border-b border-[#303030]">
        <div>
          <div className="text-[12px] uppercase tracking-[.08em] font-semibold text-[#9b9b9b]">Project</div>
          <div className="text-[15px] font-semibold text-[#f0f0f0] truncate max-w-[210px]">{project?.name || 'Workspace'}</div>
        </div>
        <button onClick={onClose} className="h-8 w-8 rounded-md hover:bg-[#303030] grid place-items-center text-[#b8b8b8]" title="Close panel"><X size={16}/></button>
      </div>

      <section className="border-b border-[#303030]">
        <div className="px-4 py-3 flex items-center justify-between">
          <div>
            <div className="text-[14px] font-semibold text-[#ededed]">Instructions</div>
            <div className="mt-1 text-[12px] text-[#999999]">Instructions for this project</div>
          </div>
          <button onClick={() => { setDraftInstructions(project?.instructions || ''); setEditingInstructions(true) }} className="h-8 w-8 rounded-md hover:bg-surface-hover grid place-items-center text-text-secondary" title={project?.instructions ? 'Edit instructions' : 'Add instructions'}>
            {project?.instructions ? <Pencil size={15}/> : <Plus size={16}/>}
          </button>
        </div>
        <div className="px-4 pb-4">
          {editingInstructions ? (
            <div>
              <textarea
                autoFocus
                value={draftInstructions}
                onChange={e => setDraftInstructions(e.target.value)}
                placeholder="Tell JCode how to work in this project..."
                className="w-full min-h-[130px] resize-y rounded-lg border border-[#414141] bg-[#242424] p-3 text-[13px] leading-5 text-[#f0f0f0] outline-none focus:border-[#777777]"
              />
              <div className="mt-2 flex justify-end gap-2">
                <button onClick={() => setEditingInstructions(false)} className="rounded-lg px-3 py-1.5 text-[12px] text-[#b8b8b8] hover:bg-[#303030]">Cancel</button>
                <button onClick={saveInstructions} className="rounded-lg bg-[#454545] px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-[#555555]">Save</button>
              </div>
            </div>
          ) : (
            <p className="text-[13px] leading-[1.6] text-[#c7c7c7] whitespace-pre-wrap">
              {project?.instructions || 'Add instructions to guide JCode on goals, style, constraints, and project conventions.'}
            </p>
          )}
        </div>
      </section>

      <section className="border-b border-border">
        <div className="px-4 py-3">
          <div className="text-[13px] font-semibold text-text">Memory</div>
          <div className="mt-1 text-[11px] text-text-tertiary">Project memory</div>
        </div>
        <div className="px-4 pb-4 text-[13px] leading-5 text-[#b0b0b0]">
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
                if (codeMode) useAppStore.getState().setCodeWorkspaceDir(selected)
                else useAppStore.getState().setWorkspaceDir(selected)
              }
            }}
            className="h-7 w-7 rounded-md hover:bg-[#303030] grid place-items-center text-[#b8b8b8]"
            title="Add context folder"
          ><Plus size={15}/></button>
        </div>
        <div className="px-5 pb-5">
          <div className="rounded-lg border border-[#383838] bg-[#242424] px-3 py-2.5 flex items-center gap-2">
            <FolderKanban size={15} className="text-text-tertiary"/>
            <span className="text-[12px] truncate text-[#c7c7c7]">{project?.path || workspaceDir || 'No project folder selected'}</span>
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
  const activeCodeProjectId = useWorkspaceStore((s) => s.activeCodeProjectId)
  const activeSessionMessageCount = useAppStore((s) => activeSessionId ? (s.sessionMessages[activeSessionId]?.length ?? 0) : 0)
  const [page, setPage] = useState<Page>('chat')
  const [selectedProject, setSelectedProject] = useState<CoworkProject | null>(null)
  const [queuedProjectPrompt, setQueuedProjectPrompt] = useState<{ id: string; text: string } | null>(null)
  const handleInitialPromptHandled = useCallback((id: string) => {
    setQueuedProjectPrompt((current) => current?.id === id ? null : current)
  }, [])
  const [showSettings, setShowSettings] = useState(false)
  const [leftWidth, setLeftWidth] = useState(() => Number(localStorage.getItem('cowork-left-width')) || 200)
  const [rightWidth, setRightWidth] = useState(() => Math.min(360, Math.max(280, Number(localStorage.getItem('cowork-right-width')) || 330)))
  const [rightOpen, setRightOpen] = useState(() => localStorage.getItem('cowork-right-open-v2') !== 'false')
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
  useEffect(() => { localStorage.setItem('cowork-right-open-v2', String(rightOpen)) }, [rightOpen])
  useEffect(() => { localStorage.setItem('cowork-sidebar-open', String(sidebarOpen)) }, [sidebarOpen])
  useEffect(() => { localStorage.setItem('cowork-code-mode', String(codeMode)) }, [codeMode])

  useTaskScheduler()
  useTelegramChatSync()

  useEffect(() => {
    const exportPerformanceLog = (event: KeyboardEvent) => {
      if (!(event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'd')) return
      event.preventDefault()
      try {
        const entries = localStorage.getItem('cowork-performance-diagnostics') || '[]'
        const blob = new Blob([JSON.stringify({
          exportedAt: new Date().toISOString(),
          userAgent: navigator.userAgent,
          entries: JSON.parse(entries),
        }, null, 2)], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = 'cowork-performance-diagnostics.json'
        link.click()
        URL.revokeObjectURL(url)
        recordPerformance('diagnostics.exported')
      } catch (error) {
        console.warn('[Cowork performance] Could not export diagnostics:', error)
      }
    }
    window.addEventListener('keydown', exportPerformanceLog)
    return () => window.removeEventListener('keydown', exportPerformanceLog)
  }, [])

  useEffect(() => {
    const openSettings = () => setShowSettings(true)
    window.addEventListener('cowork:open-settings', openSettings)
    return () => window.removeEventListener('cowork:open-settings', openSettings)
  }, [])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    const tokens = getActiveTokens(colorScheme || 'terracotta', theme)
    for (const [key, value] of Object.entries(tokens)) document.documentElement.style.setProperty(key, value)
  }, [theme, colorScheme])

  useEffect(() => {
    const startupStartedAt = startPerformanceTimer()
    recordPerformance('startup.effect.begin', { inTauri })
    const firstFrame = window.requestAnimationFrame(() => {
      recordPerformance('startup.first-animation-frame', { sinceEffectMs: elapsedPerformanceMs(startupStartedAt) })
    })
    if (!inTauri) return () => window.cancelAnimationFrame(firstFrame)

    // Let the first interactive frame settle before starting optional native
    // discovery. MCP, skills and JCode status are useful background work, but
    // must not compete with the first chat paint and SQLite hydration.
    let backgroundStartup: number | undefined
    const scheduleBackgroundDiscovery = () => {
      // Start optional native discovery only after SQLite/session hydration has
      // finished; a fixed delay from app mount can overlap a slow cold startup.
      backgroundStartup = window.setTimeout(() => {
        const backgroundStartedAt = startPerformanceTimer()
        recordPerformance('startup.background-discovery.begin')
        void Promise.allSettled([
          jcodeStatus().then(() => recordPerformance('startup.jcode-status.complete', { durationMs: elapsedPerformanceMs(backgroundStartedAt) })),
          useMCPStore.getState().refreshAllServers().then(() => recordPerformance('startup.mcp-refresh.complete', { durationMs: elapsedPerformanceMs(backgroundStartedAt) })),
          useSkillStore.getState().refreshSkills().then(() => recordPerformance('startup.skills-refresh.complete', { durationMs: elapsedPerformanceMs(backgroundStartedAt) })),
        ]).then(() => recordPerformance('startup.background-discovery.complete', { durationMs: elapsedPerformanceMs(backgroundStartedAt) }))
      }, 1800)
    }

    const dbStartedAt = startPerformanceTimer()
    recordPerformance('startup.database-init.begin')
    initDatabase().then(async () => {
      recordPerformance('startup.database-init.complete', { durationMs: elapsedPerformanceMs(dbStartedAt) })
      const sessionsStartedAt = startPerformanceTimer()
      // SQLite is authoritative once it contains sessions. Avoid parsing the
      // potentially large legacy Zustand payload on every normal app launch.
      const existingSessions = await getAllSessions()
      recordPerformance('startup.sessions-query.complete', { durationMs: elapsedPerformanceMs(sessionsStartedAt), sessionCount: existingSessions.length })
      if (existingSessions.length === 0) {
        const storedState = localStorage.getItem(APP_STORAGE_KEY)
        if (storedState) {
          try {
            const parsed = JSON.parse(storedState)
            const { sessions, sessionMessages } = parsed?.state || {}
            if (sessions?.length > 0) {
              let migratedRecords = 0
              const yieldToUi = async () => {
                migratedRecords += 1
                if (migratedRecords % 20 === 0) {
                  await new Promise<void>((resolve) => window.setTimeout(resolve, 0))
                }
              }

              for (const s of sessions) {
                await dbCreateSession(s.id, s.title || '', s.model || '', s.piId || undefined)
                await yieldToUi()
              }
              if (sessionMessages) {
                for (const [sessionId, msgs] of Object.entries(sessionMessages)) {
                  if (!Array.isArray(msgs)) continue
                  for (const msg of msgs as any[]) {
                    await dbSaveMessage(msg.info?.id || msg.id, sessionId, msg.info?.role || 'assistant', msg.parts || [], msg.info || {})
                    await yieldToUi()
                  }
                }
              }
            }
          } catch (error) {
            console.warn('[startup] Legacy session migration failed:', error)
          }
        }
      }
      const hydrationStartedAt = startPerformanceTimer()
      await useAppStore.getState().loadFromDb()
      recordPerformance('startup.store-hydration.complete', { durationMs: elapsedPerformanceMs(hydrationStartedAt) })
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
      if (state.activeSessionId) {
        const activeMessagesStartedAt = startPerformanceTimer()
        await state.loadMessages(state.activeSessionId)
        recordPerformance('startup.active-cowork-history.complete', { durationMs: elapsedPerformanceMs(activeMessagesStartedAt), messageCount: useAppStore.getState().sessionMessages[state.activeSessionId]?.length ?? 0 })
      }
      // Code sessions are independent of Cowork selection and must hydrate after
      // SQLite is initialized, even if CodeWorkspace mounted before startup finished.
      if (state.codeActiveSessionId) {
        const codeMessagesStartedAt = startPerformanceTimer()
        await state.loadMessages(state.codeActiveSessionId)
        recordPerformance('startup.active-code-history.complete', { durationMs: elapsedPerformanceMs(codeMessagesStartedAt), messageCount: useAppStore.getState().sessionMessages[state.codeActiveSessionId]?.length ?? 0 })
      }
      recordPerformance('startup.hydration.complete', { durationMs: elapsedPerformanceMs(startupStartedAt) })
      scheduleBackgroundDiscovery()
    }).catch((error) => {
      recordPerformance('startup.hydration.failed', { error: String(error) })
      console.warn(error)
      scheduleBackgroundDiscovery()
    })

    return () => { if (backgroundStartup !== undefined) window.clearTimeout(backgroundStartup); window.cancelAnimationFrame(firstFrame) }
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
    <div
      className="h-screen w-screen overflow-hidden bg-bg text-text"
      onClick={(event) => {
        // Dismiss project properties from any click outside the panel,
        // including the chat, sidebar, and title bar. Keep panel controls usable.
        if (rightOpen && !(event.target as HTMLElement).closest("[data-project-properties-panel]")) {
          setRightOpen(false)
        }
      }}
    >
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
          
          <div className="min-h-0 flex-1 flex">
            <div className={`min-w-0 flex-1 flex flex-col transition-[margin] duration-150 ${page === 'chat' && rightOpen && ((codeMode && !!activeCodeProjectId) || (!codeMode && !!activeSessionId && activeSessionMessageCount > 0)) ? 'mr-[360px]' : ''}`}>
              {/* Mount only the active chat workspace. Keeping both ChatViews hidden in
                  the DOM caused duplicate store subscriptions and duplicate message-tree
                  work on every chat/session update. Session history is persisted in SQLite. */}
              {page === 'chat' && !codeMode && (
                <div className="min-w-0 min-h-0 flex-1 flex flex-col">
                  <ChatView initialPrompt={queuedProjectPrompt} onInitialPromptHandled={handleInitialPromptHandled} />
                </div>
              )}
              {hasVisitedCode && page === 'chat' && codeMode && (
                <div className="min-w-0 flex-1 flex flex-col">
                  <Suspense fallback={<div className="min-h-0 flex-1" />}><CodeWorkspace /></Suspense>
                </div>
              )}

              {page === 'tasks' && <Suspense fallback={<div className="min-h-0 flex-1" />}><TasksPage /></Suspense>}
              {page === 'projects' && <Suspense fallback={<div className="min-h-0 flex-1" />}><ProjectsPage
                onOpenProject={(project) => {
                  const fullProject = useWorkspaceStore.getState().projects.find((item) => item.id === project.id)
                  if (!fullProject) return
                  setSelectedProject(fullProject)
                  if (fullProject.path) setWorkspaceDir(fullProject.path)
                  navigateToPage('project-detail')
                }}
                onNewChat={(project) => {
                  const fullProject = useWorkspaceStore.getState().projects.find((item) => item.id === project.id)
                  const sessionId = createSession()
                  if (fullProject) useWorkspaceStore.getState().updateProject(project.id, { sessionId, sessionIds: [...new Set([...(fullProject.sessionIds || []), ...(fullProject.sessionId ? [fullProject.sessionId] : []), sessionId])] })
                  if (project.path) setWorkspaceDir(project.path)
                  setActiveSession(sessionId)
                  setQueuedProjectPrompt(null)
                  navigateToPage('chat')
                }}
              /></Suspense>}
              {page === 'project-detail' && selectedProject && <Suspense fallback={<div className="min-h-0 flex-1" />}><ProjectDetailPage
                project={selectedProject}
                onBack={() => navigateToPage('projects')}
                onStartChat={(prompt) => {
                  const sessionId = createSession()
                  useWorkspaceStore.getState().updateProject(selectedProject.id, { sessionId, sessionIds: [...new Set([...(selectedProject.sessionIds || []), ...(selectedProject.sessionId ? [selectedProject.sessionId] : []), sessionId])] })
                  if (selectedProject.path) setWorkspaceDir(selectedProject.path)
                  setActiveSession(sessionId)
                  setQueuedProjectPrompt({ id: `${Date.now()}-${sessionId}`, text: prompt })
                  navigateToPage('chat')
                }}
                onOpenSession={(sessionId) => {
                  if (selectedProject.path) setWorkspaceDir(selectedProject.path)
                  setActiveSession(sessionId)
                  void useAppStore.getState().loadMessages(sessionId)
                  navigateToPage('chat')
                }}
                onOpenScheduled={() => navigateToPage('tasks')}
              /></Suspense>}
              {page === 'ideas' && <div className="flex-1 grid place-items-center"><div className="text-center max-w-md"><Lightbulb className="mx-auto mb-4 text-[#b0a79e]" size={30}/><h2 className="text-xl font-semibold">Ideas</h2><p className="mt-2 text-sm text-[#8c847c]">Capture ideas here and turn them into tasks when ready.</p></div></div>}
              {page === 'extensions' && <Suspense fallback={<div className="min-h-0 flex-1" />}><ExtensionsPage /></Suspense>}
              {page === 'customize' && <Suspense fallback={<div className="min-h-0 flex-1" />}><WorkspaceLibraryPage initialSection="skills" /></Suspense>}
              {page === 'artifacts' && <Suspense fallback={<div className="min-h-0 flex-1" />}><ArtifactsPage onOpenArtifact={(artifactId) => {
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
              }} /></Suspense>}
            </div>
            {page === 'chat' && rightOpen && ((codeMode && !!activeCodeProjectId) || (!codeMode && !!activeSessionId && activeSessionMessageCount > 0)) && <RightPanel width={rightWidth} onWidth={setRightWidth} onClose={() => setRightOpen(false)} onAddScheduled={() => navigateToPage('tasks')} codeMode={codeMode} />}
          </div>
        </main>
      </div>
      {page === 'chat' && !rightOpen && ((codeMode && !!activeCodeProjectId) || (!codeMode && !!activeSessionId && activeSessionMessageCount > 0)) && (
        <button onClick={() => setRightOpen(true)} className="fixed right-4 top-14 z-40 h-9 w-9 rounded-lg border border-border bg-surface shadow-sm grid place-items-center text-text-secondary"><ChevronRight size={16}/></button>
      )}
      {showSettings && (
        <Suspense fallback={null}>
          <SettingsModal open initialTab="provider" onClose={() => setShowSettings(false)} />
        </Suspense>
      )}
    </div>
  )
}

export default App
