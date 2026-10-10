import type { Agent } from '../types/agent'
import type { McpToolDef } from './jcodeClient'
import { useMCPStore } from '../stores/mcpStore'
import { useWorkspaceStore } from '../stores/workspaceStore'
import { isAgentMcpToolAllowed, remoteMcpToolName } from './agentMcpRuntime'
import { projectPathsEqual } from './projectPaths'

export interface WorkspacePromptContext {
  blocks: string[]
  mcpToolDefs: McpToolDef[]
  sseMcpTools: Array<{ serverName: string; toolName: string }>
}

/**
 * Build workspace-specific prompt context and the corresponding connected MCP
 * tool definitions from the same store snapshot. This keeps chat rendering
 * separate from agent-context assembly and prevents path casing from hiding
 * project instructions.
 */
export function buildWorkspacePromptContext(
  workspaceMode: 'cowork' | 'code',
  workspaceDir: string | null | undefined,
  activeAgent: Agent | null,
): WorkspacePromptContext {
  const blocks: string[] = []
  const workspace = useWorkspaceStore.getState()
  const projects = workspaceMode === 'code' ? workspace.codeProjects : workspace.projects
  const project = projects.find((item) =>
    item.path && workspaceDir && projectPathsEqual(item.path, workspaceDir),
  )

  if (project?.instructions?.trim()) {
    blocks.push('## Project Instructions\n' + project.instructions.trim())
  }

  const mcpStore = useMCPStore.getState()
  const connectedMCPTools: Array<{ serverName: string; toolName: string }> = []
  const sseMcpTools: Array<{ serverName: string; toolName: string }> = []
  const tick = String.fromCharCode(96)

  for (const [serverName, status] of Object.entries(mcpStore.serverStatuses)) {
    if (status.status !== 'connected' || !status.tools) continue

    const server = mcpStore.servers.find((item) => item.name === serverName)
    const isRemote = server?.type === 'sse' || server?.type === 'http'

    for (const tool of status.tools) {
      if (!isAgentMcpToolAllowed(activeAgent, serverName, tool.name)) continue
      const target = isRemote ? sseMcpTools : connectedMCPTools
      target.push({ serverName, toolName: tool.name })
    }
  }

  if (connectedMCPTools.length > 0) {
    const listings = connectedMCPTools.map(({ serverName, toolName }) => {
      const status = mcpStore.serverStatuses[serverName]
      const tool = status?.status === 'connected'
        ? status.tools?.find((item) => item.name === toolName)
        : undefined
      return tool
        ? '- ' + tick + serverName + '/' + tool.name + tick + ': ' + (tool.description || 'No description')
        : '- ' + tick + serverName + '/' + toolName + tick
    })
    blocks.push('## Available MCP Tools\nThe following MCP tools are available for use:\n' + listings.join('\n'))
  }

  if (sseMcpTools.length > 0) {
    const listings = sseMcpTools.map(({ serverName, toolName }) => {
      const tool = mcpStore.serverStatuses[serverName]?.tools?.find((item) => item.name === toolName)
      const remoteName = remoteMcpToolName(serverName, toolName)
      return tool
        ? '- ' + tick + remoteName + tick + ' (from ' + serverName + '/' + toolName + '): ' + (tool.description || 'No description')
        : '- ' + tick + remoteName + tick + ' (from ' + serverName + '/' + toolName + ')'
    })
    if (connectedMCPTools.length === 0) {
      blocks.push('## Available MCP Tools\nThe following MCP tools are available for use:\n' + listings.join('\n'))
    } else {
      blocks.push('### SSE MCP Tools\nAdditional tools from remote MCP servers:\n' + listings.join('\n'))
    }
  }

  const mcpToolDefs = connectedMCPTools
    .map(({ serverName, toolName }) => {
      const status = mcpStore.serverStatuses[serverName]
      const tool = status?.status === 'connected'
        ? status.tools?.find((item) => item.name === toolName)
        : undefined
      return tool
        ? { serverName, name: tool.name, description: tool.description, inputSchema: tool.inputSchema }
        : null
    })
    .filter((tool): tool is McpToolDef => tool !== null)

  return { blocks, mcpToolDefs, sseMcpTools }
}
