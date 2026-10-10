import { useAppStore } from '../stores/appStore'
import { useWorkspaceStore, type CodeProject } from '../stores/workspaceStore'

/**
 * Make a Code project active and restore its dedicated chat.
 * This is the single entry point used by both the sidebar and Code workspace.
 */
export function activateCodeProject(project: CodeProject): string {
  const app = useAppStore.getState()
  const workspace = useWorkspaceStore.getState()

  workspace.setActiveCodeProject(project.id)
  app.setCodeWorkspaceDir(project.path)

  if (project.sessionId) {
    app.setCodeActiveSessionId(project.sessionId)
    app.markCodeSession(project.sessionId)
    void app.loadMessages(project.sessionId)
    return project.sessionId
  }

  const sessionId = app.createCodeSession()
  workspace.updateCodeProject(project.id, { sessionId })
  return sessionId
}
