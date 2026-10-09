import { useEffect } from 'react'
import { FolderOpen, FileCode2, X } from 'lucide-react'
import { open as openDialog } from '@tauri-apps/plugin-dialog'
import { FilePreviewPanel } from '../preview/FilePreviewPanel'
import { useAppStore } from '../../stores/appStore'
import { useFilePreviewStore } from '../../stores/filePreviewStore'
import { ChatView } from '../chat/ChatView'

export function CodeWorkspace({ onExitCode }: { onExitCode: () => void }) {
  const workspaceDir = useAppStore((s) => s.workspaceDir)
  const setWorkspaceDir = useAppStore((s) => s.setWorkspaceDir)
  const preview = useFilePreviewStore((s) => s.preview)
  const closePreview = useFilePreviewStore((s) => s.closePreview)
  const activeSessionId = useAppStore((s) => s.activeSessionId)
  const createSession = useAppStore((s) => s.createSession)
  const setActiveSession = useAppStore((s) => s.setActiveSession)

  useEffect(() => {
    if (!activeSessionId) {
      const id = createSession()
      setActiveSession(id)
    }
  }, [activeSessionId, createSession, setActiveSession])

  const openFolder = async () => {
    const selected = await openDialog({
      directory: true,
      multiple: false,
      title: 'Open code workspace',
    })

    if (typeof selected === 'string') {
      setWorkspaceDir(selected)
      closePreview()
    }
  }

  const workspaceName = workspaceDir
    ? workspaceDir.split(/[/\\]/).filter(Boolean).pop() || workspaceDir
    : 'No project'

  return (
    <div className="h-full min-h-0 flex flex-col bg-white text-[#302c28]">
      <header className="h-12 shrink-0 border-b border-[#e3dfda] bg-white flex items-center px-4">
        <button
          onClick={onExitCode}
          className="mr-3 h-8 px-2.5 rounded-md hover:bg-[#f4f1ee] text-[11px] text-[#665f58]"
        >
          ← Cowork
        </button>

        <div className="h-6 w-px bg-[#e8e3de] mr-3" />

        <div className="flex items-center gap-2 min-w-0">
          <div className="h-7 w-7 rounded-md bg-[#f3eee9] grid place-items-center text-[#d97745]">
            <FileCode2 size={15} />
          </div>
          <div className="min-w-0">
            <div className="text-[12px] font-semibold truncate">{workspaceName}</div>
            {workspaceDir && (
              <div className="text-[9px] text-[#9a938c] truncate max-w-[420px]">
                {workspaceDir}
              </div>
            )}
          </div>
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          <button
            onClick={openFolder}
            className="h-8 px-2.5 rounded-md border border-[#e2ddd7] bg-white hover:bg-[#f5f2ef] text-[11px] flex items-center gap-1.5"
          >
            <FolderOpen size={14} />
            Open project
          </button>
        </div>
      </header>

      <main className="min-h-0 flex-1 flex bg-white">
        <section className="min-w-0 flex-1 flex flex-col">
          <div className="min-h-0 flex-1 overflow-hidden">
            <ChatView embedded />
          </div>
        </section>

        {preview && (
          <aside className="w-[460px] shrink-0 border-l border-[#e3dfda] bg-[#faf9f7] flex flex-col min-h-0">
            <div className="h-9 shrink-0 border-b border-[#e5e0da] bg-white px-3 flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <FileCode2 size={12} className="text-[#d97745]" />
                <span className="text-[10px] font-semibold truncate">{preview.fileName}</span>
              </div>
              <button
                onClick={closePreview}
                className="h-6 w-6 rounded hover:bg-[#f1eee9] grid place-items-center text-[#817a72]"
                title="Close file"
              >
                <X size={12} />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-hidden">
              <FilePreviewPanel />
            </div>
          </aside>
        )}
      </main>
    </div>
  )
}
