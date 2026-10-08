import { useState, useCallback, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore, useAgentStore, useWebSearchStore, usePetStore } from '../../stores'
import { useSkillStore } from '../../stores/skillStore'
import { useMCPStore } from '../../stores/mcpStore'
import { useWorkspaceStore } from '../../stores/workspaceStore'
import { useFilePreviewStore } from '../../stores/filePreviewStore'
import { invoke } from '@tauri-apps/api/core'
import type { ImageAttachment } from './ChatInput'
import { Cpu, Paperclip, FolderTree, MessagesSquare, ShieldCheck, ShieldAlert, ShieldOff, Bot, ChevronUp, Sparkles, ArrowUp, FolderKanban, ChevronDown, Asterisk } from 'lucide-react'
import { MessageList } from './MessageList'
import { ChatInput } from './ChatInput'
import { FilePreviewPanel } from '../preview'
import { SLoopMark } from '../ui'
import * as JCode from '../../utils/jcodeClient'
import {
  getVoiceConversation,
  setVoiceConversation,
  speakVoiceConversationResponse,
} from '../../utils/voiceConversation'
import type { KiloMessage } from '../../types'
import { motion, AnimatePresence } from 'framer-motion'
import { assembleAgentSystemPrompt } from '../../utils/agentPrompt'
import {
  assembleAgentRuntimePrompt,
  formatAgentSkillsBlock,
  resolveAgentSkillNames,
} from '../../utils/agentRuntime'
import { isAgentMcpToolAllowed, remoteMcpToolName } from '../../utils/agentMcpRuntime'

const EMPTY_MESSAGES: never[] = []
const EMPTY_STREAMING = null

export function ChatView() {
  const { t } = useTranslation()
  const {
    activeSessionId,
    sessions,
    workspaceDir,
    leftPanelMode,
    setLeftPanelMode,
    sidebarCollapsed,
    toggleSidebar,
    startStreaming,
    appendStreamingDelta,
    finishStreaming,
    commitStreamingMessage,
    addMessage,
    updateSessionTitle,
  } = useAppStore()
  const [jcodeRuntime, setJcodeRuntime] = useState<{ provider?: string | null; model?: string | null; effort?: string | null } | null>(null)
  useEffect(() => {
    let cancelled = false
    const refresh = () => {
      void JCode.runtimeInfo().then(info => {
        if (!cancelled) setJcodeRuntime(info)
      }).catch(() => undefined)
    }
    refresh()
    const timer = window.setInterval(refresh, 15000)
    return () => { cancelled = true; window.clearInterval(timer) }
  }, [])

  const [error, setError] = useState<string | null>(null)
  const [contextStatus, setContextStatus] = useState<JCode.ContextStatus | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const [dragTargetZone, setDragTargetZone] = useState<'message' | 'input'>('message')
  const [showPermissionPopup, setShowPermissionPopup] = useState(false)
  const [pendingApproval, setPendingApproval] = useState<{ requestId: string; toolName: string; args: any; reason?: string; piSessionId: string } | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const streamUnsubsRef = useRef(new Map<string, () => void>())

  const subscribeStream = useCallback(async (jcodeSessionId: string, sid: string) => {
    streamUnsubsRef.current.get(jcodeSessionId)?.()
    let unsubscribe = () => {}
    unsubscribe = await JCode.subscribeStream(jcodeSessionId, {
      onText: (partPid, delta) => {
        if (useAppStore.getState().streamingMessage[sid]) {
          useAppStore.getState().appendStreamingDelta(sid, partPid, delta)
        }
      },
      onThinking: (delta) => {
        const sm = useAppStore.getState().streamingMessage[sid]
        if (!sm) return
        const parts = [...sm.parts]
        const last = parts[parts.length - 1]
        if (last?.type === 'reasoning') {
          useAppStore.getState().appendStreamingDelta(sid, last.id, delta)
        } else {
          const rid = `thinking_${Date.now()}`
          useAppStore.getState().updateStreamingPart(sid, rid, {
            id: rid, type: 'reasoning', text: delta,
            sessionID: sid, messageID: sm.messageID,
          } as any)
        }
      },
      onToolCall: (id, name, args) => {
        console.log('[S-Loop] Tool call:', name, id)
        usePetStore.getState().onWorking()
        const sm = useAppStore.getState().streamingMessage[sid]
        if (!sm) return
        useAppStore.getState().updateStreamingPart(sid, id, {
          id, type: 'tool', name, args, callID: id,
          tool: name, state: { status: 'running' as const },
          sessionID: sid, messageID: sm.messageID,
        } as any)
      },
      onToolResult: (id, name, result) => {
        const sm = useAppStore.getState().streamingMessage[sid]
        if (!sm) return
        useAppStore.getState().updateStreamingPart(sid, id, {
          id, type: 'tool', name, tool: name, callID: id,
          state: { status: 'completed' as const, output: JSON.stringify((result as any)?.content?.[0]?.text || result) },
          sessionID: sid, messageID: sm.messageID,
        } as any)
      },
      onMcpToolRequest: async (request) => {
        try {
          const result = await invoke('mcp_call_tool', {
            name: request.serverName,
            tool_name: request.toolName,
            arguments: request.arguments,
          })
          await JCode.sendMcpToolResponse(jcodeSessionId, request.requestId, result)
        } catch (err) {
          await JCode.sendMcpToolResponse(jcodeSessionId, request.requestId, null, err instanceof Error ? err.message : String(err))
        }
      },
      onToolApproval: (request) => {
        setPendingApproval({ ...request, piSessionId: jcodeSessionId })
      },
      onStatus: (status) => {
        if (status.type === 'compacting' || status.type === 'compacted') {
          setContextStatus(status)
        }
      },
      onDone: () => {
        unsubscribe()
        streamUnsubsRef.current.delete(jcodeSessionId)
      },
    })
    streamUnsubsRef.current.set(jcodeSessionId, unsubscribe)
  }, [])

  const session = sessions.find((s) => s.id === activeSessionId)
  const sessionMessages = useAppStore((state) => state.sessionMessages)
  const messages = activeSessionId ? sessionMessages[activeSessionId] || EMPTY_MESSAGES : EMPTY_MESSAGES
  const isEmpty = messages.length === 0
  const isReadOnlySession = !!session?.readOnly

  const handleToggleLeftPanel = useCallback(() => {
    const nextMode = leftPanelMode === 'sessions' ? 'files' : 'sessions'
    setLeftPanelMode(nextMode)
    if (sidebarCollapsed) {
      toggleSidebar()
    }
  }, [leftPanelMode, setLeftPanelMode, sidebarCollapsed, toggleSidebar])

  const handleSubmit = useCallback(
    async (content: string, images?: ImageAttachment[]) => {
      let sid = useAppStore.getState().activeSessionId
      if ((!content || !content.trim()) && (!images || images.length === 0)) return
      if (!sid) {
        sid = useAppStore.getState().createSession()
      }
      setError(null)
      setContextStatus(null)

      if (isReadOnlySession) {
        setError(t('chat.session.readOnlyHint'))
        return
      }

      // JCode is the runtime and owns provider/model selection. Cowork never supplies
      // provider credentials, provider IDs, or model IDs to ACP.

      // Add user message
      const uid = Math.random().toString(36).substring(2, 15)
      addMessage(sid, {
        info: { id: uid, sessionID: sid, role: 'user', time: { created: Date.now() } },
        parts: [{ id: `${uid}-0`, type: 'text', text: content, sessionID: sid, messageID: uid }],
      })

      if (session?.title === 'New Chat') {
        updateSessionTitle(sid, content.slice(0, 40) + (content.length > 40 ? '...' : ''))
      }

      // Synchronize configured stdio connectors into JCode's own MCP config.
      // JCode ACP currently reads MCP from ~/.jcode/mcp.json rather than host-supplied mcpServers.
      try {
        await JCode.syncMcpConfig(useMCPStore.getState().servers)
      } catch (error) {
        console.warn('[Cowork] Could not sync MCP config to JCode:', error)
      }

      // Create or reuse JCode session
      let pid = (useAppStore.getState().sessions.find(s => s.id === sid) as any)?.piId ?? null
      if (!pid) {
        try {
          const ks = await JCode.createSession(workspaceDir ?? undefined)
          pid = ks.id
          useAppStore.getState().setSessionPiId(sid, pid)
        } catch {
          setError(t('chat.errors.sessionFailed'))
          usePetStore.getState().onError()
          return
        }
      }

      // Subscribe for streaming visual feedback
      await subscribeStream(pid, sid)

      // Build context
      const agentStore = useAgentStore.getState()
      const activeAgent = agentStore.activeAgentId
        ? agentStore.agents.find((a) => a.id === agentStore.activeAgentId) : null

      const skillStore = useSkillStore.getState()
      const enabledSkills = resolveAgentSkillNames(activeAgent ?? null, skillStore.skills)
        .map(n => skillStore.skills.find(s => s.name === n))
        .filter((s): s is NonNullable<typeof s> => s !== undefined && s.enabled)
      const agentSkillsBlock = formatAgentSkillsBlock(enabledSkills)

      const mcpStore = useMCPStore.getState()
      const mcpServers = mcpStore.servers
      const connectedMCPTools: { serverName: string; toolName: string }[] = []
      for (const [name, status] of Object.entries(mcpStore.serverStatuses)) {
        if (status.status === 'connected' && status.tools) {
          // Skip SSE-type MCP servers — they're handled directly by pi-server via getAllSseMcpTools().
          const server = mcpServers.find(s => s.name === name)
          if (server && (server.type === 'sse' || server.type === 'http')) continue
          for (const tool of status.tools) {
            if (isAgentMcpToolAllowed(activeAgent, name, tool.name)) {
              connectedMCPTools.push({ serverName: name, toolName: tool.name })
            }
          }
        }
      }

      let enrichedContent = content
      const blocks: string[] = []

      // Project instructions are persistent context, not just UI metadata.
      // Inject them into every JCode task launched from the matching workspace.
      const project = useWorkspaceStore.getState().projects.find(
        (p) => p.path && workspaceDir && p.path === workspaceDir,
      )
      if (project?.instructions?.trim()) {
        blocks.push('## Project Instructions\\n' + project.instructions.trim())
      }

      if (connectedMCPTools.length > 0) {
        const listings = connectedMCPTools.map(({ serverName, toolName }) => {
          const st = mcpStore.serverStatuses[serverName]
          const tool = st?.status === 'connected' ? st.tools?.find(t => t.name === toolName) : undefined
          return tool ? `- \`${serverName}/${tool.name}\`: ${tool.description || 'No description'}` : `- \`${serverName}/${toolName}\``
        })
        blocks.push('## Available MCP Tools\nThe following MCP tools are available for use:\n' + listings.join('\n'))
      }

      // SSE/HTTP MCP tools are handled directly by pi-server (injected into getTools()).
      // List them here so the agent sees the correct tool names (prefixed with mcp_sse_).
      const sseMcpTools: { serverName: string; toolName: string }[] = []
      for (const [name, status] of Object.entries(mcpStore.serverStatuses)) {
        if (status.status === 'connected' && status.tools) {
          const server = mcpServers.find(s => s.name === name)
          if (server && (server.type === 'sse' || server.type === 'http')) {
            for (const tool of status.tools) {
              if (isAgentMcpToolAllowed(activeAgent, name, tool.name)) {
                sseMcpTools.push({ serverName: name, toolName: tool.name })
              }
            }
          }
        }
      }
      if (sseMcpTools.length > 0) {
        const listings = sseMcpTools.map(({ serverName, toolName }) => {
          const tool = mcpStore.serverStatuses[serverName]?.tools?.find(t => t.name === toolName)
          const sseName = remoteMcpToolName(serverName, toolName)
          return tool
            ? `- \`${sseName}\` (from ${serverName}/${toolName}): ${tool.description || 'No description'}`
            : `- \`${sseName}\` (from ${serverName}/${toolName})`
        })
        if (connectedMCPTools.length === 0) {
          blocks.push('## Available MCP Tools\nThe following MCP tools are available for use:\n' + listings.join('\n'))
        } else {
          blocks.push('### SSE MCP Tools\nAdditional tools from remote MCP servers:\n' + listings.join('\n'))
        }
      }

      const mcpToolDefs: JCode.McpToolDef[] = connectedMCPTools
        .map(({ serverName, toolName }) => {
          const st = mcpStore.serverStatuses[serverName]
          const tool = st?.status === 'connected' ? st.tools?.find(t => t.name === toolName) : undefined
          return tool ? { serverName, name: tool.name, description: tool.description, inputSchema: tool.inputSchema } : null
        })
        .filter(Boolean) as JCode.McpToolDef[]

      if (blocks.length > 0) {
        const header = activeAgent ? `[Agent: ${activeAgent.name}]` : '[Global Context]'
        enrichedContent = `${header}\n---\n${blocks.join('\n\n')}\n---\n\n${content}`
      }

      // Optional UI hints are forwarded to the JCode adapter when present.
      // An empty model is valid: JCode will use its configured default model.
      startStreaming(sid, 'pending-' + Date.now())

      usePetStore.getState().onThinking()

      const agentSystemPrompt = assembleAgentRuntimePrompt(
        activeAgent
          ? assembleAgentSystemPrompt(activeAgent, {
            userProfile: agentStore.userProfile,
            voice: getVoiceConversation().active,
            workspaceDir: workspaceDir ?? undefined,
          })
          : undefined,
        agentSkillsBlock,
      )

      const result = await JCode.prompt(pid!, enrichedContent, {
        systemPrompt: agentSystemPrompt,
        workspaceDir: workspaceDir ?? undefined,
        workspaceRoots: activeAgent?.workspaceRoots || [],
        webSearchConfig: useWebSearchStore.getState().getActiveConfig(),
        tools: mcpToolDefs,
        allowedSseMcpToolNames: activeAgent
          ? sseMcpTools.map(({ serverName, toolName }) => remoteMcpToolName(serverName, toolName))
          : undefined,
        permissionMode: activeAgent?.permissionMode,
        permissionRules: activeAgent?.permissionRules,
        images,
      })

      if (result.error) {
        setError(result.error)
        finishStreaming(sid)
        usePetStore.getState().onError()
        if (getVoiceConversation().active) {
          setVoiceConversation(false, 'error', result.error)
        }
        return
      }

      const msgID = `pi-msg-${Date.now()}`
      const sm = useAppStore.getState().streamingMessage[sid]
      const accumulatedParts = sm?.parts || []
      const textPart = accumulatedParts.find(p => p.type === 'text')
      if (textPart && 'text' in textPart) {
        (textPart as any).text = result.text
      }
      // If no text part was created during streaming, ensure one exists
      // (happens when model only emits thinking_delta but no text_delta)
      if (!accumulatedParts.find(p => p.type === 'text')) {
        // Use result text first, then fallback to last reasoning text
        const fallbackText = result.text
          || accumulatedParts.filter(p => p.type === 'reasoning').pop()?.text
          || ''
        accumulatedParts.push({
          id: `pi-text-${Date.now()}`,
          type: 'text', text: fallbackText,
          sessionID: sid, messageID: msgID,
        } as any)
      }

      const completedMessage: KiloMessage = {
        info: { id: msgID, sessionID: sid, role: 'assistant', time: { created: Date.now() } },
        parts: accumulatedParts,
      }

      commitStreamingMessage(sid, completedMessage)
      const responseText = accumulatedParts
        .filter((part) => part.type === 'text' && 'text' in part)
        .map((part) => ('text' in part ? part.text : ''))
        .join('\n')
      void speakVoiceConversationResponse(responseText)
      useAppStore.getState().incrementFileTreeVersion()
      usePetStore.getState().onResponded()
    },
    [activeSessionId, session, t, startStreaming, finishStreaming, commitStreamingMessage, addMessage, updateSessionTitle, appendStreamingDelta, subscribeStream, isReadOnlySession],
  )

  const activeJCodeSessionId = activeSessionId
    ? (sessions.find((s) => s.id === activeSessionId) as any)?.piId ?? ''
    : ''

  const abort = useCallback(() => {
    if (activeJCodeSessionId) {
      JCode.abortSession(activeJCodeSessionId)
      streamUnsubsRef.current.get(activeJCodeSessionId)?.()
      streamUnsubsRef.current.delete(activeJCodeSessionId)
    }
    if (activeSessionId) finishStreaming(activeSessionId)
    if (getVoiceConversation().active) setVoiceConversation(false)
    usePetStore.getState().onResponded()
  }, [activeJCodeSessionId, activeSessionId, finishStreaming])

  // ── File/folder drag into message area ──

  async function listFilesRecursive(dirPath: string, maxFiles = 30, depth = 0): Promise<string[]> {
    if (depth > 5 || maxFiles <= 0) return []
    const { invoke } = await import('@tauri-apps/api/core')
    const entries = await invoke<any[]>('list_directory', { path: dirPath })
    const skipDirs = new Set(['node_modules', '.git', 'target', '__pycache__', 'dist', '.next', '.cache'])
    let results: string[] = []
    for (const entry of entries) {
      if (entry.is_dir) {
        if (skipDirs.has(entry.name)) continue
        const sub = await listFilesRecursive(entry.path, maxFiles - results.length, depth + 1)
        results = results.concat(sub)
      } else {
        results.push(entry.path)
        if (results.length >= maxFiles) break
      }
    }
    return results
  }

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
    setIsDragOver(true)
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect()
      const relativeY = e.clientY - rect.top
      const inputZoneStart = rect.height * 0.6
      setDragTargetZone(relativeY > inputZoneStart ? 'input' : 'message')
    }
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return
    setIsDragOver(false)
  }, [])

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)

    // 1) Internal FileTree drag — has full path info
    const fileData = e.dataTransfer.getData('application/x-s-loop-file')
    if (fileData) {
      const { path, name, isDir } = JSON.parse(fileData)

      // Check if it's an image file dropped from FileTree
      const imageExts = /\.(png|jpg|jpeg|gif|webp|bmp)$/i
      if (!isDir && imageExts.test(name)) {
        // Read image via Tauri and send as multimodal content
        try {
          const base64 = await invoke<string>('read_file_base64', { path })
          const mimeType = name.endsWith('.png') ? 'image/png' :
            name.endsWith('.gif') ? 'image/gif' :
            name.endsWith('.webp') ? 'image/webp' :
            name.endsWith('.bmp') ? 'image/bmp' :
            'image/jpeg'
          const text = `[Image: ${name}](${path})`
          if (!useAppStore.getState().activeSessionId) {
            useAppStore.getState().createSession()
          }
          handleSubmit(text, [{ data: base64, mimeType }])
        } catch {
          handleSubmit(`[File: ${name}](${path})`)
        }
        return
      }

      let content = ''
      if (isDir) {
        try {
          const files = await listFilesRecursive(path)
          const summary = files.length > 0
            ? files.map(f => `- ${f}`).join('\n')
            : '(empty folder)'
          content = `[Folder: ${name}](${path})\n\n\`\`\`\n${summary}\n\`\`\``
        } catch {
          content = `[Folder: ${name}](${path})`
        }
      } else {
        content = `[File: ${name}](${path})`
      }

      if (!useAppStore.getState().activeSessionId) {
        useAppStore.getState().createSession()
      }

      handleSubmit(content)
      return
    }

    // 2) OS file drop (from desktop / file manager) — no real path, only file name
    // In Tauri, we could potentially read the file, but for now just reference by name
    const files = Array.from(e.dataTransfer?.files || [])
    if (files.length > 0) {
      // Skip .zip files — they're handled by SkillDropZone
      const nonZipFiles = files.filter(f => !f.name.endsWith('.zip') && f.type !== 'application/zip' && f.type !== 'application/x-zip-compressed')
      if (nonZipFiles.length > 0) {
        const refs = nonZipFiles.map(f => `[File: ${f.name}](os-file://${f.name})`).join('\n')
        if (!useAppStore.getState().activeSessionId) {
          useAppStore.getState().createSession()
        }
        handleSubmit(refs)
      }
    }
  }, [handleSubmit])

  const streamingMessages = useAppStore((state) => state.streamingMessage)
  const streamingMessage = activeSessionId ? streamingMessages[activeSessionId] : EMPTY_STREAMING
  const isStreaming = streamingMessage?.isStreaming ?? false

  const filePreview = useFilePreviewStore((s) => s.preview)

  if (!activeSessionId) {
    const homeSessions = useAppStore.getState().sessions
      .slice()
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 3)

    return (
      <div className="flex-1 h-full overflow-auto bg-white">
        <div className="min-h-full flex flex-col">
          <div className="flex-1 flex flex-col items-center pt-[264px] px-8">
            <div className="mb-11 flex items-center justify-center gap-3">
              <div className="h-10 w-10 grid place-items-center text-[#df7650]"><Asterisk size={39} strokeWidth={1.7}/></div>
              <h1 className="font-serif text-[39px] leading-none tracking-[-0.04em] text-[#171411]">
                You’re here!
              </h1>
            </div>

            <div className="w-full max-w-[674px]">
              <ChatInput
                onSubmit={handleSubmit}
                onAbort={abort}
                isStreaming={false}
                variant="hero"
                placeholder="Type / for skills"
              />
            </div>

            <div className="w-full max-w-[674px] -mt-1">
              <div className="h-9 flex items-center gap-2 px-6 text-[12px] text-[#6e675f]">
                <FolderKanban size={14}/>
                <span>Project or folder</span>
                <ChevronDown size={13}/>
                <span className="ml-auto text-[#a39d96]">ⓘ</span>
              </div>
            </div>

            <div className="w-full max-w-[674px] mt-12">
              <div className="flex items-end justify-between mb-3">
                <span className="text-[12px] text-[#8b847d]">Active</span>
                <button className="text-[12px] text-[#8b847d] hover:text-[#4d4741]">Clear active</button>
              </div>
              {homeSessions.length > 0 ? (
                <div className="px-1">
                  {homeSessions.slice(0, 1).map(session => (
                    <button key={session.id} onClick={() => { useAppStore.getState().setActiveSession(session.id) }}
                      className="w-full text-left flex items-center gap-3 py-1.5 hover:bg-[#faf8f6] rounded-md">
                      <span className="text-[#8c857e]">☷</span>
                      <span className="h-1.5 w-1.5 rounded-full bg-[#3b82f6]"/>
                      <div className="min-w-0">
                        <div className="text-[12px] text-[#39342f] truncate">{session.title || 'Untitled task'}</div>
                        <div className="text-[11px] text-[#99928a]">recently</div>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="flex items-center gap-3 px-1 py-2 text-[#9b948d]">
                  <span className="text-[#8c857e]">☷</span>
                  <span className="text-[12px]">No active tasks</span>
                </div>
              )}

              <div className="mt-12 mb-2 text-[12px] text-[#8b847d]">Scheduled</div>
              <div className="h-24" />
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className="flex-1 flex h-full w-full overflow-hidden relative"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Main chat area */}
      <div className="flex-1 flex flex-col bg-transparent h-full overflow-hidden relative min-w-0">
        <div className="absolute top-4 right-4 z-40">
          <button
            onClick={handleToggleLeftPanel}
            className="inline-flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-[11px] font-semibold text-text-secondary transition-colors duration-150 hover:border-accent/30 hover:text-accent"
          >
            {leftPanelMode === 'files' ? <MessagesSquare size={14} /> : <FolderTree size={14} />}
            {leftPanelMode === 'files' ? t('chat.layout.backToSessions') : t('chat.layout.openFiles')}
          </button>
        </div>
        {isDragOver && dragTargetZone === 'message' && (
          <div className="absolute inset-0 z-50 flex items-center justify-center pointer-events-none rounded-[inherit]">
            <div className="w-full h-full mx-4 my-4 rounded-[28px] border-2 border-dashed border-accent/50 bg-accent/5 backdrop-blur-[2px] flex flex-col items-center justify-center gap-4 animate-fade-in">
              <div className="w-16 h-16 rounded-full bg-accent/10 flex items-center justify-center">
                <Paperclip size={28} className="text-accent" />
              </div>
              <p className="text-lg font-bold text-accent tracking-tight">释放文件/文件夹到此处直接发送</p>
              <p className="text-sm text-text-tertiary font-medium">文件将立即发送给 AI 分析处理</p>
            </div>
          </div>
        )}
        <div className="flex-1 min-h-0 relative bg-transparent">
          <AnimatePresence mode="wait">
            {isEmpty ? (
              <motion.div
                key="empty-task"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="h-full flex flex-col items-center justify-center px-8"
              >
                <div className="w-full max-w-[674px]">
                  <div className="mb-8 text-center">
                    <h2 className="font-serif text-[34px] leading-tight tracking-[-0.035em] text-[#171411]">
                      What can I help you with?
                    </h2>
                    <p className="mt-2 text-[13px] text-[#8f8880]">
                      Start a task and JCode will work through it with you.
                    </p>
                  </div>
                  <ChatInput
                    onSubmit={handleSubmit}
                    onAbort={abort}
                    isStreaming={false}
                    variant="hero"
                    placeholder="What would you like me to do?"
                  />
                  <div className="mt-2 h-9 flex items-center gap-2 px-4 text-[12px] text-[#6e675f]">
                    <FolderKanban size={14}/>
                    <span>Project or folder</span>
                    <ChevronDown size={13}/>
                    <span className="ml-auto text-[#a39d96]">ⓘ</span>
                  </div>
                </div>
              </motion.div>
            ) : (
              <motion.div key={activeSessionId} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.16 }} className="h-full flex flex-col w-full max-w-(--spacing-chat-max) mx-auto relative overflow-hidden">
                {session && (session.sourceLabel || session.readOnly) && (
                  <div className="sticky top-0 z-10 px-4 pt-4">
                    <div className="rounded-lg border border-border bg-surface px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[13px] font-bold tracking-tight text-text">{session.title}</span>
                        {session.sourceLabel && (
                          <span className="inline-flex items-center rounded-full border border-accent/20 bg-accent/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-accent">
                            {session.sourceLabel}
                          </span>
                        )}
                        {session.readOnly && (
                          <span className="inline-flex items-center rounded-full border border-border-light bg-surface-secondary/70 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-text-tertiary">
                            {t('chat.session.readOnly')}
                          </span>
                        )}
                      </div>
                      {session.readOnly && (
                        <p className="mt-2 text-[12px] font-medium text-text-tertiary">
                          {t('chat.session.readOnlyHint')}
                        </p>
                      )}
                    </div>
                  </div>
                )}
                <MessageList sessionId={activeSessionId!} />
                {error && (
                  <div className="absolute top-6 left-4 right-4 z-20 flex items-center gap-4 p-4 rounded-lg bg-surface text-red-500 text-[13px] font-semibold border border-red-500/20 shadow-lg">
                    <span>{error}</span>
                    <button onClick={() => setError(null)} className="ml-auto text-red-500 hover:opacity-70 text-[10px] font-bold uppercase tracking-[0.2em]">{t('chat.errors.dismiss')}</button>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <div className={`bg-linear-to-t from-bg to-transparent pt-1 pb-2 shrink-0 ${isEmpty ? "hidden" : ""}`}>
          <div className="w-full max-w-(--spacing-chat-max) mx-auto relative px-4">
            {contextStatus && (
              <div className="mb-2 flex justify-center" role="status" aria-live="polite">
                <div className="rounded-full border border-accent/20 bg-accent/8 px-3 py-1 text-[10px] font-semibold text-text-secondary">
                  {contextStatus.type === 'compacting'
                    ? '正在整理较早的对话上下文…'
                    : `上下文已整理${contextStatus.tokensBefore && contextStatus.tokensAfter
                      ? ` · ${contextStatus.tokensBefore.toLocaleString()} → ${contextStatus.tokensAfter.toLocaleString()} tokens`
                      : ''}`}
                </div>
              </div>
            )}
            <ChatInput
                  onSubmit={handleSubmit}
                  onAbort={abort}
                  isStreaming={isStreaming}
                  disabled={isReadOnlySession}
                  placeholder={isReadOnlySession ? t('chat.session.readOnlyPlaceholder') : t('chat.input.placeholder')}
                />
            {/* Permission + model info row — unified pill below the input */}
            <div className="mt-2 pb-2 flex justify-center">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-surface-secondary/80 border border-border-light shadow-sm text-[10px] text-text-secondary">
                {/* Permission mode selector */}
                {activeSessionId && (() => {
                  const agentStore = useAgentStore.getState()
                  const agent = agentStore.activeAgentId ? agentStore.agents.find(a => a.id === agentStore.activeAgentId) : null
                  const mode = agent?.permissionMode || 'allow'
                  const modeConfig = {
                    allow: { icon: ShieldCheck, label: 'Allow' },
                    ask: { icon: ShieldAlert, label: 'Ask' },
                    deny: { icon: ShieldOff, label: 'Deny' },
                  }[mode] || { icon: ShieldAlert, label: 'Ask' }
                  const ModeIcon = modeConfig.icon
                  return (
                    <div className="relative flex items-center">
                      <button
                        onClick={() => setShowPermissionPopup(!showPermissionPopup)}
                        className="inline-flex items-center gap-1.5 px-2 py-0.5 -mx-1 rounded-full hover:bg-accent/10 transition-all duration-300 border border-transparent hover:border-accent/20"
                      >
                        <ModeIcon size={12} strokeWidth={2.5} className="text-accent" />
                        <span className="font-bold uppercase tracking-[0.1em]">{modeConfig.label}</span>
                        <ChevronUp size={10} strokeWidth={2.5} className={`transition-transform duration-300 ${showPermissionPopup ? 'rotate-0' : 'rotate-180'} opacity-50`} />
                      </button>
                      {showPermissionPopup && (
                        <>
                          <div className="fixed inset-0 z-40" onClick={() => setShowPermissionPopup(false)} />
                          <div className="absolute bottom-full left-0 mb-2 z-50 w-52 rounded-[24px] border border-border-light/70 bg-white/92 dark:bg-[#171717]/95 backdrop-blur-2xl shadow-[0_16px_48px_rgba(0,0,0,0.12)] overflow-hidden animate-fade-in max-h-48 overflow-y-auto">
                            {([
                              { mode: 'allow' as const, icon: ShieldCheck, label: 'Allow', desc: 'All tools run without asking' },
                              { mode: 'ask' as const, icon: ShieldAlert, label: 'Ask', desc: 'Dangerous tools require approval' },
                              { mode: 'deny' as const, icon: ShieldOff, label: 'Deny', desc: 'All tools are blocked' },
                            ]).map((item) => {
                              const isActive = mode === item.mode
                              const ItemIcon = item.icon
                              return (
                                <button
                                  key={item.mode}
                                  onClick={() => {
                                    if (agent) {
                                      agentStore.updateAgent(agent.id, { permissionMode: item.mode })
                                    }
                                    setShowPermissionPopup(false)
                                  }}
                                  className={`w-full flex items-center gap-3 px-5 py-3 text-left transition-all duration-200 hover:bg-surface-secondary/70 ${
                                    isActive ? 'bg-accent-subtle border-l-2 border-accent' : 'border-l-2 border-transparent'
                                  }`}
                                >
                                  <ItemIcon size={16} strokeWidth={2.2} className={isActive ? 'text-accent' : 'text-text-tertiary'} />
                                  <div className="flex-1 min-w-0">
                                    <div className={`text-[12px] font-bold tracking-tight ${isActive ? 'text-accent' : 'text-text'}`}>{item.label}</div>
                                    <div className="text-[10px] text-text-tertiary leading-tight mt-0.5">{item.desc}</div>
                                  </div>
                                  {isActive && <div className="w-2 h-2 rounded-full bg-accent" />}
                                </button>
                              )
                            })}
                          </div>
                        </>
                      )}
                    </div>
                  )
                })()}
                <span className="opacity-15 w-px h-4 bg-current mx-1" />
                <Cpu size={12} className="text-accent/60" />
                <span className="font-bold">{jcodeRuntime?.model || 'JCode'}</span>
                <span className="text-text-tertiary">{jcodeRuntime?.effort || 'Default'}</span>
                {jcodeRuntime?.provider && (
                  <>
                    <span className="opacity-15 w-px h-4 bg-current mx-1" />
                    <span className="font-bold uppercase tracking-[0.12em]">{jcodeRuntime.provider}</span>
                  </>
                )}
                {(() => {
                  const agent = useAgentStore.getState().activeAgentId ? useAgentStore.getState().agents.find(a => a.id === useAgentStore.getState().activeAgentId) : null
                  return agent ? <><span className="opacity-15 w-px h-4 bg-current mx-1" /><Bot size={12} strokeWidth={2.5} className="text-accent/60" /><span className="font-bold">{agent.name}</span></> : null
                })()}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* File preview panel */}
      <AnimatePresence>
        {filePreview && (
          <motion.div
            key="file-preview"
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 480, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className="h-full overflow-hidden shrink-0"
          >
            <FilePreviewPanel />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tool approval dialog */}
      {pendingApproval && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/40 backdrop-blur-md" onClick={() => { JCode.sendToolApproval(pendingApproval.piSessionId, pendingApproval.requestId, false); setPendingApproval(null) }}>
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="w-full max-w-sm bg-white dark:bg-surface rounded-2xl shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Top accent bar */}
            <div className="h-1.5 bg-gradient-to-r from-amber-400 to-amber-500" />

            <div className="p-6 pb-5">
              <div className="flex items-start gap-4 mb-5">
                <div className="relative shrink-0">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center ring-1 ring-amber-500/20">
                    <ShieldAlert size={18} className="text-amber-500" />
                  </div>
                  <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-amber-500 animate-pulse" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-[15px] font-bold text-text tracking-tight">{t('chat.toolApproval.title')}</h3>
                  <p className="text-[12px] text-text-tertiary mt-0.5">{t('chat.toolApproval.subtitle')}</p>
                </div>
              </div>

              {/* Tool card */}
              <div className="rounded-xl bg-surface-secondary/40 border border-border-light/60 p-4 mb-5">
                <div className="flex items-center gap-2.5 mb-3">
                  <code className="text-[13px] font-bold text-accent font-mono">{pendingApproval.toolName}</code>
                  <span className="text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full bg-red-500/10 text-red-500 border border-red-500/15">{t('chat.toolApproval.dangerous')}</span>
                </div>
                {pendingApproval.reason && (
                  <p className="text-[11px] text-amber-600 dark:text-amber-400 mb-3 leading-relaxed">
                    {pendingApproval.reason}
                  </p>
                )}
                {pendingApproval.args && (
                  <div>
                    <pre className="text-[11px] font-mono text-text-secondary/80 bg-surface border border-border-light/40 rounded-lg p-3 max-h-36 overflow-auto whitespace-pre-wrap leading-relaxed">
                      {JSON.stringify(pendingApproval.args, null, 2)}
                    </pre>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2.5">
                <button onClick={() => { JCode.sendToolApproval(pendingApproval.piSessionId, pendingApproval.requestId, false); setPendingApproval(null) }}
                  className="flex-1 px-4 py-2.5 rounded-xl border border-border-light text-[12px] font-semibold text-text-tertiary hover:text-text hover:bg-surface-secondary/60 transition-all">
                  {t('chat.toolApproval.cancel')}
                </button>
                <button onClick={() => { JCode.sendToolApproval(pendingApproval.piSessionId, pendingApproval.requestId, false); setPendingApproval(null) }}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-surface text-[12px] font-semibold text-red-500 border border-red-500/20 hover:bg-red-500/5 transition-all">
                  {t('chat.toolApproval.reject')}
                </button>
                <button onClick={() => { JCode.sendToolApproval(pendingApproval.piSessionId, pendingApproval.requestId, true); setPendingApproval(null) }}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-accent text-white text-[12px] font-bold shadow-md shadow-accent/20 hover:shadow-lg transition-all">
                  {t('chat.toolApproval.approve')}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  )
}
