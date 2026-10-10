// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest'
import { useMCPStore } from '../src/stores/mcpStore'
import { useWorkspaceStore } from '../src/stores/workspaceStore'
import { buildWorkspacePromptContext } from '../src/utils/workspacePromptContext'

describe('workspace prompt context', () => {
  beforeEach(() => {
    localStorage.clear()
    useWorkspaceStore.setState({
      projects: [],
      codeProjects: [],
      activeCodeProjectId: null,
      artifacts: [],
      pinnedProjectIds: [],
      pinnedArtifactIds: [],
    })
    useMCPStore.setState({ servers: [], serverStatuses: {} })
  })

  it('adds Code project instructions using normalized folder paths and real newlines', () => {
    useWorkspaceStore.getState().addCodeProject({
      name: 'Repository',
      path: 'C:\\Work\\Repo',
      instructions: 'Run tests before finishing.',
    })

    const context = buildWorkspacePromptContext('code', 'c:/work/repo/', null)

    expect(context.blocks).toContain('## Project Instructions\nRun tests before finishing.')
  })

  it('keeps local MCP definitions separate from remote SSE/HTTP tool names', () => {
    useMCPStore.setState({
      servers: [
        { name: 'local-tools', type: 'stdio', command: 'local-tools' },
        { name: 'remote-tools', type: 'sse', url: 'https://example.invalid/mcp' },
      ],
      serverStatuses: {
        'local-tools': {
          name: 'local-tools',
          status: 'connected',
          tools: [{ name: 'read_file', description: 'Read a file', inputSchema: { type: 'object' } }],
          resources: [],
        },
        'remote-tools': {
          name: 'remote-tools',
          status: 'connected',
          tools: [{ name: 'search_docs', description: 'Search documentation', inputSchema: { type: 'object' } }],
          resources: [],
        },
      },
    })

    const context = buildWorkspacePromptContext('cowork', undefined, null)

    expect(context.mcpToolDefs).toEqual([
      expect.objectContaining({ serverName: 'local-tools', name: 'read_file' }),
    ])
    expect(context.sseMcpTools).toEqual([
      { serverName: 'remote-tools', toolName: 'search_docs' },
    ])
    expect(context.blocks.join('\n')).toContain('mcp_sse_remote_tools_search_docs')
    expect(context.blocks.join('\n')).toContain('local-tools/read_file')
  })
})
