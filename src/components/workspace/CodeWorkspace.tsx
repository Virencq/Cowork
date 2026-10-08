import { useEffect, useState } from 'react'
import { FolderOpen, Search, GitBranch, Play, Terminal, PanelRight, X, FileCode2 } from 'lucide-react'
import { open as openDialog } from '@tauri-apps/plugin-dialog'
import { FileTree } from './FileTree'
import { FilePreviewPanel } from '../preview/FilePreviewPanel'
import { useAppStore } from '../../stores/appStore'
import { useFilePreviewStore } from '../../stores/filePreviewStore'
import { ChatView } from '../chat/ChatView'

export function CodeWorkspace({ onExitCode }: { onExitCode: () => void }) {
  const workspaceDir = useAppStore((s) => s.workspaceDir)
  const setWorkspaceDir = useAppStore((s) => s.setWorkspaceDir)
  const preview = useFilePreviewStore((s) => s.preview)
  const closePreview = useFilePreviewStore((s) => s.closePreview)
  const [query, setQuery] = useState('')
  const [rightOpen, setRightOpen] = useState(true)
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
    const selected = await openDialog({ directory: true, multiple: false, title: 'Open code workspace' })
    if (typeof selected === 'string') {
      setWorkspaceDir(selected)
      closePreview()
    }
  }

  const workspaceName = workspaceDir
    ? workspaceDir.split(/[/\\]/).filter(Boolean).pop() || workspaceDir
    : 'No workspace'

  return (
    <div className="h-full min-h-0 flex flex-col bg-[#f7f6f4] text-[#302c28]">
      <header className="h-12 shrink-0 border-b border-[#e3dfda] bg-white flex items-center gap-2 px-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className="h-7 w-7 rounded-md bg-[#f1eee9] grid place-items-center text-[#d97745]"><FileCode2 size={15}/></div>
          <div className="min-w-0">
            <div className="text-[12px] font-semibold truncate">{workspaceName}</div>
            <div className="text-[9px] text-[#9a938c] truncate">{workspaceDir || 'Choose a folder to start coding'}</div>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-1">
          <button onClick={onExitCode} className="h-8 px-2.5 rounded-md hover:bg-[#f1eee9] text-[11px] text-[#665f58]">← Cowork</button>
          <button onClick={openFolder} className="h-8 px-2.5 rounded-md border border-[#e2ddd7] bg-white hover:bg-[#f5f2ef] text-[11px] flex items-center gap-1.5"><FolderOpen size={14}/> Open folder</button>
          <button className="h-8 w-8 rounded-md hover:bg-[#f1eee9] grid place-items-center text-[#777068]" title="Search files"><Search size={15}/></button>
          <button className="h-8 w-8 rounded-md hover:bg-[#f1eee9] grid place-items-center text-[#777068]" title="Run"><Play size={14}/></button>
          <button className="h-8 w-8 rounded-md hover:bg-[#f1eee9] grid place-items-center text-[#777068]" title="Terminal"><Terminal size={15}/></button>
          <button onClick={() => setRightOpen(v => !v)} className={`h-8 w-8 rounded-md grid place-items-center ${rightOpen ? 'bg-[#f1eee9] text-[#302c28]' : 'hover:bg-[#f1eee9] text-[#777068]'}`} title="Toggle JCode panel"><PanelRight size={15}/></button>
        </div>
      </header>

      <div className="min-h-0 flex-1 flex">
        <aside className="w-[235px] shrink-0 border-r border-[#e3dfda] bg-white flex flex-col">
          <div className="h-10 px-3 flex items-center justify-between border-b border-[#eeeae6]">
            <span className="text-[10px] font-bold uppercase tracking-[.12em] text-[#8e877f]">Explorer</span>
            <button onClick={openFolder} className="h-6 w-6 rounded hover:bg-[#f1eee9] grid place-items-center text-[#817a72]"><FolderOpen size={13}/></button>
          </div>
          <div className="px-2 py-2 border-b border-[#eeeae6]">
            <div className="h-7 rounded-md border border-[#e5e0da] bg-[#faf9f7] flex items-center gap-1.5 px-2">
              <Search size={12} className="text-[#a39b93]"/>
              <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Filter files" className="min-w-0 flex-1 bg-transparent outline-none text-[10px] placeholder:text-[#aaa29a]"/>
              {query && <button onClick={() => setQuery('')}><X size={11}/></button>}
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-auto p-2">
            {workspaceDir ? <FileTree rootPath={workspaceDir}/> : (
              <div className="h-full grid place-items-center px-5 text-center">
                <div>
                  <FolderOpen size={25} className="mx-auto mb-2 text-[#c1b9b1]"/>
                  <div className="text-[11px] font-semibold text-[#625b54]">No workspace</div>
                  <p className="mt-1 text-[10px] leading-4 text-[#a09890]">Open a project folder to browse its code.</p>
                  <button onClick={openFolder} className="mt-3 h-7 px-3 rounded-md bg-[#302c28] text-white text-[10px]">Open folder</button>
                </div>
              </div>
            )}
          </div>
          <div className="h-8 shrink-0 border-t border-[#eeeae6] px-3 flex items-center gap-2 text-[9px] text-[#918981]"><GitBranch size={11}/> local workspace</div>
        </aside>

        <section className="min-w-0 flex-1 flex flex-col bg-[#faf9f7]">
          {preview ? (
            <>
              <div className="h-9 shrink-0 border-b border-[#e5e0da] bg-white flex items-center">
                <div className="h-full px-3 border-r border-[#e5e0da] flex items-center gap-2 text-[10px] text-[#514a43]">
                  <FileCode2 size={12} className="text-[#d97745]"/>
                  <span className="max-w-[300px] truncate">{preview.fileName}</span>
                  <button onClick={closePreview} className="ml-1 text-[#aaa29a] hover:text-[#302c28]"><X size={11}/></button>
                </div>
              </div>
              <div className="min-h-0 flex-1"><FilePreviewPanel/></div>
            </>
          ) : (
            <div className="h-full grid place-items-center">
              <div className="text-center max-w-sm px-6">
                <FileCode2 size={34} className="mx-auto mb-3 text-[#c5beb6]"/>
                <h2 className="text-[15px] font-semibold text-[#514a43]">Code workspace</h2>
                <p className="mt-1.5 text-[11px] leading-5 text-[#948c84]">Open a project folder and select a file from Explorer to start working.</p>
              </div>
            </div>
          )}
          <div className="h-7 shrink-0 border-t border-[#e3dfda] bg-white px-3 flex items-center justify-between text-[9px] text-[#8f8780]">
            <div className="flex items-center gap-3"><span>Ready</span><span>UTF-8</span><span>Spaces: 2</span></div>
            <span className="truncate max-w-[50%]">{preview?.filePath || workspaceName}</span>
          </div>
        </section>

        {rightOpen && (
          <aside className="w-[390px] shrink-0 border-l border-[#e3dfda] bg-white flex flex-col min-h-0">
            <div className="h-12 shrink-0 border-b border-[#e5e0da] px-4 flex items-center justify-between">
              <div>
                <div className="text-[12px] font-semibold">JCode</div>
                <div className="text-[9px] text-[#9b938b]">Coding assistant</div>
              </div>
              <button onClick={() => setRightOpen(false)} className="h-7 w-7 rounded hover:bg-[#f1eee9] grid place-items-center"><X size={14}/></button>
            </div>
            <div className="min-h-0 flex-1 overflow-hidden">
              <ChatView embedded />
            </div>
          </aside>
        )}
      </div>
    </div>
  )
}
